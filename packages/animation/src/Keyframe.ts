export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export type NumberArray = readonly number[];

export type AnimationValue = number | boolean | string | Vec3 | Quat | NumberArray;

export type InterpolationMode = "step" | "linear" | "cubicspline";

export type Keyframe<T extends AnimationValue = AnimationValue> = {
  readonly time: number;
  readonly value: T;
  readonly interpolation?: InterpolationMode;
  readonly inTangent?: T;
  readonly outTangent?: T;
};

export type SerializedKeyframe<T extends AnimationValue = AnimationValue> = {
  readonly time: number;
  readonly value: T;
  readonly interpolation?: InterpolationMode;
  readonly inTangent?: T;
  readonly outTangent?: T;
};

export function validateKeyframes<T extends AnimationValue>(keyframes: readonly Keyframe<T>[]): void {
  if (keyframes.length === 0) {
    throw new Error("Animation track requires at least one keyframe.");
  }
  let previous = -Number.MAX_VALUE;
  for (const keyframe of keyframes) {
    if (!Number.isFinite(keyframe.time) || keyframe.time < 0) {
      throw new Error("Keyframe time must be finite and non-negative.");
    }
    if (keyframe.time <= previous) {
      throw new Error("Keyframes must be sorted by strictly increasing time.");
    }
    previous = keyframe.time;
  }
}

export function serializeKeyframe<T extends AnimationValue>(keyframe: Keyframe<T>): SerializedKeyframe<T> {
  return {
    time: keyframe.time,
    value: cloneAnimationValue(keyframe.value),
    ...(keyframe.interpolation ? { interpolation: keyframe.interpolation } : {}),
    ...(keyframe.inTangent !== undefined ? { inTangent: cloneAnimationValue(keyframe.inTangent) } : {}),
    ...(keyframe.outTangent !== undefined ? { outTangent: cloneAnimationValue(keyframe.outTangent) } : {})
  };
}

export function deserializeKeyframe<T extends AnimationValue>(keyframe: SerializedKeyframe<T>): Keyframe<T> {
  return serializeKeyframe(keyframe);
}

export function cloneAnimationValue<T extends AnimationValue>(value: T): T {
  return Array.isArray(value) ? ([...value] as unknown as T) : value;
}

export function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerpNumber(a[0], b[0], t), lerpNumber(a[1], b[1], t), lerpNumber(a[2], b[2], t)];
}

export function normalizeQuat(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-9) {
    return [0, 0, 0, 1];
  }
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

export function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return normalizeQuat([lerpNumber(a[0], bx, t), lerpNumber(a[1], by, t), lerpNumber(a[2], bz, t), lerpNumber(a[3], bw, t)]);
  }
  const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function identityMat4(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function composeMat4(translation: Vec3 = [0, 0, 0], rotation: Quat = [0, 0, 0, 1], scale: Vec3 = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = normalizeQuat(rotation);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * scale[0], (xy + wz) * scale[0], (xz - wy) * scale[0], 0,
    (xy - wz) * scale[1], (1 - (xx + zz)) * scale[1], (yz + wx) * scale[1], 0,
    (xz + wy) * scale[2], (yz - wx) * scale[2], (1 - (xx + yy)) * scale[2], 0,
    translation[0], translation[1], translation[2], 1
  ];
}

export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const a0 = a[row * 4]!;
      const a1 = a[row * 4 + 1]!;
      const a2 = a[row * 4 + 2]!;
      const a3 = a[row * 4 + 3]!;
      out[col + row * 4] =
        a0 * b[col]! +
        a1 * b[col + 4]! +
        a2 * b[col + 8]! +
        a3 * b[col + 12]!;
    }
  }
  return out as unknown as Mat4;
}

export function invertTranslationMat4(matrix: Mat4): Mat4 {
  return [
    matrix[0], matrix[4], matrix[8], 0,
    matrix[1], matrix[5], matrix[9], 0,
    matrix[2], matrix[6], matrix[10], 0,
    -(matrix[12] * matrix[0] + matrix[13] * matrix[1] + matrix[14] * matrix[2]),
    -(matrix[12] * matrix[4] + matrix[13] * matrix[5] + matrix[14] * matrix[6]),
    -(matrix[12] * matrix[8] + matrix[13] * matrix[9] + matrix[14] * matrix[10]),
    1
  ];
}
