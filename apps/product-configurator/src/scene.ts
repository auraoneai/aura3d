import { assets } from "./assets";
import type { V6AppSceneDefinition } from "./types";

export const scene: V6AppSceneDefinition = {
  appId: "production-product-configurator",
  sceneId: "product-configurator",
  title: "Product Configurator",
  workflow: "configure-imported-product",
  assets,
  environment: { id: "studio-small-08-4k", label: "Studio Small 08 4K", file: "studio_small_08_4k.hdr", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", exposure: 1.08, intensity: 1.42, rotation: 0.24 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "ssao", "fxaa"]
};
