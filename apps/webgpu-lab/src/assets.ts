import type { ProductionAppAsset } from "../../common/src/runtime";

export const assets: readonly ProductionAppAsset[] = [
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" },
  { id: "clear-coat-test", label: "Clear Coat Test", file: "clear-coat-test.glb", role: "secondary" }
];
