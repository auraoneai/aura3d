import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  instrument: {
    type: "model", format: "glb", url: "/models/prism-observatory/instrument.glb",
    hash: "sha256-51eeee0e63ef499e6719b0231c067500032649b2b93250c773f5fc7b4b037f0d"
  },
  studio: {
    type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba"
  }
} as const);
