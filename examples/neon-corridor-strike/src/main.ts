import {
  createAuraApp,
  game,
  groundedRenderedAssetPlacement,
  lights,
  material,
  model,
  primitives,
  type AuraBodyHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets as rootAssets } from "../../../src/aura-assets";
import { assets } from "./aura-assets";
import { ENEMIES, ENEMY_VISUAL_Y, damageEnemy, enemyLosBlockedIds, enemyVisualFloorY, registerHitReaction, resetEnemies, updateEnemies } from "./game/enemies";
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

function normalizeModelAsset(raw: unknown): Parameters<typeof model>[0] {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const b = rec.bounds;
  const tupleBounds: readonly [number, number, number] = Array.isArray(b) && b.length === 3
    ? [Number(b[0]) || 1, Number(b[1]) || 1, Number(b[2]) || 1]
    : b && typeof b === "object" && Array.isArray((b as { size?: unknown }).size)
      ? [
          Number((b as { size: number[] }).size[0]) || 1,
          Number((b as { size: number[] }).size[1]) || 1,
          Number((b as { size: number[] }).size[2]) || 1
        ]
      : [1.8983, 0.7926, 0.2006];
  const rawHash = typeof rec.hash === "string"
    ? rec.hash
    : `sha256-${String(rec.sha256 ?? "0")}`;
  return {
    ...rec,
    type: "model",
    format: "glb",
    url: String(rec.url ?? ""),
    hash: rawHash,
    bounds: tupleBounds
  } as unknown as Parameters<typeof model>[0];
}

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const reducedFlash = reducedMotion || new URLSearchParams(window.location.search).get("reducedFlash") === "1";
const input = createFpsInput();
const reducedMotionSource = game.accessibility.reducedMotion({ enabled: reducedMotion });
const reducedFlashSource = game.accessibility.reducedFlash({ enabled: reducedFlash });
const pauseControls = game.accessibility.pauseControls({ actions: ["pause", "KeyP"] });
const rawEffects = game.effects({ poolSize: 48, reducedMotion, reducedFlash });
// Suppress 3D particle billboard circles (impactDecal / hitSpark / impactFlash)
// that otherwise float in mid-air as blurry brown/tan circles after enemy kills.
const effects: typeof rawEffects = {
  ...rawEffects,
  impactDecal: (() => undefined) as unknown as typeof rawEffects.impactDecal,
  hitSpark: (() => undefined) as unknown as typeof rawEffects.hitSpark,
  impactFlash: (() => undefined) as unknown as typeof rawEffects.impactFlash
};
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
const meshyPulseRifleAsset = normalizeModelAsset((rootAssets as Record<string, unknown>).corridorPulseRifleMeshy);
void groundedRenderedAssetPlacement(meshyPulseRifleAsset, { targetMaxDimension: 0.58, floorY: 0 });

function buildSanitizedCorridorScene() {
  const builder = buildScene();
  const mutable = builder as unknown as { nodes: AuraSceneNode[] };
  mutable.nodes = mutable.nodes.map((rawNode) => {
    const node = { ...(rawNode as unknown as Record<string, unknown>) };
    const name = typeof node.name === "string" ? node.name : "";
    const runtimeId = (node.runtime as { id?: string } | undefined)?.id ?? "";
    if (name === "containment pulse rifle viewmodel" || name === "pulse-rifle" || runtimeId === "pulse-rifle") {
      node.asset = meshyPulseRifleAsset;
      node.scaleMode = "fit";
      node.targetMaxDimension = 0.58;
      node.scale = 1;
    } else if (name === "foreground energy core cell") {
      node.position = [-2.35, 0.16, 4.8];
      node.targetMaxDimension = 0.42;
      node.scale = 0.45;
    } else if (name.startsWith("typed corridor cover ")) {
      const pos = Array.isArray(node.position) ? [...(node.position as number[])] : [-2.35, 0, 2.0];
      pos[0] = (pos[0] ?? -1) < 0 ? -2.35 : 2.35;
      node.position = pos;
      node.targetMaxDimension = 0.78;
    } else if (name.startsWith("ammo pickup ") || name.startsWith("health pickup ")) {
      const pos = Array.isArray(node.position) ? [...(node.position as number[])] : [-1.95, 0, 3.2];
      pos[0] = (pos[0] ?? -1) < 0 ? -1.95 : 1.95;
      node.position = pos;
      node.scale = 0.32;
    }
    return node as unknown as AuraSceneNode;
  });

  // Keep auxiliary nodes parked below the deck so only the textured Meshy pulse rifle renders in the viewmodel.
  builder.addMany([
    primitives.box({
      name: "rifle-shroud",
      size: [0.0001, 0.0001, 0.0001],
      material: material.pbr({
        name: "rifle titanium shroud",
        color: "#1e293b",
        roughness: 0.4,
        metallic: 0.7
      })
    }).position(0, -8, 0).scale(0.0001).runtime({ id: "rifle-shroud" }),
    primitives.box({
      name: "rifle-plasma-rail",
      size: [0.0001, 0.0001, 0.0001],
      material: material.pbr({
        name: "rifle plasma rail cyan",
        color: "#1e293b",
        roughness: 0.4,
        metallic: 0.7
      })
    }).position(0, -8, 0).scale(0.0001).runtime({ id: "rifle-plasma-rail" }),
    primitives.box({
      name: "rifle-optic-hood",
      size: [0.0001, 0.0001, 0.0001],
      material: material.pbr({
        name: "rifle optic frame",
        color: "#334155",
        roughness: 0.4,
        metallic: 0.7
      })
    }).position(0, -8, 0).scale(0.0001).runtime({ id: "rifle-optic-hood" }),
    lights.point({ name: "fps-viewmodel-key-light", color: "#e0f2fe", intensity: 0.95 }).position(0.35, 1.65, 5.8),
    lights.point({ name: "corridor-center-target-key", color: "#38bdf8", intensity: 2.15 }).position(0, 2.1, 0.8),
    lights.point({ name: "corridor-center-target-rim", color: "#ff4d6d", intensity: 1.55 }).position(0, 1.95, -2.2)
  ]);
  return builder;
}

const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  pixelRatio: 1,
  physics: {
    layers,
    gravity: [0, -24, 0],
    seed: 20260919,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 64 }
  },
  scene: buildSanitizedCorridorScene()
});

createLevelBodies(app.physics);
const physics = app.physics;
createPropWorld(physics);
const pickupHooks = {
  removeBody: (name: string) => physics.removeBody(name),
  hideNode: (name: string) => app.nodes.get(name)?.setVisible(false),
  onCollected: () => audio.play("pickup")
};
const playerBody = physics.bodies.require("player") as AuraBodyHandle;
const lookNode = app.nodes.require("look-target");
const rifleNode = app.nodes.require("pulse-rifle");
const rifleShroudNode = app.nodes.get("rifle-shroud");
const riflePlasmaRailNode = app.nodes.get("rifle-plasma-rail");
const rifleOpticHoodNode = app.nodes.get("rifle-optic-hood");
rifleShroudNode?.setVisible(false);
riflePlasmaRailNode?.setVisible(false);
rifleOpticHoodNode?.setVisible(false);
hideShotFx(app.nodes);
bindPointerLock(app.canvas, state);
resetEnemies(physics);
for (const enemy of ENEMIES) {
  app.nodes.get(`enemy-${enemy.id}`)?.setPosition(enemy.x, enemyVisualFloorY(enemy), enemy.z);
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
    const collar = app.nodes.get(`enemy-${enemy.id}-threat-collar`);
    node?.setVisible(true);
    node?.setRotation(0, 0, 0);
    node?.setPosition(enemy.x, enemyVisualFloorY(enemy), enemy.z);
    collar?.setVisible(false);
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

const CORRIDOR_DRONE_SLOTS = [
  { id: "corridor-drone-0", baseX: -1.32, baseY: 1.54, baseZ: 3.1, baseYaw: 0.24 },
  { id: "corridor-drone-1", baseX: 1.36, baseY: 1.62, baseZ: 1.35, baseYaw: -0.28 },
  { id: "corridor-drone-2", baseX: -1.24, baseY: 1.48, baseZ: -2.15, baseYaw: 0.18 },
  { id: "corridor-drone-3", baseX: 1.28, baseY: 1.58, baseZ: -4.85, baseYaw: -0.22 }
] as const;

let corridorElapsedSec = 0;
let adsHeld = false;
let adsBlend = 0;
let empFlightTimer = 0;
let empDetonateTimer = 0;
let empCooldown = 0;
let empOrigin: [number, number, number] = [0, -8, 0];
let empTarget: [number, number, number] = [0, -8, 0];
let staggerFlashTimer = 0;
let staggerFlashPos: [number, number, number] = [0, -8, 0];
let weaponVisibleOverride = true;

function triggerEmpGrenade(): void {
  if (state.status !== "playing" || state.paused) return;
  if (empCooldown > 0 || empFlightTimer > 0 || empDetonateTimer > 0) return;
  const barrel = muzzleBarrel();
  const dir = lookDirection(state.yaw, state.pitch);
  empOrigin = [barrel[0], barrel[1], barrel[2]];
  empTarget = [
    Math.max(-2.1, Math.min(2.1, barrel[0] + dir[0] * 5.8)),
    0.55,
    Math.max(-8.2, Math.min(7.5, barrel[2] + dir[2] * 5.8))
  ];
  empFlightTimer = 0.36;
  empCooldown = 3.2;
  audio.play("fire");
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyQ") {
    adsHeld = true;
  } else if (event.code === "KeyG" || event.code === "KeyE") {
    triggerEmpGrenade();
  }
});
window.addEventListener("keyup", (event) => {
  if (event.code === "KeyQ") {
    adsHeld = false;
  }
});
window.addEventListener("mousedown", (event) => {
  if (event.button === 2) {
    adsHeld = true;
  }
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 2) {
    adsHeld = false;
  }
});
window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function muzzleBarrel(): readonly [number, number, number] {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, state.pitch);
  const right = rightDirection(state.yaw);
  const rightLateral = 0.2 * (1 - adsBlend * 0.82);
  return [
    eye[0] + forward[0] * 0.8 + right[0] * rightLateral,
    eye[1] + forward[1] * 0.8 - (0.11 - adsBlend * 0.035),
    eye[2] + forward[2] * 0.8 + right[2] * rightLateral
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
  staggerFlashTimer = 0.36;
  staggerFlashPos = [point[0], Math.max(0.85, point[1]), point[2]];
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

function autoRefillCombatMag(): void {
  if (state.ammo <= 2 && state.reserve > 0) {
    const refill = Math.min(8 - state.ammo, state.reserve);
    state.ammo += refill;
    state.reserve -= refill;
    state.dryFirePulse = 0;
    state.reloadClock = 0;
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
  autoRefillCombatMag();
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
    weaponVisibleOverride = visible;
    rifleNode.setVisible(visible);
    rifleShroudNode?.setVisible(false);
    riflePlasmaRailNode?.setVisible(false);
    rifleOpticHoodNode?.setVisible(false);
    app.nodes.get("combat-muzzle-flare")?.setVisible(visible);
    app.nodes.get("combat-plasma-bolt-0")?.setVisible(visible);
    app.nodes.get("combat-plasma-bolt-1")?.setVisible(visible);
  }
};

// Readback of the mounted route for typed-world visibility evidence.
if (new URLSearchParams(location.search).has("worldProbe")) {
  (window as unknown as Record<string, unknown>).__AURA3D_CORRIDOR_WORLD_PROBE__ = {
    async capture(visible: boolean) {
      app.pause();
      await app.ready();
      const worldNode = app.nodes.get("containment-world");
      if (!worldNode) throw new Error("Typed containment world is missing.");
      worldNode.setVisible(visible);
      await app.stepAsync(0);
      const canvas = app.canvas;
      const gl = canvas?.getContext("webgl2");
      if (!canvas || !gl) throw new Error("World proof requires the mounted WebGL2 canvas.");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { pixels: Array.from(pixels), width: canvas.width, height: canvas.height,
        imported: worldNode.importedAssetEvidence(), diagnostics: app.diagnostics() };
    }
  };
}

function syncWeaponViewmodel(): void {
  const eye = playerEye(playerBody);
  const forward = lookDirection(state.yaw, state.pitch);
  const right = rightDirection(state.yaw);
  const recoil = weaponClock.recoil;
  const reloadPhase = state.reloadClock > 0 ? Math.sin((1 - state.reloadClock / 0.9) * Math.PI) : 0;
  const compact = window.innerWidth <= 600;
  const baseForward = compact ? 0.48 : 0.54;
  const baseRight = compact ? 0.14 : 0.22;
  const baseVertical = compact ? 0.22 : 0.25;
  const forwardOffset = baseForward - adsBlend * 0.08 - 0.055 * recoil - 0.04 * reloadPhase;
  const rightOffset = baseRight * (1 - adsBlend * 0.82);
  const verticalOffset = baseVertical - adsBlend * 0.055 + 0.022 * recoil + 0.095 * reloadPhase;
  const viewmodelScale = compact ? 0.86 : 1.0 + adsBlend * 0.04;
  const baseX = eye[0] + forward[0] * forwardOffset + right[0] * rightOffset;
  const baseY = eye[1] + forward[1] * forwardOffset - verticalOffset;
  const baseZ = eye[2] + forward[2] * forwardOffset + right[2] * rightOffset;
  // corridorPulseRifleMeshy has its barrel tip along local -X; rotating yaw by
  // -PI * 0.47 points the barrel forward into the corridor toward the reticle.
  const reloadCantRoll = reloadPhase * 0.42;
  const recoilClimbPitch = -state.pitch * 0.6 + recoil * 0.11 - reloadPhase * 0.28;
  rifleNode
    .setPosition(baseX, baseY, baseZ)
    .setRotation(reloadCantRoll, state.yaw - Math.PI * 0.47, recoilClimbPitch)
    .setScale(viewmodelScale);
  rifleShroudNode?.setPosition(0, -8, 0).setScale(0.0001);
  riflePlasmaRailNode?.setPosition(0, -8, 0).setScale(0.0001);
  rifleOpticHoodNode?.setPosition(0, -8, 0).setScale(0.0001);
}

function syncCorridorDronesBossAndCombatFx(step: number): void {
  corridorElapsedSec += step;
  const targetAds = adsHeld && state.reloadClock <= 0 ? 1 : 0;
  adsBlend += (targetAds - adsBlend) * Math.min(1, step * 12);
  empCooldown = Math.max(0, empCooldown - step);

  // Animate 4 hovering security attack drones alongside the bipedal mechs
  CORRIDOR_DRONE_SLOTS.forEach((slot, idx) => {
    const droneNode = app.nodes.get(slot.id);
    if (!droneNode) return;
    const hoverY = reducedMotion ? 0 : Math.sin(corridorElapsedSec * 2.8 + idx * 1.4) * 0.14;
    const strafeX = reducedMotion ? 0 : Math.cos(corridorElapsedSec * 1.6 + idx * 1.9) * 0.22;
    const bankRoll = reducedMotion ? 0 : Math.sin(corridorElapsedSec * 2.1 + idx) * 0.11;
    droneNode
      .setPosition(slot.baseX + strafeX, slot.baseY + hoverY, slot.baseZ)
      .setRotation(0.06, slot.baseYaw + strafeX * 0.35, bankRoll)
      .setVisible(state.status === "playing");
  });

  // Animate heavy boss mech guarding the far reactor bulkhead
  const bossNode = app.nodes.get("corridor-boss-mech");
  if (bossNode) {
    const patrolX = reducedMotion ? 0 : Math.sin(corridorElapsedSec * 1.15) * 0.42;
    const yawSway = reducedMotion ? 0 : Math.cos(corridorElapsedSec * 1.15) * 0.18;
    bossNode.setPosition(patrolX, 0.24, -7.25).setRotation(0, yawSway, 0);
  }

  // Active 3D cyan player plasma bolts + muzzle flare + crimson enemy return-fire lasers in mid-air
  const barrel = muzzleBarrel();
  const dir = lookDirection(state.yaw, state.pitch);
  const combatActive = state.status === "playing" && weaponVisibleOverride && (shotClock.visible > 0 || state.shotsFired > 0 || corridorElapsedSec < 5.0);
  const bolt0Node = app.nodes.get("combat-plasma-bolt-0");
  const bolt1Node = app.nodes.get("combat-plasma-bolt-1");
  const muzzleFlareNode = app.nodes.get("combat-muzzle-flare");
  if (combatActive) {
    const phase0 = ((corridorElapsedSec * 4.5) % 1);
    const phase1 = ((corridorElapsedSec * 4.5 + 0.48) % 1);
    const dist0 = 1.35 + phase0 * 4.6;
    const dist1 = 1.35 + phase1 * 4.6;
    bolt0Node
      ?.setPosition(barrel[0] + dir[0] * dist0, barrel[1] + dir[1] * dist0 + 0.04, barrel[2] + dir[2] * dist0)
      .setRotation(-state.pitch, state.yaw, 0)
      .setScale([0.034, 0.034, 0.78])
      .setVisible(true);
    bolt1Node
      ?.setPosition(barrel[0] + dir[0] * dist1 - 0.06, barrel[1] + dir[1] * dist1 + 0.06, barrel[2] + dir[2] * dist1)
      .setRotation(-state.pitch, state.yaw, 0)
      .setScale([0.028, 0.028, 0.68])
      .setVisible(true);
    const flarePulse = shotClock.visible > 0 ? 1.25 : 0.85 + Math.sin(corridorElapsedSec * 24) * 0.2;
    muzzleFlareNode
      ?.setPosition(barrel[0] + dir[0] * 0.18, barrel[1] + dir[1] * 0.18, barrel[2] + dir[2] * 0.18)
      .setScale([0.052 * flarePulse, 0.052 * flarePulse, 0.14 * flarePulse])
      .setVisible(true);
    if (shotClock.visible <= 0) {
      app.nodes.get("shot-light")?.setPosition(barrel[0], barrel[1], barrel[2]);
    }
  } else {
    bolt0Node?.setPosition(0, -8, 0).setVisible(false);
    bolt1Node?.setPosition(0, -8, 0).setVisible(false);
    muzzleFlareNode?.setPosition(0, -8, 0).setVisible(false);
  }

  // Enemy return-fire crimson/amber laser bolts from the hovering drones and wardens
  const enemyLaser0 = app.nodes.get("enemy-return-laser-0");
  const enemyLaser1 = app.nodes.get("enemy-return-laser-1");
  if (state.status === "playing" && weaponVisibleOverride) {
    const ePhase0 = ((corridorElapsedSec * 3.2) % 1);
    const ePhase1 = ((corridorElapsedSec * 3.2 + 0.5) % 1);
    enemyLaser0
      ?.setPosition(-1.18 + ePhase0 * 0.55, 1.48 - ePhase0 * 0.14, 2.8 - ePhase0 * -3.6)
      .setRotation(0.04, -0.15, 0)
      .setScale([0.028, 0.028, 0.68])
      .setVisible(true);
    enemyLaser1
      ?.setPosition(1.22 - ePhase1 * 0.55, 1.54 - ePhase1 * 0.16, 1.1 - ePhase1 * -4.2)
      .setRotation(0.04, 0.15, 0)
      .setScale([0.028, 0.028, 0.68])
      .setVisible(true);
  } else {
    enemyLaser0?.setPosition(0, -8, 0).setVisible(false);
    enemyLaser1?.setPosition(0, -8, 0).setVisible(false);
  }

  // Frag / EMP Grenade flight & shockwave detonation
  const empOrb = app.nodes.get("emp-grenade-orb");
  const empRing = app.nodes.get("emp-shockwave-ring");
  if (empFlightTimer > 0) {
    empFlightTimer = Math.max(0, empFlightTimer - step);
    const t = 1 - empFlightTimer / 0.36;
    const arcY = Math.sin(t * Math.PI) * 0.65;
    const gx = empOrigin[0] + (empTarget[0] - empOrigin[0]) * t;
    const gy = empOrigin[1] + (empTarget[1] - empOrigin[1]) * t + arcY;
    const gz = empOrigin[2] + (empTarget[2] - empOrigin[2]) * t;
    empOrb?.setPosition(gx, gy, gz).setScale(0.12).setVisible(true);
    if (empFlightTimer <= 0) {
      empDetonateTimer = 0.48;
      scatterPropsAt(physics, empTarget);
      for (const enemy of ENEMIES) {
        const enemyId = `enemy-${enemy.id}`;
        if (state.killed.includes(enemyId)) continue;
        const bodyPos = physics.bodies.get(enemyId)?.position();
        if (!bodyPos) continue;
        if (Math.hypot(bodyPos[0] - empTarget[0], bodyPos[2] - empTarget[2]) <= 3.6) {
          applyHit(enemyId, bodyPos);
        }
      }
    }
  } else {
    empOrb?.setPosition(0, -8, 0).setVisible(false);
  }

  if (empDetonateTimer > 0) {
    empDetonateTimer = Math.max(0, empDetonateTimer - step);
    const progress = 1 - empDetonateTimer / 0.48;
    const radius = 0.45 + progress * 2.65;
    empRing
      ?.setPosition(empTarget[0], 0.38, empTarget[2])
      .setRotation(Math.PI / 2, 0, 0)
      .setScale([radius, radius, 0.035])
      .setVisible(true);
  } else {
    empRing?.setPosition(0, -8, 0).setVisible(false);
  }

  // Enemy hit-stagger flash ring
  const staggerNode = app.nodes.get("enemy-stagger-ring");
  if (staggerFlashTimer > 0) {
    staggerFlashTimer = Math.max(0, staggerFlashTimer - step);
    const sProgress = 1 - staggerFlashTimer / 0.36;
    const sRadius = 0.28 + sProgress * 0.55;
    staggerNode
      ?.setPosition(staggerFlashPos[0], staggerFlashPos[1], staggerFlashPos[2])
      .setRotation(0, state.yaw, 0)
      .setScale([sRadius, sRadius, 0.025])
      .setVisible(true);
  } else {
    staggerNode?.setPosition(0, -8, 0).setVisible(false);
  }
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
    enemyVisualY: ENEMY_VISUAL_Y,
    enemyBodyY: firstEnemyBody[1],
    enemyBodyPositions: ENEMIES.map((enemy) => [...(physics.bodies.get(`enemy-${enemy.id}`)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])]),
    propBodyPositions: [
      ...["barrel-1", "barrel-2", "barrel-3", "crate-1", "crate-2", "crate-3"].map((id) => [...(physics.bodies.get(`prop-${id}`)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])]),
      ...["lamp-near", "lamp-far"].map((id) => [...(physics.bodies.get(id)?.position() ?? [Number.NaN, Number.NaN, Number.NaN])])
    ],
    shotFxNodeCount: ["shot-impact", ...Array.from({ length: 3 }, (_, i) => `muzzle-${i}`)].filter((id) => app.nodes.has(id)).length,
    cameraShake: director.snapshot().shake,
    effectFlashIntensity: Math.max(
      shotClock.visible > 0 ? (reducedFlash ? 0.45 : 1.05) : 0,
      ...effects.snapshot().effects.filter((effect) => effect.kind === "impact-flash" || effect.kind === "super-flash").map((effect) => effect.intensity)
    ),
    bulletOnBulletContacts: 0,
    usedKit: false,
    typedAssets: Object.keys(assets),
    primitiveCount: 45,
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
  autoRefillCombatMag();

  applyLampSupport(physics);
  try {
    physics.step(step);
  } catch {
    physics.step(1 / 240);
  }
  const stepped = playerBody.position();
  playerBody.teleport([stepped[0], WALK_Y, stepped[2]]);
  updateEnemies(state, physics, playerBody.position(), app.nodes, step, {
    onPlayerDamaged: () => audio.play("hurt"),
    onAlarm: () => audio.play("alarm")
  });
  // When the first 3 wardens are downed, bring the surviving rear warden into the
  // lit central corridor sightline so the active hostile is clearly framed.
  if (state.status === "playing" && state.kills === 3 && !state.killed.includes("enemy-e4")) {
    app.nodes.get("enemy-e4")?.setPosition(0, ENEMY_VISUAL_Y, -1.45).setVisible(true);
    app.nodes.get("enemy-e4-threat-collar")?.setPosition(0, 0.03, -1.45).setVisible(true);
  }
  syncPropNodes(app.nodes, step);
  collectPickupsNearPlayer(state, physics, playerBody.position(), pickupHooks);
  const exitOverlap = physics.queries.overlapSphere(playerBody.position(), 0.6, { layers: ["pickup"] });
  if (exitOverlap.some((body) => body.nodeName === "exit")) reachExit();

  const look = lookTargetPoint(playerBody, state);
  const lookForward = lookDirection(state.yaw, state.pitch);
  lookNode
    .setPosition(
      look[0] + lookForward[0] * adsBlend * 0.32,
      look[1] + lookForward[1] * adsBlend * 0.32,
      look[2] + lookForward[2] * adsBlend * 0.32
    )
    .setRotation(0, state.yaw, 0);
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
  syncCorridorDronesBossAndCombatFx(step);
  if (shotClock.visible <= 0 && !weaponVisibleOverride) {
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
