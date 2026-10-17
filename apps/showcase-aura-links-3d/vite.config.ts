import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

// Same alias discipline as showcase-bunker-zero / showcase-vault-breakers:
// `@aura3d/engine/game` is missing from vite.aliases.generated (stale), so the
// subpath is mapped to packages/game/src/index.ts ahead of the bare specifier
// and before the generated engine aliases.
const gameAlias = [
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
  // and preview; the route-local public/ dir is layered by the remote-capture
  // serve step (tools/remote-capture.sh copies apps/<route>/public/*).
  publicDir: path.resolve(appDir, "../../public"),
  server: { host: "127.0.0.1", port: 5191, strictPort: false },
  preview: { host: "127.0.0.1", port: 4191, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
