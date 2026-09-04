import { defineAuraAssets } from "@aura3d/lean/game";

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
  }
} as const);
