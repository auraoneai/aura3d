import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/product-fixture.glb",
    bounds: [1.9, 2.9, 1.1],
    hash: "sha256-5613d5ad4ddc538b02c147faf2f87777bfd5a79580297cc6a103fdb7556580d3",
    metadata: {
      materials: ["satin cabinet", "patterned grille", "rubber cone", "metallic knobs"],
      animations: [],
      textures: ["embedded product material swatches"],
      thumbnailUrl: "/aura-assets/product.thumb.svg"
    }
  }
} as const);
