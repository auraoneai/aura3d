import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-example-postprocess-cinematic",
  sceneId: "postprocess-cinematic",
  title: "Postprocess Cinematic",
  workflow: "filmic tone mapping, color grade, bloom, and FXAA on imported PBR product pixels",
  assets: [{ id: "lantern", label: "Lantern", file: "lantern.glb", role: "primary" }],
  environment: { id: "venice-sunset", label: "Venice Sunset", file: "venice_sunset_1k.hdr", exposure: 0.9, intensity: 1.35, rotation: 0.62 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
