import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

// Idol wow pass: admitted GLBs live in the root public/aura-assets tree (tools/idol/admit.sh), not this app's
// public dir. Serve /aura-assets/* misses from the shared tree under dev and preview (same trick as
// apps/showcase-pips-big-leap/vite.config.ts).
const sharedAuraAssetsDir = path.resolve(appDir, "../../public/aura-assets");
const serveSharedAuraAssets = (req: Connect.IncomingMessage, res: ServerResponse, next: () => void): void => {
  const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
  const appFile = path.resolve(appDir, "public/aura-assets", rel);
  if (fs.existsSync(appFile) && fs.statSync(appFile).isFile()) return next();
  const file = path.resolve(sharedAuraAssetsDir, rel);
  if (!file.startsWith(sharedAuraAssetsDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
  res.setHeader("content-type", file.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
  res.setHeader("content-length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
};
const sharedAuraAssetsPlugin: Plugin = {
  name: "idol-serve-shared-aura-assets",
  configureServer(server) { server.middlewares.use("/aura-assets", serveSharedAuraAssets); },
  configurePreviewServer(server) { server.middlewares.use("/aura-assets", serveSharedAuraAssets); }
};

export default defineConfig({
  plugins: [...(rootConfig.plugins ?? []), sharedAuraAssetsPlugin],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  worker: {
    format: "es"
  },
  server: {
    host: "127.0.0.1",
    port: 5201,
    strictPort: true,
    fs: {
      allow: [path.resolve(appDir, "../..")]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4201,
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