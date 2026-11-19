import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const sharedPublicDir = path.resolve(appDir, "../../public");

/**
 * Idol wow pass: the Idol vehicle / commuter GLBs are admitted to the root manifest (`/aura-assets/<key>.<hash>.glb` in the
 * shared public tree). Dev and preview serve that prefix from the shared tree; the site serves it from the shared
 * `/aura-assets` mount (tools/site/route-aliases.mjs `sharedAuraAssets`).
 */
const sharedAuraAssets = (req: Connect.IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
  const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
  const file = path.resolve(sharedPublicDir, "aura-assets", rel);
  if (!file.startsWith(path.join(sharedPublicDir, "aura-assets") + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    next();
    return;
  }
  res.setHeader("content-type", file.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
  res.setHeader("content-length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
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
  worker: { format: "es", plugins: () => [createSourceWorkerEntryPlugin()] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  server: { host: "127.0.0.1", port: 5198, strictPort: false },
  preview: { host: "127.0.0.1", port: 4198, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(appDir, "index.html")
    }
  }
});
