import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/khronosToyCar.01a60862.glb",
    bounds: [734.429, 739.623, 288.229],
    hash: "sha256-01a60862de55cd4b9f3acfab0b0def86451800f9c42467fcd61052c16cb9838c",
    metadata: {
      materials: ["ToyCar", "Fabric", "Glass"],
      animations: [],
      textures: []
    }
  }
} as const);
