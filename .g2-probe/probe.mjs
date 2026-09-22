/**
 * G2 generic game probe: loads a game route, records console/page/network
 * errors, drives REAL keyboard input, captures before/after PNGs + probe.json.
 *
 * Usage: node probe.mjs --url <url> --game <slug> --out <dir> [--mobile]
 * Play sequences come from --seq <jsonfile> (array of steps).
 * Each step: { type: "press"|"down"|"up", key } | { type: "wait", ms }
 *            | { type: "shot", name } | { type: "touchshot", name }
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const url = args.url;
const game = args.game;
const outDir = args.out;
const mobile = args.mobile === "1" || args.mobile === "true";
const seq = JSON.parse(await readFile(args.seq, "utf8"));

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"]
});
const page = await browser.newPage(
  mobile
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 1440, height: 900 } }
);

const consoleErrors = [];
const pageErrors = [];
const requestFailed = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
});
page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 500)));
page.on("requestfailed", (req) => requestFailed.push(req.url().slice(0, 200)));

const t0 = Date.now();
let fps = null;
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
// wait for mount: canvas present and non-blank-ish
await page.waitForFunction(
  () => {
    const c = document.querySelector("canvas");
    return c && c.width > 50 && c.height > 50;
  },
  { timeout: 60000 }
).catch(() => {});
await page.waitForTimeout(4000);
const loadMs = Date.now() - t0;
await page.screenshot({ path: join(outDir, mobile ? "01-first-load-mobile.png" : "01-first-load.png") });

// Measure rough fps over 2s
fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < 2000) requestAnimationFrame(tick);
    else resolve(Math.round((frames / (performance.now() - start)) * 1000));
  };
  requestAnimationFrame(tick);
}));

// collect window proof globals (best-effort)
const globals = await page.evaluate(() => {
  const keys = Object.keys(window).filter((k) => k.startsWith("__AURA"));
  const out = {};
  for (const k of keys.slice(0, 20)) {
    try {
      const v = window[k];
      out[k] = typeof v === "object" && v !== null
        ? (Array.isArray(v) ? `array(${v.length})` : `object(keys:${Object.keys(v).length})`)
        : String(v).slice(0, 200);
    } catch { out[k] = "<err>"; }
  }
  return out;
});

const played = [];
let shotIndex = 2;
for (const step of seq) {
  if (step.type === "press") {
    await page.keyboard.press(step.key);
    played.push(`press ${step.key}`);
  } else if (step.type === "down") {
    await page.keyboard.down(step.key);
    played.push(`down ${step.key}`);
  } else if (step.type === "up") {
    await page.keyboard.up(step.key);
    played.push(`up ${step.key}`);
  } else if (step.type === "wait") {
    await page.waitForTimeout(step.ms);
    played.push(`wait ${step.ms}ms`);
  } else if (step.type === "shot") {
    const name = `${String(shotIndex).padStart(2, "0")}-${step.name}${mobile ? "-mobile" : ""}.png`;
    await page.screenshot({ path: join(outDir, name) });
    played.push(`shot ${name}`);
    shotIndex++;
  }
}

// release any held keys
for (const key of ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
  try { await page.keyboard.up(key); } catch {}
}

const probe = {
  game,
  url,
  viewport: mobile ? "390x844-mobile" : "1440x900",
  loadMs,
  approxFpsSwiftShader: fps,
  consoleErrors: consoleErrors.slice(0, 20),
  consoleErrorCount: consoleErrors.length,
  pageErrors: pageErrors.slice(0, 20),
  pageErrorCount: pageErrors.length,
  requestFailed: requestFailed.slice(0, 20),
  requestFailedCount: requestFailed.length,
  globals,
  played,
  at: new Date().toISOString()
};
writeFileSync(join(outDir, mobile ? "probe-mobile.json" : "probe.json"), JSON.stringify(probe, null, 2));
console.log(JSON.stringify({ game, loadMs, fps, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, requestFailed: requestFailed.length }, null, 2));
await browser.close();
