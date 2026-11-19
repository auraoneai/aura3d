import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const rootAuraAssets = path.resolve(repoRoot, "public/aura-assets");

/** The Idol-generated Saltwind models (`sw*` keys) the game references through `src/aura-assets.route.ts`. */
function saltwindAssetFiles(): string[] {
  const manifest = fs.readFileSync(path.resolve(appDir, "src/aura-assets.route.ts"), "utf8");
  return [...new Set([...manifest.matchAll(/url: "\/aura-assets\/(sw[A-Z][A-Za-z0-9]*\.[0-9a-f]+\.glb)"/g)].map((m) => m[1]!))];
}

function serveAuraAssets(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = (req.url ?? "").split("?")[0] ?? "";
  const name = url.startsWith("/aura-assets/") ? decodeURIComponent(url.slice("/aura-assets/".length)) : "";
  if (!/^[A-Za-z0-9._-]+\.glb$/.test(name)) return next();
  const file = path.join(rootAuraAssets, name);
  if (!fs.existsSync(file)) return next();
  res.statusCode = 200;
  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Content-Length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
}

/** Serves `/aura-assets/*.glb` from the root public tree in dev/preview and copies only the game's `sw*` models into `dist`. */
function saltwindAuraAssetsPlugin(): Plugin {
  return {
    name: "saltwind-aura-assets",
    configureServer(server) { server.middlewares.use(serveAuraAssets); },
    configurePreviewServer(server) { server.middlewares.use(serveAuraAssets); },
    writeBundle(options) {
      const out = path.resolve(options.dir ?? path.resolve(appDir, "dist"), "aura-assets");
      fs.mkdirSync(out, { recursive: true });
      for (const name of saltwindAssetFiles()) fs.copyFileSync(path.join(rootAuraAssets, name), path.join(out, name));
    }
  };
}

export default defineConfig({
  plugins: [saltwindAuraAssetsPlugin(), ...(rootConfig.plugins ?? [])],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: false,
  worker: {
    format: "es",
    plugins: () => [createSourceWorkerEntryPlugin()]
  },
  server: {
    host: "127.0.0.1",
    port: 5198,
    strictPort: false,
    fs: {
      allow: [repoRoot, path.resolve(appDir, "../showcase-port-shared")]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4198,
    strictPort: false
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
