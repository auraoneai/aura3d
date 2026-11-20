import { defineModelAssets } from "@aura3d/engine";

export const assets = defineModelAssets(
  {
    hero: {
      url: new URL("./assets/hero.glb", import.meta.url).pathname,
      sha256: "0".repeat(64),
      sizeBytes: 1_200_000
    }
  },
  { license: "Own work, CC0-1.0, 2026-10-24" }
);
