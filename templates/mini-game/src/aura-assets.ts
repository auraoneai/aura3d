import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  playerModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/player-fixture.glb",
    bounds: [1.3, 1.1, 1.2],
    hash: "sha256-65bf938f54d6073e619e76e007820bbf980cdc3dc0daec0d94830ffc4ae54ab5",
    metadata: {
      materials: ["yellow body", "orange bill", "game-ready simple mesh"],
      animations: [],
      textures: [],
      thumbnailUrl: "/aura-assets/player.thumb.svg"
    }
  }
} as const);
