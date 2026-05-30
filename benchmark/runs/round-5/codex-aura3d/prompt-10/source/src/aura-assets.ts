import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  "sneaker": { type: "model", format: "glb", url: "/aura-assets/sneaker.e1d7cb19.glb", hash: "sha256-e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7", bounds: [2,2,2], sizeBytes: 7833592, metadata: {"thumbnailUrl":"/aura-assets/sneaker.thumb.svg"} },
} as const);

export type AuraGeneratedAssets = typeof assets;
