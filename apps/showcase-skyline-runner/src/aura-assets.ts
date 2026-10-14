import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  // Rigged platformer hero (Kenney "Oobi", root-manifest id
  // showcaseKenneyOobiPlatformerHero). Clip names below are the GLB's own
  // embedded animation names as recorded in the root typed-asset metadata
  // (src/aura-assets.ts `animationClips`): idle/walk/sprint/jump/fall drive
  // locomotion; the rig has no dedicated land clip.
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
      thumbnailUrl: ""
    }
  },
  // Uniform library crate (CC0/Quaternius): one GLB scaled to every authored
  // platform rect and the hazard block.
  quaterniusCubeCrate: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-cube-crate.glb",
    bounds: [2.021, 2.021, 2.021],
    hash: "sha256-e0c4c5946b53ba314ec6e22bdb5d3329e4a2f0950b3c477a88e0d456d85baea8",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      thumbnailUrl: "",
      libraryId: "quaternius-cube-crate",
      libraryKit: "props/industrial-urban",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/YAghI6GBls"
    }
  },
  kenneyPlatformerKitStar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerKitStar.a102a1b9.glb",
    bounds: [0.365, 0.363, 0.239],
    hash: "sha256-a102a1b961fe0932c98ca29200ee6becae711b42437f14d58703388114eeff3c",
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

/** Embedded GLB clip names of the hero rig, from its typed metadata above. */
export const HERO_CLIPS: readonly string[] =
  assets.showcaseKenneyOobiPlatformerHero.metadata.animations;
