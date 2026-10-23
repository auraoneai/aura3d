#!/usr/bin/env tsx
/**
 * tools/crayon-capture/silt-and-signal-ref-frames: screenshots of the ORIGINAL Silt & Signal at matched game states (the
 * `qa.chapter(c, o)` jump the port's `createSim(c, o)` mirrors), for local look comparison only. REMOTE RUN ONLY (serverless ACR Task,
 * same recipe as silt-and-signal.ts). The frames are third-party screenshots: never commit them.
 *
 *   node silt-ref-frames.mjs --manifest games.json --states 0:0,0:1,0:2,0:3,1:0 --emit-markers
 * Prints each frame as `@@SILT_REF <chapter>-<objective> <i> <n> <base64 jpeg>` lines (rebuild with silt-and-signal-frames-split.ts --marker SILT_REF).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HAS_SILT_QA, HOOK_SOURCE } from "./silt-and-signal-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };
interface Frame { evaluate: (expr: string) => Promise<unknown> }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; }
interface Cdp { send: (m: string, p: Record<string, unknown>) => Promise<{ data?: string }> }
interface Context { newCDPSession: (p: Page) => Promise<Cdp>; newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> }

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };

const JUMP = (chapter: number, objective: number): string => `(async function () {
  var S = window.__a3dSilt, silt = window.silt;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  S.noDraw = false;
  S.startFree();
  await silt.qa.chapter(${chapter}, ${objective});
  for (var w = 0; w < 200; w++) { await sleep(20); if (silt.inspect().mode === "play") break; }
  await sleep(400);
  S.stopFree();
  silt.qa.pose({ yaw: 0, hold: 0 });
  S.noDraw = true;
  for (var i = 0; i < 300; i++) S.pump();
  S.noDraw = false;
  for (var j = 0; j < 4; j++) S.pump();
  var snap = silt.inspect();
  return JSON.stringify({ mode: snap.mode, x: snap.state.x, y: snap.state.y, z: snap.state.z, yaw: snap.state.yaw });
})()`;

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "silt-and-signal");
  if (!game?.url) throw new Error("silt-and-signal url missing from manifest");
  const states = (arg("--states") ?? "0:0,0:1,0:2,0:3,1:0").split(",").filter(Boolean).map((r) => r.split(":").map(Number) as [number, number]);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(HOOK_SOURCE);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    let frame: Frame | null = null;
    for (let t = 0; t < 120 && !frame; t++) {
      await page.waitForTimeout(2000);
      for (const f of page.frames()) { try { if ((await f.evaluate(HAS_SILT_QA)) === true) frame = f; } catch { /* navigating */ } }
    }
    if (!frame) throw new Error("game frame with window.silt.qa not found");
    for (const [chapter, objective] of states) {
      const info = (await frame.evaluate(JUMP(chapter, objective))) as string;
      // let the page's own rAF run while Playwright waits for a stable frame, then freeze again
      await frame.evaluate("window.__a3dSilt.startFree(); 0");
      await page.waitForTimeout(1500);
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, fromSurface: true });
      const jpeg = Buffer.from(shot.data ?? "", "base64");
      await frame.evaluate("window.__a3dSilt.stopFree(); 0");
      const b64 = jpeg.toString("base64"), n = Math.ceil(b64.length / 60000);
      for (let i = 0; i < n; i++) process.stdout.write(`@@SILT_REF ${chapter}-${objective} ${i} ${n} ${b64.slice(i * 60000, (i + 1) * 60000)}\n`);
      process.stdout.write(`@@SILT_REFINFO ${chapter}-${objective} ${info}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
