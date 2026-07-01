import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
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
