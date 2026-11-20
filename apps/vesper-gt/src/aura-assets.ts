import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  coupe: { type: "model", format: "glb", url: "/models/vesper-gt/coupe.glb?v=119f6976583b",
    hash: "sha256-119f6976583ba6053dfe778762b1b06c27233a72d5fa91743ef389a38e291cf1" },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
