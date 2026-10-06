import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  // Bevelled Kenney platformer block (CC0). One GLB drives every cell: the
  // settled board is a single instanced mesh and the active/hold/frame/flash
  // surfaces reuse the same asset scaled per role.
  blockCell: {
    type: "model",
    format: "glb",
    url: "/aura-assets/kenneyPlatformerBlockGrass.8cd2f9ec.glb",
    bounds: [1.962, 2.0, 1.962],
    hash: "sha256-8cd2f9ec083b2b7cfe89d95c53ef8adf369d1e5e6adf125f063122d4998c336f",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      author: "Kenney",
      sourcePage: "https://kenney.nl/assets/platformer-kit",
      role: "prop"
    }
  },
  cabinetModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseBlockfallCabinet.679d52fe.glb",
    bounds: [2, 2, 3.27],
    hash: "sha256-679d52fe0c7bf99373fc873f3c3892548f6c5758ae9c81be91f09acae6a35a36",
    metadata: {
      materials: ["arcade_machine"],
      animations: [],
      textures: ["image-0", "image-1", "image-2", "image-3"],
      license: "CC-BY-4.0",
      author: "Dmitry Blagodaryov",
      sourcePage: "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-012/f73986356b6e4d72b7a889279837aec2.glb",
      thumbnailUrl: "/aura-assets/showcaseBlockfallCabinet.thumb.svg"
    }
  }
} as const);
