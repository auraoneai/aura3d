import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  player: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyMiniForestCharacterArcher.0fd0f92e.glb",
    bounds: [2, 2, 2],
    hash: "sha256-0fd0f92e452ffab13529e51037cc804edf6ff3134f6bdd614b7aaea9ae6feb3b",
    integrity: { version: 1, digest: "sha256-0fd0f92e452ffab13529e51037cc804edf6ff3134f6bdd614b7aaea9ae6feb3b", dependencies: { "Textures/colormap.png": "sha256-319f1087d8ed50a8794f9a8179f64671d5595f2365fdf3e47ec2d4eb74dba20f" }, requireDependencies: true },
    metadata: {
      materials: ["colormap"],
      animations: ["static", "idle", "walk", "sprint", "jump", "fall", "crouch", "sit", "drive", "die"],
      textures: []
    }
  },
  tree: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyMiniForestTree.0075d505.glb",
    bounds: [1.835, 2.684, 1.964],
    hash: "sha256-0075d5059c1ea855fecc1dba3c6262c3a01924c50b971ddde2eb8b0b5a62851a",
    integrity: { version: 1, digest: "sha256-0075d5059c1ea855fecc1dba3c6262c3a01924c50b971ddde2eb8b0b5a62851a", dependencies: { "Textures/colormap.png": "sha256-319f1087d8ed50a8794f9a8179f64671d5595f2365fdf3e47ec2d4eb74dba20f" }, requireDependencies: true },
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
    integrity: { version: 1, digest: "sha256-226728a03989a1ce52ea64b55e3d9e2ff89004f7eaca9f74c2fafda7c84bbe49", dependencies: { "Textures/colormap.png": "sha256-319f1087d8ed50a8794f9a8179f64671d5595f2365fdf3e47ec2d4eb74dba20f" }, requireDependencies: true },
    metadata: {
      materials: ["colormap"],
      animations: [],
      textures: []
    }
  }
} as const);
