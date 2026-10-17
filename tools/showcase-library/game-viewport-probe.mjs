#!/usr/bin/env node
/*
 * Viewport / resize probe for one game route.
 *
 * A mobile screenshot that looks letterboxed can have two completely different
 * causes: the route genuinely ignores resize (a real defect the player hits when
 * rotating a phone), or only the harness hits it because it resizes an already
 * booted page. Loading fresh at the target size and resizing an already-running
 * page separate those two, and comparing the canvas backing buffer against its
 * CSS box shows whether the renderer is resizing at all.
 *
 *   node tools/showcase-library/game-viewport-probe.mjs --route showcase-courier-rush
 *   ... --mobile 390x844 --desktop 1280x720
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { readGameChannel } from "./game-channel.mjs";
import { readPngLuminanceAndTruncationMetrics } from "./png-foreground.mjs";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const strictAssert = args.includes("--assert");

const route = arg("--route", "showcase-courier-rush");
const base = arg("--base", "http://localhost:5199");
const [mw, mh] = arg("--mobile", "390x844").split("x").map(Number);
const [dw, dh] = arg("--desktop", "1280x720").split("x").map(Number);
const outDir = resolve(repoRoot, arg("--out", `tests/reports/game-viewport-probe/${route}`));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle"],
});

async function measure(page) {
  const channel = await readGameChannel(page);
  const base = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c?.getBoundingClientRect();
    const de = document.documentElement;
    const fillsWidth = Boolean(r && r.width >= innerWidth * 0.98);
    const fillsHeight = Boolean(r && r.height >= innerHeight * 0.98);
    return {
      buffer: c ? `${c.width}x${c.height}` : null,
      css: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
      viewport: `${innerWidth}x${innerHeight}`,
      canvasFillsViewport: fillsWidth && fillsHeight,
      // Horizontal body overflow is the signature of a canvas that kept its
      // desktop width after the window shrank.
      overflowX: de.scrollWidth - innerWidth,
      overflowY: de.scrollHeight - innerHeight,
      dpr: devicePixelRatio,
    };
  }).catch((e) => ({ error: String(e).slice(0, 160) }));
  return { ...base, game: { beacon: channel.beacon, migrated: channel.migrated } };
}

async function run(label, { start, end }) {
  const context = await browser.newContext({ viewport: start, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.goto(`${base}/apps/${route}/`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(6500);
  const atStart = await measure(page);
  let afterResize = null;
  if (end) {
    await page.setViewportSize(end);
    await page.waitForTimeout(2500);
    afterResize = await measure(page);
  }
  const shotFile = `${label}.png`;
  const shotPath = resolve(outDir, shotFile);
  await page.screenshot({ path: shotPath });
  const lumaMetrics = readPngLuminanceAndTruncationMetrics(shotPath);
  await context.close();
  return { label, atStart, afterResize, lumaMetrics, errors: errors.slice(0, 6), shot: shotFile };
}

const results = [
  await run("fresh-mobile", { start: { width: mw, height: mh } }),
  await run("desktop-then-resize", { start: { width: dw, height: dh }, end: { width: mw, height: mh } }),
  await run("fresh-desktop", { start: { width: dw, height: dh } }),
];

let failed = false;
for (const r of results) {
  const bad = (m) => m && (
    !m.canvasFillsViewport ||
    m.overflowX > 2 ||
    m.overflowY > 2 ||
    (m.buffer && m.css && m.buffer.split("x")[0] !== m.css.split("x")[0])
  );
  const luma = r.lumaMetrics;
  console.log(
    `${r.label.padEnd(22)} buffer=${r.atStart.buffer} css=${r.atStart.css} fills=${r.atStart.canvasFillsViewport} ovf=${r.atStart.overflowX},${r.atStart.overflowY} ` +
    `luma=${luma.meanLuminance}±${luma.luminanceStdDev} white=${luma.nearWhiteRatio} btmBlk=${luma.bottomBandBlackRatio}` +
    (r.afterResize ? ` -> afterResize buffer=${r.afterResize.buffer} css=${r.afterResize.css} fills=${r.afterResize.canvasFillsViewport}` : "")
  );
  if (r.errors.length) console.log(`   errors: ${JSON.stringify(r.errors)}`);
  const suspectViewport = bad(r.atStart) || (r.afterResize && bad(r.afterResize));
  if (suspectViewport) {
    console.log(`   !! canvas box does not fill or track viewport`);
    failed = true;
  }
  if (!luma.notWashedOut) {
    console.log(`   !! washed-out luminance check failed (mean=${luma.meanLuminance}, stdDev=${luma.luminanceStdDev}, nearWhite=${luma.nearWhiteRatio})`);
    failed = true;
  }
  if (!luma.noBlackTruncation) {
    console.log(`   !! black truncation check failed (bottomBandBlack=${luma.bottomBandBlackRatio}, leftBandBlack=${luma.leftBandBlackRatio})`);
    failed = true;
  }
}
await browser.close();
console.log(`shots -> ${outDir}`);
if (strictAssert && failed) {
  process.exitCode = 1;
}

