import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-animated-character",
  sceneId: "animated-character",
  title: "Animated Character",
  workflow: "skinned character GLB plus animation and morph-target metadata proof",
  assets: [
    { id: "cesium-man", label: "Cesium Man", file: "three-compat/assets/corpus/cesium-man.glb", role: "primary" },
    { id: "animated-morph-cube", label: "Animated Morph Cube", file: "three-compat/assets/corpus/animated-morph-cube.glb", role: "secondary" }
  ],
  environment: { id: "spruit-sunrise", label: "Spruit Sunrise", file: "autumn_field_puresky_1k.hdr", exposure: 0.92, intensity: 1.32, rotation: 0.22 },
  postprocess: false,
  webgpuReport: false,
  expectedPostprocessChain: []
});
