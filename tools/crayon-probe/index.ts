#!/usr/bin/env tsx
/**
 * tools/crayon-probe — Crayon Arcade runtime probe (threejs-parity §9, lane L10).
 *
 * Records P-1..P-4 for a Crayon game from LIVE scene objects:
 *
 *   P-1  node materials — live materials that are NodeMaterials with
 *        fragmentNode/colorNode/positionNode set.
 *   P-2  isBatchedMesh — live BatchedMesh objects in the captured scenes.
 *   P-3  pipeline — EffectComposer / r186 PostProcessing reachable from the
 *        window or renderer, plus postprocessing-module resource signals.
 *   P-4  shader materials — isShaderMaterial / isRawShaderMaterial counts.
 *
 * Scene discovery (R-01 fix). The previous probe `import("three")`ed inside the
 * frame and matched `Runtime.queryObjects` prototypes against the game's
 * objects. That silently returns 0 whenever the prototype comes from another
 * module record (inlined/bundled three, a second copy, or a frame whose
 * execution-context hunt failed — 9 of 10 recorded runs reported
 * `contextFound:false`). It also loaded `three/webgpu` and the
 * EffectComposer addon itself and called `getContext("webgl2")` on the game
 * canvas, polluting the very signals it was reading.
 *
 * Now a hook is injected BEFORE any game script runs (`context.addInitScript`,
 * i.e. `Page.addScriptToEvaluateOnNewDocument` auto-attached into every frame
 * including the sandboxed `about:srcdoc` game iframe). It owns
 * `window.__THREE_DEVTOOLS__`, the event bus three.js dispatches `observe` on
 * from the `Scene`, `WebGLRenderer` and `WebGPURenderer` constructors, so the
 * probe holds the game's own live Scene/renderer objects. The scan then runs
 * in that frame's main world; no execution-context ids, no prototype matching.
 * See `inpage.ts` for the injected sources and `verdicts.ts` for the rules
 * (`no` is only emitted when the question was actually asked).
 *
 * Heap snapshot is kept as corroboration only; it never decides a verdict.
 *
 * ── REMOTE RUN ONLY ────────────────────────────────────────────────────────
 * This tool drives a real browser against live Crayon endpoints — per the
 * repo's remote-first rule it must run remotely (serverless ACR Tasks / CodeBuild
 * or the remote runner), never as local Playwright on the Mac:
 *     pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
 *       --manifest tools/crayon-probe/games.json --emit-markers
 * Output lands at evidence/crayon-probes/<game>.json (or the `--out` dir); with
 * `--emit-markers` each report is also printed between
 * `@@CRAYON_PROBE_BEGIN:<id>` / `@@CRAYON_PROBE_END:<id>` lines so a serverless
 * job's log stream can be turned back into evidence files.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * CLI:
 *   --game <id>          probe one game (requires --url or manifest entry)
 *   --url <url>          play-page URL for --game
 *   --manifest <path>    JSON manifest { games: [{ id, url? }] }
 *   --only <id[,id]>     restrict a manifest run to these ids
 *   --wait-ms <ms>       max time to wait for a populated scene (default 30000)
 *   --settle-ms <ms>     scene object count must hold within 3% this long (default 4000)
 *   --no-click-start     do not try to click "Tap to start"
 *   --plateau-ms <ms>    churning/streaming worlds: count within --plateau-pct of its max this long, while rendering, counts as settled (default 15000)
 *   --plateau-pct <f>    plateau tolerance as a fraction (default 0.08)
 *   --viewport <WxH>     browser viewport (default 1440x1000; software-GL runners starve heavy games, try 800x450)
 *   --screenshot-dir <d> write a post-wait PNG per game
 *   --no-heap            skip the heap snapshot corroboration
 *   --out <dir>          output dir (default evidence/crayon-probes)
 *   --stdout             also print the report JSON
 *   --emit-markers       print each report between BEGIN/END marker lines
 *   --connect <url>      attach to an existing CDP endpoint instead of launching
 *   --channel <name>     playwright channel
 *   --headed             launch headed (default headless)
 *   --launch-arg <arg>   extra chromium launch arg (repeatable)
 * Env: CRAYON_PROBE_ROOT — directory whose node_modules provides `playwright`
 *   (defaults to the repo root; set it when the tool is bundled elsewhere).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CLICK_START_SOURCE, GAME_STATE_SOURCE, HOOK_SOURCE, LIST_CONTROLS_SOURCE, SAMPLE_SOURCE, SCAN_SOURCE } from "./inpage.js";
import { chooseStartControl, downsample, settleStatus, type Control, type Sample, type SettleCriterion } from "./startControl.js";
import { buildVerdicts, type ProbeAnswer, type ProbeEvidence } from "./verdicts.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromRepo = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? repoRoot, "package.json"));
const { chromium } = requireFromRepo("playwright") as {
  chromium: {
    launch: (opts: Record<string, unknown>) => Promise<Browser>;
    connectOverCDP: (endpoint: string) => Promise<Browser>;
  };
};

// Minimal playwright types (tool runs un-built; keep local shapes).
type Browser = { newContext: (o: Record<string, unknown>) => Promise<BrowserContext>; close: () => Promise<void>; contexts: () => BrowserContext[] };
type BrowserContext = {
  newPage: () => Promise<Page>;
  newCDPSession: (o: Page | Frame) => Promise<CdpSession>;
  addInitScript: (script: string) => Promise<void>;
  pages: () => Page[];
  close: () => Promise<void>;
};
type Locator = { click: (o?: Record<string, unknown>) => Promise<void> };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; url: () => string; on: (ev: string, cb: (e: unknown) => void) => void; keyboard: { press: (k: string) => Promise<void> }; screenshot: (o: Record<string, unknown>) => Promise<unknown> };
type Frame = { evaluate: (fn: string) => Promise<unknown>; url: () => string; locator: (selector: string) => Locator };
type CdpSession = { send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>; on: (ev: string, cb: (p: Record<string, unknown>) => void) => void; detach: () => Promise<void> };

// ── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  readonly game?: string;
  readonly url?: string;
  readonly manifest?: string;
  readonly only?: readonly string[];
  readonly waitMs: number;
  readonly settleMs: number;
  readonly plateauMs: number;
  readonly plateauPct: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly screenshotDir?: string;
  readonly clickStart: boolean;
  readonly heap: boolean;
  readonly outDir: string;
  readonly stdout: boolean;
  readonly emitMarkers: boolean;
  readonly cdpEndpoint?: string;
  readonly channel?: string;
  readonly headed?: boolean;
  readonly launchArgs: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const out: Record<string, string | boolean | number | undefined | string[] | { width: number; height: number }> = {
    waitMs: 30000,
    settleMs: 4000,
    plateauMs: 15000,
    plateauPct: 0.08,
    viewport: { width: 1440, height: 1000 },
    clickStart: true,
    heap: true,
    outDir: path.join(repoRoot, "evidence", "crayon-probes"),
    launchArgs: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--game": out.game = next(); break;
      case "--url": out.url = next(); break;
      case "--manifest": out.manifest = next(); break;
      case "--only": out.only = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--wait-ms": out.waitMs = Number(next()); break;
      case "--settle-ms": out.settleMs = Number(next()); break;
      case "--plateau-ms": out.plateauMs = Number(next()); break;
      case "--plateau-pct": out.plateauPct = Number(next()); break;
      case "--viewport": {
        const m = /^(\d+)x(\d+)$/.exec(String(next()));
        if (!m) { console.error("--viewport expects WxH, e.g. 800x450"); process.exit(2); }
        out.viewport = { width: Number(m[1]), height: Number(m[2]) };
        break;
      }
      case "--screenshot-dir": out.screenshotDir = path.resolve(String(next())); break;
      case "--no-click-start": out.clickStart = false; break;
      case "--no-heap": out.heap = false; break;
      case "--out": out.outDir = path.resolve(String(next())); break;
      case "--stdout": out.stdout = true; break;
      case "--emit-markers": out.emitMarkers = true; break;
      case "--connect": out.cdpEndpoint = next(); break;
      case "--channel": out.channel = next(); break;
      case "--headed": out.headed = true; break;
      case "--launch-arg": out.launchArgs = [...(out.launchArgs as string[] | undefined ?? []), next()]; break;
      default:
        if (a?.startsWith("--")) throw new Error(`unknown arg ${a}`);
    }
  }
  return out as unknown as Args;
}

// ── heap snapshot (corroboration only) ──────────────────────────────────────

const HEAP_CLASS_PATTERNS: Readonly<Record<string, RegExp>> = {
  BatchedMesh: /"BatchedMesh"/,
  NodeMaterial: /"[A-Za-z]*NodeMaterial"/,
  ShaderMaterial: /"ShaderMaterial"/,
  RawShaderMaterial: /"RawShaderMaterial"/,
  EffectComposer: /"EffectComposer"/,
  PostProcessing: /"PostProcessing"/,
  WebGLRenderer: /"WebGLRenderer"/,
  WebGPURenderer: /"WebGPURenderer"/,
  InstancedMesh: /"InstancedMesh"/,
  PMREMGenerator: /"PMREMGenerator"/,
  CSM: /"CSM"/
};

async function heapClassCounts(cdp: CdpSession): Promise<{ readonly counts: Record<string, number>; readonly bytes: number; readonly error?: string }> {
  const chunks: string[] = [];
  cdp.on("HeapProfiler.addHeapSnapshotChunk", (p) => {
    if (typeof p.chunk === "string") chunks.push(p.chunk);
  });
  try {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, exposeInternals: false, exposeNumericValues: false });
  } catch (e) {
    return { counts: {}, bytes: 0, error: String(e).slice(0, 200) };
  } finally {
    try { await cdp.send("HeapProfiler.disable"); } catch { /* ignore */ }
  }
  const counts: Record<string, number> = {};
  for (const [name, re] of Object.entries(HEAP_CLASS_PATTERNS)) {
    let n = 0;
    for (const chunk of chunks) for (const _m of chunk.matchAll(new RegExp(re.source, "g"))) n++;
    counts[name] = n;
  }
  return { counts, bytes: chunks.reduce((a, c) => a + c.length, 0) };
}

// ── scene discovery ─────────────────────────────────────────────────────────

interface HookState { readonly scenes: number; readonly renderers: number; readonly renderCalls: number }

const HOOK_STATE_SOURCE = `(function () {
  var h = window.__a3dHook;
  if (!h) return null;
  var calls = 0;
  for (var i = 0; i < h.renderers.length; i++) calls += h.renderers[i].renderCalls;
  return { scenes: h.scenes.length, renderers: h.renderers.length, renderCalls: calls };
})()`;

async function hookStates(page: Page): Promise<readonly { readonly frame: Frame; readonly index: number; readonly state: HookState | null }[]> {
  const frames = page.frames();
  const out: { frame: Frame; index: number; state: HookState | null }[] = [];
  for (let i = 0; i < frames.length; i++) {
    let state: HookState | null = null;
    try {
      state = (await frames[i].evaluate(HOOK_STATE_SOURCE)) as HookState | null;
    } catch {
      state = null;
    }
    out.push({ frame: frames[i], index: i, state });
  }
  return out;
}

const hookScore = (s: HookState | null): number => (s ? s.scenes * 1000 + s.renderCalls + s.renderers : -1);

interface WaitResult {
  readonly clicked: string | null;
  readonly clickMethod: string | null;
  readonly clickSequence: readonly { readonly label: string; readonly method: string; readonly t: number }[];
  readonly gameState: { readonly hooks?: readonly string[]; readonly state?: string; readonly error?: string } | null;
  readonly gameStateLater: { readonly state?: string } | null;
  readonly clickAttempts: number;
  readonly noStartControl: boolean;
  readonly waitedMs: number;
  readonly settled: boolean;
  readonly criterion: SettleCriterion | null;
  readonly settleDetail: string;
  readonly peakObjects: number;
  readonly samples: readonly Sample[];
  readonly controlsFirst: readonly Control[];
  readonly controlsLast: readonly Control[];
  readonly controlsAfterStart: readonly Control[];
  readonly hudText: string | null;
  readonly evalMsMedian: number;
  readonly evalMsMax: number;
}

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function listControls(frames: readonly Frame[]): Promise<readonly { readonly frame: Frame; readonly controls: readonly Control[] }[]> {
  const out: { frame: Frame; controls: readonly Control[] }[] = [];
  for (const frame of frames) {
    try {
      const controls = (await frame.evaluate(LIST_CONTROLS_SOURCE)) as Control[] | null;
      if (controls && controls.length > 0) out.push({ frame, controls });
    } catch { /* frame navigating or detached */ }
  }
  return out;
}

// Wait until the game's scene graph stops growing. A menu/title scene (e.g. HEATSINK: 9 objects) is created
// long before the gameplay scene, so "a scene exists" is not enough: pick the start control (real pointer
// click), then require the object count to settle. Strict = within 3% for `settleMs`; plateau = within
// `plateauPct` of the max over `plateauMs` while the renderer is still drawing (streaming worlds never hold
// still). Every evaluate is timed: on a software-GL runner a heavy game can starve the page's main thread, and
// that latency is the evidence for why a click or probe "times out".
async function waitForPopulatedScene(page: Page, args: Args): Promise<WaitResult> {
  const started = Date.now();
  let clicked: string | null = null;
  let clickMethod: string | null = null;
  let clickedAtT = -1;
  let clickAttempts = 0;
  let lastClickAttempt = 0;
  let noStartControl = false;
  const tried = new Set<string>();
  const failures = new Map<string, number>();
  const clickSequence: { label: string; method: string; t: number }[] = [];
  let awaitingNext = false;
  const samples: Sample[] = [];
  const evalMs: number[] = [];
  let controlsFirst: readonly Control[] = [];
  let controlsLast: readonly Control[] = [];
  let peak = 0;
  let verdict = { settled: false, criterion: null as SettleCriterion | null, detail: "no populated scene" };
  const timed = async <T>(fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await fn(); } finally { evalMs.push(Date.now() - t0); }
  };
  while (Date.now() - started < args.waitMs) {
    const states = await timed(() => hookStates(page));
    const best = states.reduce((m, s) => (hookScore(s.state) > hookScore(m.state) ? s : m), states[0]);
    if (best && best.state && best.state.scenes >= 1 && best.state.renderCalls >= 1) {
      let sample: { objects: number; renderCalls: number } | null = null;
      try { sample = (await timed(() => best.frame.evaluate(SAMPLE_SOURCE))) as { objects: number; renderCalls: number } | null; } catch { sample = null; }
      if (sample) {
        samples.push({ t: Date.now() - started, objects: sample.objects, renderCalls: sample.renderCalls });
        peak = Math.max(peak, sample.objects);
      }
      const stepsDone = clickSequence.length;
      const gap = stepsDone > 0 ? 6000 : 2500;
      if (args.clickStart && !noStartControl && clickAttempts < 14 && stepsDone < 4 && Date.now() - lastClickAttempt > gap) {
        lastClickAttempt = Date.now();
        clickAttempts++;
        const listed = await timed(() => listControls(page.frames()));
        const all = listed.flatMap((l) => l.controls);
        if (controlsFirst.length === 0) controlsFirst = all;
        controlsLast = all;
        // Hooked game frame first, then the rest.
        const frames = page.frames();
        const ordered = [...listed].sort((a, b) => Number(b.frame === best.frame) - Number(a.frame === best.frame));
        let stepClicked = false;
        for (const { frame, controls } of ordered) {
          const fi = frames.indexOf(frame);
          const triedHere = new Set([...tried].filter((k) => k.startsWith(`${fi}:`)).map((k) => Number(k.split(":")[1])));
          const pick = chooseStartControl(controls, triedHere);
          if (!pick) continue;
          const key = `${fi}:${pick.index}`;
          const locator = frame.locator(`[data-a3d-ctl="${pick.index}"]`);
          let method: string | null = null;
          try { await locator.click({ timeout: 8000 }); method = "locator-click"; } catch {
            try { await locator.click({ timeout: 8000, force: true }); method = "locator-click-force"; } catch { /* retry next cycle */ }
          }
          if (method) {
            tried.add(key);
            clickSequence.push({ label: pick.text, method, t: Date.now() - started });
            clicked ??= pick.text;
            clickMethod ??= method;
            clickedAtT = Date.now() - started;
            stepClicked = true;
            break;
          }
          failures.set(key, (failures.get(key) ?? 0) + 1);
          if ((failures.get(key) ?? 0) >= 2) tried.add(key); // one retry, then move on
        }
        if (!stepClicked && stepsDone === 0) {
          for (const s of states) {
            if (!s.state) continue;
            try {
              const label = (await timed(() => s.frame.evaluate(CLICK_START_SOURCE))) as string | null;
              if (label) { clicked = label; clickMethod = "dom-click"; clickSequence.push({ label, method: "dom-click", t: Date.now() - started }); clickedAtT = Date.now() - started; stepClicked = true; break; }
            } catch { /* frame navigating */ }
          }
        }
        if (!stepClicked && stepsDone === 0 && clickAttempts === 3) {
          // Title screens that wait for any key rather than a button.
          try { await page.keyboard.press("Enter"); clickMethod ??= "key-enter"; } catch { /* ignore */ }
        }
        if (!stepClicked && stepsDone === 0 && clickAttempts >= 4 && all.length === 0) noStartControl = true;
        // After a click, the next cycle looks for a follow-up step; none found means the start flow is over.
        awaitingNext = stepClicked;
      }
      const startResolved = (!args.clickStart || clicked !== null || noStartControl || clickAttempts >= 14) && !awaitingNext;
      if (startResolved) {
        const relevant = clickedAtT >= 0 ? samples.filter((x) => x.t >= clickedAtT) : samples;
        verdict = settleStatus(relevant, { settleMs: args.settleMs, strictPct: 0.03, plateauMs: args.plateauMs, plateauPct: args.plateauPct });
        if (verdict.settled) break;
      }
    }
    await page.waitForTimeout(500);
  }
  if (controlsLast.length === 0 && controlsFirst.length > 0) controlsLast = controlsFirst;
  // Proof the start control did something: re-list the visible controls and read the game frame's text
  // after the wait. Time-boxed because a starved main thread can block an evaluate for a minute.
  let controlsAfterStart: readonly Control[] = [];
  let hudText: string | null = null;
  let gameState: WaitResult["gameState"] = null;
  let gameStateLater: WaitResult["gameStateLater"] = null;
  if (clicked || noStartControl) {
    const within = async <T>(p: Promise<T>, fallback: T): Promise<T> =>
      Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 20000))]).catch(() => fallback);
    const after = await within(listControls(page.frames()), []);
    controlsAfterStart = after.flatMap((l) => l.controls);
    const states = await within(hookStates(page), []);
    const gameFrame = states.reduce<{ frame: Frame; state: HookState | null } | undefined>((m, s) => (!m || hookScore(s.state) > hookScore(m.state) ? s : m), undefined);
    if (gameFrame) {
      gameState = await within(gameFrame.frame.evaluate(GAME_STATE_SOURCE) as Promise<WaitResult["gameState"]>, null);
      await page.waitForTimeout(5000);
      gameStateLater = await within(gameFrame.frame.evaluate(GAME_STATE_SOURCE) as Promise<WaitResult["gameStateLater"]>, null);
      hudText = (await within(gameFrame.frame.evaluate("(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 400)") as Promise<string | null>, null)) ?? null;
    }
  }
  return {
    clicked, clickMethod, clickSequence, gameState, gameStateLater, clickAttempts, noStartControl,
    waitedMs: Date.now() - started,
    settled: verdict.settled, criterion: verdict.criterion, settleDetail: verdict.detail,
    peakObjects: peak,
    samples: downsample(samples, 120),
    controlsFirst, controlsLast, controlsAfterStart, hudText,
    evalMsMedian: median(evalMs), evalMsMax: evalMs.length ? Math.max(...evalMs) : 0
  };
}

// ── probe one game ──────────────────────────────────────────────────────────

interface ProbeReport {
  readonly schema: "a3d-crayon-probe/2";
  readonly game: string;
  readonly url: string;
  readonly probedAt: string;
  readonly frame: Record<string, unknown>;
  readonly dom: Record<string, unknown>;
  readonly module: Record<string, unknown>;
  readonly heap: Record<string, number>;
  readonly heapMeta?: Record<string, unknown>;
  readonly liveObjects: Record<string, unknown>;
  readonly probes: {
    readonly p1_nodeMaterials: ProbeAnswer;
    readonly p2_batchedMesh: ProbeAnswer;
    readonly p3_pipeline: ProbeAnswer;
    readonly p4_shaderMaterials: ProbeAnswer;
  };
  readonly errors: readonly string[];
}

type ScanResult = Record<string, unknown> & { hookInstalled: boolean };

async function probeGame(page: Page, context: BrowserContext, args: Args, game: string, url: string, errors: string[]): Promise<ProbeReport> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  const wait = await waitForPopulatedScene(page, args);
  if (args.screenshotDir) {
    try {
      fs.mkdirSync(args.screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(args.screenshotDir, `${game}.png`), fullPage: false });
    } catch (e) { errors.push(`screenshot:${String(e).slice(0, 120)}`); }
  }

  const states = await hookStates(page);
  const hooked = states.filter((s) => s.state !== null);
  const best = states.reduce((m, s) => (hookScore(s.state) > hookScore(m.state) ? s : m), states[0]);
  if (!best) throw new Error("page has no frames");

  let scan: ScanResult = { hookInstalled: false };
  if (best.state) {
    try {
      scan = (await best.frame.evaluate(SCAN_SOURCE)) as ScanResult;
    } catch (e) {
      errors.push(`scan:${String(e).slice(0, 160)}`);
    }
  } else {
    errors.push("hook:no frame reported window.__a3dHook (init script did not run in any frame)");
  }

  // Heap snapshot — corroboration only; needs a session on the game frame's process.
  let heapCounts: Record<string, number> = {};
  let heapBytes = 0;
  let heapTarget: "frame" | "page" | "none" = "none";
  if (args.heap && best.state) {
    let session: CdpSession | undefined;
    try {
      session = await context.newCDPSession(best.frame);
      heapTarget = "frame";
    } catch {
      // Same-process srcdoc frames have no session of their own: the page session shares their heap.
      try {
        session = await context.newCDPSession(page);
        heapTarget = "page";
      } catch (e) {
        errors.push(`heap-session:${String(e).slice(0, 140)}`);
      }
    }
    if (session) {
      const heap = await Promise.race([
        heapClassCounts(session),
        new Promise<{ counts: Record<string, number>; bytes: number; error: string }>((resolve) => setTimeout(() => resolve({ counts: {}, bytes: 0, error: "heap snapshot timed out after 90s" }), 90000))
      ]);
      heapCounts = heap.counts;
      heapBytes = heap.bytes;
      if (heap.error) errors.push(`heap:${heap.error}`);
      await session.detach().catch(() => undefined);
    }
  }

  const evidence: ProbeEvidence = {
    hookInstalled: scan.hookInstalled === true,
    traversal: scan.traversal as ProbeEvidence["traversal"],
    pipelines: scan.pipelines as ProbeEvidence["pipelines"],
    resourceSignals: scan.resourceSignals as ProbeEvidence["resourceSignals"],
    importmapHasWebgpu: scan.importmapHasWebgpu === true,
    renderers: scan.renderers as ProbeEvidence["renderers"],
    heap: heapCounts,
    heapBytes
  };
  const verdicts = buildVerdicts(evidence);
  const pipelines = (scan.pipelines ?? {}) as { composers?: number; postProcessing?: number; composerPasses?: unknown[] };

  return {
    schema: "a3d-crayon-probe/2",
    game,
    url,
    probedAt: new Date().toISOString(),
    frame: {
      index: best.index,
      url: best.frame.url(),
      framesWithHook: hooked.length,
      totalFrames: states.length,
      waitedMs: wait.waitedMs,
      sceneSettled: wait.settled,
      settleCriterion: wait.criterion,
      settleDetail: wait.settleDetail,
      clickedStart: wait.clicked,
      clickMethod: wait.clickMethod,
      clickSequence: wait.clickSequence,
      gameStateAfterStart: wait.gameState,
      gameStateFiveSecondsLater: wait.gameStateLater,
      clickAttempts: wait.clickAttempts,
      noStartControl: wait.noStartControl,
      peakObjects: wait.peakObjects,
      evalMs: { median: wait.evalMsMedian, max: wait.evalMsMax },
      viewport: args.viewport,
      objectSamples: wait.samples,
      controlsFirstSeen: wait.controlsFirst.slice(0, 40),
      controlsLastSeen: wait.controlsLast.slice(0, 40),
      controlsAfterStart: wait.controlsAfterStart.slice(0, 40),
      hudTextAfterStart: wait.hudText,
      pickReason: best.state ? `highest hook score (scenes=${best.state.scenes} renderers=${best.state.renderers} renderCalls=${best.state.renderCalls})` : "no frame had the hook"
    },
    dom: { title: scan.title ?? null, canvases: scan.canvases ?? [], canvasContexts: scan.canvasContexts ?? null },
    module: {
      revisions: scan.revisions ?? [],
      threeGlobal: scan.threeGlobal ?? null,
      importmap: scan.importmap ?? null,
      importmapHasWebgpu: scan.importmapHasWebgpu ?? null,
      resourceSignals: scan.resourceSignals ?? null
    },
    heap: heapCounts,
    heapMeta: { bytes: heapBytes, session: heapTarget },
    liveObjects: {
      contextFound: scan.hookInstalled === true,
      hookInstalled: scan.hookInstalled === true,
      observedEvents: scan.observed ?? 0,
      scenes: scan.scenes ?? 0,
      renderedScenes: scan.renderedScenes ?? 0,
      renderers: scan.renderers ?? [],
      sceneTraversal: scan.traversal ?? null,
      renderedSceneTraversal: scan.renderedTraversal ?? null,
      effectComposers: pipelines.composers ?? 0,
      postProcessingInstances: pipelines.postProcessing ?? 0,
      composerPasses: pipelines.composerPasses ?? [],
      pipelineWalk: scan.pipelines ?? null,
      hookErrors: scan.hookErrors ?? []
    },
    probes: {
      p1_nodeMaterials: verdicts.p1,
      p2_batchedMesh: verdicts.p2,
      p3_pipeline: verdicts.p3,
      p4_shaderMaterials: verdicts.p4
    },
    errors
  };
}

// ── main ────────────────────────────────────────────────────────────────────

const failedAnswer: ProbeAnswer = { answer: "inconclusive", basis: "none", value: null, detail: "probe failed — see errors" };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const games: { id: string; url: string }[] = [];
  if (args.manifest) {
    const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8")) as { games: { id: string; url?: string }[] };
    for (const g of manifest.games) {
      if (!g.url) continue;
      if (args.only && !args.only.includes(g.id)) continue;
      games.push({ id: g.id, url: g.url });
    }
  }
  if (args.game && args.url) games.push({ id: args.game, url: args.url });
  if (games.length === 0) {
    console.error("nothing to probe — pass --game + --url, or a --manifest with urls.\nSee the header for the remote-run instructions.");
    process.exit(2);
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const browser = args.cdpEndpoint
    ? await chromium.connectOverCDP(args.cdpEndpoint)
    : await chromium.launch({
        timeout: 60000,
        ...(args.channel ? { channel: args.channel } : {}),
        ...(args.headed ? { headless: false } : {}),
        ...(args.launchArgs.length ? { args: [...args.launchArgs] } : {})
      });

  for (const game of games) {
    const errors: string[] = [];
    let report: ProbeReport | undefined;
    const context = args.cdpEndpoint ? browser.contexts()[0] : await browser.newContext({ viewport: { width: args.viewport.width, height: args.viewport.height } });
    try {
      // Must run before the first navigation: reaches every frame, including the srcdoc game iframe.
      await context.addInitScript(HOOK_SOURCE);
      const page = args.cdpEndpoint ? context.pages()[0] : await context.newPage();
      if (!page) {
        errors.push("no page in connected context");
      } else {
        page.on("pageerror", (e) => errors.push(`pageerror:${String(e).slice(0, 160)}`));
        report = await probeGame(page, context, args, game.id, game.url, errors);
      }
    } catch (e) {
      errors.push(`probe:${String(e).slice(0, 200)}`);
    }
    const final: ProbeReport = report ?? {
      schema: "a3d-crayon-probe/2",
      game: game.id,
      url: game.url,
      probedAt: new Date().toISOString(),
      frame: { index: -1, url: "", pickReason: "probe failed before frame pick" },
      dom: {},
      module: {},
      heap: {},
      liveObjects: { contextFound: false, hookInstalled: false },
      probes: { p1_nodeMaterials: failedAnswer, p2_batchedMesh: failedAnswer, p3_pipeline: failedAnswer, p4_shaderMaterials: failedAnswer },
      errors
    };
    const outPath = path.join(args.outDir, `${game.id}.json`);
    const json = `${JSON.stringify(final, null, 2)}\n`;
    fs.writeFileSync(outPath, json);
    const lo = final.liveObjects as { hookInstalled?: boolean; scenes?: number };
    console.log(`[crayon-probe] ${game.id}: hook=${lo.hookInstalled === true} scenes=${lo.scenes ?? 0} p1=${final.probes.p1_nodeMaterials.answer} p2=${final.probes.p2_batchedMesh.answer} p3=${final.probes.p3_pipeline.answer} p4=${final.probes.p4_shaderMaterials.answer} → ${path.relative(repoRoot, outPath)}`);
    if (args.emitMarkers) console.log(`@@CRAYON_PROBE_BEGIN:${game.id}\n${json}@@CRAYON_PROBE_END:${game.id}`);
    else if (args.stdout) console.log(json);
    if (!args.cdpEndpoint) await context.close().catch(() => undefined);
  }
  await browser.close().catch(() => undefined);
}

await main();
