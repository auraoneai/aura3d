// Builds the before/after benchmark pages from monorepo source (same pattern as docs/agents/recipes-src/vite.config.ts).
//   pnpm exec vite build --config evidence/frame-514/vite.config.ts
//   node evidence/frame-514/tools/capture.mjs <page-id> <out.png>   (serves .dist itself)
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, "pages");
const ids = readdirSync(pages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(resolve(pages, entry.name, "index.html")))
  .map((entry) => entry.name);

export default {
  root: pages,
  base: "./",
  resolve: rootConfig.resolve,
  plugins: [createSourceWorkerEntryPlugin()],
  build: {
    outDir: "/tmp/frame514/dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: Object.fromEntries(ids.map((name) => [name, resolve(pages, name, "index.html")])) }
  }
};
