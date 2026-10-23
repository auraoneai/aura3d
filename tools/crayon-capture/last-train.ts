#!/usr/bin/env tsx
/**
 * tools/crayon-capture/last-train — deterministic reference capture of the ORIGINAL Last Train to the
 * Sea (Phase D, R-20). REMOTE RUN ONLY (serverless ACR Task, same recipe as evidence/crayon-capture/README.md);
 * never run Playwright on the Mac.
 *
 * The game has no QA hooks, so a pre-boot hook (last-train-lib.ts `blobPatchSource`) patches the game's own
 * module text as it becomes a Blob and exposes its pure state functions on `window.__a3d`. The runner then
 * steps `WM(state, 1/60, input)` / `GM(state, "doors" | "depart")` headlessly (no rendering) from a closed-loop
 * controller, over N full circuits of the six towns, recording the per-step inputs, phase events, per-leg fares /
 * tips, passengers, day/night toggles and JS heap per loop. It also samples the route (position, curvature,
 * grade, bank every 2 m) and the game's constants so the port can use the same data.
 *
 *   node last-train.mjs --manifest games.json --sessions 2 --loops 3 --emit-markers --out /tmp/out [--params '{...}']
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DEFAULT_CONTROLLER, LAST_TRAIN_SCHEMA, blobPatchSource, balanceInput, shouldBrake, encodeInputs } from "./last-train-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

const READY = `!!(window.__a3d && typeof window.__a3d.WM === "function" && window.__a3d.tu && window.__a3d.tu.length > 0 && typeof window.__a3d.FM === "function")`;

const CLICK_START = `(function () {
  var els = document.querySelectorAll("button,[role=button],a");
  for (var i = 0; i < els.length; i++) {
    var t = (els[i].textContent || "").trim().toLowerCase();
    if (t && t.length < 40 && /start journey|tap to start|click to start/.test(t)) { els[i].click(); return t; }
  }
  return null;
})()`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** In-page runner (plain JS; evaluated inside the game frame). Controller helpers are injected as source. */
function runnerSource(payload: { loops: number; traceEvery: number; routeSpacing: number; params: unknown }): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var C = P.params;
  var balanceInput = ${balanceInput.toString()};
  var shouldBrake = ${shouldBrake.toString()};
  var encodeInputs = ${encodeInputs.toString()};
  var A = window.__a3d;
  var out = { schema: ${JSON.stringify(LAST_TRAIN_SCHEMA)}, diag: {}, constants: {}, route: null, events: [], trace: [], loops: [], inputs: "", error: null };
  var round = function (x, d) { var m = Math.pow(10, d || 5); return Math.round(x * m) / m; };
  try {
    out.diag.patchCount = window.__a3dPatchCount;
    var ids = ${JSON.stringify(["WM", "GM", "FM", "Cu", "tu", "Jh", "B_", "Ww", "Yx", "jx", "$x", "qx", "cM", "lM", "mx", "TM", "EM", "kM", "AM", "RM", "CM", "Kx", "g_", "u_", "zx", "K_", "H_", "V_", "G_", "mM", "dM", "W_", "ef"])};
    out.diag.resolved = ids.filter(function (id) { return typeof A[id] !== "undefined"; });
    out.diag.missing = ids.filter(function (id) { return typeof A[id] === "undefined"; });
    var s0 = A.FM(null);
    out.diag.stateKeys = Object.keys(s0);
    out.diag.initial = { phase: s0.phase, leg: s0.leg, distance: s0.distance, passengers: s0.passengers, timeOfDay: s0.timeOfDay, difficulty: s0.difficulty, circuits: s0.circuits };
    var towns = A.Jh.map(function (t) { return { id: t.id, name: t.name, position: t.position, heading: t.heading, color: t.color, sky: t.sky, boarding: t.boarding }; });
    var garage = A.Ww(s0.garage);
    var diff = typeof A.B_ === "function" ? A.B_(s0.difficulty) : null;
    var skyPal = null;
    try { skyPal = JSON.parse(JSON.stringify(A.zx)); } catch (e) { out.diag.zxError = String(e); }
    out.constants = {
      TM: A.TM, EM: A.EM, kM: A.kM, AM: A.AM, RM: A.RM, CM: A.CM,
      seats: A.mx(s0), towns: towns, legLengths: A.tu.map(function (l) { return round(l.length, 4); }),
      garage: JSON.parse(JSON.stringify(garage)), difficulty: JSON.parse(JSON.stringify(diff)), sky: skyPal,
      temperament: { H: A.H_, V: A.V_, G: A.G_, kinds: A.W_ ? Object.keys(A.W_) : null },
      gates: A.tu.map(function (l, gi) { try { return JSON.parse(JSON.stringify(A.ef(gi))); } catch (e) { return String(e); } })
    };
    // Station passenger tables (data): names, town, row, destination, temperament, for the first circuits.
    try {
      var table = [];
      for (var ci = 0; ci < 4; ci++) for (var st = 0; st < A.tu.length; st++) {
        var pids = A.Yx(st, ci, false);
        table.push({ circuit: ci, station: st, passengers: pids.map(function (id) { var j = A.jx(id); return { id: id, name: j && j.name, town: j && j.town, row: j && j.row, destination: A.$x(id), temperament: A.K_(id).id }; }) });
      }
      out.constants.passengerTable = table;
    } catch (e) { out.diag.passengerTableError = String(e && e.message || e); }
    // Route sampling (position, curvature, grade, vertical curvature, bank) every routeSpacing metres per leg.
    var legs = [];
    for (var li = 0; li < A.tu.length; li++) {
      var len = A.tu[li].length, n = Math.ceil(len / P.routeSpacing), pos = [], phys = [];
      for (var k = 0; k <= n; k++) {
        var d = Math.min(len, k * P.routeSpacing);
        var c = A.Cu({ leg: li, distance: d });
        pos.push(round(c.position.x, 3), round(c.position.y, 3), round(c.position.z, 3));
        phys.push(round(c.curvature, 6), round(c.grade, 6), round(c.verticalCurvature, 6), round(c.bank, 6));
      }
      legs.push({ length: round(len, 4), spacing: P.routeSpacing, count: n + 1, position: pos, physics: phys });
    }
    out.route = { legs: legs };

    // Headless closed-loop run over N full circuits.
    var dt = 1 / 60, s = A.FM(null), step = 0, inputs = [], MAXSTEPS = 600000;
    var heap = function () { try { return performance.memory ? performance.memory.usedJSHeapSize : null; } catch (e) { return null; } };
    var snap = function (kind, extra) {
      var e = { step: step, t: round(step * dt, 4), kind: kind, phase: s.phase, leg: s.leg, distance: round(s.distance, 4), speed: round(s.speed, 5), aboard: s.passengers,
        score: s.score, fares: s.economy.attempt.fares, tips: s.economy.attempt.tips, lost: s.economy.attempt.lost, catches: s.catches, comfort: round(s.comfort, 4), timeOfDay: s.timeOfDay, circuits: s.circuits, bonuses: s.economy.attempt.bonuses, claims: s.driving.claims.length, streak: round(s.economy.attempt.streak, 3), lanterns: s.economy.attempt.lanterns, attempt: s.economy.attempt.status };
      if (extra) for (var key in extra) e[key] = extra[key];
      out.events.push(e);
    };
    var tripsList = function () { return s.trips.map(function (t) { var j = A.jx(t.id); var w = 0; for (var kk in t.journey.weights) w += t.journey.weights[kk]; return { id: t.id, name: j && j.name, origin: t.origin, destination: t.destination, seat: t.seat, fareDistance: round(t.fareDistance, 3), tip: A.cM(t), comfort: round(A.lM(t), 4), weight: round(w, 4), jDistance: round(t.journey.distance, 4) }; }); };
    var idle = { accelerate: false, brake: false, reverse: false, left: false, right: false, cruisePace: null };
    var advance = function (input) {
      var prev = s.phase;
      s = A.WM(s, dt, input);
      step++;
      inputs.push(input);
      if (step % P.traceEvery === 0) out.trace.push([round(step * dt, 4), s.leg, round(s.distance, 4), round(s.speed, 5), round(s.roll, 5), round(s.rollVelocity || 0, 5), s.passengers, s.score, s.economy.attempt.fares, s.economy.attempt.tips, s.economy.attempt.lost, round(s.comfort, 4), s.catches]);
      if (s.phase !== prev) snap("phase", { from: prev, pendingAlighters: s.pendingAlighters ? s.pendingAlighters.length : 0, pendingBoarders: s.pendingBoarders ? s.pendingBoarders.length : 0, phaseTime: round(s.phaseTime, 4) });
      if (step > MAXSTEPS) throw new Error("step budget exceeded");
    };
    var untilPhase = function (target) { var guard = 0; while (s.phase !== target) { advance(idle); if (++guard > 20000) throw new Error("stuck waiting for phase " + target + " in " + s.phase); } };
    var nLegs = A.tu.length;
    for (var loop = 1; loop <= P.loops; loop++) {
      var loopStart = step, legSummaries = [];
      if (s.economy.attempt.status !== "active") { var before = { score: s.score, wallet: s.economy.wallet, status: s.economy.attempt.status, grade: s.economy.lastResult && s.economy.lastResult.grade }; s = A.GM(s, "new-service"); snap("new-service", { before: before, attemptStatus: s.economy.attempt.status, phase: s.phase }); }
      if (loop === 2) { s = A.GM(s, "time-of-day", "night"); snap("time-of-day", { value: s.timeOfDay }); }
      if (loop === 3) { s = A.GM(s, "time-of-day", "day"); snap("time-of-day", { value: s.timeOfDay }); }
      for (var k2 = 0; k2 < nLegs; k2++) {
        var legStart = step, f0 = s.economy.attempt.fares, t0 = s.economy.attempt.tips, l0 = s.economy.attempt.lost, c0 = s.catches;
        if (s.phase === "docked") { s = A.GM(s, "doors"); snap("action", { action: "doors" }); }
        untilPhase("ready");
        snap("ready", { trips: tripsList() });
        s = A.GM(s, "depart"); snap("action", { action: "depart" });
        untilPhase("enroute");
        var guard2 = 0;
        while (s.phase === "enroute") {
          var remaining = A.tu[s.leg].length - s.distance;
          var bal = balanceInput(s.roll, s.rollVelocity || 0, C);
          var brake = shouldBrake(s.speed, remaining, C);
          advance({ accelerate: !brake, brake: brake, reverse: false, left: bal.left, right: bal.right, cruisePace: brake ? null : C.pace });
          if (++guard2 > 200000) throw new Error("enroute never ended");
        }
        // arrival: phase left enroute (docked at the next station, or an orchard/other phase)
        legSummaries.push({ leg: k2, steps: step - legStart, seconds: round((step - legStart) * dt, 4), fares: s.economy.attempt.fares - f0, tips: s.economy.attempt.tips - t0, lost: s.economy.attempt.lost - l0, aboard: s.passengers, catches: s.catches - c0 });
        snap("arrive", { arrivedLeg: s.leg });
      }
      // Complete the circuit's final station so passengers alight and board (counts as the loop's closing stop).
      if (s.phase === "docked") { s = A.GM(s, "doors"); snap("action", { action: "doors" }); }
      untilPhase("ready");
      snap("ready", { trips: tripsList() });
      out.loops.push({ loop: loop, steps: step - loopStart, seconds: round((step - loopStart) * dt, 4), legs: legSummaries, score: s.score, wallet: s.economy.wallet, heapUsedBytes: heap(),
        stateKeys: { deliveredRides: (s.deliveredRides || []).length, claimedRides: (s.claimedRides || []).length, arrivals: Object.keys(s.arrivals || {}).length, trips: (s.trips || []).length } });
    }
    out.inputs = encodeInputs(inputs);
    out.totalSteps = step;
    out.final = { phase: s.phase, leg: s.leg, circuits: s.circuits, score: s.score, wallet: s.economy.wallet };
  } catch (e) {
    out.error = String(e && e.stack ? e.stack : e).slice(0, 1500);
  }
  return JSON.stringify(out);
})()`;
}

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(1500);
    for (const f of page.frames()) {
      let ready = false;
      try { ready = (await f.evaluate(READY)) === true; } catch { /* navigating */ }
      if (ready) return f;
      try { await f.evaluate(CLICK_START); } catch { /* navigating */ }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "last-train-to-the-sea");
  if (!game?.url) throw new Error("last-train-to-the-sea url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const loops = Number(arg("--loops") ?? 3);
  const waitMs = Number(arg("--wait-ms") ?? 120000);
  const traceEvery = Number(arg("--trace-every") ?? 30);
  const routeSpacing = Number(arg("--route-spacing") ?? 2);
  const params = { ...DEFAULT_CONTROLLER, ...(arg("--params") ? (JSON.parse(arg("--params") as string) as object) : {}) };
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info", ...launchArgs] });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
      await context.addInitScript(blobPatchSource());
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findGameFrame(page, waitMs);
      let session: Record<string, unknown>;
      if (!frame) {
        session = { error: "game frame with exposed state functions not found", frames: page.frames().map((f) => f.url()) };
      } else {
        const raw = (await frame.evaluate(runnerSource({ loops, traceEvery, routeSpacing, params }))) as string;
        session = JSON.parse(raw) as Record<string, unknown>;
        // Only the first session carries the (large, identical) route and passenger table.
        if (n > 1) { delete session.route; }
      }
      Object.assign(session, { session: n, startedAt, url: game.url, browser: browser.version(), params, loopsRequested: loops });
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `last-train.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
