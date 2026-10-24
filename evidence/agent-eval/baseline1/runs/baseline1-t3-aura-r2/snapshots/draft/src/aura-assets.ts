import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/assets/soldier.glb",
    bounds: [0.7, 1.7, 0.6],
    hash: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
    metadata: {
      materials: [],
      animations: ["Idle", "Run", "TPose", "Walk"],
      textures: [],
      thumbnailUrl: "",
      license: "Aura3D bundled soldier fixture"
    }
  }
} as const);
