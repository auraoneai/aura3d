// Builds the render-gate probes from monorepo source for the real-GPU motion verification:
//   pnpm exec vite build --config tools/release/render-gate/probes/vite.config.ts            # -> probes/.dist (or PROBE_OUT)
//   pnpm exec vite preview --config tools/release/render-gate/probes/vite.config.ts --host 127.0.0.1 --port 4174
// Each probe is `<name>/index.html` + `<name>/main.ts`.
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../../../vite.config";

const here = dirname(fileURLToPath(import.meta.url));
const probes = readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(resolve(here, entry.name, "index.html")))
  .map((entry) => entry.name);

export default {
  root: here,
  base: "./",
  resolve: rootConfig.resolve,
  plugins: [createSourceWorkerEntryPlugin()],
  build: {
    outDir: process.env.PROBE_OUT ? resolve(process.env.PROBE_OUT) : resolve(here, ".dist"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: Object.fromEntries(probes.map((name) => [name, resolve(here, name, "index.html")])) }
  },
  preview: { host: "127.0.0.1", port: 4174 }
};
