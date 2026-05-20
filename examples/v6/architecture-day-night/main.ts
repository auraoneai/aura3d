import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "v6-example-architecture-day-night",
  sceneId: "architecture-day-night",
  title: "Architecture Day Night",
  workflow: "architecture viewer workflow using daylight HDR proof and complex imported product geometry",
  assets: [
    { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "primary" },
    { id: "duck", label: "Duck Scale Reference", file: "duck.glb", role: "secondary" }
  ],
  environment: { id: "kloppenheim-puresky", label: "Kloppenheim Pure Sky", file: "kloppenheim_06_puresky_1k.hdr", exposure: 1.05, intensity: 1.45, rotation: 0 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
