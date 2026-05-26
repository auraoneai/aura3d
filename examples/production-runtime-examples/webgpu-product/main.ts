import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-webgpu-product",
  sceneId: "webgpu-product",
  title: "WebGPU Product",
  workflow: "WebGL2 production render plus honest WebGPU device availability report",
  assets: [{ id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "primary" }],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: true,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
