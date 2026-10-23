#!/usr/bin/env tsx
/**
 * tools/crayon-capture/roadster-hours — fixed-input playthrough of the ORIGINAL Roadster Hours (R-20 Phase B reference).
 * REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * The game's simulation is a pure function of the input it is given (sim-9N4wEPLA.js: R(state, input, 1/120)), and it
 * exposes a per-step input hook, `window.skybreakDemo.input(state)`. A pre-boot hook (roadster-hours-lib.ts HOOK_SOURCE)
 * installs that hook plus switchable virtual time; this tool clicks the real "Drive" control, then advances frames with
 * `__a3dVT.step` while a closed-loop policy (examples/roadster-hours-port/autopilot.ts, injected as source) answers each step.
 * The recorded per-step inputs are a run-length script; `--mode replay --script <file>` feeds it back open-loop.
 *
 *   node roadster-hours.mjs --mode policy --policy-file policy.js --session A --emit-markers --out /tmp/out \
 *        [--url <play url>] [--viewport 480x270] [--frame-ms 50] [--step-frames 12] [--max-frames 6000] [--launch-arg ...]
 *   node roadster-hours.mjs --mode replay --script script.json --session R1 --emit-markers --out /tmp/out
 * One JSON object is printed between `@@CRAYON_CAPTURE_BEGIN:<session>` / `@@CRAYON_CAPTURE_END:<session>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HOOK_SOURCE, NO_DRAW_SOURCE, STORAGE_SEED_SOURCE, type FinalState, type ScriptSegment, type SessionRecord } from "./roadster-hours-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; click: (selector: string, o: Record<string, unknown>) => Promise<void>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; evaluate: (expr: string) => Promise<unknown> }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> }

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const GAME_URL = "https://app.usecrayon.ai/play/0394c9e9-577c-4bfa-8baa-68860a3612fb";

async function findGameFrame(page: Page, timeoutMs: number): Promise<Frame> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const f of page.frames()) {
      try {
        if ((await f.evaluate(`typeof window.skybreak === "object" && !!window.skybreak.snapshot && window.skybreak.snapshot().screen`)) ) return f;
      } catch { /* frame navigating or evaluating slowly under software GL */ }
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("game frame (window.skybreak) never appeared");
}

const json = async <T>(f: Frame, expr: string): Promise<T> => JSON.parse((await f.evaluate(`JSON.stringify(${expr})`)) as string) as T;

async function main(): Promise<void> {
  const mode = (arg("--mode") ?? "policy") as "policy" | "replay" | "direct" | "ingame";
  const stopSteps = Number(arg("--stop-steps") ?? 0);
  const SIM_URL = arg("--sim-url") ?? "https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/0394c9e9-577c-4bfa-8baa-68860a3612fb/releases/20261021-halo-lighting-v11/assets/sim-9N4wEPLA.js";
  const session = arg("--session") ?? "A";
  const level = Number(arg("--level") ?? 0);
  if (level !== 0) throw new Error("only route 0 (Sunbreak Coast) starts from the home screen; other routes need career unlocks");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const [vw, vh] = (arg("--viewport") ?? "480x270").split("x").map(Number) as [number, number];
  const frameMs = Number(arg("--frame-ms") ?? 50);
  const stepFrames = Number(arg("--step-frames") ?? 12);
  const maxFrames = Number(arg("--max-frames") ?? 6000);
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1]!] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const noDraw = !process.argv.includes("--draw");
  let init = `${STORAGE_SEED_SOURCE};\n${HOOK_SOURCE}`;
  if (mode === "policy" || mode === "direct" || mode === "ingame") {
    const policy = fs.readFileSync(path.resolve(arg("--policy-file") ?? "policy.js"), "utf8");
    init += `\n${policy}\n;window.__rhPolicy = function (z) { return __rhPolicyMod.autopilot(z); };`;
  }
  const script = mode === "replay" ? (JSON.parse(fs.readFileSync(path.resolve(arg("--script") ?? "script.json"), "utf8")) as ScriptSegment[]) : null;

  const started = Date.now();
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const record: SessionRecord = {
    session, mode, level, steps: 0, segments: [], transitions: [], trace: [], final: null, menuTraffic: null, vehicles: null,
    virtualFrames: 0, wallMs: 0
  };
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    await context.addInitScript(init);
    const page = await context.newPage();
    if (mode === "direct") {
      // The ORIGINAL simulation module (same release the game loads), driven directly: no renderer, no game loop.
      await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 60000 });
      const text = (await page.evaluate(`(async function () {
        var sim = await import(${JSON.stringify(SIM_URL)});
        var career = sim.a(); career.unlocked = ${Math.max(level, 0)};
        var run = sim.i(${level}, career);
        var tr = run.traffic.map(function (t) { return { piece: t.piece, s: t.s, l: t.l, halfLen: t.halfLen, halfWid: t.halfWid, hgt: t.hgt, moving: t.moving }; });
        var cap = window.__rhCap; cap.mode = "policy"; cap.policy = window.__rhPolicy;
        var n = 0;
        while (run.phase !== "complete" && n < ${Number(arg("--max-steps") ?? 120 * 400)}) { var inp = window.skybreakDemo.input(run); sim.u(run, inp, ${1 / 120}, career); n++; }
        var r = career.results[run.level.id];
        return JSON.stringify({ traffic: tr, steps: cap.steps, segments: cap.segments, transitions: cap.transitions, trace: cap.trace,
          final: { screen: "direct", phase: run.phase, level: run.level.id, time: run.time, score: run.score, cells: run.cells.size, crashes: run.crashes,
            cleanLandings: run.cleanLandings, airRolls: run.airRolls, airSpins: run.airSpins, airFlips: run.airFlips, combos: run.combos,
            lineupsCleared: run.lineupsCleared, vehiclesCleared: run.vehiclesCleared, overTops: run.overTops, nearMisses: run.nearMisses,
            trailerRides: run.trailerRides, shortcuts: run.shortcuts, results: r ? (function(o){o[run.level.id]=r;return o;})({}) : {} } });
      })()`)) as string;
      const parsed = JSON.parse(text) as { traffic: unknown; steps: number; segments: ScriptSegment[]; transitions: SessionRecord["transitions"]; trace: SessionRecord["trace"]; final: FinalState };
      record.menuTraffic = parsed.traffic; record.steps = parsed.steps; record.segments = parsed.segments;
      record.transitions = parsed.transitions; record.trace = parsed.trace; record.final = parsed.final;
      await context.close();
    } else {
    await page.goto(arg("--url") ?? GAME_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    const frame = await findGameFrame(page, Number(arg("--load-wait-ms") ?? 420000));
    process.stderr.write(`[${session}] game frame ready at ${Date.now() - started} ms\n`);

    const menu = await json<{ screen: string; traffic: unknown; vehicles: number | null }>(frame, "(function(){var s=window.skybreak.snapshot();return {screen:s.screen,traffic:s.traffic,vehicles:s.vehicles}})()");
    record.menuTraffic = menu.traffic;
    record.vehicles = menu.vehicles;

    if (mode === "policy" || mode === "ingame") await frame.evaluate(`window.__rhCap.mode = "policy"; window.__rhCap.policy = window.__rhPolicy; 0`);
    else await frame.evaluate(`window.__rhCap.mode = "replay"; window.__rhCap.script = (function(){var out=[],s=${JSON.stringify(script)};for(var i=0;i<s.length;i++)for(var j=0;j<s[i].n;j++)out.push(s[i].input);return out})(); 0`);

    await frame.click(`button[data-action="start"][data-value="${level}"]`, { timeout: 240000 });
    await frame.evaluate(`window.__a3dVT.enable(); 0`);
    await page.waitForTimeout(3000);
    const playStarted = Date.now();
    for (;;) {
      const s = await json<{ screen: string }>(frame, "{screen:window.skybreak.snapshot().screen}");
      if (s.screen === "play") break;
      if (Date.now() - playStarted > 300000) throw new Error(`route never started (screen ${s.screen})`);
      await page.waitForTimeout(2000);
    }
    process.stderr.write(`[${session}] route running at ${Date.now() - started} ms\n`);
    if (noDraw) await frame.evaluate(NO_DRAW_SOURCE);

    let frames = 0;
    let lastLog = 0;
    for (;;) {
      const st = await json<{ screen: string; frames: number; steps: number; time: number }>(frame, `(function(){window.__a3dVT.step(${stepFrames}, ${frameMs});var s=window.skybreak.snapshot();return {screen:s.screen,frames:window.__a3dVT.frames,steps:window.__rhCap.steps,time:s.time}})()`);
      frames = st.frames;
      if (Date.now() - lastLog > 30000) { lastLog = Date.now(); process.stderr.write(`[${session}] frames=${frames} steps=${st.steps} t=${st.time.toFixed(1)} screen=${st.screen}\n`); }
      if (st.screen === "results") break;
      if (stopSteps > 0 && st.steps >= stopSteps) break;
      if (frames > maxFrames) throw new Error(`run did not finish within ${maxFrames} virtual frames (steps ${st.steps})`);
    }
    record.virtualFrames = frames;
    record.final = await json<FinalState>(frame, `(function(){var s=window.skybreak.snapshot();return {screen:s.screen,phase:s.phase,level:s.level,time:s.time,score:s.score,cells:s.cells,crashes:s.crashes,cleanLandings:s.cleanLandings,airRolls:s.airRolls,airSpins:s.airSpins,airFlips:s.airFlips,combos:s.combos,lineupsCleared:s.lineupsCleared,vehiclesCleared:s.vehiclesCleared,overTops:s.overTops,nearMisses:s.nearMisses,trailerRides:s.trailerRides,shortcuts:s.shortcuts,results:s.results}})()`);
    const cap = await json<{ steps: number; segments: ScriptSegment[]; transitions: SessionRecord["transitions"]; trace: SessionRecord["trace"] }>(frame, "(function(c){return {steps:c.steps,segments:c.segments,transitions:c.transitions,trace:c.trace}})(window.__rhCap)");
    record.steps = cap.steps;
    record.segments = cap.segments;
    record.transitions = cap.transitions;
    record.trace = cap.trace;
    await context.close();
    }
  } catch (e) {
    record.error = String((e as Error).message ?? e).slice(0, 400);
    process.stderr.write(`[${session}] ERROR ${record.error}\n`);
  } finally {
    record.wallMs = Date.now() - started;
    await browser.close();
  }
  const text = JSON.stringify(record);
  fs.writeFileSync(path.join(outDir, `roadster-hours.${session}.json`), text);
  if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${session}\n${text}\n@@CRAYON_CAPTURE_END:${session}\n`);
  if (record.error) process.exit(1);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
