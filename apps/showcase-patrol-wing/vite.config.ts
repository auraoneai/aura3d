import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

// `@aura3d/engine/game` (imported by src/main.ts) has no root vite alias:
// the generated root alias maps the bare `@aura3d/engine` specifier to a
// file, and vite string aliases match by prefix, so without these entries
// `@aura3d/engine/game` would rewrite to `<public/index.ts>/game`. Resolve
// it to the same packages/game sources the sibling showcase apps alias as
// `@aura3d/game` (subpaths before the bare specifier, deepest first). The
// `@aura3d/game` pair is kept for transitive imports inside packages/game
// and for art/direction.ts (`@aura3d/game/art`).
const gameAlias = [
  { find: "@aura3d/engine/game/capture", replacement: path.join(repoRoot, "packages/game/src/capture/index.ts") },
  { find: "@aura3d/engine/game/art", replacement: path.join(repoRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/engine/game/util", replacement: path.join(repoRoot, "packages/game/src/util/index.ts") },
  { find: "@aura3d/engine/game", replacement: path.join(repoRoot, "packages/game/src/index.ts") },
  { find: "@aura3d/game/art", replacement: path.join(repoRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/game", replacement: path.join(repoRoot, "packages/game/src/index.ts") }
];
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  root: appDir,
  base: "./",
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: [...gameAlias, ...baseAlias] },
  optimizeDeps: rootConfig.optimizeDeps,
  // App-local public dir: aura.assets.json emits the typed GLBs to
  // public/aura-assets relative to this app (the template layout).
  publicDir: path.resolve(appDir, "public"),
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: false,
    fs: { allow: [repoRoot] }
  },
  preview: {
    host: "127.0.0.1",
    port: 4190,
    strictPort: false
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(appDir, "index.html")
    }
  }
});
