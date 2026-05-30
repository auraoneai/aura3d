// Typed Aura3D asset module.
//
// This mirrors what `npx @aura3d/cli@latest assets add` generates: a typed
// asset reference built with the public `defineAuraAssets` API. The only asset
// this project is allowed to use is the provided sneaker model, served by Vite
// from `public/benchmark/assets/sneaker.glb` at the public URL below.
//
// Do not invent additional asset ids or paths — use `assets.sneaker` only.
import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  sneaker: {
    type: "model",
    format: "glb",
    // Provided asset: benchmark/assets/sneaker.glb (served from public/).
    url: "/benchmark/assets/sneaker.glb",
    sizeBytes: 7833592,
    metadata: {
      license: "provided-by-benchmark"
    }
  }
});
