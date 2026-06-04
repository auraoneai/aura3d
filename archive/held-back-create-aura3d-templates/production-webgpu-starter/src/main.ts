import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-template-webgpu-starter",
  sceneId: "webgpu-starter",
  title: "Production WebGPU Starter",
  workflow: "starter with production WebGL2 output and an honest WebGPU availability report",
  assets: [{ id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" }],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: true,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
