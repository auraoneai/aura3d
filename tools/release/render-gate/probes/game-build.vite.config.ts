// Builds ONE showcase game app from monorepo source (root aliases, no engine dist needed) for the real-GPU
// base-vs-fix safety check:
//   GAME_DIR=apps/showcase-top-tennis GAME_OUT=/tmp/game-fix-top-tennis \
//     pnpm exec vite build --config tools/release/render-gate/probes/game-build.vite.config.ts
// The same command run in an `origin/main` worktree builds the base. Serve the output dir and open `index.html`
// (see cdp-capture.mjs).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../../../vite.config";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const gameDir = process.env.GAME_DIR;
if (!gameDir) throw new Error("GAME_DIR (e.g. apps/showcase-top-tennis) is required");

export default {
  root: resolve(repo, gameDir),
  base: "./",
  resolve: rootConfig.resolve,
  plugins: [createSourceWorkerEntryPlugin()],
  build: {
    outDir: resolve(process.env.GAME_OUT ?? "/tmp/game-out"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 100000
  }
};
