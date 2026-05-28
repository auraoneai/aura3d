import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "gltf",
    url: "/aura-assets/product-fixture.gltf",
    bounds: [1.4, 1.0, 1.4],
    hash: "sha256-template-product-fixture",
    metadata: {
      materials: ["brushed graphite"],
      animations: [],
      textures: [],
      thumbnailUrl: "/aura-assets/product.thumb.svg"
    }
  }
} as const);
