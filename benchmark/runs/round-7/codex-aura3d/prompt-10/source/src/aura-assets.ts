import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  sneaker: {
    type: "model",
    format: "glb",
    url: "/benchmark/assets/sneaker.glb",
    hash: "sha256-e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7",
    sizeBytes: 7833592,
    metadata: {
      materials: ["embedded sneaker materials"],
      animations: [],
      textures: ["embedded sneaker textures"]
    }
  }
} as const);
