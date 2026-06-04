import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  playerModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/player-fixture.glb",
    bounds: [1.2, 1.9, 0.8],
    hash: "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319",
    metadata: {
      materials: ["painted robot body", "black joints", "white armor"],
      animations: [],
      textures: [],
      thumbnailUrl: "/aura-assets/player.thumb.svg"
    }
  }
} as const);
