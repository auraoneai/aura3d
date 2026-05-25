import type { V6AppSceneDefinition } from "../../production-runtime-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "production-architecture-viewer",
  sceneId: "architecture-viewer",
  title: "Architecture Viewer",
  workflow: "inspect-lit-interior-prop",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.0, intensity: 1.25, rotation: -0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
