#!/usr/bin/env node
/**
 * tools/filmstrip/probe-capture.mjs — one-game, three-strategy capture probe.
 * Finds which capture path returns real pixels for a WebGL game route on this
 * runner: canvas.toDataURL, clipped page.screenshot, fullPage page.screenshot,
 * plus a CDP Page.captureScreenshot. Writes probe-*.png + probe-report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
const { chromium } = requireFromRepo("playwright");

const url = process.env.PROBE_URL || "https://aura3d.auraone.ai/apps/showcase-aura-hoops-3d/?autoplay=1";
const outDir = process.env.PROBE_OUT || "/tmp/probe";
const waitMs = Number(process.env.PROBE_WAIT || 25000);
fs.mkdirSync(outDir, { recursive: true });

const pngNonBlack = (buf) => {
  const head = buf.subarray(64, 4096);
  let n = 0;
  for (let b = 0; b < head.length; b += 17) {
    if (head[b] > 26 || head[b + 1] > 26 || head[b + 2] > 26) n += 1;
  }
  return n > 3;
};

const report = { url, waitMs, strategies: {} };
const browser = await chromium.launch({ timeout: 45000 });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("canvas", { timeout: 60000 });
await page.waitForTimeout(waitMs);

// evidence sanity: is the game actually simulating?
report.evidence = await page.evaluate(() => {
  const ev = window.__AURA3D_GAME_EVIDENCE__ ?? window.__AURA3D_GAME__ ?? null;
  return ev ? { phase: ev.phase ?? null, ball: ev.ball?.position ?? null, framesRendered: ev.framesRendered ?? null } : null;
});
report.canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return null;
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  return { w: c.width, h: c.height, visible: c.offsetParent !== null, gl: !!gl };
});

// strategy 1: toDataURL
try {
  const dataUrl = await page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/png") ?? null);
  if (dataUrl) {
    const buf = Buffer.from(dataUrl.slice(22), "base64");
    fs.writeFileSync(path.join(outDir, "probe-todataurl.png"), buf);
    report.strategies.toDataURL = { bytes: buf.length, nonBlack: pngNonBlack(buf) };
  } else report.strategies.toDataURL = { error: "no canvas" };
} catch (e) { report.strategies.toDataURL = { error: String(e).slice(0, 120) }; }

// strategy 2: page.screenshot viewport
try {
  await page.screenshot({ path: path.join(outDir, "probe-viewport.png"), timeout: 60000 });
  const buf = fs.readFileSync(path.join(outDir, "probe-viewport.png"));
  report.strategies.viewportScreenshot = { bytes: buf.length, nonBlack: pngNonBlack(buf) };
} catch (e) { report.strategies.viewportScreenshot = { error: String(e).slice(0, 120) }; }

// strategy 3: fullPage screenshot
try {
  await page.screenshot({ path: path.join(outDir, "probe-fullpage.png"), fullPage: true, timeout: 60000 });
  const buf = fs.readFileSync(path.join(outDir, "probe-fullpage.png"));
  report.strategies.fullPageScreenshot = { bytes: buf.length, nonBlack: pngNonBlack(buf) };
} catch (e) { report.strategies.fullPageScreenshot = { error: String(e).slice(0, 120) }; }

// strategy 4: CDP captureScreenshot (fromSurface both ways)
for (const fromSurface of [true, false]) {
  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface });
    const buf = Buffer.from(shot.data, "base64");
    fs.writeFileSync(path.join(outDir, `probe-cdp-surface-${fromSurface}.png`), buf);
    report.strategies[`cdpSurface${fromSurface}`] = { bytes: buf.length, nonBlack: pngNonBlack(buf) };
  } catch (e) { report.strategies[`cdpSurface${fromSurface}`] = { error: String(e).slice(0, 120) }; }
}

// strategy 5: force a paint (scroll + resize) then viewport shot
try {
  await page.evaluate(() => { window.scrollBy(0, 40); window.scrollBy(0, -40); });
  await page.setViewportSize({ width: 1440, height: 999 });
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "probe-forcedpaint.png"), timeout: 60000 });
  const buf = fs.readFileSync(path.join(outDir, "probe-forcedpaint.png"));
  report.strategies.forcedPaintScreenshot = { bytes: buf.length, nonBlack: pngNonBlack(buf) };
} catch (e) { report.strategies.forcedPaintScreenshot = { error: String(e).slice(0, 120) }; }

report.errors = errors;
fs.writeFileSync(path.join(outDir, "probe-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
