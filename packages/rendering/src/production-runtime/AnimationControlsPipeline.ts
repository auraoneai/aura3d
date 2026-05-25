import { computePerspectiveCameraFrame, type CameraFrameBounds, type PerspectiveCameraFrame } from "../CameraFraming";

export interface V6AnimationMetadataInput {
  readonly assetId: string;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly primitiveCount: number;
  readonly materialCount: number;
}

export interface V6AnimationWorkflowSummary {
  readonly assetId: string;
  readonly importedAnimation: boolean;
  readonly skinningReady: boolean;
  readonly morphTargetsReady: boolean;
  readonly renderable: boolean;
  readonly warnings: readonly string[];
}

export interface V6OrbitControlPreset {
  readonly target: readonly [number, number, number];
  readonly distance: number;
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly minDistance: number;
  readonly maxDistance: number;
}

export function summarizeV6AnimationWorkflow(input: V6AnimationMetadataInput): V6AnimationWorkflowSummary {
  const importedAnimation = input.animationCount > 0;
  const skinningReady = input.skinCount > 0;
  const morphTargetsReady = input.morphTargetCount > 0;
  const renderable = input.primitiveCount > 0 && input.materialCount > 0;
  return {
    assetId: input.assetId,
    importedAnimation,
    skinningReady,
    morphTargetsReady,
    renderable,
    warnings: [
      ...(!importedAnimation ? ["No imported animation clips were detected."] : []),
      ...(!skinningReady && !morphTargetsReady ? ["No skinning or morph target deformation metadata was detected."] : []),
      ...(!renderable ? ["Asset is not renderable through the V6 glTF render pipeline."] : [])
    ]
  };
}

export function createV6OrbitControlPreset(
  bounds: CameraFrameBounds,
  viewport: { readonly width: number; readonly height: number },
  options: { readonly yawRadians?: number; readonly pitchRadians?: number; readonly paddingRatio?: number } = {}
): V6OrbitControlPreset & { readonly frame: PerspectiveCameraFrame } {
  const yawRadians = options.yawRadians ?? -0.42;
  const pitchRadians = options.pitchRadians ?? -0.18;
  const frame = computePerspectiveCameraFrame(bounds, viewport, {
    paddingRatio: options.paddingRatio ?? 0.18,
    yawRadians,
    pitchRadians,
    nearPadding: 0.18,
    farPadding: 2.4
  });
  const distance = Math.hypot(
    frame.cameraPosition[0] - frame.center[0],
    frame.cameraPosition[1] - frame.center[1],
    frame.cameraPosition[2] - frame.center[2]
  );
  return {
    target: [frame.center[0], frame.center[1], frame.center[2]],
    distance,
    yawRadians,
    pitchRadians,
    minDistance: Math.max(0.1, distance * 0.2),
    maxDistance: Math.max(2, distance * 4),
    frame
  };
}
