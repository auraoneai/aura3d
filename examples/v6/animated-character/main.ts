import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-example-animated-character",
  sceneId: "animated-character",
  title: "Animated Character",
  workflow: "skinned character GLB plus animation and morph-target metadata proof",
  assets: [
    { id: "cesium-man", label: "Cesium Man", file: "cesium-man.glb", role: "primary" },
    { id: "animated-morph-cube", label: "Animated Morph Cube", file: "animated-morph-cube.glb", role: "secondary" }
  ],
  environment: { id: "spruit-sunrise", label: "Spruit Sunrise", file: "spruit_sunrise_1k.hdr", exposure: 0.92, intensity: 1.32, rotation: 0.22 },
  postprocess: false,
  webgpuReport: false,
  expectedPostprocessChain: []
});
