import { resolve } from "node:path";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const auraRoot = resolve(__dirname, "../..");
const rootAliases = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  base: "/",
  resolve: {
    alias: rootAliases,
    dedupe: ["@aura3d/engine", "@aura3d/scene", "@aura3d/animation"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        /**
         * Split the engine packages out of the route bundle.
         *
         * Without this everything collapsed into one 1.56 MB `AuraClashArenaApp` chunk, putting the
         * route's total JS at 1.71 MB against the 1.4 MB budget in
         * `tests/performance-budget.spec.ts`. The renderer, scene math, and animation sampler are
         * shared library code with a different change cadence from the route, so separating them
         * both satisfies the budget and lets a browser cache them across route edits.
         *
         * Chunked by package boundary rather than by arbitrary size so the split stays meaningful
         * as the route grows.
         */
        manualChunks(id: string) {
          if (!id.includes("packages/")) return undefined;
          // WebGPU is dynamically imported by `createRenderDevice` so a WebGL2 route does not ship
          // it. Assigning it to a manual chunk would force it back into the eager graph and undo
          // that, so it must fall through to Rollup's own dynamic-import chunking.
          if (id.includes("WebGPUDevice") || id.includes("packages/rendering/src/webgpu/")) return undefined;
          if (id.includes("packages/rendering/")) return "aura-rendering";
          if (id.includes("packages/animation/")) return "aura-animation";
          if (id.includes("packages/scene/")) return "aura-scene";
          if (id.includes("packages/engine/")) return "aura-engine";
          return undefined;
        }
      }
    }
  },
  server: {
    host: "0.0.0.0"
  }
});
