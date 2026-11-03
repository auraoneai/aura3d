/** Rigid transforms supported by the camera-following weather volume. */
export interface WeatherTransformFields {
  readonly position?: unknown;
  readonly pivot?: unknown;
  readonly rotation?: unknown;
  readonly quaternion?: unknown;
  readonly rotationOrder?: unknown;
  readonly scale?: unknown;
  readonly lookAt?: unknown;
  readonly attachTo?: unknown;
}

const EPSILON = 1e-5;
const ORDERS = new Set(["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]);
const finiteVector = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((part) => typeof part === "number" && Number.isFinite(part));

/** Reject unsupported inputs before committing a weather emitter or runtime mutation. */
export function assertWeatherTransformFields(value: WeatherTransformFields): void {
  for (const key of ["position", "pivot", "rotation"] as const) {
    if (value[key] !== undefined && !finiteVector(value[key], 3)) {
      throw new RangeError(`WEATHER_TRANSFORM_INVALID: ${key} must be a finite vec3.`);
    }
  }
  if (value.quaternion !== undefined) {
    if (!finiteVector(value.quaternion, 4) || Math.abs(Math.hypot(...value.quaternion) - 1) > EPSILON) {
      throw new RangeError("WEATHER_TRANSFORM_INVALID: quaternion must be finite and unit length.");
    }
  }
  if (value.rotationOrder !== undefined && (typeof value.rotationOrder !== "string" || !ORDERS.has(value.rotationOrder))) {
    throw new RangeError("WEATHER_TRANSFORM_INVALID: rotationOrder is not supported.");
  }
  if (value.scale !== undefined) {
    const scale = typeof value.scale === "number" ? [value.scale, value.scale, value.scale] : value.scale;
    if (!finiteVector(scale, 3) || scale.some((part) => Math.abs(part - 1) > EPSILON)) {
      throw new RangeError("WEATHER_TRANSFORM_UNSUPPORTED: weather and its ancestors require unit scale.");
    }
  }
  if (value.lookAt !== undefined) throw new RangeError("WEATHER_TRANSFORM_UNSUPPORTED: weather lookAt hierarchies are not supported.");
  if (value.attachTo !== undefined) throw new RangeError("WEATHER_TRANSFORM_UNSUPPORTED: weather attachTo is not supported.");
}

/** Validate an affine proper rigid matrix; the returned snapshot is caller-owned. */
export function rigidWeatherMatrix(value: ArrayLike<number>): Float32Array {
  if (value.length !== 16) throw new RangeError("WEATHER_TRANSFORM_INVALID: world matrix must have 16 finite values.");
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(value[i])) throw new RangeError("WEATHER_TRANSFORM_INVALID: world matrix must have 16 finite values.");
  }
  const m = Float32Array.from(value);
  if (!m.every(Number.isFinite)) throw new RangeError("WEATHER_TRANSFORM_INVALID: world matrix must have 16 finite values.");
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) {
    throw new RangeError("WEATHER_TRANSFORM_UNSUPPORTED: world matrix must be affine and rigid.");
  }
  const dot = (a: number, b: number) => m[a] * m[b] + m[a + 1] * m[b + 1] + m[a + 2] * m[b + 2];
  const determinant = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  if ([0, 4, 8].some((a) => Math.abs(dot(a, a) - 1) > EPSILON) ||
      Math.abs(dot(0, 4)) > EPSILON || Math.abs(dot(0, 8)) > EPSILON || Math.abs(dot(4, 8)) > EPSILON ||
      Math.abs(determinant - 1) > EPSILON) {
    throw new RangeError("WEATHER_TRANSFORM_UNSUPPORTED: scale, shear, reflection and singular transforms are not supported.");
  }
  return m;
}

export function isIdentityWeatherMatrix(m: Float32Array): boolean {
  for (let i = 0; i < 16; i++) if (m[i] !== (i % 5 === 0 ? 1 : 0)) return false;
  return true;
}

/** Map the camera into local coordinates for wrapping and local edge fades. */
export function weatherLocalCamera(m: Float32Array, camera: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = [camera[0] - m[12], camera[1] - m[13], camera[2] - m[14]];
  const local: [number, number, number] = [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
  if (!local.every((part) => Number.isFinite(part) && Number.isFinite(Math.fround(part)))) {
    throw new RangeError("WEATHER_TRANSFORM_INVALID: local camera position must be finite and representable.");
  }
  return local;
}

/** Map packed positions as points and streak velocities as vectors. Size stays in world units. */
export function weatherInstancesToWorld(data: Float32Array, count: number, m: Float32Array): void {
  for (let i = 0; i < count * 16; i += 16) {
    const x = data[i], y = data[i + 1], z = data[i + 2];
    const vx = data[i + 4], vy = data[i + 5], vz = data[i + 6];
    const px = m[0] * x + m[4] * y + m[8] * z + m[12];
    const py = m[1] * x + m[5] * y + m[9] * z + m[13];
    const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const dx = m[0] * vx + m[4] * vy + m[8] * vz;
    const dy = m[1] * vx + m[5] * vy + m[9] * vz;
    const dz = m[2] * vx + m[6] * vy + m[10] * vz;
    if (!Number.isFinite(Math.fround(px)) || !Number.isFinite(Math.fround(py)) || !Number.isFinite(Math.fround(pz)) ||
        !Number.isFinite(Math.fround(dx)) || !Number.isFinite(Math.fround(dy)) || !Number.isFinite(Math.fround(dz))) {
      throw new RangeError("WEATHER_TRANSFORM_INVALID: transformed particles must be finite and representable.");
    }
    data[i] = px; data[i + 1] = py; data[i + 2] = pz;
    data[i + 4] = dx; data[i + 5] = dy; data[i + 6] = dz;
  }
}
