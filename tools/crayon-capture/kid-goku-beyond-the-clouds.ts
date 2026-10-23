#!/usr/bin/env tsx
/**
 * tools/crayon-capture/kid-goku-beyond-the-clouds — scripted, repeatable playthrough of the ORIGINAL
 * "Kid Goku: Beyond the Clouds" (Crayon game #11). REMOTE RUN ONLY (serverless ACR Task, recipe in
 * evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * The game's run simulation is a pure `Sp(state, input, dt, chapter)` stepped once per animation frame
 * with `dt = clamp(frameDelta, 1e-3, 0.04)`. A pre-boot hook virtualises `requestAnimationFrame` and
 * `performance.now` (and seeds `Math.random`) once the title screen is up, so this tool advances the loop
 * by exactly 1/60 s per step. Input is delivered as real KeyboardEvents (Space/ArrowUp jump, E pole, Q
 * nimbus, arrows/A/D steer). State is read from the game's own `window.__CLOUD_RUNNER__.snapshot()`.
 *
 *   node kid-goku.mjs --manifest games.json --emit-markers --out /tmp/out [--steps 800] [--viewport 640x360]
 * Session 1 runs a closed-loop policy and records the input script; session 2 replays that script open-loop
 * in a fresh browser context (determinism); session 3 runs the policy again (policy repeatability).
 * Draw calls are suppressed after the freeze unless `--draw` is passed (the sim does not depend on pixels).
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

export const SCHEMA = "a3d-crayon-capture-session/1";
export const SIM_STEP_MS = 1000 / 60;

/** Pre-boot hook: starts in live mode, `__kgVT.freeze()` switches the loop to manual stepping. */
export const HOOK_SOURCE = `(function () {
  if (window.__kgVT) return;
  var realRAF = window.requestAnimationFrame.bind(window);
  var realCancel = window.cancelAnimationFrame.bind(window);
  var realNow = performance.now.bind(performance);
  var frozen = false, queue = [], vnow = 0, nextId = 1000000000;
  window.requestAnimationFrame = function (cb) {
    if (!frozen) return realRAF(cb);
    var id = nextId++; queue.push({ id: id, cb: cb }); return id;
  };
  window.cancelAnimationFrame = function (id) {
    if (!frozen || id < 1000000000) return realCancel(id);
    queue = queue.filter(function (q) { return q.id !== id; });
  };
  var noDraw = false;
  ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements", "clear"].forEach(function (name) {
    [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach(function (C) {
      if (!C || !C.prototype[name]) return;
      var orig = C.prototype[name];
      C.prototype[name] = function () { if (noDraw) return; return orig.apply(this, arguments); };
    });
  });
  var seed = 0x2545F491;
  function seeded() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  window.__kgVT = {
    freeze: function (opts) { if (frozen) return vnow; vnow = realNow(); performance.now = function () { return vnow; }; Math.random = seeded; frozen = true; noDraw = !!(opts && opts.noDraw); return vnow; },
    step: function (n, dtMs) {
      for (var i = 0; i < n; i++) {
        vnow += dtMs;
        var list = queue; queue = [];
        for (var j = 0; j < list.length; j++) { try { list[j].cb(vnow); } catch (e) { window.__kgVTErr = String(e && e.stack || e); } }
      }
      return vnow;
    },
    pending: function () { return queue.length; },
    now: function () { return vnow; },
    frozen: function () { return frozen; }
  };
})();`;

export interface StepInput { readonly steer: -1 | 0 | 1; readonly jump: boolean; readonly pole: boolean; readonly nimbus: boolean }
export interface Segment { readonly steps: number; readonly input: StepInput }
export interface PagePayload {
  readonly mode: "policy" | "script";
  readonly maxSteps: number;
  readonly traceEvery: number;
  readonly segments?: readonly Segment[];
  readonly jumpAtS: readonly number[];
  readonly stopAtS: number;
  /** Turn GL draw calls into no-ops once time is frozen (the simulation does not depend on pixels). */
  readonly noDraw: boolean;
  /** Read the original's obstacle layout at the title screen and return without playing. */
  readonly obstaclesOnly: boolean;
}

/** Runs inside the game frame. Must stay self-contained (it is serialised with Function#toString). */
export async function pageRun(payload: PagePayload): Promise<Record<string, unknown>> {
  const w = window as unknown as {
    __kgVT: { freeze(o?: { noDraw?: boolean }): number; step(n: number, dt: number): number; pending(): number; now(): number; frozen(): boolean };
    __kgVTErr?: string;
    __CLOUD_RUNNER__: { snapshot(): Record<string, any> };
  };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const DT = 1000 / 60;
  const CR = w.__CLOUD_RUNNER__;
  const fire = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const compact = (s: Record<string, any>) => ({
    phase: s.phase, s: s.s, lane: s.lane, jump: s.jump, speed: s.speed, hearts: s.hearts, score: s.score, combo: s.combo,
    balls: s.balls, meat: s.meat, falls: s.fallen, pole: s.pole, finished: s.finished,
    nimbus: { charge: s.nimbus?.charge, active: s.nimbus?.active, call: s.nimbus?.call, time: s.nimbus?.time }
  });
  const out: Record<string, unknown> = {};

  // 1. wait for the title screen, freeze time, drain real callbacks, prime the loop.
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    if (CR && CR.snapshot && ["menu", "playing"].includes(CR.snapshot().phase)) break;
    await sleep(250);
  }
  out.bootPhase = CR?.snapshot?.().phase ?? null;
  out.bootWallMs = Date.now() - t0;
  w.__kgVT.freeze({ noDraw: payload.noDraw });
  await sleep(400);
  for (let i = 0; i < 6; i++) { w.__kgVT.step(1, DT); await sleep(30); }
  out.queueAfterFreeze = w.__kgVT.pending();

  try {
    const world = (window as unknown as { __LAB__?: { world?: { obstacles?: { s: number; lane: number; type: string; size?: number; id?: number }[] } } }).__LAB__?.world;
    out.obstacles = (world?.obstacles ?? []).map((o) => ({ s: o.s, lane: o.lane, type: o.type, size: o.size ?? null, id: o.id ?? null }));
  } catch (e) { out.obstaclesError = String(e); }
  if (payload.obstaclesOnly) return out;

  // 2. press the start button and step until the run is live.
  const startBtn = document.getElementById("start") as HTMLElement | null;
  out.startFound = !!startBtn;
  startBtn?.click();
  let guard = 0;
  while (CR.snapshot().phase !== "playing" && guard < 900) {
    w.__kgVT.step(1, DT);
    if (guard % 10 === 0) await sleep(25);
    guard++;
  }
  out.playingAfterSteps = guard;
  out.phaseAfterStart = CR.snapshot().phase;
  if (CR.snapshot().phase !== "playing") { out.error = "run did not start"; return out; }
  // settle: let intro motion/UI finish for a few frames before step 0
  for (let i = 0; i < 4; i++) w.__kgVT.step(1, DT);
  const base = CR.snapshot();
  out.start = compact(base);
  out.vnowAtStart = w.__kgVT.now();

  // 3. run
  const held = new Set<string>();
  const setHeld = (codes: string[]) => {
    for (const c of [...held]) if (!codes.includes(c)) { fire("keyup", c); held.delete(c); }
    for (const c of codes) if (!held.has(c)) { fire("keydown", c); held.add(c); }
  };
  const trace: unknown[] = [];
  const inputs: StepInput[] = [];
  const expanded: StepInput[] = [];
  if (payload.mode === "script") for (const seg of payload.segments ?? []) for (let i = 0; i < seg.steps; i++) expanded.push(seg.input);
  const jumpQueue = [...payload.jumpAtS];
  let stopped = "max-steps";
  const wall0 = Date.now();
  for (let step = 0; step < payload.maxSteps; step++) {
    let input: StepInput;
    if (payload.mode === "script") {
      if (step >= expanded.length) { stopped = "script-end"; break; }
      input = expanded[step] as StepInput;
    } else {
      const snap = CR.snapshot();
      const doJump = jumpQueue.length > 0 && snap.s >= (jumpQueue[0] as number);
      if (doJump) jumpQueue.shift();
      input = { steer: 0, jump: doJump, pole: false, nimbus: false };
    }
    setHeld(input.steer < 0 ? ["ArrowLeft"] : input.steer > 0 ? ["ArrowRight"] : []);
    if (input.jump) { fire("keydown", "Space"); fire("keyup", "Space"); }
    if (input.pole) { fire("keydown", "KeyE"); fire("keyup", "KeyE"); }
    if (input.nimbus) { fire("keydown", "KeyQ"); fire("keyup", "KeyQ"); }
    inputs.push(input);
    w.__kgVT.step(1, DT);
    const after = CR.snapshot();
    if (step % payload.traceEvery === 0) trace.push({ step: step + 1, ...compact(after) });
    if (step % 20 === 0) await sleep(5);
    if (after.phase !== "playing") { stopped = `phase:${after.phase}`; trace.push({ step: step + 1, ...compact(after) }); break; }
    if (after.s >= payload.stopAtS) { stopped = "stop-at-s"; trace.push({ step: step + 1, ...compact(after) }); break; }
  }
  setHeld([]);
  const segments: Segment[] = [];
  for (const input of inputs) {
    const last = segments[segments.length - 1];
    if (last && JSON.stringify(last.input) === JSON.stringify(input)) segments[segments.length - 1] = { steps: last.steps + 1, input };
    else segments.push({ steps: 1, input });
  }
  out.stopped = stopped;
  out.steps = inputs.length;
  out.runWallMs = Date.now() - wall0;
  out.segments = segments;
  out.trace = trace;
  out.final = compact(CR.snapshot());
  out.vtError = w.__kgVTErr ?? null;
  return out;
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    for (const f of page.frames()) {
      try {
        if (f.url() === "about:srcdoc" && (await f.evaluate(`!!(window.__CLOUD_RUNNER__ && window.__kgVT)`))) return f;
      } catch { /* frame navigating */ }
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url: string }[] };
  const game = manifest.games.find((g) => g.id === "kid-goku-beyond-the-clouds");
  if (!game) throw new Error("kid-goku-beyond-the-clouds not in manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const waitMs = Number(arg("--wait-ms") ?? 240000);
  const maxSteps = Number(arg("--steps") ?? 800);
  const traceEvery = Number(arg("--trace-every") ?? 5);
  const stopAtS = Number(arg("--stop-at-s") ?? 1e9);
  const noDraw = !process.argv.includes("--draw");
  const obstaclesOnly = process.argv.includes("--obstacles-only");
  const jumpAtS = (arg("--jump-at") ?? "147").split(",").filter(Boolean).map(Number);
  const [vw, vh] = (arg("--viewport") ?? "640x360").split("x").map(Number) as [number, number];
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  let recorded: Segment[] | null = null;
  try {
    for (let n = 1; n <= (obstaclesOnly ? 1 : 3); n++) {
      const mode: "policy" | "script" = n === 2 && recorded ? "script" : "policy";
      const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
      await context.addInitScript(HOOK_SOURCE);
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findGameFrame(page, waitMs);
      const session: Record<string, unknown> = { schema: SCHEMA, session: n, mode, startedAt, url: game.url, browser: browser.version(), viewport: { width: vw, height: vh } };
      if (!frame) {
        session.error = "game frame with __CLOUD_RUNNER__ not found";
        session.frames = page.frames().map((f) => f.url());
      } else {
        const payload: PagePayload = { mode, maxSteps, traceEvery, segments: mode === "script" ? (recorded ?? []) : undefined, jumpAtS, stopAtS, noDraw, obstaclesOnly };
        const run = (await frame.evaluate(`(${pageRun.toString()})(${JSON.stringify(payload)})`)) as Record<string, unknown>;
        Object.assign(session, run);
        if (mode === "policy" && n === 1 && Array.isArray(run.segments)) recorded = run.segments as Segment[];
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `kid-goku.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /kid-goku-beyond-the-clouds\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
