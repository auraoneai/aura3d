import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  hero: {
    type: "model",
    format: "glb",
    url: "/aura-assets/hero-fixture.glb",
    bounds: [2.2, 1.6, 1.8],
    hash: "sha256-4028ccbce11eb924936dad9bfee2af2aecf4b72203feb8a6b9dfdc458093e656",
    metadata: {
      materials: ["weathered metal", "visor glass", "scratched paint"],
      animations: [],
      textures: [],
      thumbnailUrl: "/aura-assets/hero.thumb.svg"
    }
  }
} as const);
