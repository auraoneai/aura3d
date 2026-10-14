import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

// @aura3d/game has no root vite alias yet (the package is C-24/PRD-14 era and
// root vite.config is lane-15 owned). Subpath before the bare specifier —
// vite string aliases match by prefix, so `@aura3d/game` would otherwise
// rewrite `@aura3d/game/art` to `<pkg>/index.ts/art`.
const gameAlias = [
  { find: "@aura3d/game/art", replacement: path.join(repoRoot, "packages/game/src/art/index.ts") },
  { find: "@aura3d/game", replacement: path.join(repoRoot, "packages/game/src/index.ts") }
];
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: [...gameAlias, ...baseAlias] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "../../public"),
  server: {
    host: "127.0.0.1",
    port: 5191,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 4191,
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
