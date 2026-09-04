import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
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
  }
} as const);
