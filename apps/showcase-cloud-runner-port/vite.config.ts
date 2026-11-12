import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: false,
  worker: {
    format: "es",
    plugins: () => [createSourceWorkerEntryPlugin()]
  },
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: false,
    fs: {
      allow: [repoRoot, path.resolve(appDir, "../showcase-port-shared")]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4199,
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
