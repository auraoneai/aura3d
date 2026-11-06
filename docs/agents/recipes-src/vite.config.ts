// Builds every recipe in this folder from monorepo source for the real-GPU render check:
//   pnpm exec vite build --config docs/agents/recipes-src/vite.config.ts
//   pnpm exec vite preview --config docs/agents/recipes-src/vite.config.ts --host 127.0.0.1 --port 4173
// Each recipe is `<name>/index.html` + `<name>/main.ts`. In a scaffolded project the imports are the same
// (`@aura3d/engine`); only this file is monorepo-specific.
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../../vite.config";

const here = dirname(fileURLToPath(import.meta.url));
const recipes = readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(resolve(here, entry.name, "index.html")))
  .map((entry) => entry.name);

export default {
  root: here,
  base: "./",
  resolve: rootConfig.resolve,
  plugins: [createSourceWorkerEntryPlugin()],
  build: {
    outDir: resolve(here, ".dist"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: Object.fromEntries(recipes.map((name) => [name, resolve(here, name, "index.html")])) }
  },
  preview: { host: "127.0.0.1", port: 4173 }
};
