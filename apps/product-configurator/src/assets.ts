import type { ProductionAppAsset } from "./types";

export const assets: readonly ProductionAppAsset[] = [
  { id: "car-concept", label: "Car Concept", file: "car-concept.glb", url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb", role: "primary" },
  { id: "cesium-milk-truck", label: "Cesium Milk Truck", file: "cesium-milk-truck.glb", url: "/fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb", role: "secondary" },
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "secondary" },
  { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" },
  { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "secondary" }
];
