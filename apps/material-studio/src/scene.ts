import type { ProductionAppSceneDefinition } from "../../common/src/runtime";
import { assets } from "./assets";

export const scene: ProductionAppSceneDefinition = {
  appId: "production-material-studio",
  sceneId: "material-studio",
  title: "Material Studio",
  workflow: "inspect-pbr-material-extensions",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.12, intensity: 1.25, rotation: 0.4 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
