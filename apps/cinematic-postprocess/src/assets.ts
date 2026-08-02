import type { ProductionAppAsset } from "../../common/src/runtime";

export const assets: readonly ProductionAppAsset[] = [
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" },
  { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" }
];
