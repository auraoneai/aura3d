#!/usr/bin/env tsx
/**
 * tools/crayon-capture/roadster-hours-frames: screenshots of the ORIGINAL Roadster Hours at fixed simulation steps, for the
 * art-fidelity pass (look comparison, structural metrics, blind judge). REMOTE RUN ONLY (serverless ACR Task, same recipe as
 * tools/crayon-capture/look-dump-remote.sh). The frames are third-party pixels: keep them local (evidence/look-reference-frames is
 * gitignored), never commit them.
 *
 * Drives the original through its real Drive button with the closed-loop autopilot (examples/roadster-hours-port/autopilot.ts,
 * injected as source) under virtual time, so the simulation state at step N equals the port's at step N (the reference replay
 * proves it). GL draws are switched off between captures (the simulation never reads GL) and switched on for the last frames
 * before each requested step, so the original's own renderer, shadows and post chain draw the photographed frame.
 * Frames are printed as `@@RH_FRAME <name> <i> <n> <base64 jpeg chunk>` (ACR cannot return files);
 * `roadster-hours-frames-split.ts` rebuilds the JPEGs.
 *
 *   node frames.mjs --policy-file policy.js --steps 30,720,1680 --viewport 960x540 --out /tmp/out
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HOOK_SOURCE, STORAGE_SEED_SOURCE } from "./roadster-hours-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: <T = unknown>(expr: string) => Promise<T>; click: (selector: string, o: Record<string, unknown>) => Promise<void>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; evaluate: <T = unknown>(expr: string) => Promise<T> }
type Cdp = { send: (m: string, p?: Record<string, unknown>) => Promise<{ data?: string }> };
interface Context { newPage: () => Promise<Page>; newCDPSession: (p: Page) => Promise<Cdp>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> }

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const GAME_URL = "https://app.usecrayon.ai/play/0394c9e9-577c-4bfa-8baa-68860a3612fb";

const HIDE_CHROME = `(function(){var f=document.querySelector('iframe');if(!f)return 0;var keep=new Set();for(var n=f;n;n=n.parentElement)keep.add(n);var c=0;document.querySelectorAll('body *').forEach(function(e){if(keep.has(e)||f.contains(e))return;e.style.setProperty('visibility','hidden','important');c++;});return c;})()`;

/** Reversible version of the capture library's NO_DRAW_SOURCE: `__rhDraw.off()` / `__rhDraw.on()`. */
const DRAW_TOGGLE_SOURCE = `(function () {
  var names = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"];
  var saved = [];
  var T = window.__THREE__ || window.__playlabsTHREE;
  var renderOrig = T && T.WebGLRenderer && T.WebGLRenderer.prototype && T.WebGLRenderer.prototype.render;
  window.__rhDraw = {
    off: function () {
      if (saved.length) return true;
      [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach(function (C) {
        if (!C) return;
        names.forEach(function (n) { if (C.prototype[n]) { saved.push([C, n, C.prototype[n]]); C.prototype[n] = function () {}; } });
      });
      if (renderOrig) T.WebGLRenderer.prototype.render = function () {};
      return true;
    },
    on: function () {
      saved.forEach(function (e) { e[0].prototype[e[1]] = e[2]; });
      saved = [];
      if (renderOrig) T.WebGLRenderer.prototype.render = renderOrig;
      return true;
    },
    hasThree: !!renderOrig
  };
  return true;
})()`;

/** Hides everything inside the game frame except the canvas (its own HUD, overlays); `__rhBare.restore()` undoes it. */
const BARE_SOURCE = `(function () {
  var c = document.querySelector('canvas');
  if (!c) return 0;
  var keep = new Set();
  for (var n = c; n; n = n.parentElement) keep.add(n);
  var hidden = [];
  document.querySelectorAll('body *').forEach(function (e) {
    if (keep.has(e) || c.contains(e)) return;
    hidden.push([e, e.style.getPropertyValue('visibility'), e.style.getPropertyPriority('visibility')]);
    e.style.setProperty('visibility', 'hidden', 'important');
  });
  window.__rhBare = { restore: function () { hidden.forEach(function (h) { if (h[1]) h[0].style.setProperty('visibility', h[1], h[2]); else h[0].style.removeProperty('visibility'); }); hidden = []; } };
  return hidden.length;
})()`;

function emit(name: string, jpeg: Buffer): void {
  const b64 = jpeg.toString("base64");
  const size = 1800;
  const n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) process.stdout.write(`@@RH_FRAME ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}\n`);
}

async function findGameFrame(page: Page, timeoutMs: number): Promise<Frame> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const f of page.frames()) {
      try {
        if (await f.evaluate<boolean>(`typeof window.skybreak === "object" && !!window.skybreak.snapshot && !!window.skybreak.snapshot().screen`)) return f;
      } catch { /* frame navigating or evaluating slowly under software GL */ }
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("game frame (window.skybreak) never appeared");
}

async function main(): Promise<void> {
  const steps = (arg("--steps") ?? "30,720,1680,2400,3000,3600,4200,4800").split(",").map(Number).sort((a, b) => a - b);
  const names = (arg("--names") ?? "").split(",").filter(Boolean);
  const [vw, vh] = (arg("--viewport") ?? "480x270").split("x").map(Number) as [number, number];
  const frameMs = Number(arg("--frame-ms") ?? 50);
  const drawFrames = Number(arg("--draw-frames") ?? 0);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1]!] : []));
  const out = path.resolve(arg("--out") ?? "frames-out");
  fs.mkdirSync(out, { recursive: true });
  const policy = fs.readFileSync(path.resolve(arg("--policy-file") ?? "policy.js"), "utf8");
  const init = `${STORAGE_SEED_SOURCE};\n${HOOK_SOURCE}\n${policy}\n;window.__rhPolicy = function (z) { return __rhPolicyMod.autopilot(z); };\n${DRAW_TOGGLE_SOURCE}`;
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    await context.addInitScript(init);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.goto(arg("--url") ?? GAME_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    const frame = await findGameFrame(page, Number(arg("--load-wait-ms") ?? 420000));
    process.stdout.write(`[rh-frames] game frame ready\n`);
    const shot = async (name: string): Promise<void> => {
      await page.evaluate(HIDE_CHROME).catch(() => undefined);
      let buf: Buffer | null = null;
      for (let attempt = 0; attempt < 2 && !buf; attempt++) {
        const r = await Promise.race([cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true }), new Promise<{ data?: string }>((res) => setTimeout(() => res({}), 420000))]);
        if (r.data) buf = Buffer.from(r.data, "base64");
      }
      if (!buf) throw new Error(`capture ${name} timed out`);
      fs.writeFileSync(path.join(out, `${name}.jpg`), buf);
      emit(name, buf);
      process.stdout.write(`[rh-frames] ${name} ${buf.length} bytes\n`);
    };
    await frame.evaluate(`window.__rhCap.mode = "policy"; window.__rhCap.policy = window.__rhPolicy; 0`);
    await shot("orig-menu");
    await frame.click(`button[data-action="start"][data-value="0"]`, { timeout: 240000 });
    await frame.evaluate(`window.__a3dVT.enable(); 0`);
    await page.waitForTimeout(3000);
    const started = Date.now();
    for (;;) {
      const screen = await frame.evaluate<string>(`window.skybreak.snapshot().screen`);
      if (screen === "play") break;
      if (Date.now() - started > 300000) throw new Error(`route never started (screen ${screen})`);
      await page.waitForTimeout(2000);
    }
    await frame.evaluate(`window.__rhDraw.off()`);
    const now = (): Promise<number> => frame.evaluate<number>(`window.__rhCap.steps`);
    for (const [index, target] of steps.entries()) {
      for (;;) {
        const at = await now();
        if (at >= target) break;
        const remainingFrames = Math.ceil((target - at) / 6);
        if (remainingFrames > drawFrames + 1) {
          await frame.evaluate(`window.__a3dVT.step(${remainingFrames - drawFrames - 1}, ${frameMs}); 0`);
        } else {
          await frame.evaluate(`window.__rhDraw.on(); window.__a3dVT.step(1, ${frameMs}); 0`);
        }
      }
      // draw exactly one frame at the current simulation time (0 ms advance): the canvas shows this step, not an older frame
      await frame.evaluate(`window.__rhDraw.on(); window.__a3dVT.step(1, 0); 0`);
      const actual = await now();
      const name = `orig-${names[index] ?? `s${String(target).padStart(4, "0")}`}`;
      process.stdout.write(`[rh-frames] ${name} requested ${target} actual ${actual}\n`);
      await shot(name);
      await frame.evaluate(BARE_SOURCE);
      await shot(`${name}-bare`);
      await frame.evaluate(`window.__rhBare && window.__rhBare.restore(); 0`);
      await frame.evaluate(`window.__rhDraw.off()`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
