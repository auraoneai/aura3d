#!/usr/bin/env tsx
/**
 * tools/crayon-capture/kid-goku-frames: look-reference screenshots of the ORIGINAL "Kid Goku: Beyond the Clouds"
 * along its whole course. REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/README.md); never run
 * Playwright on the Mac. The frames are third-party look reference for the porter: they are written under
 * evidence/look-reference-frames/ (gitignored) and are never committed.
 *
 * The game exposes `window.__CLOUD_RUNNER__.debug.at(s)` (teleport along the course) and `.debug.nimbus(charge)`. A pre-boot hook
 * virtualises requestAnimationFrame/performance.now and lets us switch GL draws on only for the last few steps before a screenshot
 * (a software WebGL renderer cannot afford drawing every step).
 *
 *   node kid-goku-frames.mjs --manifest games.json --out /tmp/out [--viewport 1280x720] [--shots menu,s30,...]
 * Each frame is logged as `@@KG_FRAME <name> <variant> <base64 jpeg>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string; addStyleTag: (o: { content: string }) => Promise<unknown> }
interface Page { addStyleTag: (o: { content: string }) => Promise<unknown>; goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; screenshot: (o: Record<string, unknown>) => Promise<Buffer> }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

export interface Shot { readonly name: string; readonly at?: number; readonly nimbus?: boolean; readonly hud?: boolean; readonly settle?: number }

/** menu + a sweep of the course; `hud` shots are also taken with the DOM HUD visible. */
export const DEFAULT_SHOTS: readonly Shot[] = [
  { name: "menu", hud: true },
  { name: "s0", at: 0, hud: true, settle: 60 },
  { name: "s60", at: 60, settle: 50 },
  { name: "s154", at: 148, settle: 25 },
  { name: "s300", at: 295, settle: 60 },
  { name: "s470", at: 430, hud: true, settle: 40 },
  { name: "s570", at: 545, settle: 60 },
  { name: "s700", at: 690, nimbus: true, hud: true, settle: 90 },
  { name: "s900", at: 880, settle: 60 },
  { name: "s1040", at: 1040, settle: 60 },
  { name: "s1100", at: 1090, settle: 40 },
  { name: "s1300", at: 1270, settle: 40 },
  { name: "s1400", at: 1380, settle: 50 },
  { name: "s1560", at: 1555, settle: 40 },
  { name: "s1700", at: 1690, settle: 50 },
  { name: "s1900", at: 1900, settle: 60 }
];

/** Pre-boot hook: live until `freeze()`, then manual stepping with a draw switch. Self-contained. */
export const HOOK_SOURCE = `(function () {
  if (window.__kgVT) return;
  var realRAF = window.requestAnimationFrame.bind(window);
  var realCancel = window.cancelAnimationFrame.bind(window);
  var realNow = performance.now.bind(performance);
  var frozen = false, queue = [], vnow = 0, nextId = 1000000000, noDraw = false;
  window.requestAnimationFrame = function (cb) {
    if (!frozen) return realRAF(cb);
    var id = nextId++; queue.push({ id: id, cb: cb }); return id;
  };
  window.cancelAnimationFrame = function (id) {
    if (!frozen || id < 1000000000) return realCancel(id);
    queue = queue.filter(function (q) { return q.id !== id; });
  };
  ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"].forEach(function (name) {
    [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach(function (C) {
      if (!C || !C.prototype[name]) return;
      var orig = C.prototype[name];
      C.prototype[name] = function () { if (noDraw) return; return orig.apply(this, arguments); };
    });
  });
  var seed = 0x2545F491;
  function seeded() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  window.__kgVT = {
    freeze: function () { if (frozen) return vnow; vnow = realNow(); performance.now = function () { return vnow; }; Math.random = seeded; frozen = true; return vnow; },
    setNoDraw: function (b) { noDraw = !!b; },
    step: function (n, dtMs) {
      for (var i = 0; i < n; i++) {
        vnow += dtMs;
        var list = queue; queue = [];
        for (var j = 0; j < list.length; j++) { try { list[j].cb(vnow); } catch (e) { window.__kgVTErr = String(e && e.stack || e); } }
      }
      return vnow;
    },
    pending: function () { return queue.length; },
    frozen: function () { return frozen; }
  };
})();`;

const HIDE_HUD = `#hud, #touch, #callout, #toast, #cutin, #ball-count, #loading { visibility: hidden !important; }`;
const HIDE_OUTER = `html, body, body * { visibility: hidden !important; } iframe { visibility: visible !important; }`;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

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

/* frames are emitted as `@@KG_CHUNK <name> <variant> <i>/<n> <base64 slice>` lines */

/** runs inside the game frame: step `n` frames with draws off, then `drawn` frames with draws on */
const DRAWN = Number(arg("--drawn") ?? 6);
const STEP_TO = (n: number, drawn: number): string => `(async function () {
  var vt = window.__kgVT, DT = 1000 / 60, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  vt.setNoDraw(true);
  for (var i = 0; i < ${n}; i++) { vt.step(1, DT); if (i % 20 === 0) await sleep(2); }
  vt.setNoDraw(false);
  for (var k = 0; k < ${drawn}; k++) { vt.step(1, DT); await sleep(20); }
  var s = window.__CLOUD_RUNNER__.snapshot();
  return JSON.stringify({ phase: s.phase, s: s.s, lane: s.lane, hearts: s.hearts, speed: s.speed, nimbus: s.nimbus });
})()`;

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url: string }[] };
  const game = manifest.games.find((g) => g.id === "kid-goku-beyond-the-clouds");
  if (!game) throw new Error("kid-goku-beyond-the-clouds not in manifest");
  const outDir = path.resolve(arg("--out") ?? "frames-out");
  const [vw, vh] = (arg("--viewport") ?? "1280x720").split("x").map(Number) as [number, number];
  const only = (arg("--shots") ?? "").split(",").filter(Boolean);
  const shots = DEFAULT_SHOTS.filter((s) => only.length === 0 || only.includes(s.name));
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const log = (m: string): void => { process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}\n`); };

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    await context.addInitScript(HOOK_SOURCE);
    const page = await context.newPage();
    await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const frame = await findGameFrame(page, Number(arg("--wait-ms") ?? 240000));
    if (!frame) throw new Error("game frame with __CLOUD_RUNNER__ not found");
    process.stdout.write(`@@KG_FRAMES_BROWSER ${browser.version()} viewport=${vw}x${vh}\n`);
    // wait for the title screen, freeze, prime
    for (let i = 0; i < 240; i++) {
      const ph = await frame.evaluate(`window.__CLOUD_RUNNER__.snapshot().phase`);
      if (ph === "menu" || ph === "playing") break;
      await page.waitForTimeout(500);
    }
    await frame.evaluate(`window.__kgVT.freeze()`);
    await page.waitForTimeout(400);
    await page.addStyleTag({ content: HIDE_OUTER });
    log("frozen, on the title screen");
    const shoot = async (name: string, variant: "clean" | "hud"): Promise<void> => {
      await page.waitForTimeout(700);
      const shot = await page.screenshot({ type: "jpeg", quality: 90, timeout: 900000 });
      fs.writeFileSync(path.join(outDir, `ref-${name}-${variant}.jpg`), shot);
      const b64 = shot.toString("base64");
      const CHUNK = 48000; // ACR log lines are truncated near 128 KiB
      const total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < total; i++) process.stdout.write(`\n@@KG_CHUNK ${name} ${variant} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)} ;\n`);
      log(`frame ${name}/${variant}: ${shot.length} bytes`);
    };
    let started = false;
    for (const shot of shots) {
      let info = "";
      if (shot.name === "menu") {
        info = String(await frame.evaluate(STEP_TO(8, DRAWN)));
      } else {
        if (!started) {
          await frame.evaluate(`(function(){var b=document.getElementById("start"); if(b) b.click(); return !!b;})()`);
          await frame.evaluate(`(async function(){var vt=window.__kgVT,DT=1000/60; vt.setNoDraw(true); for(var g=0; g<900 && window.__CLOUD_RUNNER__.snapshot().phase!=="playing"; g++){vt.step(1,DT); if(g%10===0) await new Promise(function(r){setTimeout(r,20)});} return window.__CLOUD_RUNNER__.snapshot().phase;})()`);
          started = true;
          log("run started");
        }
        await frame.evaluate(`window.__CLOUD_RUNNER__.debug.at(${shot.at ?? 0})`);
        if (shot.nimbus) {
          await frame.evaluate(`(function(){var d=window.__CLOUD_RUNNER__.debug; d.nimbus(1); d.press("KeyQ"); return 1;})()`);
        }
        info = String(await frame.evaluate(STEP_TO(shot.settle ?? 50, DRAWN)));
      }
      log(`${shot.name}: ${info}`);
      await frame.addStyleTag({ content: HIDE_HUD.replace("{", "{ /* clean */") }).catch(() => undefined);
      await shoot(shot.name, "clean");
      if (shot.hud && !process.argv.includes("--no-hud")) {
        await frame.evaluate(`(function(){var all=document.querySelectorAll("style"); for(var i=0;i<all.length;i++){ if((all[i].textContent||"").indexOf("/* clean */")>=0) all[i].remove(); } return 1;})()`);
        await shoot(shot.name, "hud");
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /kid-goku-frames\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
