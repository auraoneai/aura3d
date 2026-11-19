import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  coupe: { type: "model", format: "glb", url: "/models/vesper-gt/coupe.glb",
    hash: "sha256-ce819dccaacd73f991bdc535bf135883ae643e81bc1e03ff2f3cc83d0fa78747" },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
