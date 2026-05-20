import { invertMat4, multiplyMat4, type Mat4, type Vec3 } from "@galileo3d/scene";
import type { PerspectiveCameraFrame } from "./CameraFraming";

export type StereoEye = "left" | "right";
export type StereoLayout = "side-by-side" | "over-under";

export interface StereoViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StereoCameraRigOptions {
  readonly frame: Pick<PerspectiveCameraFrame, "cameraPosition" | "near" | "projectionMatrix" | "viewMatrix">;
  readonly viewport: StereoViewport;
  readonly eyeSeparation?: number;
  readonly convergenceDistance?: number;
  readonly layout?: StereoLayout;
}

export interface StereoEyeView {
  readonly eye: StereoEye;
  readonly eyeOffset: number;
  readonly cameraPosition: Vec3;
  readonly viewport: StereoViewport;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
}

export interface StereoCameraRig {
  readonly layout: StereoLayout;
  readonly eyeSeparation: number;
  readonly convergenceDistance: number;
  readonly views: readonly [StereoEyeView, StereoEyeView];
}

export function createStereoCameraRig(options: StereoCameraRigOptions): StereoCameraRig {
  validateViewport(options.viewport);
  const eyeSeparation = options.eyeSeparation ?? 0.064;
  const convergenceDistance = options.convergenceDistance ?? 10;
  const layout = options.layout ?? "side-by-side";
  if (!Number.isFinite(eyeSeparation) || eyeSeparation <= 0 || eyeSeparation > 1) {
    throw new RangeError("Stereo eyeSeparation must be finite and in (0, 1].");
  }
  if (!Number.isFinite(convergenceDistance) || convergenceDistance <= options.frame.near) {
    throw new RangeError("Stereo convergenceDistance must be finite and greater than the near plane.");
  }
  const half = eyeSeparation / 2;
  const left = createEyeView("left", -half, options, layout, convergenceDistance);
  const right = createEyeView("right", half, options, layout, convergenceDistance);
  return {
    layout,
    eyeSeparation,
    convergenceDistance,
    views: [left, right]
  };
}

function createEyeView(
  eye: StereoEye,
  eyeOffset: number,
  options: StereoCameraRigOptions,
  layout: StereoLayout,
  convergenceDistance: number
): StereoEyeView {
  const viewMatrix = multiplyMat4(translationMat4(-eyeOffset, 0, 0), options.frame.viewMatrix as Mat4);
  const projectionMatrix = offsetProjectionForConvergence(options.frame.projectionMatrix as Mat4, eyeOffset, options.frame.near, convergenceDistance);
  return {
    eye,
    eyeOffset,
    cameraPosition: offsetCameraPosition(options.frame.viewMatrix as Mat4, options.frame.cameraPosition, eyeOffset),
    viewport: eyeViewport(eye, options.viewport, layout),
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix)
  };
}

function offsetProjectionForConvergence(projection: Mat4, eyeOffset: number, near: number, convergenceDistance: number): Mat4 {
  const result = [...projection] as Mat4;
  result[8] = (result[8] ?? 0) + eyeOffset * near / convergenceDistance;
  return result;
}

function offsetCameraPosition(viewMatrix: Mat4, cameraPosition: readonly [number, number, number], eyeOffset: number): Vec3 {
  const inverseView = invertMat4(viewMatrix);
  const right: Vec3 = [inverseView[0], inverseView[1], inverseView[2]];
  return [
    cameraPosition[0] + right[0] * eyeOffset,
    cameraPosition[1] + right[1] * eyeOffset,
    cameraPosition[2] + right[2] * eyeOffset
  ];
}

function eyeViewport(eye: StereoEye, viewport: StereoViewport, layout: StereoLayout): StereoViewport {
  if (layout === "side-by-side") {
    const halfWidth = Math.floor(viewport.width / 2);
    return eye === "left"
      ? { x: viewport.x, y: viewport.y, width: halfWidth, height: viewport.height }
      : { x: viewport.x + halfWidth, y: viewport.y, width: viewport.width - halfWidth, height: viewport.height };
  }
  const halfHeight = Math.floor(viewport.height / 2);
  return eye === "left"
    ? { x: viewport.x, y: viewport.y, width: viewport.width, height: halfHeight }
    : { x: viewport.x, y: viewport.y + halfHeight, width: viewport.width, height: viewport.height - halfHeight };
}

function validateViewport(viewport: StereoViewport): void {
  const values = [viewport.x, viewport.y, viewport.width, viewport.height];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Stereo viewport values must be finite.");
  }
  if (viewport.width < 2 || viewport.height < 2) {
    throw new RangeError("Stereo viewport dimensions must be at least 2x2.");
  }
}

function translationMat4(x: number, y: number, z: number): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}
