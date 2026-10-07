import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  character: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyMiniForestCharacterArcher.0fd0f92e.glb",
    bounds: [2, 2, 2],
    hash: "sha256-0fd0f92e452ffab13529e51037cc804edf6ff3134f6bdd614b7aaea9ae6feb3b",
    metadata: {
      materials: ["colormap"],
      animations: ["static", "idle", "walk", "sprint", "jump", "fall", "crouch", "sit", "drive", "die"],
      textures: []
    }
  }
} as const);
