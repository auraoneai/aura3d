/**
 * Slingshot Siege — route entry.
 *
 * Wires the scene pool, standalone physics.world sim, slingshot input,
 * camera state machine, DOM HUD shell, persistence, demo mode and evidence
 * globals into one frame loop. All dynamic pose state flows through
 * `app.nodes` handles — no setScene remounts.
 */
import {
  createGameApp,
  material,
  type AuraModelMaterialHandle,
  type AuraModelMaterialOverride,
  type AuraRuntimeNodeHandle,
  type AuraSceneSnapshot,
  type AuraTrailHandle,
  type AuraVec3
} from "@aura3d/engine";
import { AMMO, type AmmoId } from "./game/ammo";
import { siegeAudio } from "./game/audio";
import { SiegeHud, starRating, type ModeId } from "./game/hud";
import { assignPoolSlots, fitHalfWidth, orbitAround, quatToEulerZYX, rotQ, type PoolSlot } from "./game/layout";
import { CHAPTERS, isLevelUnlocked, levelById, LEVELS, type LevelSpec } from "./game/levels";
import { SiegeSim, type VisualUpdate } from "./game/sim";
import {
  blockLook, blockNodeId, bladeNodeId, buildScene, debrisLook, debrisNodeId, dotNodeId,
  gullPartId, millHubNodeId, millPoleNodeId, crateNodeId, barrelNodeId, plankNodeId, projectileNodeId,
  pooledNodeIds, PROP_IDS, POOL, SEA_LEVEL, SLING_IDS
} from "./game/stage";
import { sanitizeRenderParams } from "./game/urlGuard";
import { AMMO_TRAIL_COLOR, SIEGE_VFX, abilityPreset, breakPreset, registerSiegeVfx } from "./game/vfx";
import { chapterLook } from "./game/look";
import { QA_WORLD_BOXES, bandChanged, boxCorners, screenCrop, tiltShiftBand, type QaCrop, type TiltShiftBand } from "./game/presentation";
import { installBlackFrameGuard } from "@aura3d/debug";
import { installGameBeacon } from "@aura3d/engine/game";

sanitizeRenderParams();
installBlackFrameGuard();

// ---------------------------------------------------------------- params --

const params = new URLSearchParams(location.search);
const DEMO = params.get("demo") === "1" || params.get("demo") === "true";
let autoPlay = params.get("autoplay") === "1" || DEMO;
let appReady = false;
const SEED = (Number(params.get("seed")) || 0x51e9e) >>> 0;
const START_LEVEL = Math.min(Math.max(0, Number(params.get("level")) || 0), LEVELS.length - 1);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("still") === "1";
/** `?ao=0`: evidence switch for the AO-on/off capture pair (LIGHT-06). */
const AO = params.get("ao") !== "0";

// ---------------------------------------------------------- persistence --

interface Persisted { stars: Record<number, number>; bandColor: string; flagColor: string; bestLevel: number }
const STORE_KEY = "slingshot-siege-v1";
function loadPersisted(): Persisted {
  const base: Persisted = { stars: {}, bandColor: "#d94f30", flagColor: "#ff4d5a", bestLevel: 0 };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(base, JSON.parse(raw) as Partial<Persisted>);
  } catch { /* fresh profile */ }
  return base;
}
const saved = loadPersisted();
function persist(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* private mode */ }
}

// ------------------------------------------------------------------- app --

const chapter = CHAPTERS[levelById(START_LEVEL).chapter]!;
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  renderer: { qualityProfile: "production" },
  qualityRebuild: { flags: ["game"] },
  input: {
    actions: {
      ability: ["Space", "KeyQ", "Enter"],
      reset: ["KeyR"],
      pause: ["KeyP", "Escape"],
      map: ["Tab", "KeyM"]
    },
    bufferMs: 90,
    gamepad: false,
    touch: true
  },
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: buildScene(chapter, { reducedMotion: REDUCED, ambientOcclusion: AO })
});
const app = gameApp.app;
const input = gameApp.input;
const audio = siegeAudio();
// GU47 SS47-V1/V2: the runtime VFX preset pack (material breaks, boar hits, sea splashes, launch dust, abilities).
registerSiegeVfx(app.effects, { reducedMotion: REDUCED, reducedFlash: REDUCED });
const stageEl = document.getElementById("app")!;
const IS_TOUCH = matchMedia("(pointer: coarse)").matches;

// --------------------------------------------------------------- handles --

const H = new Map<string, AuraRuntimeNodeHandle>();
const POOLED_IDS = pooledNodeIds();
const animCache = new Map<string, string>();
function node(id: string): AuraRuntimeNodeHandle | undefined {
  if (!H.has(id)) {
    const h = app.nodes.get(id) as AuraRuntimeNodeHandle | undefined;
    if (h) H.set(id, h);
  }
  return H.get(id);
}
function setNodeAnim(id: string, clip: string, speed = 1): void {
  const h = node(id);
  if (!h) return;
  const key = `${clip}:${speed.toFixed(2)}`;
  if (animCache.get(id) === key) return;
  animCache.set(id, key);
  h.setAnimation({ clip, loop: true, speed });
}
function setPose(id: string, u: VisualUpdate, scale?: number | readonly [number, number, number]): void {
  const h = node(id);
  if (!h) return;
  h.setPosition(u.position[0], u.position[1], u.position[2]);
  const e = quatToEulerZYX(u.rotation);
  h.setRotation(e[0], e[1], e[2]);
  if (scale !== undefined) h.setScale(scale as number | [number, number, number]);
  h.setVisible(u.visible);
}

/**
 * GLB looks for pooled model nodes go through the node's `materials` handle
 * (C-15 overrides, re-applied from the authored snapshot, so they never
 * accumulate). A model node's `setMaterial` only seeds the load-time look, so
 * the old glass-only `setMaterial` never reset a pooled node. Each node
 * remembers its look key; nodes whose GLB has not loaded yet are retried from
 * the frame loop.
 */
const lookKeys = new Map<string, string>();
const pendingLooks = new Map<string, readonly AuraModelMaterialOverride[]>();
function modelMaterials(id: string): AuraModelMaterialHandle | undefined {
  let h = app.nodes.get(id) as unknown as { materials?: AuraModelMaterialHandle } | undefined;
  let m = h?.materials;
  // The handle binds its actor when first read; a read before the GLB loaded keeps an empty
  // handle, so drop it and let the registry rebuild it against the loaded actor.
  if (h && m && m.inspectMaterials().length === 0) {
    delete h.materials;
    h = app.nodes.get(id) as unknown as { materials?: AuraModelMaterialHandle } | undefined;
    m = h?.materials;
  }
  return m && m.inspectMaterials().length > 0 ? m : undefined;
}
function applyLook(id: string, key: string, overrides: readonly AuraModelMaterialOverride[]): void {
  if (lookKeys.get(id) === key && !pendingLooks.has(id)) return;
  lookKeys.set(id, key);
  const m = modelMaterials(id);
  if (!m) { pendingLooks.set(id, overrides); return; }
  pendingLooks.delete(id);
  m.setMaterialOverrides(overrides);
}
function flushPendingLooks(): void {
  for (const [id, overrides] of pendingLooks) {
    const m = modelMaterials(id);
    if (!m) continue;
    pendingLooks.delete(id);
    m.setMaterialOverrides(overrides);
  }
}

// ------------------------------------------------------------------- sim --

const sim = new SiegeSim({ level: levelById(START_LEVEL), seed: SEED });
sim.slowmoEnabled = !REDUCED;
let level = sim.level;
let shotsUsed = 0;
let levelScore = 0;
let resultOpen = false;
let mode: ModeId = "siege";
let paused = false;
let muted = audio.muted;
let realLevelId = level.id;
let settledSinceEmpty = 0;
/** Seconds since the last gull fell with no shot in flight (late-topple win check). */
let clearedSinceSettle = 0;
/** Pool node per piece index, for the current level. */
let pieceSlots: (PoolSlot | null)[] = [];

type PieceVisual = { nodeId: string; scale: number | readonly [number, number, number]; pulse: number };
const pieceVisuals = new Map<number, PieceVisual>();
let gullVisualCount = 0;
const tweenList: { id: string; t: number; dur: number; base: readonly [number, number, number]; kind: "squash" | "hop" }[] = [];

function assignPieceVisuals(): void {
  pieceVisuals.clear();
  // Park AND hide every pooled piece/projectile/debris/puff node, including ones never touched yet
  // (never hide static stage/sling/prop nodes). Gull rigs and windmills are toggled below.
  for (const id of POOLED_IDS) node(id)?.setPosition(0, -120, 0).setVisible(false);
  const pieces = sim.pieceList();
  pieceSlots = assignPoolSlots(pieces.map((p) => p.spec), POOL);
  pieces.forEach((p, i) => {
    const slot = pieceSlots[i];
    if (!slot) {
      lastError = `pool overflow: level ${level.id} piece ${i} has no node`;
      return;
    }
    const visual = p.spec.visual ?? "block";
    let id: string;
    let scale: number | [number, number, number];
    if (slot.kind === "crate") id = crateNodeId(slot.slot);
    else if (slot.kind === "barrel") id = barrelNodeId(slot.slot);
    else if (slot.kind === "plank") id = plankNodeId(slot.slot);
    else id = blockNodeId(slot.slot);
    if (visual === "crate") scale = 0.38;
    else if (visual === "barrel") scale = 0.42;
    else if (visual === "plank") scale = [Math.max(0.4, p.spec.hx * 1.1), Math.max(0.4, p.spec.hy * 2.4), Math.max(0.35, p.spec.hz * 0.9)];
    else scale = [Math.max(0.28, p.spec.hx * 1.15), Math.max(0.28, p.spec.hy * 1.45), Math.max(0.28, p.spec.hz * 1.25)];
    pieceVisuals.set(i, { nodeId: id, scale, pulse: 0 });
    // Every assignment sets the look, so a pooled node never keeps the last level's material.
    const mat = visual === "block" ? p.spec.material : "authored";
    applyLook(id, `piece:${mat}`, visual === "block" ? blockLook(p.spec.material) : []);
    node(id)?.setScale(scale).setVisible(true);
  });
  // gulls
  gullVisualCount = sim.gullList().length;
  for (let g = 0; g < POOL.gullRigs; g += 1) {
    const on = g < gullVisualCount;
    for (const part of ["body", "head", "beak", "wingL", "wingR", "tail"] as const) {
      node(gullPartId(g, part))?.setVisible(on);
    }
  }
  // windmills
  sim.windmillList().forEach((wm, m) => {
    node(millPoleNodeId(m))?.setPosition(wm.anchor[0], wm.anchor[1] - 0.9, wm.anchor[2] - 0.15).setScale(0.95).setVisible(true);
    node(millHubNodeId(m))?.setVisible(true);
    for (let b = 0; b < POOL.windmillBlades; b += 1) {
      node(bladeNodeId(m, b))?.setScale([0.22, wm.bladeLength * 1.1, 0.12]).setVisible(true);
    }
  });
  for (let m = sim.windmillList().length; m < POOL.windmills; m += 1) {
    node(millPoleNodeId(m))?.setVisible(false);
    node(millHubNodeId(m))?.setVisible(false);
    for (let b = 0; b < POOL.windmillBlades; b += 1) node(bladeNodeId(m, b))?.setVisible(false);
  }
}

function loadLevel(id: number, opts: { announce?: boolean } = {}): void {
  // The Trajectory Range sandbox (id 99) is not a campaign level: levelById would clamp it to level 30.
  level = id === SANDBOX_LEVEL.id ? SANDBOX_LEVEL : levelById(id);
  sim.loadLevel(level);
  shotsUsed = 0;
  levelScore = 0;
  resultOpen = false;
  settledSinceEmpty = 0;
  clearedSinceSettle = 0;
  clearRuntimeVfx();
  assignPieceVisuals();
  hud.setCoach(showCoach());
  hud.hideResult();
  hud.setPaused(false);
  paused = false;
  if (opts.announce !== false) {
    const ch = CHAPTERS[level.chapter]!;
    hud.showBanner(`${ch.name}`, `Level ${level.slot + 1} — ${level.name}`);
  }
  aim.state = "idle";
  aim.pullX = 0;
  aim.pullY = 0;
  snap.t = -1;
  visualPullX = 0;
  visualPullY = 0;
}

// ---------------------------------------------------------------- camera --

type CamState = "orbit" | "aim" | "follow" | "result";
let camState: CamState = "aim";
/** "Drag empty sky to orbit": yaw/pitch offsets around the current target, eased back to 0 after release. */
let orbitYaw = 0;
let orbitPitch = 0;
const ORBIT_YAW_MAX = 0.75;
const ORBIT_PITCH_MIN = -0.18;
const ORBIT_PITCH_MAX = 0.45;
let camPos: [number, number, number] = [-2.5, 4.0, 15.5];
let camTgt: [number, number, number] = [-0.5, 1.5, 0];
let trauma = 0;
let orbitT = 0;

const CAM: Record<CamState, { pos: [number, number, number]; tgt: [number, number, number] }> = {
  orbit: { pos: [-2.6, 4.1, 15.4], tgt: [-0.5, 1.5, 0] },
  aim: { pos: [-2.5, 4.0, 15.5], tgt: [-0.5, 1.5, 0] },
  follow: { pos: [-4, 3, 7], tgt: [0, 1, 0] },
  result: { pos: [0.8, 3.8, 11.8], tgt: [6.4, 1.55, 0] }
};

function updateCamera(dt: number, elapsed: number): void {
  const spec = CAM[camState === "follow" ? "follow" : camState];
  let dp = spec.pos;
  let dtg = spec.tgt;

  const proj = sim.activeProjectile();
  if (camState === "follow" && proj && !proj.dead) {
    const p = proj.body.position;
    const v = proj.body.velocity;
    dp = [p[0] - Math.max(3, v[0] * 0.18) - 1.5, Math.max(2.0, p[1] + 2.1), p[2] + 8.8];
    dtg = [p[0] + v[0] * 0.22, p[1] + 0.3, p[2]];
  } else if (camState === "orbit") {
    orbitT += dt * 0.14;
    dp = [-2.5 + Math.sin(orbitT) * 1.6, 4.1 + Math.cos(orbitT * 0.7) * 0.3, 15.3 + Math.cos(orbitT) * 0.9];
    dtg = [-0.5, 1.5, 0];
  } else if (camState === "aim") {
    dp = [-2.5 + Math.sin(elapsed * 0.3) * 0.4, 4.0, 15.5];
    dtg = [-0.5, 1.5, 0];
  }

  // Portrait phones: the fixed 55° vertical FOV leaves about 28° across, so fit the
  // framing width instead (sling-to-fort while aiming, the fort on the result card).
  // The aim frame fits sling (x -7.4) to fort (x 7.2) on every aspect, so the fort is not a speck on desktop.
  const aspect = (stageEl.clientWidth || 1) / (stageEl.clientHeight || 1);
  if (camState === "aim" || camState === "orbit") {
    dtg = [-0.1, 1.6, 0];
    dp = fitHalfWidth([dp[0] + 2.4, dp[1], dp[2]], dtg, 55, aspect, aspect < 1 ? 9.4 : 10.6, true);
  } else if (aspect < 1) {
    if (camState === "result") {
      dp = fitHalfWidth(dp, dtg, 55, aspect, 3.6);
    } else {
      dp = fitHalfWidth(dp, dtg, 50, aspect, 4.6);
    }
  }
  // Sky-drag orbit offsets (eased home once the drag ends).
  if (aim.state !== "orbiting") {
    const back = Math.exp(-dt * 1.6);
    orbitYaw *= back;
    orbitPitch *= back;
  }
  if (Math.abs(orbitYaw) > 1e-4 || Math.abs(orbitPitch) > 1e-4) dp = orbitAround(dp, dtg, orbitYaw, orbitPitch);

  const k = 1 - Math.exp(-dt * (camState === "follow" ? 7 : 3.2));
  camPos = [camPos[0] + (dp[0] - camPos[0]) * k, camPos[1] + (dp[1] - camPos[1]) * k, camPos[2] + (dp[2] - camPos[2]) * k];
  camTgt = [camTgt[0] + (dtg[0] - camTgt[0]) * k, camTgt[1] + (dtg[1] - camTgt[1]) * k, camTgt[2] + (dtg[2] - camTgt[2]) * k];

  trauma = Math.max(0, trauma - dt * 1.9);
  const sh = REDUCED ? 0 : trauma * trauma * 0.45;
  // deterministic shake — hash of the frame counter, no Math.random (repo rule)
  const n = (lane: number): number => {
    let h = Math.imul(frames | 0, 0x27d4eb2d) ^ Math.imul((lane + SEED) | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296 - 0.5;
  };
  const px = camPos[0] + n(0) * sh;
  const py = camPos[1] + n(1) * sh;
  const pz = camPos[2] + n(2) * sh;
  const fov = camState === "follow" ? 50 : 55;

  app.camera?.setPose({ position: [px, py, pz], target: camTgt, fov });
  /*
   * Mutate the live spec in place: replacing `app.scene.camera` swaps the
   * object the camera lane binds against while the renderer keeps its own
   * reference, and `refreshVp` below reads the spec for world→screen.
   */
  const cam = app.scene.camera as unknown as Record<string, unknown>;
  cam.mode = "perspective";
  cam.position = [px, py, pz];
  cam.target = camTgt;
  cam.fov = fov;
  void elapsed;
}

// ------------------------------------------------------------------ aim --

const SLING_REST: readonly [number, number, number] = [-7.4, 1.68, 0];
/** Fork prong tips (world) — the band anchors. The prongs themselves never move. */
const FORK_TIPS: readonly (readonly [number, number, number])[] = [[-7.79, 1.89, -0.22], [-7.79, 1.89, 0.22]];
/** Aim pivot in the fork gap: launch direction runs pouch → pivot, so the shot
 *  leaves along the line the stretched bands actually describe. */
const LAUNCH_PIVOT: readonly [number, number, number] = [-7.1, 1.98, 0];
const PULL_POWER = 7.5; // world launch speed per unit of draw (full draw = 12.75)
const PULL_MAX = 1.7; // full-draw distance in world units
/** Extra fork-plane dip at full draw — a real slingshot pouch sags as it goes back. */
const DRAW_SAG = 0.16;
/** The pouch never drops below the knoll collider top (0.6) + projectile radius. */
const POUCH_FLOOR_Y = 1.0;
/** Unstretched band length (fork tip → seated pouch) — the taper reference. */
const BAND_REST_LEN = 0.47;
/** Snap-back spring: critically-under-damped decay — crosses rest at ~130ms,
 *  overshoots ~20% forward, settles by ~320ms. */
const SNAP_DAMP = 6.5;
const SNAP_FREQ = 12;
const SNAP_DUR = 0.32;

const aim = {
  state: "idle" as "idle" | "dragging" | "orbiting",
  pullX: 0,
  pullY: 0,
  pointerId: -1,
  downX: 0,
  downY: 0,
  downT: 0,
  orbiting: false,
  lastX: 0,
  lastY: 0
};
/** Release spring: t >= 0 while the empty pouch is snapping back to rest. */
const snap = { t: -1, px: 0, py: 0 };
/** The pull the pouch is visually at this frame (draw value or snap spring). */
let visualPullX = 0;
let visualPullY = 0;

/** Clamp a raw pull into a legal draw: behind the fork plane, never far above
 *  it, length ≤ full draw. Forward/up drags flatten against the fork instead
 *  of pushing the pouch through it (which used to launch shots backwards). */
function clampPull(x: number, y: number): [number, number] {
  const px = Math.min(0, x);
  const py = Math.min(0.12, Math.max(-1.1, y));
  const len = Math.hypot(px, py);
  if (len > PULL_MAX) return [px * (PULL_MAX / len), py * (PULL_MAX / len)];
  return [px, py];
}

/** Pouch world pose for a draw — pulls back and dips below the fork plane. */
function pouchAt(px: number, py: number): [number, number, number] {
  const t = Math.min(1, Math.hypot(px, py) / PULL_MAX);
  const sag = -DRAW_SAG * Math.pow(t, 1.3);
  return [SLING_REST[0] + px, Math.max(POUCH_FLOOR_Y, SLING_REST[1] + py + sag), 0];
}

interface AimSolution {
  readonly drawT: number;
  readonly pouch: readonly [number, number, number];
  readonly dir: readonly [number, number, number];
  readonly speed: number;
}

/** The one launch solver: the trajectory preview, the fired shot, and the
 *  evidence beacon all read from here so arc and flight can never diverge. */
function solveDraw(px: number, py: number): AimSolution {
  const pouch = pouchAt(px, py);
  const drawT = Math.min(1, Math.hypot(px, py) / PULL_MAX);
  const dx = LAUNCH_PIVOT[0] - pouch[0];
  const dy = LAUNCH_PIVOT[1] - pouch[1];
  const dl = Math.hypot(dx, dy) || 1;
  return { drawT, pouch, dir: [dx / dl, dy / dl, 0], speed: drawT * PULL_MAX * PULL_POWER };
}

function aimSolution(): AimSolution {
  return solveDraw(aim.pullX, aim.pullY);
}

/** Begin the band snap-back from the current draw. */
function beginSnap(): void {
  snap.t = 0;
  snap.px = aim.pullX;
  snap.py = aim.pullY;
}

/** Advance the release spring; returns the visual pull for this frame. */
function updateSnap(dt: number): void {
  if (snap.t < 0) {
    visualPullX = aim.pullX;
    visualPullY = aim.pullY;
    return;
  }
  snap.t += dt;
  if (snap.t >= SNAP_DUR) {
    snap.t = -1;
    visualPullX = 0;
    visualPullY = 0;
    return;
  }
  const f = Math.max(-0.22, Math.exp(-SNAP_DAMP * snap.t) * Math.cos(SNAP_FREQ * snap.t));
  visualPullX = snap.px * f;
  visualPullY = snap.py * f;
}

function currentAmmo(): AmmoId | null {
  return level.ammo[shotsUsed] ?? null;
}

/** First-level onboarding: show the coach card until the player's first launch. */
function showCoach(): boolean {
  return mode === "siege" && level.id === 0 && shotsUsed === 0 && !DEMO && !autoPlay && Object.keys(saved.stars).length === 0;
}

function canAim(): boolean {
  return mode === "siege" && !paused && !resultOpen && !sim.isShotActive() && currentAmmo() !== null;
}

// world→screen: same view→projection the camera spec implies (buffers reused every frame)
const vpMat = new Float32Array(16);
const vpView = new Float64Array(16);
const vpProj = new Float64Array(16);
function refreshVp(): void {
  const w = stageEl.clientWidth || 1;
  const h = stageEl.clientHeight || 1;
  const cam = (app.scene as AuraSceneSnapshot & { camera: { position?: readonly number[]; target?: readonly number[]; fov?: number } }).camera;
  const eye = (cam.position ?? camPos) as readonly [number, number, number] | number[];
  const tgt = (cam.target ?? camTgt) as readonly [number, number, number] | number[];
  const fov = ((cam.fov ?? 46) * Math.PI) / 180;

  // lookAt
  const fx = (tgt[0] ?? 0) - (eye[0] ?? 0);
  const fy = (tgt[1] ?? 0) - (eye[1] ?? 0);
  const fz = (tgt[2] ?? 0) - (eye[2] ?? 0);
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f0 = fx / fl, f1 = fy / fl, f2 = fz / fl;
  // s = f × up(0,1,0)
  const sx = -f2;
  const sz = f0;
  const sl = Math.hypot(sx, sz) || 1;
  const s0 = sx / sl, s1 = 0, s2 = sz / sl;
  const f = [f0, f1, f2] as const;
  const s = [s0, s1, s2] as const;
  const u = [s1 * f2 - s2 * f1, s2 * f0 - s0 * f2, s0 * f1 - s1 * f0] as const;
  const ex = eye[0] ?? 0; const ey = eye[1] ?? 0; const ez = eye[2] ?? 0;
  // column-major view matrix
  const view = vpView;
  view[0] = s[0]!; view[1] = u[0]!; view[2] = -f[0]!; view[3] = 0;
  view[4] = s[1]!; view[5] = u[1]!; view[6] = -f[1]!; view[7] = 0;
  view[8] = s[2]!; view[9] = u[2]!; view[10] = -f[2]!; view[11] = 0;
  view[12] = -(s[0]! * ex + s[1]! * ey + s[2]! * ez); view[13] = -(u[0]! * ex + u[1]! * ey + u[2]! * ez); view[14] = f[0]! * ex + f[1]! * ey + f[2]! * ez; view[15] = 1;
  const t = 1 / Math.tan(fov / 2);
  const aspect = w / h;
  const nf = 1 / (0.1 - 400);
  const proj = vpProj;
  proj.fill(0);
  proj[0] = t / aspect; proj[5] = t; proj[10] = (400 + 0.1) * nf; proj[11] = -1; proj[14] = 2 * 400 * 0.1 * nf;
  // vp = proj * view (column-major)
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      vpMat[c * 4 + r] =
        proj[r]! * view[c * 4]! + proj[4 + r]! * view[c * 4 + 1]! +
        proj[8 + r]! * view[c * 4 + 2]! + proj[12 + r]! * view[c * 4 + 3]!;
    }
  }
}
function projectWorld(p: readonly [number, number, number]): { x: number; y: number; behind: boolean } {
  const m = vpMat;
  const cx = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const cy = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const cw = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  const w = stageEl.clientWidth || 1;
  const h = stageEl.clientHeight || 1;
  return { x: ((cx / cw) * 0.5 + 0.5) * w, y: ((1 - cy / cw) * 0.5) * h, behind: cw <= 0 };
}

stageEl.addEventListener("pointerdown", (ev) => {
  autoPlay = false;
  void audio.unlock();
  refreshVp();
  const rect = stageEl.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;
  aim.downX = px; aim.downY = py; aim.downT = performance.now();
  aim.pointerId = ev.pointerId;

  if (canAim()) {
    const pouch = projectWorld(SLING_REST);
    const grabR = IS_TOUCH ? 190 : 140;
    const dist = Math.hypot(px - pouch.x, py - pouch.y);
    const leftThird = px < rect.width * 0.4;
    if (dist < grabR || leftThird) {
      aim.state = "dragging";
      camState = "aim";
      capturePointer(ev);
      ev.preventDefault();
      return;
    }
  }
  aim.state = "orbiting";
  aim.lastX = ev.clientX; aim.lastY = ev.clientY;
  capturePointer(ev);
});

/** Keep pointermove/up on the stage while a drag leaves it (so a release outside still lands here). */
function capturePointer(ev: PointerEvent): void {
  try { stageEl.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers have no capture */ }
}

const heldKeys = new Set<string>();
const justPressedKeys = new Set<string>();
window.addEventListener("keydown", (ev) => {
  autoPlay = false;
  // A key press is a user gesture too: keyboard-only players get sound (and the wind loop).
  void audio.unlock();
  // Space launches; keep it from scrolling the page. Tab is left alone so keyboard focus still moves.
  if (ev.code === "Space" && !(ev.target instanceof HTMLButtonElement || ev.target instanceof HTMLInputElement)) ev.preventDefault();
  if (!heldKeys.has(ev.code)) justPressedKeys.add(ev.code);
  heldKeys.add(ev.code);
});
window.addEventListener("keyup", (ev) => {
  heldKeys.delete(ev.code);
});

stageEl.addEventListener("pointermove", (ev) => {
  if (ev.pointerId !== aim.pointerId) return;
  if (aim.state === "dragging") {
    const rect = stageEl.getBoundingClientRect();
    const dx = ev.clientX - rect.left - aim.downX;
    const dy = ev.clientY - rect.top - aim.downY;
    // screen-space drag → world draw: left/back drags the pouch behind the fork,
    // down drags it DOWN below the fork plane (screen +y is world -y here) —
    // the pouch follows the finger and the launch is the exact opposite.
    const [px, py] = clampPull(dx * 0.0095, -dy * 0.0095);
    aim.pullX = px;
    aim.pullY = py;
  } else if (aim.state === "orbiting") {
    orbitYaw = Math.min(ORBIT_YAW_MAX, Math.max(-ORBIT_YAW_MAX, orbitYaw - (ev.clientX - aim.lastX) * 0.005));
    orbitPitch = Math.min(ORBIT_PITCH_MAX, Math.max(ORBIT_PITCH_MIN, orbitPitch + (ev.clientY - aim.lastY) * 0.004));
    aim.lastX = ev.clientX; aim.lastY = ev.clientY;
  }
});

function endPointer(ev: PointerEvent): void {
  if (ev.pointerId !== aim.pointerId) return;
  const wasDrag = aim.state === "dragging";
  const quickTap = performance.now() - aim.downT < 300;
  aim.pointerId = -1;
  if (wasDrag) {
    const len = Math.hypot(aim.pullX, aim.pullY);
    if (len > 0.22) {
      fireShot();
    } else {
      // cancelled draw — the bands still spring home
      beginSnap();
      aim.pullX = 0; aim.pullY = 0;
    }
    aim.state = "idle";
    return;
  }
  aim.state = "idle";
  if (quickTap && sim.isShotActive()) fireAbility();
}
/** The browser took the pointer (scroll, gesture, lost capture): drop the draw, never fire it. */
function cancelPointer(ev: PointerEvent): void {
  if (ev.pointerId !== aim.pointerId) return;
  aim.pointerId = -1;
  if (aim.state === "dragging") {
    beginSnap();
    aim.pullX = 0; aim.pullY = 0;
  }
  aim.state = "idle";
}
stageEl.addEventListener("pointerup", endPointer);
stageEl.addEventListener("pointercancel", cancelPointer);

function fireShot(): void {
  const ammo = currentAmmo();
  if (!ammo || !canAim()) {
    // paused, result card open or a shot still flying: release the draw without launching
    beginSnap();
    aim.pullX = 0; aim.pullY = 0;
    return;
  }
  const sol = aimSolution();
  const v: [number, number, number] = [sol.dir[0] * sol.speed, sol.dir[1] * sol.speed, 0];
  if (sol.speed > 0.5 && sim.launch(ammo, sol.pouch, v)) {
    shotsUsed += 1;
    camState = "follow";
    audio.cue("launch");
    hud.setCoach(false);
  }
  // fired or refused — either way the draw releases and the bands snap home
  beginSnap();
  aim.pullX = 0; aim.pullY = 0;
}

function fireAbility(): void {
  if (sim.ability()) audio.cue("ability");
}

// ------------------------------------------------------------ tweens/fx --

function pulsePiece(index: number): void {
  const pv = pieceVisuals.get(index);
  if (!pv) return;
  if (tweenList.some((tw) => tw.id === pv.nodeId)) return;
  const base: readonly [number, number, number] = typeof pv.scale === "number" ? [pv.scale, pv.scale, pv.scale] : pv.scale;
  tweenList.push({ id: pv.nodeId, t: 0, dur: 0.24, base, kind: "squash" });
}
/** A broken piece is already hidden, so the impact squash plays on the (up to two) nearest standing pieces. */
function pulseNeighbours(at: readonly [number, number, number]): void {
  const near: { i: number; d: number }[] = [];
  sim.pieceList().forEach((p, i) => {
    if (!p.alive) return;
    const q = p.body.position;
    const d = Math.hypot(q[0] - at[0], q[1] - at[1], q[2] - at[2]);
    if (d < 1.6) near.push({ i, d });
  });
  near.sort((a, b) => a.d - b.d);
  for (const n of near.slice(0, 2)) pulsePiece(n.i);
}
const hoppingGulls = new Set<string>();
function hopGull(g: number): void {
  const id = gullPartId(g, "body");
  if (hoppingGulls.has(id)) return;
  hoppingGulls.add(id);
  setNodeAnim(id, "Contest", 1.35);
  tweenList.push({ id, t: 0, dur: 0.22, base: [0.54, 0.54, 0.54], kind: "hop" });
}

function updateTweens(dt: number): void {
  for (let i = tweenList.length - 1; i >= 0; i -= 1) {
    const tw = tweenList[i]!;
    tw.t += dt;
    const t = Math.min(1, tw.t / tw.dur);
    const h = node(tw.id);
    if (h) {
      if (tw.kind === "squash") {
        // squash down then spring back — cartoon impact tween
        const squash = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.6);
        h.setScale([tw.base[0] * (1 + squash * 0.55), tw.base[1] * (1 - squash * 0.6), tw.base[2] * (1 + squash * 0.55)]);
      } else {
        const hop = Math.sin(t * Math.PI);
        h.setScale([tw.base[0] * (1 - hop * 0.15), tw.base[1] * (1 + hop * 0.4), tw.base[2] * (1 - hop * 0.15)]);
      }
    }
    if (t >= 1) {
      if (h) h.setScale(tw.base as [number, number, number]);
      if (tw.kind === "hop") hoppingGulls.delete(tw.id);
      tweenList.splice(i, 1);
    }
  }
}

// -------------------------------------------------------------- visuals --

const GULL_PARTS: readonly { part: "body"; off: readonly [number, number, number]; base: readonly [number, number, number] }[] = [
  { part: "body", off: [0, -0.26, 0], base: [0.54, 0.54, 0.54] }
];

function syncGull(g: number): void {
  const rec = sim.gullList()[g];
  if (!rec) return;
  // squashed gulls flatten in place — the body already retired to the graveyard
  const pos = rec.alive ? rec.body.position : rec.squashAt;
  const rot = rec.alive ? rec.body.rotation : ([0, 0, 0, 1] as const);
  const e = quatToEulerZYX(rot);
  // squash tween: flatten into the ground over ~0.15s, hold 0.9s, then hide
  let sy = 1;
  let sxz = 1;
  let sink = 0;
  if (rec.squashAge >= 0) {
    const t = rec.squashAge;
    sy = Math.max(0.1, 1 - Math.min(1, t / 0.14) * 0.9);
    sxz = 1 + Math.min(1, t / 0.14) * 0.6;
    sink = Math.min(1, t / 0.14) * 0.12;
  }
  const hidden = rec.squashAge > 1.05;
  const bodyId = gullPartId(g, "body");
  // While the scare hop plays, its tween owns the clip and the scale.
  const hopping = rec.alive && hoppingGulls.has(bodyId);
  if (!hopping) setNodeAnim(bodyId, rec.alive ? "Idle_Loop" : "Contest", rec.alive ? 0.95 + (g % 3) * 0.08 : 1.4);
  const idleBob = rec.alive ? Math.sin(elapsed * 2.8 + g * 1.3) * 0.035 : 0;
  const idleYaw = rec.alive ? Math.sin(elapsed * 1.9 + g * 0.9) * 0.08 : 0;
  for (const spec of GULL_PARTS) {
    const h = node(gullPartId(g, spec.part));
    if (!h) continue;
    const off = rotQ(rot, spec.off);
    h.setPosition(pos[0] + off[0], pos[1] + off[1] - sink + idleBob, pos[2] + off[2]);
    h.setRotation(e[0], e[1] - Math.PI * 0.45 + idleYaw, e[2]);
    if (!hopping) h.setScale([spec.base[0] * sxz, spec.base[1] * sy, spec.base[2] * sxz]);
    h.setVisible(rec.alive ? true : !hidden);
  }
}

function syncWindmill(m: number): void {
  const wm = sim.windmillList()[m];
  if (!wm) return;
  const p = wm.rotor.position;
  const rot = wm.rotor.rotation;
  const e = quatToEulerZYX(rot);
  node(millHubNodeId(m))?.setPosition(p[0], p[1], p[2]).setRotation(e[0], e[1], e[2]);
  for (let b = 0; b < POOL.windmillBlades; b += 1) {
    const angle = (b / POOL.windmillBlades) * Math.PI * 2;
    const local: [number, number, number] = [Math.cos(angle) * wm.bladeLength * 0.5, Math.sin(angle) * wm.bladeLength * 0.5, 0];
    const off = rotQ(rot, local);
    const h = node(bladeNodeId(m, b));
    if (!h) continue;
    h.setPosition(p[0] + off[0], p[1] + off[1], p[2] + off[2]);
    h.setRotation(e[0], e[1], e[2] + angle);
  }
}

function syncSling(dt: number): void {
  updateSnap(dt);
  const pouch = pouchAt(visualPullX, visualPullY);
  const pouchX = pouch[0];
  const pouchY = pouch[1];
  node(SLING_IDS.pouch)?.setPosition(pouchX, pouchY, 0).setRotation(0, 0, 0);
  const loaded = node(SLING_IDS.loaded);
  const ammo = currentAmmo();
  const isPulling = aim.state === "dragging" || snap.t >= 0;
  if (loaded) {
    const showBall = canAim() || aim.state === "dragging";
    loaded.setVisible(showBall && ammo !== null);
    setNodeAnim(SLING_IDS.loaded, isPulling ? "Load" : "Ready", isPulling ? 1.35 : 1.0);
    const bob = isPulling ? 0 : Math.sin(elapsed * 3.2) * 0.025;
    const pitchTilt = isPulling ? Math.atan2(-visualPullY, Math.max(0.2, -visualPullX)) * 0.45 : 0;
    loaded.setPosition(pouchX, pouchY + 0.04 + bob, 0);
    loaded.setRotation(pitchTilt, Math.PI * 0.5, 0);
    loaded.setScale(0.42 + AMMO[ammo ?? "pebble"].radius * 0.45);
  }
  for (let wIdx = 0; wIdx < 3; wIdx += 1) {
    setNodeAnim(`ammo-wait-${wIdx}`, "Idle_Loop", 0.95 + wIdx * 0.05);
  }
  // bands: two stretched segments, re-aimed every frame from fork tip → pouch.
  // They thin as they elongate so the draw reads as real elastic tension.
  [SLING_IDS.bandL, SLING_IDS.bandR].forEach((id, i) => {
    const h = node(id);
    if (!h) return;
    const tip = FORK_TIPS[i]!;
    const d: [number, number, number] = [pouchX - tip[0], pouchY + 0.06 - tip[1], -tip[2]];
    const len = Math.max(0.05, Math.hypot(d[0], d[1], d[2]));
    const taper = Math.min(1.15, Math.max(0.5, Math.sqrt(BAND_REST_LEN / len)));
    h.setPosition((tip[0] + pouchX) / 2, (tip[1] + pouchY + 0.06) / 2, tip[2] / 2);
    const yaw = Math.atan2(d[0], d[2]);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, d[1] / len)));
    h.setRotation(pitch, yaw, 0);
    h.setScale([0.05 * taper, 0.05 * taper, len]);
  });
  // power meter + trajectory preview while a draw is live
  const sol = aimSolution();
  const drawing = aim.state === "dragging" && sol.drawT > 0.05;
  hud.setShotMeter(drawing ? sol.drawT : 0);
  const g = sim.level.gravity ?? [0, -9.81, 0];
  for (let i = 0; i < POOL.dots; i += 1) {
    const h = node(dotNodeId(i));
    if (!h) continue;
    if (!drawing) { h.setVisible(false); continue; }
    // identical solver to fireShot: ballistic from the pouch along the launch dir
    const t = 0.09 + i * 0.11;
    const vx = sol.dir[0] * sol.speed;
    const vy = sol.dir[1] * sol.speed;
    const px = sol.pouch[0] + vx * t;
    const py = sol.pouch[1] + vy * t + 0.5 * g[1] * t * t;
    const fade = 1 - i / POOL.dots;
    h.setPosition(px, py, 0).setScale(0.04 + fade * 0.05).setVisible(py > -0.2);
  }
}

function syncVisuals(): void {
  for (const u of sim.forEachVisual()) {
    if (u.id.startsWith("piece-visual-")) {
      const idx = Number(u.id.slice(13));
      const pv = pieceVisuals.get(idx);
      if (pv) setPose(pv.nodeId, u);
    } else if (u.id.startsWith("projectile-")) {
      // Projectile records are never reused, so slots wrap; the sim yields records oldest first,
      // so a live newer shot always wins its slot over a dead older one.
      const i = Number(u.id.slice(11)) % POOL.projectiles;
      const pid = projectileNodeId(i);
      setPose(pid, u, 0.48);
      if (u.visible) setNodeAnim(pid, "Jump_Loop", 1.5);
    } else if (u.id.startsWith("debris-")) {
      const i = Number(u.id.slice(7));
      const d = sim.debrisList()[i];
      if (d) {
        const h = node(debrisNodeId(i));
        if (h) {
          if (d.active) {
            applyLook(debrisNodeId(i), `debris:${d.matId}`, debrisLook(d.matId));
            setPose(debrisNodeId(i), u, [d.sx * 2.2, d.sy * 2.2, d.sz * 2.2]);
          } else {
            h.setVisible(false);
          }
        }
      }
    }
    // gull-N and windmill handled by dedicated rigs below
  }
  for (let g = 0; g < gullVisualCount; g += 1) syncGull(g);
  for (let m = 0; m < sim.windmillList().length; m += 1) syncWindmill(m);
  // SS47-V1: the sim's puff records are no longer drawn as spheres; consumeEvents fires the runtime VFX pack.
}

// --------------------------------------------------------------- vfx -----

/** Runtime VFX (GU47 E-F): presets registered by registerSiegeVfx; a missing effects surface is a no-op. */
function burst(kind: string, at: readonly number[], scale = 1): void {
  try {
    app.effects?.burst(kind, [at[0] ?? 0, at[1] ?? 0, at[2] ?? 0], scale === 1 ? undefined : { scale });
  } catch { /* effects are presentation only */ }
}

/** SS47-V2: ammo-tinted ribbon behind the shot in flight; stopped (and left to fade) when the shot dies. */
let shotTrail: AuraTrailHandle | null = null;
function startShotTrail(ammo: AmmoId): void {
  stopShotTrail();
  let last: string | null = null;
  for (const u of sim.forEachVisual()) if (u.id.startsWith("projectile-") && u.visible) last = u.id;
  if (!last || !app.effects) return;
  try {
    shotTrail = app.effects.trail(projectileNodeId(Number(last.slice(11)) % POOL.projectiles), {
      width: REDUCED ? 0.08 : 0.14, life: REDUCED ? 0.25 : 0.45, color: AMMO_TRAIL_COLOR[ammo], widthOverSpeed: [1, 9]
    });
  } catch { shotTrail = null; }
}
function stopShotTrail(): void {
  try { shotTrail?.stop(); } catch { /* already gone */ }
  shotTrail = null;
}

/** Island footprint (beach ring) in x/z: a body crossing the sea surface outside it splashes (SS47-V1). */
function overSea(x: number, z: number): boolean {
  return ((x - 1.6) / 9.8) ** 2 + ((z + 0.4) / 7.6) ** 2 > 1;
}
const lastHeights = new Map<string | number, number>();
/** Read-only watcher over the sim's live shot and debris: a downward crossing of the sea surface splashes once. */
function watchSplashes(): void {
  const check = (id: string | number, p: AuraVec3, scale: number): void => {
    const prev = lastHeights.get(id);
    lastHeights.set(id, p[1]);
    if (prev !== undefined && prev > SEA_LEVEL + 0.05 && p[1] <= SEA_LEVEL + 0.05 && p[1] > SEA_LEVEL - 2 && overSea(p[0], p[2])) {
      burst(SIEGE_VFX.seaSplash, [p[0], SEA_LEVEL, p[2]], scale);
    }
  };
  const proj = sim.activeProjectile();
  if (proj && !proj.dead) check(proj.body.id, proj.body.position as AuraVec3, 1);
  for (const d of sim.debrisList()) if (d.active) check(d.body.id, d.body.position as AuraVec3, 0.5);
}

/** Level loads start clean: no live particles, trails or scorch decals (SS47-V2). */
function clearRuntimeVfx(): void {
  stopShotTrail();
  lastHeights.clear();
  try { app.effects?.clear(); } catch { /* presentation only */ }
}

// --------------------------------------------------- miniature focus ----

/** The chapter row the scene was built from (the look is chosen at boot from `?level=`). */
const LOOK_ROW = chapterLook(chapter.id);
let lastBand: TiltShiftBand | null = null;
let qaCrops: readonly QaCrop[] = [];

/** World box around the standing fort pieces (read-only over the sim), padded for block size. */
function fortBox(): { min: [number, number, number]; max: [number, number, number] } | null {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of sim.pieceList()) {
    if (!p.alive) continue;
    const q = p.body.position;
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); z0 = Math.min(z0, q[2]);
    x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); z1 = Math.max(z1, q[2]);
  }
  if (!Number.isFinite(x0)) return null;
  const pad = 0.4;
  return { min: [x0 - pad, Math.max(0, y0 - pad), z0 - pad], max: [x1 + pad, y1 + pad, z1 + pad] };
}

/**
 * SS47-P1: retarget the signature tilt-shift band to hold the fort, the sling and the live shot, and publish the
 * E-I QA crops (fort, sling, far headland, sand, sea) for the capture. Runs after the camera moved this frame.
 */
function updateMiniatureFocus(): void {
  const w = stageEl.clientWidth || 1;
  const h = stageEl.clientHeight || 1;
  const project = (pts: readonly (readonly [number, number, number])[]) => pts.map((q) => projectWorld(q as [number, number, number]));
  const fort = fortBox();
  const fortPts = fort ? project(boxCorners(fort.min, fort.max)) : [];
  const slingPts = project(boxCorners([SLING_REST[0] - 0.6, 0, -0.5], [SLING_REST[0] + 0.6, SLING_REST[1] + 0.4, 0.5]));
  const ys: number[] = [];
  for (const q of [...fortPts, ...slingPts]) if (!q.behind) ys.push(q.y / h);
  const proj = sim.activeProjectile();
  if (proj && !proj.dead) {
    const q = projectWorld(proj.body.position as [number, number, number]);
    if (!q.behind) ys.push(q.y / h);
  }
  const band = tiltShiftBand(ys, LOOK_ROW.dof.bandWidth);
  if (bandChanged(lastBand, band)) {
    lastBand = band;
    try { app.post?.setEffect("depthOfField", { tiltShift: [band.bandCenter, band.bandWidth, 0] }); } catch { /* post is presentation only */ }
  }
  const crops: QaCrop[] = [];
  const add = (c: QaCrop | null): void => { if (c) crops.push(c); };
  add(screenCrop("fort", fortPts, w, h));
  add(screenCrop("sling", slingPts, w, h));
  add(screenCrop("far-headland", project(boxCorners(QA_WORLD_BOXES.farHeadland.min, QA_WORLD_BOXES.farHeadland.max)), w, h, 0));
  add(screenCrop("sand", project(boxCorners(QA_WORLD_BOXES.sand.min, QA_WORLD_BOXES.sand.max)), w, h, 0));
  add(screenCrop("sea", project(boxCorners(QA_WORLD_BOXES.sea.min, QA_WORLD_BOXES.sea.max)), w, h, 0));
  qaCrops = crops;
  const qaHost = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  const qa = (qaHost.__AURA_QA__ ??= {});
  qa.crops = qaCrops;
  qa.tiltShift = band;
  qa.chapterLook = LOOK_ROW.chapter;
}

// ------------------------------------------------------------------ hud --

const hud = new SiegeHud(document.getElementById("hud") ?? stageEl, {
  onFireAbility: () => fireAbility(),
  onReset: () => resetLevel(),
  onPause: (p) => { paused = p; hud.setPaused(p); if (!p) hud.setMode(mode); },
  onLevelSelect: (id) => { realLevelId = id; mode = "siege"; hud.setMode(mode); loadLevel(id); },
  onModeChange: (m) => setMode(m),
  onResult: (next) => {
    if (next === "next") {
      // Same star gate the Siege Map enforces.
      const nxt = level.id + 1;
      if (nxt >= LEVELS.length || !isLevelUnlocked(nxt, saved.stars)) return;
      realLevelId = nxt;
      loadLevel(nxt);
    } else if (next === "retry") {
      resetLevel();
    } else {
      setMode("map");
    }
  },
  onBandColor: (c) => {
    saved.bandColor = c; persist();
    const mat = material.pbr({ color: c, roughness: 0.6 });
    node(SLING_IDS.bandL)?.setMaterial(mat);
    node(SLING_IDS.bandR)?.setMaterial(mat);
  },
  onFlagColor: (c) => {
    saved.flagColor = c; persist();
    node(PROP_IDS.flag)?.setMaterial(material.pbr({ color: c, roughness: 0.7 }));
  },
  onRangeShot: (ammo, powerPct, angleDeg) => {
    const power = (powerPct / 100) * 16.5;
    const rad = (angleDeg * Math.PI) / 180;
    if (sim.launch(ammo, [-7.4, 1.8, 0], [Math.cos(rad) * power, Math.sin(rad) * power, 0])) audio.cue("launch");
  },
  onMuteToggle: () => { muted = !muted; audio.setMuted(muted); return muted; }
});
hud.setMuted(muted);

/** R, the reset button and the pause card's Restart: replay the level in play (the sandbox in range mode). */
function resetLevel(): void {
  audio.cue("ui-confirm");
  loadLevel(mode === "range" ? SANDBOX_LEVEL.id : level.id);
}

// apply persisted studio colours
{
  const mat = material.pbr({ color: saved.bandColor, roughness: 0.6 });
  node(SLING_IDS.bandL)?.setMaterial(mat);
  node(SLING_IDS.bandR)?.setMaterial(mat);
  node(PROP_IDS.flag)?.setMaterial(material.pbr({ color: saved.flagColor, roughness: 0.7 }));
}

function setMode(m: ModeId): void {
  if (m === "range" && mode !== "range") {
    realLevelId = level.id;
    loadLevel(SANDBOX_LEVEL.id);
  } else if (mode === "range" && m !== "range") {
    loadLevel(realLevelId);
  }
  mode = m;
  hud.setMode(m);
}

// sandbox level for the Trajectory Range — a lone tower + two gulls
const SANDBOX_LEVEL: LevelSpec = {
  id: 99, chapter: 0, slot: 0, name: "Trajectory Range",
  ammo: ["pebble", "pebble", "pebble", "pebble", "pebble", "pebble", "pebble", "pebble"],
  pieces: [
    { x: 7.2, y: 0.17, z: 0, hx: 0.35, hy: 0.17, hz: 0.35, material: "wood" },
    { x: 7.2, y: 0.51, z: 0, hx: 0.35, hy: 0.17, hz: 0.35, material: "wood" },
    { x: 7.2, y: 0.85, z: 0, hx: 0.35, hy: 0.17, hz: 0.35, material: "stone" },
    { x: 7.9, y: 0.3, z: 0.6, hx: 0.3, hy: 0.3, hz: 0.3, material: "wood", visual: "crate" },
    { x: 6.5, y: 0.14, z: -0.7, hx: 0.6, hy: 0.14, hz: 0.16, material: "glass" }
  ],
  gulls: [{ x: 7.2, y: 1.3, z: 0, perch: "perched" }, { x: 7.9, y: 0.9, z: 0.6, perch: "tucked" }],
  windmills: [],
  stars: [1000, 2500, 5000]
};

// -------------------------------------------------------------- events --

function consumeEvents(): void {
  for (const ev of sim.drainEvents()) {
    switch (ev.kind) {
      case "piece-broke": {
        levelScore += ev.points;
        pulseNeighbours(ev.at);
        burst(breakPreset(ev.material), ev.at);
        trauma = Math.min(1.4, trauma + 0.28);
        const sp = projectWorld(ev.at);
        hud.scorePopup(`+${ev.points}`, (sp.x / stageEl.clientWidth) * 100, (sp.y / stageEl.clientHeight) * 100);
        audio.cue(ev.material === "glass" || ev.material === "ice" ? "glass-shatter" : ev.material === "stone" || ev.material === "obsidian" ? "stone-thud" : "wood-crack");
        break;
      }
      case "joint-snapped": {
        levelScore += ev.points;
        break;
      }
      case "gull-squashed": {
        levelScore += ev.points;
        burst(SIEGE_VFX.boarHit, ev.at);
        trauma = Math.min(1.6, trauma + 0.5);
        const sp = projectWorld(ev.at);
        hud.scorePopup(`+${ev.points} SQUASHED!`, (sp.x / stageEl.clientWidth) * 100, (sp.y / stageEl.clientHeight) * 100, true);
        audio.cue("gull-squash");
        if (ev.lastGull) hud.toast("LAST GULL!", "gold");
        break;
      }
      case "gull-scare": {
        hopGull(ev.gull);
        audio.cue("gull-scare");
        break;
      }
      case "shot-fired": {
        hud.toast(`${AMMO[ev.ammo].name} away!`);
        burst(SIEGE_VFX.launchDust, [SLING_REST[0], 0.62, 0]);
        startShotTrail(ev.ammo);
        break;
      }
      case "ability": {
        burst(abilityPreset(ev.ammo), ev.at);
        const sp = projectWorld(ev.at);
        hud.scorePopup(AMMO[ev.ammo].abilityName.toUpperCase() + "!", (sp.x / stageEl.clientWidth) * 100, (sp.y / stageEl.clientHeight) * 100, true);
        break;
      }
      case "windmill-smashed": {
        levelScore += ev.points;
        burst(SIEGE_VFX.windmillSmash, ev.at);
        trauma = Math.min(1.6, trauma + 0.45);
        audio.cue("windmill-snap");
        hud.toast("WINDMILL SMASHED +150");
        break;
      }
      case "shot-settled": {
        stopShotTrail();
        onShotSettled();
        break;
      }
      case "slowmo": {
        if (!REDUCED) hud.toast("SLOW-MO FINISH", "gold");
        break;
      }
    }
  }
}

function onShotSettled(): void {
  if (sim.gullsAlive() === 0) { endLevel(true); return; }
  camState = "aim";
  if (shotsUsed >= level.ammo.length) {
    endLevel(false);
  }
}

function endLevel(won: boolean): void {
  if (resultOpen) return;
  // Trajectory Range shots are free practice: no result card, no stars, no unlocks.
  if (mode === "range") return;
  resultOpen = true;
  camState = "result";
  let bonus = 0;
  if (won) {
    for (let i = shotsUsed; i < level.ammo.length; i += 1) bonus += AMMO[level.ammo[i]!].spareBonus;
    levelScore += bonus;
  }
  const stars = won ? Math.max(1, starRating(levelScore, level.stars)) : 0;
  if (won && (saved.stars[level.id] ?? 0) < stars) {
    saved.stars[level.id] = stars;
    saved.bestLevel = Math.max(saved.bestLevel, level.id + 1);
    persist();
  }
  if (won) audio.cue("level-clear"); else audio.cue("level-fail");
  const hasNext = level.id + 1 < LEVELS.length && isLevelUnlocked(level.id + 1, saved.stars);
  hud.showResult({
    won, stars, score: levelScore, bonus,
    levelName: `${CHAPTERS[level.chapter]!.name} · ${level.slot + 1}. ${level.name}`,
    hasNext
  });
  for (let i = 0; i < stars; i += 1) setTimeout(() => audio.cue("star-chime"), 350 + i * 320);
}

// -------------------------------------------------------------- demo ----

const demo = { phase: "wait" as "wait" | "draw" | "hold" | "fly" | "settle", t: 0, shots: 0, pull: [-1.3, -0.9] as [number, number] };

/** Auto-aim: bisect the draw length whose ballistic arc (same solver as the
 *  preview) lands on the target structure. Deterministic — no randomness. */
function demoAimAt(target: readonly [number, number]): void {
  const g = Math.max(1, Math.abs(sim.level.gravity?.[1] ?? 9.81));
  const phi = 0.72; // pull angle below horizontal → ~45° launch arc
  const land = (len: number): number => {
    const s = solveDraw(-Math.cos(phi) * len, -Math.sin(phi) * len);
    const vx = s.dir[0] * s.speed;
    const vy = s.dir[1] * s.speed;
    const t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (s.pouch[1] - target[1])))) / g;
    return s.pouch[0] + vx * t;
  };
  let hi = PULL_MAX;
  if (land(hi) >= target[0]) {
    let lo = 0.3;
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      if (land(mid) < target[0]) lo = mid; else hi = mid;
    }
  }
  demo.pull = [-Math.cos(phi) * hi, -Math.sin(phi) * hi];
}

function demoTick(dt: number): void {
  demo.t += dt;
  if (resultOpen) {
    if (demo.t > 2.0) {
      demo.t = 0;
      const nxt = (level.id + 1) % LEVELS.length;
      realLevelId = nxt;
      loadLevel(nxt, { announce: false });
    }
    return;
  }
  switch (demo.phase) {
    case "wait": {
      if (demo.t > 0.35 && canAim()) {
        // auto-aim at the first live gull, else any standing piece, else the fort
        const gull = sim.gullList().find((gm) => gm.alive);
        const piece = sim.pieceList().find((p) => p.alive);
        const at = gull?.body.position ?? piece?.body.position ?? [7.2, 1, 0];
        demoAimAt([at[0], at[1]]);
        demo.phase = "draw";
        demo.t = 0;
      }
      break;
    }
    case "draw": {
      // visible ~1s draw: the pouch pulls back-and-down with the preview arc growing
      const k = Math.min(1, demo.t / 1.0);
      const ramp = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      aim.pullX = demo.pull[0] * ramp;
      aim.pullY = demo.pull[1] * ramp;
      aim.state = "dragging";
      camState = "aim";
      if (demo.t >= 1.0) { demo.phase = "hold"; demo.t = 0; }
      break;
    }
    case "hold": {
      // ~0.5s hold at full draw — meter full, arc steady, tiny sway for life
      const wob = 1 + Math.sin(demo.t * 9) * 0.02;
      aim.pullX = demo.pull[0] * wob;
      aim.pullY = demo.pull[1] * wob;
      aim.state = "dragging";
      if (demo.t >= 0.5) {
        fireShot();
        aim.state = "idle";
        demo.phase = "fly";
        demo.t = 0;
      }
      break;
    }
    case "fly":
      if (demo.t > 1.05 && sim.activeProjectile() && !sim.activeProjectile()!.abilityUsed) fireAbility();
      if (!sim.isShotActive() && demo.t > 0.4) { demo.phase = "wait"; demo.t = 0; demo.shots += 1; }
      if (demo.t > 9) { demo.phase = "wait"; demo.t = 0; demo.shots += 1; }
      break;
    default:
      demo.phase = "wait"; demo.t = 0;
  }
}

// --------------------------------------------------------------- evidence --

let frames = 0;
let lastError: string | null = null;

function evidence(): Record<string, unknown> {
  const parts = sim.scoreParts();
  return {
    schema: "slingshot-siege-evidence/1.0",
    appId: "showcase-slingshot-siege",
    route: "/apps/showcase-slingshot-siege/",
    classification: "showcase",
    publicShowcase: true,
    frames,
    mode,
    demo: DEMO || autoPlay,
    seed: SEED,
    level: { id: level.id, chapter: level.chapter, name: level.name, sandbox: mode === "range" },
    cameraState: camState,
    score: Math.round(levelScore),
    starsEarned: starRating(levelScore, level.stars),
    shotsUsed,
    shotsLeft: Math.max(0, level.ammo.length - shotsUsed),
    currentAmmo: currentAmmo(),
    aim: (() => {
      // live draw state — a capture can film one full draw-hold-release cycle off this
      const s = solveDraw(visualPullX, visualPullY);
      return {
        drawing: aim.state === "dragging",
        drawT: Number(s.drawT.toFixed(3)),
        pouchPos: [Number(s.pouch[0].toFixed(3)), Number(s.pouch[1].toFixed(3)), Number(s.pouch[2].toFixed(3))] as [number, number, number],
        power: Number(s.speed.toFixed(2)),
        launchDir: [Number(s.dir[0].toFixed(4)), Number(s.dir[1].toFixed(4)), Number(s.dir[2].toFixed(4))] as [number, number, number]
      };
    })(),
    abilityReady: sim.isShotActive() && !!sim.activeProjectile() && !sim.activeProjectile()!.abilityUsed,
    gulls: { alive: sim.gullsAlive(), total: sim.gullList().length },
    pieces: { alive: sim.piecesAlive(), total: sim.pieceList().length },
    windmills: sim.windmillList().map((w) => ({ broken: w.broken })),
    bodies: sim.totalBodyCount(),
    joints: sim.jointCount(),
    sleepingPct: sim.sleepingPct(),
    simTime: Number(sim.simTime().toFixed(2)),
    slowmo: sim.inSlowmo(),
    physicsBackend: (() => { try { return (sim.world.snapshot().backend as unknown as { active?: string })?.active ?? "rapier"; } catch { return "rapier"; } })(),
    savedStars: Object.values(saved.stars).reduce((a, b) => a + b, 0),
    resultOpen,
    paused,
    audio: audio.state(),
    pools: { blocks: POOL.blocks, crates: POOL.crates, planks: POOL.planks, unassigned: pieceSlots.filter((x) => x === null).length },
    error: lastError
  };
}

function publishEvidence(): void {
  const ev = evidence();
  const w = window as unknown as Record<string, unknown>;
  w.__SLINGSHOT_SIEGE__ = ev;
  // canonical contract: evidence keyed by route id under the shared beacon
  const bucket = (w.__AURA3D_GAME_EVIDENCE__ ??= {}) as Record<string, unknown>;
  bucket["showcase-slingshot-siege"] = ev;
  w.__AURA3D_ROUTE__ = {
    appId: "showcase-slingshot-siege",
    route: "/apps/showcase-slingshot-siege/",
    classification: "showcase",
    publicShowcase: true
  };
}

// -------------------------------------------------------------- controls --

function refreshHud(): void {
  const proj = sim.activeProjectile();
  hud.update({
    mode,
    level,
    score: levelScore,
    ammo: level.ammo,
    shotsUsed,
    ammoLeft: Math.max(0, level.ammo.length - shotsUsed),
    currentAmmo: proj ? proj.ammo : currentAmmo(),
    abilityReady: sim.isShotActive() && !!proj && !proj.abilityUsed,
    gullsLeft: sim.gullsAlive(),
    gullsTotal: sim.gullList().length,
    stars: saved.stars,
    paused,
    muted,
    unlockedCount: LEVELS.filter((l) => isLevelUnlocked(l.id, saved.stars)).length,
    bandColor: saved.bandColor,
    flagColor: saved.flagColor
  });
}

// -------------------------------------------------------------- frame -----

let elapsed = 0;
try {
  assignPieceVisuals();
  camState = "aim";
  syncVisuals();
  syncSling(0);
  updateCamera(0, 0);
  refreshVp();
  hud.setMode(mode);
  hud.setCoach(showCoach());
  hud.showBanner(`${CHAPTERS[level.chapter]!.name}`, `Level ${level.slot + 1} — ${level.name}`);
} catch (err) {
  lastError = String(err);
}

gameApp.onFrame(({ dt }) => {
  if (!appReady) return;
  frames += 1;
  elapsed += dt;
  try {
    // createGameApp already updated the owned input for this frame; a second update() here
    // cleared the pressed edges before they were read, so R/P/M/Q never fired.
    if (input?.pressed("reset")) resetLevel();
    if (input?.pressed("pause")) { paused = !paused; hud.setPaused(paused); if (!paused) hud.setMode(mode); }
    if (input?.pressed("map")) setMode(mode === "map" ? "siege" : "map");

    // Keyboard aiming (WASD / Arrow keys) and launching (Space / Enter / KeyE / KeyF)
    const aimUp = heldKeys.has("KeyW") || heldKeys.has("ArrowUp");
    const aimDown = heldKeys.has("KeyS") || heldKeys.has("ArrowDown");
    const aimLeft = heldKeys.has("KeyA") || heldKeys.has("ArrowLeft");
    const aimRight = heldKeys.has("KeyD") || heldKeys.has("ArrowRight");
    if (canAim() && (aimUp || aimDown || aimLeft || aimRight)) {
      if (aim.pullX === 0 && aim.pullY === 0) {
        aim.pullX = -1.35;
        aim.pullY = -0.52;
      }
      if (aimUp) aim.pullY = Math.max(-1.1, aim.pullY - dt * 1.15);
      if (aimDown) aim.pullY = Math.min(-0.08, aim.pullY + dt * 1.15);
      if (aimLeft) aim.pullX = Math.max(-PULL_MAX, aim.pullX - dt * 1.15);
      if (aimRight) aim.pullX = Math.min(-0.55, aim.pullX + dt * 1.15);
      [aim.pullX, aim.pullY] = clampPull(aim.pullX, aim.pullY);
      aim.state = "dragging";
      camState = "aim";
    }

    const launchPressed =
      justPressedKeys.has("Space") ||
      justPressedKeys.has("Enter") ||
      justPressedKeys.has("KeyE") ||
      justPressedKeys.has("KeyF");
    if (launchPressed) {
      if (sim.isShotActive()) {
        fireAbility();
      } else if (canAim()) {
        if (Math.hypot(aim.pullX, aim.pullY) < 0.35) {
          aim.pullX = -1.45;
          aim.pullY = -0.58;
        }
        fireShot();
        aim.state = "idle";
      }
    } else if (input?.pressed("ability") && sim.isShotActive()) {
      fireAbility();
    }
    justPressedKeys.clear();

    if ((DEMO || autoPlay) && !paused) demoTick(dt);
    if (!paused) {
      sim.update(dt);
      consumeEvents();
      // Visual-only reads of the sim: end the shot ribbon before its node parks below the stage, splash the sea.
      if (shotTrail && !sim.activeProjectile()) stopShotTrail();
      watchSplashes();
      // out-of-ammo + settled watchdog for levels that end without a fresh shot
      if (!sim.isShotActive() && !resultOpen && shotsUsed >= level.ammo.length) {
        settledSinceEmpty += dt;
        if (settledSinceEmpty > 1.6) endLevel(sim.gullsAlive() === 0);
      } else {
        settledSinceEmpty = 0;
      }
      // early-clear: last gull gone while a shot is flying → let the sim settle
      // via its own shot-settled path (slow-mo window) — no early end.
      // Late topple: the last gull falls after the shot already settled, so no
      // shot-settled event is coming. End the level after a short grace period.
      if (!sim.isShotActive() && !resultOpen && mode === "siege" && sim.gullList().length > 0 && sim.gullsAlive() === 0) {
        clearedSinceSettle += dt;
        if (clearedSinceSettle > 1.2) endLevel(true);
      } else {
        clearedSinceSettle = 0;
      }
    }
    if (frames % 30 === 0 && pendingLooks.size > 0) flushPendingLooks();
    updateTweens(dt);
    syncVisuals();
    syncSling(dt);
    updateCamera(dt, elapsed);
    refreshVp();
    if (frames % 2 === 0) updateMiniatureFocus();
    if (frames % 4 === 0) refreshHud();
    if (frames % 10 === 0) publishEvidence();
  } catch (err) {
    lastError = String(err);
    if (frames % 60 === 0) console.error("[slingshot-siege]", err);
  }
});

// render-error / device-loss surface
{
  const errBox = document.getElementById("render-error");
  const errDetail = document.getElementById("render-error-detail");
  const show = (msg: string) => {
    errBox?.classList.remove("is-hidden");
    if (errDetail) errDetail.textContent = msg;
  };
  const hide = () => errBox?.classList.add("is-hidden");
  try { app.onRendererError?.((e) => show(`Renderer error (${e.code}): ${e.message}`)); } catch { /* optional */ }
  try {
    app.onDeviceLost(() => show("The WebGL context was lost — waiting for it to return…"));
    app.onDeviceRestored(() => hide());
  } catch { /* optional */ }
  if (app.deviceLost?.()) show("The WebGL context was lost during startup.");
  void app.ready().then(() => {
    appReady = true;
    document.body.dataset.aura3dReady = "true";
    const diag = app.diagnostics?.();
    const errs = (diag as { errors?: readonly { message?: string }[] } | undefined)?.errors ?? [];
    const fatal = errs.find((e) => (e.message ?? "").length > 0);
    if (fatal?.message) show(`Renderer mount reported: ${fatal.message}`);
    flushPendingLooks();
    publishEvidence();
    refreshHud();
  }).catch(() => show("Renderer mount failed — WebGL2 is required."));
}

// deterministic evidence hooks for capture tooling
const w = window as unknown as Record<string, unknown>;
// canonical §7.2.1 beacon: route + app handle + live state getters
installGameBeacon({ route: "showcase-slingshot-siege" }).publishEvidence({
  get app() { return app; },
  get scene() { return app.scene; },
  get state() { return paused ? "paused" : resultOpen ? "result" : sim.isShotActive() ? "shot-in-flight" : "aiming"; },
  get frame() { return frames; },
  get level() { return level.id; },
  get mode() { return mode; },
  get evidence() { return evidence(); }
});
w.__SS_STATE__ = () => evidence();
w.__SS_PUMP__ = (n = 60) => { for (let i = 0; i < n; i += 1) app.advance(1 / 60); return evidence(); };
w.__SS_FIRE__ = (ammo: AmmoId | undefined = currentAmmo() ?? undefined) => {
  if (ammo) sim.launch(ammo, [-7.4, 1.8, 0], [9.5, 7.5, 0]);
  return evidence();
};
w.__SS_DEBUG__ = {
  /** Resolved GLB material factors of the first `n` piece nodes (SS-4 / SS-16 evidence). */
  blockLooks(n = 8) {
    const out: { piece: number; node: string; material: string; look: string | undefined; baseColor: readonly number[] | null; pending: boolean }[] = [];
    sim.pieceList().slice(0, n).forEach((p, i) => {
      const id = pieceVisuals.get(i)?.nodeId;
      if (!id) return;
      const info = modelMaterials(id)?.inspectMaterials()[0];
      out.push({ piece: i, node: id, material: p.spec.material, look: lookKeys.get(id), baseColor: info ? [...info.baseColorFactor].map((v) => Number(v.toFixed(3))) : null, pending: pendingLooks.has(id) });
    });
    return out;
  },
  project(p: [number, number, number]) { refreshVp(); return projectWorld(p); }
};
w.__SS_LEVEL__ = (id: number) => { realLevelId = Math.min(Math.max(0, id), LEVELS.length - 1); loadLevel(realLevelId); return evidence(); };

publishEvidence();
refreshHud();
