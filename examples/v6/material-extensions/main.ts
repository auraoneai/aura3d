import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-example-material-extensions",
  sceneId: "material-extensions",
  title: "Material Extensions",
  workflow: "clearcoat primary plus sheen and specular material-grid metadata for extension coverage",
  assets: [
    { id: "clear-coat-test", label: "Clear Coat Test", file: "clear-coat-test.glb", role: "primary" },
    { id: "sheen-test-grid", label: "Sheen Test Grid", file: "sheen-test-grid.glb", role: "secondary" },
    { id: "specular-test", label: "Specular Test", file: "specular-test.glb", role: "secondary" }
  ],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
