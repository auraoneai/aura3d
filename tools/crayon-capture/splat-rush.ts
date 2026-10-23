#!/usr/bin/env tsx
/**
 * tools/crayon-capture/splat-rush: fixed-input reference capture of the ORIGINAL Splat Rush (R-20 / R-25).
 *
 * REMOTE RUN ONLY (serverless ACR Task; see evidence/crayon-capture/README.md). Per session it opens the
 * game page with `VT_HOOK_SOURCE` (virtual time, seeded `Math.random`, no audio) injected into the
 * sandboxed `about:srcdoc` frame, waits for the game to be ready, then steps the original one virtual
 * 1/60 s frame at a time: `input` sessions drive a closed-loop steering policy and record the input script
 * it produced, `replay` sessions replay that script, `idle` sessions start the run and never steer.
 * Each session is printed as base64 `@@SPLAT_CHUNK <id> <i> <n> <data>` lines (see `splat-rush-assemble.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_POLICY_PARAMS,
  POINTER_START_X,
  TRACE_FIELDS,
  encodeInputScript,
  expandSegments,
  parseInputScript,
  runLengthEncode,
  steerPolicy,
  vtHookSource,
  type PolicyParams,
  type SessionReport,
  type StepInput,
  type TraceRow
} from "./splat-rush-lib";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

type Frame = { evaluate: <T = unknown>(fn: string) => Promise<T>; url: () => string };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; screenshot: (o: Record<string, unknown>) => Promise<Buffer> };
type Context = { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> };
type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> };

/** In-page runner. `POLICY_FN` is `steerPolicy.toString()`. Plain ES5/ES2015, no outer references. */
function pageRunnerSource(): string {
  return `(function (POLICY_FN, TRACE_FIELDS, POINTER_START_X) {
  var vt = window.__a3dVt;
  var policy = (0, eval)("(" + POLICY_FN + ")");
  var PH = ["splash", "playing", "bursting", "gameOver"];
  var st = { x: POINTER_START_X, ye: 0, dragging: false, rowsPassed: 0, seen: [], rows: [], inputs: [], gateLog: [], hud: [], errors: [] };
  function press(type, cx) {
    window.dispatchEvent(new PointerEvent(type, { clientX: cx, clientY: 120, bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true }));
  }
  // The original re-registers a recycled gate/power-up object into these lists without removing the old
  // entry, so the same object appears several times: de-duplicate by identity.
  function visibleGates() {
    var arr = (window.__gameEntities && window.__gameEntities.obstacles) || [], out = [], seen = [];
    for (var i = 0; i < arr.length; i++) {
      var g = arr[i];
      if (g && g.parent && g.visible && seen.indexOf(g) < 0) { seen.push(g); out.push({ z: g.position.z, laneX: g.userData.laneX, colorIndex: g.userData.colorIndex, passed: !!g.userData.passed, x: g.position.x }); }
    }
    return out;
  }
  function visibleCollectibles() {
    var arr = (window.__gameEntities && window.__gameEntities.collectibles) || [], c = 0, seen = [];
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].parent && arr[i].visible && seen.indexOf(arr[i]) < 0) { seen.push(arr[i]); c++; }
    return c;
  }
  function sceneCounts() {
    var sc = window.__playlabsActiveScene, seg = 0, spl = 0;
    if (!sc) return [0, 0];
    sc.traverse(function (o) {
      if (!o.isGroup || !o.visible) return;
      if (o.userData && o.userData.index !== undefined) seg++;
      else if (o.userData && o.userData.targetScale !== undefined) spl++;
    });
    return [seg, spl];
  }
  function row(n) {
    var s = window.__getGameState(), p = window.__gameEntities.player, cam = window.__game && window.__game.camera;
    var sc = sceneCounts();
    return [n, s.score, s.distance, s.speed, s.lives, s.combo, s.multiplier, s.laneOffset, s.playerColorIndex, s.ballScale, s.rainbowTimer,
      s.shieldActive ? 1 : 0, s.scoreX2Timer, PH.indexOf(s.phase), s.squashT, s.shakeTimer, s.milestone, vt.rngCount(),
      p.position.x, p.position.y, p.position.z, cam ? cam.position.x : 0, cam ? cam.position.y : 0, cam ? cam.position.z : 0,
      visibleGates().length, visibleCollectibles(), sc[1], sc[0]];
  }
  function noteRows(gates) {
    var fresh = false;
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      if (g.passed && st.seen.indexOf(g.z.toFixed(6) + ":" + g.laneX) < 0) { st.seen.push(g.z.toFixed(6) + ":" + g.laneX); fresh = true; }
    }
    if (fresh) st.rowsPassed++;
  }
  function applyInput(inp) {
    var phase = window.__getGameState().phase;
    if (inp.start || inp.down) { press("pointerdown", st.x); if (phase !== "splash") st.dragging = true; }
    if (inp.dx) {
      st.x += inp.dx; press("pointermove", st.x);
      if (st.dragging && window.__getGameState().phase === "playing") {
        st.ye = Math.max(-3, Math.min(3, st.ye + 0.012 * inp.dx * (10 / 6)));
      }
    }
    if (inp.up) { press("pointerup", st.x); st.dragging = false; }
  }
  window.__a3dRun = {
    begin: function (warmup) {
      for (var i = 0; i < warmup; i++) vt.step();
      var s = window.__getGameState();
      st.rows = [row(0)];
      return JSON.stringify({ K: vt.preGameDraws(), phase: s.phase, queued: vt.queued(), n: vt.n(), errors: window.__a3dVtErrors || [] });
    },
    run: function (mode, count, payload) {
      var params = payload && payload.params, inputs = payload && payload.inputs;
      for (var k = 0; k < count; k++) {
        var idx = st.inputs.length, inp;
        if (mode === "script") inp = inputs[idx] || { start: false, down: false, up: false, dx: 0 };
        else if (mode === "idle") inp = idx === 0 ? { start: true, down: false, up: false, dx: 0 } : idx === 1 ? { start: false, down: true, up: false, dx: 0 } : { start: false, down: false, up: false, dx: 0 };
        else {
          if (idx === 0) inp = { start: true, down: false, up: false, dx: 0 };
          else if (idx === 1) inp = { start: false, down: true, up: false, dx: 0 };
          else {
            var s0 = window.__getGameState(), gates = visibleGates();
            var dx = policy({ phase: s0.phase, playerColorIndex: s0.playerColorIndex, rainbow: !!(s0.isRainbowActive), laneOffset: s0.laneOffset, ye: st.ye, gates: gates, rowsPassed: st.rowsPassed }, params);
            inp = { start: false, down: false, up: false, dx: dx };
          }
        }
        applyInput(inp);
        st.inputs.push(inp);
        vt.step();
        var gts = visibleGates();
        noteRows(gts);
        st.rows.push(row(st.inputs.length));
        if (st.inputs.length % 30 === 0) {
          st.gateLog.push({ n: st.inputs.length, gates: gts.map(function (g) { return [g.z, g.laneX, g.colorIndex, g.passed ? 1 : 0, g.x]; }) });
          var hs = document.getElementById("hud-score"); st.hud.push({ n: st.inputs.length, score: hs ? hs.textContent : null, combo: (document.getElementById("hud-combo") || {}).textContent || "" });
        }
      }
      return st.inputs.length;
    },
    result: function () {
      var s = window.__getGameState();
      return JSON.stringify({ rows: st.rows, inputs: st.inputs, gateLog: st.gateLog, hud: st.hud, rowsPassed: st.rowsPassed, endPhase: s.phase, errors: window.__a3dVtErrors || [], traceFields: TRACE_FIELDS });
    }
  };
  return true;
})`;
}

/** ACR truncates log lines near 4 KB, so a session is emitted as `@@SPLAT_CHUNK <id> <i> <n> <base64>` lines. */
function emitChunked(id: string, json: string): void {
  const b64 = Buffer.from(json, "utf8").toString("base64");
  const size = 2400;
  const n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SPLAT_CHUNK ${id} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}\n`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    for (const f of page.frames()) {
      if (f.url() !== "about:srcdoc") continue;
      try {
        const ok = await f.evaluate<boolean>(
          `typeof window.__getGameState === "function" && !!window.__gameEntities && !!window.__gameEntities.player && !!window.__a3dVt && !!window.__game && !!window.__game.ui`
        );
        if (ok) return f;
      } catch {
        /* navigating or main thread busy */
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function runSession(
  browser: Browser,
  opts: { url: string; kind: SessionReport["kind"]; id: string; seed: number; steps: number; warmup: number; viewport: { width: number; height: number }; waitMs: number; params: PolicyParams; script: StepInput[] | null; chunk: number }
): Promise<{ report: SessionReport; extra: Record<string, unknown> }> {
  const context = await browser.newContext({ viewport: opts.viewport });
  const base: SessionReport = { id: opts.id, kind: opts.kind, ok: false, trace: [], preGameDraws: -1, readyFrame: opts.warmup, scriptRepr: "", endPhase: "splash", endScore: 0, endDistance: 0, endLives: 0 };
  try {
    await context.addInitScript(vtHookSource(opts.seed));
    const page = await context.newPage();
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const frame = await findGameFrame(page, opts.waitMs);
    if (!frame) return { report: { ...base, error: "game frame not ready" }, extra: { frames: page.frames().map((f) => f.url()) } };
    await frame.evaluate(`(${pageRunnerSource()})(${JSON.stringify(steerPolicy.toString())}, ${JSON.stringify(TRACE_FIELDS)}, ${POINTER_START_X})`);
    const begun = JSON.parse(await frame.evaluate<string>(`window.__a3dRun.begin(${opts.warmup})`)) as { K: number; phase: string };
    base.preGameDraws = begun.K;
    if (begun.phase !== "splash") return { report: { ...base, error: `expected splash phase after warm-up, got ${begun.phase}` }, extra: { begun } };
    const payload = JSON.stringify({ params: opts.params, inputs: opts.script });
    const mode = opts.kind === "replay" ? "script" : opts.kind === "idle" ? "idle" : "policy";
    let done = 0;
    while (done < opts.steps) {
      const n = Math.min(opts.chunk, opts.steps - done);
      done = await frame.evaluate<number>(`window.__a3dRun.run(${JSON.stringify(mode)}, ${n}, ${payload})`);
      process.stdout.write(`[splat-rush] ${opts.id} step ${done}/${opts.steps}\n`);
    }
    const result = JSON.parse(await frame.evaluate<string>("window.__a3dRun.result()")) as {
      rows: TraceRow[]; inputs: StepInput[]; gateLog: unknown[]; hud: unknown[]; rowsPassed: number; endPhase: SessionReport["endPhase"]; errors: string[];
    };
    const last = result.rows[result.rows.length - 1] as TraceRow;
    const col = (name: string): number => last[TRACE_FIELDS.indexOf(name as (typeof TRACE_FIELDS)[number])] as number;
    return {
      report: {
        ...base,
        ok: result.errors.length === 0,
        error: result.errors.length ? result.errors.join(" | ") : undefined,
        trace: result.rows,
        scriptRepr: encodeInputScript(runLengthEncode(result.inputs)),
        endPhase: result.endPhase,
        endScore: col("score"),
        endDistance: col("distance"),
        endLives: col("lives")
      },
      extra: { gateLog: result.gateLog, hud: result.hud, rowsPassed: result.rowsPassed }
    };
  } catch (e) {
    return { report: { ...base, error: String(e).slice(0, 400) }, extra: {} };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "splat-rush");
  if (!game?.url) throw new Error("splat-rush missing from manifest");
  const plan = (arg("--plan") ?? "input,replay,idle").split(",").filter(Boolean) as SessionReport["kind"][];
  const runId = arg("--run-id") ?? "A";
  const steps = Number(arg("--steps") ?? 1500);
  const warmup = Number(arg("--warmup") ?? 30);
  const seed = Number(arg("--seed") ?? 20261023);
  const [vw, vh] = (arg("--viewport") ?? "480x270").split("x").map(Number) as [number, number];
  const params = { ...DEFAULT_POLICY_PARAMS, ...(arg("--params") ? JSON.parse(arg("--params") as string) : {}) } as PolicyParams;
  // plain flags avoid JSON quoting inside ACR task YAML
  if (arg("--max-dx")) params.maxDx = Number(arg("--max-dx"));
  if (arg("--aim-offset")) params.aimOffset = Number(arg("--aim-offset"));
  if (arg("--mistake-rows") !== undefined) params.mistakeRows = (arg("--mistake-rows") as string).split(",").filter(Boolean).map(Number);
  const waitMs = Number(arg("--wait-ms") ?? 240000);
  const chunk = Number(arg("--chunk") ?? 100);
  const markers = process.argv.includes("--emit-markers");
  const scriptFile = arg("--script-file");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  fs.mkdirSync(outDir, { recursive: true });

  let script: StepInput[] | null = scriptFile ? expandSegments(parseInputScript(fs.readFileSync(scriptFile, "utf8"))) : null;
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let i = 0; i < plan.length; i++) {
      const kind = plan[i] as SessionReport["kind"];
      if (kind === "replay" && !script) {
        process.stderr.write("[splat-rush] replay requested before any input session produced a script; skipping\n");
        continue;
      }
      const id = `${runId}${i + 1}-${kind}`;
      const { report, extra } = await runSession(browser, { url: game.url, kind, id, seed, steps, warmup, viewport: { width: vw, height: vh }, waitMs, params, script, chunk });
      if (kind === "input" && report.ok && !script) script = expandSegments(parseInputScript(report.scriptRepr));
      const payload = { schema: "a3d-crayon-capture-session/1", game: "splat-rush", runId, seed, steps, warmup, viewport: { width: vw, height: vh }, params, capturedAt: new Date().toISOString(), session: report, extra };
      const json = JSON.stringify(payload);
      fs.writeFileSync(path.join(outDir, `splat-rush.${id}.json`), json);
      if (markers) emitChunked(id, json);
      process.stdout.write(`[splat-rush] ${id} ok=${report.ok} phase=${report.endPhase} score=${report.endScore} lives=${report.endLives}${report.error ? ` error=${report.error}` : ""}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
