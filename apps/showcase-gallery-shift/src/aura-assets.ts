import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  // Uniform library crate (CC0/Quaternius). Drives the fresh gallery
  // interior built from the salvaged FloorLayout rects: floor slab,
  // pedestals/exhibits, display cases, exit pad, and the thief/guard
  // figures are this one GLB scaled and tinted per role.
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
  // Modular wall panel (CC0/Quaternius) scaled to each FloorLayout wall
  // rect — the fresh room construction that replaces the trashed
  // GLB-interior candidate (gallery-world-candidate.ts, deleted).
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
