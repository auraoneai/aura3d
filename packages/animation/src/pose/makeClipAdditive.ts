/**
 * PRD-06 T1.4 — convert a clip to additive form by subtracting a reference
 * pose per track, matching three r185 `AnimationUtils.makeClipAdditive`:
 *
 *  - quaternion tracks: `delta = normalize(ref⁻¹ · sample)`
 *  - translation **and scale** tracks: `delta = sample − ref`
 *  - scalar/number-array tracks: `delta = sample − ref`
 *  - boolean/string tracks: passed through (no additive semantics)
 *
 * The reference is frame 0 of the same clip by default, or an explicit
 * `{ clip, time }` pair (e.g. a bind clip). Tracks absent from the reference
 * clip fall back to their own first keyframe, as three does.
 */

import { AnimationClip } from "../AnimationClip.js";
import { AnimationTrack } from "../AnimationTrack.js";
import type { AnimationValue, Keyframe, Quat } from "../Keyframe.js";

export type AdditiveReference = number | { readonly clip: AnimationClip; readonly time?: number };

export function makeClipAdditive(clip: AnimationClip, reference?: AdditiveReference): AnimationClip {
  const referenceClip = typeof reference === "object" && reference !== null ? reference.clip : clip;
  const referenceTime = typeof reference === "number"
    ? reference
    : typeof reference === "object" && reference !== null && reference.time !== undefined
      ? reference.time
      : 0;

  const referenceTracks = new Map<string, AnimationTrack>();
  for (const track of referenceClip.tracks) referenceTracks.set(track.target, track);

  const tracks = clip.tracks.map((track) => {
    const referenceTrack = referenceTracks.get(track.target);
    const referenceValue = referenceTrack
      ? referenceTrack.sample(referenceTime)
      : track.keyframes[0]!.value;
    const keyframes = track.keyframes.map((keyframe) => ({
      ...keyframe,
      value: subtractValue(track.valueType, keyframe.value, referenceValue)
    })) as Keyframe<AnimationValue>[];
    return new AnimationTrack({ target: track.target, valueType: track.valueType, keyframes });
  });

  return new AnimationClip({
    name: `${clip.name}.additive`,
    duration: clip.duration,
    tracks,
    events: clip.events
  });
}

function subtractValue(valueType: string, value: AnimationValue, reference: AnimationValue): AnimationValue {
  switch (valueType) {
    case "quaternion": {
      const r = reference as Quat;
      const q = value as Quat;
      const inv = quatInvertNormalized(r);
      return quatNormalize(quatMultiply(inv, q));
    }
    case "vector3": {
      const r = reference as readonly number[];
      const v = value as readonly number[];
      return [v[0]! - r[0]!, v[1]! - r[1]!, v[2]! - r[2]!] as const;
    }
    case "scalar":
      return (value as number) - (reference as number);
    case "number-array": {
      const r = reference as readonly number[];
      const v = value as readonly number[];
      return v.map((component, index) => component - (r[index] ?? 0));
    }
    case "boolean":
    case "string":
      return value;
    default:
      return value;
  }
}

function quatInvertNormalized(q: Quat): Quat {
  // Inverse of a unit quaternion is its conjugate; normalize first so
  // non-unit inputs still produce a true inverse (as three does not need to).
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-9) return [0, 0, 0, 1];
  const invLengthSq = 1 / (length * length);
  return [-q[0] * invLengthSq, -q[1] * invLengthSq, -q[2] * invLengthSq, q[3] * invLengthSq];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-9) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}
