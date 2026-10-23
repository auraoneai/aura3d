#!/usr/bin/env tsx
/**
 * tools/crayon-capture/drift-and-deliver-frames: look-reference screenshots of the ORIGINAL "Drift & Deliver".
 * REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/drift-and-deliver.md); never run Playwright
 * on the Mac. The frames are third-party look reference for the porter: they are written under
 * evidence/look-reference-frames/ (gitignored) and are never committed.
 *
 * The page exposes `window.__tp(x, z, heading)` and `window.__sim(steps, keys, dt)`; the game's own real-time loop keeps
 * rendering (camera chase, traffic, particles), so each shot teleports/steps the car and then lets the live loop settle
 * before a screenshot.
 *
 *   node drift-and-deliver-frames.mjs --manifest games.json --out /tmp/out [--viewport 1024x576] [--shots title,z-idle,...]
 * Each frame is logged as `@@KG_CHUNK <name> <variant> <i>/<n> <base64 jpeg slice>` (same wire format as kid-goku-frames,
 * so `kid-goku-frames-assemble.ts`'s parser unpacks it).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { FRAME_SHOTS, GAME_ID, READY_EXPRESSION, keysFromMask, type FrameShot } from "./drift-and-deliver-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string; addStyleTag: (o: { content: string }) => Promise<unknown> }
interface Page { addStyleTag: (o: { content: string }) => Promise<unknown>; goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; screenshot: (o: Record<string, unknown>) => Promise<Buffer> }
interface Context { newPage: () => Promise<Page>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

export type Shot = FrameShot;
export const DEFAULT_SHOTS: readonly Shot[] = FRAME_SHOTS;

const HIDE_OUTER = `html, body, body * { visibility: hidden !important; } iframe { visibility: visible !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; z-index: 2147483647 !important; border: 0 !important; border-radius: 0 !important; margin: 0 !important; transform: none !important; }`;

const HIDE_OVERLAYS = `body > *:not(canvas), body > div:not(:has(canvas)) { visibility: hidden !important; } /* clean */`;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

async function findReadyFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    await page.waitForTimeout(2000);
    for (const f of page.frames()) {
      try { if ((await f.evaluate(READY_EXPRESSION)) === true) return f; } catch { /* navigating or building the world */ }
    }
  }
  return null;
}

/** logs the page's visible control surface once, so a later run can target the start flow precisely */
const SURVEY = `(function () {
  var g = window.__game, S = g && g.state || {};
  var prim = {};
  Object.keys(S).slice(0, 60).forEach(function (k) { var v = S[k]; if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean") prim[k] = v; });
  var btns = Array.prototype.slice.call(document.querySelectorAll("button, [role=button], a, .btn")).map(function (b) { return { id: b.id, cls: String(b.className || "").slice(0, 40), text: (b.textContent || "").trim().slice(0, 40), shown: !!(b.offsetParent) }; }).slice(0, 30);
  return JSON.stringify({ gameKeys: Object.keys(g || {}).slice(0, 60), state: prim, buttons: btns, canvases: document.querySelectorAll("canvas").length });
})()`;

const CLICK = (pattern: string): string => `(function () {
  var els = Array.prototype.slice.call(document.querySelectorAll("button, [role=button], a, .btn, li, [class*=mission], [class*=card], [class*=row]"));
  var hit = els.filter(function (b) { return b.offsetParent && /${pattern}/i.test((b.id || "") + " " + (b.textContent || "").trim().slice(0, 60)); })[0];
  if (hit) { hit.click(); return "clicked:" + (hit.id || hit.textContent || "").trim().slice(0, 40); }
  return "none";
})()`;

/** Waits for the game to leave the menu/cutscene phases, holding Space on the way. */
const WAIT_PLAYING = (ms: number): string => `(async function () {
  var g = window.__game, t0 = Date.now(), seen = [];
  var key = function (type) { var e = new KeyboardEvent(type, { key: " ", code: "Space", keyCode: 32, which: 32, bubbles: true }); window.dispatchEvent(e); document.dispatchEvent(e); };
  while (Date.now() - t0 < ${ms} && g.state.phase !== "playing") {
    key("keydown"); if (g.keys) g.keys.space = true;
    await new Promise(function (r) { setTimeout(r, 120); });
    if (seen[seen.length - 1] !== g.state.phase) seen.push(g.state.phase);
  }
  key("keyup"); if (g.keys) g.keys.space = false;
  return JSON.stringify({ phase: g.state.phase, seen: seen, ms: Date.now() - t0 });
})()`;

const stateOf = (): string => `(function () { var S = window.__game.state, P = window.__gameEntities.player; return JSON.stringify({ x: P.position.x, z: P.position.z, speed: S.speed, boost: S.boost, drifting: S.drifting, boosting: S.boosting }); })()`;

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === GAME_ID);
  if (!game?.url) throw new Error(`${GAME_ID} url missing from manifest`);
  const outDir = path.resolve(arg("--out") ?? "frames-out");
  const [vw, vh] = (arg("--viewport") ?? "1024x576").split("x").map(Number) as [number, number];
  const only = (arg("--shots") ?? "").split(",").filter(Boolean);
  const shots = DEFAULT_SHOTS.filter((s) => only.length === 0 || only.includes(s.name));
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const log = (m: string): void => { process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}\n`); };

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const frame = await findReadyFrame(page, Number(arg("--wait-ms") ?? 240000));
    if (!frame) throw new Error("game frame with __sim/__tp/__dbg not found");
    process.stdout.write(`@@KG_FRAMES_BROWSER ${browser.version()} viewport=${vw}x${vh}\n`);
    await page.addStyleTag({ content: HIDE_OUTER });
    process.stdout.write(`@@DD_SURVEY ${String(await frame.evaluate(SURVEY))}\n`);

    const shoot = async (name: string, variant: "clean" | "hud"): Promise<void> => {
      await frame.evaluate(`new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); })`);
      await page.waitForTimeout(600);
      const shot = await page.screenshot({ type: "jpeg", quality: 90, timeout: 900000 });
      fs.writeFileSync(path.join(outDir, `ref-${name}-${variant}.jpg`), shot);
      const b64 = shot.toString("base64");
      const CHUNK = 48000; // ACR log lines are truncated near 128 KiB
      const total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < total; i++) process.stdout.write(`\n@@KG_CHUNK ${name} ${variant} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
      log(`frame ${name}/${variant}: ${shot.length} bytes`);
    };
    const cleanOn = async (): Promise<void> => { await frame.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => undefined); };
    const cleanOff = async (): Promise<void> => {
      await frame.evaluate(`(function(){var all=document.querySelectorAll("style"); for(var i=0;i<all.length;i++){ if((all[i].textContent||"").indexOf("/* clean */")>=0) all[i].remove(); } return 1;})()`);
    };

    let started = false;
    for (const shot of shots) {
      if (!shot.splash && !started) {
        const mode = arg("--start") ?? "mission";
        if (mode === "mission") {
          process.stdout.write(`@@DD_JUMP ${String(await frame.evaluate(CLICK("jump to a mission")))}\n`);
          await page.waitForTimeout(2500);
          process.stdout.write(`@@DD_SURVEY_MISSIONS ${String(await frame.evaluate(SURVEY))}\n`);
          process.stdout.write(`@@DD_MISSION ${String(await frame.evaluate(CLICK("free roam")))}\n`);
        } else {
          process.stdout.write(`@@DD_START ${String(await frame.evaluate(CLICK("^start")))}\n`);
        }
        await page.waitForTimeout(2500);
        process.stdout.write(`@@DD_WAIT ${String(await frame.evaluate(WAIT_PLAYING(Number(arg("--play-wait-ms") ?? 90000))))}\n`);
        process.stdout.write(`@@DD_SURVEY_AFTER ${String(await frame.evaluate(SURVEY))}\n`);
        started = true;
        if (process.argv.includes("--explore")) break;
      }
      if (shot.spawn) await frame.evaluate(`window.__tp(${shot.spawn.x}, ${shot.spawn.z}, ${shot.spawn.heading})`);
      for (const seg of shot.drive ?? []) {
        const keys = JSON.stringify(keysFromMask(seg.keys));
        await frame.evaluate(`(function(){ var k = ${keys}; for (var i = 0; i < ${seg.steps}; i++) window.__sim(1, k, 1/60); return 1; })()`);
      }
      await page.waitForTimeout(shot.settleMs ?? 3000);
      log(`${shot.name}: ${String(await frame.evaluate(stateOf()))}`);
      await cleanOn();
      await shoot(shot.name, "clean");
      await cleanOff();
      if (shot.hud) await shoot(shot.name, "hud");
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /drift-and-deliver-frames\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
