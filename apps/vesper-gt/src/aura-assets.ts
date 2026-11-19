import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  coupe: { type: "model", format: "glb", url: "/models/vesper-gt/coupe.glb",
    hash: "sha256-67dc9f6c2492615276c5c06cd92c7e8fab9b1e3fe0741a68131af2390260899d" },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
