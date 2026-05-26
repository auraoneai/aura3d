import type { ProductionAppSceneDefinition } from "../../common/src/runtime";
import { assets } from "./assets";

export const scene: ProductionAppSceneDefinition = {
  appId: "automotive-configurator",
  sceneId: "automotive-configurator",
  title: "Automotive Configurator",
  workflow: "configure-imported-vehicle",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.08, intensity: 1.15, rotation: 0.35 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
