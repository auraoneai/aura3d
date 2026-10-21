import { AnimationClip } from "./AnimationClip.js";
import { AnimationTrack } from "./AnimationTrack.js";
import type { AnimationEventMarker } from "./AnimationEvents.js";
import { cloneAnimationValue, type AnimationValue, type Keyframe } from "./Keyframe.js";
import { isClipAdditive, makeClipAdditive, type AdditiveReference } from "./pose/makeClipAdditive.js";

export { isClipAdditive, makeClipAdditive, type AdditiveReference };

/**
 * SA-06 — three-compatible `AnimationUtils` (`three@0.185.x
 * src/animation/AnimationUtils.js` + `KeyframeTrack.optimize`) adapted to
 * Aura's keyframe-object tracks. All helpers return new immutable clips —
 * tracks are never mutated in place.
 */

export function arraySlice<T>(array: ArrayLike<T>, from: number, to: number): T[] {
  const result: T[] = new Array(to - from);
  for (let i = from, j = 0; i !== to; ++i, ++j) {
    result[j] = array[i]!;
  }
  return result;
}

export function convertArray<T>(array: ArrayLike<T> | readonly T[]): readonly T[] | ArrayLike<T> {
  return Array.isArray(array) ? array : arraySlice(array, 0, array.length);
}

export function isTypedArray(object: unknown): boolean {
  return ArrayBuffer.isView(object) && !(object instanceof DataView);
}

/** Same order as three's `AnimationUtils.getKeyframeOrder` (stable sort). */
export function getKeyframeOrder(times: readonly number[]): number[] {
  const indexes = new Array<number>(times.length);
  for (let i = 0; i !== indexes.length; ++i) {
    indexes[i] = i;
  }
  return indexes.sort((a, b) => times[a]! - times[b]!);
}

/** Reorders `values` (flat, `stride` components per element) by `sortedKeys`. */
export function sortedArray<T extends ArrayLike<number> | readonly number[]>(values: T, stride: number, sortedKeys: readonly number[]): T {
  const count = values.length / stride;
  const result = (Array.isArray(values) ? new Array(values.length) : new (values.constructor as new (length: number) => T)(values.length)) as T;
  for (let i = 0; i !== count; ++i) {
    const index = sortedKeys[i]! * stride;
    for (let j = 0; j !== stride; ++j) {
      (result as unknown as number[])[i * stride + j] = values[index + j]!;
    }
  }
  return result;
}

/**
 * three's `AnimationUtils.subclip`: keeps the keyframes whose clip time falls
 * inside `[startFrame, endFrame)` (converted through `fps`), drops tracks left
 * empty, and shifts every kept keyframe (and clip event) by `-startFrame/fps`
 * so the subclip starts at 0.
 */
export function subclip(sourceClip: AnimationClip, name: string, startFrame: number, endFrame: number, fps = 30): AnimationClip {
  if (!(sourceClip instanceof AnimationClip)) {
    throw new Error("AnimationUtils.subclip: sourceClip must be an AnimationClip.");
  }
  if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || endFrame <= startFrame) {
    throw new Error(`AnimationUtils.subclip: expected endFrame > startFrame >= 0, got [${startFrame}, ${endFrame}].`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`AnimationUtils.subclip: fps must be a positive finite number, got ${fps}.`);
  }
  const clip = AnimationClip.fromJSON(sourceClip.toJSON());
  const startTime = startFrame / fps;
  const endTime = endFrame / fps;

  const tracks: AnimationTrack[] = [];
  for (const track of clip.tracks) {
    const keyframes = track.keyframes.filter((keyframe) => {
      const frame = keyframe.time * fps;
      return frame >= startFrame && frame < endFrame;
    });
    if (keyframes.length === 0) {
      continue;
    }
    tracks.push(new AnimationTrack({
      target: track.target,
      valueType: track.valueType,
      keyframes: keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time - startTime }))
    }));
  }

  const events: AnimationEventMarker[] = clip.events
    .filter((event) => event.time >= startTime && event.time < endTime)
    .map((event) => ({ ...event, time: event.time - startTime }));

  return new AnimationClip({ name, tracks, events });
}

function valuesEqual(a: AnimationValue, b: AnimationValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

/**
 * three's `KeyframeTrack.optimize` lifted to whole clips: interior keyframes
 * whose value equals both neighbors are redundant under linear/step
 * interpolation and are removed. `cubicspline` keys are always preserved —
 * removing them would change the curve through their tangents. The first and
 * last keys are always kept. Returns a new clip.
 */
export function optimize(clip: AnimationClip): AnimationClip {
  if (!(clip instanceof AnimationClip)) {
    throw new Error("AnimationUtils.optimize: clip must be an AnimationClip.");
  }
  const tracks = clip.tracks.map((track) => {
    const keyframes = track.keyframes;
    if (keyframes.length <= 2) {
      return track;
    }
    const kept: Keyframe<AnimationValue>[] = [keyframes[0]!];
    for (let i = 1; i < keyframes.length - 1; i++) {
      const previous = kept[kept.length - 1]!;
      const current = keyframes[i]!;
      const next = keyframes[i + 1]!;
      if (current.interpolation === "cubicspline" || next.interpolation === "cubicspline") {
        kept.push(current);
        continue;
      }
      if (valuesEqual(current.value, previous.value) && valuesEqual(current.value, next.value)) {
        continue;
      }
      kept.push(current);
    }
    kept.push(keyframes[keyframes.length - 1]!);
    return new AnimationTrack({ target: track.target, valueType: track.valueType, keyframes: kept });
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
  if (clips.length === 0) {
    throw new Error("AnimationUtils.merge: at least one clip is required.");
  }
  for (const clip of clips) {
    if (!(clip instanceof AnimationClip)) {
      throw new Error("AnimationUtils.merge: every entry must be an AnimationClip.");
    }
  }
  const mergedTracks = new Map<string, { target: string; valueType: AnimationTrack["valueType"]; keyframes: Keyframe<AnimationValue>[] }>();
  const events: AnimationEventMarker[] = [];
  let offset = 0;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const key = `${track.target}${track.valueType}`;
      const entry = mergedTracks.get(key) ?? { target: track.target, valueType: track.valueType, keyframes: [] };
      if (!mergedTracks.has(key)) {
        mergedTracks.set(key, entry);
      }
      const boundaryTime = entry.keyframes.length > 0 ? entry.keyframes[entry.keyframes.length - 1]!.time : -1;
      for (const keyframe of track.keyframes) {
        const shifted = keyframe.time + offset;
        if (shifted === boundaryTime) {
          // Keep the existing boundary value for a continuous join.
          continue;
        }
        entry.keyframes.push({ ...keyframe, time: shifted, value: cloneAnimationValue(keyframe.value) });
      }
    }
    for (const event of clip.events) {
      events.push({ ...event, time: event.time + offset });
    }
    offset += clip.duration;
  }
  const tracks = [...mergedTracks.values()].map((entry) => new AnimationTrack({
    target: entry.target,
    valueType: entry.valueType,
    keyframes: entry.keyframes
  }));
  return new AnimationClip({ name, duration: offset, tracks, events });
}

/**
 * Namespace twin of three's `THREE.AnimationUtils`, for callers porting code
 * that references the utility as an object.
 */
export const AnimationUtils = {
  arraySlice,
  convertArray,
  isTypedArray,
  getKeyframeOrder,
  sortedArray,
  subclip,
  optimize,
  merge,
  makeClipAdditive,
  isClipAdditive
} as const;
