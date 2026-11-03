import { AnimationClip } from "./AnimationClip.js";
import { AnimationTrack } from "./AnimationTrack.js";
import type { AnimationEventMarker } from "./AnimationEvents.js";
import { cloneAnimationValue, smoothKeyframeTangent, type AnimationValue, type Keyframe } from "./Keyframe.js";
import { isClipAdditive, makeClipAdditive, type AdditiveReference } from "./pose/makeClipAdditive.js";

export { isClipAdditive, makeClipAdditive, type AdditiveReference };

/** Array, track and clip transformations. Clip operations return new clips. */

export function arraySlice<T>(array: ArrayLike<T>, from: number, to: number): T[] {
  return Array.prototype.slice.call(array, from, to) as T[];
}

export function convertArray<T>(array: ArrayLike<T> | readonly T[]): readonly T[] | ArrayLike<T> {
  return Array.isArray(array) ? array : Array.from(array);
}

export function isTypedArray(object: unknown): boolean {
  return ArrayBuffer.isView(object) && !(object instanceof DataView);
}

/** Indices sorted by time, retaining input order for equal times. */
export function getKeyframeOrder(times: readonly number[]): number[] {
  return Array.from({ length: times.length }, (_, index) => index)
    .sort((a, b) => times[a]! - times[b]! || a - b);
}

/** Reorders `values` (flat, `stride` components per element) by `sortedKeys`. */
export function sortedArray<T extends ArrayLike<number> | readonly number[]>(values: T, stride: number, sortedKeys: readonly number[]): T {
  if (!Number.isInteger(stride) || stride < 1 || values.length % stride !== 0) throw new Error("AnimationUtils.sortedArray: invalid stride.");
  const count = values.length / stride;
  if (sortedKeys.length !== count || sortedKeys.some((index) => !Number.isInteger(index) || index < 0 || index >= count) || new Set(sortedKeys).size !== count) {
    throw new Error("AnimationUtils.sortedArray: sortedKeys must be a permutation of the value indices.");
  }
  const result = (Array.isArray(values) ? new Array(values.length) : new (values.constructor as new (length: number) => T)(values.length)) as T;
  sortedKeys.forEach((index, row) => {
    for (let column = 0; column < stride; column++) (result as unknown as number[])[row * stride + column] = values[index * stride + column]!;
  });
  return result;
}

/**
 * Frame-based subclip keeps keys inside `[startFrame, endFrame)`, drops tracks left
 * empty, and shifts every kept keyframe (and clip event) by `-startFrame/fps`
 * so the subclip starts at 0.
 */
export function subclip(sourceClip: AnimationClip, name: string, startFrame: number, endFrame: number, fps = 30): AnimationClip {
  if (!(sourceClip instanceof AnimationClip)) {
    throw new Error("AnimationUtils.subclip: sourceClip must be an AnimationClip.");
  }
  if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || startFrame < 0 || endFrame <= startFrame) {
    throw new Error(`AnimationUtils.subclip: expected endFrame > startFrame >= 0, got [${startFrame}, ${endFrame}].`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`AnimationUtils.subclip: fps must be a positive finite number, got ${fps}.`);
  }
  const startTime = startFrame / fps;
  const endTime = endFrame / fps;
  const tracks = sourceClip.tracks.flatMap((track) => {
    const keyframes = track.keyframes.flatMap((keyframe, index) => {
      if (keyframe.time < startTime || keyframe.time >= endTime) return [];
      return [{
        ...keyframe,
        time: keyframe.time - startTime,
        ...(index > 0 && track.keyframes[index - 1]!.interpolation === "smooth" ? { inTangent: smoothKeyframeTangent(track.keyframes, index, "in") } : {}),
        ...(keyframe.interpolation === "smooth" ? { outTangent: smoothKeyframeTangent(track.keyframes, index, "out") } : {})
      }];
    });
    return keyframes.length === 0 ? [] : [new AnimationTrack({
      target: track.target,
      valueType: track.valueType,
      valueSize: track.valueSize,
      keyframes
    })];
  });

  const events: AnimationEventMarker[] = sourceClip.events
    .filter((event) => event.time >= startTime && event.time < endTime)
    .map((event) => ({ ...event, time: event.time - startTime }));

  const duration = Math.max(0, ...tracks.map((track) => track.duration), ...events.map((event) => event.time));
  return new AnimationClip({ name, duration, tracks, events });
}

/**
 * Cut an exact interval in seconds, including interpolated boundary keys. The
 * original curve is retained even when a cut falls within a cubic interval:
 * cubic control polygons are subdivided and converted back to the source mode.
 * Outside a track's own range its first/last value is held. Event endpoints are
 * included; this differs intentionally from the legacy frame-based `subclip`.
 */
export function trimClip(sourceClip: AnimationClip, start: number, end: number, name = `${sourceClip.name}.trimmed`): AnimationClip {
  if (!(sourceClip instanceof AnimationClip)) throw new Error("AnimationUtils.trimClip: sourceClip must be an AnimationClip.");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > sourceClip.duration) {
    throw new Error("AnimationUtils.trimClip: expected 0 <= start < end <= clip duration.");
  }
  type MutableKey = { time: number; value: AnimationValue; interpolation?: Keyframe["interpolation"]; inTangent?: AnimationValue; outTangent?: AnimationValue };
  const tracks = sourceClip.tracks.map((track) => {
    const times = [start, ...track.keyframes.filter((key) => key.time > start && key.time < end).map((key) => key.time), end];
    const keys: MutableKey[] = times.map((time) => {
      const source = track.keyframes.find((key) => key.time === time);
      return source ? { ...source, time: time - start, value: cloneAnimationValue(source.value) } : { time: time - start, value: track.sample(time) };
    });
    for (let i = 0; i < times.length - 1; i += 1) {
      const from = times[i]!;
      const to = times[i + 1]!;
      const middle = (from + to) / 2;
      const index = track.keyframes.findIndex((key, k) => k + 1 < track.keyframes.length && middle >= key.time && middle < track.keyframes[k + 1]!.time);
      const output = keys[i]!;
      const next = keys[i + 1]!;
      if (index < 0) {
        output.interpolation = "step";
        continue;
      }
      const a = track.keyframes[index]!;
      const b = track.keyframes[index + 1]!;
      const mode = a.interpolation ?? "linear";
      output.interpolation = mode;
      if (mode !== "smooth" && mode !== "cubicspline" && mode !== "bezier") continue;

      const array = (v: AnimationValue): number[] => typeof v === "number" ? [v] : [...v as readonly number[]];
      const value = (v: number[]): AnimationValue => track.valueType === "scalar" ? v[0]! : v;
      const p0 = array(a.value);
      const p3 = array(b.value);
      const out = array(mode === "smooth" ? smoothKeyframeTangent(track.keyframes, index, "out") : a.outTangent!);
      const incoming = array(mode === "smooth" ? smoothKeyframeTangent(track.keyframes, index + 1, "in") : b.inTangent!);
      const dt = b.time - a.time;
      const p1 = mode === "bezier" ? out : p0.map((x, j) => x + out[j]! * dt / 3);
      const p2 = mode === "bezier" ? incoming : p3.map((x, j) => x - incoming[j]! * dt / 3);
      const mix = (x: number[], y: number[], t: number) => x.map((v, j) => v + (y[j]! - v) * t);
      const split = (points: number[][], t: number): [number[][], number[][]] => {
        const x = mix(points[0]!, points[1]!, t), y = mix(points[1]!, points[2]!, t), z = mix(points[2]!, points[3]!, t);
        const d = mix(x, y, t), e = mix(y, z, t), m = mix(d, e, t);
        return [[points[0]!, x, d, m], [m, e, z, points[3]!]];
      };
      const u = (from - a.time) / dt;
      const v = (to - a.time) / dt;
      const [, right] = split([p0, p1, p2, p3], u);
      const [part] = split(right, (v - u) / (1 - u));
      output.value = value(part[0]!);
      next.value = value(part[3]!);
      output.outTangent = value(mode === "bezier" ? part[1]! : part[1]!.map((x, j) => 3 * (x - part[0]![j]!) / (to - from)));
      next.inTangent = value(mode === "bezier" ? part[2]! : part[2]!.map((x, j) => 3 * (part[3]![j]! - x) / (to - from)));
    }
    return new AnimationTrack({ target: track.target, valueType: track.valueType, valueSize: track.valueSize, keyframes: keys });
  });
  const events = sourceClip.events.filter((event) => event.time >= start && event.time <= end).map((event) => ({ ...event, time: event.time - start }));
  return new AnimationClip({ name, duration: end - start, tracks, events });
}

function valuesEqual(a: AnimationValue, b: AnimationValue): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, index) => item === b[index])
    : a === b;
}

/**
 * Remove interior keyframes
 * whose value equals both neighbors are redundant under linear/step
 * interpolation. Curved tracks and authored tangents are always preserved:
 * removing even a constant-valued key can change neighboring curves. The first and
 * last keys are always kept. Returns a new clip.
 */
export function optimize(clip: AnimationClip): AnimationClip {
  if (!(clip instanceof AnimationClip)) {
    throw new Error("AnimationUtils.optimize: clip must be an AnimationClip.");
  }
  const tracks = clip.tracks.map((track) => {
    const keyframes = track.keyframes;
    if (keyframes.length <= 2 || keyframes.some((key) => key.interpolation === "smooth" || key.interpolation === "cubicspline" || key.interpolation === "bezier" || key.inTangent !== undefined || key.outTangent !== undefined)) {
      return track;
    }
    const kept = keyframes.filter((key, i) => i === 0 || i === keyframes.length - 1 ||
      !valuesEqual(key.value, keyframes[i - 1]!.value) || !valuesEqual(key.value, keyframes[i + 1]!.value));
    return new AnimationTrack({ target: track.target, valueType: track.valueType, valueSize: track.valueSize, keyframes: kept });
  });
  return new AnimationClip({
    name: clip.name,
    duration: clip.duration,
    tracks,
    events: clip.events.map((event) => ({ ...event }))
  });
}

/**
 * Sequential clip concatenation: each clip's tracks (and events) are shifted
 * by the accumulated duration of the clips before it. Tracks that share a
 * `target`+`valueType` are joined into one; a later clip's first keyframe that
 * lands exactly on the previous clip's boundary is dropped so the join stays
 * continuous. Distinct targets appear side by side.
 */
export function merge(clips: readonly AnimationClip[], name = "merged"): AnimationClip {
  if (clips.length === 0) throw new Error("AnimationUtils.merge: at least one clip is required.");
  if (clips.some((clip) => !(clip instanceof AnimationClip))) throw new Error("AnimationUtils.merge: every entry must be an AnimationClip.");
  type Segment = { track: AnimationTrack; start: number };
  type Channel = { target: string; valueType: AnimationTrack["valueType"]; valueSize: number; segments: Segment[] };
  const channels: Channel[] = [];
  const events: AnimationEventMarker[] = [];
  let duration = 0;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      let channel = channels.find((candidate) => candidate.target === track.target && candidate.valueType === track.valueType);
      if (!channel) {
        channel = { target: track.target, valueType: track.valueType, valueSize: track.valueSize, segments: [] };
        channels.push(channel);
      } else if (channel.valueSize !== track.valueSize) {
        throw new Error(`AnimationUtils.merge: ${track.target} has inconsistent valueSize.`);
      }
      channel.segments.push({ track, start: duration });
    }
    events.push(...clip.events.map((event) => ({ ...event, time: duration + event.time })));
    duration += clip.duration;
  }
  const tracks = channels.map((channel) => {
    const keys: Keyframe[] = [];
    for (const { track, start } of channel.segments) {
      const segment = track.keyframes.map((key, index) => ({
        ...key,
        time: key.time + start,
        value: cloneAnimationValue(key.value),
        inTangent: index > 0 && track.keyframes[index - 1]!.interpolation === "smooth" ? smoothKeyframeTangent(track.keyframes, index, "in") : key.inTangent,
        outTangent: key.interpolation === "smooth" ? smoothKeyframeTangent(track.keyframes, index, "out") : key.outTangent
      }));
      const last = keys.at(-1);
      if (last && segment[0]!.time === last.time) {
        const first = segment.shift()!;
        keys[keys.length - 1] = { ...last, interpolation: first.interpolation, outTangent: first.outTangent };
      }
      keys.push(...segment);
    }
    return new AnimationTrack({ target: channel.target, valueType: channel.valueType, valueSize: channel.valueSize, keyframes: keys });
  });
  return new AnimationClip({ name, duration, tracks, events });
}

/**
 * Object-style access to the utility functions.
 */
export const AnimationUtils = {
  arraySlice,
  convertArray,
  isTypedArray,
  getKeyframeOrder,
  sortedArray,
  subclip,
  trimClip,
  optimize,
  merge,
  makeClipAdditive,
  isClipAdditive
} as const;
