/**
 * 01-HANG fixture build: the lane-01 harness production build settings
 * (tests/qr/prd01/harness/vite.config.ts) on an engine-only entry. Uses the
 * repo-root resolve aliases, so `@aura3d/*` resolves to workspace sources.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../../../../../vite.config";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: fixtureDir,
  base: "./",
  publicDir: false,
  resolve: rootConfig.resolve,
  define: { __AURA3D_VERSION__: JSON.stringify("fixture") },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: { input: resolve(fixtureDir, "index.html") }
  }
});
