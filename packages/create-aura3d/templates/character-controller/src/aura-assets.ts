import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  auraclashPlayerRig: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auraclash-player-rig.glb",
    bounds: [1.669, 1.788, 0.349],
    hash: "sha256-3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087",
    metadata: {
      materials: [],
      animations: [
        "Crouch_Idle_Loop",
        "Death01",
        "Hit_Chest",
        "Hit_Head",
        "Idle_Loop",
        "Jump_Loop",
        "Punch_Cross",
        "Punch_Jab",
        "Sprint_Loop",
        "Sword_Attack",
        "Walk_Loop",
        "Sword_Block"
      ],
      textures: [],
      thumbnailUrl: "",
      libraryId: "auraclash-player-rig",
      libraryKit: "characters/humanoid-pbr",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://quaternius.itch.io/modular-character-outfits-fantasy"
    }
  }
} as const);
