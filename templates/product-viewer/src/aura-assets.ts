import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "gltf",
    url: "/aura-assets/product-fixture.gltf",
    bounds: [1.9, 2.9, 1.1],
    hash: "sha256-45702ca0c78c9911c839f664101b3b4d4a67c164f1ef5238b7b3834190ed463d",
    metadata: {
      materials: ["satin cabinet", "patterned grille", "rubber cone", "metallic knobs"],
      animations: [],
      textures: ["embedded base-color swatches"],
      thumbnailUrl: "/aura-assets/product.thumb.svg"
    }
  }
} as const);
