import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import sharp from "sharp";
import { test, type Browser, type Page } from "@playwright/test";
import { createState, scriptedInput, stateHash, step } from "../../tools/bench-vs-threejs/shared/coin-sim";

/**
 * Complete-game comparison (tools/bench-vs-threejs/full-game): the same "coin dash" game written twice, once on
 * @aura3d/engine (game kit, fixed-step loop, QA hooks, cue bank) and once on plain three.js + DOM + Web Audio.
 * Builds both with a stock `vite build` against the PUBLISHED packages, then runs the same scripted checks on both.
 * Remote only (tools/remote-acr/run.sh): software WebGL2 on a CPU runner. Results leave through the run log as base64
 * chunks between FULLGAME_RESULTS_BEGIN/END, reassembled by tools/bench-vs-threejs/full-game/extract.mjs.
 */
const WORK = process.env.FULLGAME_WORK ?? "/tmp/fullgame";
const HOOKS: Record<string, string> = { aura: "__AURA_COIN_DASH__", three: "__COIN_DASH__" };
const SELECTORS: Record<string, Record<string, string>> = {
  aura: { left: '.a3g-touch [data-control="left"]', right: '.a3g-touch [data-control="right"]', up: '.a3g-touch [data-control="jump"]', down: '.a3g-touch [data-control="attack"]' },
  three: { left: '.dpad [data-dir="left"]', right: '.dpad [data-dir="right"]', up: '.dpad [data-dir="up"]', down: '.dpad [data-dir="down"]' }
};
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".hdr": "application/octet-stream"
};

/** Page-side spies, installed before any app code: AudioContext oscillators, listeners on window/document/body, WebGL contexts. */
const SPY = `(() => {
  const spy = { started: [], contexts: [], glContexts: 0, live: new Set() };
  window.__SPY__ = spy;
  const Native = window.AudioContext;
  if (Native) {
    const create = Native.prototype.createOscillator;
    Native.prototype.createOscillator = function () {
      const osc = create.call(this);
      const start = osc.start.bind(osc);
      osc.start = (...a) => { spy.started.push({ type: osc.type, at: performance.now() }); return start(...a); };
      return osc;
    };
    window.AudioContext = class extends Native { constructor(...a) { super(...a); spy.contexts.push(this); } };
  }
  const ids = new WeakMap();
  let n = 0;
  const label = (t) => (t === window ? "window" : t === document ? "document" : document.body && t === document.body ? "body" : null);
  const key = (t, type, fn, opt) => {
    if (!fn) return null;
    const l = label(t);
    if (!l) return null;
    if (!ids.has(fn)) ids.set(fn, ++n);
    return l + "|" + type + "|" + ids.get(fn) + "|" + Boolean(typeof opt === "boolean" ? opt : opt && opt.capture);
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opt) { const k = key(this, type, fn, opt); if (k) spy.live.add(k); return add.call(this, type, fn, opt); };
  EventTarget.prototype.removeEventListener = function (type, fn, opt) { const k = key(this, type, fn, opt); if (k) spy.live.delete(k); return remove.call(this, type, fn, opt); };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { if (String(kind).startsWith("webgl")) spy.glContexts++; return getContext.call(this, kind, ...rest); };
})();`;

function serve(root: string): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (rel.endsWith("/")) rel += "index.html";
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}` });
    });
  });
}
const emit = (tag: string, b64: string): void => { for (let i = 0; i * 3000 < b64.length; i++) console.log(`${tag}:${i}:${b64.slice(i * 3000, (i + 1) * 3000)}`); };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Closed-loop input script that collects every coin of the seeded game, computed from the shared rules module. */
function winPlan(seed = 42) {
  const s = createState(mulberry32(seed));
  let px = 0, pz = 0, firstPickup = -1;
  const inputs: Array<{ x: number; z: number }> = [];
  while (s.status === "playing" && inputs.length < 3000) {
    const target = s.coins.filter((c) => !c.taken).sort((a, b) => Math.hypot(a.x - s.px, a.z - s.pz) - Math.hypot(b.x - s.px, b.z - s.pz))[0]!;
    const ax = target.x - (s.px + (s.px - px) * 9), az = target.z - (s.pz + (s.pz - pz) * 9);
    px = s.px; pz = s.pz;
    const input = { x: Math.abs(ax) > 0.4 ? Math.sign(ax) : 0, z: Math.abs(az) > 0.4 ? Math.sign(az) : 0 };
    inputs.push(input);
    step(s, input);
    if (firstPickup < 0 && s.score > 0) firstPickup = inputs.length;
  }
  const runs: Array<{ n: number; x: number; z: number }> = [];
  for (const i of inputs) {
    const last = runs[runs.length - 1];
    if (last && last.x === i.x && last.z === i.z) last.n++;
    else runs.push({ n: 1, x: i.x, z: i.z });
  }
  return { runs, steps: inputs.length, status: s.status, score: s.score, firstPickup };
}
function expectedReplayHash(frames: number, seed = 42): string {
  const s = createState(mulberry32(seed));
  for (let i = 0; i < frames; i++) step(s, scriptedInput(i));
  return stateHash(s);
}
async function lumaStats(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) { const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!; sum += l; sq += l * l; }
  const mean = sum / n;
  return { width: info.width, height: info.height, mean: Number(mean.toFixed(2)), std: Number(Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(2)) };
}

type Check = { pass: boolean; detail: unknown };

async function runApp(browser: Browser, name: string, dist: string, frames: Record<string, string>): Promise<Record<string, unknown>> {
  const hook = HOOKS[name]!;
  const sel = SELECTORS[name]!;
  const { server, origin } = await serve(dist);
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, hasTouch: true });
  await context.addInitScript(SPY);
  const page = await context.newPage();
  const consoleMessages: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMessages.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => consoleMessages.push(`[pageerror] ${String(e.message).slice(0, 300)}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const checks: Record<string, Check> = {};
  const info: Record<string, unknown> = {};
  const check = async (id: string, fn: () => Promise<Check>): Promise<void> => {
    try { checks[id] = await fn(); } catch (error) { checks[id] = { pass: false, detail: { error: String((error as Error)?.stack ?? error).slice(0, 700) } }; }
    console.log(`FULLGAME_CHECK ${name} ${id}: ${checks[id]!.pass ? "PASS" : "FAIL"} ${JSON.stringify(checks[id]!.detail).slice(0, 300)}`);
  };
  const state = (): Promise<Record<string, any>> => page.evaluate((h) => (window as any)[h].state(), hook);
  const reset = (): Promise<void> => page.evaluate((h) => (window as any)[h].reset(), hook);
  const rect = (selector: string) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, selector);
  const canvasInfo = () => page.evaluate(() => {
    const c = document.querySelector("#app canvas") as HTMLCanvasElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { cssW: Math.round(r.width), cssH: Math.round(r.height), w: c.width, h: c.height, ratio: Number((c.width / Math.max(1, r.width)).toFixed(3)), dpr: devicePixelRatio, canvases: document.querySelectorAll("canvas").length };
  });
  const canvasLuma = async () => lumaStats(await page.locator("#app canvas").first().screenshot({ type: "png" }));
  const jpg = async (png: Buffer, width: number) => (await sharp(png).resize(width).jpeg({ quality: 72 }).toBuffer()).toString("base64");
  const cdp = await context.newCDPSession(page);
  const touch = async (type: "touchStart" | "touchEnd", x?: number, y?: number): Promise<void> => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: x!, y: y!, id: 1 }] });
  };
  const holdTouch = async (selector: string, axis: "px" | "pz", wantPositive = true) => {
    await reset();
    const before = await state();
    const r = await rect(selector);
    if (!r) return { pass: false, detail: { error: `no element ${selector}` } };
    await touch("touchStart", r.cx, r.cy);
    let after = before;
    try {
      await page.waitForFunction(([h, a, v, dir]) => { const s = (window as any)[h].state(); return dir ? s[a] - (v as number) > 1 : (v as number) - s[a] > 1; }, [hook, axis, before[axis], wantPositive] as const, { timeout: 15_000 });
    } catch { /* recorded below */ }
    after = await state();
    await touch("touchEnd");
    const delta = after[axis] - before[axis];
    return { pass: wantPositive ? delta > 1 : delta < -1, detail: { selector, rect: r, before: before[axis], after: after[axis], delta: Number(delta.toFixed(2)) } };
  };
  const t0 = Date.now();
  try {
    await page.goto(`${origin}/index.html`, { waitUntil: "load" });
    await page.waitForFunction((h) => Boolean((window as any)[h]?.ready?.()), hook, { timeout: 240_000 });
    info.bootMs = Date.now() - t0;
    info.listenersAtBoot = await page.evaluate(() => (window as any).__SPY__.live.size);

    await check("renders-nonblack-frame", async () => {
      // software GL: the first frame can take a long time (synchronous shader compile), so wait for the first simulated step.
      const f0 = Date.now();
      await page.waitForFunction((h) => (window as any)[h].state().frame > 0, hook, { timeout: 240_000 });
      info.firstSimStepMs = Date.now() - t0;
      info.firstSimStepWaitMs = Date.now() - f0;
      await page.waitForTimeout(2500);
      const png = await page.screenshot({ type: "png" });
      frames[`${name}-play`] = await jpg(png, 640);
      const canvas = await canvasLuma();
      const s = await state();
      return { pass: canvas.mean > 8 && canvas.std > 4 && s.frame > 0, detail: { canvas, simFrameAfter2_5s: s.frame, glContexts: await page.evaluate(() => (window as any).__SPY__.glContexts) } };
    });

    await check("touch-buttons-present", async () => {
      const rects = await Promise.all(Object.entries(sel).map(async ([dir, s]) => [dir, await rect(s)] as const));
      const visible = rects.filter(([, r]) => r && r.w >= 1 && r.h >= 1);
      const display = await page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : null; }, sel.right!);
      return { pass: visible.length === 4, detail: { rects: Object.fromEntries(rects), display } };
    });

    await check("touch-moves-player-right", () => holdTouch(sel.right!, "px", true));
    await check("touch-moves-player-down", () => holdTouch(sel.down!, "pz", true));
    await check("touch-moves-player-left", () => holdTouch(sel.left!, "px", false));
    await check("touch-moves-player-up", () => holdTouch(sel.up!, "pz", false));
    try {
      await reset();
      const before = await state();
      const r = (await rect(sel.right!))!;
      await page.mouse.move(r.cx, r.cy);
      await page.mouse.down();
      await page.waitForTimeout(1500);
      const after = await state();
      await page.mouse.up();
      info.mousePressOnTouchButtonDeltaPx = Number((after.px - before.px).toFixed(2)); // informational, not a pass/fail check
    } catch (error) { info.mousePressOnTouchButtonDeltaPx = `error: ${String(error).slice(0, 200)}`; }

    await check("pause-key-stops-clock-and-resume-continues", async () => {
      await reset();
      await page.waitForFunction((h) => (window as any)[h].state().frame > 5, hook, { timeout: 30_000 });
      await page.keyboard.press("p");
      await page.waitForFunction((h) => (window as any)[h].state().paused === true, hook, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const a = await state();
      await page.waitForTimeout(1500);
      const b = await state();
      await page.keyboard.press("p");
      await page.waitForFunction(([h, f]) => (window as any)[h].state().frame > (f as number), [hook, b.frame] as const, { timeout: 30_000 });
      const c = await state();
      return { pass: a.frame === b.frame && a.timeLeft === b.timeLeft && c.frame > b.frame && c.paused === false, detail: { pausedFrame: [a.frame, b.frame], timeLeft: [a.timeLeft, b.timeLeft], resumedFrame: c.frame } };
    });
    await check("pause-button-stops-clock-and-resume-continues", async () => {
      await reset();
      await page.waitForFunction((h) => (window as any)[h].state().frame > 5, hook, { timeout: 30_000 });
      await page.click("#pause-button");
      await page.waitForFunction((h) => (window as any)[h].state().paused === true, hook, { timeout: 10_000 });
      const labelVisible = await page.isVisible("#paused");
      await page.waitForTimeout(300);
      const a = await state();
      await page.waitForTimeout(1500);
      const b = await state();
      await page.click("#pause-button");
      await page.waitForFunction(([h, f]) => (window as any)[h].state().frame > (f as number), [hook, b.frame] as const, { timeout: 30_000 });
      const c = await state();
      return { pass: a.frame === b.frame && c.frame > b.frame && labelVisible && !(await page.isVisible("#paused")), detail: { pausedFrame: [a.frame, b.frame], resumedFrame: c.frame, labelVisible } };
    });

    // Audio: unlock gesture, then the three cue types from real gameplay events (pickup, win, lose) and none from replay.
    const plan = winPlan(42);
    info.winPlan = { steps: plan.steps, runs: plan.runs.length, status: plan.status, score: plan.score };
    await check("audio-unlock-and-three-cues", async () => {
      const before = await page.evaluate(() => (window as any).__SPY__.contexts.map((c: AudioContext) => c.state));
      await page.keyboard.press("x");
      await page.waitForFunction(() => (window as any).__SPY__.contexts.some((c: AudioContext) => c.state === "running"), undefined, { timeout: 20_000 });
      const unlocked = await page.evaluate(() => (window as any).__SPY__.contexts.map((c: AudioContext) => c.state));
      const types = (): Promise<string[]> => page.evaluate(() => [...new Set<string>((window as any).__SPY__.started.map((s: { type: string }) => s.type))]);
      const clear = (): Promise<void> => page.evaluate(() => { (window as any).__SPY__.started.length = 0; });
      await clear();
      const win = await page.evaluate(([h, runs]) => { const H = (window as any)[h]; H.reset(); for (const r of runs as Array<{ n: number; x: number; z: number }>) H.stepFrames(r.n, { x: r.x, z: r.z }); return H.state(); }, [hook, plan.runs] as const);
      await page.waitForTimeout(400);
      const winTypes = await types();
      const resultsVisible = await page.isVisible("#results");
      const resultsText = resultsVisible ? await page.textContent("#results-text") : null;
      const winShot = await page.screenshot({ type: "png" });
      frames[`${name}-results`] = await jpg(winShot, 640);
      await clear();
      await page.evaluate(([h]) => { const H = (window as any)[h]; H.reset(); H.stepFrames(1805, { x: 0, z: 0 }); }, [hook] as const);
      await page.waitForTimeout(400);
      const loseTypes = await types();
      const loseState = await state();
      const loseResultsVisible = await page.isVisible("#results");
      const loseText = loseResultsVisible ? await page.textContent("#results-text") : null;
      await clear();
      const replayHash = await page.evaluate(([h]) => (window as any)[h].replay("scripted", 600), [hook] as const);
      await page.waitForTimeout(300);
      const replayTypes = await types();
      info.cueEvidence = { win: winTypes, lose: loseTypes, replay: replayTypes };
      info.resultsText = { win: resultsText, lose: loseText };
      checks["results-screen-on-win"] = { pass: win.status === "won" && resultsVisible && /WIN/i.test(resultsText ?? ""), detail: { status: win.status, score: win.score, visible: resultsVisible, text: resultsText } };
      checks["results-screen-on-time-up"] = { pass: loseState.status === "lost" && loseResultsVisible && /TIME UP/i.test(loseText ?? ""), detail: { status: loseState.status, visible: loseResultsVisible, text: loseText } };
      return {
        pass: winTypes.includes("triangle") && winTypes.includes("sine") && loseTypes.includes("sawtooth") && replayTypes.length === 0,
        detail: { contextsBeforeGesture: before, contextsAfterGesture: unlocked, pickupAndWinOscillators: winTypes, loseOscillators: loseTypes, oscillatorsDuringReplay: replayTypes, replayHash }
      };
    });

    await check("restart-key-resets", async () => {
      await page.evaluate(([h, runs]) => { const H = (window as any)[h]; H.reset(); for (const r of runs as Array<{ n: number; x: number; z: number }>) H.stepFrames(r.n, { x: r.x, z: r.z }); }, [hook, plan.runs] as const);
      const won = await state();
      await page.keyboard.press("r");
      await page.waitForFunction((h) => (window as any)[h].state().status === "playing", hook, { timeout: 10_000 });
      const after = await state();
      return { pass: won.status === "won" && after.score === 0 && after.frame < 200 && !(await page.isVisible("#results")), detail: { wonScore: won.score, afterScore: after.score, afterFrame: after.frame, resultsHidden: !(await page.isVisible("#results")) } };
    });
    await check("restart-button-resets", async () => {
      await page.evaluate(([h]) => { const H = (window as any)[h]; H.reset(); H.stepFrames(1805, { x: 0, z: 0 }); }, [hook] as const);
      const over = await state();
      await page.click("#again-button");
      await page.waitForFunction((h) => (window as any)[h].state().status === "playing", hook, { timeout: 10_000 });
      const after = await state();
      await page.click("#restart-button");
      const afterRestartButton = await state();
      return { pass: over.status === "lost" && after.timeLeft > 28 && !(await page.isVisible("#results")), detail: { overStatus: over.status, afterTimeLeft: after.timeLeft, afterFrame: after.frame, afterRestartButtonFrame: afterRestartButton.frame } };
    });

    await check("seeded-replay-hash", async () => {
      const r = await page.evaluate((h) => { const H = (window as any)[h]; return { a600: H.replay("scripted", 600), b600: H.replay("scripted", 600), a1800: H.replay("scripted", 1800), b1800: H.replay("scripted", 1800), stateKeys: Object.keys(H.state()), seed: H.seed }; }, hook);
      const expected = { h600: expectedReplayHash(600), h1800: expectedReplayHash(1800) };
      info.replay = { ...r, expected };
      return { pass: r.a600 === r.b600 && r.a1800 === r.b1800 && r.a600 === expected.h600 && r.a1800 === expected.h1800, detail: { ...r, expected } };
    });

    await check("resize-and-dpr", async () => {
      const sizes: Array<Record<string, unknown>> = [];
      let ok = true;
      for (const [w, h] of [[1000, 500], [390, 844], [800, 600]] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(1200);
        const c = await canvasInfo();
        const luma = await canvasLuma();
        if (w === 390) frames[`${name}-mobile`] = await jpg(await page.screenshot({ type: "png" }), 390);
        const fits = Boolean(c) && Math.abs(c!.cssW - w) <= 2 && Math.abs(c!.cssH - h) <= 2 && luma.mean > 8;
        ok &&= fits;
        sizes.push({ viewport: [w, h], canvas: c, mean: luma.mean, fits });
      }
      const hi = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2, hasTouch: true });
      await hi.addInitScript(SPY);
      const hiPage = await hi.newPage();
      await hiPage.goto(`${origin}/index.html`, { waitUntil: "load" });
      await hiPage.waitForFunction((h) => Boolean((window as any)[h]?.ready?.()), hook, { timeout: 240_000 });
      await hiPage.waitForTimeout(1500);
      const hiCanvas = await hiPage.evaluate(() => { const c = document.querySelector("#app canvas") as HTMLCanvasElement; const r = c.getBoundingClientRect(); return { cssW: Math.round(r.width), w: c.width, ratio: Number((c.width / r.width).toFixed(3)), dpr: devicePixelRatio }; });
      await hi.close();
      info.dpr2 = hiCanvas;
      return { pass: ok && hiCanvas.ratio > 1, detail: { sizes, dpr2: hiCanvas } };
    });

    await check("teardown-and-remount-without-leaks", async () => {
      const snapshot = () => page.evaluate(() => ({ listeners: (window as any).__SPY__.live.size, elements: document.querySelectorAll("*").length, canvases: document.querySelectorAll("canvas").length, glContexts: (window as any).__SPY__.glContexts }));
      const remount = (): Promise<void> => page.evaluate(() => (window as any).remount());
      const initial = await snapshot();
      await remount();
      await page.waitForFunction((h) => Boolean((window as any)[h]?.ready?.()), hook, { timeout: 60_000 });
      const first = await snapshot();
      for (let i = 0; i < 3; i++) await remount();
      await page.waitForTimeout(500);
      const fourth = await snapshot();
      const hash = await page.evaluate((h) => (window as any)[h].replay("scripted", 600), hook);
      const stillPlays = await page.evaluate(async (h) => { const f0 = (window as any)[h].state().frame; await new Promise((r) => setTimeout(r, 1500)); return (window as any)[h].state().frame > f0; }, hook);
      return { pass: fourth.listeners === first.listeners && fourth.elements === first.elements && fourth.canvases === 1 && hash === expectedReplayHash(600) && stillPlays, detail: { initial, afterFirstRemount: first, afterFourRemounts: fourth, replayHashAfterRemount: hash, stillPlays } };
    });
  } catch (error) {
    info.fatal = String((error as Error)?.stack ?? error).slice(0, 900);
    console.log(`FULLGAME_FATAL ${name}: ${info.fatal}`);
  } finally {
    info.wallMs = Date.now() - t0;
    await context.close();
    server.close();
  }
  return { checks, info, console: consoleMessages.slice(0, 20), consoleCount: consoleMessages.length, failedRequests: failed };
}

test("full game: Aura3D vs three.js, same coin-dash game, same checks", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(3_300_000);
  execFileSync("node", ["tools/bench-vs-threejs/full-game/build.mjs", "/repo/tools/bench-vs-threejs/full-game", WORK], { stdio: "inherit", timeout: 1_200_000 });
  const build = JSON.parse(readFileSync(join(WORK, "build.json"), "utf8"));
  const out: Record<string, unknown> = { generatedUtc: new Date().toISOString(), build, runs: {} as Record<string, unknown> };
  const frames: Record<string, string> = {};
  for (const name of ["aura", "three"]) {
    const app = build.apps[name] as { buildOk: boolean; dist: string };
    if (!app.buildOk) { (out.runs as Record<string, unknown>)[name] = { skipped: "build failed" }; continue; }
    (out.runs as Record<string, unknown>)[name] = await runApp(browser, name, app.dist, frames);
  }
  const runs = out.runs as Record<string, { info?: { replay?: { a600: string; a1800: string } } }>;
  out.comparison = {
    sameReplayHash600: runs.aura?.info?.replay?.a600 === runs.three?.info?.replay?.a600,
    sameReplayHash1800: runs.aura?.info?.replay?.a1800 === runs.three?.info?.replay?.a1800
  };
  console.log("FULLGAME_RESULTS_BEGIN");
  emit("FULLGAME_RESULTS", Buffer.from(JSON.stringify(out)).toString("base64"));
  console.log("FULLGAME_RESULTS_END");
  for (const [name, b64] of Object.entries(frames)) {
    console.log(`FULLGAME_FRAME_BEGIN ${name}`);
    emit(`FULLGAME_FRAME:${name}`, b64);
    console.log(`FULLGAME_FRAME_END ${name}`);
  }
});
