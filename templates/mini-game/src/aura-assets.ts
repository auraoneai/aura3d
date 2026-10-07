import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  showcaseKenneyOobiPlatformerHero: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb",
    bounds: [0.868, 0.907, 0.603],
    hash: "sha256-3f82114135cdf4b627d463901308eb0dcf4bbbb10f1958f044eaa42160ad5df5",
    metadata: {
      materials: ["colormap"],
      animations: [
        "attack-kick-left",
        "attack-kick-right",
        "attack-melee-left",
        "attack-melee-right",
        "crouch",
        "die",
        "drive",
        "emote-no",
        "emote-yes",
        "fall",
        "holding-both",
        "holding-both-shoot",
        "holding-left",
        "holding-left-shoot",
        "holding-right",
        "holding-right-shoot",
        "idle",
        "interact-left",
        "interact-right",
        "jump",
        "pick-up",
        "sit",
        "sprint",
        "static",
        "walk"
      ],
      textures: [],
      thumbnailUrl: "/aura-assets/showcaseKenneyOobiPlatformerHero.thumb.svg"
    }
  },
  kenneyPlatformerKitBlockGrassLarge: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerKitBlockGrassLarge.606f077c.glb",
    bounds: [2.082, 1.0, 2.082],
    hash: "sha256-606f077c30f6943ef4caa45e440578992cb99f0b7fb8762850303a422ed9cafa",
    metadata: { materials: ["colormap"], animations: [], textures: [], thumbnailUrl: "" }
  },
  kenneyPlatformerKitStar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb",
    bounds: [0.365, 0.363, 0.239],
    hash: "sha256-a102a1b961fe0932c98ca29200ee6becae711b42437f14d58703388114eeff3c",
    metadata: { materials: ["colormap"], animations: [], textures: [], thumbnailUrl: "" }
  },
  kenneyPlatformerKitBrick: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerKitBrick.b1638210.glb",
    bounds: [0.5, 0.5, 0.5],
    hash: "sha256-b1638210ac5584f5d050654d3635b39834542b4121f6095f75b98e28745a23b3",
    metadata: { materials: ["colormap"], animations: [], textures: [], thumbnailUrl: "" }
  },
  kenneyPlatformerKitKey: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerKitKey.2e930961.glb",
    bounds: [0.382, 0.218, 0.068],
    hash: "sha256-2e9309616c56536495d96fee85e75def26b63354139d19533773f23900984986",
    metadata: { materials: ["colormap"], animations: [], textures: [], thumbnailUrl: "" }
  }
} as const);
