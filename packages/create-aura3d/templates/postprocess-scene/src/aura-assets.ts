import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  luma: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseLuma.ef389217.glb",
    bounds: [102.874, 100.914, 100.914],
    hash: "sha256-ef3892179fe70cf2062cdbafcce131d33968a7667e087d630b866a4fd022c74d",
    metadata: {
      materials: ["Cyberpunk_MAT"],
      animations: ["Idle"],
      textures: []
    }
  },
  miko: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseMiko.fcdc2b75.glb",
    bounds: [1.015, 1.95, 0.369],
    hash: "sha256-fcdc2b7502031e556259dfe942fdfbd7abe41963433f2046ed2522d27bce9d65",
    metadata: {
      materials: ["miko_body_mat", "miko_dark_mat", "miko_glow_mat", "miko_skin_mat", "miko_accent_mat"],
      animations: ["Idle", "Wave", "Walk", "Talk"],
      textures: []
    }
  }
} as const);
