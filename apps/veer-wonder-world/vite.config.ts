// Wonder World Vite config (PRD 04 A03; upgraded for @aura3d/engine 5.5.1).
//
// Extends the repo root config the way apps/showcase-pips-big-leap/vite.config.ts
// does: the root plugins and aliases (inside the monorepo `@aura3d/*` resolves
// to the workspace sources under packages/*/src) plus this app's own settings:
//
// - `base: "./"`: the built JS, CSS and asset URLs are relative.
// - Build-time physics stripping (`auraPhysicsPlugin({ physics: "auto" })`):
//   Wonder World uses 0 Rapier physics bodies, stripping the 2.85 MB Rapier WASM chunk.
// - Same-origin Basis/Draco/Meshopt decoder deployment under `/aura-decoders/`
//   (`dist/aura-decoders/`) for KTX2 & meshopt GLB assets.
// - Shared files from the repo's root public/ tree: the licensed fonts
//   (`/fonts/local.css`, Whitney, Graphik Web, DIN Pro, Monument Grotesk Mono)
//   and the six world look HDRIs (`/hdri/<file>.hdr`, CC0).
// - No source maps in the build.

import fs from "node:fs";
import fsp from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithEsbuild } from "vite";
import type { Connect, Plugin } from "vite";
import { auraDecodersVendorRoot } from "../../packages/assets/src/vite/auraDecoders";
import { auraPhysicsPlugin } from "../../packages/assets/src/vite/auraPhysics";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const sharedPublicDir = path.join(repoRoot, "public");
const decodersVendorDir = auraDecodersVendorRoot();
const ktx2WorkerJs = path.join(repoRoot, "packages", "assets", "dist", "workers", "ktx2.worker.js");
const ktx2WorkerTs = path.join(repoRoot, "packages", "assets", "src", "workers", "ktx2.worker.ts");

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

/**
 * The HDRIs the six world looks load from /hdri/. Keep in step with
 * LOOK_HDRI_FILES in src/scenes/looks.ts (tests/unit/app/app-flow.test.ts
 * checks that every one of them is listed here).
 */
export const SHARED_HDRI_FILES = [
  "autumn_field_puresky_1k.hdr",
  "outdoor-midday_1k.hdr",
  "spruit_sunrise_1k.hdr",
  "kloppenheim_06_puresky_1k.hdr",
  "kloppenheim_02_1k.hdr",
  "warm_bar_1k.hdr"
] as const;

/** Licensed self-hosted font files copied from the repo's shared public/fonts/ tree. */
export const SHARED_FONT_FILES = [
  "fonts/whitney-regular.woff2",
  "fonts/whitney-regular-italic.woff2",
  "fonts/whitney-medium.woff2",
  "fonts/whitney-semibold.woff2",
  "fonts/dinpro-regular.woff2",
  "fonts/dinpro-medium.woff2",
  "fonts/monument-mono.woff2",
  "fonts/graphik/Graphik-Regular-Web.woff2",
  "fonts/graphik/Graphik-RegularItalic-Web.woff2",
  "fonts/graphik/Graphik-Medium-Web.woff2",
  "fonts/graphik/Graphik-Semibold-Web.woff2"
] as const;

/** The shared stylesheet that declares the base showcase fonts (index.html links it). */
const FONT_STYLESHEET = "fonts/local.css";

/** Folders of the shared root public/ tree served at the origin root (dev and preview). */
const SHARED_DIRS = ["fonts", "hdri"].map((dir) => path.join(sharedPublicDir, dir) + path.sep);
const DECODER_CODECS = ["basis", "draco", "meshopt"] as const;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".hdr": "application/octet-stream",
  ".md": "text/markdown; charset=utf-8"
};

/** Shared files the build copies into dist/, relative to the root public/ tree. */
function sharedBuildFiles(): { readonly required: string[]; readonly optional: string[] } {
  const css = fs.readFileSync(path.join(sharedPublicDir, FONT_STYLESHEET), "utf8");
  const fonts = [...css.matchAll(/url\(\s*["']?\/(fonts\/[^"')?#]+)/g)]
    .map((match) => match[1])
    .filter((file): file is string => typeof file === "string");
  return {
    required: [
      FONT_STYLESHEET,
      ...SHARED_FONT_FILES,
      ...SHARED_HDRI_FILES.map((file) => `hdri/${file}`)
    ],
    optional: [...new Set(fonts), "hdri/studio_small_08_1k.hdr", "hdri/ATTRIBUTION.md"]
  };
}

/** Serves /fonts/* and /hdri/* from the shared root public/ tree (dev and preview). */
function serveSharedFile(req: Connect.IncomingMessage, res: ServerResponse, next: () => void): void {
  let urlPath: string;
  try {
    urlPath = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
  } catch {
    next();
    return;
  }
  if (urlPath.startsWith("/aura-decoders/")) {
    const rel = urlPath.slice("/aura-decoders/".length);
    const distCandidate = path.resolve(appDir, "dist", "aura-decoders", rel);
    const vendorCandidate = path.resolve(decodersVendorDir, rel);
    const file =
      distCandidate.startsWith(path.resolve(appDir, "dist", "aura-decoders") + path.sep) && fs.existsSync(distCandidate) && fs.statSync(distCandidate).isFile()
        ? distCandidate
        : vendorCandidate.startsWith(decodersVendorDir + path.sep) && fs.existsSync(vendorCandidate) && fs.statSync(vendorCandidate).isFile()
          ? vendorCandidate
          : null;
    if (file) {
      res.setHeader("content-type", CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
      res.setHeader("content-length", String(fs.statSync(file).size));
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (rel === "basis/ktx2.worker.js" && fs.existsSync(ktx2WorkerJs)) {
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      res.setHeader("content-length", String(fs.statSync(ktx2WorkerJs).size));
      fs.createReadStream(ktx2WorkerJs).pipe(res);
      return;
    }
  }
  const file = path.resolve(sharedPublicDir, `.${urlPath}`);
  if (!SHARED_DIRS.some((dir) => file.startsWith(dir)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    next();
    return;
  }
  res.setHeader("content-type", CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("content-length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
}

const serveSharedPublicFiles: Plugin = {
  name: "wonder-world-serve-shared-public-files",
  configureServer(server) {
    server.middlewares.use(serveSharedFile);
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveSharedFile);
  }
};

const copySharedPublicFiles: Plugin = {
  name: "wonder-world-copy-shared-public-files",
  apply: "build",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replace(/(<link\b[^>]*\bhref=["']\/fonts\/local\.css["'][^>]*?)(\s*\/?>)/, "$1 vite-ignore$2")
  },
  generateBundle() {
    const { required, optional } = sharedBuildFiles();
    const seen = new Set<string>();
    for (const rel of [...required, ...optional]) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      const file = path.join(sharedPublicDir, rel);
      if (!fs.existsSync(file)) {
        if (required.includes(rel)) this.error(`shared public file missing: public/${rel}`);
        this.warn(`shared public file missing, not copied: public/${rel}`);
        continue;
      }
      this.emitFile({ type: "asset", fileName: rel, source: fs.readFileSync(file) });
    }
  },
  async closeBundle() {
    const targetRoot = path.resolve(appDir, "dist", "aura-decoders");
    await fsp.mkdir(targetRoot, { recursive: true });
    for (const codec of DECODER_CODECS) {
      const srcDir = path.join(decodersVendorDir, codec);
      if (fs.existsSync(srcDir)) {
        await fsp.cp(srcDir, path.join(targetRoot, codec), { recursive: true });
      }
    }
    for (const [relMjs, relJs, exportName] of [
      [path.join("basis", "basis_transcoder.mjs"), path.join("basis", "basis_transcoder.js"), "BASIS"],
      [path.join("draco", "draco_decoder.mjs"), path.join("draco", "draco_decoder.js"), "DracoDecoderModule"]
    ] as const) {
      const srcJs = path.join(decodersVendorDir, relJs);
      if (fs.existsSync(srcJs)) {
        const body = fs.readFileSync(srcJs, "utf8");
        await fsp.writeFile(path.join(targetRoot, relMjs), `${body}\nexport default ${exportName};\n`);
      }
    }
    const workerDest = path.join(targetRoot, "basis", "ktx2.worker.js");
    if (fs.existsSync(ktx2WorkerJs)) {
      await fsp.copyFile(ktx2WorkerJs, workerDest);
    } else if (fs.existsSync(ktx2WorkerTs)) {
      const compiled = await transformWithEsbuild(fs.readFileSync(ktx2WorkerTs, "utf8"), ktx2WorkerTs, {
        loader: "ts",
        format: "iife",
        target: "es2020",
        sourcemap: false
      });
      await fsp.writeFile(workerDest, compiled.code);
    }
  }
};

export default defineConfig({
  root: appDir,
  base: "./",
  define: {
    "import.meta.env.AURA3D_DECODER_BASE_PATH": JSON.stringify("/aura-decoders/")
  },
  plugins: [
    ...(rootConfig.plugins ?? []),
    auraPhysicsPlugin({ physics: "auto" }),
    serveSharedPublicFiles,
    copySharedPublicFiles
  ],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: { ...rootConfig.optimizeDeps, entries: ["index.html"] },
  publicDir: false,
  server: { host: "127.0.0.1", port: 5191, strictPort: false, fs: { allow: [repoRoot] } },
  preview: { host: "127.0.0.1", port: 4191, strictPort: false },
  build: {
    target: ["safari15", "chrome100", "edge100", "firefox100"],
    outDir: path.resolve(appDir, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
