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
import { readPngDifferenceMetrics, readPngLuminanceAndTruncationMetrics } from "./png-foreground.mjs";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const strictAssert = args.includes("--assert");
const runFilmstrip = !args.includes("--no-filmstrip");

const route = arg("--route", "showcase-courier-rush");
const base = arg("--base", "http://localhost:5199");
const [mw, mh] = arg("--mobile", "390x844").split("x").map(Number);
const [dw, dh] = arg("--desktop", "1280x720").split("x").map(Number);
const outDir = resolve(repoRoot, arg("--out", `tests/reports/game-viewport-probe/${route}`));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
});

async function measure(page) {
  const channel = await readGameChannel(page);
  const baseMetrics = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c?.getBoundingClientRect();
    const de = document.documentElement;
    const fillsWidth = Boolean(r && r.width >= innerWidth * 0.98);
    const fillsHeight = Boolean(r && r.height >= innerHeight * 0.98);
    const w = window;
    let autopilot = false;
    for (const k of Object.keys(w)) {
      if (k.startsWith("__AURA3D_SHOWCASE_") && w[k] && typeof w[k] === "object") {
        const s = w[k].state ?? w[k];
        if (typeof s.autopilot === "boolean") autopilot = s.autopilot;
        else if (typeof s.autoDemo === "boolean") autopilot = s.autoDemo;
        else if (typeof s.autoPlay === "boolean") autopilot = s.autoPlay;
        else if (typeof s.mode === "string" && s.mode === "L5") autopilot = true;
      }
    }
    return {
      ready: document.body?.dataset?.aura3dReady === "true",
      autopilot,
      buffer: c ? `${c.width}x${c.height}` : null,
      css: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
      viewport: `${innerWidth}x${innerHeight}`,
      canvasFillsViewport: fillsWidth && fillsHeight,
      overflowX: de.scrollWidth - innerWidth,
      overflowY: de.scrollHeight - innerHeight,
      dpr: devicePixelRatio,
    };
  }).catch((e) => ({ error: String(e).slice(0, 160) }));
  return { ...baseMetrics, game: { beacon: channel.beacon, migrated: channel.migrated } };
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

async function captureFilmstrip(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
        attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
      }
      return origGetContext.call(this, type, attrs);
    };
  });

  await page.goto(`${base}/apps/${route}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const loadingState = await measure(page);
  const shot0 = resolve(outDir, "0_loading.png");
  await page.screenshot({ path: shot0 });

  await page.waitForFunction(() => document.body?.dataset?.aura3dReady === "true", null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(350);
  const readyState = await measure(page);
  const shot1 = resolve(outDir, "1_ready.png");
  await page.screenshot({ path: shot1 });

  // Wait 600ms with zero input to verify autoplay is off by default
  await page.waitForTimeout(600);
  const idleCheckState = await measure(page);

  // Simulate movement keys for ~1s -> capture 2_move_1s.png
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1000);
  const shot2 = resolve(outDir, "2_move_1s.png");
  await page.screenshot({ path: shot2 });

  // Continue movement with direction change / stride for ~2s more -> capture 3_move_3s.png
  await page.keyboard.up("KeyD");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("KeyA");
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForTimeout(2000);
  const shot3 = resolve(outDir, "3_move_3s.png");
  await page.screenshot({ path: shot3 });

  // Trigger primary action keys up to ~6s -> capture 4_action_6s.png
  await page.keyboard.up("KeyA");
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(2800);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ArrowUp");
  const shot4 = resolve(outDir, "4_action_6s.png");
  await page.screenshot({ path: shot4 });

  const characterCrop = {
    x: Math.round(viewport.width * 0.15),
    y: Math.round(viewport.height * 0.16),
    width: Math.round(viewport.width * 0.70),
    height: Math.round(viewport.height * 0.70),
  };
  const moveDiff = readPngDifferenceMetrics(shot2, shot3, characterCrop, 10);
  const actionDiff = readPngDifferenceMetrics(shot3, shot4, characterCrop, 10);
  const luma1 = readPngLuminanceAndTruncationMetrics(shot1);
  const luma2 = readPngLuminanceAndTruncationMetrics(shot2);
  const luma3 = readPngLuminanceAndTruncationMetrics(shot3);
  const luma4 = readPngLuminanceAndTruncationMetrics(shot4);

  await context.close();
  return {
    loadingState,
    readyState,
    idleCheckState,
    autoplayOffByDefault: !readyState.autopilot && !idleCheckState.autopilot,
    characterMotionPixelsMove: moveDiff.nonBlankPixels,
    characterMotionPixelsAction: actionDiff.nonBlankPixels,
    framesLumaOk: luma1.notWashedOut && luma2.notWashedOut && luma3.notWashedOut && luma4.notWashedOut,
    framesNoBlackTruncation: luma1.noBlackTruncation && luma2.noBlackTruncation && luma3.noBlackTruncation && luma4.noBlackTruncation,
    canvasFillsViewport: Boolean(readyState.canvasFillsViewport),
  };
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

if (runFilmstrip) {
  const fsRes = await captureFilmstrip({ width: dw, height: dh });
  console.log(
    `filmstrip              ready=${fsRes.readyState.ready} autoplayOff=${fsRes.autoplayOffByDefault} ` +
    `moveDeltaPx=${fsRes.characterMotionPixelsMove} actionDeltaPx=${fsRes.characterMotionPixelsAction} ` +
    `lumaOk=${fsRes.framesLumaOk} noBlk=${fsRes.framesNoBlackTruncation} fills=${fsRes.canvasFillsViewport}`
  );
  if (!fsRes.autoplayOffByDefault) {
    console.log(`   !! autoplay is ON by default (expected OFF unless ?autoplay=1 or ?demo=1)`);
    failed = true;
  }
  if (fsRes.characterMotionPixelsMove < 400 && fsRes.characterMotionPixelsAction < 400) {
    console.log(`   !! character region pixels did not change enough during movement/action (move=${fsRes.characterMotionPixelsMove}, action=${fsRes.characterMotionPixelsAction})`);
    failed = true;
  }
  if (!fsRes.framesLumaOk || !fsRes.framesNoBlackTruncation || !fsRes.canvasFillsViewport) {
    console.log(`   !! filmstrip frame failed luminance/truncation/viewport check`);
    failed = true;
  }
}

await browser.close();
console.log(`shots -> ${outDir}`);
if (strictAssert && failed) {
  process.exitCode = 1;
}


