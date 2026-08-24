import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    port: 5189,
    strictPort: true
  },
  resolve: {
    alias: {
      "@aura3d/engine": resolve(__dirname, "../../packages/engine/src/index.ts")
    }
  }
});
