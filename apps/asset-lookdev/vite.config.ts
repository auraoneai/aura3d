// apps/asset-lookdev/vite.config.ts — look-dev dev-server config.
//
// Same repair pattern as apps/showcase-turbo-drift-circuit/vite.config.ts:
// the generated root aliases are PREFIX-matched in order, and the generated
// list emits `@aura3d/rendering/world` AFTER bare `@aura3d/rendering`, so the
// deep specifier rewrites to `packages/rendering/src/index.ts/world` and dies
// (Q-05-4 — generator ordering, lane-15 owned). Sorting the merged alias list
// longest-first makes prefix matching select the most specific alias, which
// fixes this and any sibling deep specifier for this app's dev server only;
// other apps/workflows stay on the generated list untouched.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

const worldAlias = {
  find: "@aura3d/rendering/world",
  replacement: path.join(repoRoot, "packages/rendering/src/world/index.ts")
};
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const alias = [...baseAlias.map((a) => ({ find: a.find ?? a[0], replacement: a.replacement ?? a[1] })), worldAlias]
  .sort((a, b) => String(b.find).length - String(a.find).length);

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "../../public"),
  server: {
    ...(typeof rootConfig.server === "object" ? rootConfig.server : {}),
    host: "127.0.0.1"
  }
});
