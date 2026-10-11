import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  /*
   * Library humanoid rigs ship as the default fighters (#481 mapping;
   * characters/humanoid-pbr kit, CC0/Quaternius):
   * - player: auraclashPlayerRig / "Idle_Loop"
   * - rival:  auraclashRivalRig  / "Zombie_Walk_Fwd_Loop"
   *
   * Swap in your own fighter GLBs with the Aura3D CLI and keep these keys so
   * src/main.ts keeps mounting typed models instead of source placeholders:
   *
   * npx @aura3d/cli@latest assets add ./assets/player-fighter.glb --name auraclashPlayerRig
   * npx @aura3d/cli@latest assets add ./assets/rival-fighter.glb --name auraclashRivalRig
   */
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
  },
  auraclashRivalRig: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auraclash-rival-rig.glb",
    bounds: [1.799, 1.869, 0.373],
    hash: "sha256-c8d844dc4a70bc5d548c1bdd5c20c7a2f336529088fd350098431adf87cdf13b",
    metadata: {
      materials: [],
      animations: [
        "Hit_Knockback",
        "Idle_FoldArms_Loop",
        "LayToIdle",
        "Melee_Hook",
        "NinjaJump_Idle_Loop",
        "Shield_Dash_RM",
        "Sword_Block",
        "Sword_Regular_A",
        "Sword_Regular_Combo",
        "Zombie_Walk_Fwd_Loop"
      ],
      textures: [],
      thumbnailUrl: "",
      libraryId: "auraclash-rival-rig",
      libraryKit: "characters/humanoid-pbr",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://quaternius.itch.io/modular-character-outfits-fantasy"
    }
  }
} as const);
