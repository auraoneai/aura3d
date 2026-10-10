// tests/qr/prd14/browser/lib/serve.ts — static server over a built route dist.
// Shared by the per-route dispatch specs (T1.10) and v2 specs (T2.x).
import { createReadStream, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";

export const ROOT = join(__dirname, "..", "..", "..", "..");
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
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const file = join(dir, path === "/" ? "index.html" : path);
    if (!existsSync(file) || !file.startsWith(dir)) {
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
export function watchConsole(page: { on: (ev: string, fn: (m: unknown) => void) => void }): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    const msg = m as { type: () => string; text: () => string };
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (m) => errors.push(String(m)));
  return errors;
}
