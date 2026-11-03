/** Convert values and controls into a reference-relative animation space. */
import { AnimationClip } from "../AnimationClip.js";
import { AnimationTrack, type TrackValueType } from "../AnimationTrack.js";
import { AnimationValidationError, cloneAnimationValue, type AnimationValue, type Keyframe, type Quat } from "../Keyframe.js";

export type AdditiveReference = number | { readonly clip: AnimationClip; readonly time?: number };
const additiveClips = new WeakSet<AnimationClip>();

/** Whether this clip was produced by the additive conversion. */
export function isClipAdditive(clip: AnimationClip): boolean {
  return additiveClips.has(clip);
}

/**
 * Translate numeric channels and rotate quaternion channels into a reference
 * pose's coordinate system. Derivatives are vectors; Bézier handles are
 * points, so the two must be transformed differently.
 */
export function makeClipAdditive(clip: AnimationClip, reference?: AdditiveReference): AnimationClip {
  const referenceClip = typeof reference === "object" && reference !== null ? reference.clip : clip;
  const referenceTime = typeof reference === "number" ? reference : reference?.time ?? 0;
  if (!Number.isFinite(referenceTime)) {
    throw new AnimationValidationError("ANIMATION_REFERENCE_INVALID", "reference.time", "Reference time must be finite.");
  }
  const referenceTracks = new Map(referenceClip.tracks.map((track) => [track.target, track]));
  const tracks = clip.tracks.map((track) => {
    const matching = referenceTracks.get(track.target);
    if (matching && (matching.valueType !== track.valueType || matching.valueSize !== track.valueSize)) {
      throw new AnimationValidationError("ANIMATION_REFERENCE_INCOMPATIBLE", "reference.clip", `Reference track ${track.target} has an incompatible value type or width.`);
    }
    const referenceValue = matching ? matching.sample(referenceTime) : track.keyframes[0]!.value;
    const transformed = track.keyframes.map((key, index): Keyframe => {
      const previousMode = index > 0 ? track.keyframes[index - 1]!.interpolation : undefined;
      return {
        ...key,
        value: changeBasis(track.valueType, key.value, referenceValue, true),
        ...(key.inTangent === undefined ? {} : { inTangent: changeBasis(track.valueType, key.inTangent, referenceValue, previousMode === "bezier") }),
        ...(key.outTangent === undefined ? {} : { outTangent: changeBasis(track.valueType, key.outTangent, referenceValue, key.interpolation === "bezier") })
      };
    });
    return new AnimationTrack({ target: track.target, valueType: track.valueType, valueSize: track.valueSize, keyframes: transformed });
  });
  const result = new AnimationClip({ name: `${clip.name}.additive`, duration: clip.duration, tracks, events: clip.events });
  additiveClips.add(result);
  return result;
}

function changeBasis(type: TrackValueType, value: AnimationValue, reference: AnimationValue, point: boolean): AnimationValue {
  if (type === "quaternion") return rotateQuaternion(value as Quat, reference as Quat);
  if (!point || type === "boolean" || type === "string") return cloneAnimationValue(value);
  if (type === "scalar") return (value as number) - (reference as number);
  const origin = reference as readonly number[];
  return (value as readonly number[]).map((component, index) => component - origin[index]!);
}

/** Multiply by the unit conjugate of the reference without normalizing derivatives. */
function rotateQuaternion(value: Quat, reference: Quat): Quat {
  const magnitude = Math.hypot(...reference);
  if (magnitude < 1e-9) return [...value];
  const [x, y, z, w] = reference.map((part) => part / magnitude) as unknown as Quat;
  const [vx, vy, vz, vw] = value;
  // Scalar-vector form of (w, -v) × (vw, vv):
  // vector = w·vv - vw·v - v×vv; scalar = w·vw + dot(v,vv).
  return [
    w * vx - vw * x - (y * vz - z * vy),
    w * vy - vw * y - (z * vx - x * vz),
    w * vz - vw * z - (x * vy - y * vx),
    w * vw + x * vx + y * vy + z * vz
  ];
}
