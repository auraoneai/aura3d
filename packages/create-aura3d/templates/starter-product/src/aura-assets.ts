import { defineAuraAssets } from "@aura3d/engine";

// Generated shape (`npx @aura3d/cli@latest assets typegen`). Swap the product with
// `npx @aura3d/cli@latest assets resolve "<object>" --name car` (or `--name <new>` and rename it in main.ts).
export const assets = defineAuraAssets({
  car: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
    bounds: [1.639, 0.771, 3.181],
    hash: "sha256-1c69283fa2b3fb96b3dc3418f2d0dede842e6984f1776a8ca00b099836fc9c14",
    metadata: {
      materials: ["Material.001", "Material.002", "Material.003", "Material.004"],
      animations: [],
      textures: [],
      license: "CC-BY-4.0",
      author: "JUFF",
      sourcePage: "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-008/23dfdeb55dc24970b36065afaab7a8a5.glb",
      thumbnailUrl: "/aura-assets/showcaseCleanSportsCar.thumb.svg"
    }
  }
} as const);
