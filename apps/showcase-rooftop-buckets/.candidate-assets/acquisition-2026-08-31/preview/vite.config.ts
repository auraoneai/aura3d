import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: true,
    fs: { allow: [resolve(__dirname, "../../../../../..")] }
  },
  resolve: {
    alias: {
      "@aura3d/engine": resolve(__dirname, "../../../../../packages/engine/src/index.ts")
    }
  }
});
