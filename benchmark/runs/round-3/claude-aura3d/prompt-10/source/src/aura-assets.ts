// Typed asset module for the Aura3D product viewer.
//
// This mirrors what `npx @aura3d/cli@latest assets add` would emit for the
// user-approved file. The only asset is benchmark/assets/sneaker.glb, copied
// into this project's `public/` directory and therefore served by Vite at the
// path below. Do not invent additional assets or paths.
import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  sneaker: {
    type: "model",
    format: "glb",
    // Served from `public/benchmark/assets/sneaker.glb`.
    url: "/benchmark/assets/sneaker.glb",
    metadata: {
      license: "user-provided",
    },
  },
});
