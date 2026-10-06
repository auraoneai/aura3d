import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  room: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyModularDungeonRoomSmall.a7e74a5f.glb",
    bounds: [12, 5.233, 12],
    hash: "sha256-a7e74a5f2c91ce0503190bcda140259545478d7c80f60243d2c13a897e01af20",
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
