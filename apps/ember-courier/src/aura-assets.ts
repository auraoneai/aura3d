import { defineAuraAssets } from "@aura3d/engine";
export const assets = defineAuraAssets({
  courier: { type: "model", format: "glb", url: "/models/ember-courier/character.glb",
    hash: "sha256-92badddf8be5ad2229228201debd2465cd797467bdcbe15687077ab632ee0f26",
    metadata: { animations: ["idle", "walk", "run", "jump"] } },
  studio: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr",
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba" }
} as const);
