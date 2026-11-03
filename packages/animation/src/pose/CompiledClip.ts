import type { AnimationClip } from "../AnimationClip.js";
import type { AnimationEventMarker } from "../AnimationEvents.js";
import type { AnimationTrack, TrackValueType } from "../AnimationTrack.js";
import { smoothKeyframeTangent, type AnimationValue } from "../Keyframe.js";
import { normalizeQuatFlat, slerpQuatFlat } from "./quatFlat.js";

/**
 * PRD-06 T1.2 — clip compiled for allocation-free sampling: times/values live in
 * flat Float32Arrays, and each playing action carries a per-track cursor
 * (Uint32Array) so interval lookup is amortized O(1) for monotonic playback.
 *
 * Interpolation and endpoint behavior mirror `AnimationTrack.sample`.
 */

export type CompiledTrackCursor = Uint32Array;

export type CompiledTrack = {
  readonly target: string;
  readonly valueType: TrackValueType;
  readonly times: Float32Array;
  /** Original key times retain exact JavaScript-number boundaries for sampling. */
  readonly exactTimes?: Float64Array;
  /** Flattened numeric values (stride×keyCount); empty for boolean/string tracks. */
  readonly values: Float32Array;
  /** Present only when Float32 rounding would lose authored value precision. */
  readonly exactValues?: Float64Array;
  /** Non-numeric values for boolean/string tracks; null otherwise. */
  readonly rawValues: readonly AnimationValue[] | null;
  /** Flattened outgoing derivatives or Bézier controls, according to each interval mode. */
  readonly outTangents: Float32Array | null;
  /** Flattened incoming derivatives or Bézier controls, according to each interval mode. */
  readonly inTangents: Float32Array | null;
  readonly exactOutTangents?: Float64Array;
  readonly exactInTangents?: Float64Array;
  readonly stride: number;
  /** 0 = linear, 1 = step, 2 = cubicspline, 3 = smooth, 4 = Bézier. */
  readonly interpolation: Uint8Array;
  /** Per key: bit 0 authored interpolation; bit 1 incoming; bit 2 outgoing. */
  readonly authoredKeyframeFlags?: Uint8Array;
  readonly keyframeCount: number;
};

export type CompiledClip = {
  readonly duration: number;
  readonly tracks: readonly CompiledTrack[];
  readonly events?: readonly AnimationEventMarker[];
};

const INTERP_LINEAR = 0;
const INTERP_STEP = 1;
const INTERP_CUBIC = 2;
const INTERP_SMOOTH = 3;
const INTERP_BEZIER = 4;

function interpolationCode(interpolation: string | undefined): number {
  if (interpolation === "step") return INTERP_STEP;
  if (interpolation === "cubicspline") return INTERP_CUBIC;
  if (interpolation === "smooth") return INTERP_SMOOTH;
  if (interpolation === "bezier") return INTERP_BEZIER;
  return INTERP_LINEAR;
}

/** Retain a double-precision sidecar only if narrowing a component loses data. */
function writePrecise(target: Float32Array, index: number, value: number, exact: Float64Array | undefined): Float64Array | undefined {
  target[index] = value;
  if (!exact && target[index] !== value) {
    exact = new Float64Array(target.length);
    exact.set(target);
  }
  if (exact) exact[index] = value;
  return exact;
}

export function compileTrack(track: AnimationTrack): CompiledTrack {
  const keyframes = track.keyframes;
  const keyframeCount = keyframes.length;
  const times = new Float32Array(keyframeCount);
  const exactTimes = new Float64Array(keyframeCount);
  const interpolation = new Uint8Array(keyframeCount);
  const authoredKeyframeFlags = new Uint8Array(keyframeCount);
  const stride = track.valueSize;
  const numeric = stride > 0;
  const values = numeric ? new Float32Array(keyframeCount * stride) : new Float32Array(0);
  let exactValues: Float64Array | undefined;
  const rawValues: AnimationValue[] | null = numeric ? null : [];
  let hasCubic = false;

  for (let i = 0; i < keyframeCount; i += 1) {
    const keyframe = keyframes[i]!;
    times[i] = keyframe.time;
    exactTimes[i] = keyframe.time;
    const code = interpolationCode(keyframe.interpolation);
    interpolation[i] = code;
    authoredKeyframeFlags[i] = (keyframe.interpolation !== undefined ? 1 : 0) | (keyframe.inTangent !== undefined ? 2 : 0) | (keyframe.outTangent !== undefined ? 4 : 0);
    if (code === INTERP_CUBIC || code === INTERP_SMOOTH || code === INTERP_BEZIER || keyframe.inTangent !== undefined || keyframe.outTangent !== undefined) hasCubic = true;
    if (numeric) {
      const value = keyframe.value;
      const base = i * stride;
      if (track.valueType === "scalar") exactValues = writePrecise(values, base, value as number, exactValues);
      else for (let k = 0; k < stride; k += 1) exactValues = writePrecise(values, base + k, (value as readonly number[])[k]!, exactValues);
    } else {
      rawValues!.push(keyframe.value);
    }
  }

  let outTangents: Float32Array | null = null;
  let inTangents: Float32Array | null = null;
  let exactOutTangents: Float64Array | undefined;
  let exactInTangents: Float64Array | undefined;
  if (hasCubic) {
    outTangents = new Float32Array(keyframeCount * stride);
    inTangents = new Float32Array(keyframeCount * stride);
    for (let i = 0; i < keyframeCount; i += 1) {
      const keyframe = keyframes[i]!;
      const base = i * stride;
      const out = keyframe.interpolation === "smooth" ? smoothKeyframeTangent(keyframes, i, "out") : keyframe.outTangent;
      const incoming = i > 0 && keyframes[i - 1]!.interpolation === "smooth" ? smoothKeyframeTangent(keyframes, i, "in") : keyframe.inTangent;
      if (out !== undefined) {
        const tangent = out;
        for (let k = 0; k < stride; k += 1) exactOutTangents = writePrecise(outTangents, base + k, typeof tangent === "number" ? tangent : (tangent as readonly number[])[k]!, exactOutTangents);
      }
      if (incoming !== undefined) {
        const tangent = incoming;
        for (let k = 0; k < stride; k += 1) exactInTangents = writePrecise(inTangents, base + k, typeof tangent === "number" ? tangent : (tangent as readonly number[])[k]!, exactInTangents);
      }
    }
  }

  return {
    target: track.target,
    valueType: track.valueType,
    times,
    exactTimes,
    values,
    ...(exactValues ? { exactValues } : {}),
    rawValues,
    outTangents,
    inTangents,
    ...(exactOutTangents ? { exactOutTangents } : {}),
    ...(exactInTangents ? { exactInTangents } : {}),
    stride,
    interpolation,
    authoredKeyframeFlags,
    keyframeCount
  };
}

export function compileClip(clip: AnimationClip): CompiledClip {
  return {
    duration: clip.duration,
    tracks: clip.tracks.map((track) => compileTrack(track)),
    events: clip.events.map((event) => ({ ...event }))
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
  const times = track.exactTimes ?? track.times;
  const lastInterval = track.keyframeCount - 2;
  let i = cursor[cursorIndex]!;
  if (i > lastInterval) i = lastInterval;
  while (i < lastInterval && time >= times[i + 1]!) i += 1;
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
  if (!Number.isFinite(time)) throw new Error("AnimationTrack sample time must be finite.");
  const times = track.exactTimes ?? track.times;
  const values = track.values;

  if (time <= times[0]!) {
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[k]!;
    if (track.valueType === "quaternion") normalizeQuatFlat(out, outOffset);
    return;
  }
  if (time >= times[keyframeCount - 1]!) {
    const base = (keyframeCount - 1) * stride;
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[base + k]!;
    if (track.valueType === "quaternion") normalizeQuatFlat(out, outOffset);
    return;
  }

  const i = locateInterval(track, time, cursor, cursorIndex);
  const aBase = i * stride;
  const bBase = (i + 1) * stride;
  const aTime = times[i]!;
  const bTime = times[i + 1]!;
  const interp = track.interpolation[i]!;

  if (track.valueType === "quaternion" && time === aTime) {
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[aBase + k]!;
    normalizeQuatFlat(out, outOffset);
    return;
  }

  if (interp === INTERP_STEP || bTime === aTime) {
    for (let k = 0; k < stride; k += 1) out[outOffset + k] = values[aBase + k]!;
    return;
  }

  const t = (time - aTime) / (bTime - aTime);

  if (interp === INTERP_CUBIC || interp === INTERP_SMOOTH || interp === INTERP_BEZIER) {
    const deltaTime = bTime - aTime;
    const outTangents = track.outTangents!;
    const inTangents = track.inTangents!;
    for (let k = 0; k < stride; k += 1) {
      if (interp === INTERP_BEZIER) {
        const u = 1 - t;
        out[outOffset + k] = u * u * u * values[aBase + k]! + 3 * u * u * t * outTangents[aBase + k]! + 3 * u * t * t * inTangents[bBase + k]! + t * t * t * values[bBase + k]!;
      } else {
        out[outOffset + k] = cubicHermite(values[aBase + k]!, values[bBase + k]!, outTangents[aBase + k]!, inTangents[bBase + k]!, t, deltaTime);
      }
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
  if (!track.rawValues) {
    const scratch = new Float32Array(track.stride);
    sampleTrackInto(track, time, cursor, cursorIndex, scratch, 0);
    return track.valueType === "scalar" ? scratch[0]! : [...scratch] as AnimationValue;
  }
  if (!Number.isFinite(time)) throw new Error("AnimationTrack sample time must be finite.");
  const times = track.exactTimes ?? track.times;
  const keyframeCount = track.keyframeCount;
  if (time <= times[0]!) return track.rawValues[0]!;
  if (time >= times[keyframeCount - 1]!) {
    return track.rawValues[keyframeCount - 1]!;
  }
  const i = locateInterval(track, time, cursor, cursorIndex);
  const bTime = times[i + 1]!;
  const t = (time - times[i]!) / (bTime - times[i]!);
  const interp = track.interpolation[i]!;
  if (interp === INTERP_STEP || t < 1) return track.rawValues[i]!;
  return track.rawValues[i + 1]!;
}
