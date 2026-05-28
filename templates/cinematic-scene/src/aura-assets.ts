import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  hero: {
    type: "model",
    format: "gltf",
    url: "/aura-assets/hero-fixture.gltf",
    bounds: [1, 1.8, 0.7],
    hash: "sha256-template-hero-fixture",
    metadata: {
      materials: ["rain coat"],
      animations: ["idle"],
      textures: [],
      thumbnailUrl: "/aura-assets/hero.thumb.svg"
    }
  }
} as const);
