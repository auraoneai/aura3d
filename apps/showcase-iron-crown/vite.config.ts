import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

// Same alias discipline as showcase-vault-breakers / showcase-bunker-zero:
// @aura3d/game has no root vite alias (the root config is lane-15 owned), so
// the lane-14 package gets explicit local-src entries. Subpath finds precede
// the bare specifier — Vite prefix-matches in order.
// `@aura3d/engine/game` needs the same treatment: the root generated alias
// maps bare `@aura3d/engine` to packages/engine/src/public/index.ts, and its
// prefix match would otherwise rewrite `@aura3d/engine/game` to
// `public/index.ts/game` (ENOTDIR). tsconfig paths map these specifiers to
// packages/game/src — mirror that here.
const gameAlias = [
  { find: "@aura3d/engine/game/capture", replacement: path.join(repoRoot, "packages/game/src/capture/index.ts") },
  { find: "@aura3d/engine/game/util", replacement: path.join(repoRoot, "packages/game/src/util/index.ts") },
  { find: "@aura3d/engine/game/art", replacement: path.join(repoRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/engine/game", replacement: path.join(repoRoot, "packages/game/src/index.ts") },
  { find: "@aura3d/game/art", replacement: path.join(repoRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/game", replacement: path.join(repoRoot, "packages/game/src/index.ts") }
];
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: [...gameAlias, ...baseAlias] },
  optimizeDeps: rootConfig.optimizeDeps,
  // Root public tree serves the shared catalog (/aura-assets, /packs) in dev
  // and preview.
  publicDir: path.resolve(appDir, "../../public"),
  server: { host: "127.0.0.1", port: 5196, strictPort: false },
  preview: { host: "127.0.0.1", port: 4196, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
