#!/usr/bin/env tsx
/**
 * tools/crayon-capture/where-the-wind-wanders-frames: screenshots of the ORIGINAL game at fixed steps of the
 * recorded key script, for the blind judge and the contact sheets. REMOTE RUN ONLY (serverless ACR Task;
 * recipe in tools/crayon-capture/look-dump-remote.sh); never Playwright on the Mac.
 *
 * Reuses the capture harness hook (virtual time, synthetic key events) from where-the-wind-wanders.ts, replays
 * `script` from the port's replay fixture exactly as the port's browser spec does, and at each requested step lets
 * the original's own renderer draw one frame, hides every DOM element except the canvas, and screenshots the page.
 * Each frame is logged as `@@WIND_ORIG_FRAME <name> <base64 jpeg>`; the matching port frames are the
 * `WIND_FRAME <name>` lines of tests/browser/where-the-wind-wanders-port.spec.ts. The original's pixels are
 * third-party content: keep them local and gitignored, never commit them.
 *
 *   node frames.mjs --manifest games.json --script replay.json --steps 60:idle,306,1172,2098 [--viewport 960x540]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HOOK_SOURCE, VIRTUAL_STEP_MS } from "./where-the-wind-wanders.js";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

type Frame = { evaluate: (fn: string) => Promise<unknown>; url: () => string; addStyleTag: (o: { content: string }) => Promise<unknown> };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; screenshot: (o: Record<string, unknown>) => Promise<Buffer> };
type Context = { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> };
type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> };

interface Segment { keys: string; act: "E" | "Space" | null; steps: number }

const HIDE_DOM = `*:not(canvas):not(html):not(body):not(iframe) { visibility: hidden !important; } canvas { visibility: visible !important; } body { background: #000 !important; }`;

async function main(): Promise<void> {
  const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
  const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "where-the-wind-wanders");
  if (!game?.url) throw new Error("where-the-wind-wanders missing from manifest");
  const replay = JSON.parse(fs.readFileSync(path.resolve(arg("--script") ?? "replay.json"), "utf8")) as { script: Segment[]; steps: number };
  const wanted = (arg("--steps") ?? "60:idle,306,1172,2098").split(",").map((s) => {
    const [n, tag] = s.split(":");
    return { step: Number(n), idle: tag === "idle" };
  });
  const [vw, vh] = (arg("--viewport") ?? "960x540").split("x").map(Number) as [number, number];
  const readyMs = Number(arg("--ready-ms") ?? 150000);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1]] : []));
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh } });
    await context.addInitScript(HOOK_SOURCE);
    const page = await context.newPage();
    await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const started = Date.now();
    let frame: Frame | null = null;
    while (Date.now() - started < readyMs) {
      await page.waitForTimeout(1500);
      for (const f of page.frames()) {
        try {
          const ready = (await f.evaluate(`(function(){var W=window.__a3dWW;return !!(W&&W.rafCalls>3&&W.scenes.length&&W.findPlayer());})()`)) as boolean;
          if (ready) { frame = f; break; }
        } catch { /* navigating */ }
      }
      if (frame) break;
    }
    if (!frame) throw new Error(`game not ready after ${readyMs} ms`);
    await frame.evaluate(`(function(){ var W = window.__a3dWW; W.engage(); return true; })()`);
    await page.waitForTimeout(300);
    await frame.evaluate(`window.__a3dWW.rebase()`);
    await frame.addStyleTag({ content: HIDE_DOM });
    await frame.evaluate(`(function () {
      var W = window.__a3dWW;
      W.held = {};
      W.setKeys = function (keys) {
        var want = {};
        for (var i = 0; i < keys.length; i++) want["Key" + keys[i]] = true;
        Object.keys(W.held).forEach(function (c) { if (!want[c]) { W.key("keyup", c); delete W.held[c]; } });
        Object.keys(want).forEach(function (c) { if (!W.held[c]) { W.key("keydown", c); W.held[c] = true; } });
      };
      W.stepOnce = function (keys, act) {
        W.setKeys(keys);
        if (act === "E") { W.key("keydown", "KeyE"); W.key("keyup", "KeyE"); }
        if (act === "Space") { W.key("keydown", "Space"); W.key("keyup", "Space"); }
        W.step(1);
      };
      W.draw = function () {
        W.renderers.forEach(function (r) { if (r.__a3dRender) r.render = r.__a3dRender; });
        W.step(1);
        W.renderers.forEach(function (r) { r.render = function () {}; });
      };
      return true;
    })()`);
    const shoot = async (name: string): Promise<void> => {
      await frame!.evaluate(`window.__a3dWW.draw()`);
      await page.waitForTimeout(400);
      const jpg = await page.screenshot({ type: "jpeg", quality: 85 });
      process.stdout.write(`@@WIND_ORIG_FRAME ${name} ${jpg.toString("base64")}\n`);
    };
    const targets = new Map(wanted.filter((w) => !w.idle).map((w) => [w.step, `step-${w.step}`] as const));
    // the idle frame: sixty untouched steps from the start, as the port's `start` frame
    const idleWanted = wanted.find((w) => w.idle);
    if (idleWanted) {
      await frame.evaluate(`(function(){ for (var i = 0; i < ${idleWanted.step}; i++) window.__a3dWW.stepOnce("", null); return true; })()`);
      await shoot("start");
      // a fresh session is needed for the scripted replay: reload and re-engage
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      let again: Frame | null = null;
      const t2 = Date.now();
      while (Date.now() - t2 < readyMs && !again) {
        await page.waitForTimeout(1500);
        for (const f of page.frames()) {
          try {
            const ready = (await f.evaluate(`(function(){var W=window.__a3dWW;return !!(W&&W.rafCalls>3&&W.scenes.length&&W.findPlayer());})()`)) as boolean;
            if (ready) { again = f; break; }
          } catch { /* navigating */ }
        }
      }
      if (!again) throw new Error("game did not come back after reload");
      frame = again;
      await frame.evaluate(`(function(){ var W = window.__a3dWW; W.engage(); return true; })()`);
      await page.waitForTimeout(300);
      await frame.evaluate(`window.__a3dWW.rebase()`);
      await frame.addStyleTag({ content: HIDE_DOM });
      await frame.evaluate(`(function () {
        var W = window.__a3dWW;
        W.held = {};
        W.setKeys = function (keys) {
          var want = {};
          for (var i = 0; i < keys.length; i++) want["Key" + keys[i]] = true;
          Object.keys(W.held).forEach(function (c) { if (!want[c]) { W.key("keyup", c); delete W.held[c]; } });
          Object.keys(want).forEach(function (c) { if (!W.held[c]) { W.key("keydown", c); W.held[c] = true; } });
        };
        W.stepOnce = function (keys, act) {
          W.setKeys(keys);
          if (act === "E") { W.key("keydown", "KeyE"); W.key("keyup", "KeyE"); }
          if (act === "Space") { W.key("keydown", "Space"); W.key("keyup", "Space"); }
          W.step(1);
        };
        W.draw = function () {
          W.renderers.forEach(function (r) { if (r.__a3dRender) r.render = r.__a3dRender; });
          W.step(1);
          W.renderers.forEach(function (r) { r.render = function () {}; });
        };
        return true;
      })()`);
    }
    let done = 0;
    for (const seg of replay.script) {
      for (let i = 0; i < seg.steps; i++) {
        await frame.evaluate(`window.__a3dWW.stepOnce(${JSON.stringify(seg.keys)}, ${JSON.stringify(i === 0 ? seg.act : null)})`);
        done++;
        const name = targets.get(done);
        if (name) await shoot(name);
      }
    }
    process.stderr.write(`replayed ${done} of ${replay.steps} steps\n`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
export { VIRTUAL_STEP_MS };
