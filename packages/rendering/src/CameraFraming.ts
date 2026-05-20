import { multiplyMat4, perspectiveMat4, type Mat4, type Vec3 } from "@galileo3d/scene";

export interface CameraFrameBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface CameraFrameViewport {
  readonly width: number;
  readonly height: number;
}

export interface PerspectiveCameraFrameOptions {
  readonly fovYRadians?: number;
  readonly paddingRatio?: number;
  readonly minDistance?: number;
  readonly nearPadding?: number;
  readonly farPadding?: number;
  readonly yawRadians?: number;
  readonly pitchRadians?: number;
}

export interface PerspectiveCameraFrame {
  readonly center: Vec3;
  readonly cameraPosition: Vec3;
  readonly near: number;
  readonly far: number;
  readonly fovYRadians: number;
  readonly aspect: number;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
}

export function computePerspectiveCameraFrame(
  bounds: CameraFrameBounds,
  viewport: CameraFrameViewport,
  options: PerspectiveCameraFrameOptions = {}
): PerspectiveCameraFrame {
  validateFrameBounds(bounds);
  validateViewport(viewport);
  const fovYRadians = options.fovYRadians ?? Math.PI / 3;
  if (!Number.isFinite(fovYRadians) || fovYRadians <= 0 || fovYRadians >= Math.PI) {
    throw new RangeError("Perspective camera framing fovYRadians must be finite and in (0, PI).");
  }
  const paddingRatio = options.paddingRatio ?? 0;
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0 || paddingRatio > 4) {
    throw new RangeError("Perspective camera framing paddingRatio must be finite and in [0, 4].");
  }
  const minDistance = options.minDistance ?? 1;
  if (!Number.isFinite(minDistance) || minDistance <= 0) {
    throw new RangeError("Perspective camera framing minDistance must be finite and positive.");
  }
  const nearPadding = options.nearPadding ?? 1;
  const farPadding = options.farPadding ?? 4;
  if (!Number.isFinite(nearPadding) || nearPadding < 0 || !Number.isFinite(farPadding) || farPadding < 0) {
    throw new RangeError("Perspective camera framing near/far padding must be finite and non-negative.");
  }
  const yawRadians = options.yawRadians ?? 0;
  const pitchRadians = options.pitchRadians ?? 0;
  if (!Number.isFinite(yawRadians) || !Number.isFinite(pitchRadians) || Math.abs(pitchRadians) >= Math.PI / 2) {
    throw new RangeError("Perspective camera framing yawRadians/pitchRadians must be finite, with pitch in (-PI/2, PI/2).");
  }

  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
  const paddedScale = 1 + paddingRatio;
  const halfWidth = Math.max((bounds.max[0] - bounds.min[0]) / 2 * paddedScale, 0.001);
  const halfHeight = Math.max((bounds.max[1] - bounds.min[1]) / 2 * paddedScale, 0.001);
  const halfDepth = Math.max((bounds.max[2] - bounds.min[2]) / 2 * paddedScale, 0.001);
  const aspect = viewport.width / viewport.height;
  const basis = cameraBasis(yawRadians, pitchRadians);
  const tanHalfY = Math.tan(fovYRadians / 2);
  const tanHalfX = tanHalfY * aspect;
  const corners = boundsCorners(center, halfWidth, halfHeight, halfDepth);
  let distance = minDistance;
  let minLocalZ = Number.POSITIVE_INFINITY;
  let maxLocalZ = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const local = [
      corner[0] - center[0],
      corner[1] - center[1],
      corner[2] - center[2]
    ] as const;
    const localX = dot(local, basis.xAxis);
    const localY = dot(local, basis.yAxis);
    const localZ = dot(local, basis.zAxis);
    minLocalZ = Math.min(minLocalZ, localZ);
    maxLocalZ = Math.max(maxLocalZ, localZ);
    distance = Math.max(
      distance,
      localZ + Math.abs(localX) / tanHalfX,
      localZ + Math.abs(localY) / tanHalfY,
      localZ + 0.01
    );
  }
  const cameraPosition: Vec3 = [
    center[0] + basis.zAxis[0] * distance,
    center[1] + basis.zAxis[1] * distance,
    center[2] + basis.zAxis[2] * distance
  ];
  const nearestDepth = distance - maxLocalZ;
  const farthestDepth = distance - minLocalZ;
  const near = Math.max(0.01, nearestDepth - nearPadding);
  const far = Math.max(near + 1, farthestDepth + farPadding);
  const viewMatrix = lookAtViewMatrix(cameraPosition, basis);
  const projectionMatrix = perspectiveMat4(fovYRadians, aspect, near, far);
  return {
    center,
    cameraPosition,
    near,
    far,
    fovYRadians,
    aspect,
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix)
  };
}

function validateFrameBounds(bounds: CameraFrameBounds): void {
  const values = [...bounds.min, ...bounds.max];
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Perspective camera framing bounds must contain finite min/max vectors.");
  }
  if (bounds.max[0] < bounds.min[0] || bounds.max[1] < bounds.min[1] || bounds.max[2] < bounds.min[2]) {
    throw new RangeError("Perspective camera framing bounds max must be greater than or equal to min.");
  }
}

function validateViewport(viewport: CameraFrameViewport): void {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("Perspective camera framing viewport dimensions must be finite and positive.");
  }
}

function boundsCorners(center: Vec3, halfWidth: number, halfHeight: number, halfDepth: number): readonly Vec3[] {
  return [
    [center[0] - halfWidth, center[1] - halfHeight, center[2] - halfDepth],
    [center[0] - halfWidth, center[1] - halfHeight, center[2] + halfDepth],
    [center[0] - halfWidth, center[1] + halfHeight, center[2] - halfDepth],
    [center[0] - halfWidth, center[1] + halfHeight, center[2] + halfDepth],
    [center[0] + halfWidth, center[1] - halfHeight, center[2] - halfDepth],
    [center[0] + halfWidth, center[1] - halfHeight, center[2] + halfDepth],
    [center[0] + halfWidth, center[1] + halfHeight, center[2] - halfDepth],
    [center[0] + halfWidth, center[1] + halfHeight, center[2] + halfDepth]
  ];
}

function cameraBasis(yawRadians: number, pitchRadians: number): {
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly zAxis: Vec3;
} {
  const cosPitch = Math.cos(pitchRadians);
  const forward = normalize([
    Math.sin(yawRadians) * cosPitch,
    Math.sin(pitchRadians),
    -Math.cos(yawRadians) * cosPitch
  ]);
  const zAxis = normalize([-forward[0], -forward[1], -forward[2]]);
  const worldUp: Vec3 = [0, 1, 0];
  const xAxis = normalize(cross(worldUp, zAxis));
  const yAxis = normalize(cross(zAxis, xAxis));
  return { xAxis, yAxis, zAxis };
}

function lookAtViewMatrix(cameraPosition: Vec3, basis: {
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly zAxis: Vec3;
}): Mat4 {
  return [
    basis.xAxis[0], basis.yAxis[0], basis.zAxis[0], 0,
    basis.xAxis[1], basis.yAxis[1], basis.zAxis[1], 0,
    basis.xAxis[2], basis.yAxis[2], basis.zAxis[2], 0,
    -dot(basis.xAxis, cameraPosition), -dot(basis.yAxis, cameraPosition), -dot(basis.zAxis, cameraPosition), 1
  ];
}

function dot(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: readonly [number, number, number], right: readonly [number, number, number]): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) throw new RangeError("Perspective camera framing could not build a stable camera basis.");
  return [value[0] / length, value[1] / length, value[2] / length];
}
