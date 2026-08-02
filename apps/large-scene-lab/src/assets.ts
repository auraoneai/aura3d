import type { ProductionAppAsset } from "../../common/src/runtime";

export const assets: readonly ProductionAppAsset[] = [
  { id: "antique-camera", label: "Antique Camera", file: "antique-camera.glb", role: "primary" },
  { id: "boom-box", label: "Boom Box", file: "boom-box.glb", role: "secondary" },
  { id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "secondary" }
];
