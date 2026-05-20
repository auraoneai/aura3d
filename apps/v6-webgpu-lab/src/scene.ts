import type { V6AppSceneDefinition } from "../../v6-common/src/runtime";
import { assets } from "./assets";

export const scene: V6AppSceneDefinition = {
  appId: "v6-webgpu-lab",
  sceneId: "webgpu-lab",
  title: "WebGPU Lab",
  workflow: "report-webgpu-availability-with-webgl2-render-baseline",
  assets,
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.05, intensity: 1.2, rotation: 0.15 },
  postprocess: true,
  webgpuReport: true,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
};
