import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Cross Hop after dropping its local __AURA3D_GAME__ sanitizer: the library beacon must serialize, the black-frame guard
 * must never reload a healthy game, and the page must boot with no console errors. Remote only (tools/remote-acr/run.sh,
 * RUN_ID prefix leftovers, software WebGL2). Build first: `vite build --outDir tests/browser/leftovers-dist-crosshop`
 * from apps/showcase-cross-hop.
 */
const DIST = path.resolve("tests/browser/leftovers-dist-crosshop");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };

function serve(): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let file = path.join(DIST, decodeURIComponent((req.url ?? "/").split("?")[0]!));
    if (!file.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }
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

test.setTimeout(420_000);

test("cross hop: library beacon serializes, guard never reloads, no console errors", async ({ page }) => {
  const { origin, close } = await serve();
  const navs: string[] = [];
  const errors: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(origin, "")); });
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${origin}/?autostart=1`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_GAME__?: { state?: string } }).__AURA3D_GAME__?.state === "playing", undefined, { timeout: 240_000 });
  await page.waitForTimeout(60_000);
  const snap = await page.evaluate(() => {
    const w = window as unknown as { __AURA3D_GAME__?: Record<string, unknown>; __AURA3D_HEAL__?: { rung: number } };
    let json = "";
    let error = "";
    try { json = JSON.stringify(w.__AURA3D_GAME__); } catch (e) { error = String(e); }
    const beacon = w.__AURA3D_GAME__ as { app?: unknown; scene?: unknown } | undefined;
    return { json, error, keys: Object.keys(w.__AURA3D_GAME__ ?? {}), hasApp: Boolean(beacon?.app), hasScene: Boolean(beacon?.scene), rung: w.__AURA3D_HEAL__?.rung, url: location.pathname + location.search };
  });
  process.stdout.write(`@@LEFTOVERS crosshop ${JSON.stringify({ navs, errors, ...snap, json: snap.json.slice(0, 200) })}\n`);
  await close();
  expect(snap.error, "beacon JSON.stringify works").toBe("");
  expect(snap.keys.sort()).toEqual(["firstFrameAt", "frame", "route", "sessionStartedAt", "state"]);
  expect(snap.hasApp, "live app still reachable on the beacon").toBe(true);
  expect(navs, "guard never navigated").toHaveLength(1);
  expect(snap.rung ?? 0).toBe(0);
  expect(errors).toEqual([]);
});
