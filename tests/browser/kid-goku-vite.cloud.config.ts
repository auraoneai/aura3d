// Production-style build of the Cumulus Dash app route only (hashed assets, no dev-server URL rewriting), for the remote leg-motion spec.
// Mirrors marketing/vite.config.ts where it matters for this page: the retarget worker must resolve (the engine waits on it) and assets are not inlined.
// usage: node_modules/.bin/vite build --config tests/browser/kid-goku-vite.cloud.config.ts && node_modules/.bin/vite preview --config tests/browser/kid-goku-vite.cloud.config.ts
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../vite.config";

const root = fileURLToPath(new URL("../..", import.meta.url));

function resolveRetargetWorker() {
  const target = resolve(root, "packages/animation/src/pose/retarget.worker.ts");
  return {
    name: "resolve-retarget-worker",
    resolveId(id: string) {
      return id.endsWith("packages/animation/src/pose/retarget.worker.js") || id.endsWith("packages/animation/src/pose/retarget.worker.ts") ? target : null;
    }
  };
}

export default {
  ...base,
  root,
  plugins: [resolveRetargetWorker(), ...((base as { plugins?: unknown[] }).plugins ?? [])],
  worker: { plugins: () => [resolveRetargetWorker(), ...((base as { plugins?: unknown[] }).plugins ?? [])] },
  build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0, outDir: "/tmp/cloud-dist", emptyOutDir: true, rollupOptions: { input: `${root}apps/showcase-cloud-runner-port/index.html` } },
  preview: { host: "127.0.0.1", port: 5188, strictPort: true }
};
