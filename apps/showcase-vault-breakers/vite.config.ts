import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: rootConfig.plugins ?? [],
  resolve: rootConfig.resolve,
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "../../public"),
  server: {
    host: "127.0.0.1",
    port: 5189,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 4189,
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
