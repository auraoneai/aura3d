import { defineAuraAssets } from "@aura3d/engine";

// Fresh coherent set for the rebuilt corridor (all CC0, ~131 KB total —
// replaces the trashed ~55 MB mixed-generation set). Corridor shell and
// cover reuse the Blockfall pilot's admitted Quaternius pair; targets are
// the Kenney Space Kit miner craft the arena-shooter template admits as
// its enemy drone. Hashes are sha256 of the files in public/aura-assets.
export const assets = defineAuraAssets({
  quaterniusWallModular: {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/quaternius-wall-modular.glb",
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
  },
  quaterniusCubeCrate: {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/quaternius-cube-crate.glb",
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
  kenneyCraftMiner: {
    type: "model",
    format: "glb",
    url: "/examples/neon-corridor-strike/public/aura-assets/kenney-craft-miner.glb",
    bounds: [1.8, 0.7, 2.6],
    hash: "sha256-de32320578886d2e73b1cd24b6161c9bd855e3a172bc2abcc8cb7bdd46352348",
    metadata: {
      materials: ["dark", "metalDark", "metal", "metalRed"],
      animations: [],
      textures: [],
      libraryId: "kenney-craft-miner",
      libraryKit: "vehicles/space-kit",
      license: "CC0-1.0",
      attribution: "Kenney",
      sourcePage: "https://kenney.nl/assets/space-kit"
    }
  }
} as const);
