import { computePerspectiveCameraFrame } from "@aura3d/rendering";
import type { ProductAsset, ProductCameraFrame, ProductCameraOptions, ProductCameraPreset } from "./ProductTypes";

const CAMERA_PRESETS: Record<ProductCameraPreset, { readonly yaw: number; readonly pitch: number; readonly padding: number }> = {
  "front-three-quarter": { yaw: -0.42, pitch: -0.16, padding: 0.22 },
  "side-profile": { yaw: Math.PI / 2, pitch: -0.08, padding: 0.28 },
  "top-detail": { yaw: -0.22, pitch: -0.92, padding: 0.2 },
  "macro-detail": { yaw: -0.5, pitch: -0.12, padding: 0.02 }
};

export function createProductCameraFrame(asset: ProductAsset, options: ProductCameraOptions = {}): ProductCameraFrame {
  const preset = options.preset ?? "front-three-quarter";
  const viewport = options.viewport ?? { width: 1280, height: 900 };
  const config = CAMERA_PRESETS[preset];
  const frame = computePerspectiveCameraFrame(asset.resources.bounds, viewport, {
    paddingRatio: options.paddingRatio ?? config.padding,
    yawRadians: config.yaw,
    pitchRadians: config.pitch,
    nearPadding: preset === "macro-detail" ? 0.04 : 0.16,
    farPadding: 2.4,
    minDistance: preset === "macro-detail" ? 0.35 : 1
  });
  const camera = {
    projectionMatrix: frame.projectionMatrix,
    viewMatrix: frame.viewMatrix,
    viewProjectionMatrix: frame.viewProjectionMatrix,
    cameraPosition: frame.cameraPosition
  };
  validateProductCameraFrame({ preset, frame, camera });
  return { preset, frame, camera };
}

export function validateProductCameraFrame(frame: ProductCameraFrame): void {
  const numbers = [
    ...frame.frame.center,
    ...frame.frame.cameraPosition,
    frame.frame.near,
    frame.frame.far,
    frame.frame.aspect,
    ...Array.from(frame.frame.viewProjectionMatrix)
  ];
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`Product camera frame ${frame.preset} contains a non-finite value.`);
  }
  if (frame.frame.far <= frame.frame.near) {
    throw new RangeError(`Product camera frame ${frame.preset} far plane must exceed near plane.`);
  }
}
