import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  coupe: { type: "model", format: "glb", url: "/models/vesper-gt/coupe.glb",
    hash: "sha256-0cd973aa7281f010e49b0243bfae98a97274968b5d18c0245fc8c8798d84443d" },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
