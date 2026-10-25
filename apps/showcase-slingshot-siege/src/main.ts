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
  type AuraRuntimeNodeHandle,
  type AuraSceneSnapshot
} from "@aura3d/engine";
import { AMMO, type AmmoId } from "./game/ammo";
import { siegeAudio } from "./game/audio";
import { SiegeHud, starRating, type ModeId } from "./game/hud";
import { CHAPTERS, isLevelUnlocked, levelById, LEVELS, type LevelSpec } from "./game/levels";
import { MATERIALS } from "./game/materials";
import { SiegeSim, type VisualUpdate } from "./game/sim";
import {
  blockMaterial, blockNodeId, bladeNodeId, buildScene, debrisMaterial, debrisNodeId, dotNodeId,
  gullPartId, millHubNodeId, millPoleNodeId, crateNodeId, barrelNodeId, plankNodeId, projectileNodeId,
  puffMaterial, puffNodeId, PROP_IDS, POOL, SLING_IDS
} from "./game/stage";
import { installBlackFrameGuard } from "@aura3d/debug";
import { installGameBeacon } from "@aura3d/engine/game";

installBlackFrameGuard();

// ---------------------------------------------------------------- params --

const params = new URLSearchParams(location.search);
const DEMO = params.get("demo") === "1" || params.get("demo") === "true";
let autoPlay = params.get("autoplay") === "1" || DEMO;
let appReady = false;
const SEED = (Number(params.get("seed")) || 0x51e9e) >>> 0;
const START_LEVEL = Math.min(Math.max(0, Number(params.get("level")) || 0), LEVELS.length - 1);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("still") === "1";

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
  scene: buildScene(chapter, REDUCED)
});
const app = gameApp.app;
const input = gameApp.input;
const audio = siegeAudio();
const stageEl = document.getElementById("app")!;
const IS_TOUCH = matchMedia("(pointer: coarse)").matches;

// --------------------------------------------------------------- handles --

const H = new Map<string, AuraRuntimeNodeHandle>();
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
  const e = quatToEuler(u.rotation);
  h.setRotation(e[0], e[1], e[2]);
  if (scale !== undefined) h.setScale(scale as number | [number, number, number]);
  h.setVisible(u.visible);
}

/** quat [x,y,z,w] → ZYX-order Euler (the runtime handle's default order). */
function quatToEuler(q: readonly [number, number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const sy = Math.max(-1, Math.min(1, 2 * (w * y - x * z)));
  const ey = Math.asin(sy);
  if (Math.abs(sy) > 0.9999) {
    return [0, ey, Math.atan2(-(x * y - w * z), 1 - 2 * (y * y + z * z)) * -1];
  }
  const ex = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const ez = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [ex, ey, ez];
}

function rotQ(q: readonly [number, number, number, number], v: readonly [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

// ------------------------------------------------------------------- sim --

const sim = new SiegeSim({ level: levelById(START_LEVEL), seed: SEED });
let level = sim.level;
let shotsUsed = 0;
let levelScore = 0;
let resultOpen = false;
let mode: ModeId = "siege";
let paused = false;
let muted = false;
let realLevelId = level.id;
let settledSinceEmpty = 0;

type PieceVisual = { nodeId: string; scale: number | readonly [number, number, number]; pulse: number };
const pieceVisuals = new Map<number, PieceVisual>();
let gullVisualCount = 0;
const tweenList: { id: string; t: number; dur: number; base: readonly [number, number, number]; kind: "squash" | "hop" }[] = [];

function assignPieceVisuals(): void {
  pieceVisuals.clear();
  // Park pooled piece/projectile/debris nodes (never hide static stage/sling/prop nodes).
  for (const [id, h] of H.entries()) {
    if (id.startsWith("v-")) { h.setPosition(0, -120, 0); h.setVisible(false); }
  }
  let crate = 0;
  let barrel = 0;
  let plank = 0;
  sim.pieceList().forEach((p, i) => {
    const want = p.spec.visual ?? "block";
    if (want === "crate" && crate < POOL.crates) {
      const id = crateNodeId(crate);
      pieceVisuals.set(i, { nodeId: id, scale: 0.38, pulse: 0 });
      node(id)?.setScale(0.38).setVisible(true);
      crate += 1;
    } else if (want === "barrel" && barrel < POOL.barrels) {
      const id = barrelNodeId(barrel);
      pieceVisuals.set(i, { nodeId: id, scale: 0.42, pulse: 0 });
      node(id)?.setScale(0.42).setVisible(true);
      barrel += 1;
    } else if (want === "plank" && plank < POOL.planks) {
      const id = plankNodeId(plank);
      const scale: [number, number, number] = [Math.max(0.4, p.spec.hx * 1.1), Math.max(0.4, p.spec.hy * 2.4), Math.max(0.35, p.spec.hz * 0.9)];
      pieceVisuals.set(i, { nodeId: id, scale, pulse: 0 });
      node(id)?.setScale(scale).setVisible(true);
      plank += 1;
    } else {
      const id = blockNodeId(i);
      const scale: [number, number, number] = [Math.max(0.28, p.spec.hx * 1.15), Math.max(0.28, p.spec.hy * 1.45), Math.max(0.28, p.spec.hz * 1.25)];
      pieceVisuals.set(i, { nodeId: id, scale, pulse: 0 });
      const h = node(id);
      if (p.spec.material === "glass" || p.spec.material === "ice") {
        h?.setMaterial(blockMaterial(p.spec.material));
      }
      h?.setScale(scale);
      h?.setVisible(true);
    }
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
  level = levelById(id);
  sim.loadLevel(level);
  shotsUsed = 0;
  levelScore = 0;
  resultOpen = false;
  settledSinceEmpty = 0;
  assignPieceVisuals();
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
let camYaw = 1.42;
let camPitch = 0.26;
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

function canAim(): boolean {
  return mode === "siege" && !paused && !resultOpen && !sim.isShotActive() && currentAmmo() !== null;
}

// world→screen: same view→projection the camera spec implies
let vpMat = new Float32Array(16);
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
  const f = [fx / fl, fy / fl, fz / fl];
  const up = [0, 1, 0];
  const sx = f[1]! * up[2]! - f[2]! * up[1]!;
  const sy2 = f[2]! * up[0]! - f[0]! * up[2]!;
  const sz = f[0]! * up[1]! - f[1]! * up[0]!;
  const sl = Math.hypot(sx, sy2, sz) || 1;
  const s = [sx / sl, sy2 / sl, sz / sl];
  const u = [s[1]! * f[2]! - s[2]! * f[1]!, s[2]! * f[0]! - s[0]! * f[2]!, s[0]! * f[1]! - s[1]! * f[0]!];
  const ex = eye[0] ?? 0; const ey = eye[1] ?? 0; const ez = eye[2] ?? 0;
  // column-major view matrix
  const view = [
    s[0]!, u[0]!, -f[0]!, 0,
    s[1]!, u[1]!, -f[1]!, 0,
    s[2]!, u[2]!, -f[2]!, 0,
    -(s[0]! * ex + s[1]! * ey + s[2]! * ez), -(u[0]! * ex + u[1]! * ey + u[2]! * ez), f[0]! * ex + f[1]! * ey + f[2]! * ez, 1
  ];
  const t = 1 / Math.tan(fov / 2);
  const aspect = w / h;
  const nf = 1 / (0.1 - 400);
  const proj = [
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (400 + 0.1) * nf, -1,
    0, 0, 2 * 400 * 0.1 * nf, 0
  ];
  // vp = proj * view (column-major)
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        proj[r]! * view[c * 4]! + proj[4 + r]! * view[c * 4 + 1]! +
        proj[8 + r]! * view[c * 4 + 2]! + proj[12 + r]! * view[c * 4 + 3]!;
    }
  }
  vpMat = out;
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
      ev.preventDefault();
      return;
    }
  }
  aim.state = "orbiting";
  aim.lastX = ev.clientX; aim.lastY = ev.clientY;
});

const heldKeys = new Set<string>();
const justPressedKeys = new Set<string>();
window.addEventListener("keydown", (ev) => {
  autoPlay = false;
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
    camYaw -= (ev.clientX - aim.lastX) * 0.005;
    camPitch = Math.min(0.9, Math.max(0.08, camPitch + (ev.clientY - aim.lastY) * 0.004));
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
stageEl.addEventListener("pointerup", endPointer);
stageEl.addEventListener("pointercancel", endPointer);

function fireShot(): void {
  const ammo = currentAmmo();
  if (!ammo) return;
  const sol = aimSolution();
  const v: [number, number, number] = [sol.dir[0] * sol.speed, sol.dir[1] * sol.speed, 0];
  if (sol.speed > 0.5 && sim.launch(ammo, sol.pouch, v)) {
    shotsUsed += 1;
    camState = "follow";
    audio.cue("launch");
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
  const base: readonly [number, number, number] = typeof pv.scale === "number" ? [pv.scale, pv.scale, pv.scale] : pv.scale;
  tweenList.push({ id: pv.nodeId, t: 0, dur: 0.24, base, kind: "squash" });
}
function hopGull(g: number): void {
  const id = gullPartId(g, "body");
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
  const e = quatToEuler(rot);
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
  setNodeAnim(bodyId, rec.alive ? "Idle_Loop" : "Contest", rec.alive ? 0.95 + (g % 3) * 0.08 : 1.4);
  const idleBob = rec.alive ? Math.sin(elapsed * 2.8 + g * 1.3) * 0.035 : 0;
  const idleYaw = rec.alive ? Math.sin(elapsed * 1.9 + g * 0.9) * 0.08 : 0;
  for (const spec of GULL_PARTS) {
    const h = node(gullPartId(g, spec.part));
    if (!h) continue;
    const off = rotQ(rot, spec.off);
    h.setPosition(pos[0] + off[0], pos[1] + off[1] - sink + idleBob, pos[2] + off[2]);
    h.setRotation(e[0], e[1] - Math.PI * 0.45 + idleYaw, e[2]);
    h.setScale([spec.base[0] * sxz, spec.base[1] * sy, spec.base[2] * sxz]);
    h.setVisible(rec.alive ? true : !hidden);
  }
}

function syncWindmill(m: number): void {
  const wm = sim.windmillList()[m];
  if (!wm) return;
  const p = wm.rotor.position;
  const rot = wm.rotor.rotation;
  const e = quatToEuler(rot);
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
      const i = Number(u.id.slice(11));
      if (i < POOL.projectiles) {
        const pid = projectileNodeId(i);
        setPose(pid, u, 0.48);
        if (u.visible) setNodeAnim(pid, "Jump_Loop", 1.5);
      }
    } else if (u.id.startsWith("debris-")) {
      const i = Number(u.id.slice(7));
      const d = sim.debrisList()[i];
      if (d) {
        const h = node(debrisNodeId(i));
        if (h) {
          if (d.active) {
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
  // puffs
  for (let i = 0; i < sim.puffList().length; i += 1) {
    const state = sim.puffState(i);
    const h = node(puffNodeId(i));
    if (!h) continue;
    if (!state) { h.setVisible(false); continue; }
    const p = sim.puffList()[i]!;
    h.setMaterial(puffMaterial(state.kind));
    h.setPosition(p.at[0], p.at[1] + p.t * 0.6, p.at[2]);
    h.setScale(state.scale * state.fade);
    h.setVisible(true);
  }
}

// ------------------------------------------------------------------ hud --

const hud = new SiegeHud(document.getElementById("hud") ?? stageEl, {
  onFireAbility: () => fireAbility(),
  onReset: () => { audio.cue("ui-confirm"); loadLevel(realLevelId); },
  onPause: (p) => { paused = p; hud.setPaused(p); if (!p) hud.setMode(mode); },
  onLevelSelect: (id) => { realLevelId = id; mode = "siege"; hud.setMode(mode); loadLevel(id); },
  onModeChange: (m) => setMode(m),
  onResult: (next) => {
    if (next === "next") {
      const nxt = Math.min(level.id + 1, LEVELS.length - 1);
      realLevelId = nxt;
      loadLevel(nxt);
    } else if (next === "retry") {
      loadLevel(level.id);
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
    sim.launch(ammo, [-7.4, 1.8, 0], [Math.cos(rad) * power, Math.sin(rad) * power, 0]);
    audio.cue("launch");
  },
  onMuteToggle: () => { muted = !muted; return muted; }
});

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
        pulsePiece(ev.piece);
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
        break;
      }
      case "ability": {
        const sp = projectWorld(ev.at);
        hud.scorePopup(AMMO[ev.ammo].abilityName.toUpperCase() + "!", (sp.x / stageEl.clientWidth) * 100, (sp.y / stageEl.clientHeight) * 100, true);
        break;
      }
      case "windmill-smashed": {
        levelScore += ev.points;
        trauma = Math.min(1.6, trauma + 0.45);
        audio.cue("windmill-snap");
        hud.toast("WINDMILL SMASHED +150");
        break;
      }
      case "shot-settled": {
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
    hasNext: won ? hasNext || level.id + 1 < LEVELS.length : true
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
  hud.showBanner(`${CHAPTERS[level.chapter]!.name}`, `Level ${level.slot + 1} — ${level.name}`);
} catch (err) {
  lastError = String(err);
}

gameApp.onFrame(({ dt }) => {
  if (!appReady) return;
  frames += 1;
  elapsed += dt;
  try {
    input?.update(dt);
    if (input?.pressed("reset")) { audio.cue("ui-confirm"); loadLevel(level.id); }
    if (input?.pressed("pause")) { paused = !paused; hud.setPaused(paused); }
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
      // out-of-ammo + settled watchdog for levels that end without a fresh shot
      if (!sim.isShotActive() && !resultOpen && shotsUsed >= level.ammo.length) {
        settledSinceEmpty += dt;
        if (settledSinceEmpty > 1.6) endLevel(sim.gullsAlive() === 0);
      } else {
        settledSinceEmpty = 0;
      }
      // early-clear: last gull gone while a shot is flying → let the sim settle
      // via its own shot-settled path (slow-mo window) — no early end.
    }
    updateTweens(dt);
    syncVisuals();
    syncSling(dt);
    updateCamera(dt, elapsed);
    refreshVp();
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
w.__SS_FIRE__ = (ammo: AmmoId = "stone") => {
  sim.launch(ammo, [-7.4, 1.8, 0], [9.5, 7.5, 0]);
  return evidence();
};
w.__SS_LEVEL__ = (id: number) => { realLevelId = Math.min(Math.max(0, id), LEVELS.length - 1); loadLevel(realLevelId); return evidence(); };

publishEvidence();
refreshHud();
