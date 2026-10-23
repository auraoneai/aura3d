#!/usr/bin/env tsx
/**
 * tools/crayon-capture/saiyan-snake-way: deterministic reference capture of the ORIGINAL
 * "Saiyan through the Snake way!" (PRD §7.2 Phase C/R-25). REMOTE RUN ONLY (serverless ACR
 * Task, same recipe as evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * The game's simulation is `qB(dt)` over one mutable state object. Randomness is absent
 * (spawns hash the road position) and wall-clock time only touches visuals. A pre-boot hook
 * sets `window.__HARNESS` (which un-no-ops the page's `window.__TEST` QA API) and freezes the
 * real-time rAF loop; the tool then steps the sim with `__TEST.sim` / `__TEST.tap` at exactly
 * 1/60 s and snapshots the raw state (`window.__PROBE.S`) so the port can be compared
 * field-for-field, not just through `status()`'s rounded values.
 *
 *   node saiyan-snake-way.mjs --manifest games.json --mode explore|script|policy --sessions 2 \
 *        [--script '<json segments>'] [--frames 1800] [--every 30] --emit-markers --out /tmp/out
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

/** Runs before any game script in every frame. `__HARNESS` keeps the page from stubbing `window.__TEST`. */
export const HOOK_SOURCE = `(function () {
  if (window.__a3dCap) return;
  window.__HARNESS = true;
  var cap = (window.__a3dCap = { freeze: false, dropped: 0 });
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (t) {
      if (cap.freeze) { cap.dropped++; return; }
      cb(t);
    });
  };
})()`;

const CLICK_START = `(function () {
  var els = document.querySelectorAll("button,[role=button],a,div,span");
  for (var i = 0; i < els.length; i++) {
    var t = (els[i].textContent || "").trim().toLowerCase();
    if (t && t.length < 40 && /tap to start|click to start/.test(t)) { els[i].click(); return t; }
  }
  return null;
})()`;

const HAS_TEST = `!!(window.__TEST && typeof window.__TEST.sim === "function" && window.__PROBE && window.__PROBE.S && typeof window.__START === "function")`;

/** Raw-state fields recorded in every snapshot (all plain numbers/strings/booleans on the game's state object). */
export const SNAPSHOT_FIELDS = [
  "phase", "leg", "s", "lane", "laneTarget", "laneX", "laneVel", "y", "vy", "grounded", "sliding", "speed", "speedMul",
  "aura", "auraHeld", "auraRung", "auraLatch", "kaio", "mo", "powerT", "strain", "lockout", "ki", "kiMax", "days", "score",
  "stumble", "invuln", "nimbus", "flyFree", "canFly", "atEnd", "endT", "time", "drowse", "wind", "stageIndex", "kiChain",
  "jumpBuf", "dashT", "peach", "senzu", "poleCharges", "checkpointS", "milestoneIndex", "ended"
] as const;

export interface Segment {
  /** idle: step with nothing pressed; tap: one frame with a single key edge; hold: step with keys held. */
  kind: "idle" | "tap" | "hold";
  frames: number;
  key?: string;
  keys?: string[];
}

/** Context handed to the in-page autopilot each frame. */
export interface PolicyCtx {
  S: Record<string, any>;
  ents: Record<string, any>[];
  samples: { s: number; gap: boolean }[];
  mem: Record<string, number>;
  params: Record<string, number>;
}

/**
 * Closed-loop autopilot for the outbound run. It reads the game's own state, entity list and
 * road samples and returns at most one key edge per frame (`Space` jump, `KeyS` slide,
 * `KeyA`/`KeyD` lane, `ShiftLeft` Kaio-ken toggle) or null. Self-contained: its source text is
 * evaluated inside the game frame via `Function.prototype.toString`, so it must not capture
 * module scope.
 */
export function snakePolicy(c: PolicyCtx): string | null {
  const S = c.S, E = c.ents, M = c.mem, P = c.params;
  const LANE = 2.3, G = 62, VY = 22, AIR = (2 * VY) / G;
  for (const k of ["laneCool", "jumpCool", "slideCool", "shiftCool"]) if (M[k] > 0) M[k]--;
  const v = Math.max(S.speed, 10);
  const samples = c.samples;
  const gapAt = (at: number): boolean => {
    if (!samples.length || at < samples[0].s) return false;
    let n = Math.floor((at - samples[0].s) / 3);
    n = Math.max(0, Math.min(n, samples.length - 2));
    const i = Math.max(0, Math.min((at - samples[n].s) / 3, 1));
    return i < 0.5 ? samples[n].gap : samples[n + 1].gap;
  };
  const grounded = S.grounded && !S.stumble;
  // 1. road gaps: take off so the airborne window covers the whole gap
  if (grounded && M.jumpCool <= 0) {
    for (let d = 0.5; d < 70; d += 0.5) {
      if (!gapAt(S.s + d)) continue;
      let len = 0;
      while (len < 20 && gapAt(S.s + d + len)) len += 0.5;
      const lead = Math.max(0.5, (v * AIR - len) / 2 - (P.gapMargin ?? 1));
      if (d <= lead + v / 60) { M.jumpCool = 25; return "Space"; }
      break;
    }
  }
  // 2. hazards
  const D = 14 + v * 0.95;
  const eff = (e: any): number => (e.type === "sweeper" || e.type === "soul" || e.type === "oni" ? e.s + e.rel : e.s);
  const laneX = (e: any): number => e.lane * LANE;
  const HAZ: Record<string, number> = { barrier: 1, arch: 1, spike: 1, soul: 1, oni: 1, sweeper: 1, drain: 0.6 };
  const laneCost = (lane: number): number => {
    let cost = 0;
    for (const e of E) {
      if (e.dead || !HAZ[e.type]) continue;
      const d = eff(e) - S.s;
      if (d < 3 || d > D) continue;
      if (Math.abs(laneX(e) - lane * LANE) < 1.7) cost += HAZ[e.type] * (1 + (D - d) / D);
    }
    return cost;
  };
  let nearest: any = null, nearestD = 1e9;
  for (const e of E) {
    if (e.dead || !HAZ[e.type]) continue;
    const d = eff(e) - S.s;
    if (d < -1 || d > D) continue;
    if (Math.abs(laneX(e) - S.laneX) < 1.5 && d < nearestD) { nearest = e; nearestD = d; }
  }
  if (nearest && grounded) {
    const closing = v + (nearest.type === "oni" && nearest.kind === "oncoming" ? 5.5 : 0) + (nearest.type === "soul" ? 16 : 0) + (nearest.type === "sweeper" ? -14 : 0);
    const tc = nearestD / Math.max(closing, 8);
    const here = laneCost(S.laneTarget);
    if (M.laneCool <= 0 && tc > 0.42 && here > 0) {
      for (const dl of [-1, 1]) {
        const l = S.laneTarget + dl;
        if (l < -1 || l > 1) continue;
        if (laneCost(l) === 0) { M.laneCool = 14; return dl < 0 ? "KeyA" : "KeyD"; }
      }
    }
    if (nearest.type === "arch") {
      if (M.slideCool <= 0 && tc < 0.3 && tc > 0.02) { M.slideCool = 30; return "KeyS"; }
    } else if (M.jumpCool <= 0 && tc < 0.4 && tc > 0.12) { M.jumpCool = 30; return "Space"; }
  }
  // 3. Kaio-ken: switch on with spare ki, drop it before the strain bar fills
  if (M.shiftCool <= 0) {
    if (S.kaio === "off" && S.grounded && S.ki > (P.kiOn ?? 0.7) && S.strain < 0.15 && S.lockout <= 0 && !S.stumble && !nearest) { M.shiftCool = 30; return "ShiftLeft"; }
    if ((S.kaio === "on" || S.kaio === "power") && (S.strain > (P.strainOff ?? 0.6) || S.ki < 0.12)) { M.shiftCool = 30; return "ShiftLeft"; }
  }
  return null;
}

/** In-page runner. `P` = { mode, frames, every, script, fields }. Returns a JSON string. */
export function pageRunnerSource(payload: Record<string, unknown>, policySource: string = "function(){return null;}"): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var policy = (${policySource});
  var T = window.__TEST, S = window.__PROBE.S;
  var round = function (x, d) { if (typeof x !== "number" || !isFinite(x)) return x; var f = Math.pow(10, d); return Math.round(x * f) / f; };
  var snap = function (frame) {
    var o = { frame: frame };
    for (var i = 0; i < P.fields.length; i++) { var k = P.fields[i]; var v = S[k]; o[k] = typeof v === "number" ? round(v, 9) : v; }
    o.stage = S.stage ? S.stage.name : null;
    o.ents = window.__PROBE.ents.length;
    o.errs = (window.__ERRS || []).length;
    return o;
  };
  var out = { setup: {}, snapshots: [], events: [], ents: null, segments: [] };
  try { out.setup.stagesProbe = T.goto("zzzz-none"); } catch (e) { out.setup.stagesProbeError = String(e && e.message || e); }
  try { out.setup.routesProbe = T.run("zzzz-none"); } catch (e) { out.setup.routesProbeError = String(e && e.message || e); }
  out.setup.phaseBeforeStart = S.phase;
  var started = window.__START();
  out.setup.phaseAfterStart = started;
  out.setup.startStatus = T.status();
  var frame = 0;
  var stepN = function (n, keys) { if (n <= 0) return; var o = {}; (keys || []).forEach(function (k) { o[k] = true; }); T.sim((n - 0.5) / 60, o); frame += n; };
  var record = function () { out.snapshots.push(snap(frame)); };
  record();
  var last = { phase: S.phase, stage: S.stage ? S.stage.name : null, rung: S.auraRung, stumble: S.stumble > 0, hit: S.invuln > 0 };
  var watch = function () {
    var cur = { phase: S.phase, stage: S.stage ? S.stage.name : null, rung: S.auraRung, stumble: S.stumble > 0, hit: S.invuln > 0 };
    for (var k in cur) if (cur[k] !== last[k]) { out.events.push({ frame: frame, what: k, from: last[k], to: cur[k], s: round(S.s, 3), days: round(S.days, 3), speed: round(S.speed, 3) }); last[k] = cur[k]; }
  };
  if (P.mode === "explore") {
    var entsDump = [];
    var E = window.__PROBE.ents;
    for (var i = 0; i < E.length && i < 600; i++) { var e = E[i]; entsDump.push({ i: i, type: e.type, kind: e.kind, s: round(e.s, 3), lane: e.lane, rel: e.rel, dead: !!e.dead, u: e.u, w: e.w, len: e.len, dir: e.dir }); }
    out.ents = { total: E.length, first: entsDump };
    var n = P.frames;
    for (var f = 0; f < n; f++) {
      stepN(1);
      watch();
      if ((f + 1) % P.every === 0) record();
      if (S.phase !== "run") { out.events.push({ frame: frame, what: "left-run", phase: S.phase }); break; }
    }
    out.setup.entsAfter = { total: window.__PROBE.ents.length, sample: window.__PROBE.ents.slice(0, 40).map(function (e) { return { type: e.type, s: round(e.s, 2), lane: e.lane, dead: !!e.dead }; }) };
  } else if (P.mode === "policy") {
    var mem = { laneCool: 0, jumpCool: 0, slideCool: 0, shiftCool: 0 };
    var segsOut = [], cur = null, taps = 0;
    var finished = null;
    for (var pf = 0; pf < P.frames; pf++) {
      var key = policy({ S: S, ents: window.__PROBE.ents, samples: window.__PROBE.road.samples, mem: mem, params: P.params || {} });
      if (key) { T.tap(key, 1); taps++; segsOut.push({ kind: "tap", key: key, frames: 1 }); cur = null; }
      else { stepN(1); if (cur) cur.frames++; else { cur = { kind: "idle", frames: 1 }; segsOut.push(cur); } }
      if (key) frame++;
      watch();
      if (frame % P.every === 0) record();
      if (S.phase !== "run") { finished = "phase:" + S.phase; break; }
      if (S.atEnd) { finished = "atEnd"; break; }
    }
    out.segments = segsOut;
    out.policy = { taps: taps, frames: frame, finished: finished || "frame-cap" };
    out.setup.entsAfter = { total: window.__PROBE.ents.length };
  } else {
    var segs = P.script || [];
    var since = 0;
    for (var si = 0; si < segs.length; si++) {
      var sg = segs[si];
      if (sg.kind === "tap") { for (var q = 0; q < sg.frames; q++) { T.tap(sg.key, 1); frame++; watch(); if (++since % P.every === 0) record(); } }
      else { var left = sg.frames; while (left > 0) { var chunk = Math.min(left, P.every - (since % P.every)); stepN(chunk, sg.kind === "hold" ? sg.keys : []); left -= chunk; since += chunk; watch(); if (since % P.every === 0) record(); } }
      out.segments.push(sg);
    }
  }
  record();
  out.final = { frame: frame, status: T.status(), state: snap(frame) };
  return JSON.stringify(out);
})()`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(1500);
    for (const f of page.frames()) {
      let ready = false;
      try { ready = (await f.evaluate(HAS_TEST)) === true; } catch { /* navigating */ }
      if (ready) return f;
      try { await f.evaluate(CLICK_START); } catch { /* navigating */ }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "saiyan-snake-way");
  if (!game?.url) throw new Error("saiyan-snake-way url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const waitMs = Number(arg("--wait-ms") ?? 120000);
  const mode = arg("--mode") ?? "explore";
  const frames = Number(arg("--frames") ?? 1800);
  const every = Number(arg("--every") ?? 30);
  const script = arg("--script-file") ? (JSON.parse(fs.readFileSync(path.resolve(arg("--script-file") as string), "utf8")) as Segment[]) : arg("--script") ? (JSON.parse(arg("--script") as string) as Segment[]) : undefined;
  const params = arg("--params") ? (JSON.parse(arg("--params") as string) as Record<string, number>) : {};
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: 800, height: 450 } });
      await context.addInitScript(HOOK_SOURCE);
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findGameFrame(page, waitMs);
      const session: Record<string, unknown> = { schema: "a3d-crayon-capture-session/1", game: "saiyan-snake-way", session: n, startedAt, url: game.url, browser: browser.version(), mode };
      if (!frame) {
        session.error = "game frame with __TEST/__PROBE not found";
        session.frames = page.frames().map((f) => f.url());
      } else {
        await frame.evaluate(`(window.__a3dCap.freeze = true, window.__a3dCap.dropped)`);
        await page.waitForTimeout(500);
        const t0 = Date.now();
        const raw = (await frame.evaluate(pageRunnerSource({ mode, frames, every, script, params, fields: SNAPSHOT_FIELDS }, snakePolicy.toString()))) as string;
        session.wallMs = Date.now() - t0;
        session.run = JSON.parse(raw);
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `saiyan-snake-way.session${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /saiyan-snake-way\.(mjs|ts|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
