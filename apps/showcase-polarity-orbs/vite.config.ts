import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  worker: {
    format: "es"
  },
  server: {
    host: "127.0.0.1",
    port: 5201,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4201,
    strictPort: true
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