import type { V6AppAsset } from "../../production-runtime-common/src/runtime";

export const assets: readonly V6AppAsset[] = [
  { id: "clear-coat-test", label: "Clear Coat Test", file: "clear-coat-test.glb", role: "primary" },
  { id: "sheen-test-grid", label: "Sheen Test Grid", file: "sheen-test-grid.glb", role: "secondary" },
  { id: "specular-test", label: "Specular Test", file: "specular-test.glb", role: "secondary" }
];
