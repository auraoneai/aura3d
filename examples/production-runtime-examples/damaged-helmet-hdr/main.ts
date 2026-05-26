import { runV6Example } from "@aura3d/engine/workflows/production";

void runV6Example({
  appId: "production-runtime-example-damaged-helmet-hdr",
  sceneId: "damaged-helmet-hdr",
  title: "Damaged Helmet HDR",
  workflow: "single flagship PBR GLB with normal, ORM, emissive maps and real HDR IBL",
  assets: [{ id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" }],
  environment: { id: "venice-sunset", label: "Venice Sunset", file: "venice_sunset_1k.hdr", exposure: 0.9, intensity: 1.35, rotation: 0.62 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
