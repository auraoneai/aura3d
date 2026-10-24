import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const sharedPublicDir = path.join(repoRoot, "public");
const appPublicDir = path.resolve(appDir, "public");

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

// The facade keeps `backdrop`/NPC refs in the shared repo catalog, whose
// `/aura-assets/<name>.<hash>.glb` files live in the root `public/` tree —
// not this app's own `public/aura-assets/` (which holds only the six
// Meshy-imported GLBs). Fall back to the shared tree on a miss so the app
// resolves them under its own dev/preview server too (same trick as
// apps/asset-lookdev's /assets middleware, scoped to /aura-assets).
const contentTypes: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".hdr": "application/octet-stream",
  ".bin": "application/octet-stream"
};
const sharedAuraAssets = (req: Connect.IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
  const urlPath = decodeURIComponent((req.url ?? "").split("?")[0]);
  const rel = urlPath.replace(/^\/+/, "");
  const appFile = path.resolve(appPublicDir, rel);
  if (appFile.startsWith(appPublicDir + path.sep) && fs.existsSync(appFile) && fs.statSync(appFile).isFile()) {
    next(); // app-local asset — let Vite's publicDir static serve it
    return;
  }
  const sharedFile = path.resolve(sharedPublicDir, rel);
  if (!sharedFile.startsWith(sharedPublicDir + path.sep) || !fs.existsSync(sharedFile) || !fs.statSync(sharedFile).isFile()) {
    next();
    return;
  }
  res.setHeader("content-type", contentTypes[path.extname(sharedFile)] ?? "application/octet-stream");
  res.setHeader("content-length", String(fs.statSync(sharedFile).size));
  fs.createReadStream(sharedFile).pipe(res);
};
const serveSharedAuraAssets: Plugin = {
  name: "a3d-serve-shared-aura-assets",
  configureServer(server) {
    server.middlewares.use("/aura-assets", sharedAuraAssets);
  },
  configurePreviewServer(server) {
    server.middlewares.use("/aura-assets", sharedAuraAssets);
  }
};

export default defineConfig({
  plugins: [...(rootConfig.plugins ?? []), serveSharedAuraAssets],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  // App-local public tree: the Meshy-imported catalog lives under
  // public/aura-assets (aura.assets.json outputDir), and public/packs is a
  // symlink into the shared SFX pack so /packs/game-sfx-core keeps resolving.
  publicDir: path.resolve(appDir, "public"),
  server: { host: "127.0.0.1", port: 5183, strictPort: false },
  preview: { host: "127.0.0.1", port: 4183, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
