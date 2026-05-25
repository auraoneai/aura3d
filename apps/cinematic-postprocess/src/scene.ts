import type { V6AppSceneDefinition } from "../../production-runtime-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "cinematic-postprocess",
  sceneId: "cinematic-postprocess",
  title: "Cinematic Postprocess",
  workflow: "grade-imported-pbr-render",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.18, intensity: 1.25, rotation: 0.05 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
