// tests/qr/prd14/browser/lib/serve.ts — static server over a built route dist.
// Shared by the per-route dispatch specs (T1.10) and v2 specs (T2.x).
import { createReadStream, existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// lib/ is five levels below the repo root (tests/qr/prd14/browser/lib).
export const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
export const APPS = join(ROOT, "apps");

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json", ".hdr": "application/octet-stream", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".wasm": "application/wasm",
  ".avif": "image/avif", ".ktx2": "image/ktx2", ".hdr.png": "image/png"
};

export function serve(dir: string): Promise<{ server: Server; url: string }> {
  // The lane build uses `publicDir: false`, so route-local `public/` assets
  // (template-layout apps keep their GLBs in apps/<appDir>/public/) never
  // land in the built dist and /aura-assets/*.glb would 404 in every spec.
  // After the dist lookup misses, fall back to the app's own public/ and
  // then the repo-root public/ — dist-first order keeps routes whose assets
  // already resolve from dist byte-identical. `dir` is either
  // `.build/site/apps/<appDir>` (capture layout) or `apps/<appDir>/dist`
  // (builtDist's last candidate), so a `dist` basename steps up one level.
  const distRoot = resolve(dir);
  const appDir = basename(distRoot) === "dist" ? basename(dirname(distRoot)) : basename(distRoot);
  const roots = [distRoot, join(APPS, appDir, "public"), join(ROOT, "public")];
  const server = createServer((req, res) => {
    const raw = new URL(req.url ?? "/", "http://x").pathname;
    // capture-games builds with `base: /apps/<dir>/`; serve those URLs from
    // the dist root so the built index.html resolves its assets.
    const base = `/apps/${appDir}/`;
    const path = raw.startsWith(base) ? `/${raw.slice(base.length)}` : raw;
    const rel = path === "/" ? "index.html" : path;
    const file = roots
      .map((root) => ({ root, file: join(root, rel) }))
      // Traversal guard, per root: the candidate must stay under the root
      // it resolved from.
      .find(({ root, file }) => (file === root || file.startsWith(root + sep)) && existsSync(file))?.file;
    if (file === undefined) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/** Build outputs the lane workflow produces (capture-games --local-build or vite). */
export function builtDist(appDir: string): string | undefined {
  return [
    join(ROOT, "tools", "quality-rebuild-capture", ".build", "site", "apps", appDir),
    join(ROOT, "tools", "quality-rebuild-capture", ".build", appDir),
    join(APPS, appDir, "dist")
  ].find((d) => existsSync(join(d, "index.html")));
}

/**
 * §18: the Firefox matrix job holds each S1 state open for a 60 s timeline
 * (`A3D_DISPATCH_SOAK_MS`) so "0 console/page errors over 60 s" is actually
 * measured, not just sampled at boot. Default 0 keeps chromium runs fast.
 */
export async function soakIfNeeded(page: { waitForTimeout: (ms: number) => Promise<void> }): Promise<void> {
  const ms = Number(process.env.A3D_DISPATCH_SOAK_MS ?? 0);
  if (ms > 0) await page.waitForTimeout(ms);
}

/** Console errors + page errors collected during a page run. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const url = msg.location().url;
      errors.push(url ? `${msg.text()} (${url})` : msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}
