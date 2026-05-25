import type { V6AppSceneDefinition } from "../../production-runtime-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "large-scene-lab",
  sceneId: "large-scene-lab",
  title: "Large Scene Lab",
  workflow: "inspect-resource-budget",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.08, intensity: 1.15, rotation: 0.12 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
