import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-postprocess-cinematic",
  sceneId: "postprocess-cinematic",
  title: "Postprocess Cinematic",
  workflow: "filmic tone mapping, color grade, bloom, and FXAA on imported PBR product pixels",
  assets: [{ id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" }],
  environment: { id: "venice-sunset", label: "Venice Sunset", file: "studio_small_08_1k.hdr", exposure: 0.9, intensity: 1.35, rotation: 0.62 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
