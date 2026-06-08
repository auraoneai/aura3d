// Inertialization: a critically-damped decay of the *pose offset* captured at the moment a
// transition begins, added on top of the destination pose. Unlike a linear crossfade (which
// interpolates two clips by a straight ramp and visibly "snaps" its slope at both ends), an
// inertialized transition starts the destination pose already offset by the source pose's
// difference (and optionally its velocity), then lets that offset decay smoothly to zero. The
// result is C1-continuous at the transition boundary: no velocity discontinuity, so motion
// "carries through" the swap instead of dissolving.
//
// This module is pure and deterministic: no `Date.now()`, no `Math.random()`, no engine/render
// imports. Given the same inputs and the same `t` it always returns the same result, so it is
// safe inside deterministic replay (combat sims) and reproducible tests.
//
// Two layers are provided:
//   1. Scalar / vector / quaternion offset primitives (`inertializedScalar`, ...).
//   2. A pose-space `Inertializer` that records a transition between two `AnimationValue` poses
//      and samples the inertialized pose at a given time.
// Plus a weight-domain helper (`inertializedTransitionWeight`) for consumers that blend two
// clips by weight (e.g. the fighter adapter / `applyClips` call sites) rather than by pose.

import {
  cloneAnimationValue,
  normalizeQuat,
  type AnimationValue,
  type Quat,
  type Vec3
} from "./Keyframe.js";

const LN2 = Math.log(2);

/** Default transition half-life in seconds. ~0.12s reads as a snappy-but-smooth swap. */
export const DEFAULT_INERTIALIZATION_HALF_LIFE = 0.12;

/**
 * Decay rate `k` (1/seconds) for a given half-life. The critically-damped envelope used here is
 * `(1 + k·t)·e^(−k·t)`; because of the `(1 + k·t)` term the offset is not exactly halved at
 * `t = halfLife` (it crosses 0.5 a little later) — `halfLife` parameterizes the e-folding decay
 * rate, not a literal 50%-crossing time. A non-positive half-life means an instant snap (rate ∞).
 */
export function inertializationDecayRate(halfLife: number): number {
  if (!Number.isFinite(halfLife) || halfLife <= 0) return Number.POSITIVE_INFINITY;
  return LN2 / halfLife;
}

/**
 * Critically-damped decay of a scalar offset `offset0` with initial velocity `velocity0`,
 * sampled at time `t` (seconds) since the transition. Decays smoothly to zero; preserves the
 * initial velocity at `t = 0` (so momentum carries through). Deterministic.
 */
export function inertializedScalar(offset0: number, velocity0: number, t: number, halfLife: number): number {
  if (!(t > 0)) return offset0;
  const k = inertializationDecayRate(halfLife);
  if (!Number.isFinite(k)) return 0; // instant snap
  // x(t) = (x0 + (v0 + k·x0)·t)·e^(−k·t);  x(0)=x0, x'(0)=v0, x(∞)=0.
  return (offset0 + (velocity0 + k * offset0) * t) * Math.exp(-k * t);
}

/**
 * Source-clip weight for an inertialized transition, decaying from 1 → 0 with zero initial slope
 * (critically damped, monotonic). The destination weight is `1 − thisWeight`. A drop-in,
 * smoother replacement for a linear `1 − t/duration` ramp. `elapsed`/`halfLife` in seconds.
 */
export function inertializedTransitionWeight(elapsed: number, halfLife: number): number {
  if (!(elapsed > 0)) return 1;
  const k = inertializationDecayRate(halfLife);
  if (!Number.isFinite(k)) return 0; // instant snap
  const w = (1 + k * elapsed) * Math.exp(-k * elapsed);
  return w < 0 ? 0 : w > 1 ? 1 : w;
}

/** Vector3 offset decay (per-component critically-damped). `velocity0` defaults to zero. */
export function inertializedVec3(offset0: Vec3, t: number, halfLife: number, velocity0: Vec3 = [0, 0, 0]): Vec3 {
  return [
    inertializedScalar(offset0[0], velocity0[0], t, halfLife),
    inertializedScalar(offset0[1], velocity0[1], t, halfLife),
    inertializedScalar(offset0[2], velocity0[2], t, halfLife)
  ];
}

// ---- quaternion helpers (local; unit-quaternion algebra) -------------------------------------

function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

/** Shortest-arc axis/angle of a unit quaternion; angle in [0, π], axis normalized (or +X). */
function quatToAxisAngle(q: Quat): { axis: Vec3; angle: number } {
  const n = normalizeQuat(q);
  // Force the shorter arc (w >= 0) so the decayed rotation never takes the long way around.
  const w = n[3] < 0 ? -n[3] : n[3];
  const sign = n[3] < 0 ? -1 : 1;
  const angle = 2 * Math.acos(Math.min(1, w));
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-8) return { axis: [1, 0, 0], angle: 0 };
  return { axis: [(sign * n[0]) / s, (sign * n[1]) / s, (sign * n[2]) / s], angle };
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/**
 * Critically-damped decay of the rotational offset `source · target⁻¹`, re-applied to `target`.
 * At `t = 0` returns `source`; as `t → ∞` returns `target`. `angularSpeed0` (rad/s, about the
 * offset axis) optionally carries rotational momentum through the transition. Deterministic.
 */
export function inertializedQuat(source: Quat, target: Quat, t: number, halfLife: number, angularSpeed0 = 0): Quat {
  const offset = quatMultiply(normalizeQuat(source), quatConjugate(normalizeQuat(target)));
  const { axis, angle } = quatToAxisAngle(offset);
  if (angle === 0 && angularSpeed0 === 0) return normalizeQuat(target);
  const decayedAngle = inertializedScalar(angle, angularSpeed0, t, halfLife);
  const decayedOffset = quatFromAxisAngle(axis, decayedAngle);
  return normalizeQuat(quatMultiply(decayedOffset, normalizeQuat(target)));
}

// ---- pose-space inertializer ------------------------------------------------------------------

/** A pose is a map of animation target → value (scalar / vec3 / quaternion supported for decay). */
export type InertializationPose = Readonly<Record<string, AnimationValue>>;

/**
 * Optional per-target velocities at transition time. Scalars → number (units/s), vec3 → Vec3
 * (units/s), quaternions → number (rad/s about the offset axis). Targets absent here decay from
 * rest (velocity 0).
 */
export type InertializationVelocities = Readonly<Record<string, number | Vec3>>;

export interface InertializerOptions {
  /** Transition half-life in seconds (default {@link DEFAULT_INERTIALIZATION_HALF_LIFE}). */
  readonly halfLife?: number;
}

interface RecordedOffset {
  readonly type: "scalar" | "vector3" | "quaternion" | "snap";
  readonly source: AnimationValue;
  readonly target: AnimationValue;
  readonly velocity: number | Vec3;
}

export interface Inertializer {
  readonly halfLife: number;
  /**
   * Record a transition from `previousPose` to `targetPose` (the destination clip's pose at the
   * transition instant), with optional per-target velocities. Resets the transition clock.
   */
  recordTransition(previousPose: InertializationPose, targetPose: InertializationPose, velocities?: InertializationVelocities): void;
  /**
   * Sample the inertialized pose `t` seconds after the recorded transition. At `t = 0` equals the
   * source pose for every recorded target; as `t` grows it converges to the target pose.
   */
  sampleInertialized(t: number): InertializationPose;
  /** True once the offset has decayed to within `epsilon` of the target across all targets. */
  settled(t: number, epsilon?: number): boolean;
  /** Clear the recorded transition. */
  reset(): void;
}

function classify(value: AnimationValue): RecordedOffset["type"] {
  if (typeof value === "number") return "scalar";
  if (Array.isArray(value)) {
    if (value.length === 3) return "vector3";
    if (value.length === 4) return "quaternion";
  }
  return "snap";
}

/**
 * Create a pose-space inertializer. Pure/deterministic given fixed `t`. Use it to replace a
 * linear state-transition crossfade with a momentum-preserving decay of the pose difference.
 */
export function createInertializer(options: InertializerOptions = {}): Inertializer {
  const halfLife = options.halfLife ?? DEFAULT_INERTIALIZATION_HALF_LIFE;
  let offsets = new Map<string, RecordedOffset>();

  return {
    halfLife,
    recordTransition(previousPose, targetPose, velocities) {
      const next = new Map<string, RecordedOffset>();
      for (const [target, targetValue] of Object.entries(targetPose)) {
        const sourceValue = previousPose[target];
        if (sourceValue === undefined) continue;
        const type = classify(targetValue);
        const velocity = velocities?.[target] ?? (type === "vector3" ? ([0, 0, 0] as Vec3) : 0);
        next.set(target, {
          type,
          source: cloneAnimationValue(sourceValue),
          target: cloneAnimationValue(targetValue),
          velocity
        });
      }
      offsets = next;
    },
    sampleInertialized(t) {
      const pose: Record<string, AnimationValue> = {};
      for (const [target, rec] of offsets) {
        pose[target] = sampleOffset(rec, t, halfLife);
      }
      return pose;
    },
    settled(t, epsilon = 1e-3) {
      for (const [, rec] of offsets) {
        if (!offsetSettled(rec, t, halfLife, epsilon)) return false;
      }
      return true;
    },
    reset() {
      offsets = new Map<string, RecordedOffset>();
    }
  };
}

function sampleOffset(rec: RecordedOffset, t: number, halfLife: number): AnimationValue {
  switch (rec.type) {
    case "scalar": {
      const target = rec.target as number;
      const offset0 = (rec.source as number) - target;
      return target + inertializedScalar(offset0, rec.velocity as number, t, halfLife);
    }
    case "vector3": {
      const target = rec.target as Vec3;
      const source = rec.source as Vec3;
      const offset0: Vec3 = [source[0] - target[0], source[1] - target[1], source[2] - target[2]];
      const decayed = inertializedVec3(offset0, t, halfLife, rec.velocity as Vec3);
      return [target[0] + decayed[0], target[1] + decayed[1], target[2] + decayed[2]];
    }
    case "quaternion":
      return inertializedQuat(rec.source as Quat, rec.target as Quat, t, halfLife, rec.velocity as number);
    default:
      // Non-interpolable (boolean/string/other array length): snap to target immediately.
      return cloneAnimationValue(rec.target);
  }
}

function offsetSettled(rec: RecordedOffset, t: number, halfLife: number, epsilon: number): boolean {
  switch (rec.type) {
    case "scalar": {
      const offset0 = (rec.source as number) - (rec.target as number);
      return Math.abs(inertializedScalar(offset0, rec.velocity as number, t, halfLife)) <= epsilon;
    }
    case "vector3": {
      const target = rec.target as Vec3;
      const source = rec.source as Vec3;
      const decayed = inertializedVec3(
        [source[0] - target[0], source[1] - target[1], source[2] - target[2]],
        t,
        halfLife,
        rec.velocity as Vec3
      );
      return Math.hypot(decayed[0], decayed[1], decayed[2]) <= epsilon;
    }
    case "quaternion": {
      const offset = quatMultiply(normalizeQuat(rec.source as Quat), quatConjugate(normalizeQuat(rec.target as Quat)));
      const { angle } = quatToAxisAngle(offset);
      return Math.abs(inertializedScalar(angle, rec.velocity as number, t, halfLife)) <= epsilon;
    }
    default:
      return true;
  }
}
