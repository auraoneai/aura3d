import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  coupe: { type: "model", format: "glb", url: "/models/vesper-gt/coupe.glb?v=71c3081628ba",
    hash: "sha256-71c3081628baa09809eefa7e523e81919435bc65e43791d75864a642a1e9bed0" },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
