#!/usr/bin/env tsx
/**
 * tools/crayon-capture/where-the-wind-wanders — deterministic fixed-input reference for
 * "Where the Wind Wanders" (R-25 / Phase capture). REMOTE RUN ONLY (serverless ACR Task, see
 * evidence/crayon-probes/README.md for the recipe; this tool needs only `playwright`).
 *
 * The game exposes no state hooks, so the harness (1) seeds Math.random, (2) replaces the
 * frame loop with virtual time: after `engage` every requestAnimationFrame callback is queued
 * and run only by `step()` with a fixed 16.7 ms timestamp step, and performance.now() is the
 * same virtual clock, (3) dispatches synthetic key events on `window` (the game listens
 * there), and (4) reads the player from the live Scene captured through the three.js devtools
 * bus (the billboard sprite whose position starts at (-12, y, 4)).
 *
 * A closed-loop waypoint walker drives the run (calibrating the camera's right vector from
 * its first four steps) and records the key script it used, so the port can replay it open
 * loop. Output is data only; the captured game is never evaluated by this tool beyond the
 * browser page itself.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const WIND_CAPTURE_SCHEMA = "a3d-crayon-capture/1";
/** Virtual frame period in ms. > 1000/60 so the game's own 60 fps throttle never skips a frame. */
export const VIRTUAL_STEP_MS = 16.7;

export interface StepRecord { keys: string; act: "E" | "Space" | null }
export interface WindEvent { step: number; kind: string; hud: string }
export interface WindRun {
  ok: boolean;
  error?: string;
  steps: number;
  vstepMs: number;
  start: { x: number; z: number };
  cameraRight: { x: number; z: number } | null;
  xs: number[];
  zs: number[];
  script: { keys: string; act: "E" | "Space" | null; steps: number }[];
  events: WindEvent[];
  lettersAtStep: number[];
  bellStep: number | null;
  finalHud: string;
  setup: Record<string, unknown>;
}

export const HOOK_SOURCE = `(function () {
  if (window.__a3dWW || location.protocol !== "about:") return;
  var W = (window.__a3dWW = { virtual: false, vt: 0, queue: [], nextId: 1, lastRealTs: 0, scenes: [], renderers: [], rafCalls: 0, vstep: ${VIRTUAL_STEP_MS} });
  var s = 0x2545F491;
  Math.random = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  var bus = window.__THREE_DEVTOOLS__ || new EventTarget();
  window.__THREE_DEVTOOLS__ = bus;
  bus.addEventListener("observe", function (e) {
    var o = e && e.detail;
    if (!o) return;
    if (o.isScene) W.scenes.push(o); else if (o.isWebGLRenderer) W.renderers.push(o);
  });
  var realRaf = window.requestAnimationFrame.bind(window);
  var realCaf = window.cancelAnimationFrame.bind(window);
  var realNow = performance.now.bind(performance);
  window.requestAnimationFrame = function (cb) {
    W.rafCalls++;
    if (W.virtual) { var id = W.nextId++; W.queue.push({ id: id, cb: cb }); return id; }
    return realRaf(function (t) { W.lastRealTs = t; cb(t); });
  };
  window.cancelAnimationFrame = function (id) { W.queue = W.queue.filter(function (q) { return q.id !== id; }); realCaf(id); };
  performance.now = function () { return W.virtual ? W.vt : realNow(); };
  W.engage = function () {
    W.virtual = true;
    // Rendering has no effect on gameplay here (the sprite position is set in game code), and software GL
    // renders cost seconds per frame, so skip draw calls once time is virtual.
    W.renderers.forEach(function (r) { if (!r.__a3dRender) { r.__a3dRender = r.render; r.render = function () {}; } });
  };
  W.rebase = function () { W.vt = W.lastRealTs; return { vt: W.vt, queued: W.queue.length }; };
  W.step = function (n) {
    for (var i = 0; i < n; i++) {
      W.vt += W.vstep;
      var q = W.queue; W.queue = [];
      for (var j = 0; j < q.length; j++) q[j].cb(W.vt);
    }
  };
  W.key = function (type, code) {
    window.dispatchEvent(new KeyboardEvent(type, { code: code, key: code.replace("Key", "").toLowerCase(), bubbles: true, cancelable: true, repeat: false }));
  };
  W.findPlayer = function () {
    var found = null;
    for (var i = 0; i < W.scenes.length && !found; i++) {
      W.scenes[i].traverse(function (o) {
        if (!found && o.isMesh && Math.abs(o.position.x + 12) < 1e-6 && Math.abs(o.position.z - 4) < 1e-6 && o.scale.y > 2) found = o;
      });
    }
    W.player = found;
    return !!found;
  };
  W.hud = function () {
    var t = (document.body && document.body.innerText || "").replace(/\\s+/g, " ").trim();
    return t.slice(0, 600);
  };
})()`;

/** Source of the in-page runner: an async IIFE returning JSON of `WindRun`. */
export function pageRunnerSource(): string {
  return `(async function () {
  var W = window.__a3dWW;
  var out = function (o) { return JSON.stringify(o); };
  var fail = function (msg, extra) { return out(Object.assign({ ok: false, error: msg, steps: 0, vstepMs: ${VIRTUAL_STEP_MS}, start: { x: 0, z: 0 }, cameraRight: null, xs: [], zs: [], script: [], events: [], lettersAtStep: [], bellStep: null, finalHud: "", setup: {} }, extra || {})); };
  if (!W) return fail("hook missing");
  if (!W.findPlayer()) return fail("player sprite not found", { setup: { scenes: W.scenes.length, rafCalls: W.rafCalls } });
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var round = function (x) { return Math.round(x * 1e9) / 1e9; };
  var held = {};
  var recs = [];
  var xs = [], zs = [], events = [], lettersAt = [], bellStep = null;
  var steps = 0;
  var lastHud = W.hud();
  var setKeys = function (keys) {
    var want = {};
    for (var i = 0; i < keys.length; i++) want["Key" + keys[i]] = true;
    Object.keys(held).forEach(function (c) { if (!want[c]) { W.key("keyup", c); delete held[c]; } });
    Object.keys(want).forEach(function (c) { if (!held[c]) { W.key("keydown", c); held[c] = true; } });
  };
  var pos = function () { return { x: W.player.position.x, z: W.player.position.z }; };
  var record = function (keys, act) {
    var last = recs[recs.length - 1];
    if (last && last.keys === keys && last.act === act) last.steps++; else recs.push({ keys: keys, act: act, steps: 1 });
  };
  var stepOnce = async function (keys, act) {
    setKeys(keys);
    if (act === "E") { W.key("keydown", "KeyE"); W.key("keyup", "KeyE"); }
    if (act === "Space") { W.key("keydown", "Space"); W.key("keyup", "Space"); }
    W.step(1);
    steps++;
    record(keys, act);
    var p = pos();
    xs.push(round(p.x)); zs.push(round(p.z));
    if (act) { await sleep(60); var h = W.hud(); events.push({ step: steps, kind: act, hud: h }); lastHud = h; }
  };
  var idle = async function (n) { for (var i = 0; i < n; i++) await stepOnce("", null); };

  W.engage();
  await sleep(300);
  var rb = W.rebase();
  if (!rb.queued) return fail("game loop not registered after engage", { setup: rb });
  var start = pos();
  await idle(30);

  // calibrate the camera right vector from four steps of D
  var p0 = pos();
  for (var i = 0; i < 4; i++) await stepOnce("D", null);
  var p1 = pos();
  await stepOnce("", null);
  var rx = p1.x - p0.x, rz = p1.z - p0.z, rl = Math.hypot(rx, rz);
  if (rl < 1e-6) return fail("calibration produced no movement", { start: start, setup: { p0: p0, p1: p1 } });
  var right = { x: rx / rl, z: rz / rl };
  var up = { x: -right.z, z: right.x };
  var dirs = [];
  [-1, 0, 1].forEach(function (g) { [-1, 0, 1].forEach(function (j) {
    if (!g && !j) return;
    var len = Math.hypot(g, j);
    // g = D - A, j = S - W  (the game's own mapping)
    dirs.push({ keys: (g > 0 ? "D" : g < 0 ? "A" : "") + (j > 0 ? "S" : j < 0 ? "W" : ""), x: (right.x * g + up.x * j) / len, z: (right.z * g + up.z * j) / len });
  }); });
  var pickKeys = function (dx, dz) {
    var l = Math.hypot(dx, dz) || 1, best = null, bd = -2;
    for (var k = 0; k < dirs.length; k++) { var d = (dirs[k].x * dx + dirs[k].z * dz) / l; if (d > bd) { bd = d; best = dirs[k]; } }
    return best.keys;
  };
  var walkTo = async function (tx, tz, tol, maxSteps) {
    var n = 0;
    while (n < maxSteps) {
      var p = pos(), dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) <= tol) return true;
      await stepOnce(pickKeys(dx, dz), null);
      n++;
    }
    return false;
  };
  var plan = ${JSON.stringify(WAYPOINTS)};
  var reached = [];
  for (var w = 0; w < plan.length; w++) {
    var wp = plan[w];
    if (wp.hop) await stepOnce("", "Space");
    var ok = await walkTo(wp.x, wp.z, wp.tol, 2400);
    reached.push({ i: w, ok: ok, at: pos() });
    await stepOnce("", null);
    if (wp.act) {
      await stepOnce("", wp.act);
      await idle(20);
      var hudNow = W.hud();
      if (wp.tag === "letter") lettersAt.push(steps);
      if (wp.tag === "bell") bellStep = steps;
      lastHud = hudNow;
    }
  }
  await idle(30);
  setKeys("");
  return out({
    ok: true, steps: steps, vstepMs: ${VIRTUAL_STEP_MS}, start: start, cameraRight: right,
    xs: xs, zs: zs, script: recs, events: events, lettersAtStep: lettersAt, bellStep: bellStep,
    finalHud: W.hud(),
    setup: { reached: reached, scenes: W.scenes.length, renderers: W.renderers.length, planLength: plan.length, hasWebGL2: W.renderers.length ? !!W.renderers[0].capabilities && W.renderers[0].capabilities.isWebGL2 : null }
  });
})()`;
}

export interface Waypoint { x: number; z: number; tol: number; act?: "E"; tag?: "letter" | "bell" | "via"; hop?: boolean }

/** Meadow route: oak letter, windmill letter, jetty to the water letter, then the homeward bell. */
export const WAYPOINTS: Waypoint[] = [
  { x: -18, z: 4, tol: 0.4, hop: true, tag: "via" },
  { x: -23, z: 3, tol: 0.5, act: "E", tag: "letter" },
  { x: -10, z: 1, tol: 0.6, tag: "via" },
  { x: 14, z: 1, tol: 0.6, tag: "via" },
  { x: 17.6, z: -4.2, tol: 0.3, act: "E", tag: "letter" },
  { x: 24, z: -2, tol: 0.6, tag: "via" },
  { x: 31, z: -9, tol: 0.6, tag: "via" },
  { x: 31, z: -14, tol: 0.5, act: "E", tag: "letter" },
  { x: 31, z: -9, tol: 0.6, tag: "via" },
  { x: 40, z: 1, tol: 0.6, tag: "via" },
  { x: 47, z: 4.5, tol: 0.5, act: "E", tag: "bell" }
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Frame = { evaluate: (fn: string) => Promise<unknown>; url: () => string };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] };
type Context = { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> };
type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> };

async function session(browser: Browser, url: string, readyTimeoutMs: number): Promise<WindRun | { ok: false; error: string }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    await context.addInitScript(HOOK_SOURCE);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const started = Date.now();
    let game: Frame | null = null;
    while (Date.now() - started < readyTimeoutMs) {
      await page.waitForTimeout(1500);
      for (const f of page.frames()) {
        try {
          const ready = (await f.evaluate(`(function(){var W=window.__a3dWW;return !!(W&&W.rafCalls>3&&W.scenes.length&&W.findPlayer());})()`)) as boolean;
          if (ready) { game = f; break; }
        } catch { /* navigating */ }
      }
      if (game) break;
    }
    if (!game) return { ok: false, error: `game not ready after ${readyTimeoutMs} ms` };
    const text = (await game.evaluate(pageRunnerSource())) as string;
    return JSON.parse(text) as WindRun;
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
  const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "where-the-wind-wanders");
  if (!game?.url) throw new Error("where-the-wind-wanders missing from manifest");
  const sessions = Number(arg("--sessions") ?? 2);
  const readyMs = Number(arg("--ready-ms") ?? 150000);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1]] : []));
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let i = 0; i < sessions; i++) {
      const run = await session(browser, game.url, readyMs);
      const json = JSON.stringify({ schema: WIND_CAPTURE_SCHEMA, game: "where-the-wind-wanders", session: i + 1, capturedAt: new Date().toISOString(), run });
      process.stdout.write(`@@WIND_CAPTURE_BEGIN:${i + 1}\n${json}\n@@WIND_CAPTURE_END:${i + 1}\n`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /where-the-wind-wanders\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
