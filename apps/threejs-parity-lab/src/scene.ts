import type { V6AppSceneDefinition } from "../../production-runtime-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "threejs-parity-lab",
  sceneId: "threejs-parity-lab",
  title: "Three.js Parity Lab",
  workflow: "prepare-same-scene-parity",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.08, intensity: 1.2, rotation: 0.3 },
  cameraFrameBounds: { min: [-0.08, -0.045, -0.035], max: [0.08, 0.055, 0.035] },
  cameraFrameOptions: { fovYRadians: 0.72, paddingRatio: 0.06, minDistance: 0.08, yawRadians: -0.34, pitchRadians: -0.12, nearPadding: 0.02, farPadding: 0.5 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
