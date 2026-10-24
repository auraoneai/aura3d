import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
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
