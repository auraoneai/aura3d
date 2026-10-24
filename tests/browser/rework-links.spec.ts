import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Aura Links 3D golfer rework: address posture frames, a full swing with frames at each phase, and the swept
 * club-head contact evidence. Remote only (tools/remote-acr/run.sh, RUN_ID prefix rwlnk, software WebGL2).
 * Build first: `vite build --outDir ../../tests/browser/rework-dist-links` from apps/showcase-aura-links-3d, then
 * keep only the assets the game uses in dist/aura-assets.
 */
const DIST = path.resolve("tests/browser/rework-dist-links");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };

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

type Evidence = { phase?: string; swing?: { drivePhase?: string; impactFired?: boolean; impactDistance?: number; clubAttached?: boolean; contact?: { fallback: boolean; speed: number; pathYawDeg: number; offsetM: number; u: number } | null } };
const evidence = (page: Page) => page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_AURA_LINKS_3D__?: unknown }).__AURA3D_SHOWCASE_AURA_LINKS_3D__ as unknown) as Promise<Evidence | undefined>;

async function frame(page: Page, name: string) {
  const buf = await page.screenshot({ type: "jpeg", quality: 70 });
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@LNKFRAME ${name} ${i + 1}/${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
}

async function waitDrive(page: Page, drivePhases: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const e = await evidence(page);
    if (e?.swing?.drivePhase && drivePhases.includes(e.swing.drivePhase)) return e;
    await page.waitForTimeout(40);
  }
  throw new Error(`timeout waiting for drive phase ${drivePhases.join("|")}`);
}

test.setTimeout(900_000);

test("aura links: golfer address posture, swing frames and swept club contact", async ({ page }) => {
  const { origin, close } = await serve();
  const errors: string[] = [];
  const warns: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200));
    if (m.type() === "warning" && /club bone attach/.test(m.text())) warns.push(m.text().slice(0, 200));
  });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${origin}/?course=links`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_SHOWCASE_AURA_LINKS_3D__?: { phase?: string } }).__AURA3D_SHOWCASE_AURA_LINKS_3D__?.phase === "address", undefined, { timeout: 300_000 });
  await page.waitForTimeout(6_000);
  await frame(page, "01-address");

  await page.keyboard.press("Space");
  await waitDrive(page, ["backswing"], 120_000);
  // power then accuracy clicks: the swing commits and releases from the top on its own clock
  setTimeout(() => void page.keyboard.press("Space"), 1_500);
  setTimeout(() => void page.keyboard.press("Space"), 3_000);
  const seen = new Set<string>();
  let impactEv: Evidence | undefined;
  const deadline = Date.now() + 480_000;
  let n = 2;
  while (Date.now() < deadline) {
    const e = await evidence(page);
    const dp = e?.swing?.drivePhase ?? "idle";
    if (dp !== "idle" && !seen.has(dp)) {
      seen.add(dp);
      await frame(page, `${String(n++).padStart(2, "0")}-${dp}`);
    }
    if (e?.swing?.impactFired && !impactEv) {
      impactEv = e;
      await frame(page, `${String(n++).padStart(2, "0")}-impact`);
    }
    if (impactEv && dp === "idle") break;
    await page.waitForTimeout(30);
  }
  const final = await evidence(page);
  process.stdout.write(`@@LNKRESULT ${JSON.stringify({ errors, warns, impactFired: impactEv?.swing?.impactFired, contact: final?.swing?.contact, clubAttached: final?.swing?.clubAttached, impactDistance: final?.swing?.impactDistance })}\n`);
  await close();
  expect(errors).toEqual([]);
  expect(impactEv?.swing?.impactFired, "the shot fired").toBe(true);
  expect(final?.swing?.contact, "contact telemetry present").toBeTruthy();
  expect(final?.swing?.contact?.fallback, "struck by the swept path, not the timer fallback").toBe(false);
});
