// tests/qr/prd14/unit/serve-fallbacks.test.ts — browser/lib/serve.ts
// `serve()` resolves dist-first, then apps/<appDir>/public/, then the
// repo-root public/. The lane build uses `publicDir: false`, so without
// the app-public fallback every template-layout route 404s its
// /aura-assets/*.glb in the prd14 browser specs (Blockfall lane run
// 38422405739: capture booted via its own fallbacks, specs timed out).
// Fake dists live in /tmp but are named after a real app
// (showcase-blockfall-reactor) so the app-public fallback resolves
// against the real apps/<appDir>/public/ tree.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get as httpGet, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT, serve } from "../browser/lib/serve";

const APP_DIR = "showcase-blockfall-reactor";
const SECRET = "SECRET-DO-NOT-SERVE";

interface Reply { readonly status: number; readonly contentType: string; readonly body: Buffer }

/** Raw http.get (no client-side URL normalization, no keep-alive). */
function get(url: string, path: string): Promise<Reply> {
  const { hostname, port } = new URL(url);
  return new Promise((resolvePromise, reject) => {
    const req = httpGet({ hostname, port, path, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolvePromise({
        status: res.statusCode ?? 0,
        contentType: String(res.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks)
      }));
    });
    req.on("error", reject);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((done) => server.close(() => done()));
}

describe("prd14 serve() asset fallbacks", () => {
  let tmp: string;
  const servers: Server[] = [];

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "a3d-serve-fallbacks-"));
    writeFileSync(join(tmp, "secret.txt"), SECRET);
  });

  afterAll(async () => {
    await Promise.all(servers.map(close));
    rmSync(tmp, { recursive: true, force: true });
  });

  async function serveDir(dir: string): Promise<string> {
    const { server, url } = await serve(dir);
    servers.push(server);
    return url;
  }

  it("capture layout (.build/site/apps/<appDir>): dist-first, app-public GLB, repo-public, 404, traversal blocked", async () => {
    const dist = join(tmp, "site", "apps", APP_DIR);
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "DIST-INDEX");
    writeFileSync(join(dist, "assets", "app.js"), "DIST-JS");
    // Same name as a repo-root public/ file: dist must win.
    writeFileSync(join(dist, "llms.txt"), "DIST-WINS");
    const url = await serveDir(dist);

    const index = await get(url, "/");
    expect(index.status).toBe(200);
    expect(index.body.toString("utf8")).toBe("DIST-INDEX");

    // capture-games `base: /apps/<appDir>/` URLs resolve from the dist root.
    const based = await get(url, `/apps/${APP_DIR}/assets/app.js`);
    expect(based.status).toBe(200);
    expect(based.body.toString("utf8")).toBe("DIST-JS");

    const distFirst = await get(url, "/llms.txt");
    expect(distFirst.status).toBe(200);
    expect(distFirst.body.toString("utf8")).toBe("DIST-WINS");

    // Not in dist: apps/showcase-blockfall-reactor/public/aura-assets/*.glb.
    const glb = await get(url, "/aura-assets/quaternius-cube-crate.glb");
    expect(glb.status).toBe(200);
    expect(glb.contentType).toBe("model/gltf-binary");
    expect(glb.body.subarray(0, 4).toString("ascii")).toBe("glTF");

    // Not in dist or app public: repo-root public/.
    const repoPublic = await get(url, "/aura-environments/studio.manifest.json");
    expect(repoPublic.status).toBe(200);
    expect(repoPublic.body.equals(readFileSync(join(ROOT, "public", "aura-environments", "studio.manifest.json")))).toBe(true);

    const missing = await get(url, "/aura-assets/no-such-asset.glb");
    expect(missing.status).toBe(404);

    // Traversal attempts (raw paths bypass client normalization) must
    // never reach the secret sitting outside every served root.
    for (const path of ["/aura-assets/../../secret.txt", "/%2e%2e/%2e%2e/secret.txt", "/static/%2e%2e%2fsecret.txt"]) {
      const reply = await get(url, path);
      expect(reply.status, path).toBe(404);
      expect(reply.body.toString("utf8"), path).not.toContain(SECRET);
    }
  });

  it("dist-suffix layout (apps/<appDir>/dist): appDir steps up one level for the public fallback", async () => {
    const dist = join(tmp, "apps", APP_DIR, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "DIST-SUFFIX-INDEX");
    const url = await serveDir(dist);

    const index = await get(url, "/");
    expect(index.status).toBe(200);
    expect(index.body.toString("utf8")).toBe("DIST-SUFFIX-INDEX");

    const glb = await get(url, "/aura-assets/quaternius-wall-modular.glb");
    expect(glb.status).toBe(200);
    expect(glb.contentType).toBe("model/gltf-binary");
    expect(glb.body.subarray(0, 4).toString("ascii")).toBe("glTF");

    const missing = await get(url, "/missing.txt");
    expect(missing.status).toBe(404);
  });
});
