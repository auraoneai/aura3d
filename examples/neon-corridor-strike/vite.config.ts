import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@aura3d/engine": resolve(__dirname, "../../packages/engine/src/index.ts")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
    fs: { allow: ["../.."] }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  plugins: [
    {
      name: "example-asset-path",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const url = request.url ?? "";
          if (url.startsWith("/examples/neon-corridor-strike/public/")) {
            request.url = url.replace("/examples/neon-corridor-strike/public", "");
          }
          next();
        });
      },
      configurePreview(server) {
        server.middlewares.use((request, _response, next) => {
          const url = request.url ?? "";
          if (url.startsWith("/examples/neon-corridor-strike/public/")) {
            request.url = url.replace("/examples/neon-corridor-strike/public", "");
          }
          next();
        });
      }
    }
  ]
});
