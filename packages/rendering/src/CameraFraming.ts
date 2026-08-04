import { multiplyMat4, orthographicMat4, perspectiveMat4, type Mat4, type Vec3 } from "@aura3d/scene";

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

/**
 * How an orthographic frame reconciles the subject's aspect with the viewport's.
 *
 * An orthographic frustum has no field of view to absorb a mismatch, so the
 * caller has to say which axis is authoritative. `contain` is the safe default
 * because it is the only mode that guarantees every bounds corner stays inside
 * clip space; the two `fit-*` modes deliberately let the other axis overflow so
 * a caller can pin a known-good extent (a floor plan's width, a character
 * sheet's height) and accept cropping.
 *
 * `stretch` reproduces the anisotropic mapping you get from a hand-written
 * frustum whose half-extents ignore the viewport aspect. It exists because that
 * is what an orthographic camera constructed directly from symmetric
 * half-extents does on a non-square canvas, and matching an external reference
 * render is impossible without it.
 */
export type OrthographicCameraFrameFitMode = "contain" | "fit-vertical" | "fit-horizontal" | "stretch";

export interface OrthographicCameraFrameOptions {
  readonly paddingRatio?: number;
  readonly minDistance?: number;
  readonly nearPadding?: number;
  readonly farPadding?: number;
  readonly yawRadians?: number;
  readonly pitchRadians?: number;
  readonly fitMode?: OrthographicCameraFrameFitMode;
}

export interface OrthographicCameraFrame {
  readonly center: Vec3;
  readonly cameraPosition: Vec3;
  readonly near: number;
  readonly far: number;
  readonly aspect: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly fitMode: OrthographicCameraFrameFitMode;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
}

/**
 * Bounds-derived orthographic framing, the parallel-projection counterpart to
 * {@link computePerspectiveCameraFrame}.
 *
 * Orthographic framing is not a cosmetic variant of perspective framing. CAD
 * views, isometric games, technical diagrams, floor plans, sprite bakes and
 * product turntables are all defined by the absence of foreshortening, so
 * approximating them with a long-lens perspective camera changes the image in
 * ways a viewer reads immediately. Before this helper existed the renderer's
 * auto-frame path could only build a perspective frustum, which meant a scene
 * that asked for an orthographic camera silently received a perspective one.
 */
export function computeOrthographicCameraFrame(
  bounds: CameraFrameBounds,
  viewport: CameraFrameViewport,
  options: OrthographicCameraFrameOptions = {}
): OrthographicCameraFrame {
  validateFrameBounds(bounds);
  validateViewport(viewport);
  const paddingRatio = options.paddingRatio ?? 0;
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0 || paddingRatio > 4) {
    throw new RangeError("Orthographic camera framing paddingRatio must be finite and in [0, 4].");
  }
  const minDistance = options.minDistance ?? 1;
  if (!Number.isFinite(minDistance) || minDistance <= 0) {
    throw new RangeError("Orthographic camera framing minDistance must be finite and positive.");
  }
  const nearPadding = options.nearPadding ?? 1;
  const farPadding = options.farPadding ?? 4;
  if (!Number.isFinite(nearPadding) || nearPadding < 0 || !Number.isFinite(farPadding) || farPadding < 0) {
    throw new RangeError("Orthographic camera framing near/far padding must be finite and non-negative.");
  }
  const yawRadians = options.yawRadians ?? 0;
  const pitchRadians = options.pitchRadians ?? 0;
  if (!Number.isFinite(yawRadians) || !Number.isFinite(pitchRadians) || Math.abs(pitchRadians) >= Math.PI / 2) {
    throw new RangeError("Orthographic camera framing yawRadians/pitchRadians must be finite, with pitch in (-PI/2, PI/2).");
  }
  const fitMode = options.fitMode ?? "contain";

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

  // Rotating the camera means the axis-aligned padded box no longer maps
  // directly onto screen axes, so the on-screen extent has to come from the
  // corners projected into the camera basis rather than from the box dimensions.
  let extentX = 0.001;
  let extentY = 0.001;
  let minLocalZ = Number.POSITIVE_INFINITY;
  let maxLocalZ = Number.NEGATIVE_INFINITY;
  for (const corner of boundsCorners(center, halfWidth, halfHeight, halfDepth)) {
    const local = [
      corner[0] - center[0],
      corner[1] - center[1],
      corner[2] - center[2]
    ] as const;
    extentX = Math.max(extentX, Math.abs(dot(local, basis.xAxis)));
    extentY = Math.max(extentY, Math.abs(dot(local, basis.yAxis)));
    const localZ = dot(local, basis.zAxis);
    minLocalZ = Math.min(minLocalZ, localZ);
    maxLocalZ = Math.max(maxLocalZ, localZ);
  }

  const { halfExtentX, halfExtentY } = resolveOrthographicHalfExtents(fitMode, extentX, extentY, aspect);

  // Parallel projection makes the camera's distance irrelevant to the image
  // scale, so distance only has to place the whole subject in front of the near
  // plane. Perspective framing solves for distance to control scale; here the
  // frustum half-extents already do that.
  const distance = Math.max(minDistance, maxLocalZ + nearPadding + 0.01);
  const cameraPosition: Vec3 = [
    center[0] + basis.zAxis[0] * distance,
    center[1] + basis.zAxis[1] * distance,
    center[2] + basis.zAxis[2] * distance
  ];
  const near = Math.max(0.01, distance - maxLocalZ - nearPadding);
  const far = Math.max(near + 1, distance - minLocalZ + farPadding);
  const viewMatrix = lookAtViewMatrix(cameraPosition, basis);
  const projectionMatrix = orthographicMat4(-halfExtentX, halfExtentX, -halfExtentY, halfExtentY, near, far);
  return {
    center,
    cameraPosition,
    near,
    far,
    aspect,
    left: -halfExtentX,
    right: halfExtentX,
    bottom: -halfExtentY,
    top: halfExtentY,
    fitMode,
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix)
  };
}

function resolveOrthographicHalfExtents(
  fitMode: OrthographicCameraFrameFitMode,
  extentX: number,
  extentY: number,
  aspect: number
): { readonly halfExtentX: number; readonly halfExtentY: number } {
  if (fitMode === "stretch") {
    return { halfExtentX: extentX, halfExtentY: extentY };
  }
  if (fitMode === "fit-vertical") {
    return { halfExtentX: extentY * aspect, halfExtentY: extentY };
  }
  if (fitMode === "fit-horizontal") {
    return { halfExtentX: extentX, halfExtentY: extentX / aspect };
  }
  const halfExtentY = Math.max(extentY, extentX / aspect);
  return { halfExtentX: halfExtentY * aspect, halfExtentY };
}

export interface OrthographicCameraViewOptions {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly near?: number;
  readonly far?: number;
  readonly eye?: Vec3;
  readonly target?: Vec3;
  readonly yawRadians?: number;
  readonly pitchRadians?: number;
}

/**
 * An explicit orthographic view, for callers who already know the frustum they
 * need rather than deriving it from bounds.
 *
 * Reproducing a reference render, matching a drawing scale such as 1:50, or
 * baking a sprite at a fixed world size all start from a known frustum, and the
 * only alternative was for the caller to assemble the projection and view
 * matrices by hand. That put 4x4 matrix construction in application code, where
 * a transposed or mis-signed term produces a plausible-looking but wrong image.
 */
export function computeOrthographicCameraView(options: OrthographicCameraViewOptions): OrthographicCameraFrame {
  const { left, right, bottom, top } = options;
  if (![left, right, bottom, top].every((value) => Number.isFinite(value))) {
    throw new RangeError("Orthographic camera view frustum bounds must be finite.");
  }
  if (left === right || bottom === top) {
    throw new RangeError("Orthographic camera view frustum must have non-zero width and height.");
  }
  const near = options.near ?? 0.1;
  const far = options.far ?? 1000;
  if (!Number.isFinite(near) || !Number.isFinite(far) || near === far) {
    throw new RangeError("Orthographic camera view near and far must be finite and distinct.");
  }
  const target = options.target ?? [0, 0, 0];
  const eye = options.eye ?? defaultOrthographicEye(target, Math.max(Math.abs(far), 1), options);
  const basis = orthographicViewBasis(eye, target);
  const viewMatrix = lookAtViewMatrix(eye, basis);
  const projectionMatrix = orthographicMat4(left, right, bottom, top, near, far);
  return {
    center: target,
    cameraPosition: eye,
    near,
    far,
    aspect: Math.abs((right - left) / (top - bottom)),
    left,
    right,
    bottom,
    top,
    fitMode: "stretch",
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix)
  };
}

function defaultOrthographicEye(
  target: Vec3,
  distance: number,
  options: Pick<OrthographicCameraViewOptions, "yawRadians" | "pitchRadians">
): Vec3 {
  const basis = cameraBasis(options.yawRadians ?? 0, options.pitchRadians ?? 0);
  return [
    target[0] + basis.zAxis[0] * distance,
    target[1] + basis.zAxis[1] * distance,
    target[2] + basis.zAxis[2] * distance
  ];
}

function orthographicViewBasis(eye: Vec3, target: Vec3): {
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly zAxis: Vec3;
} {
  const offset: Vec3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
  if (Math.hypot(offset[0], offset[1], offset[2]) <= 1e-8) {
    throw new RangeError("Orthographic camera view eye and target must not be identical.");
  }
  const zAxis = normalize(offset);
  // A camera looking straight down or straight up is collinear with world up,
  // which makes the usual cross product degenerate. Falling back to world
  // forward keeps top-down plan views working, which are one of the main
  // reasons to reach for an orthographic camera at all.
  const worldUp: Vec3 = Math.abs(zAxis[1]) > 0.9999 ? [0, 0, zAxis[1] > 0 ? 1 : -1] : [0, 1, 0];
  const xAxis = normalize(cross(worldUp, zAxis));
  const yAxis = normalize(cross(zAxis, xAxis));
  return { xAxis, yAxis, zAxis };
}
