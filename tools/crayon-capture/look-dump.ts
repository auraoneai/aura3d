/**
 * tools/crayon-capture/look-dump — measure an original game's LOOK and ASSET INVENTORY from the live game.
 *
 * Remote only (see evidence/look-specs/README.md; same ACR recipe as tools/crayon-probe). Per game it:
 *   1. installs HOOK_SOURCE (live Scene/renderer capture) + LOOK_HOOK_SOURCE (virtual clock, seeded RNG,
 *      render wrapper) before any game script runs (reaches the sandboxed about:srcdoc frame),
 *   2. waits for a populated scene, dumps the TITLE look, clicks through the start flow (probe logic) and waits
 *      for the scene to settle,
 *   3. switches to a MANUAL virtual clock, holds the run keys, and dumps EARLY / MID looks at fixed virtual
 *      times plus the most effect-heavy moment found by a 1 s sweep,
 *   4. records the network asset inventory from Playwright responses (URL without query values, status, content
 *      type, size, sha256 computed in memory and discarded — no third-party bytes are written anywhere).
 * Output: evidence/look-specs/<game>.json (schema a3d-look-spec/1). `--emit-markers` prints each spec between
 * @@A3D_LOOK_BEGIN:<id> / @@A3D_LOOK_END:<id> so the ACR run log can be split back into files.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CLICK_START_SOURCE, HOOK_SOURCE, LIST_CONTROLS_SOURCE, SAMPLE_SOURCE } from "../crayon-probe/inpage.js";
import { chooseStartControl, settleStatus, type Control, type Sample } from "../crayon-probe/startControl.js";
import {
  LOOK_DUMP_SOURCE,
  LOOK_EFFECT_SOURCE,
  LOOK_HOOK_SOURCE,
  LOOK_SCHEMA,
  LOOK_SEED,
  dedupeMaterials,
  effectScore,
  mergeInventory,
  samplePath,
  stableStringify,
  unionMaterialRows,
  validateLookSpec,
  type EffectComponents,
  type MaterialRow,
  type PathPoint,
  type PerfEntry,
  type ResponseEntry
} from "./look-dump-lib.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromRepo = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? repoRoot, "package.json"));
const { chromium } = requireFromRepo("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string };
type PwRequest = { resourceType: () => string };
type PwResponse = { url: () => string; status: () => number; headers: () => Record<string, string>; request: () => PwRequest; body: () => Promise<Buffer> };
type CdpSession = { send: (method: string, params?: Record<string, unknown>) => Promise<{ data?: string }> };
type Context = {
  newPage: () => Promise<Page>;
  newCDPSession: (p: Page) => Promise<CdpSession>;
  addInitScript: (s: string) => Promise<void>;
  on: (ev: "response", cb: (r: PwResponse) => void) => void;
  close: () => Promise<void>;
};
type Locator = { click: (o?: Record<string, unknown>) => Promise<void> };
type Frame = { evaluate: (fn: string) => Promise<unknown>; url: () => string; locator: (s: string) => Locator };
type Page = {
  goto: (u: string, o: Record<string, unknown>) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  frames: () => Frame[];
  on: (ev: "pageerror", cb: (e: unknown) => void) => void;
  keyboard: { press: (k: string) => Promise<void> };
  evaluate: (src: string) => Promise<unknown>;
};

interface Args {
  manifest?: string;
  only?: string[];
  game?: string;
  url?: string;
  outDir: string;
  viewport?: { width: number; height: number };
  waitMs?: number;
  dtMs: number;
  earlyS: number;
  midS: number;
  effectS: number;
  keys: string[];
  renderAll: boolean;
  clickStart: boolean;
  emitMarkers: boolean;
  launchArgs: string[];
  channel?: string;
  headed: boolean;
  shotsOnly: boolean;
  shotsDir?: string;
  timingExplicit: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { outDir: path.join(repoRoot, "evidence", "look-specs"), dtMs: 50, earlyS: 2, midS: 12, effectS: 20, keys: ["KeyW", "ArrowUp"], renderAll: false, clickStart: true, emitMarkers: false, launchArgs: [], headed: false, shotsOnly: false, timingExplicit: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i] as string;
    switch (k) {
      case "--manifest": a.manifest = next(); break;
      case "--only": a.only = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--game": a.game = next(); break;
      case "--url": a.url = next(); break;
      case "--out": a.outDir = path.resolve(next()); break;
      case "--viewport": {
        const m = /^(\d+)x(\d+)$/.exec(next());
        if (!m) throw new Error("--viewport expects WxH");
        a.viewport = { width: Number(m[1]), height: Number(m[2]) };
        break;
      }
      case "--wait-ms": a.waitMs = Number(next()); break;
      case "--dt-ms": a.dtMs = Number(next()); break;
      case "--early-s": a.earlyS = Number(next()); a.timingExplicit = true; break;
      case "--mid-s": a.midS = Number(next()); a.timingExplicit = true; break;
      case "--effect-s": a.effectS = Number(next()); a.timingExplicit = true; break;
      case "--keys": a.keys = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--render-all": a.renderAll = true; break;
      case "--no-click-start": a.clickStart = false; break;
      case "--emit-markers": a.emitMarkers = true; break;
      case "--launch-arg": a.launchArgs.push(next()); break;
      case "--channel": a.channel = next(); break;
      case "--headed": a.headed = true; break;
      case "--shots-only": a.shotsOnly = true; break;
      case "--shots-dir": a.shotsDir = path.resolve(next()); break;
      default:
        if (k?.startsWith("--")) throw new Error(`unknown arg ${k}`);
    }
  }
  return a;
}

/** Heavy worlds starve the page's main thread on software GL; fewer pixels and a longer wait. */
const GAME_DEFAULTS: Record<string, { viewport?: { width: number; height: number }; waitMs?: number; earlyS?: number; midS?: number; effectS?: number }> = {
  "roadster-hours": { viewport: { width: 800, height: 450 }, waitMs: 240000 },
  "silt-and-signal": { viewport: { width: 800, height: 450 }, waitMs: 240000 },
  "drift-and-deliver": { viewport: { width: 800, height: 450 }, waitMs: 180000 },
  "ninja-runner": { viewport: { width: 800, height: 450 }, waitMs: 180000 },
  "last-train-to-the-sea": { viewport: { width: 800, height: 450 }, waitMs: 180000 },
  // The run ends in a few seconds without steering input; sample before the game-over card.
  "splat-rush": { earlyS: 1, midS: 5, effectS: 4 }
};

function withGameTiming(args: Args, id: string): Args {
  const d = GAME_DEFAULTS[id];
  if (args.timingExplicit || !d || d.earlyS === undefined) return args;
  return { ...args, earlyS: d.earlyS, midS: d.midS ?? args.midS, effectS: d.effectS ?? args.effectS };
}

// ── frame helpers ──────────────────────────────────────────────────────────

const HOOK_STATE = `(function () { var h = window.__a3dHook; if (!h) return null; var c = 0; for (var i = 0; i < h.renderers.length; i++) c += h.renderers[i].renderCalls; return { scenes: h.scenes.length, renderers: h.renderers.length, renderCalls: c }; })()`;
interface HookState { scenes: number; renderers: number; renderCalls: number }
const score = (s: HookState | null): number => (s ? s.scenes * 1000 + s.renderCalls + s.renderers : -1);

async function bestFrame(page: Page): Promise<{ frame: Frame; state: HookState | null } | undefined> {
  let best: { frame: Frame; state: HookState | null } | undefined;
  for (const frame of page.frames()) {
    let state: HookState | null = null;
    try { state = (await frame.evaluate(HOOK_STATE)) as HookState | null; } catch { state = null; }
    if (!best || score(state) > score(best.state)) best = { frame, state };
  }
  return best;
}

async function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(() => fallback);
}

async function listControls(frames: readonly Frame[]): Promise<{ frame: Frame; controls: Control[] }[]> {
  const out: { frame: Frame; controls: Control[] }[] = [];
  for (const frame of frames) {
    try {
      const controls = (await frame.evaluate(LIST_CONTROLS_SOURCE)) as Control[] | null;
      if (controls && controls.length > 0) out.push({ frame, controls });
    } catch { /* detached */ }
  }
  return out;
}


// Menus that follow the first start click (character/vehicle select, "Next", "Confirm") are not covered by the probe's start words.
const FOLLOW_UP = /^\s*(next|confirm|continue|ready|ok(ay)?|got it|select|choose|skip|let.?s\s+\w+|lock in|deploy|done|accept|go|launch|start|play|begin|drive|ride|race|enter|run)\b/i;
const FOLLOW_NOT = /\b(settings?|sound|audio|music|mute|records?|credits|options|quit|exit|pause|reset|back|close|help|how to|controls|share|leaderboard|menu|home|retry|restart)\b/i;

// Follow-up buttons that are plain elements (no <button>/cursor:pointer) are invisible to LIST_CONTROLS_SOURCE; find them by text.
const FIND_TEXT_TEMPLATE = String.raw`(function () {
  var re = new RegExp(__RE__, "i"), bad = new RegExp(__BAD__, "i"), used = __USED__;
  var all = document.querySelectorAll("*"), best = null;
  for (var i = 0; i < all.length; i++) {
    var n = all[i], tag = (n.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "canvas" || tag === "html" || tag === "body" || tag === "head") continue;
    var cs; try { cs = getComputedStyle(n); } catch (e) { continue; }
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    var r = n.getBoundingClientRect();
    if (r.width < 20 || r.height < 14) continue;
    var t = ((n.innerText || "") + "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 48 || !re.test(t) || bad.test(t) || used.indexOf(t.toLowerCase()) >= 0) continue;
    var dup = false;
    for (var c = 0; c < n.children.length; c++) { var ct = ((n.children[c].innerText || "") + "").replace(/\s+/g, " ").trim(); if (ct === t) { dup = true; break; } }
    if (dup) continue;
    var a = r.width * r.height;
    if (!best || a > best.a) best = { n: n, a: a, t: t };
  }
  if (!best) return null;
  best.n.setAttribute("data-a3d-ctl", "9000");
  return { text: best.t };
})()`;
const findTextSource = (usedTexts: readonly string[]): string => FIND_TEXT_TEMPLATE.replace("__RE__", JSON.stringify(FOLLOW_UP.source)).replace("__BAD__", JSON.stringify(FOLLOW_NOT.source)).replace("__USED__", JSON.stringify(usedTexts));

function chooseFollowUp(controls: readonly Control[], tried: ReadonlySet<number>): Control | null {
  let best: Control | null = null;
  for (const c of controls) {
    if (tried.has(c.index) || c.disabled || c.w < 8 || c.h < 8 || !c.text) continue;
    const text = c.text.replace(/\s+/g, " ").trim();
    if (text.length > 48 || FOLLOW_NOT.test(text) || !FOLLOW_UP.test(text)) continue;
    if (c.tag !== "button" && c.tag !== "a" && c.tag !== "input" && c.role !== "button" && c.cursor !== "pointer") continue;
    if (!best || c.w * c.h > best.w * best.h) best = c;
  }
  return best;
}

// ── start flow + title dump (mirrors tools/crayon-probe/index.ts waitForPopulatedScene) ──────────────

interface StartResult {
  clickSequence: { label: string; method: string; t: number }[];
  settled: boolean;
  settleDetail: string;
  waitedMs: number;
  titleDump: Record<string, unknown> | null;
  noStartControl: boolean;
}

async function waitAndStart(page: Page, args: Args, waitMs: number, onTitle?: () => Promise<void>, onTick?: () => Promise<void>): Promise<StartResult> {
  const started = Date.now();
  const clickSequence: { label: string; method: string; t: number }[] = [];
  const samples: Sample[] = [];
  const uses = new Map<string, number>();
  let clickedAt = -1;
  let attempts = 0;
  let lastAttempt = 0;
  let awaitingNext = false;
  let noStart = false;
  let titleDump: Record<string, unknown> | null = null;
  let titleCalled = false;
  let exhausted = false;
  let enterPresses = 0;
  let emptyAttempts = 0;
  let verdict = { settled: false, detail: "no populated scene" };
  while (Date.now() - started < waitMs) {
    if (onTick) await onTick();
    const best = await bestFrame(page);
    if (best?.state && best.state.scenes >= 1 && best.state.renderCalls >= 1) {
      let sample: { objects: number; renderCalls: number } | null = null;
      try { sample = (await best.frame.evaluate(SAMPLE_SOURCE)) as { objects: number; renderCalls: number } | null; } catch { sample = null; }
      if (sample) samples.push({ t: Date.now() - started, objects: sample.objects, renderCalls: sample.renderCalls });
      if (!titleDump && clickSequence.length === 0 && samples.length >= 3 && (samples[samples.length - 1] as Sample).objects > 1) {
        titleDump = (await within(best.frame.evaluate(LOOK_DUMP_SOURCE) as Promise<Record<string, unknown>>, 90000, { error: "title dump timed out" })) ?? null;
      }
      if (onTitle && !titleCalled && clickSequence.length === 0 && samples.length >= 3) { titleCalled = true; await onTitle(); }
      const stepsDone = clickSequence.length;
      const gap = stepsDone > 0 ? 6000 : 2500;
      if (args.clickStart && !noStart && attempts < 14 && stepsDone < 6 && Date.now() - lastAttempt > gap) {
        lastAttempt = Date.now();
        attempts++;
        const listed = await listControls(page.frames());
        const all = listed.flatMap((l) => l.controls);
        const frames = page.frames();
        const ordered = [...listed].sort((x, y) => Number(y.frame === best.frame) - Number(x.frame === best.frame));
        let stepClicked = false;
        if (process.env.LOOK_DEBUG_START) console.error(`[look-dump:start] attempt=${attempts} steps=${stepsDone} ${JSON.stringify(ordered.map((o) => o.controls.filter((c) => !FOLLOW_NOT.test(c.text) || /let/i.test(c.text)).map((c) => `${c.tag}|${c.cursor}|${c.w}x${c.h}|${c.disabled ? "dis" : "ok"}|${c.text.slice(0, 30)}`).slice(0, 60)))}`);
        for (const { frame, controls } of ordered) {
          const fi = frames.indexOf(frame);
          const labelKey = (c: Control): string => `${fi}:${c.text.replace(/\s+/g, " ").trim().toLowerCase()}`;
          const triedHere = new Set(controls.filter((c) => (uses.get(labelKey(c)) ?? 0) >= 2).map((c) => c.index));
          const usedOnce = new Set(controls.filter((c) => (uses.get(labelKey(c)) ?? 0) >= 1).map((c) => c.index));
          const pick = chooseStartControl(controls, usedOnce) ?? (stepsDone > 0 ? chooseFollowUp(controls, usedOnce) : null) ?? (stepsDone === 0 ? chooseStartControl(controls, triedHere) : null);
          if (!pick) continue;
          const key = labelKey(pick);
          const locator = frame.locator(`[data-a3d-ctl="${pick.index}"]`);
          let method: string | null = null;
          try { await locator.click({ timeout: 8000 }); method = "locator-click"; } catch {
            try { await locator.click({ timeout: 8000, force: true }); method = "locator-click-force"; } catch { /* retry */ }
          }
          if (method) {
            uses.set(key, (uses.get(key) ?? 0) + 1);
            console.error(`[look-dump:start] click "${pick.text.slice(0, 40)}" (step ${stepsDone + 1})`);
            clickSequence.push({ label: pick.text, method, t: Date.now() - started });
            clickedAt = Date.now() - started;
            stepClicked = true;
            break;
          }
          uses.set(key, (uses.get(key) ?? 0) + 1);
        }
        if (!stepClicked && stepsDone > 0) {
          for (const { frame } of ordered) {
            let found: { text: string } | null = null;
            try { found = (await frame.evaluate(findTextSource([...uses.keys()].map((k) => k.replace(/^(\d+:|txt:)/, ''))))) as { text: string } | null; } catch { found = null; }
            if (process.env.LOOK_DEBUG_START) {
              let diag: unknown = null;
              try { diag = await frame.evaluate(`(function(){if(window.__a3dFindDbg)return window.__a3dFindDbg;var o=[];var all=document.querySelectorAll("*");for(var i=0;i<all.length&&o.length<12;i++){var n=all[i];var t=((n.innerText||"")+"").replace(/\\s+/g," ").trim();if(/ride|let/i.test(t)&&t.length<60){var cs=getComputedStyle(n);var r=n.getBoundingClientRect();o.push(n.tagName+"|"+t+"|op"+cs.opacity+"|"+cs.display+"|"+cs.visibility+"|"+Math.round(r.width)+"x"+Math.round(r.height)+"|"+Math.round(r.left)+","+Math.round(r.top));}}return o;})()`); } catch { diag = "err"; }
              console.error(`[look-dump:start] finder found=${JSON.stringify(found)} diag=${JSON.stringify(diag)}`);
            }
            if (!found) continue;
            const key = `txt:${found.text.toLowerCase()}`;
            if ((uses.get(key) ?? 0) >= 1) continue;
            const locator = frame.locator(`[data-a3d-ctl="9000"]`);
            let method: string | null = null;
            try { await locator.click({ timeout: 8000 }); method = "text-click"; } catch {
              try { await locator.click({ timeout: 8000, force: true }); method = "text-click-force"; } catch { /* retry */ }
            }
            uses.set(key, (uses.get(key) ?? 0) + 1);
            if (method) {
              console.error(`[look-dump:start] text-click "${found.text.slice(0, 40)}" (step ${stepsDone + 1})`);
              clickSequence.push({ label: found.text, method, t: Date.now() - started });
              clickedAt = Date.now() - started;
              stepClicked = true;
              break;
            }
          }
        }
        if (!stepClicked && stepsDone > 0 && enterPresses < 3) {
          let hint = false;
          try { hint = (await best.frame.evaluate(`/\\benter\\b/i.test(document.body ? document.body.innerText : "")`)) as boolean; } catch { hint = false; }
          if (hint) {
            try {
              await page.keyboard.press("Enter");
              enterPresses++;
              console.error(`[look-dump:start] key Enter (step ${stepsDone + 1})`);
              clickSequence.push({ label: "(key) Enter", method: "keyboard", t: Date.now() - started });
              clickedAt = Date.now() - started;
              stepClicked = true;
            } catch { /* page closing */ }
          }
        }
        if (stepClicked) emptyAttempts = 0;
        else if (stepsDone > 0 && ++emptyAttempts >= 2) exhausted = true;
        if (!stepClicked && stepsDone === 0) {
          try {
            const label = (await best.frame.evaluate(CLICK_START_SOURCE)) as string | null;
            if (label) { clickSequence.push({ label, method: "dom-click", t: Date.now() - started }); clickedAt = Date.now() - started; stepClicked = true; }
          } catch { /* navigating */ }
        }
        if (!stepClicked && stepsDone === 0 && attempts === 3) { try { await page.keyboard.press("Enter"); } catch { /* ignore */ } }
        if (!stepClicked && stepsDone === 0 && attempts >= 4 && all.length === 0) noStart = true;
        awaitingNext = stepClicked;
      }
      const startResolved = (!args.clickStart || (clickSequence.length > 0 && (exhausted || clickSequence.length >= 6)) || noStart || attempts >= 14) && !awaitingNext;
      if (startResolved) {
        const relevant = clickedAt >= 0 ? samples.filter((x) => x.t >= clickedAt) : samples;
        const v = settleStatus(relevant, { settleMs: 4000, strictPct: 0.03, plateauMs: 15000, plateauPct: 0.08 });
        verdict = { settled: v.settled, detail: v.detail };
        if (v.settled) break;
      }
    }
    await page.waitForTimeout(500);
  }
  return { clickSequence, settled: verdict.settled, settleDetail: verdict.detail, waitedMs: Date.now() - started, titleDump, noStartControl: noStart };
}

// ── one game ───────────────────────────────────────────────────────────────────────

const MAX_HASH_BYTES = 12 * 1024 * 1024;
const LOOK = "window.__a3dLook";

async function lookGame(browser: Browser, rawArgs: Args, id: string, url: string): Promise<Record<string, unknown>> {
  const args = withGameTiming(rawArgs, id);
  const errors: string[] = [];
  const defaults = GAME_DEFAULTS[id] ?? {};
  const viewport = args.viewport ?? defaults.viewport ?? { width: 960, height: 540 };
  const waitMs = args.waitMs ?? defaults.waitMs ?? 120000;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(HOOK_SOURCE);
  await context.addInitScript(LOOK_HOOK_SOURCE);

  const responses: ResponseEntry[] = [];
  const jobs: Promise<void>[] = [];
  context.on("response", (resp) => {
    jobs.push((async () => {
      const u = resp.url();
      if (u.startsWith("data:") || u.startsWith("blob:")) return;
      const headers = resp.headers();
      const length = Number(headers["content-length"]);
      const entry: { url: string; status: number; contentType?: string; resourceType?: string; bytes?: number; sha256?: string } = { url: u, status: resp.status(), contentType: headers["content-type"], resourceType: resp.request().resourceType() };
      if (resp.status() === 200 && (!Number.isFinite(length) || length <= MAX_HASH_BYTES)) {
        try {
          const body = await resp.body();
          entry.bytes = body.length;
          entry.sha256 = createHash("sha256").update(body).digest("hex");
        } catch { /* redirect or streamed body */ }
      } else if (Number.isFinite(length)) entry.bytes = length;
      responses.push(entry);
    })());
  });

  const page = await context.newPage();
  page.on("pageerror", (e) => { if (errors.length < 30) errors.push(`pageerror:${String(e).slice(0, 140)}`); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

  const start = await waitAndStart(page, args, waitMs);
  const best = await bestFrame(page);
  if (!best || !best.state) throw new Error("no frame reported the hook (init script did not run)");
  const frame = best.frame;
  const ev = <T>(src: string, ms = 120000, fallback: T = null as T): Promise<T> => within(frame.evaluate(src) as Promise<T>, ms, fallback);

  const dtMs = args.dtMs;
  const vt0 = await ev<number>(`${LOOK}.enterManual(${dtMs})`);
  await ev(`${LOOK}.skipRender = ${args.renderAll ? "false" : "true"}; 0`);
  for (const key of args.keys) await ev(`${LOOK}.key("keydown", ${JSON.stringify(key)}); 0`);

  const advance = async (seconds: number): Promise<{ done?: number; stalled?: boolean } | null> => {
    const n = Math.max(1, Math.round((seconds * 1000) / dtMs));
    return ev<{ done?: number; stalled?: boolean }>(`${LOOK}.stepAsync(${n})`, 240000, null as never);
  };
  const dumpNow = async (): Promise<Record<string, unknown>> => {
    await ev(`${LOOK}.skipRender = false; 0`);
    await ev(`${LOOK}.stepAsync(3)`, 120000, null as never);
    const d = await ev<Record<string, unknown>>(LOOK_DUMP_SOURCE, 120000, { error: "dump timed out" } as Record<string, unknown>);
    await ev(`${LOOK}.skipRender = ${args.renderAll ? "false" : "true"}; 0`);
    return d;
  };

  const phases: Record<string, Record<string, unknown>> = {};
  if (start.titleDump) phases.title = start.titleDump;
  const stalls: string[] = [];
  const stepTo = async (seconds: number, label: string) => { const r = await advance(seconds); if (r?.stalled) stalls.push(`${label}:stalled after ${r.done}`); };

  await stepTo(args.earlyS, "early");
  phases.early = await dumpNow();
  await stepTo(args.midS - args.earlyS, "mid");
  phases.mid = await dumpNow();

  const sweep: { tS: number; score: number; components: EffectComponents | null }[] = [];
  let bestScore = -1;
  let dumps = 0;
  for (let s = 1; s <= args.effectS; s++) {
    await stepTo(1, `sweep${s}`);
    const c = await ev<(EffectComponents & { objects?: number }) | null>(LOOK_EFFECT_SOURCE, 60000, null);
    const sc = c ? effectScore(c) : -1;
    sweep.push({ tS: args.midS + s, score: Math.round(sc * 100) / 100, components: c });
    if (c && sc > bestScore * 1.05 && dumps < 4) {
      bestScore = sc;
      phases.effect = await dumpNow();
      (phases.effect as Record<string, unknown>).sweepTimeS = args.midS + s;
      dumps++;
    }
  }
  if (!phases.effect) phases.effect = await dumpNow();

  const cams = await ev<{ calls: number; path: PathPoint[] }[]>(`(function(){ var l = ${LOOK}; var out = []; for (var i = 0; i < l.cameras.length; i++) out.push({ calls: l.cameras[i].calls, path: l.cameras[i].path }); return out; })()`, 60000, []);
  const mainCam = (cams ?? []).reduce<{ calls: number; path: PathPoint[] } | null>((m, c) => (!m || c.calls > m.calls ? c : m), null);
  const manualPath = (mainCam?.path ?? []).filter((p) => typeof vt0 === "number" && p.t >= vt0).map((p) => ({ ...p, t: p.t - (vt0 as number) }));
  const resources = (await ev<PerfEntry[]>(`${LOOK}.resources`, 60000, [])) ?? [];
  const lookErrors = (await ev<string[]>(`${LOOK}.errors`, 30000, [])) ?? [];
  for (const e of lookErrors) errors.push(`look:${e}`);
  await within(Promise.allSettled(jobs).then(() => undefined), 60000, undefined);

  // materials: de-duplicate per phase, then union by signature (users = max across phases)
  const rowSets: MaterialRow[][] = [];
  let omitted = 0;
  for (const name of ["mid", "early", "effect", "title"]) {
    const raw = (phases[name]?.materials ?? []) as Record<string, unknown>[];
    if (!Array.isArray(raw)) continue;
    const d = dedupeMaterials(raw);
    omitted = Math.max(omitted, d.omitted);
    rowSets.push(d.rows as MaterialRow[]);
  }
  const materials = { rows: unionMaterialRows(rowSets), omitted, fromPhase: "mid+early+effect+title (union, users = max)" };
  for (const p of Object.values(phases)) delete (p as Record<string, unknown>).materials;

  const mid = phases.mid ?? {};
  const spec = {
    schema: LOOK_SCHEMA,
    game: id,
    url,
    meta: {
      capturedAt: new Date().toISOString(),
      browser: browser.version(),
      viewport,
      dtMs,
      seed: LOOK_SEED,
      skipRender: !args.renderAll,
      keysHeld: args.keys,
      clockManualStartPerfMs: vt0,
      earlyS: args.earlyS,
      midS: args.midS,
      effectWindowS: args.effectS,
      clickSequence: start.clickSequence,
      noStartControl: start.noStartControl,
      sceneSettled: start.settled,
      settleDetail: start.settleDetail,
      waitedMs: start.waitedMs,
      stalls,
      frameUrl: frame.url(),
      note: "Numbers, names, hashes and sizes only; no third-party bytes or shader source are stored."
    },
    phases,
    materials,
    postChain: { frameCalls: mid.frameCalls ?? [], composers: mid.composers ?? [], nodePipelines: mid.nodePipelines ?? [], renderers: mid.renderers ?? [] },
    effectSweep: sweep,
    cameraPath: samplePath(manualPath, 48),
    inventory: mergeInventory(resources, responses),
    errors: [] as string[]
  };
  const problems = validateLookSpec(spec);
  (spec.errors as string[]).push(...errors, ...problems.map((p) => `validate:${p}`));
  await context.close().catch(() => undefined);
  return spec;
}


// ── reference screenshots (--shots-only) ─────────────────────────────────────────────────

interface ShotMeta {
  n: number;
  label: string;
  virtualTimeS: number | null;
  state: Record<string, unknown> | null;
  viewport: { width: number; height: number };
  crop?: { x: number; y: number; width: number; height: number };
  bytes: number;
  sha256: string;
}

/** JPEG q92 at 1280x720 of the original at the look-dump's virtual-time points. Output is for local look reference only. */
async function shotsGame(browser: Browser, rawArgs: Args, id: string, url: string): Promise<{ metas: ShotMeta[]; files: { n: number; buf: Buffer }[]; errors: string[] }> {
  const args = withGameTiming(rawArgs, id);
  const errors: string[] = [];
  const viewport = args.viewport ?? { width: 1280, height: 720 };
  const waitMs = args.waitMs ?? GAME_DEFAULTS[id]?.waitMs ?? 120000;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(HOOK_SOURCE);
  await context.addInitScript(LOOK_HOOK_SOURCE);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on("pageerror", (e) => { if (errors.length < 30) errors.push(`pageerror:${String(e).slice(0, 140)}`); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

  const metas: ShotMeta[] = [];
  const files: { n: number; buf: Buffer }[] = [];
  let frame: Frame | null = null;
  const evF = <T>(src: string, ms = 120000, fallback: T = null as T): Promise<T> => (frame ? within(frame.evaluate(src) as Promise<T>, ms, fallback) : Promise.resolve(fallback));
  const nowVirtual = async (): Promise<number | null> => {
    const ms = await evF<number | null>(`${LOOK}.virtualMs()`, 10000, null);
    return typeof ms === "number" ? Math.round(ms / 10) / 100 : null;
  };
  const FILL_IFRAME = `(function(){ var f = document.querySelectorAll('iframe'); var best = null, area = 0; for (var i = 0; i < f.length; i++) { var r = f[i].getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = f[i]; } } if (!best) return false; if (!document.getElementById('a3d-fill-style')) { var st = document.createElement('style'); st.id = 'a3d-fill-style'; st.textContent = 'html,body{overflow:hidden!important}'; document.head.appendChild(st); } var s = best.style; s.setProperty('position','fixed','important'); s.setProperty('inset','0','important'); s.setProperty('width','100vw','important'); s.setProperty('height','100vh','important'); s.setProperty('max-width','none','important'); s.setProperty('max-height','none','important'); s.setProperty('z-index','2147483647','important'); s.setProperty('border','0','important'); s.setProperty('border-radius','0','important'); window.dispatchEvent(new Event('resize')); return true; })()`;
  const fillIframe = async (): Promise<void> => { try { await page.evaluate(FILL_IFRAME); } catch { /* navigating */ } };
  const capture = async (crop?: { x: number; y: number; width: number; height: number }): Promise<Buffer> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await within(cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true, ...(crop ? { clip: { ...crop, scale: 1 } } : {}) }), 90000, { data: undefined });
        if (r.data) return Buffer.from(r.data, "base64");
        throw new Error("capture timed out");
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
  };
  const take = async (n: number, label: string, crop?: { x: number; y: number; width: number; height: number }, replace = false): Promise<void> => {
    if (frame) { await evF(`${LOOK}.skipRender = false; 0`, 10000); await evF(`${LOOK}.stepAsync(3)`, 60000, null as never); }
    const state = frame ? await evF<Record<string, unknown> | null>(LOOK_EFFECT_SOURCE, 60000, null) : null;
    const t = await nowVirtual();
    let buf: Buffer;
    try { await fillIframe(); await page.waitForTimeout(250); buf = await capture(crop); } catch (e) { errors.push(`shot ${label}: ${String(e).slice(0, 120)}`); return; }
    if (frame && !args.renderAll) await evF(`${LOOK}.skipRender = true; 0`, 10000);
    const meta: ShotMeta = { n, label, virtualTimeS: t, state, viewport, ...(crop ? { crop } : {}), bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
    const at = metas.findIndex((m) => m.n === n);
    if (at >= 0 && replace) { metas[at] = meta; files[files.findIndex((f) => f.n === n)] = { n, buf }; }
    else if (at < 0) { metas.push(meta); files.push({ n, buf }); }
  };

  let titleShot = false;
  const start = await waitAndStart(page, args, waitMs, async () => { titleShot = true; await fillIframe(); await page.waitForTimeout(1500); await take(1, "title (before start)"); }, fillIframe);
  const best = await bestFrame(page);
  if (!best || !best.state) { errors.push("no frame reported the hook"); await context.close().catch(() => undefined); return { metas, files, errors }; }
  frame = best.frame;
  await fillIframe();
  if (!titleShot) await take(1, "title (no pre-start scene; first populated frame)");
  await evF<number>(`${LOOK}.enterManual(${args.dtMs})`);
  await evF(`${LOOK}.skipRender = ${args.renderAll ? "false" : "true"}; 0`);
  for (const key of args.keys) await evF(`${LOOK}.key("keydown", ${JSON.stringify(key)}); 0`);
  const stepTo = async (seconds: number) => { await evF(`${LOOK}.stepAsync(${Math.max(1, Math.round((seconds * 1000) / args.dtMs))})`, 240000, null as never); };

  await stepTo(args.earlyS);
  await take(2, `early run +${args.earlyS}s`);
  await stepTo(args.midS - args.earlyS);
  await take(3, `mid run +${args.midS}s`);
  const center = { x: Math.round(viewport.width / 4), y: Math.round(viewport.height / 4), width: Math.round(viewport.width / 2), height: Math.round(viewport.height / 2) };
  await take(4, `mid run +${args.midS}s close-up (centre crop ${center.width}x${center.height}, native pixels)`, center);

  let bestScore = -1;
  let shotsTaken = 0;
  for (let sec = 1; sec <= args.effectS; sec++) {
    await stepTo(1);
    const c = await evF<(EffectComponents & { objects?: number }) | null>(LOOK_EFFECT_SOURCE, 60000, null);
    const sc = c ? effectScore(c) : -1;
    if (c && sc > bestScore * 1.05 && shotsTaken < 4) {
      bestScore = sc;
      await take(5, `effect-heavy moment (sweep +${args.midS + sec}s)`, undefined, true);
      shotsTaken++;
    }
  }
  if (!metas.some((m) => m.n === 5)) await take(5, "effect-heavy moment (no sweep winner; end of window)");
  await stepTo(13);
  await take(6, `late run +${args.midS + args.effectS + 13}s`);
  await context.close().catch(() => undefined);
  return { metas, files, errors };
}

// ── main ────────────────────────────────────────────────────────────────────────────

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
    console.error("nothing to dump: pass --manifest (+ --only) or --game + --url");
    process.exit(2);
  }
  fs.mkdirSync(args.outDir, { recursive: true });
  const browser = await chromium.launch({
    timeout: 60000,
    ...(args.channel ? { channel: args.channel } : {}),
    ...(args.headed ? { headless: false } : {}),
    ...(args.launchArgs.length ? { args: args.launchArgs } : {})
  });
  if (args.shotsOnly) {
    for (const g of games) {
      let res: Awaited<ReturnType<typeof shotsGame>>;
      try { res = await shotsGame(browser, args, g.id, g.url); } catch (e) { res = { metas: [], files: [], errors: [`shots:${String(e).slice(0, 240)}`] }; }
      const index = { schema: "a3d-look-reference-frames/1", game: g.id, url: g.url, capturedAt: new Date().toISOString(), note: "Third-party screenshots of the original, for local look reference only. Do not commit.", frames: res.metas.sort((a, b) => a.n - b.n).map((m) => ({ file: `ref-${m.n}.jpg`, ...m })), errors: res.errors };
      if (args.shotsDir) {
        const d = path.join(args.shotsDir, g.id);
        fs.mkdirSync(d, { recursive: true });
        for (const f of res.files) fs.writeFileSync(path.join(d, `ref-${f.n}.jpg`), f.buf);
        fs.writeFileSync(path.join(d, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
      }
      console.log(`[look-dump] ${g.id}: shots=${res.files.length} errors=${res.errors.length}`);
      if (args.emitMarkers) {
        console.log(`@@A3D_SHOTS_BEGIN:${g.id}\n${JSON.stringify({ index, files: res.files.map((f) => ({ n: f.n, b64: f.buf.toString("base64") })) })}\n@@A3D_SHOTS_END:${g.id}`);
      }
    }
    await browser.close().catch(() => undefined);
    return;
  }
  for (const g of games) {
    let spec: Record<string, unknown>;
    try {
      spec = await lookGame(browser, args, g.id, g.url);
    } catch (e) {
      spec = { schema: LOOK_SCHEMA, game: g.id, url: g.url, meta: { capturedAt: new Date().toISOString() }, phases: {}, materials: { rows: [], omitted: 0 }, postChain: null, cameraPath: null, inventory: { entries: [], totals: {} }, errors: [`look:${String(e).slice(0, 240)}`] };
    }
    const json = `${stableStringify(spec)}\n`;
    fs.writeFileSync(path.join(args.outDir, `${g.id}.json`), json);
    const errs = (spec.errors as string[]).length;
    console.log(`[look-dump] ${g.id}: phases=${Object.keys(spec.phases as object).join(",")} materials=${((spec.materials as { rows: unknown[] }).rows).length} errors=${errs}`);
    if (args.emitMarkers) console.log(`@@A3D_LOOK_BEGIN:${g.id}\n${json}@@A3D_LOOK_END:${g.id}`);
  }
  await browser.close().catch(() => undefined);
}

await main();
