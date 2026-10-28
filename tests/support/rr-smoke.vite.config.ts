// Builds the two Apex Overdrive production routes the way marketing/scripts/build-showcase-routes.mjs does (same aliases),
// into /tmp/rr-dist, for tests/browser/roadster-rush-native-smoke.spec.ts. Run from the repo root:
//   node_modules/.bin/vite build --config tests/support/rr-smoke.vite.config.ts
// then stage with tests/support/rr-smoke-stage.sh.
import path from "node:path";
import rootConfig from "../../vite.config";

const repoRoot = path.resolve(".");
const retarget = path.join(repoRoot, "packages/animation/src/pose/retarget.worker.ts");
const resolveRetarget = () => ({
  name: "resolve-retarget-worker",
  resolveId(id: string) {
    return id.endsWith("packages/animation/src/pose/retarget.worker.js") || id.endsWith("packages/animation/src/pose/retarget.worker.ts") ? retarget : null;
  }
});
const alias = (rootConfig as { resolve: { alias: Array<{ find: string | RegExp; replacement: string }> } }).resolve.alias;
const gamePkg = path.join(repoRoot, "packages/game/src/index.ts");
export default {
  root: repoRoot,
  publicDir: false,
  base: "/",
  plugins: [resolveRetarget()],
  worker: { plugins: () => [resolveRetarget()] },
  resolve: {
    alias: [
      { find: /^@aura3d\/engine\/game$/, replacement: gamePkg },
      { find: /^@aura3d\/game$/, replacement: gamePkg },
      { find: /^@aura3d\/engine$/, replacement: path.join(repoRoot, "packages/engine/src/public/index.ts") },
      ...alias.filter((entry) => entry.find !== "@aura3d/engine")
    ],
    dedupe: ["@aura3d/engine"]
  },
  build: {
    target: "es2022",
    outDir: "/tmp/rr-dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        "showcase-roadster-rush": path.join(repoRoot, "apps/showcase-roadster-rush/index.html")
      }
    }
  }
};
