import { resolve } from "node:path";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

// Lane-14 `@aura3d/game` local-src alias (root vite.config is lane-15 owned).
// Subpath entries must precede the bare specifier — Vite prefix-matches in
// order, so "@aura3d/game/art" resolves before "@aura3d/game".
const auraRoot = resolve(__dirname, "../..");
const gameAliases = [
  { find: "@aura3d/game/art", replacement: resolve(auraRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/game", replacement: resolve(auraRoot, "packages/game/src/index.ts") }
];
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  base: "/",
  plugins: rootConfig.plugins ?? [],
  resolve: {
    alias: [...gameAliases, ...baseAlias],
    dedupe: ["@aura3d/engine", "@aura3d/scene", "@aura3d/animation"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1100
  }
});
