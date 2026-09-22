import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
/* Turbo Drift Circuit: real-input play verification.
 * Real CDP keyboard events drive the production input system; the fixed-step
 * pump (pumpRealInput) advances the same onFrame path the live loop uses,
 * skipping only redundant GPU presentations (software renderer is ~0.05fps).
 * Screenshots present the pumped state through the production renderer.
 */
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const OUT = process.env.G2_OUT || "tests/reports/game-upgrade-2026-09/before/turbo";
const dir = resolve(OUT); mkdirSync(dir, { recursive: true });
const GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
const CAPTURE = "__AURA3D_TURBO_ACCEPTANCE_CAPTURE__";
const EVAL_TIMEOUT = 120_000;

const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const consoleErrors = [], pageErrors = [], netFailures = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 250)); });
page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e).slice(0, 250)));
page.on("requestfailed", (r) => netFailures.push(r.url().slice(0, 140) + " :: " + (r.failure()?.errorText ?? "")));
page.on("response", (r) => { if (r.status() >= 400) netFailures.push(r.url().slice(0, 140) + " :: HTTP " + r.status()); });

const ev = (fn, timeout = EVAL_TIMEOUT) => page.evaluate(fn, { timeout });
const readEv = () => ev(`(() => { const e = window["${GLOBAL}"]; return e ? {
  status: e.status, frameCount: e.frameCount, speed: e.speed, lap: e.lap, checkpoint: e.checkpoint,
  startLightsComplete: e.startLightsComplete, position: e.position ?? null, heading: e.heading ?? null,
  gameplay: e.gameplay ? JSON.stringify(e.gameplay).slice(0, 500) : null,
  kit: e.kitContractProof ? JSON.stringify(e.kitContractProof).slice(0, 500) : null,
  feedback: e.renderedFeedback ? JSON.stringify(e.renderedFeedback).slice(0, 500) : null,
  assets: e.diagnostics?.assets?.map(a => a.id + ":" + a.status) ?? null,
  mounted: e.diagnostics?.renderer?.runtime?.mounted ?? null, drawCalls: e.diagnostics?.drawCalls ?? null,
  backend: e.diagnostics?.backend ?? null, diagErrs: e.diagnostics?.errors?.length ?? 0,
} : null; })()`);
const capture = (method, ...a) => ev(`(async () => window["${CAPTURE}"]["${method}"](${a.map((x) => JSON.stringify(x)).join(",")}))()`);
const shot = async (label) => {
  await capture("presentInput").catch(() => {});
  const p = resolve(dir, `${label}.png`);
  await page.screenshot({ path: p, timeout: 180_000 });
  log(`  shot ${label}`);
  return p;
};

const report = { game: "turbo-drift-circuit", input: "real-keyboard+pumpRealInput", checks: [], consoleErrors, pageErrors, netFailures };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); };

await page.goto("http://localhost:5199/apps/showcase-turbo-drift-circuit/", { waitUntil: "domcontentloaded", timeout: 90000 });
log("loaded, waiting for evidence global...");
await page.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await capture("holdOpeningGrid");
log("clock claimed, waiting for assets...");
let e0 = null;
for (let i = 0; i < 40; i++) {
  e0 = await readEv();
  if (e0?.assets?.length >= 3 && e0.assets.every((a) => a.endsWith(":ready")) && e0.mounted) break;
  if (i % 5 === 0) log(`  mount poll ${i}: assets=${JSON.stringify(e0?.assets)} mounted=${e0?.mounted} drawCalls=${e0?.drawCalls}`);
  await page.waitForTimeout(5000);
}
check("mount-assets-ready", !!e0?.assets?.every((a) => a.endsWith(":ready")), JSON.stringify(e0?.assets));
check("mount-backend-webgl2", e0?.backend === "webgl2", String(e0?.backend));
await shot("01-first-load");

// Countdown: pump 240 steps (4s) with NO throttle -> lights complete, car stationary.
let r = await capture("pumpRealInput", 240);
e0 = await readEv();
check("countdown-completes", e0.startLightsComplete === true, `steps=${r.steps} frame=${r.frame}`);
check("no-jump-start", e0.speed < 0.5, `speed=${e0.speed}`);

// Real throttle: hold W, pump 300 steps (5s) -> car launches.
await page.keyboard.down("KeyW");
r = await capture("pumpRealInput", 300);
await page.keyboard.up("KeyW");
const e1 = await readEv();
check("throttle-accelerates", (e1.speed ?? 0) > 2, `speed=${e1.speed}`);
check("car-moved", JSON.stringify(e1.position) !== JSON.stringify(e0.position), `pos=${JSON.stringify(e1.position)}`);
await shot("02-gameplay");

// Steering: hold W + A, pump 300 -> heading changes.
const hBefore = e1.heading;
await page.keyboard.down("KeyW"); await page.keyboard.down("KeyA");
r = await capture("pumpRealInput", 300);
await page.keyboard.up("KeyA"); await page.keyboard.up("KeyW");
const e2 = await readEv();
check("steer-changes-heading", Math.abs((e2.heading ?? 0) - (hBefore ?? 0)) > 0.05, `heading ${hBefore} -> ${e2.heading}`);
await shot("03-action");

// Extended drive toward checkpoint: W with gentle steering corrections.
await page.keyboard.down("KeyW");
for (let i = 0; i < 6; i++) {
  const k = i % 2 ? "KeyA" : "KeyD";
  await page.keyboard.down(k);
  await capture("pumpRealInput", 120);
  await page.keyboard.up(k);
}
await page.keyboard.up("KeyW");
const e3 = await readEv();
check("checkpoint-progress", (e3.checkpoint ?? 0) > 0 || JSON.parse(e3.kit || "{}").checkpointAdvances === true, `checkpoint=${e3.checkpoint} kit=${e3.kit}`);
await shot("04-mid-progression");

// Off-track excursion: hold W + D into the barrier.
await page.keyboard.down("KeyW"); await page.keyboard.down("KeyD");
await capture("pumpRealInput", 600);
await page.keyboard.up("KeyD"); await page.keyboard.up("KeyW");
const e4 = await readEv();
const fb4 = JSON.parse(e4.feedback || "{}");
check("off-track-detected", fb4.offTrack === true, `feedback=${e4.feedback}`);
await shot("05-impact-or-collision");

// Reset: real R key.
await page.keyboard.press("KeyR");
await capture("pumpRealInput", 60);
const e5 = await readEv();
check("reset-restores", (e5.speed ?? 99) < 0.5 && e5.lap === 1, `speed=${e5.speed} lap=${e5.lap} checkpoint=${e5.checkpoint}`);
await shot("07-reset");

// Finish: full race via the deterministic acceptance arc (5 laps, synthetic
// excursion-free driver -- completion "where practical"; input path already proven).
log("  advancing to finish (acceptance arc)...");
try {
  const fin = await capture("advanceTo", "finish");
  const e6 = await readEv();
  check("race-finish", e6.lap >= 5, `lap=${e6.lap} steps=${fin.steps}`);
  await shot("08-win-or-completion");
} catch (err) { check("race-finish", false, String(err).slice(0, 160)); }

// Mobile viewport: fresh page, tap, screenshot.
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto("http://localhost:5199/apps/showcase-turbo-drift-circuit/", { waitUntil: "domcontentloaded", timeout: 90000 });
await mp.waitForFunction((n) => !!window[n], GLOBAL, { timeout: 120_000 });
await mp.waitForTimeout(8000);
try { await mp.touchscreen.tap(195, 400); } catch {}
await mp.waitForTimeout(3000);
await mp.screenshot({ path: resolve(dir, "09-mobile.png"), timeout: 180_000 });
log("  shot 09-mobile");
await mctx.close();

report.fpsNote = "software-renderer; fps not meaningful headless (see performance-report.json on real GPU)";
writeFileSync(resolve(dir, "probe.json"), JSON.stringify(report, null, 2));
log("SUMMARY " + JSON.stringify(report.checks.map((c) => `${c.ok ? "PASS" : "FAIL"}:${c.name}`)));
log(`errors: console=${consoleErrors.length} page=${pageErrors.length} net=${netFailures.length}`);
await browser.close();
