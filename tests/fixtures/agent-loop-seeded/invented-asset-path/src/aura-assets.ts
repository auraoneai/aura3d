import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robot.glb",
    bounds: [1, 2, 1],
    hash: "sha256-0000000000000000000000000000000000000000000000000000000000000000"
  }
});
