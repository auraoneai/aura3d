import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
/* Courier Rush: real-input play verification via __COURIER_RUSH_DEBUG__.pump.
 * Real CDP keyboard events drive game.input; the pump advances the production
 * onFrame path (arcade van vehicle, dispatch state machine), skipping only
 * redundant GPU presentations.
 */
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const OUT = process.env.G2_OUT || "tests/reports/game-upgrade-2026-09/before/courier";
const dir = resolve(OUT); mkdirSync(dir, { recursive: true });
const GLOBAL = "__AURA3D_SHOWCASE_COURIER_RUSH__";
const DEBUG = "__COURIER_RUSH_DEBUG__";
const EVAL_TIMEOUT = 120_000;

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--enable-unsafe-webgpu", "--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const consoleErrors = [], pageErrors = [], netFailures = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 250)); });
page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e).slice(0, 250)));
page.on("requestfailed", (r) => netFailures.push(r.url().slice(0, 140) + " :: " + (r.failure()?.errorText ?? "")));
page.on("response", (r) => { if (r.status() >= 400) netFailures.push(r.url().slice(0, 140) + " :: HTTP " + r.status()); });

const ev = (fn, timeout = EVAL_TIMEOUT) => page.evaluate(fn, { timeout });
const readEv = () => ev(`(() => { const e = window["${GLOBAL}"]; return e ? {
  status: e.status, frameCount: e.frameCount, state: e.state, deliveryIndex: e.deliveryIndex,
  timerMs: e.timerMs, strikes: e.strikes, combo: e.combo, score: e.score, carrying: e.carrying,
  van: e.van ? { x: e.van.x, z: e.van.z, heading: e.van.heading, speed: e.van.speed } : null,
  assets: e.diagnostics?.assets?.map(a => a.id + ":" + a.status) ?? null,
  mounted: e.mounted ?? e.diagnostics?.renderer?.runtime?.mounted ?? null, backend: e.diagnostics?.backend ?? null,
  diagErrs: e.diagnostics?.errors?.length ?? 0,
} : null; })()`);
const pump = (frames) => ev(`(async () => window["${DEBUG}"].pump(${JSON.stringify(frames)}))()`);
const present = () => Promise.race([
  ev(`(async () => window["${DEBUG}"].present())()`),
  new Promise((_, rej) => setTimeout(() => rej(new Error("present-timeout-60s (SwiftShader environment)")), 60000)),
]);
const shot = async (label) => {
  await present().catch((e) => log("  present failed: " + String(e).slice(0, 120)));
  const p = resolve(dir, `${label}.png`);
  const dataUrl = await ev(`(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    try { return c.toDataURL("image/png"); } catch { return null; }
  })()`).catch(() => null);
  if (dataUrl) {
    writeFileSync(p, Buffer.from(String(dataUrl).split(",")[1], "base64"));
    log(`  shot ${label} (canvas)`);
  } else {
    await page.screenshot({ path: p, timeout: 120_000 });
    log(`  shot ${label} (compositor)`);
  }
};

const report = { game: "courier-rush", input: "real-keyboard+__COURIER_RUSH_DEBUG__.pump", checks: [], consoleErrors, pageErrors, netFailures };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };

await page.goto("http://127.0.0.1:5199/apps/showcase-courier-rush/", { waitUntil: "domcontentloaded", timeout: 90000 });
log("loaded, waiting for evidence global...");
await page.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await pump(0);
let e0 = null;
for (let i = 0; i < 40; i++) {
  e0 = await readEv();
  const assetsOk = !e0?.assets || (e0.assets.length >= 1 && e0.assets.every((a) => a.endsWith(":ready")));
  if (assetsOk && e0?.mounted && (e0?.status === "ready" || e0?.status === "playing")) break;
  if (i % 5 === 0) log(`  mount poll ${i}: assets=${JSON.stringify(e0?.assets)} mounted=${e0?.mounted} status=${e0?.status}`);
  await page.waitForTimeout(5000);
}
check("mount-ready", !!e0?.mounted && (e0?.status === "ready" || e0?.status === "playing"), `status=${e0?.status} mounted=${e0?.mounted}`);
check("mount-backend-webgl2", e0?.backend === "webgl2", String(e0?.backend));
log(`  initial: state=${e0?.state} score=${e0?.score} timerMs=${e0?.timerMs}`);
await shot("01-first-load");

// Drive: hold W, pump 300 (5s) -> van accelerates and moves.
await page.keyboard.down("KeyW");
await pump(60);
await page.keyboard.up("KeyW");
const e1 = await readEv();
check("throttle-moves-van", (e1.van?.speed ?? 0) > 1, `speed=${e1.van?.speed} pos=(${e1.van?.x},${e1.van?.z})`);
await shot("02-gameplay");

// Steering: W + A.
await page.keyboard.down("KeyW"); await page.keyboard.down("KeyA");
await pump(60);
await page.keyboard.up("KeyA"); await page.keyboard.up("KeyW");
const e2 = await readEv();
check("steer-turns-van", Math.abs((e2.van?.heading ?? 0) - (e1.van?.heading ?? 0)) > 0.05, `heading ${e1.van?.heading} -> ${e2.van?.heading}`);
await shot("03-action");

// Drive toward the pickup: extended run with steering corrections.
await page.keyboard.down("KeyW");
for (let i = 0; i < 10; i++) {
  const k = i % 2 ? "KeyA" : "KeyD";
  await page.keyboard.down(k); await pump(30); await page.keyboard.up(k);
}
await page.keyboard.up("KeyW");
const e3 = await readEv();
log(`  after drive: state=${e3.state} carrying=${e3.carrying} score=${e3.score} strikes=${e3.strikes}`);
await shot("04-mid-progression");

// Keep driving to force timer pressure / strikes.
await page.keyboard.down("KeyW");
for (let i = 0; i < 10; i++) { await pump(60); }
await page.keyboard.up("KeyW");
const e4 = await readEv();
log(`  after pressure run: state=${e4.state} timerMs=${e4.timerMs} strikes=${e4.strikes} score=${e4.score}`);
await shot("05-impact-or-collision");

// Reset: real R key.
await page.keyboard.press("KeyR");
await pump(60);
const e5 = await readEv();
check("reset-restores", (e5.van?.speed ?? 99) < 0.5, `speed=${e5.van?.speed} state=${e5.state}`);
await shot("07-reset");

// Long shift run for completion/progression (real input throughout).
log("  running long shift...");
await page.keyboard.down("KeyW");
let e6 = e5;
for (let i = 0; i < 30; i++) {
  const k = ["KeyA", "KeyD"][i % 2];
  await page.keyboard.down(k); await pump(60); await page.keyboard.up(k);
  if (i % 10 === 0) { e6 = await readEv(); log(`  shift run ${i}: state=${e6.state} idx=${e6.deliveryIndex} score=${e6.score} strikes=${e6.strikes}`); }
}
await page.keyboard.up("KeyW");
e6 = await readEv();
check("shift-progress", (e6.deliveryIndex ?? 0) > 0 || (e6.score ?? 0) !== (e5.score ?? 0), `idx=${e6.deliveryIndex} score=${e5.score}->${e6.score} state=${e6.state}`);
await shot("08-win-or-completion");

// Mobile viewport.
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto("http://127.0.0.1:5199/apps/showcase-courier-rush/", { waitUntil: "domcontentloaded", timeout: 90000 });
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
