import { runProductionExample } from "@aura3d/engine/workflows/production";

void runProductionExample({
  appId: "production-runtime-example-large-instanced-scene",
  sceneId: "large-instanced-scene",
  title: "Large Instanced Scene",
  workflow: "large-scene workflow using automotive and product corpus assets with renderer diagnostics",
  assets: [
    { id: "cesium-milk-truck", label: "Cesium Milk Truck", file: "threejs-parity/assets/physics/cesium-milk-truck.glb", role: "primary" },
    { id: "avocado", label: "Avocado", file: "avocado.glb", role: "secondary" },
    { id: "duck", label: "Duck", file: "duck.glb", role: "secondary" }
  ],
  environment: { id: "industrial-sunset-puresky", label: "Industrial Sunset Pure Sky", file: "kloppenheim_06_puresky_1k.hdr", exposure: 0.88, intensity: 1.28, rotation: 0.34 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
