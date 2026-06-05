import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const auraRoot = resolve(__dirname, "../..");
const auraDistRoot = resolve(auraRoot, "dist");

export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "aura-clash-strip-sdk-source-map-comments",
      enforce: "pre",
      load(id) {
        if (!id.startsWith(auraDistRoot) || !id.endsWith(".js")) {
          return null;
        }

        return readFileSync(id, "utf8").replace(/\n\/\/# sourceMappingURL=.*$/u, "");
      }
    }
  ],
  resolve: {
    alias: [
      { find: /^@aura3d\/engine$/, replacement: resolve(auraRoot, "dist/engine/agent-api/index.js") },
      { find: /^@aura3d\/engine\/advanced-runtime$/, replacement: resolve(auraRoot, "dist/engine/advanced-runtime/index.js") },
      { find: /^@aura3d\/engine\/production-runtime$/, replacement: resolve(auraRoot, "dist/engine/production-runtime/index.js") },
      { find: /^@aura3d\/engine\/assets\/browser$/, replacement: resolve(auraRoot, "dist/assets/browser-index.js") },
      { find: /^@aura3d\/engine\/rendering$/, replacement: resolve(auraRoot, "dist/rendering/index.js") },
      { find: /^@aura3d\/engine\/scene$/, replacement: resolve(auraRoot, "dist/scene/index.js") },
      { find: /^@aura3d\/scene$/, replacement: resolve(auraRoot, "dist/scene/index.js") }
    ]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1100
  },
  server: {
    host: "0.0.0.0"
  }
});
