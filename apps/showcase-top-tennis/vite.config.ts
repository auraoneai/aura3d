import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import rootConfig, { createSourceWorkerEntryPlugin } from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoPublic = path.resolve(appDir, "../../public");
const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

/**
 * Idol wow pass: the Aura Slam GLBs are admitted into the repo-root catalog (public/aura-assets/<key>.<hash>.glb) by
 * tools/idol/admit.sh and listed in examples/aura-slam/view/idolAssets.generated.ts. This app keeps its own public/ tree
 * (toptennis/), so the dev and preview servers serve those GLBs, and the venue HDRIs (/hdri/*_1k.hdr, view/assets.ts), from
 * the repo-root public tree; `vite build` emits the GLBs into dist/aura-assets/ (the site serves /hdri at its root).
 */
function idolAssetFiles(): string[] {
  const src = fs.readFileSync(path.resolve(appDir, "../../examples/aura-slam/view/idolAssets.generated.ts"), "utf8");
  return [...src.matchAll(/"url":"\/aura-assets\/([^"]+)"/g)].map((m) => m[1]!);
}
const serveFrom = (dir: string, allowed: (rel: string) => boolean, type: string) =>
  (req: Connect.IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
    const rel = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(/^\/+/, "");
    if (rel.includes("..") || !allowed(rel)) { next(); return; }
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) { next(); return; }
    res.setHeader("content-type", type);
    res.setHeader("content-length", String(fs.statSync(file).size));
    fs.createReadStream(file).pipe(res);
  };
const mount = (server: { middlewares: Connect.Server }) => {
  server.middlewares.use("/aura-assets", serveFrom(path.join(repoPublic, "aura-assets"), (rel) => idolAssetFiles().includes(rel), "model/gltf-binary"));
  server.middlewares.use("/hdri", serveFrom(path.join(repoPublic, "hdri"), (rel) => /^[\w.-]+\.hdr$/.test(rel), "application/octet-stream"));
};
const slamIdolAssets: Plugin = {
  name: "aura-slam-idol-assets",
  configureServer: mount,
  configurePreviewServer: mount,
  generateBundle() {
    for (const name of idolAssetFiles()) {
      // A copy in this app's own public/aura-assets (the packed example harness stages the named root files there)
      // is already copied into dist by Vite's publicDir; emit only what the root tree alone holds.
      if (fs.existsSync(path.join(appDir, "public", "aura-assets", name))) continue;
      const file = path.join(repoPublic, "aura-assets", name);
      if (!fs.existsSync(file)) this.error(`Idol asset missing from public/aura-assets: ${name} (re-run tools/idol/admit.sh)`);
      this.emitFile({ type: "asset", fileName: `aura-assets/${name}`, source: fs.readFileSync(file) });
    }
  }
};

export default defineConfig({
  plugins: [...(rootConfig.plugins ?? []), slamIdolAssets],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  worker: { format: "es", plugins: () => [createSourceWorkerEntryPlugin()] },
  optimizeDeps: rootConfig.optimizeDeps,
  publicDir: path.resolve(appDir, "public"),
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
