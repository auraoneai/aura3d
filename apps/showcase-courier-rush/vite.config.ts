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
// `@aura3d/game` pair is kept for transitive imports inside packages/game.
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
  // The route's typed assets are admitted in the repo-root manifest and
  // served from the shared public/aura-assets tree (hashed GLB/WAV urls in
  // src/aura-assets.ts), so the public dir stays the repo root public/.
  publicDir: path.resolve(repoRoot, "public"),
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: false,
    fs: { allow: [repoRoot] }
  },
  preview: {
    host: "127.0.0.1",
    port: 4187,
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
