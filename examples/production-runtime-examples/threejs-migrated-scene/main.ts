import { runV6Example } from "@galileo3d/engine/workflows/production";

void runV6Example({
  appId: "production-runtime-example-threejs-migrated-scene",
  sceneId: "threejs-migrated-scene",
  title: "Three.js Migrated Scene",
  workflow: "same real corpus scene used by Three.js parity harness, rendered through G3D V6 public workflow API",
  assets: [
    { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" },
    { id: "clear-coat-test", label: "Clear Coat Test", file: "clear-coat-test.glb", role: "secondary" }
  ],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
