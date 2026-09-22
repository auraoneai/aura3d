import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
/* Patrol Wing: real-input play verification via __PW_PUMP__.
 * Real CDP keyboard events drive the input; __PW_PUMP__ advances the
 * production fixed-step loop (authored flight + Rapier sensor proxies).
 * Screenshots via __PW_SHOT__ (app.screenshot dataUrl) for exact frames.
 */
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const OUT = process.env.G2_OUT || "tests/reports/game-upgrade-2026-09/before/patrol";
const dir = resolve(OUT); mkdirSync(dir, { recursive: true });
const GLOBAL = "__AURA3D_SHOWCASE_PATROL_WING__";
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
  status: e.status, state: e.state, hull: e.hull, ringIndex: e.ringIndex, wave: e.wave,
  dronesDown: e.dronesDown, shotsFired: e.shotsFired, accuracy: e.accuracy,
  pos: e.position, heading: e.heading, airspeed: e.airspeed, altitude: e.altitude,
  throttle: e.throttle, grounded: e.grounded, ringsPassed: e.ringsPassed, patrol: e.patrol,
  assets: e.primaryAssets ?? null, backend: e.backend ?? null,
} : null; })()`);
const pump = (frames) => ev(`(async () => window.__PW_PUMP__(${JSON.stringify(frames)}))()`);
const shot = async (label) => {
  const dataUrl = await ev(`(async () => window.__PW_SHOT__())()`, 180_000).catch((e) => { log("  shot failed: " + String(e).slice(0, 120)); return null; });
  if (dataUrl) {
    const b64 = String(dataUrl).split(",")[1];
    writeFileSync(resolve(dir, `${label}.png`), Buffer.from(b64, "base64"));
    log(`  shot ${label}`);
  }
};

const report = { game: "patrol-wing", input: "real-keyboard+__PW_PUMP__", checks: [], consoleErrors, pageErrors, netFailures };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };

await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
log("loaded, waiting for evidence global...");
await page.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await pump(0);
let e0 = null;
for (let i = 0; i < 40; i++) {
  e0 = await readEv();
  if (e0?.status === "ready") break;
  if (i % 5 === 0) log(`  mount poll ${i}: status=${e0?.status}`);
  await page.waitForTimeout(5000);
}
check("mount-ready", e0?.status === "ready", `status=${e0?.status} backend=${e0?.backend}`);
log(`  initial: state=${e0?.state} grounded=${e0?.grounded} throttle=${e0?.throttle}`);
await shot("01-first-load");

// Throttle up: hold Shift, pump 120 (2s) -> throttle increases.
await page.keyboard.down("ShiftLeft");
await pump(60);
await page.keyboard.up("ShiftLeft");
const e1 = await readEv();
check("throttle-up", (e1.throttle ?? 0) > (e0.throttle ?? 0), `throttle ${e0.throttle} -> ${e1.throttle}`);
await shot("02-gameplay");

// Takeoff: full throttle + pitch down (W), pump until airborne.
await page.keyboard.down("ShiftLeft");
await pump(60);
await page.keyboard.up("ShiftLeft");
await page.keyboard.down("KeyW");
let e2 = e1;
for (let i = 0; i < 20; i++) {
  await pump(60);
  e2 = await readEv();
  if (e2.grounded === "airborne" || (e2.altitude ?? 0) > 2) break;
}
await page.keyboard.up("KeyW");
check("takeoff", e2.grounded === "airborne" || (e2.altitude ?? 0) > 1, `grounded=${e2.grounded} alt=${e2.altitude} speed=${e2.airspeed}`);
await shot("03-action");

// Fly toward rings: pitch/roll corrections, pump.
for (let i = 0; i < 10; i++) {
  const k = ["KeyA", "KeyD", "KeyW", "KeyS"][i % 4];
  await page.keyboard.down(k); await pump(60); await page.keyboard.up(k);
}
const e3 = await readEv();
log(`  after maneuver: rings=${e3.ringsPassed} alt=${e3.altitude} speed=${e3.airspeed} pos=${JSON.stringify(e3.pos)}`);
await shot("04-mid-progression");

// Fire: hold Space, pump -> shots fired.
const shotsBefore = e3.shotsFired ?? 0;
await page.keyboard.down("Space");
await pump(90);
await page.keyboard.up("Space");
const e4 = await readEv();
check("fire-cannon", (e4.shotsFired ?? 0) > shotsBefore, `shots ${shotsBefore} -> ${e4.shotsFired}`);
await shot("05-impact-or-collision");

// Damage: use the test seam to apply damage (fail path), then reset.
await ev(`(async () => window.__PW_DAMAGE__(50))()`);
await pump(30);
const e5 = await readEv();
log(`  after damage: hull=${e5.hull} state=${e5.state}`);
await shot("06-damage-or-fail");

// Reset: real R key.
await page.keyboard.press("KeyR");
await pump(60);
const e6 = await readEv();
check("reset-restores", (e6.hull ?? 0) >= 99 && e6.grounded !== "airborne", `hull=${e6.hull} grounded=${e6.grounded} state=${e6.state}`);
await shot("07-reset");

// Extended patrol: fly the ring route (real input) for progression.
log("  flying extended patrol...");
let e7 = e6;
await page.keyboard.down("ShiftLeft"); await pump(90); await page.keyboard.up("ShiftLeft");
await page.keyboard.down("KeyW");
for (let i = 0; i < 30; i++) {
  await pump(60);
  if (i % 10 === 0) { e7 = await readEv(); log(`  patrol ${i}: rings=${e7.ringsPassed} alt=${e7.altitude?.toFixed(1)} speed=${e7.airspeed} state=${e7.state}`); }
  if (i === 15) { await page.keyboard.up("KeyW"); await page.keyboard.down("KeyS"); }
  if (i === 20) { await page.keyboard.up("KeyS"); await page.keyboard.down("KeyW"); }
}
await page.keyboard.up("KeyW");
e7 = await readEv();
check("patrol-progress", (e7.ringsPassed ?? 0) > 0 || (e7.airspeed ?? 0) > 5, `rings=${e7.ringsPassed} state=${e7.state}`);
await shot("08-win-or-completion");

// Mobile viewport.
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await mp.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await mp.waitForTimeout(8000);
try { await mp.touchscreen.tap(195, 400); } catch {}
await mp.waitForTimeout(3000);
const mshot = await mp.evaluate(`(async () => window.__PW_SHOT__())()`, { timeout: 180_000 }).catch(() => null);
if (mshot) writeFileSync(resolve(dir, "09-mobile.png"), Buffer.from(String(mshot).split(",")[1], "base64"));
log("  shot 09-mobile");
await mctx.close();

writeFileSync(resolve(dir, "probe.json"), JSON.stringify(report, null, 2));
log("SUMMARY " + JSON.stringify(report.checks.map((c) => `${c.ok ? "PASS" : "FAIL"}:${c.name}`)));
log(`errors: console=${consoleErrors.length} page=${pageErrors.length} net=${netFailures.length}`);
await browser.close();
