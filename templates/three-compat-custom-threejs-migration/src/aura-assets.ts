import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  ship: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPirateKitShipMedium.279ea019.glb",
    bounds: [4.8, 10.964, 10.6],
    hash: "sha256-279ea019268f855240c3cebf7616644c8141c20bee617da72eae4733b8e310af",
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
