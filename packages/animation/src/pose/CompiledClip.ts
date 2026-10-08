import type { AnimationClip } from "../AnimationClip.js";
import type { AnimationTrack, TrackValueType } from "../AnimationTrack.js";
import type { AnimationValue } from "../Keyframe.js";
import { normalizeQuatFlat, slerpQuatFlat } from "./quatFlat.js";

/**
 * PRD-06 T1.2 — clip compiled for allocation-free sampling: times/values live in
 * flat Float32Arrays, and each playing action carries a per-track cursor
 * (Uint32Array) so interval lookup is amortized O(1) for monotonic playback.
 *
 * Interpolation mirrors `AnimationTrack.sample` (LINEAR / STEP / CUBICSPLINE)
 * with one deliberate deviation: quaternion CUBICSPLINE output is normalized
 * directly instead of `sample`'s `slerpQuat(identity, q, 1)` — that call returns
 * the raw cubic value un-normalized whenever |q.w| < 0.9995.
 */

export type CompiledTrackCursor = Uint32Array;

export type CompiledTrack = {
  readonly target: string;
  readonly valueType: TrackValueType;
  readonly times: Float32Array;
  /** Flattened numeric values (stride×keyCount); empty for boolean/string tracks. */
  readonly values: Float32Array;
  /** Non-numeric values for boolean/string tracks; null otherwise. */
  readonly rawValues: readonly AnimationValue[] | null;
  /** Flattened cubic outTangents per keyframe (only when track has cubic keys). */
  readonly outTangents: Float32Array | null;
  /** Flattened cubic inTangents per keyframe (only when track has cubic keys). */
  readonly inTangents: Float32Array | null;
  readonly stride: number;
  /** 0 = linear, 1 = step, 2 = cubicspline; one byte per keyframe. */
  readonly interpolation: Uint8Array;
  readonly keyframeCount: number;
};

export type CompiledClip = {
  readonly duration: number;
  readonly tracks: readonly CompiledTrack[];
};

const INTERP_LINEAR = 0;
const INTERP_STEP = 1;
const INTERP_CUBIC = 2;

function strideFor(valueType: TrackValueType, first: AnimationValue): number {
  switch (valueType) {
    case "scalar":
      return 1;
    case "vector3":
      return 3;
    case "quaternion":
      return 4;
    case "number-array":
      return (first as readonly number[]).length;
    default:
      return 0;
  }
}

function interpolationCode(interpolation: string | undefined): number {
  if (interpolation === "step") return INTERP_STEP;
  if (interpolation === "cubicspline") return INTERP_CUBIC;
  return INTERP_LINEAR;
}

export function compileTrack(track: AnimationTrack): CompiledTrack {
  const keyframes = track.keyframes;
  const keyframeCount = keyframes.length;
  const times = new Float32Array(keyframeCount);
  const interpolation = new Uint8Array(keyframeCount);
  const stride = strideFor(track.valueType, keyframes[0]!.value);
  const numeric = stride > 0;
  const values = numeric ? new Float32Array(keyframeCount * stride) : new Float32Array(0);
  const rawValues: AnimationValue[] | null = numeric ? null : [];
  let hasCubic = false;

  for (let i = 0; i < keyframeCount; i += 1) {
    const keyframe = keyframes[i]!;
    times[i] = keyframe.time;
    const code = interpolationCode(keyframe.interpolation);
    interpolation[i] = code;
    if (code === INTERP_CUBIC) hasCubic = true;
    if (numeric) {
      const value = keyframe.value;
      const base = i * stride;
      if (stride === 1) values[base] = value as number;
      else for (let k = 0; k < stride; k += 1) values[base + k] = (value as readonly number[])[k]!;
    } else {
      rawValues!.push(keyframe.value);
    }
  }

  let outTangents: Float32Array | null = null;
  let inTangents: Float32Array | null = null;
  if (hasCubic) {
    outTangents = new Float32Array(keyframeCount * stride);
    inTangents = new Float32Array(keyframeCount * stride);
    for (let i = 0; i < keyframeCount; i += 1) {
      const keyframe = keyframes[i]!;
      const base = i * stride;
      if (keyframe.outTangent !== undefined) {
        const tangent = keyframe.outTangent;
        for (let k = 0; k < stride; k += 1) outTangents[base + k] = typeof tangent === "number" ? tangent : (tangent as readonly number[])[k]!;
      }
      if (keyframe.inTangent !== undefined) {
        const tangent = keyframe.inTangent;
        for (let k = 0; k < stride; k += 1) inTangents[base + k] = typeof tangent === "number" ? tangent : (tangent as readonly number[])[k]!;
      }
    }
  }

  return {
    target: track.target,
    valueType: track.valueType,
    times,
    values,
    rawValues,
    outTangents,
    inTangents,
    stride,
    interpolation,
    keyframeCount
  };
}

export function compileClip(clip: AnimationClip): CompiledClip {
  return {
    duration: clip.duration,
    tracks: clip.tracks.map((track) => compileTrack(track))
  };
}

/** One cursor byte per track; callers keep this on the action and reset it on seek. */
export function createTrackCursors(clip: CompiledClip): CompiledTrackCursor {
  return new Uint32Array(clip.tracks.length);
}

/**
 * Locate the keyframe interval containing `time`, using `cursor` (a slot in the
 * action's Uint32Array) as a search hint. Returns the index of the first
 * keyframe of the interval, or -1 when `time` is outside the clip range (caller
 * clamps to the first/last keyframe in that case).
 */
function locateInterval(track: CompiledTrack, time: number, cursor: CompiledTrackCursor, cursorIndex: number): number {
  const times = track.times;
  const lastInterval = track.keyframeCount - 2;
  let i = cursor[cursorIndex]!;
  if (i > lastInterval) i = lastInterval;
  while (i < lastInterval && time > times[i + 1]!) i += 1;
  while (i > 0 && time < times[i]!) i -= 1;
  cursor[cursorIndex] = i;
  if (time < times[0]! || time > times[track.keyframeCount - 1]!) return -1;
  return i;
}

function cubicHermite(a: number, b: number, outTangent: number, inTangent: number, t: number, deltaTime: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a +
    (t3 - 2 * t2 + t) * deltaTime * outTangent +
    (-2 * t3 + 3 * t2) * b +
    (t3 - t2) * deltaTime * inTangent
  );
}

/**
 * Sample `track` at `time` into `out` at `outOffset`. For boolean/string tracks
 * the sampled raw value is written to `out[outOffset]` via Number coercion —
 * callers needing the raw value use `sampleRaw` instead.
 */
export function sampleTrackInto(
  track: CompiledTrack,
  time: number,
  cursor: CompiledTrackCursor,
  cursorIndex: number,
  out: Float32Array,
  outOffset: number
): void {
  const stride = track.stride;
  const keyframeCount = track.keyframeCount;
  const times = track.times;
  const values = track.values;

  if (time <= times[0]!) {
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[k]!;
    return;
  }
  if (time >= times[keyframeCount - 1]!) {
    const base = (keyframeCount - 1) * stride;
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[base + k]!;
    return;
  }

  const i = locateInterval(track, time, cursor, cursorIndex);
  const aBase = i * stride;
  const bBase = (i + 1) * stride;
  const aTime = times[i]!;
  const bTime = times[i + 1]!;
  const interp = track.interpolation[i]!;

  if (interp === INTERP_STEP || bTime === aTime) {
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[aBase + k]!;
    return;
  }

  const t = (time - aTime) / (bTime - aTime);

  if (interp === INTERP_CUBIC) {
    const deltaTime = bTime - aTime;
    const outTangents = track.outTangents!;
    const inTangents = track.inTangents!;
    for (let k = 0; k < stride; k += 1) {
      out[outOffset + k] = cubicHermite(
        values[aBase + k]!,
        values[bBase + k]!,
        outTangents[aBase + k]!,
        inTangents[bBase + k]!,
        t,
        deltaTime
      );
    }
    if (track.valueType === "quaternion") normalizeQuatFlat(out, outOffset);
    return;
  }

  if (track.valueType === "quaternion") {
    slerpQuatFlat(out, outOffset, values, aBase, values, bBase, t);
    return;
  }
  for (let k = 0; k < stride; k += 1) {
    out[outOffset + k] = values[aBase + k]! + (values[bBase + k]! - values[aBase + k]!) * t;
  }
}

/** Raw-value sample for boolean/string tracks (and a convenience for others). */
export function sampleTrackRaw(track: CompiledTrack, time: number, cursor: CompiledTrackCursor, cursorIndex: number): AnimationValue {
  const times = track.times;
  const keyframeCount = track.keyframeCount;
  if (time <= times[0]!) return track.rawValues ? track.rawValues[0]! : firstNumeric(track);
  if (time >= times[keyframeCount - 1]!) {
    return track.rawValues ? track.rawValues[keyframeCount - 1]! : lastNumeric(track);
  }
  const i = locateInterval(track, time, cursor, cursorIndex);
  const bTime = times[i + 1]!;
  const t = (time - times[i]!) / (bTime - times[i]!);
  if (track.rawValues) {
    const interp = track.interpolation[i]!;
    if (interp === INTERP_STEP || t < 1) return track.rawValues[i]!;
    return track.rawValues[i + 1]!;
  }
  const scratch = new Float32Array(track.stride);
  sampleTrackInto(track, time, cursor, cursorIndex, scratch, 0);
  return [...scratch] as AnimationValue;
}

function firstNumeric(track: CompiledTrack): AnimationValue {
  return track.stride === 1 ? track.values[0]! : ([...track.values.subarray(0, track.stride)] as AnimationValue);
}
function lastNumeric(track: CompiledTrack): AnimationValue {
  const base = (track.keyframeCount - 1) * track.stride;
  return track.stride === 1 ? track.values[base]! : ([...track.values.subarray(base, base + track.stride)] as AnimationValue);
}
