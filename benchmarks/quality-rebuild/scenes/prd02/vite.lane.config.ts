/**
 * Lane prd02 vite config: same aliases + asset plugin as the base benchmark
 * config, but the entry point is this lane's `lane.html` so lane scenes do not
 * need edits to the shared `index.html`/`main.ts`/`capture.mjs` (lane 12).
 * Output goes to `scenes/prd02/dist`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../../vite.config";

const laneDir = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(baseConfig, {
  build: {
    outDir: "scenes/prd02/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(laneDir, "lane.html")
    }
  }
});
