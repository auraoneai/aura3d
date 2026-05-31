import { defineAuraAssets } from "@aura3d/engine";

// Generated typed asset module for the user-approved sneaker.glb.
// The file is served from the project's public/ directory at the path below.
export const assets = defineAuraAssets({
  sneaker: {
    type: "model",
    format: "glb",
    url: "/benchmark/assets/sneaker.glb",
    sizeBytes: 7833592,
    hash: "sha256-e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7",
    metadata: {
      materials: ["sneaker upper", "rubber sole", "laces"],
      animations: [],
      textures: ["embedded sneaker material maps"]
    }
  }
} as const);
