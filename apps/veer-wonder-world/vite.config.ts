// Wonder World Vite config (PRD 04 A03).
//
// Extends the repo root config the way apps/showcase-pips-big-leap/vite.config.ts
// does: the root plugins and aliases (inside the monorepo `@aura3d/*` resolves
// to the workspace sources under packages/*/src) plus this app's own settings:
//
// - `base: "./"`: the built JS, CSS and asset URLs are relative.
// - Output in dist/ (`vite build apps/veer-wonder-world` from the repo root, as
//   tests/browser/wonder-world-build.spec.ts runs it, or `vite build` here).
// - Module-relative assets: src/aura-assets.ts and src/audio-manifest.generated.ts
//   name every GLB and MP3 as `new URL("./assets/...", import.meta.url).pathname`.
//   Vite emits each one under dist/assets/ with a content hash. Inlining is off
//   (`assetsInlineLimit: 0`): a short sound effect would otherwise become a
//   data: URL, whose `.pathname` is not a fetchable path.
// - Shared files from the repo's root public/ tree: the licensed fonts
//   (`/fonts/local.css`, Graphik Web 400, 500 and 600) and the look HDRIs
//   (`/hdri/<file>.hdr`, CC0). `vite` and `vite preview` serve them at the origin
//   root, as the repo dev server does; the build copies only these files into
//   dist/ (never the whole shared tree, which is also why the shared tree is not
//   the public dir: its own index.html would shadow this app's). The engine
//   requests the HDRIs at the absolute path /hdri/ and local.css names its fonts
//   under /fonts/, so dist/ must be served at an origin root (DEPLOYMENT.md).
// - No source maps in the build.

import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import rootConfig from "../../vite.config";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const sharedPublicDir = path.join(repoRoot, "public");

const baseAlias = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

/**
 * The HDRIs the six world looks load from /hdri/. Keep in step with
 * LOOK_HDRI_FILES in src/scenes/looks.ts (tests/unit/app/app-flow.test.ts
 * checks that every one of them is listed here).
 */
export const SHARED_HDRI_FILES = ["autumn_field_puresky_1k.hdr", "studio_small_08_1k.hdr"] as const;

/** The shared stylesheet that declares the licensed fonts (index.html links it). */
const FONT_STYLESHEET = "fonts/local.css";

/** Folders of the shared root public/ tree served at the origin root (dev and preview). */
const SHARED_DIRS = ["fonts", "hdri"].map((dir) => path.join(sharedPublicDir, dir) + path.sep);

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
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
    required: [FONT_STYLESHEET, ...SHARED_HDRI_FILES.map((file) => `hdri/${file}`)],
    // A face the stylesheet declares but this app never draws with (the mono face) is copied when present.
    optional: [...new Set(fonts), "hdri/ATTRIBUTION.md"]
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
  // Resolved first, then checked: "/fonts/../index.html" resolves outside fonts/ and is not served.
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
    // Keep `<link href="/fonts/local.css">` as written (it is copied to dist/fonts/ below)
    // instead of letting the HTML step try to bundle a file outside this app.
    order: "pre",
    handler: (html) => html.replace(/(<link\b[^>]*\bhref=["']\/fonts\/local\.css["'][^>]*?)(\s*\/?>)/, "$1 vite-ignore$2")
  },
  generateBundle() {
    const { required, optional } = sharedBuildFiles();
    for (const rel of [...required, ...optional]) {
      const file = path.join(sharedPublicDir, rel);
      if (!fs.existsSync(file)) {
        if (required.includes(rel)) this.error(`shared public file missing: public/${rel}`);
        this.warn(`shared public file missing, not copied: public/${rel}`);
        continue;
      }
      this.emitFile({ type: "asset", fileName: rel, source: fs.readFileSync(file) });
    }
  }
};

export default defineConfig({
  root: appDir,
  base: "./",
  plugins: [...(rootConfig.plugins ?? []), serveSharedPublicFiles, copySharedPublicFiles],
  resolve: { ...rootConfig.resolve, alias: baseAlias },
  optimizeDeps: { ...rootConfig.optimizeDeps, entries: ["index.html"] },
  // The app has no public dir of its own; the shared files above are served and copied explicitly.
  publicDir: false,
  server: { host: "127.0.0.1", port: 5191, strictPort: false, fs: { allow: [repoRoot] } },
  preview: { host: "127.0.0.1", port: 4191, strictPort: false },
  build: {
    target: "es2022",
    outDir: path.resolve(appDir, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    // The engine is one large chunk by design; the build spec records the bundle sizes instead.
    chunkSizeWarningLimit: 4096,
    rollupOptions: { input: path.resolve(appDir, "index.html") }
  }
});
