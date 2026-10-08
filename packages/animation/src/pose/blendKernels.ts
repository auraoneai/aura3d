/**
 * T1.11 (PRD-06 §10) — value-level r185 blend kernels, the `AnimationValue`
 * twins of {@link PoseMixer}'s flat-buffer math (`accumulate` incremental mix,
 * `accumulateAdditiveAccu`, `applyAdditiveAccumulators`). The legacy
 * `AnimationMixer` facade routes `blendBase`/`additiveContribution` through
 * these under `A3D_QR_ANIMATION_POSE_MIXER` so the pose implementation is the
 * single source of the math; with the flag off the facade keeps its own
 * (identical) bodies until flag removal.
 */

import { cloneAnimationValue, normalizeQuat, slerpQuat, type AnimationValue } from "../Keyframe.js";

export type PoseBlendChannel = "scalar" | "vector3" | "quaternion" | "number-array";

export interface PoseBlendAccumulatorLike {
  value: AnimationValue;
  weight: number;
}

/** r185 incremental base accumulate: `acc = mix(acc, v, w/(Σ + w))`. */
export function blendBaseValue(
  current: PoseBlendAccumulatorLike,
  channel: string,
  value: AnimationValue,
  weight: number
): void {
  const total = current.weight + weight;
  const t = weight / total;
  if (channel === "scalar") {
    current.value = (current.value as number) + ((value as number) - (current.value as number)) * t;
  } else if (channel === "vector3") {
    const a = current.value as [number, number, number];
    const b = value as [number, number, number];
    current.value = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  } else if (channel === "quaternion") {
    current.value = slerpQuat(current.value as [number, number, number, number], value as [number, number, number, number], t);
  } else if (channel === "number-array") {
    const a = current.value as readonly number[];
    const b = value as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot blend number-array animation values with different lengths.");
    }
    current.value = a.map((component, index) => component + (b[index]! - component) * t);
  } else {
    current.value = cloneAnimationValue(value);
  }
  current.weight = total;
}

/**
 * r185 additive contribution: vectors/scalars `v * w`; quaternions
 * `slerp(identity, normalize(v), w)` — a single step of the chained
 * `slerp(acc, acc·delta, w)` in `PoseMixer.accumulateAdditiveAccu`.
 */
export function additiveContributionValue(channel: string, value: AnimationValue, weight: number): AnimationValue {
  if (channel === "scalar") {
    return (value as number) * weight;
  }
  if (channel === "vector3") {
    const vector = value as [number, number, number];
    return [vector[0] * weight, vector[1] * weight, vector[2] * weight];
  }
  if (channel === "number-array") {
    return (value as readonly number[]).map((component) => component * weight);
  }
  if (channel === "quaternion") {
    return slerpQuat([0, 0, 0, 1], normalizeQuat(value as [number, number, number, number]), weight);
  }
  throw new Error("Additive animation layers require numeric, vector, quaternion, or number-array tracks.");
}

/**
 * r185 additive apply: `out = base + delta` for vectors/scalars;
 * `out = normalize(base · delta)` for quaternions (weights already folded into
 * `delta` by {@link additiveContributionValue}).
 */
export function applyAdditiveValue(channel: string, base: AnimationValue, delta: AnimationValue): AnimationValue {
  if (channel === "scalar") {
    return (base as number) + (delta as number);
  }
  if (channel === "vector3") {
    const a = base as [number, number, number];
    const b = delta as [number, number, number];
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  if (channel === "number-array") {
    const a = base as readonly number[];
    const b = delta as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot add number-array animation values with different lengths.");
    }
    return a.map((component, index) => component + b[index]!);
  }
  if (channel === "quaternion") {
    return normalizeQuat(multiplyQuatFlat(base as [number, number, number, number], delta as [number, number, number, number]));
  }
  throw new Error("Additive animation layers require numeric, vector, quaternion, or number-array tracks.");
}

/** Fold a new additive contribution into a running accumulator. */
export function combineAdditiveValue(channel: string, current: AnimationValue, value: AnimationValue, weight: number): AnimationValue {
  return applyAdditiveValue(channel, current, additiveContributionValue(channel, value, weight));
}

function multiplyQuatFlat(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}
