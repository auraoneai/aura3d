import type { V6AppSceneDefinition } from "../../production-runtime-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "character-viewer",
  sceneId: "character-viewer",
  title: "Character Viewer",
  workflow: "inspect-skinned-character-animation",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.0, intensity: 1.1, rotation: -0.25 },
  postprocess: false,
  webgpuReport: false,
  expectedPostprocessChain: [],
  renderSecondaryAssets: false,
  cameraFrameBounds: { min: [-0.85, -0.08, -0.85], max: [0.85, 1.95, 0.85] },
  cameraFrameOptions: { yawRadians: -0.38, pitchRadians: -0.08, paddingRatio: 0.045, fovYRadians: 0.44 }
};
