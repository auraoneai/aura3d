import { runV6Example } from "@aura3d/engine/workflows/production";

void runV6Example({
  appId: "production-runtime-template-architecture-viewer",
  sceneId: "architecture-viewer",
  title: "V6 Architecture Viewer",
  workflow: "starter inspection viewer with daylight HDR environment and imported reference assets",
  assets: [
    { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "primary" },
    { id: "avocado", label: "Avocado", file: "avocado.glb", role: "secondary" }
  ],
  environment: { id: "kloppenheim-puresky", label: "Kloppenheim Pure Sky", file: "kloppenheim_06_puresky_1k.hdr", exposure: 1.05, intensity: 1.45, rotation: 0 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
