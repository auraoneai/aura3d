/**
 * `stage.ts` — engine-free staging shared by both `prd08-motion-*` adapters
 * (C-30: identical scripted inputs on the Aura3D and three.js sides).
 *
 * Owns, per driver: the fixed sim step, the strip sample schedule, the
 * collider boxes and camera rail the scene geometry and rigs agree on, the
 * scripted camera subject (position/velocity/forward/bank from
 * `subject-scripts.ts`), the strip recorder (12 tiles off the live canvas) and
 * the per-step trajectory metrics `prd08 motion-report` renders.
 *
 * No engine imports: the three adapter and the Aura adapter both consume this
 * module unchanged.
 */
import { MOTION_RAIL_POINTS, subjectFrame, type MotionDriver, type SubjectFrame } from "./subject-scripts";

export type Vec3 = readonly [number, number, number];

/** Fixed sim step per driver — pacing runs the 120 Hz cadence (S3). */
export function stepSeconds(driver: MotionDriver): number {
  return driver === "pacing" ? 1 / 120 : 1 / 60;
}

/** Column footprint for the collision scene (x/z from the script, y 0..3). */
export const MOTION_COLLIDER_SIZE: Vec3 = [0.6, 3, 0.6];

export interface MotionColliderBox {
  readonly id: string;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Collider boxes from the script's `extras.colliders` (column x/z, y 0..3). */
export function colliderBoxes(): readonly MotionColliderBox[] {
  const flat = (subjectFrame("collision", 0).extras?.colliders ?? []) as readonly number[];
  const boxes: MotionColliderBox[] = [];
  const [sx, sy, sz] = MOTION_COLLIDER_SIZE;
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const center: Vec3 = [flat[i]!, sy / 2, flat[i + 2]!];
    boxes.push({
      id: `column-${boxes.length}`,
      center,
      size: MOTION_COLLIDER_SIZE,
      min: [center[0] - sx / 2, 0, center[2] - sz / 2],
      max: [center[0] + sx / 2, sy, center[2] + sz / 2]
    });
  }
  return boxes;
}

/**
 * Camera rail for `prd08-motion-rail-shot`: the S11 closed 6-knot control
 * polygon (`MOTION_RAIL_POINTS`) scaled ×1.8 on XZ and lifted 1.2 so the dolly
 * runs outside the subject's loop (same topology, same knot count).
 */
export const CAMERA_RAIL_POINTS: readonly Vec3[] = MOTION_RAIL_POINTS.map((p) => [p[0] * 1.8, p[1] + 1.2, p[2] * 1.8] as Vec3);
export const RAIL_LOOP_SECONDS = Number(subjectFrame("rail", 0).extras?.railLoopSeconds ?? 12);

/** Collision arm yaw offset (rad): the eye trails behind-left so the arm
 *  sweeps the z=-0.9 column row (the probe must pull in). */
export const COLLISION_ARM_YAW_OFFSET = 0.6;

/** Static camera poses for the drivers that do not follow (impact, pacing). */
export const STATIC_POSES: Readonly<Record<"impact" | "pacing", { readonly position: Vec3; readonly target: Vec3; readonly fov: number }>> = {
  impact: { position: [0, 1.6, 5], target: [0, 0.6, 0], fov: 50 },
  pacing: { position: [0, 3, 11], target: [0, 0.5, 0], fov: 55 }
};

/** Impact feel parameters (same numbers drive Aura `camera.shake/punch` and the three reference). */
export const IMPACT = { trauma: 0.8, punchFov: -6, attack: 0.03, hold: 0.05, release: 0.3 } as const;

export interface MotionSubject {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly forward: Vec3;
  /** Bank (rad about forward) — flight only, else 0. */
  readonly bank: number;
  /** Heading yaw for the rendered hero box (rad about +Y). */
  readonly yaw: number;
  readonly frame: SubjectFrame;
}

const yawOf = (v: Vec3): number => Math.atan2(v[0], v[2]);

/** Scripted camera subject at `t` — the single input both engines' rigs read. */
export function motionSubject(driver: MotionDriver, t: number, previousYaw = 0): MotionSubject {
  const frame = subjectFrame(driver, t);
  const v = frame.velocity;
  const speed = Math.hypot(v[0], v[2]);
  const yaw = speed > 1e-4 ? yawOf(v) : previousYaw;
  const armYaw = driver === "collision" ? yaw - COLLISION_ARM_YAW_OFFSET : yaw;
  const forward: Vec3 = [Math.sin(armYaw), 0, Math.cos(armYaw)];
  const bank = driver === "flight" ? Number(frame.extras?.bank ?? 0) : 0;
  return { position: frame.subject, velocity: v, forward, bank, yaw, frame };
}

export interface MotionSchedule {
  readonly dt: number;
  readonly steps: number;
  /** Step index (1-based, after the step) at which each strip tile is grabbed. */
  readonly stripSteps: readonly number[];
  readonly stripTimes: readonly number[];
}

/** Steps 0→`time` at the driver's fixed dt; the strip ends on the capture frame. */
export function motionSchedule(driver: MotionDriver, time: number, strip: { readonly frames: number; readonly intervalMs: number }): MotionSchedule {
  const dt = stepSeconds(driver);
  const steps = Math.max(1, Math.round(time / dt));
  const stripSteps: number[] = [];
  for (let k = 0; k < strip.frames; k += 1) {
    const at = time - (strip.frames - 1 - k) * (strip.intervalMs / 1000);
    stripSteps.push(Math.min(steps, Math.max(1, Math.round(at / dt))));
  }
  return { dt, steps, stripSteps, stripTimes: stripSteps.map((s) => s * dt) };
}

/** One per-step trajectory sample (rounded to keep ready.json small). */
export interface MotionSample {
  readonly t: number;
  readonly subject: Vec3;
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly rollDeg: number;
  /** Camera-layer energy (trauma/punch); 0 for drivers without feel. */
  readonly energy: number;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r4v = (v: Vec3): Vec3 => [r4(v[0]), r4(v[1]), r4(v[2])];

export function sample(t: number, subject: Vec3, eye: Vec3, target: Vec3, fov: number, rollRad: number, energy: number): MotionSample {
  return { t: r4(t), subject: r4v(subject), eye: r4v(eye), target: r4v(target), fov: r4(fov), rollDeg: r4((rollRad * 180) / Math.PI), energy: r4(energy) };
}

export interface MotionMetrics {
  readonly samples: number;
  /** Max eye displacement in one step (world units). */
  readonly maxEyeStep: number;
  /** Mean eye speed (u/s). */
  readonly meanEyeSpeed: number;
  /** Max step-to-step eye-speed change over mean speed — velocity hitch (lower is smoother). */
  readonly hitchRatio: number;
  readonly fovRange: readonly [number, number];
  readonly rollRangeDeg: readonly [number, number];
  readonly eyeToSubject: { readonly min: number; readonly mean: number; readonly max: number };
  /** Steps whose eye sits inside a collider box (collision scene: must be 0). */
  readonly insideColliderSteps: number;
  readonly energyPeak: number;
  readonly energyEnd: number;
  /** Coefficient of variation of per-present subject displacement (S3:
   *  ≈0 when presents are evenly interpolated, ≈1 for a 60 Hz sim shown
   *  un-interpolated at 120 Hz). */
  readonly subjectStepCv: number;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function insideAnyCollider(p: Vec3, boxes: readonly MotionColliderBox[]): boolean {
  return boxes.some((b) => p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1] && p[2] > b.min[2] && p[2] < b.max[2]);
}

export function motionMetrics(samples: readonly MotionSample[], dt: number, boxes: readonly MotionColliderBox[] = []): MotionMetrics {
  const speeds: number[] = [];
  let maxEyeStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const d = dist(samples[i]!.eye, samples[i - 1]!.eye);
    maxEyeStep = Math.max(maxEyeStep, d);
    speeds.push(d / dt);
  }
  const meanEyeSpeed = speeds.length ? speeds.reduce((s, x) => s + x, 0) / speeds.length : 0;
  let maxJump = 0;
  // Skip the first two steps: rigs initialise there (snap, then spring).
  for (let i = 3; i < speeds.length; i += 1) maxJump = Math.max(maxJump, Math.abs(speeds[i]! - speeds[i - 1]!));
  const fovs = samples.map((s) => s.fov);
  const rolls = samples.map((s) => s.rollDeg);
  const ds = samples.map((s) => dist(s.eye, s.subject));
  const energies = samples.map((s) => s.energy);
  const subjectSteps: number[] = [];
  for (let i = 1; i < samples.length; i += 1) subjectSteps.push(dist(samples[i]!.subject, samples[i - 1]!.subject));
  const stepMean = subjectSteps.length ? subjectSteps.reduce((s, x) => s + x, 0) / subjectSteps.length : 0;
  const stepVar = subjectSteps.length ? subjectSteps.reduce((s, x) => s + (x - stepMean) ** 2, 0) / subjectSteps.length : 0;
  return {
    samples: samples.length,
    maxEyeStep: r4(maxEyeStep),
    meanEyeSpeed: r4(meanEyeSpeed),
    hitchRatio: meanEyeSpeed > 1e-6 ? r4(maxJump / meanEyeSpeed) : 0,
    fovRange: [r4(Math.min(...fovs)), r4(Math.max(...fovs))],
    rollRangeDeg: [r4(Math.min(...rolls)), r4(Math.max(...rolls))],
    eyeToSubject: { min: r4(Math.min(...ds)), mean: r4(ds.reduce((s, x) => s + x, 0) / Math.max(1, ds.length)), max: r4(Math.max(...ds)) },
    insideColliderSteps: samples.filter((s) => insideAnyCollider(s.eye, boxes)).length,
    energyPeak: r4(Math.max(0, ...energies)),
    energyEnd: r4(energies.at(-1) ?? 0),
    subjectStepCv: stepMean > 1e-9 ? r4(Math.sqrt(stepVar) / stepMean) : 0
  };
}

/** 12-tile strip off the live WebGL canvas (both engines keep preserveDrawingBuffer). */
export class StripRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private grabbed = 0;
  readonly columns = 4;
  readonly tileWidth = 320;
  readonly tileHeight = 180;
  private readonly lumaVariance: number[] = [];

  constructor(readonly frames: number) {
    this.canvas = document.createElement("canvas");
    const rows = Math.ceil(frames / this.columns);
    this.canvas.width = this.columns * this.tileWidth;
    this.canvas.height = rows * this.tileHeight;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("StripRecorder: 2d context unavailable");
    this.ctx = ctx;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  grab(source: HTMLCanvasElement): void {
    if (this.grabbed >= this.frames) return;
    const x = (this.grabbed % this.columns) * this.tileWidth;
    const y = Math.floor(this.grabbed / this.columns) * this.tileHeight;
    this.ctx.drawImage(source, x, y, this.tileWidth, this.tileHeight);
    const data = this.ctx.getImageData(x, y, this.tileWidth, this.tileHeight).data;
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / n;
    this.lumaVariance.push(r4(sumSq / n - mean * mean));
    this.grabbed += 1;
  }

  result(): { readonly frames: number; readonly columns: number; readonly tile: readonly [number, number]; readonly lumaVariance: readonly number[]; readonly dataUrl: string } {
    return {
      frames: this.grabbed,
      columns: this.columns,
      tile: [this.tileWidth, this.tileHeight],
      lumaVariance: this.lumaVariance,
      dataUrl: this.canvas.toDataURL("image/png")
    };
  }
}
