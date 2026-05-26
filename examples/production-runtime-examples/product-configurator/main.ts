import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-product-configurator",
  sceneId: "product-configurator",
  title: "Product Configurator",
  workflow: "developer product workflow with imported textured GLB assets, HDR IBL, postprocess, and runtime proof",
  assets: [
    { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" },
    { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" },
    { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "secondary" }
  ],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1.05, intensity: 1.2, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
