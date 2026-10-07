import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  /*
   * Certified E1 hero rigs ship as the default fighters (see
   * docs/rendering/skinning-and-morphs.md "Certified hero rigs"):
   * - player: showcaseWalkAnimatedGirl (humanoid-a) / "Take 001"
   * - rival: showcaseRunnerRobot (creature) / "WALK"
   *
   * Swap in your own fighter GLBs with the Aura3D CLI and keep these keys so
   * src/main.ts keeps mounting typed models instead of source placeholders:
   *
   * npx @aura3d/cli@latest assets add ./assets/player-fighter.glb --name showcaseWalkAnimatedGirl
   * npx @aura3d/cli@latest assets add ./assets/rival-fighter.glb --name showcaseRunnerRobot
   */
  showcaseWalkAnimatedGirl: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseWalkAnimatedGirl.93872fc2.glb",
    bounds: [86.929, 161.836, 37.758],
    hash: "sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6",
    metadata: {
      materials: ["material_0", "material_1", "material_0_0", "material_0_1", "material_0_2", "material_0_3", "material_0_4"],
      animations: ["Take 001"],
      textures: [],
      thumbnailUrl: "/aura-assets/showcaseWalkAnimatedGirl.thumb.svg"
    }
  },
  showcaseRunnerRobot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseRunnerRobot.252b3a16.glb",
    bounds: [17.509, 9.101, 27.461],
    hash: "sha256-252b3a16d5a8d7fd67a4304ec8135d4fa492802a31bc2fc2d4614e130a1f4e73",
    metadata: {
      materials: ["HEAD", "EYES", "BODY", "HINGE", "material", "material_5"],
      animations: ["IDLE", "WALK", "RUN", "ALL"],
      textures: [],
      thumbnailUrl: "/aura-assets/showcaseRunnerRobot.thumb.svg"
    }
  }
} as const);
