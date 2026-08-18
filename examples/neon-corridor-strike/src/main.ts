import {
  createAuraApp,
  game,
  groundedRenderedAssetPlacement,
  type AuraBodyHandle
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import { ENEMIES, ENEMY_VISUAL_Y, damageEnemy, registerHitReaction, resetEnemies, updateEnemies } from "./game/enemies";
import { createHud, renderHud } from "./game/hud";
import { createCorridorAudio } from "./game/audio";
import { bindFireKeys } from "./game/fire-bus";
import { bindPointerLock, createFpsInput } from "./game/input";
import { buildScene, createLevelBodies, layers, PICKUPS } from "./game/level";
import { lookTargetPoint, playerEye, resetPlayer, updateLook, updatePlayer } from "./game/player";
import { MAG_SIZE, MAX_HP, START_RESERVE, WALK_Y, createInitialState, lookDirection, rightDirection, type FpsRunState } from "./game/state";
import { createShotClock, hideShotFx, showShot, updateShotFx } from "./game/shot-fx";
import { createWeaponClock, fireHitscan, updateWeapon, type ShotTrace } from "./game/weapons";

declare global {
  interface Window {
    __AURA3D_ROUTE_READY__?: { readonly ready: boolean; readonly diagnostics?: unknown };
    __AURA3D_FPS_SHOOT__?: () => void;
  }
}

interface FpsEvidence {
  readonly status: string;
  readonly claimLabel: "prototype";
  readonly hp: number;
  readonly ammo: number;
  readonly reserve: number;
  readonly score: number;
  readonly kills: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly pickups: number;
  readonly resets: number;
  readonly paused: boolean;
  readonly pointerLockRequested: number;
  readonly pointerLockActive: boolean;
  readonly yaw: number;
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
  readonly sprinting: boolean;
  readonly objective: string;
  readonly killed: readonly string[];
  readonly collected: readonly string[];
  readonly exitReached: boolean;
  readonly lastHitName: string;
  readonly shotFxVisible: boolean;
  readonly shotFxNodeCount: number;
  readonly reloading: boolean;
  readonly hitMarkerActive: boolean;
  readonly audioUnlocked: boolean;
  readonly audioCuesPlayed: number;
  readonly dryFireActive: boolean;
  readonly shotBolt0: readonly number[];
  readonly shotBolt1: readonly number[];
  readonly enemyVisualY: number;
  readonly bulletOnBulletContacts: number;
  readonly usedKit: false;
  readonly typedAssets: readonly string[];
  readonly primitiveCount: number;
  readonly rendererMode: string;
  readonly rendererFallback: string;
  readonly knownLimits: readonly string[];
  readonly frame: number;
}

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const input = createFpsInput();
const reducedMotionSource = game.accessibility.reducedMotion({ enabled: reducedMotion });
const pauseControls = game.accessibility.pauseControls({ actions: ["pause", "KeyP"] });
const effects = game.effects({ poolSize: 48, reducedMotion });
const director = game.cameraDirector({ reducedMotion, mode: "follow" });
const hud = createHud();
const weaponClock = createWeaponClock();
const shotClock = createShotClock();
const state = createInitialState();
const audio = createCorridorAudio(state);
let lastWarnAmmo = MAG_SIZE;
let lastStatus: string = "playing";
const rifleScale = groundedRenderedAssetPlacement(assets.pulseRifle, { targetMaxDimension: 0.85, floorY: 0 }).scale;

const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  physics: { layers, gravity: [0, -24, 0] },
  scene: buildScene()
});

createLevelBodies(app.physics);
const physics = app.physics;
const playerBody = physics.bodies.require("player") as AuraBodyHandle;
const lookNode = app.nodes.require("look-target");
const rifleNode = app.nodes.require("pulse-rifle");
hideShotFx(app.nodes);
bindPointerLock(app.canvas, state);
resetEnemies(physics);
for (const enemy of ENEMIES) {
  app.nodes.get(`enemy-${enemy.id}`)?.setPosition(enemy.x, ENEMY_VISUAL_Y, enemy.z);
}

physics.onTriggerEnter((event) => {
  const names = [event.nodeA, event.nodeB];
  const pickup = names.find((name) => name?.startsWith("pickup-"));
  if (pickup && !state.collected.includes(pickup)) {
    state.collected.push(pickup);
    state.pickups += 1;
    if (pickup.includes("ammo")) {
      state.reserve += 8;
      state.objective = "Ammo crate cracked";
    } else {
      state.hp = Math.min(MAX_HP, state.hp + 35);
      state.objective = "Field dressing applied";
    }
    physics.removeBody(pickup);
    app.nodes.get(pickup)?.setVisible(false);
    audio.play("pickup");
  }
  if (names.includes("exit") && state.status === "playing") {
    state.exitReached = true;
    state.status = "won";
    state.score += 250;
    state.objective = "Exit reached. Press R to reset";
  }
});

function resetRun(): void {
  state.hp = MAX_HP;
  state.ammo = MAG_SIZE;
  state.reserve = START_RESERVE;
  state.score = 0;
  state.kills = 0;
  state.shotsFired = 0;
  state.hits = 0;
  state.reloads = 0;
  state.pickups = 0;
  state.paused = false;
  state.yaw = 0;
  state.pitch = 0;
  state.ignoreFireUntil = 0;
  state.lmbHeld = false;
  state.fireHeld = false;
  state.fireQueued = false;
  state.spawnGuard = 6;
  state.status = "playing";
  state.objective = "Clear the corridor or reach the exit";
  state.killed = [];
  state.collected = [];
  state.exitReached = false;
  state.lastHitName = "";
  state.reloadClock = 0;
  state.reloadJustFinished = false;
  state.hitMarker = 0;
  state.damageFlash = 0;
  state.dryFirePulse = 0;
  state.audioCues = [];
  state.resets += 1;
  lastWarnAmmo = MAG_SIZE;
  lastStatus = "playing";
  resetPlayer(playerBody);
  resetEnemies(physics);
  app.nodes.get("shot-light")?.setPosition(0, -8, 0);
  for (const enemy of ENEMIES) {
    const node = app.nodes.get(`enemy-${enemy.id}`);
    node?.setVisible(true);
    node?.setRotation(0, 0, 0);
    node?.setPosition(enemy.x, ENEMY_VISUAL_Y, enemy.z);
  }
  for (const pickup of PICKUPS) {
    const id = `pickup-${pickup.id}`;
    if (!physics.bodies.has(id)) {
      physics.createBody({
        name: id,
        type: "static",
        shape: "sphere",
        radius: 0.45,
        position: [pickup.x, 0.45, pickup.z],
        layer: "pickup",
        sensor: true
      });
    }
    app.nodes.get(id)?.setVisible(true);
  }
  hideShotFx(app.nodes);
  app.resume();
}

function muzzleBarrel(): readonly [number, number, number] {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, 0);
  const right = rightDirection(state.yaw);
  return [
    eye[0] + forward[0] * 0.8 + right[0] * 0.2,
    eye[1] - 0.11,
    eye[2] + forward[2] * 0.8 + right[2] * 0.2
  ];
}

function presentShot(shot: ShotTrace): void {
  const barrel = muzzleBarrel();
  const dir = lookDirection(shot.yaw, 0);
  const reach = Math.max(2.4, Math.hypot(shot.end[0] - barrel[0], shot.end[2] - barrel[2]));
  const end: readonly [number, number, number] = [
    barrel[0] + dir[0] * reach,
    barrel[1],
    barrel[2] + dir[2] * reach
  ];
  try {
    showShot(app.nodes, shot.origin, dir, barrel, end, shot.yaw, shotClock);
    effects.impactFlash(barrel, { color: "#ff7a18", intensity: 1.35, duration: 0.08, radius: 0.1, ownerId: "muzzle" });
    // Enemy hits already spark via effects.hitSpark; wall hits get an end flash.
    if (!state.lastHitName.startsWith("enemy-")) {
      effects.impactFlash(end, { color: "#7ef8ff", intensity: 1.05, duration: 0.12, radius: 0.14, ownerId: "shot-end" });
    }
    app.nodes.get("shot-light")?.setPosition(barrel[0], barrel[1], barrel[2]);
  } catch {
    shotClock.visible = 0;
  }
}

function applyHit(enemyId: string, point: readonly [number, number, number]): void {
  const killed = damageEnemy(enemyId, 34, state);
  registerHitReaction(enemyId, killed);
  if (killed) {
    // Capsule goes immediately (shots pass through the corpse); the visual node
    // crumples with weight in enemies.ts before hiding.
    physics.removeBody(enemyId);
    audio.play("kill");
    state.objective = `${state.kills}/${ENEMIES.length} down`;
  } else {
    audio.play("hit");
    void point;
  }
}

function shootNow(): void {
  if (state.status !== "playing") resetRun();
  if (state.paused) return;
  if (weaponClock.cooldown > 0 || state.reloadClock > 0) return;
  if (state.ammo <= 0) {
    // Empty mag is a deny click, not silence.
    state.dryFirePulse = 0.22;
    audio.play("dry-fire");
    weaponClock.cooldown = 0.16;
    renderHud(hud, state);
    publishEvidence();
    return;
  }
  const shot = fireHitscan(state, physics, playerBody, effects, applyHit);
  if (shot) {
    presentShot(shot);
    audio.play("fire");
  }
  weaponClock.cooldown = 0.16;
  weaponClock.recoil = 1;
  renderHud(hud, state);
  publishEvidence();
}

bindFireKeys(shootNow);
window.__AURA3D_FPS_SHOOT__ = shootNow;

function syncWeaponViewmodel(): void {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, 0);
  const right = rightDirection(state.yaw);
  const recoil = weaponClock.recoil;
  rifleNode
    .setPosition(
      eye[0] + forward[0] * (0.46 - 0.05 * recoil) + right[0] * 0.22,
      eye[1] - 0.2 - 0.02 * recoil,
      eye[2] + forward[2] * (0.46 - 0.05 * recoil) + right[2] * 0.22
    )
    .setRotation(0, state.yaw, 0)
    .setScale(rifleScale);
}

function publishEvidence(): void {
  const at = playerBody.position();
  const diagnostics = app.diagnostics() as { readonly renderer?: { readonly mode?: string; readonly fallback?: string }; readonly backend?: string };
  window.__AURA3D_FPS_EVIDENCE__ = {
    status: state.status,
    claimLabel: "prototype",
    hp: state.hp,
    ammo: state.ammo,
    reserve: state.reserve,
    score: state.score,
    kills: state.kills,
    shotsFired: state.shotsFired,
    hits: state.hits,
    pickups: state.pickups,
    resets: state.resets,
    paused: state.paused,
    pointerLockRequested: state.pointerLockRequested,
    pointerLockActive: state.pointerLockActive,
    yaw: state.yaw,
    pitch: state.pitch,
    x: at[0],
    y: at[1],
    z: at[2],
    grounded: state.grounded,
    sprinting: state.sprinting,
    objective: state.objective,
    killed: [...state.killed],
    collected: [...state.collected],
    exitReached: state.exitReached,
    lastHitName: state.lastHitName,
    shotFxVisible: shotClock.visible > 0,
    reloading: state.reloadClock > 0,
    hitMarkerActive: state.hitMarker > 0,
    audioUnlocked: audio.unlocked(),
    audioCuesPlayed: audio.cuesPlayed().length,
    dryFireActive: state.dryFirePulse > 0,
    shotBolt0: [...(app.nodes.get("muzzle-0")?.position ?? [0, 0, 0])],
    shotBolt1: [...(app.nodes.get("muzzle-1")?.position ?? [0, 0, 0])],
    enemyVisualY: app.nodes.get("enemy-e1")?.position[1] ?? -1,
    shotFxNodeCount: ["shot-impact", ...Array.from({ length: 3 }, (_, i) => `muzzle-${i}`)].filter((id) => app.nodes.has(id)).length,
    bulletOnBulletContacts: 0,
    usedKit: false,
    typedAssets: Object.keys(assets),
    primitiveCount: 26,
    rendererMode: diagnostics.renderer?.mode ?? diagnostics.backend ?? "unknown",
    rendererFallback: diagnostics.renderer?.fallback ?? "none",
    knownLimits: [
      "prototype label until route-health, screenshots, and playable gates are retained",
      "follow-camera pitch is approximated; hitscan uses full yaw/pitch",
      "no nav mesh; hostiles rush by proximity after the corridor alarm",
      "hostiles are solid to hitscan but not to the player capsule; touch damage is proximity-authored",
      "medkit catalog match is a medical gurney prop, not a packed first-aid box",
      "audio cues are in-repo CC0 synthesis registered through the asset CLI, not a music score"
    ],
    frame: app.runtime.frame
  };
}

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  state.spawnGuard = Math.max(0, state.spawnGuard - step);
  input.update(step);
  if (input.pressed("pause") && state.status === "playing") {
    state.paused = !state.paused;
  }
  if (input.pressed("reset") || (input.pressed("reload") && state.status !== "playing")) {
    resetRun();
  }
  if (state.paused) {
    renderHud(hud, state);
    publishEvidence();
    return;
  }

  updateLook(state, input, reducedMotion);
  updatePlayer(state, input, physics, playerBody, step);
  updateWeapon(state, input, physics, playerBody, effects, weaponClock, step, applyHit, presentShot, {
    onReloadStart: () => audio.play("reload-start"),
    onReloadComplete: () => audio.play("reload-done"),
    onDryFire: () => audio.play("dry-fire")
  });

  physics.step(step);
  const stepped = playerBody.position();
  playerBody.teleport([stepped[0], WALK_Y, stepped[2]]);
  updateEnemies(state, physics, playerBody.position(), app.nodes, step, {
    onPlayerDamaged: () => audio.play("hurt"),
    onAlarm: () => audio.play("alarm")
  });

  const look = lookTargetPoint(playerBody, state);
  lookNode.setPosition(look[0], look[1], look[2]).setRotation(0, state.yaw, 0);
  syncWeaponViewmodel();
  if (shotClock.visible > 0 && shotClock.pose) {
    shotClock.pose = { barrel: muzzleBarrel(), end: shotClock.pose.end, yaw: state.yaw };
  }
  const at = playerBody.position();
  director.update(step, [{ id: "player", position: [at[0], WALK_Y, at[2]] }]);
  effects.update(step);
  updateShotFx(app.nodes, shotClock, step);
  if (shotClock.visible <= 0) {
    app.nodes.get("shot-light")?.setPosition(0, -8, 0);
  }

  state.hitMarker = Math.max(0, state.hitMarker - step);
  state.damageFlash = Math.max(0, state.damageFlash - step);
  state.dryFirePulse = Math.max(0, state.dryFirePulse - step);
  state.reloadJustFinished = false;

  if (state.status === "playing" && state.killed.length === ENEMIES.length) {
    state.status = "won";
    state.score += 400;
    state.objective = "Corridor cleared. Press R to reset";
  }
  if (state.status !== lastStatus) {
    if (state.status === "won") audio.play("win");
    if (state.status === "lost") audio.play("lose");
    lastStatus = state.status;
  }
  if (state.status === "playing" && state.ammo > 0 && state.ammo <= 3 && lastWarnAmmo > 3) {
    audio.play("warn");
  }
  lastWarnAmmo = state.ammo;

  renderHud(hud, state);
  publishEvidence();
  game.evidence(app, {
    input,
    effects,
    camera: director,
    accessibility: [reducedMotionSource, pauseControls],
    assets: { typedAssets: Object.keys(assets).length }
  });
});

publishEvidence();
renderHud(hud, state);

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = String((diagnostics as { runtimeBackend?: string }).runtimeBackend ?? (diagnostics as { backend?: string }).backend ?? "");
  document.body.dataset.aura3dDrawCalls = String((diagnostics as { drawCalls?: number }).drawCalls ?? 0);
  window.__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
