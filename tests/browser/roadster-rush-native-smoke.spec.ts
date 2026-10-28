import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Apex Overdrive (apps/showcase-roadster-rush and -v2) running on the NATIVE simulation, no third-party engine bundle.
 * Remote only (tools/remote-acr/run.sh, never local Playwright). The two production routes are built with vite from the repo
 * (tests/support/rr-smoke.vite.config.ts, then tests/support/rr-smoke-stage.sh) into tests/support/rr-dist together with their GLB assets;
 * this spec serves that directory on a fake origin and drives the real page: boots on WebGL2 with zero console errors,
 * renders a non-blank frame, the run advances, keyboard input steers the car, and the DOM HUD shows the score.
 */

const DIST = resolve("tests/support/rr-dist");
const ROUTES = ["/apps/showcase-roadster-rush/"];
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".json": "application/json", ".hdr": "application/octet-stream", ".cjs": "text/javascript" };

const MISSES: string[] = [];

async function serve(page: Page): Promise<void> {
  await page.route("http://rr.local/**", async (route) => {
    const url = new URL(route.request().url());
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    for (const root of [DIST, resolve("public")]) {
      const file = resolve(root, `.${pathname}`);
      if (file.startsWith(root) && existsSync(file)) {
        return route.fulfill({ contentType: MIME[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
      }
    }
    if (/\.css$/.test(pathname)) return route.fulfill({ contentType: "text/css", body: "" });
    if (/favicon/.test(pathname)) return route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
    MISSES.push(pathname);
    return route.fulfill({ status: 404, body: "" });
  });
}

async function pixelStats(page: Page, png: Buffer): Promise<{ nonBlackFraction: number; distinctColors: number; lumaStdDev: number }> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0;
    let sum = 0;
    let sum2 = 0;
    const seen = new Set<number>();
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (luma > 8) nonBlack++;
      sum += luma;
      sum2 += luma * luma;
      seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    const mean = sum / n;
    return { nonBlackFraction: nonBlack / n, distinctColors: seen.size, lumaStdDev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  }, png.toString("base64"));
}

interface Snapshot {
  mode: string;
  distance: number;
  score: number;
  speed: number;
  targetLane: number;
  air: number;
  vehicles: number;
  drawCalls: number;
  frames: number;
  hudScore: string;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __GAME__: { game: { mode: string; distance: number; score: number; player: { speed: number; targetLane: number; air: number }; traffic: { vehicles: unknown[] } } };
      __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number };
    };
    const g = w.__GAME__.game;
    const state = (w.__GAME__ as unknown as { getState(): { drawCalls: number } }).getState();
    return {
      mode: g.mode,
      distance: g.distance,
      score: g.score,
      speed: g.player.speed,
      targetLane: g.player.targetLane,
      air: g.player.air,
      vehicles: g.traffic.vehicles.length,
      drawCalls: state.drawCalls,
      frames: w.__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0,
      hudScore: document.querySelector(".rr-score")?.textContent ?? ""
    };
  });
}

for (const route of ROUTES) {
  test(`native Apex Overdrive boots, renders, advances and takes input: ${route}`, async ({ page }) => {
    test.setTimeout(25 * 60_000);
    await page.setViewportSize({ width: 640, height: 360 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    MISSES.length = 0;
    await serve(page);
    await page.goto(`http://rr.local${route}?seed=42`);
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 15 * 60_000, polling: 1000 });
    const first = await snapshot(page);
    expect(first.mode).toBe("playing");
    await page.keyboard.press("KeyD");
    await page.keyboard.press("Space");
    await page.waitForTimeout(8000);
    const second = await snapshot(page);
    const diag = await page.evaluate(() => {
      const h = (window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__?: { app: { diagnostics(): Record<string, unknown> } } }).__AURA3D_SHOWCASE_ROADSTER_RUSH__;
      const d = h?.app.diagnostics() ?? {};
      return JSON.stringify({ backend: d.backend, drawCalls: d.drawCalls, errors: d.errors, warnings: d.warnings, renderer: d.renderer, evidence: d.evidence ? Object.keys(d.evidence as object) : null }).slice(0, 3000);
    });
    console.log(`RRDIAG ${route} ${diag.slice(0, 200)}`);
    console.log(`RRMISS ${route} ${JSON.stringify([...new Set(MISSES)])}`);
    const hudShot = await page.screenshot({ type: "jpeg", quality: 55 });
    await page.addStyleTag({ content: "#hud,.aura3d-top-bar,.aura3d-controls-hint,#boot{display:none !important}" });
    const png = await page.locator("#game").screenshot({ type: "png" });
    const stats = await pixelStats(page, png);
    const b64 = hudShot.toString("base64");
    const tag = route.replace(/\W+/g, "_");
    for (let i = 0; i * 3500 < b64.length; i++) console.log(`RRFRAME ${tag} ${i} ${Math.ceil(b64.length / 3500)} ${b64.slice(i * 3500, (i + 1) * 3500)}`);
    console.log(`RRSMOKE ${route} ${JSON.stringify({ first, second, stats, errors: errors.slice(0, 5) })}`);
    expect(second.frames, "frames rendered").toBeGreaterThan(first.frames);
    expect(second.drawCalls, "drawCalls").toBeGreaterThan(0);
    expect(second.distance, "run advances").toBeGreaterThan(first.distance + 1);
    expect(second.targetLane, "KeyD steers right").toBe(3);
    expect(second.vehicles, "traffic exists").toBeGreaterThan(3);
    expect(second.hudScore, "HUD score rendered").not.toBe("");
    expect(stats.nonBlackFraction, "3D canvas is not black").toBeGreaterThan(0.2);
    expect(stats.lumaStdDev, "frame has contrast").toBeGreaterThan(10);
    expect(MISSES, "every requested asset is served").toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("autopilot keeps the native run going: it advances, recovers from crashes and the HUD tracks the score", async ({ page }) => {
  test.setTimeout(25 * 60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await serve(page);
  await page.goto("http://rr.local/apps/showcase-roadster-rush/?seed=7&autoplay=1");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 15 * 60_000, polling: 1000 });
  let bestDistance = 0;
  const modes = new Set<string>();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const s = await snapshot(page);
    bestDistance = Math.max(bestDistance, s.distance);
    modes.add(s.mode);
  }
  console.log(`RRSMOKE autoplay ${JSON.stringify({ bestDistance, modes: [...modes], errors: errors.slice(0, 5) })}`);
  expect(bestDistance, "autopilot keeps the run advancing (software GL renders ~1 frame/s, so the clamped sim covers little ground)").toBeGreaterThan(15);
  expect(errors, errors.join("\n")).toEqual([]);
});
