import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This app lives inside the aura3d monorepo but outside its route system, so it
// consumes the already-built engine dist directly instead of installing a
// duplicate copy from the registry. That keeps it pinned to the working tree
// and makes `npm run dev` work with no install step.
//
// Two consequences the config has to handle:
//   - the alias targets sit above the app root, so Vite must be allowed to read
//     them (server.fs.allow);
//   - they must not be pre-bundled, because esbuild's dep optimizer rewrites
//     module order and the engine's internal cross-imports are order-sensitive.
const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const engineAliases = [
  { find: /^@aura3d\/engine\/game$/, replacement: resolve(repoRoot, "dist/game/index.js") },
  { find: /^@aura3d\/engine$/, replacement: resolve(repoRoot, "dist/engine/public/index.js") }
];

export default defineConfig({
  resolve: { alias: engineAliases },
  optimizeDeps: {
    exclude: ["@aura3d/engine", "@aura3d/engine/game"]
  },
  server: {
    host: "127.0.0.1",
    port: 5273,
    fs: { allow: [repoRoot] }
  },
  preview: { host: "127.0.0.1", port: 5274 },
  build: {
    // Keep the engine in its own chunk so Rollup does not hoist app code above
    // the engine's initialisation order.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/dist/engine/") || id.includes("/dist/game/")) return "aura3d-engine";
          return undefined;
        }
      }
    }
  }
});
