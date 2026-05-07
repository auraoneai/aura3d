import { cloneAnimationValue, deserializeKeyframe, lerpNumber, lerpVec3, serializeKeyframe, slerpQuat, validateKeyframes, type AnimationValue, type Keyframe, type SerializedKeyframe } from "./Keyframe.js";

export type TrackValueType = "scalar" | "vector3" | "quaternion" | "number-array" | "boolean" | "string";

export type AnimationTrackDescriptor<T extends AnimationValue = AnimationValue> = {
  readonly target: string;
  readonly valueType: TrackValueType;
  readonly keyframes: readonly Keyframe<T>[];
};

export type SerializedAnimationTrack<T extends AnimationValue = AnimationValue> = {
  readonly target: string;
  readonly valueType: TrackValueType;
  readonly keyframes: readonly SerializedKeyframe<T>[];
};

export class AnimationTrack<T extends AnimationValue = AnimationValue> {
  readonly target: string;
  readonly valueType: TrackValueType;
  readonly keyframes: readonly Keyframe<T>[];
  readonly duration: number;

  constructor(descriptor: AnimationTrackDescriptor<T>) {
    if (descriptor.target.trim().length === 0) {
      throw new Error("AnimationTrack target cannot be empty.");
    }
    validateKeyframes(descriptor.keyframes);
    this.target = descriptor.target;
    this.valueType = descriptor.valueType;
    this.keyframes = descriptor.keyframes.map((keyframe) => ({ ...keyframe, value: cloneAnimationValue(keyframe.value) }));
    this.duration = this.keyframes[this.keyframes.length - 1]!.time;
  }

  sample(time: number): T {
    if (!Number.isFinite(time)) {
      throw new Error("AnimationTrack sample time must be finite.");
    }
    if (time <= this.keyframes[0]!.time) {
      return cloneAnimationValue(this.keyframes[0]!.value);
    }
    const last = this.keyframes[this.keyframes.length - 1]!;
    if (time >= last.time) {
      return cloneAnimationValue(last.value);
    }
    for (let index = 0; index < this.keyframes.length - 1; index += 1) {
      const a = this.keyframes[index]!;
      const b = this.keyframes[index + 1]!;
      if (time >= a.time && time <= b.time) {
        if (a.interpolation === "step" || b.time === a.time) {
          return cloneAnimationValue(a.value);
        }
        const t = (time - a.time) / (b.time - a.time);
        if (a.interpolation === "cubicspline") {
          return interpolateCubicSpline(this.valueType, a.value, b.value, a.outTangent, b.inTangent, t, b.time - a.time) as T;
        }
        return interpolate(this.valueType, a.value, b.value, t) as T;
      }
    }
    return cloneAnimationValue(last.value);
  }

  toJSON(): SerializedAnimationTrack<T> {
    return {
      target: this.target,
      valueType: this.valueType,
      keyframes: this.keyframes.map((keyframe) => serializeKeyframe(keyframe))
    };
  }

  static fromJSON<T extends AnimationValue = AnimationValue>(serialized: SerializedAnimationTrack<T>): AnimationTrack<T> {
    return new AnimationTrack({
      target: serialized.target,
      valueType: serialized.valueType,
      keyframes: serialized.keyframes.map((keyframe) => deserializeKeyframe(keyframe))
    });
  }
}

function interpolateCubicSpline(
  type: TrackValueType,
  a: AnimationValue,
  b: AnimationValue,
  outTangent: AnimationValue | undefined,
  inTangent: AnimationValue | undefined,
  t: number,
  deltaTime: number
): AnimationValue {
  if (outTangent === undefined || inTangent === undefined) {
    throw new Error("CUBICSPLINE keyframes require outTangent on the first keyframe and inTangent on the next keyframe.");
  }
  switch (type) {
    case "scalar":
      return cubicScalar(a as number, b as number, outTangent as number, inTangent as number, t, deltaTime);
    case "vector3":
      return [
        cubicScalar((a as [number, number, number])[0], (b as [number, number, number])[0], (outTangent as [number, number, number])[0], (inTangent as [number, number, number])[0], t, deltaTime),
        cubicScalar((a as [number, number, number])[1], (b as [number, number, number])[1], (outTangent as [number, number, number])[1], (inTangent as [number, number, number])[1], t, deltaTime),
        cubicScalar((a as [number, number, number])[2], (b as [number, number, number])[2], (outTangent as [number, number, number])[2], (inTangent as [number, number, number])[2], t, deltaTime)
      ];
    case "quaternion":
      return normalizeCubicQuaternion(a as [number, number, number, number], b as [number, number, number, number], outTangent as [number, number, number, number], inTangent as [number, number, number, number], t, deltaTime);
    case "number-array":
      return cubicNumberArray(a as readonly number[], b as readonly number[], outTangent as readonly number[], inTangent as readonly number[], t, deltaTime);
    case "boolean":
    case "string":
      throw new Error(`CUBICSPLINE interpolation is not supported for ${type} animation tracks.`);
  }
}

function cubicScalar(a: number, b: number, outTangent: number, inTangent: number, t: number, deltaTime: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a +
    (t3 - 2 * t2 + t) * deltaTime * outTangent +
    (-2 * t3 + 3 * t2) * b +
    (t3 - t2) * deltaTime * inTangent
  );
}

function cubicNumberArray(
  a: readonly number[],
  b: readonly number[],
  outTangent: readonly number[],
  inTangent: readonly number[],
  t: number,
  deltaTime: number
): readonly number[] {
  if (a.length !== b.length || a.length !== outTangent.length || b.length !== inTangent.length) {
    throw new Error("CUBICSPLINE number-array keyframes require matching value and tangent lengths.");
  }
  return a.map((value, index) => cubicScalar(value, b[index]!, outTangent[index]!, inTangent[index]!, t, deltaTime));
}

function normalizeCubicQuaternion(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  outTangent: readonly [number, number, number, number],
  inTangent: readonly [number, number, number, number],
  t: number,
  deltaTime: number
): readonly [number, number, number, number] {
  return slerpQuat(
    [0, 0, 0, 1],
    [
      cubicScalar(a[0], b[0], outTangent[0], inTangent[0], t, deltaTime),
      cubicScalar(a[1], b[1], outTangent[1], inTangent[1], t, deltaTime),
      cubicScalar(a[2], b[2], outTangent[2], inTangent[2], t, deltaTime),
      cubicScalar(a[3], b[3], outTangent[3], inTangent[3], t, deltaTime)
    ],
    1
  );
}

function interpolate(type: TrackValueType, a: AnimationValue, b: AnimationValue, t: number): AnimationValue {
  switch (type) {
    case "scalar":
      return lerpNumber(a as number, b as number, t);
    case "vector3":
      return lerpVec3(a as [number, number, number], b as [number, number, number], t);
    case "quaternion":
      return slerpQuat(a as [number, number, number, number], b as [number, number, number, number], t);
    case "number-array":
      return interpolateNumberArray(a as readonly number[], b as readonly number[], t);
    case "boolean":
    case "string":
      return t < 1 ? a : b;
  }
}

function interpolateNumberArray(a: readonly number[], b: readonly number[], t: number): readonly number[] {
  if (a.length !== b.length) {
    throw new Error("number-array animation keyframes require matching lengths.");
  }
  return a.map((value, index) => lerpNumber(value, b[index]!, t));
}
