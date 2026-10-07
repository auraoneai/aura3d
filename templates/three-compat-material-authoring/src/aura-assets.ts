import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  glbSwatch: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyCarKitSedanSports.2889c428.glb",
    bounds: [2, 2, 2.55],
    hash: "sha256-2889c428ca1dd9c975c3ff760eb8757883490410555ab60b818f712f583826d6",
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
