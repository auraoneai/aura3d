import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../../../../vite.config";

const candidateDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: candidateDir,
  plugins: rootConfig.plugins ?? [],
  resolve: rootConfig.resolve,
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: false,
  server: {
    host: "127.0.0.1",
    port: 4197,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: path.resolve(candidateDir, "dist-preview"),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(candidateDir, "index.html") }
  }
});
