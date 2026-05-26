import type { ProductionAppAsset } from "../../common/src/runtime";

export const assets: readonly ProductionAppAsset[] = [
  { id: "cesium-milk-truck", label: "Cesium Milk Truck", file: "/fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb", role: "primary" },
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "secondary" }
];
