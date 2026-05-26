import type { ProductionAppAsset } from "../../common/src/runtime";

export const assets: readonly ProductionAppAsset[] = [
  { id: "clear-coat-test", label: "Clear Coat Test", file: "clear-coat-test.glb", role: "primary" },
  { id: "sheen-test-grid", label: "Sheen Test Grid", file: "sheen-test-grid.glb", role: "secondary" },
  { id: "compare-transmission", label: "Transmission Compare", file: "/fixtures/threejs-parity/assets/materials/compare-transmission.glb", role: "secondary" }
];
