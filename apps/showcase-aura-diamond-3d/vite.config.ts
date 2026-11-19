import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const sharedAuraAssetsDir = path.resolve(appDir, "../../public/aura-assets");

/**
 * Idol pass: the Idol GLBs are admitted into the repo-root catalog (public/aura-assets/<key>.<hash>.glb) by
 * tools/idol/admit.sh. This app keeps its own public/ tree (the synthesized audio), so the files listed in
 * src/aura-assets.idol.ts are served from the root tree in dev/preview and emitted into dist/aura-assets/ at build time.
 */
function idolAssetFiles(): string[] {
  const src = fs.readFileSync(path.resolve(appDir, "src/aura-assets.idol.ts"), "utf8");
  return [...src.matchAll(/url: "\/aura-assets\/([^"]+)"/g)].map((m) => m[1]!);
}
const serveIdolAsset = (req: Connect.IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
  const rel = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(/^\/+/, "");
  if (!idolAssetFiles().includes(rel)) { next(); return; }
  const file = path.join(sharedAuraAssetsDir, rel);
  if (!fs.existsSync(file)) { next(); return; }
  res.setHeader("content-type", "model/gltf-binary");
  res.setHeader("content-length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
};
const idolAssets: Plugin = {
  name: "aura-diamond-idol-assets",
  configureServer(server) { server.middlewares.use("/aura-assets", serveIdolAsset); },
  configurePreviewServer(server) { server.middlewares.use("/aura-assets", serveIdolAsset); },
  generateBundle() {
    for (const name of idolAssetFiles()) {
      const file = path.join(sharedAuraAssetsDir, name);
      if (!fs.existsSync(file)) this.error(`Idol asset missing from public/aura-assets: ${name} (re-run tools/idol/admit.sh)`);
      this.emitFile({ type: "asset", fileName: `aura-assets/${name}`, source: fs.readFileSync(file) });
    }
  }
};

export default defineConfig({
  plugins: [...(rootConfig.plugins ?? []), idolAssets],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  worker: { format: "es", plugins: () => [createSourceWorkerEntryPlugin()] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  server: { host: "127.0.0.1", port: 5192, strictPort: false },
  preview: { host: "127.0.0.1", port: 4192, strictPort: false },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(appDir, "index.html")
    }
  }
});
