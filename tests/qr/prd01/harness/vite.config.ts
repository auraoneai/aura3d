/**
 * QR lane-01 harness vite config. Reuses the repo-root resolve aliases so
 * `@aura3d/*` resolves to workspace sources and `three` to the pinned
 * devDependency — same strategy as benchmarks/quality-rebuild/vite.config.ts.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../../../vite.config";

const harnessDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(harnessDir, "../../../..");

const auraVersion = (JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string }).version;
const threeVersion = (JSON.parse(readFileSync(resolve(repoRoot, "node_modules/three/package.json"), "utf8")) as { version: string }).version;
if (threeVersion !== "0.185.1") {
  throw new Error(`prd01 harness requires three@0.185.1, found ${threeVersion} in node_modules/three`);
}

export default defineConfig({
  root: harnessDir,
  base: "./",
  publicDir: false,
  resolve: rootConfig.resolve,
  define: {
    __AURA3D_VERSION__: JSON.stringify(auraVersion),
    __THREE_VERSION__: JSON.stringify(threeVersion)
  },
  server: {
    host: "127.0.0.1",
    fs: { allow: [repoRoot] }
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: resolve(harnessDir, "index.html")
    }
  }
});
