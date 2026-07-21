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
    chunkSizeWarningLimit: 1100
  },
  server: {
    host: "0.0.0.0"
  }
});
