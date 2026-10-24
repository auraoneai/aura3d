import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Index games after moving from hand-assigned `window.__AURA3D_GAME__ = evidence` to the library beacon
 * (`installGameBeacon().publishEvidence`). Every evidence key must still be readable on the beacon, the legacy
 * evidence global must still be the evidence object, the beacon must be frozen, and the page must boot with no errors.
 * Remote only (tools/remote-acr/run.sh, RUN_ID prefix beacon, software WebGL2). Build first:
 * `vite build --outDir ../../tests/browser/beacon-dist-<slug>` from apps/showcase-<slug>.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };

function serve(dist: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent((req.url ?? "/").split("?")[0]!));
    if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

const GAMES: Array<{ slug: string; query: string; legacyEvidence: boolean; routeHasSlug?: boolean }> = [
  { slug: "heatsink", query: "?autostart=1", legacyEvidence: true },
  { slug: "roadster-rush", query: "?autostart=1", legacyEvidence: true },
  { slug: "dot-dash-3d", query: "?autostart=1", legacyEvidence: false, routeHasSlug: false },
  { slug: "aura-hoops-3d", query: "?autostart=1", legacyEvidence: true }
];

test.setTimeout(420_000);

for (const game of GAMES) {
  test(`${game.slug}: library beacon carries the evidence`, async ({ page }) => {
    const dist = path.resolve(`tests/browser/beacon-dist-${game.slug}`);
    const { origin, close } = await serve(dist);
    const navs: string[] = [];
    const errors: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(origin, "")); });
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${origin}/${game.query}`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(({ slug, needSlug }) => {
      const b = (window as unknown as { __AURA3D_GAME__?: { route?: string } }).__AURA3D_GAME__;
      return b !== undefined && typeof b.route === "string" && (!needSlug || b.route.includes(slug));
    }, { slug: game.slug, needSlug: game.routeHasSlug !== false }, { timeout: 300_000 });
    await page.waitForTimeout(8_000);
    const snap = await page.evaluate((legacyEvidence) => {
      const w = window as unknown as Record<string, any>;
      const beacon = w.__AURA3D_GAME__ as Record<string, unknown>;
      const evidence = w.__AURA3D_GAME_EVIDENCE__ as Record<string, unknown> | undefined;
      const missing: string[] = [];
      if (legacyEvidence && evidence) for (const k of Object.keys(evidence)) if (!(k in beacon)) missing.push(k);
      let serializable = true;
      try { JSON.stringify(beacon); } catch { serializable = false; }
      return {
        route: beacon.route,
        state: beacon.state,
        keys: Object.keys(beacon).length,
        frozen: Object.isFrozen(beacon),
        legacyPresent: legacyEvidence ? evidence !== undefined : true,
        missing,
        serializable,
        rung: (w.__AURA3D_HEAL__ as { rung?: number } | undefined)?.rung ?? 0
      };
    }, game.legacyEvidence);
    process.stdout.write(`@@BEACON ${game.slug} ${JSON.stringify({ navs, errors, ...snap })}\n`);
    await close();
    expect(snap.serializable, "beacon JSON.stringify works").toBe(true);
    expect(snap.frozen, "beacon frozen").toBe(true);
    expect(snap.legacyPresent, "legacy evidence global present").toBe(true);
    expect(snap.missing, "every evidence key readable on the beacon").toEqual([]);
    expect(navs, "guard never navigated").toHaveLength(1);
    expect(snap.rung).toBe(0);
    expect(errors).toEqual([]);
  });
}
