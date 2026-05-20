import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-template-asset-inspector",
  sceneId: "asset-inspector",
  title: "V6 Asset Inspector",
  workflow: "starter asset inspector with imported geometry, metadata, texture counts, and renderer proof",
  assets: [
    { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "primary" },
    { id: "duck", label: "Duck", file: "duck.glb", role: "secondary" }
  ],
  environment: { id: "autumn-field-puresky", label: "Autumn Field Pure Sky", file: "autumn_field_puresky_1k.hdr", exposure: 0.96, intensity: 1.22, rotation: 0.48 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
