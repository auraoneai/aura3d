#!/usr/bin/env tsx
/**
 * tools/crayon-capture/heatsink-frames: screenshots of the ORIGINAL HEATSINK at fixed simulation steps (Phase B blind judge).
 * REMOTE RUN ONLY (serverless ACR Task); never run Playwright on the Mac.
 *
 * Replays the recorded input script (evidence/crayon-capture/heatsink-reference.json -> script.text) through the
 * original's own `game.frame(1/60)` with the same pre-boot hook and per-run reset as the state reference, but lets
 * the original's real `game.render` draw for the last `--lead` steps before each target so its chase camera settles,
 * then screenshots the page with the DOM HUD hidden (a synchronous canvas read-back blocks forever on the original's WebGPU canvas). Each frame is logged as
 * `@@HEATSINK_FRAME <step> <base64 jpeg>`; the matching port frames come from tests/browser/heatsink-port.spec.ts.
 *
 *   node heatsink-frames.mjs --manifest games.json --reference reference.json --steps 450,750,... --out /tmp/out
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HEATSINK_STEP, hookSource } from "./heatsink-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string; addStyleTag: (o: { content: string }) => Promise<unknown> }
interface Page { addStyleTag: (o: { content: string }) => Promise<unknown>; goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; screenshot: (o: Record<string, unknown>) => Promise<Buffer> }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

const CLICK_START = `(function () {
  var els = document.querySelectorAll("button,[role=button],a,div,span");
  for (var i = 0; i < els.length; i++) {
    var t = (els[i].textContent || "").trim().toLowerCase();
    if (t && t.length < 40 && /tap to start|click to start/.test(t)) { els[i].click(); return t; }
  }
  return null;
})()`;
const READY = `!!(window.game && window.game.ready && window.game.track && window.game.player && typeof window.__heatsinkSwitch === "function")`;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

const SETUP = (map: string, seed: number, segments: unknown): string => `(async function () {
  var game = window.game, DT = ${HEATSINK_STEP};
  var S = (window.__hsFrames = { step: 0, origRender: game.render, inputs: [], DT: DT });
  var segs = ${JSON.stringify(segments)};
  for (var i = 0; i < segs.length; i++) for (var k = 0; k < segs[i].n; k++) S.inputs.push(segs[i].input);
  game.render = function () {};
  window.__a3dSeed(${seed});
  game.mode = "trial";
  await window.__heatsinkSwitch(${JSON.stringify(map)});
  game.mode = "trial";
  game.setEvent(game.event);
  game.paused = false;
  try { game.ui.close(); } catch (e) {}
  var pk = game.pickupObjs || [], bl = game.barrelObjs || [];
  for (var pi = 0; pi < pk.length; pi++) { pk[pi].respawn = 0; try { pk[pi].obj.visible = true; } catch (e) {} }
  for (var bi = 0; bi < bl.length; bi++) { bl[bi].alive = true; bl[bi].respawn = 0; try { bl[bi].obj.visible = true; } catch (e) {} }
  game.time = 0; game.timeScale = 1; game.slowT = 0; game.resultsT = 0; game.paused = false;
  game.player.ckPrevS = undefined; game.player.nearCd = 0; game.player.nearO = null; game.player.lane = 0; game.player.turboT = 0;
  game.startRace();
  return "ok";
})()`;

/** inside the game frame show only the main 3D canvas (the minimap is a second, small canvas); in the outer runtime page show only the game iframe (hides its Exit button) */
const HIDE_INNER = `html, body, body * { visibility: hidden !important; } canvas[data-hs-main] { visibility: visible !important; }`;
const HIDE_OUTER = `html, body, body * { visibility: hidden !important; } iframe { visibility: visible !important; }`;
const MARK_MAIN = `(function () {
  var cs = document.querySelectorAll("canvas"), best = null;
  for (var i = 0; i < cs.length; i++) if (!best || cs[i].width * cs[i].height > best.width * best.height) best = cs[i];
  if (best) best.setAttribute("data-hs-main", "1");
  return cs.length;
})()`;

/** steps without drawing, except the last `lead` steps, where the original's own frame() calls its real render(e, t) */
const RUN_TO = (target: number, lead: number): string => `(function () {
  var game = window.game, S = window.__hsFrames;
  var noop = function () {};
  while (S.step < ${target}) {
    var inp = S.inputs[S.step];
    window.__force = { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, afterburner: inp.afterburner, ramjet: inp.ramjet, drift: inp.drift, fire: inp.fire };
    var draw = S.step >= ${target - lead};
    game.render = draw ? S.origRender : noop;
    game.frame(S.DT);
    if (!draw) { try { game.player.updateVisual(game.time); } catch (e) {} }
    S.step++;
  }
  game.render = noop;
  return JSON.stringify({ step: S.step, state: game.state, screen: game.ui && game.ui.screen, open: game.ui && game.ui.open, s: game.player.s });
})()`;

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(1500);
    for (const f of page.frames()) {
      let ready = false;
      try { ready = (await f.evaluate(READY)) === true; } catch { /* navigating */ }
      if (ready) return f;
      try { await f.evaluate(CLICK_START); } catch { /* navigating */ }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const url = manifest.games.find((g) => g.id === "heatsink")?.url;
  if (!url) throw new Error("heatsink url missing from manifest");
  const reference = JSON.parse(fs.readFileSync(path.resolve(arg("--reference") ?? "reference.json"), "utf8")) as { script: { segments: unknown } };
  const steps = (arg("--steps") ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!steps.length) throw new Error("--steps is required");
  const lead = Number(arg("--lead") ?? 30);
  const map = arg("--map") ?? "vesper";
  const seed = Number(arg("--seed") ?? 20261022);
  const viewport = (arg("--viewport") ?? "800x450").split("x").map(Number);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  const outDir = path.resolve(arg("--out") ?? "frames-out");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: viewport[0] ?? 800, height: viewport[1] ?? 450 } });
    await context.addInitScript(hookSource(map));
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const frame = await findGameFrame(page, Number(arg("--wait-ms") ?? 150000));
    if (!frame) throw new Error("game frame with window.game not found");
    await frame.evaluate(`(window.__a3dHs.freeze = true, window.__a3dHs.dropped)`);
    const t0 = Date.now();
    const log = (m: string): void => { process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}\n`); };
    await frame.evaluate(SETUP(map, seed, reference.script.segments));
    log("setup done");
    await frame.evaluate(MARK_MAIN);
    await frame.addStyleTag({ content: HIDE_INNER });
    await page.addStyleTag({ content: HIDE_OUTER });
    process.stdout.write(`@@HEATSINK_FRAMES_BROWSER ${browser.version()} viewport=${viewport.join("x")} lead=${lead}\n`);
    for (const target of steps) {
      log(`stepping to ${target}`);
      const at = await frame.evaluate(RUN_TO(target, lead));
      log(`reached ${String(at)}, waiting for the GPU queue to drain`);
      await page.waitForTimeout(500);
      const shot = await page.screenshot({ type: "jpeg", quality: 92, timeout: 900000 });
      fs.writeFileSync(path.join(outDir, `original-${target}.jpg`), shot);
      process.stdout.write(`@@HEATSINK_FRAME ${target} ${shot.toString("base64")}\n`);
      log(`frame ${target}: ${shot.length} bytes`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
