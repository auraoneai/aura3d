import { defineModelAssets } from "@aura3d/engine";

export const assets = defineModelAssets(
  {
    hero: {
      url: new URL("./assets/hero.glb", import.meta.url).pathname,
      sha256: "0".repeat(64),
      sizeBytes: 1_200_000
    }
  },
  { license: "Own text prompt, generated with Meshy through Kiro Prism, 2026-10-24" }
);
