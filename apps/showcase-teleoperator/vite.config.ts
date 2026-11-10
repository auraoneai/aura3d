import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  worker: { format: "es", plugins: () => [createSourceWorkerEntryPlugin()] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  server: { host: "127.0.0.1", port: 5198, strictPort: false },
  preview: { host: "127.0.0.1", port: 4198, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(appDir, "index.html")
    }
  }
});
