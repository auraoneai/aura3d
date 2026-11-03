import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  room: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyModularDungeonRoomSmall.a7e74a5f.glb",
    bounds: [12, 5.233, 12],
    hash: "sha256-a7e74a5f2c91ce0503190bcda140259545478d7c80f60243d2c13a897e01af20",
    integrity: { version: 1, digest: "sha256-a7e74a5f2c91ce0503190bcda140259545478d7c80f60243d2c13a897e01af20", dependencies: { "Textures/colormap.png": "sha256-fc9e729b10296cccc9466ecbb4dac7ea0575e2a0798a72ed94d41b0b8a73d824" }, requireDependencies: true },
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
