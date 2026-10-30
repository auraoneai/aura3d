/**
 * Cross Hop diorama presentation helpers (GU47 WP-24). Pure functions of read-only run values: the camera rig
 * (CH47-11), the tilt-shift focus band (CH47-05), the lamp pool slots (CH47-02), the verge kit scatter (CH47-15),
 * hop squash and stretch (CH47-12) and the ambient emitter per theme (CH47-14). Nothing here feeds the sim.
 */
import { COL_W, LANE_D, STRIP_W } from "./themes";
import type { CrossHopAmbient } from "./look";

/** High diorama camera (CH47-11): y 9.5, back 8.5, target 3.0 ahead, fov 32. */
export const CAM_DIORAMA = {
  y: 9.5,
  back: 8.5,
  ahead: 3.0,
  targetY: 0.4,
  fov: 32,
  /** Exponential follow rate (1/s) for x and z. */
  follow: 6,
  /** Crane-down intro: extra height at run start and its length in seconds. */
  introLift: 6,
  introSeconds: 1.4,
  /** Theme lift: extra height on a theme change and its length. */
  themeLift: 1.6,
  themeSeconds: 0.9,
  /** Death push-in: fraction of the camera distance removed, and its length. */
  deathPush: 0.25,
  deathSeconds: 0.6
} as const;

function smooth01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export interface CameraInputs {
  /** Followed (damped) player x and z. */
  readonly x: number;
  readonly z: number;
  /** Seconds since the run started, since the last theme change, since death (Infinity: none). */
  readonly sinceStart: number;
  readonly sinceTheme: number;
  readonly sinceDeath: number;
  readonly reducedMotion: boolean;
}

export interface DioramaPose { readonly position: [number, number, number]; readonly target: [number, number, number]; readonly fov: number }

/**
 * The diorama camera pose. Intro crane, theme lift and death push-in are eased offsets; reduced motion turns
 * every one of them into a cut (the offsets are 0), PRD §6.3.
 */
export function dioramaPose(i: CameraInputs): DioramaPose {
  const c = CAM_DIORAMA;
  const motion = i.reducedMotion ? 0 : 1;
  const intro = motion * c.introLift * (1 - smooth01(i.sinceStart / c.introSeconds));
  const lift = motion * c.themeLift * Math.sin(Math.PI * smooth01(i.sinceTheme / c.themeSeconds));
  const push = motion * c.deathPush * smooth01(i.sinceDeath / c.deathSeconds);
  const y = c.y + intro + lift;
  const target: [number, number, number] = [i.x, c.targetY, i.z - c.ahead];
  const back: [number, number, number] = [i.x, y, i.z + c.back];
  const position: [number, number, number] = [
    back[0] + (target[0] - back[0]) * push,
    back[1] + (target[1] - back[1]) * push,
    back[2] + (target[2] - back[2]) * push
  ];
  return { position, target, fov: c.fov };
}

/** Frame-rate independent exponential follow toward `to`. */
export function damp(from: number, to: number, rate: number, dt: number): number {
  return to + (from - to) * Math.exp(-rate * Math.max(0, dt));
}

/**
 * Screen y (0 top .. 1 bottom, the tilt-shift `bandCenter` unit) of a world point for a camera that looks from
 * `position` at `target` with vertical `fovDeg` (roll 0). Returns null behind the camera.
 */
export function screenY(point: readonly number[], position: readonly number[], target: readonly number[], fovDeg: number): number | null {
  const f = [target[0]! - position[0]!, target[1]! - position[1]!, target[2]! - position[2]!];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!) || 1;
  const fw = [f[0]! / fl, f[1]! / fl, f[2]! / fl];
  // right = fw x up, up' = right x fw
  const r = [fw[2]! * -1, 0, fw[0]!];
  const rl = Math.hypot(r[0]!, r[2]!) || 1;
  const rn = [r[0]! / rl, 0, r[2]! / rl];
  const u = [rn[1]! * fw[2]! - rn[2]! * fw[1]!, rn[2]! * fw[0]! - rn[0]! * fw[2]!, rn[0]! * fw[1]! - rn[1]! * fw[0]!];
  const d = [point[0]! - position[0]!, point[1]! - position[1]!, point[2]! - position[2]!];
  const depth = d[0]! * fw[0]! + d[1]! * fw[1]! + d[2]! * fw[2]!;
  if (depth <= 1e-4) return null;
  const up = d[0]! * u[0]! + d[1]! * u[1]! + d[2]! * u[2]!;
  const ndc = up / depth / Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(0, Math.min(1, 0.5 - ndc / 2));
}

/** Hop squash and stretch (CH47-12): [scaleXZ, scaleY] for hop progress t in [0,1]; volume kept roughly constant. */
export function hopScale(t: number, hopping: boolean, landSince: number, reducedMotion: boolean): [number, number] {
  const k = reducedMotion ? 0.3 : 1;
  let sy = 1;
  if (hopping) {
    const x = Math.max(0, Math.min(1, t));
    if (x < 0.12) sy = 1 - 0.22 * (x / 0.12) * k;               // anticipation squash, to 0.78
    else if (x < 0.5) sy = 1 - 0.22 * k + (0.37 * k) * ((x - 0.12) / 0.38); // stretch at take-off, to 1.15
    else sy = 1 + 0.15 * k - 0.15 * k * ((x - 0.5) / 0.5);       // relax to 1 at apex-to-landing
  } else if (landSince >= 0 && landSince < 0.12) {
    const x = landSince / 0.12;
    sy = 1 - 0.2 * k * Math.sin(Math.PI * x);                    // landing squash, to 0.8
  }
  sy = Math.max(0.75, Math.min(1.15, sy));
  return [1 / Math.sqrt(sy), sy];
}

/** Yaw for a hop direction; the drawn yaw turns toward it at <= `maxStep` rad per frame (70 ms turns, CH47-12). */
export const HOP_YAW: Readonly<Record<string, number>> = { fwd: Math.PI, back: 0, left: -Math.PI / 2, right: Math.PI / 2 };
export const TURN_SECONDS = 0.07;
export function turnToward(current: number, goal: number, dt: number): number {
  let delta = goal - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxStep = Math.min(Math.PI / 4, (Math.PI / 2) * (Math.max(0, dt) / TURN_SECONDS));
  return current + Math.max(-maxStep, Math.min(maxStep, delta));
}

/** Pooled lamp slots (CH47-02): `count` posts alternating sides every other row from `fromRow`, just beyond the strip edge. */
export const LAMP_X = STRIP_W / 2 + 0.9;
export function lampSlots(fromRow: number, count: number): { row: number; x: number; z: number; y: number }[] {
  const out: { row: number; x: number; z: number; y: number }[] = [];
  const start = Math.max(0, fromRow - (fromRow % 2));
  for (let i = 0; i < count; i++) {
    const row = start + i * 2;
    const side = i % 2 === 0 ? -1 : 1;
    out.push({ row, x: side * LAMP_X, z: -row * LANE_D, y: 2.1 });
  }
  return out;
}

/** Verge kit scatter (CH47-15). No item stands within |x| < KIT_MIN_X. */
export const KIT_MIN_X = 17.5;
export const KIT_PER_SIDE = 3;
export interface KitSlot { readonly x: number; readonly z: number; readonly scale: number; readonly variant: number; readonly yaw: number }
function hash(n: number): number {
  const h = Math.sin(n * 12.9898) * 43758.5453;
  return h - Math.floor(h);
}
/** Deterministic kit slots for one row: KIT_PER_SIDE per verge, 3x the 4.6 tree density. */
export function kitSlots(row: number, seed: number): KitSlot[] {
  const out: KitSlot[] = [];
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < KIT_PER_SIDE; k++) {
      const h1 = hash(row * 31.7 + k * 7.3 + side * 3.1 + seed * 0.013);
      const h2 = hash(row * 17.1 + k * 3.9 - side * 5.7 + seed * 0.007);
      const x = side * (KIT_MIN_X + 0.6 + k * 2.6 + h1 * 1.8);
      out.push({ x, z: -row * LANE_D + (h2 - 0.5) * LANE_D * 0.8, scale: 0.75 + h2 * 0.6, variant: Math.floor(h1 * 3) % 3, yaw: h2 * Math.PI * 2 });
    }
  }
  return out;
}
/** Distance LOD for kit slots: beyond this many rows from the player, only the first slot per side stays. */
export const KIT_LOD_ROWS = 14;
export function kitLod(slotIndex: number, rowDistance: number): boolean {
  if (rowDistance <= KIT_LOD_ROWS) return true;
  return slotIndex % KIT_PER_SIDE === 0;
}

/** Theme ambient emitter (CH47-14); null = none (Downtown). Counts halve under reduced motion. */
export interface AmbientEmitter {
  readonly name: string; readonly rate: number; readonly maxParticles: number; readonly color: string;
  readonly sprite: "soft-dot" | "glow" | "rain-streak" | "spark-streak";
  readonly lifetime: [number, number]; readonly speed: [number, number]; readonly size: [number, number];
  readonly gravity: number; readonly shapeSize: [number, number, number]; readonly offset: [number, number, number];
  readonly blend: "additive" | "alpha";
}
export function ambientEmitter(kind: CrossHopAmbient, reducedMotion: boolean): AmbientEmitter | null {
  const h = reducedMotion ? 0.5 : 1;
  const base = { shapeSize: [STRIP_W, 3, LANE_D * 18] as [number, number, number], offset: [0, 1.6, -8] as [number, number, number] };
  switch (kind) {
    case "none": return null;
    case "pollen": return { ...base, name: "crosshop pollen", rate: 30 * h, maxParticles: Math.round(220 * h), color: "#fff2b8", sprite: "soft-dot", lifetime: [4, 7], speed: [0.05, 0.25], size: [0.03, 0.06], gravity: 0.02, blend: "alpha" };
    case "fireflies": return { ...base, name: "crosshop fireflies", rate: 18 * h, maxParticles: Math.round(140 * h), color: "#ffe37a", sprite: "glow", lifetime: [3, 6], speed: [0.1, 0.35], size: [0.05, 0.09], gravity: 0, blend: "additive", offset: [0, 0.8, -8] };
    case "embers": return { ...base, name: "crosshop embers", rate: 40 * h, maxParticles: Math.round(300 * h), color: "#ff7a2a", sprite: "spark-streak", lifetime: [1.5, 3], speed: [0.4, 1.1], size: [0.03, 0.07], gravity: 0.9, blend: "additive", offset: [0, 0.3, -8] };
    case "rain": return { ...base, name: "crosshop rain", rate: 260 * h, maxParticles: Math.round(1200 * h), color: "#9fc4ff", sprite: "rain-streak", lifetime: [0.5, 0.8], speed: [7, 9], size: [0.02, 0.04], gravity: -9, blend: "alpha", shapeSize: [STRIP_W, 0.5, LANE_D * 18], offset: [0, 7, -8] };
    case "confetti": return { ...base, name: "crosshop confetti", rate: 26 * h, maxParticles: Math.round(200 * h), color: "#ff9ed2", sprite: "soft-dot", lifetime: [3, 5], speed: [0.2, 0.6], size: [0.04, 0.08], gravity: -0.3, blend: "alpha", offset: [0, 4, -8] };
  }
}

/** Column x for a column index (the sim's spacing). */
export function colX(col: number): number { return col * COL_W; }
