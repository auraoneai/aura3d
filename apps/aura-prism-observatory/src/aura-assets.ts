import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  instrument: {
    type: "model", format: "glb", url: "/models/prism-observatory/instrument.glb",
    hash: "sha256-5af4e145e9f8f1beb43e25e0a4a4cb0902a800341ab2f82949aa6db4ef10026e"
  },
  studio: {
    type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba"
  }
} as const);
