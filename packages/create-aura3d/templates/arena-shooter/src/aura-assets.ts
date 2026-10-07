import { defineAuraAssets } from "@aura3d/engine";

// Kenney Space Kit (CC0-1.0, www.kenney.nl) — vendored into the template so the
// scaffold runs offline with typed assets. Ship + drone craft are authored at
// metre scale with feet on the ground plane; meteor_detailed plays the distant
// planet setpiece (scaled up in the scene).
export const assets = defineAuraAssets({
  ship: {
    type: "model",
    format: "glb",
    url: "/aura-assets/craft_racer.bce8cb3d.glb",
    bounds: [1.2, 0.75, 2.026],
    hash: "sha256-bce8cb3d037a67e151ea6b68bba5876f53f4c77dfd43892c1c72892d5ab1c5aa",
    metadata: {
      materials: ["metal", "metalDark", "dark", "metalRed"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      author: "Kenney",
      sourcePage: "https://kenney.nl/assets/space-kit",
      role: "player ship"
    }
  },
  drone: {
    type: "model",
    format: "glb",
    url: "/aura-assets/craft_miner.de323205.glb",
    bounds: [1.8, 0.7, 2.6],
    hash: "sha256-de32320578886d2e73b1cd24b6161c9bd855e3a172bc2abcc8cb7bdd46352348",
    metadata: {
      materials: ["dark", "metalDark", "metal", "metalRed"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      author: "Kenney",
      sourcePage: "https://kenney.nl/assets/space-kit",
      role: "enemy drone"
    }
  },
  planet: {
    type: "model",
    format: "glb",
    url: "/aura-assets/meteor_detailed.f30379ab.glb",
    bounds: [0.866, 0.735, 0.825],
    hash: "sha256-f30379abd7d772a2fdc52ebb72ad2b5fc94768343cb8f6788614820f632c5e63",
    metadata: {
      materials: ["rockTrack"],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      author: "Kenney",
      sourcePage: "https://kenney.nl/assets/space-kit",
      role: "planet setpiece"
    }
  }
} as const);
