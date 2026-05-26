import type { ProductionAppSceneDefinition } from "../../common/src/runtime";
import { assets } from "./assets";

export const scene: ProductionAppSceneDefinition = {
  appId: "production-asset-inspector",
  sceneId: "asset-inspector",
  title: "Asset Inspector",
  workflow: "inspect-gltf-metadata-and-render-proof",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.05, intensity: 1.1, rotation: 0.2 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
