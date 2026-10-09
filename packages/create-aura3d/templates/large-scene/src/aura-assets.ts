import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  tree: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyMiniForestTree.0075d505.glb",
    bounds: [1.835, 2.684, 1.964],
    hash: "sha256-0075d5059c1ea855fecc1dba3c6262c3a01924c50b971ddde2eb8b0b5a62851a",
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  },
  rocks: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyMiniForestRocksHigh.226728a0.glb",
    bounds: [2, 2, 2],
    hash: "sha256-226728a03989a1ce52ea64b55e3d9e2ff89004f7eaca9f74c2fafda7c84bbe49",
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
