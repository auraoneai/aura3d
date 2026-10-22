import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  carModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseCleanSportsCar.1c69283f.glb",
    bounds: [3.455, 3.428, 2.206],
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
  },
  trackModel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb",
    bounds: [24.651, 24.647, 2.073],
    hash: "sha256-5cbb912e511e5e82363c347210096d59dd3007db12c363fd0c9f07919f5ebbd0",
    metadata: {
      materials: ["LINEAS", "gris", "verde", "rojo", "azul", "amarillo"],
      animations: [],
      textures: [],
      license: "CC-BY-4.0",
      author: "Puendiz",
      sourcePage: "https://huggingface.co/datasets/allenai/objaverse/blob/main/glbs/000-034/2fc89fcd8c034bc9ba05eac24c9bf537.glb",
      thumbnailUrl: "/aura-assets/showcaseReadableKartCircuit.thumb.svg"
    }
  }
} as const);
