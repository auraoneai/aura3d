import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-example-hdr-ibl-roughness",
  sceneId: "hdr-ibl-roughness",
  title: "HDR IBL Roughness",
  workflow: "roughness LOD material grid using HDR environment lighting resources",
  assets: [{ id: "specular-test", label: "Specular Test", file: "specular-test.glb", role: "primary" }],
  environment: { id: "autumn-field-puresky", label: "Autumn Field Pure Sky", file: "autumn_field_puresky_1k.hdr", exposure: 0.96, intensity: 1.22, rotation: 0.48 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
