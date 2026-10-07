#!/usr/bin/env node
/*
 * Static server for the PRD-09 capture-divergence spec. Serves the vite build
 * tree produced by `capture-games.mjs --build-only` plus the same public/
 * fallbacks that capture-games uses. Mirrors startStaticServer() in
 * tools/quality-rebuild-capture/capture-games.mjs — keep in sync.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json", ".wasm": "application/wasm",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2",
  ".hdr": "application/octet-stream", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon"
};

export function startBuiltSiteServer(buildRoot = process.env.QRC_BUILD_DIR ?? path.join(repoRoot, "tools/quality-rebuild-capture/.build")) {
  const siteRoot = path.join(buildRoot, "site");
  const fallbackRoots = [
    path.join(repoRoot, "public"),
    path.join(repoRoot, "apps", "aura-clash-showcase", "public"),
    path.join(repoRoot, "marketing", "public")
  ];
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) return null;
    try {
      const st = statSync(full);
      if (st.isFile()) return full;
      if (st.isDirectory() && existsSync(path.join(full, "index.html"))) return path.join(full, "index.html");
    } catch { /* missing */ }
    return null;
  };
  const server = createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname.includes("\0")) { res.writeHead(400).end(); return; }
    const appPrefix = /^\/apps\/[^/]+(\/.*)$/.exec(pathname)?.[1];
    const candidates = [tryFile(siteRoot, pathname)];
    for (const root of fallbackRoots) {
      candidates.push(tryFile(root, pathname));
      if (appPrefix) candidates.push(tryFile(root, appPrefix));
    }
    const file = candidates.find(Boolean);
    if (!file) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
      "cross-origin-resource-policy": "same-origin"
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}
