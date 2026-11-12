import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootPublicDir = path.resolve(appDir, "../../public");
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

const SHARED_PUBLIC_PREFIXES = ["/hdri/", "/aura-assets/", "/fonts/"] as const;
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json"
};

function createRootPublicMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      next();
      return;
    }
    const rawUrl = (req.url ?? "/").split("?")[0] ?? "/";
    let decodedPath = rawUrl;
    try {
      decodedPath = decodeURIComponent(rawUrl);
    } catch {
      next();
      return;
    }
    if (!SHARED_PUBLIC_PREFIXES.some((prefix) => decodedPath.startsWith(prefix))) {
      next();
      return;
    }
    const resolved = path.resolve(rootPublicDir, `.${decodedPath}`);
    if (!resolved.startsWith(rootPublicDir + path.sep)) {
      next();
      return;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      next();
      return;
    }
    if (!stat.isFile()) {
      next();
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(resolved);
    stream.on("error", () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
  };
}

function serveRootPublicAssetsPlugin(): Plugin {
  return {
    name: "aura-hoops-root-public-assets",
    configureServer(server) {
      server.middlewares.use(createRootPublicMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createRootPublicMiddleware());
    }
  };
}

export default defineConfig({
  plugins: [serveRootPublicAssetsPlugin(), ...(rootConfig.plugins ?? [])],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  worker: { format: "es", plugins: () => [createSourceWorkerEntryPlugin()] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  server: { host: "127.0.0.1", port: 5193, strictPort: false },
  preview: { host: "127.0.0.1", port: 4193, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(appDir, "index.html")
    }
  }
});
