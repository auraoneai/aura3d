import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  quaterniusSportsCar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-sports-car.glb",
    bounds: [1.872, 1.203, 3.927],
    hash: "sha256-bbb1c718d2aaf5f4344e9fb2cd66d8332a998a515b09ddd4dfa14698d787124e",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      libraryId: "quaternius-sports-car",
      libraryKit: "vehicles/road",
      license: "CC0",
      attribution: "Quaternius"
    }
  }
} as const);
