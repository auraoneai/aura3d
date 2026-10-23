#!/usr/bin/env tsx
/**
 * tools/crayon-capture/splat-rush-frames: screenshots of the ORIGINAL Splat Rush at fixed simulation steps, for the
 * art-fidelity pass (look comparison, structural metrics, blind judge). REMOTE RUN ONLY (serverless ACR Task).
 *
 * Replays the recorded input script (evidence/crayon-capture/splat-rush-reference.json -> script) through the original with
 * the capture hook (virtual time, seeded RNG, no audio), letting the original's own renderer draw, and screenshots the game
 * frame element (canvas + DOM HUD/overlays) at the requested steps. A second pass starts a run and never steers so the
 * original reaches its game-over card. Frames are printed as `@@SPLAT_FRAME <name> <i> <n> <base64 jpeg chunk>` (ACR cannot
 * return files); `splat-rush-frames-split.ts` rebuilds the JPEGs from the log.
 *
 *   node frames.mjs --manifest games.json --script-file script.txt --steps 40,200,500,800 --viewport 640x360 --out /tmp/out
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { POINTER_START_X, expandSegments, parseInputScript, vtHookSource, type StepInput } from "./splat-rush-lib";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

type Frame = { evaluate: <T = unknown>(fn: string) => Promise<T>; url: () => string };
type Page = {
  goto: (u: string, o: Record<string, unknown>) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  frames: () => Frame[];
  evaluate: <T = unknown>(fn: string) => Promise<T>;
};
type Cdp = { send: (m: string, p?: Record<string, unknown>) => Promise<{ data?: string }> };
type Context = { newPage: () => Promise<Page>; newCDPSession: (p: Page) => Promise<Cdp>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> };
type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> };

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const RUNNER = `(function (POINTER_START_X) {
  var vt = window.__a3dVt;
  var st = { x: POINTER_START_X, dragging: false, idx: 0 };
  function press(type, cx) {
    window.dispatchEvent(new PointerEvent(type, { clientX: cx, clientY: 120, bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true }));
  }
  function applyInput(inp) {
    var phase = window.__getGameState().phase;
    if (inp.start || inp.down) { press("pointerdown", st.x); if (phase !== "splash") st.dragging = true; }
    if (inp.dx) { st.x += inp.dx; press("pointermove", st.x); }
    if (inp.up) { press("pointerup", st.x); st.dragging = false; }
  }
  window.__a3dFrames = {
    begin: function (warmup) { for (var i = 0; i < warmup; i++) vt.step(); return window.__getGameState().phase; },
    run: function (inputs, to) {
      while (st.idx < to) { applyInput(inputs[st.idx] || { start: false, down: false, up: false, dx: 0 }); vt.step(); st.idx++; }
      return st.idx;
    },
    untilPhase: function (phase, maxSteps) {
      var n = 0;
      while (window.__getGameState().phase !== phase && n < maxSteps) {
        var inp = st.idx === 0 ? { start: true, down: false, up: false, dx: 0 } : st.idx === 1 ? { start: false, down: true, up: false, dx: 0 } : { start: false, down: false, up: false, dx: 0 };
        applyInput(inp); vt.step(); st.idx++; n++;
      }
      return window.__getGameState().phase + ":" + st.idx;
    },
    more: function (k) { for (var i = 0; i < k; i++) { applyInput({ start: false, down: false, up: false, dx: 0 }); vt.step(); st.idx++; } return st.idx; },
    phase: function () { return window.__getGameState().phase; }
  };
  return true;
})`;

/** Hides the host page's own chrome (loader, exit pill, blur backdrop) so only the game's frame is photographed. */
const HIDE_CHROME = `(function(){var f=document.querySelector('iframe');if(!f)return 0;var keep=new Set();for(var n=f;n;n=n.parentElement)keep.add(n);var c=0;document.querySelectorAll('body *').forEach(function(e){if(keep.has(e)||f.contains(e))return;e.style.setProperty('visibility','hidden','important');c++;});return c;})()`;

function emit(name: string, jpeg: Buffer): void {
  const b64 = jpeg.toString("base64");
  const size = 1800;
  const n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SPLAT_FRAME ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}\n`);
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
        /* navigating or busy */
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function session(
  browser: Browser,
  o: { url: string; seed: number; warmup: number; viewport: { width: number; height: number }; waitMs: number; mode: "replay" | "idle"; steps: number[]; script: StepInput[]; tag: string; out: string }
): Promise<void> {
  const context = await browser.newContext({ viewport: o.viewport });
  try {
    await context.addInitScript(vtHookSource(o.seed));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.goto(o.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const frame = await findGameFrame(page, o.waitMs);
    if (!frame) throw new Error("game frame not ready");
    await frame.evaluate(`(${RUNNER})(${POINTER_START_X})`);
    const phase = await frame.evaluate<string>(`window.__a3dFrames.begin(${o.warmup})`);
    process.stdout.write(`[splat-frames] ${o.tag} begun phase=${phase}\n`);
    const shot = async (name: string): Promise<void> => {
      await page.evaluate(HIDE_CHROME).catch(() => undefined);
      let buf: Buffer | null = null;
      for (let attempt = 0; attempt < 3 && !buf; attempt++) {
        const r = await Promise.race([cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true }), new Promise<{ data?: string }>((res) => setTimeout(() => res({}), 150000))]);
        if (r.data) buf = Buffer.from(r.data, "base64");
      }
      if (!buf) throw new Error(`capture ${name} timed out`);
      fs.writeFileSync(path.join(o.out, `${name}.jpg`), buf);
      emit(name, buf);
      process.stdout.write(`[splat-frames] ${name} ${buf.length} bytes\n`);
    };
    if (o.mode === "replay") {
      await shot(`${o.tag}-splash`);
      const inputs = JSON.stringify(o.script);
      for (const s of o.steps) {
        const at = await frame.evaluate<number>(`window.__a3dFrames.run(${inputs}, ${s})`);
        process.stdout.write(`[splat-frames] ${o.tag} at step ${at}\n`);
        await shot(`${o.tag}-s${String(s).padStart(4, "0")}`);
      }
    } else {
      const end = await frame.evaluate<string>(`window.__a3dFrames.untilPhase("gameOver", 1400)`);
      process.stdout.write(`[splat-frames] ${o.tag} reached ${end}\n`);
      await frame.evaluate(`window.__a3dFrames.more(25)`);
      await shot(`${o.tag}-gameover`);
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "splat-rush");
  if (!game?.url) throw new Error("splat-rush missing from manifest");
  const script = expandSegments(parseInputScript(fs.readFileSync(path.resolve(arg("--script-file") ?? "script.txt"), "utf8")));
  const steps = (arg("--steps") ?? "40,200,500,800").split(",").map(Number);
  const [vw, vh] = (arg("--viewport") ?? "640x360").split("x").map(Number) as [number, number];
  const tag = arg("--tag") ?? "orig";
  const plan = (arg("--plan") ?? "replay,idle").split(",");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  const out = path.resolve(arg("--out") ?? "frames-out");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (const mode of plan as ("replay" | "idle")[]) {
      await session(browser, { url: game.url, seed: Number(arg("--seed") ?? 20261023), warmup: Number(arg("--warmup") ?? 30), viewport: { width: vw, height: vh }, waitMs: Number(arg("--wait-ms") ?? 240000), mode, steps, script, tag: `${tag}-${mode}`, out });
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
