/**
 * §17.3 motion-quality metrics (T1.14). Pure functions over per-frame bone
 * samples — world-space rotation (quat) and position per bone at a fixed
 * cadence (the lane samples at 60 Hz from engine bone sockets; spec: "from
 * engine bone data, not from screenshots").
 *
 * NOT built on `MotionQuality.ts` (E42): that tracker measures motion
 * *existence* (tracksApplied, poseDiversityScore) — these measure quality.
 */

/** Quaternion [x,y,z,w]. */
export type MotionQuat = readonly [number, number, number, number];
/** World position [x,y,z]. */
export type MotionVec3 = readonly [number, number, number];

export interface MotionBoneSample {
  readonly rotation: MotionQuat;
  readonly position: MotionVec3;
}

/** One sampled frame: sim time in seconds → per-bone rotation+position. */
export interface MotionFrame {
  readonly time: number;
  readonly bones: Readonly<Record<string, MotionBoneSample>>;
}

const IDENTITY_QUAT: MotionQuat = [0, 0, 0, 1];

/* ------------------------------------------------------------------ */
/* matrix → {rotation, position}                                       */
/* ------------------------------------------------------------------ */

/**
 * Decompose a column-major 4x4 world matrix into rotation quaternion +
 * translation. Assumes uniform/orthonormal-ish basis (animation palettes are
 * rigid transforms ± uniform scale; any uniform scale is divided out of the
 * rotation columns).
 */
export function motionSampleFromMatrix(m: ArrayLike<number>): MotionBoneSample {
  const position: MotionVec3 = [m[12]!, m[13]!, m[14]!];
  // Column lengths = per-axis scale magnitudes.
  const sx = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!) || 1;
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!) || 1;
  const r00 = m[0]! / sx, r01 = m[4]! / sy, r02 = m[8]! / sz;
  const r10 = m[1]! / sx, r11 = m[5]! / sy, r12 = m[9]! / sz;
  const r20 = m[2]! / sx, r21 = m[6]! / sy, r22 = m[10]! / sz;
  // Standard rotation-matrix → quat.
  const trace = r00 + r11 + r22;
  let x = 0, y = 0, z = 0, w = 1;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    w = (r21 - r12) / s; x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    w = (r02 - r20) / s; x = (r01 + r10) / s; y = s / 4; z = (r12 + r21) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = s / 4;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return { rotation: [x / len, y / len, z / len, w / len], position };
}

/* ------------------------------------------------------------------ */
/* bone filters                                                        */
/* ------------------------------------------------------------------ */

const FINGERISH = /finger|thumb|index|middle|ring|pinky|toe|tip|distal/i;
const LIMBISH = /arm|leg|forearm|upper|lower|hand|foot|shoulder|clavicle|thigh|shin|calf|knee|elbow|wrist|ankle|spine|chest|hips|pelvis|neck|head/i;

/**
 * §17.3's bone subset: humanoid limb and spine bones only — fingers and toes
 * excluded (they flap at high angular speed and are not what "continuity"
 * judges). `mixamo`-style names (mixamorigHips) and plain names both match.
 */
export function isHumanoidMotionBone(bone: string): boolean {
  if (FINGERISH.test(bone)) return false;
  return LIMBISH.test(bone);
}

/* ------------------------------------------------------------------ */
/* angular speed                                                       */
/* ------------------------------------------------------------------ */

/** Shortest-arc angle between two quats, in degrees. */
export function quatAngleDegrees(a: MotionQuat, b: MotionQuat): number {
  const d = Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!);
  const clamped = Math.min(1, d);
  return (2 * Math.acos(clamped) * 180) / Math.PI;
}

export interface BoneAngularSpeed {
  readonly bone: string;
  /** deg/s, frame-to-frame. */
  readonly speeds: readonly number[];
  readonly times: readonly number[]; // midpoint time of each speed sample
}

/** Per-bone angular-speed series over the sampled window. */
export function boneAngularSpeeds(
  frames: readonly MotionFrame[],
  isBone: (bone: string) => boolean = isHumanoidMotionBone
): BoneAngularSpeed[] {
  const byBone = new Map<string, { speeds: number[]; times: number[]; lastQ?: MotionQuat; lastT?: number }>();
  for (const frame of frames) {
    for (const [bone, sample] of Object.entries(frame.bones)) {
      if (!isBone(bone)) continue;
      let series = byBone.get(bone);
      if (series === undefined) {
        series = { speeds: [], times: [] };
        byBone.set(bone, series);
      }
      if (series.lastQ !== undefined && series.lastT !== undefined) {
        const dt = frame.time - series.lastT;
        if (dt > 0) {
          series.speeds.push(quatAngleDegrees(series.lastQ, sample.rotation) / dt);
          series.times.push(series.lastT + dt / 2);
        }
      }
      series.lastQ = sample.rotation;
      series.lastT = frame.time;
    }
  }
  return [...byBone.entries()].map(([bone, s]) => ({ bone, speeds: s.speeds, times: s.times }));
}

/** Max deg/s across all bones inside [start, end] (0 when empty). */
export function maxAngularSpeedInWindow(frames: readonly MotionFrame[], start: number, end: number, isBone = isHumanoidMotionBone): number {
  let max = 0;
  for (const series of boneAngularSpeeds(frames, isBone)) {
    for (let i = 0; i < series.speeds.length; i += 1) {
      const t = series.times[i]!;
      if (t >= start && t <= end) max = Math.max(max, series.speeds[i]!);
    }
  }
  return max;
}

/* ------------------------------------------------------------------ */
/* §17.3 — transition continuity C                                     */
/* ------------------------------------------------------------------ */

export interface ContinuityResult {
  /** C = maxAngularSpeed / max(baseline, 90°/s). */
  readonly continuity: number;
  readonly maxAngularSpeedDegPerSec: number;
  readonly baselineDegPerSec: number;
}

/**
 * C over the transition window [t₀ − windowBefore, t₀ + windowAfter]:
 * the max per-bone angular speed (humanoid limb+spine only) divided by the max
 * per-bone angular speed of either clip played alone over the same phase range
 * — supplied via `baselineWindows` (frame ranges of pure clip playback) or an
 * explicit `baselineDegPerSec`. Denominator floored at 90°/s (§17.3).
 */
export function transitionContinuity(
  frames: readonly MotionFrame[],
  options: {
    readonly transitionTime: number;
    readonly windowBefore?: number;
    readonly windowAfter?: number;
    /** Frame ranges where a single clip plays alone (baseline measurement). */
    readonly baselineWindows?: readonly (readonly [number, number])[];
    readonly baselineDegPerSec?: number;
    readonly isBone?: (bone: string) => boolean;
  }
): ContinuityResult {
  const isBone = options.isBone ?? isHumanoidMotionBone;
  const start = options.transitionTime - (options.windowBefore ?? 0.1);
  const end = options.transitionTime + (options.windowAfter ?? 0.3);
  const maxAngularSpeed = maxAngularSpeedInWindow(frames, start, end, isBone);

  let baseline = options.baselineDegPerSec ?? 0;
  for (const [wStart, wEnd] of options.baselineWindows ?? []) {
    baseline = Math.max(baseline, maxAngularSpeedInWindow(frames, wStart, wEnd, isBone));
  }
  baseline = Math.max(baseline, 90); // §17.3 floor: idle→idle cannot divide by ~0
  return {
    continuity: maxAngularSpeed / baseline,
    maxAngularSpeedDegPerSec: maxAngularSpeed,
    baselineDegPerSec: baseline
  };
}

/* ------------------------------------------------------------------ */
/* §17.3 — foot slide                                                  */
/* ------------------------------------------------------------------ */

export interface FootContactPhase {
  readonly bone: string;
  readonly startTime: number;
  readonly endTime: number;
  /** Max horizontal (XZ) displacement from the phase's first position, metres. */
  readonly slideM: number;
}

export interface FootSlideResult {
  readonly maxSlideM: number;
  readonly phases: readonly FootContactPhase[];
}

/**
 * World displacement of a foot bone while its contact flag is set. Contact is
 * a clip footstep event (`contactWindows`) or inferred: foot height < 3 cm AND
 * horizontal speed < 0.1 m/s. §17.3 pass bars: ≤ 2 cm walk / ≤ 3 cm run.
 */
export function footSlide(
  frames: readonly MotionFrame[],
  options: {
    readonly footBones: readonly string[];
    readonly contactHeightM?: number;
    readonly contactSpeedMps?: number;
    /** Explicit contact windows per bone — overrides the inferred rule. */
    readonly contactWindows?: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  }
): FootSlideResult {
  const heightM = options.contactHeightM ?? 0.03;
  const speedMps = options.contactSpeedMps ?? 0.1;
  const phases: FootContactPhase[] = [];

  for (const bone of options.footBones) {
    const explicit = options.contactWindows?.[bone];
    let inContact = false;
    let phaseStart = 0;
    let phaseStartPos: readonly [number, number] = [0, 0];
    let slide = 0;
    let last: { readonly p: MotionVec3; readonly t: number } | undefined;

    const closePhase = (t: number) => {
      if (inContact) phases.push({ bone, startTime: phaseStart, endTime: t, slideM: slide });
      inContact = false;
      slide = 0;
    };

    for (const frame of frames) {
      const sample = frame.bones[bone];
      if (sample === undefined) { closePhase(frame.time); last = undefined; continue; }
      const p = sample.position;
      const horizontalSpeed = last === undefined
        ? 0
        : Math.hypot(p[0] - last.p[0], p[2] - last.p[2]) / Math.max(1e-6, frame.time - last.t);
      last = { p, t: frame.time };

      const contact = explicit !== undefined
        ? explicit.some(([s, e]) => frame.time >= s && frame.time <= e)
        : p[1] <= heightM && horizontalSpeed <= speedMps;

      if (contact && !inContact) {
        inContact = true;
        phaseStart = frame.time;
        phaseStartPos = [p[0], p[2]];
        slide = 0;
      } else if (contact) {
        slide = Math.max(slide, Math.hypot(p[0] - phaseStartPos[0], p[2] - phaseStartPos[1]));
      } else {
        closePhase(frame.time);
      }
    }
    closePhase(frames.at(-1)?.time ?? phaseStart);
  }
  return { maxSlideM: phases.reduce((m, p) => Math.max(m, p.slideM), 0), phases };
}

/* ------------------------------------------------------------------ */
/* §17.3 — locomotion phase error                                      */
/* ------------------------------------------------------------------ */

export interface LocomotionPhaseSample {
  readonly time: number;
  readonly a: { readonly phase: number; readonly weight: number };
  readonly b: { readonly phase: number; readonly weight: number };
}

export interface LocomotionPhaseErrorResult {
  /** Max |phaseA − phaseB| (circular, in [0, 0.5]) over frames where both weights pass the bar. */
  readonly maxPhaseError: number;
  readonly meanPhaseError: number;
  readonly comparedFrames: number;
}

/**
 * Normalised-phase difference between two locomotion actions while both are
 * weighted (default bar weight > 0.05). Phase is clip-local time normalised by
 * duration (caller computes — `animationState().activeActions` exposes `time`
 * and the clip durations resolve through `resolveAnimationClips`). §17.3 pass
 * bar: ≤ 1% of the cycle.
 */
export function locomotionPhaseError(
  samples: readonly LocomotionPhaseSample[],
  options: { readonly minWeight?: number } = {}
): LocomotionPhaseErrorResult {
  const minWeight = options.minWeight ?? 0.05;
  let max = 0;
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    if (s.a.weight <= minWeight || s.b.weight <= minWeight) continue;
    const raw = Math.abs(((s.a.phase % 1) + 1) % 1 - ((s.b.phase % 1) + 1) % 1);
    const err = Math.min(raw, 1 - raw); // circular phase distance in cycles
    max = Math.max(max, err);
    sum += err;
    n += 1;
  }
  return { maxPhaseError: max, meanPhaseError: n === 0 ? 0 : sum / n, comparedFrames: n };
}

/* ------------------------------------------------------------------ */
/* sampling helper                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build one MotionFrame from a socket reader — the adapter's per-frame hook:
 * `motionFrame(t, boneNames, (bone) => socket(bone).worldMatrix())`.
 */
export function motionFrame(
  time: number,
  boneNames: readonly string[],
  worldMatrix: (bone: string) => ArrayLike<number> | undefined
): MotionFrame {
  const bones: Record<string, MotionBoneSample> = {};
  for (const bone of boneNames) {
    const m = worldMatrix(bone);
    if (m !== undefined) bones[bone] = motionSampleFromMatrix(m);
  }
  return { time, bones };
}

export { IDENTITY_QUAT as MOTION_IDENTITY_QUAT };
