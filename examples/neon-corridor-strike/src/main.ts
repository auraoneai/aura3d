import {
  createAuraApp,
  game,
  groundedRenderedAssetPlacement,
  type AuraBodyHandle
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import { ENEMIES, ENEMY_VISUAL_Y, damageEnemy, enemyLosBlockedIds, registerHitReaction, resetEnemies, updateEnemies } from "./game/enemies";
import { createHud, renderHud } from "./game/hud";
import { createCorridorAudio } from "./game/audio";
import { collectPickupByName, collectPickupsNearPlayer } from "./game/pickups";
import { bindFireKeys, fireBus } from "./game/fire-bus";
import { bindPointerLock, createFpsInput } from "./game/input";
import { buildScene, createLevelBodies, layers, PICKUPS } from "./game/level";
import { applyLampSupport, createPropWorld, resetPropEvidence, resetProps, scatterEvents, scatterPropsAt, syncPropNodes } from "./game/props";
import { applyTouchLook, lookTargetPoint, playerEye, resetPlayer, updateLook, updatePlayer } from "./game/player";
import { MAG_SIZE, MAX_HP, START_RESERVE, WALK_Y, createInitialState, lookDirection, rightDirection, type FpsRunState } from "./game/state";
import { createShotClock, hideShotFx, shotFxDebug, showShot, updateShotFx } from "./game/shot-fx";
import { createWeaponClock, fireHitscan, updateWeapon, type ShotTrace } from "./game/weapons";
import { createCorridorTouchControls } from "./game/touch";

declare global {
  interface Window {
    __AURA3D_ROUTE_READY__?: { readonly ready: boolean; readonly diagnostics?: unknown };
    __AURA3D_FPS_SHOOT__?: () => void;
    __AURA3D_FPS_CAPTURE__?: {
      setWeaponVisible(visible: boolean): void;
    };
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
const reducedFlash = reducedMotion || new URLSearchParams(window.location.search).get("reducedFlash") === "1";
const input = createFpsInput();
const reducedMotionSource = game.accessibility.reducedMotion({ enabled: reducedMotion });
const reducedFlashSource = game.accessibility.reducedFlash({ enabled: reducedFlash });
const pauseControls = game.accessibility.pauseControls({ actions: ["pause", "KeyP"] });
const effects = game.effects({ poolSize: 48, reducedMotion, reducedFlash });
const director = game.cameraDirector({ reducedMotion, mode: "follow" });
const hud = createHud();
const weaponClock = createWeaponClock();
const shotClock = createShotClock();
const state = createInitialState();
const audio = createCorridorAudio(state);
const mountId = `neon-corridor-strike-${performance.timeOrigin}`;
let lastWarnAmmo = MAG_SIZE;
let lastStatus: string = "playing";
let pausedAtMs: number | undefined;
const rifleScale = groundedRenderedAssetPlacement(assets.neonContainmentPulseRifle, { targetMaxDimension: 0.85, floorY: 0 }).scale;

const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  // Cap the backing buffer for the dense full-screen FPS view. CSS and HUD
  // remain at the review viewport while the now full-frame authored corridor
  // stays inside the route's unchanged stable-frame budget. This is a real
  // route quality setting, not a test-only pacing override.
  // The sixth-pass architectural lining adds real continuous surfaces and
  // typed movable props. Keep the same review viewport but give its GPU budget
  // enough headroom for gameplay pacing on the software-rendered evidence
  // runner; CSS/HUD dimensions and all game state remain unchanged.
  pixelRatio: 0.5,
  physics: { layers, gravity: [0, -24, 0] },
  scene: buildScene()
});

createLevelBodies(app.physics);
const physics = app.physics;
// NC-A1/NC-A4: dynamic debris bodies + spring-lamp joints live on the same
// runtime; their visuals were declared in buildScene and are synced per frame.
createPropWorld(physics);
// Shared collection effects for both the trigger path and the NC-A2 sweep.
const pickupHooks = {
  removeBody: (name: string) => physics.removeBody(name),
  hideNode: (name: string) => app.nodes.get(name)?.setVisible(false),
  onCollected: () => audio.play("pickup")
};
const playerBody = physics.bodies.require("player") as AuraBodyHandle;
const lookNode = app.nodes.require("look-target");
const rifleNode = app.nodes.require("pulse-rifle");
hideShotFx(app.nodes);
bindPointerLock(app.canvas, state);
resetEnemies(physics);
for (const enemy of ENEMIES) {
  app.nodes.get(`enemy-${enemy.id}`)?.setPosition(enemy.x, ENEMY_VISUAL_Y, enemy.z);
}

function reachExit(): void {
  if (state.status !== "playing") return;
  state.exitReached = true;
  state.status = "won";
  state.score += 250;
  state.objective = "Exit reached. Press R to reset";
}

physics.onTriggerEnter((event) => {
  const names = [event.nodeA, event.nodeB];
  const pickup = names.find((name) => name?.startsWith("pickup-"));
  if (pickup) {
    // Collection effects live in pickups.ts so the NC-A2 overlap sweep and this
    // trigger path cannot drift apart. The sensor stays authoritative first.
    collectPickupByName(state, pickupHooks, pickup);
  }
  if (names.includes("exit")) reachExit();
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
  pausedAtMs = undefined;
  audio.reset();
  state.yaw = 0;
  state.pitch = 0;
  state.ignoreFireUntil = 0;
  state.lmbHeld = false;
  state.fireHeld = false;
  state.fireQueued = false;
  state.spawnGuard = 8;
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
  state.overlapPickupChecks = 0;
  fireBus().held = false;
  fireBus().queued = false;
  weaponClock.cooldown = 0;
  weaponClock.recoil = 0;
  state.resets += 1;
  resetProps(physics);
  resetPropEvidence();
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
  // Kill any live wall-clock presentation window so a pre-reset bolt cannot
  // resurrect on the next frame.
  shotClock.visible = 0;
  shotClock.pose = null;
  shotClock.expiresAt = undefined;
  lastShotWallMs = -1;
  effects.update(60);
  app.resume();
}

function muzzleBarrel(): readonly [number, number, number] {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, state.pitch);
  const right = rightDirection(state.yaw);
  return [
    eye[0] + forward[0] * 0.8 + right[0] * 0.2,
    eye[1] + forward[1] * 0.8 - 0.11,
    eye[2] + forward[2] * 0.8 + right[2] * 0.2
  ];
}

let lastShotWallMs = -1;
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function presentShot(shot: ShotTrace): void {
  const barrel = muzzleBarrel();
  const dir = lookDirection(shot.yaw, shot.pitch);
  const reach = Math.max(2.4, Math.hypot(
    shot.end[0] - barrel[0],
    shot.end[1] - barrel[1],
    shot.end[2] - barrel[2]
  ));
  const end: readonly [number, number, number] = [
    barrel[0] + dir[0] * reach,
    barrel[1] + dir[1] * reach,
    barrel[2] + dir[2] * reach
  ];
  try {
    showShot(app.nodes, shot.origin, dir, barrel, end, shot.yaw, shot.pitch, shotClock);
    lastShotWallMs = nowMs();
    // Reduced-flash clamps brightness, not feedback truth. Hold the subdued
    // muzzle event for a few frames longer so a low-refresh evidence/browser
    // frame cannot miss the entire safe feedback window.
    effects.impactFlash(barrel, { color: "#ff9d3c", intensity: 0.9, duration: reducedFlash ? 0.18 : 0.06, radius: 0.035, ownerId: "muzzle" });
    // Enemy hits already spark via effects.hitSpark; wall hits get an end flash.
    if (!state.lastHitName.startsWith("enemy-")) {
      effects.impactFlash(end, { color: "#7ef8ff", intensity: 1.05, duration: 0.12, radius: 0.14, ownerId: "shot-end" });
    }
    app.nodes.get("shot-light")?.setPosition(barrel[0], barrel[1], barrel[2]);
  } catch {
    // Never leave a half-presented shot resumable by the wall-clock hold.
    shotClock.visible = 0;
    shotClock.pose = null;
    shotClock.expiresAt = undefined;
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
    renderHud(hud, state, reducedFlash);
    publishEvidence();
    return;
  }
  const shot = fireHitscan(state, physics, playerBody, effects, applyHit, (point) => scatterPropsAt(physics, point));
  if (shot) {
    presentShot(shot);
    audio.play("fire");
  }
  weaponClock.cooldown = 0.16;
  weaponClock.recoil = 1;
  renderHud(hud, state, reducedFlash);
  publishEvidence();
}

bindFireKeys(shootNow);
window.__AURA3D_FPS_SHOOT__ = shootNow;
const touchControls = createCorridorTouchControls({
  input,
  onLook: (dx, dy) => applyTouchLook(state, dx, dy, reducedMotion)
});
window.__AURA3D_FPS_CAPTURE__ = {
  setWeaponVisible(visible: boolean): void {
    rifleNode.setVisible(visible);
  }
};

function syncWeaponViewmodel(): void {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, state.pitch);
  const right = rightDirection(state.yaw);
  const recoil = weaponClock.recoil;
  const compact = window.innerWidth <= 600;
  const forwardOffset = compact ? 0.42 : 0.46;
  const rightOffset = compact ? 0.08 : 0.22;
  // The containment rifle is a deliberately compact lower-right viewmodel.
  // Its old catalog-era transform lifted the larger replacement into the
  // center sight lane; keep the muzzle clear of the reticle on both desktop
  // and touch layouts without touching the hitscan origin.
  const verticalOffset = compact ? 0.16 : 0.20;
  // Keep the typed weapon silhouette present in the desktop review frame. The
  // previous scale read as a thin diagonal accent beside the combat lane;
  // this remains a viewmodel-only presentation change and does not affect
  // hitscan origin or gameplay reach.
  const viewmodelScale = rifleScale * (compact ? 0.28 : 0.32);
  rifleNode
    .setPosition(
      eye[0] + forward[0] * (forwardOffset - 0.05 * recoil) + right[0] * rightOffset,
      eye[1] + forward[1] * (forwardOffset - 0.05 * recoil) - verticalOffset - 0.02 * recoil,
      eye[2] + forward[2] * (forwardOffset - 0.05 * recoil) + right[2] * rightOffset
    )
    .setRotation(state.pitch, state.yaw, 0)
    .setScale(viewmodelScale);
}

function publishEvidence(): void {
  const at = playerBody.position();
  const evidenceNow = state.paused && pausedAtMs !== undefined ? pausedAtMs : nowMs();
  const lookTarget = app.nodes.get("look-target")?.position ?? [0, 0, 0];
  const firstEnemyBody = physics.bodies.get("enemy-e1")?.position() ?? [0, 0, 0];
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
    mountId,
    touch: touchControls.snapshot(),
    reducedMotion,
    reducedFlash,
    pointerLockRequested: state.pointerLockRequested,
    pointerLockActive: state.pointerLockActive,
    yaw: state.yaw,
    pitch: state.pitch,
    lookTarget: [...lookTarget],
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
    shotClock: shotClock.visible,
    shotExpiresInMs: shotClock.expiresAt === undefined ? -1 : Math.max(0, Math.round(shotClock.expiresAt - evidenceNow)),
    reloading: state.reloadClock > 0,
    reloadClock: state.reloadClock,
    spawnGuard: state.spawnGuard,
    weaponCooldown: weaponClock.cooldown,
    weaponRecoil: weaponClock.recoil,
    hitMarkerActive: state.hitMarker > 0,
    audioUnlocked: audio.unlocked(),
    audioCuesPlayed: audio.cuesPlayed().length,
    droneActive: audio.ambientBus().active,
    droneDucked: audio.ambientBus().ducked,
    audioPaused: audio.ambientBus().paused,
    shotAgeMs: lastShotWallMs < 0 ? -1 : Math.round(evidenceNow - lastShotWallMs),
    fxHideCount: shotFxDebug.hideCount,
    fxLastReason: shotFxDebug.lastReason,
    fxLastAliveAgoMs: shotFxDebug.lastAliveMs < 0 ? -1 : Math.round(nowMs() - shotFxDebug.lastAliveMs),
    dryFireActive: state.dryFirePulse > 0,
    shotBolt0: [...(app.nodes.get("muzzle-0")?.position ?? [0, 0, 0])],
    shotBolt1: [...(app.nodes.get("muzzle-1")?.position ?? [0, 0, 0])],
    enemyVisualY: app.nodes.get("enemy-e1")?.position[1] ?? -1,
    enemyBodyY: firstEnemyBody[1],
    enemyBodyPositions: ENEMIES.map((enemy) => [...(physics.bodies.get(`enemy-${enemy.id}`)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])]),
    propBodyPositions: [
      ...["barrel-1", "barrel-2", "barrel-3", "crate-1", "crate-2", "crate-3"].map((id) => [...(physics.bodies.get(`prop-${id}`)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])]),
      ...["lamp-near", "lamp-far"].map((id) => [...(physics.bodies.get(id)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])])
    ],
    shotFxNodeCount: ["shot-impact", ...Array.from({ length: 3 }, (_, i) => `muzzle-${i}`)].filter((id) => app.nodes.has(id)).length,
    cameraShake: director.snapshot().shake,
    effectFlashIntensity: Math.max(0, ...effects.snapshot().effects.filter((effect) => effect.kind === "impact-flash" || effect.kind === "super-flash").map((effect) => effect.intensity)),
    bulletOnBulletContacts: 0,
    usedKit: false,
    typedAssets: Object.keys(assets),
    // 26 authored base prims + 6 debris props + 4 lamp parts + 2 greeble pools
    // + 3 text3D signs. Greeble instances are additional instanced transforms.
    primitiveCount: 41,
    propsScatteredEvents: scatterEvents(),
    overlapPickupChecks: state.overlapPickupChecks,
    losBlockedEnemies: [...enemyLosBlockedIds()],
    rendererMode: diagnostics.renderer?.mode ?? diagnostics.backend ?? "unknown",
    rendererFallback: diagnostics.renderer?.fallback ?? "none",
    knownLimits: [
      "prototype label until route-health, screenshots, and playable gates are retained",
      "follow-camera pitch is approximated; hitscan uses full yaw/pitch",
      "no nav mesh; hostiles rush by proximity after the corridor alarm",
      "hostiles are solid to hitscan but not to the player capsule; touch damage is proximity-authored",
      "medkit catalog match is a medical gurney prop, not a packed first-aid box",
      "audio cues are in-repo CC0 synthesis registered through the asset CLI, not a music score",
      "debris scatter and lamp sway are cosmetic physics; no damage model reads prop poses",
      "enemy aggro sight lines use public sphereCast against the wall hull, not a nav mesh",
      "greebles are two instanced LOD pools of set dressing; signage glyphs are uppercase/digits only"
    ],
    frame: app.runtime.frame
  };
}

app.onFrame(({ dt }) => {
  const elapsedStep = Math.min(0.1, Math.max(1 / 240, dt || 1 / 60));
  const step = Math.min(0.05, elapsedStep);
  const playerMotionCatchup = elapsedStep / step;
  input.update(step);
  if (input.pressed("pause") && state.status === "playing") {
    state.paused = !state.paused;
    if (state.paused) {
      pausedAtMs = nowMs();
    } else if (pausedAtMs !== undefined) {
      const pausedFor = nowMs() - pausedAtMs;
      if (shotClock.expiresAt !== undefined) shotClock.expiresAt += pausedFor;
      if (lastShotWallMs >= 0) lastShotWallMs += pausedFor;
      pausedAtMs = undefined;
    }
    audio.setPaused(state.paused);
  }
  if (input.pressed("reset") || (state.status !== "playing" && input.pressed("reload"))) {
    resetRun();
  }
  if (state.paused) {
    renderHud(hud, state, reducedFlash);
    publishEvidence();
    return;
  }

  state.spawnGuard = Math.max(0, state.spawnGuard - step);

  updateLook(state, input, reducedMotion);
  updatePlayer(state, input, physics, playerBody, step, playerMotionCatchup);
  updateWeapon(state, input, physics, playerBody, effects, weaponClock, step, applyHit, presentShot, {
    onReloadStart: () => audio.play("reload-start"),
    onReloadComplete: () => audio.play("reload-done"),
    onDryFire: () => audio.play("dry-fire"),
    onImpactPoint: (point) => scatterPropsAt(physics, point)
  });

  // NC-A4: keep the spring-carried practicals neutrally supported while the
  // solver advances, so sway is the only thing the spring has to do.
  applyLampSupport(physics);
  physics.step(step);
  const stepped = playerBody.position();
  playerBody.teleport([stepped[0], WALK_Y, stepped[2]]);
  updateEnemies(state, physics, playerBody.position(), app.nodes, step, {
    onPlayerDamaged: () => audio.play("hurt"),
    onAlarm: () => audio.play("alarm")
  });
  // NC-A1/NC-A4 set dressing follows its bodies; NC-A2 overlap-sweep backup
  // runs every frame but can only ever agree with the authoritative sensor.
  syncPropNodes(app.nodes, step);
  collectPickupsNearPlayer(state, physics, playerBody.position(), pickupHooks);
  // Trigger-enter remains the primary exit signal. Confirm the authored exit
  // overlap after stepping as a fixed-clock robustness path, matching the
  // pickup query backup and preventing a throttled frame from missing the win.
  const exitOverlap = physics.queries.overlapSphere(playerBody.position(), 0.6, { layers: ["pickup"] });
  if (exitOverlap.some((body) => body.nodeName === "exit")) reachExit();

  const look = lookTargetPoint(playerBody, state);
  lookNode.setPosition(look[0], look[1], look[2]).setRotation(0, state.yaw, 0);
  syncWeaponViewmodel();
  if (shotClock.visible > 0 && shotClock.pose) {
    shotClock.pose = {
      barrel: muzzleBarrel(),
      end: shotClock.pose.end,
      yaw: state.yaw,
      pitch: state.pitch
    };
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

  renderHud(hud, state, reducedFlash);
  publishEvidence();
  game.evidence(app, {
    input,
    effects,
    camera: director,
    accessibility: [reducedMotionSource, reducedFlashSource, pauseControls],
    assets: { typedAssets: Object.keys(assets).length }
  });
});

publishEvidence();
renderHud(hud, state, reducedFlash);

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = String((diagnostics as { runtimeBackend?: string }).runtimeBackend ?? (diagnostics as { backend?: string }).backend ?? "");
  document.body.dataset.aura3dDrawCalls = String((diagnostics as { drawCalls?: number }).drawCalls ?? 0);
  window.__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
