import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const sharedAuraAssetsDir = path.resolve(appDir, "../../public/aura-assets");
const appAuraAssetsDir = path.resolve(appDir, "public/aura-assets");

/**
 * Idol pass (Nov 2026): the Idol GLBs are admitted into the repo-wide public/aura-assets (served at /aura-assets on the
 * site), while this route's publicDir is app-local (it only holds the HUD font). Dev and preview serve any /aura-assets
 * file the route-local public tree lacks from the shared directory, so the karts, cans, buckets and arena load locally too.
 */
function sharedAuraAssets(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const name = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/").replace(/^\/+/, "");
  const local = path.resolve(appAuraAssetsDir, name);
  const shared = path.resolve(sharedAuraAssetsDir, name);
  if (!name || (local.startsWith(appAuraAssetsDir + path.sep) && fs.existsSync(local))) return next();
  if (!shared.startsWith(sharedAuraAssetsDir + path.sep) || !fs.existsSync(shared) || !fs.statSync(shared).isFile()) return next();
  res.setHeader("Content-Type", shared.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
  res.setHeader("Content-Length", String(fs.statSync(shared).size));
  fs.createReadStream(shared).pipe(res);
}
const serveSharedAuraAssets: Plugin = {
  name: "splat-turf-shared-aura-assets",
  configureServer(server) { server.middlewares.use("/aura-assets", sharedAuraAssets); },
  configurePreviewServer(server) { server.middlewares.use("/aura-assets", sharedAuraAssets); }
};

export default defineConfig({
  plugins: [serveSharedAuraAssets, ...(rootConfig.plugins ?? [])],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  worker: {
    format: "es"
  },
  server: {
    host: "127.0.0.1",
    port: 5200,
    strictPort: true,
    fs: {
      allow: [appDir, path.resolve(appDir, "../showcase-port-shared"), path.resolve(appDir, "../..")]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4200,
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
