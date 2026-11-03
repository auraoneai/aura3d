import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const auraRoot = resolve(__dirname, "../..");
const auraDistRoot = resolve(auraRoot, "dist");

export default defineConfig({
  base: "/",
  plugins: [
    {
      name: "aura3d-showcase-strip-sdk-source-map-comments",
      enforce: "pre",
      load(id) {
        if (!id.startsWith(auraDistRoot) || !id.endsWith(".js")) return null;
        return readFileSync(id, "utf8").replace(/\n\/\/# sourceMappingURL=.*$/u, "");
      }
    }
  ],
  resolve: {
    // Inside the monorepo the route builds against the repo's built SDK. An
    // isolated consumer copy (no repo dist/) resolves the installed package.
    alias: existsSync(resolve(auraRoot, "dist/engine/public/index.js")) ? [
      { find: /^@aura3d\/engine$/, replacement: resolve(auraRoot, "dist/engine/public/index.js") },
      { find: /^@aura3d\/engine\/rendering$/, replacement: resolve(auraRoot, "dist/rendering/index.js") },
      { find: /^@aura3d\/engine\/scene$/, replacement: resolve(auraRoot, "dist/scene/index.js") }
    ] : []
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1200
  },
  server: {
    host: "0.0.0.0"
  }
});
