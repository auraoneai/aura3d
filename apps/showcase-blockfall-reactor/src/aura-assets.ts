import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  // Uniform library crate (CC0/Quaternius). One GLB drives every cell: the
  // settled board is a single instanced mesh and the active/hold/frame/flash
  // surfaces reuse the same asset scaled per role.
  quaterniusCubeCrate: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-cube-crate.glb",
    bounds: [2.021, 2.021, 2.021],
    hash: "sha256-e0c4c5946b53ba314ec6e22bdb5d3329e4a2f0950b3c477a88e0d456d85baea8",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      libraryId: "quaternius-cube-crate",
      libraryKit: "props/industrial-urban",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/YAghI6GBls"
    }
  },
  // Modular wall panel stands in for the arcade cabinet silhouette until a
  // cabinet prop is admitted to the kit (#481 mapping approximation).
  quaterniusWallModular: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-wall-modular.glb",
    bounds: [2.001, 2.005, 0.438],
    hash: "sha256-052a5ff5a468c946dcfe170d907a0c4554a96c7f253c89ff54e72fdf048d22c6",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      libraryId: "quaternius-wall-modular",
      libraryKit: "environments/modular",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/itasw0GWNf"
    }
  }
} as const);
