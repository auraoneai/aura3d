import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
/* Skyline Runner: real-input play verification via __AURA3D_SKYLINE_PUMP__.
 * Real CDP keyboard events drive game.input; the pump advances the production
 * onFrame path (Rapier kinematic capsule + authored platformer rules),
 * skipping only redundant GPU presentations.
 */
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const OUT = process.env.G2_OUT || "tests/reports/game-upgrade-2026-09/before/skyline";
const dir = resolve(OUT); mkdirSync(dir, { recursive: true });
const GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";
const PUMP = "__AURA3D_SKYLINE_PUMP__";
const EVAL_TIMEOUT = 120_000;

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--enable-unsafe-webgpu", "--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const consoleErrors = [], pageErrors = [], netFailures = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 250)); });
page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e).slice(0, 250)));
page.on("requestfailed", (r) => netFailures.push(r.url().slice(0, 140) + " :: " + (r.failure()?.errorText ?? "")));
page.on("response", (r) => { if (r.status() >= 400) netFailures.push(r.url().slice(0, 140) + " :: HTTP " + r.status()); });

const ev = (fn, timeout = EVAL_TIMEOUT) => page.evaluate(fn, { timeout });
const readEv = () => ev(`(() => { const e = window["${GLOBAL}"]; return e ? {
  status: e.status, frameCount: e.frameCount,
  px: e.player?.x, py: e.player?.y, pvx: e.player?.vx, pvy: e.player?.vy, grounded: e.player?.grounded,
  score: e.score, coins: e.coins, deaths: e.deaths, checkpointId: e.checkpointId,
  challenge: e.challenge ? JSON.stringify(e.challenge).slice(0, 300) : null,
  assets: e.diagnostics?.assets?.map(a => a.id + ":" + a.status) ?? null,
  mounted: e.diagnostics?.renderer?.runtime?.mounted ?? null, backend: e.diagnostics?.backend ?? null,
  diagErrs: e.diagnostics?.errors?.length ?? 0,
} : null; })()`);
const pump = (frames) => ev(`(async () => window["${PUMP}"].pump(${JSON.stringify(frames)}))()`);
const present = () => Promise.race([
  ev(`(async () => window["${PUMP}"].present())()`),
  new Promise((_, rej) => setTimeout(() => rej(new Error("present-timeout-60s (SwiftShader environment)")), 60000)),
]);
const shot = async (label) => {
  await present().catch((e) => log("  present failed: " + String(e).slice(0, 120)));
  const p = resolve(dir, `${label}.png`);
  // Canvas capture (not compositor screenshot): SwiftShader compositor can hang;
  // toDataURL reads the WebGL canvas directly. preserveDrawingBuffer is enabled
  // by the app's capture contract; fall back to page.screenshot if unavailable.
  const dataUrl = await ev(`(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    try { return c.toDataURL("image/png"); } catch { return null; }
  })()`).catch(() => null);
  if (dataUrl) {
    const base64 = dataUrl.split(",")[1];
    writeFileSync(p, Buffer.from(base64, "base64"));
    log(`  shot ${label} (canvas)`);
  } else {
    await page.screenshot({ path: p, timeout: 120_000 });
    log(`  shot ${label} (compositor)`);
  }
};

const report = { game: "skyline-runner", input: "real-keyboard+__AURA3D_SKYLINE_PUMP__", checks: [], consoleErrors, pageErrors, netFailures };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };

await page.goto("http://127.0.0.1:5199/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
log("loaded, waiting for evidence global...");
await page.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
log("claiming clock (pump 0)...");
await pump(0);
let e0 = null;
for (let i = 0; i < 40; i++) {
  e0 = await readEv();
  if (e0?.assets?.length >= 1 && e0.assets.every((a) => a.endsWith(":ready")) && e0.mounted) break;
  if (i % 5 === 0) log(`  mount poll ${i}: assets=${JSON.stringify(e0?.assets)} mounted=${e0?.mounted}`);
  await page.waitForTimeout(5000);
}
check("mount-assets-ready", !!e0?.assets?.every((a) => a.endsWith(":ready")), JSON.stringify(e0?.assets));
check("mount-backend-webgl2", e0?.backend === "webgl2", String(e0?.backend));
await shot("01-first-load");

// Run right: hold D, pump 300 (5s).
await page.keyboard.down("KeyD");
await pump(60);
await page.keyboard.up("KeyD");
const e1 = await readEv();
check("move-right", (e1.px ?? 0) > (e0.px ?? 0) + 0.05, `x ${e0.px} -> ${e1.px}`);
await shot("02-gameplay");

// Jump: pause first, then real Space keydown, then step (so pressed() edge is seen).
const yBefore = e1.py;
await ev(`window["${PUMP}"].pause()`);
await page.keyboard.down("KeyD");
await page.keyboard.down("Space");
await ev(`window["${PUMP}"].step(90)`);
await page.keyboard.up("Space");
const eJump = await readEv();
await page.keyboard.up("KeyD");
await ev(`window["${PUMP}"].resume()`);
check("jump-lifts", (eJump.py ?? 0) > (yBefore ?? 0) + 0.2 || eJump.grounded === false, `y ${yBefore} -> ${eJump.py} grounded=${eJump.grounded}`);
await shot("03-action");

// Extended run: collect coins / reach checkpoint.
await page.keyboard.down("KeyD");
for (let i = 0; i < 4; i++) { await pump(60); }
await page.keyboard.up("KeyD");
const e3 = await readEv();
check("run-progress", (e3.px ?? 0) > (e1.px ?? 0) + 0.1, `x ${e1.px} -> ${e3.px} coins=${e3.coins} checkpoint=${e3.checkpointId}`);
await shot("04-mid-progression");

// Keep running into hazards / gaps to test damage/death handling.
await page.keyboard.down("KeyD");
for (let i = 0; i < 4; i++) { await pump(60); }
await page.keyboard.up("KeyD");
const e4 = await readEv();
log(`  after hazard run: deaths=${e4.deaths} checkpoint=${e4.checkpointId} x=${e4.px}`);
await shot("05-impact-or-collision");

// Reset: real R key.
await page.keyboard.press("KeyR");
await pump(60);
const e5 = await readEv();
check("reset-restores", Math.abs((e5.px ?? 99) - (e0.px ?? 0)) < 2, `x ${e4.px} -> ${e5.px} (spawn ${e0.px})`);
await shot("07-reset");

// Finish: long run with jumps to complete the level (real input throughout).
log("  running to finish...");
await page.keyboard.down("KeyD");
let e6 = e5;
for (let i = 0; i < 40; i++) {
  await pump(60);
  if (i % 4 === 1) { await page.keyboard.down("Space"); await pump(30); await page.keyboard.up("Space"); }
  if (i % 10 === 0) { const ee = await readEv(); log(`  finish run ${i}: x=${ee.px?.toFixed(1)} coins=${ee.coins} deaths=${ee.deaths} cp=${ee.checkpointId}`); e6 = ee; }
}
await page.keyboard.up("KeyD");
e6 = await readEv();
check("level-progress-deep", (e6.px ?? 0) > (e1.px ?? 0) + 0.2 || (e6.coins ?? 0) > 0, `x=${e6.px} coins=${e6.coins} cp=${e6.checkpointId}`);
await shot("08-win-or-completion");

// Mobile viewport.
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto("http://127.0.0.1:5199/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
await mp.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await mp.waitForTimeout(8000);
try { await mp.touchscreen.tap(195, 400); } catch {}
await mp.waitForTimeout(3000);
await mp.screenshot({ path: resolve(dir, "09-mobile.png"), timeout: 180_000 });
log("  shot 09-mobile");
await mctx.close();

writeFileSync(resolve(dir, "probe.json"), JSON.stringify(report, null, 2));
log("SUMMARY " + JSON.stringify(report.checks.map((c) => `${c.ok ? "PASS" : "FAIL"}:${c.name}`)));
log(`errors: console=${consoleErrors.length} page=${pageErrors.length} net=${netFailures.length}`);
await browser.close();
