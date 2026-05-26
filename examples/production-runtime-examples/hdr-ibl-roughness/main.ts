import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-hdr-ibl-roughness",
  sceneId: "hdr-ibl-roughness",
  title: "HDR IBL Roughness",
  workflow: "roughness and sheen material grid using HDR environment lighting resources",
  assets: [{ id: "sheen-test-grid", label: "Sheen Test Grid", file: "sheen-test-grid.glb", role: "primary" }],
  environment: { id: "autumn-field-puresky", label: "Autumn Field Pure Sky", file: "autumn_field_puresky_1k.hdr", exposure: 0.96, intensity: 1.22, rotation: 0.48 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
