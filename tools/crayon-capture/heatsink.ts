#!/usr/bin/env tsx
/**
 * tools/crayon-capture/heatsink — fixed-input reference run of the ORIGINAL HEATSINK game (Phase B, R-20).
 * REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * See heatsink-lib.ts for how determinism is obtained (the game's own `window.game`, `window.__force`, frozen rAF,
 * Time Trial on the explicit-point map). Each browser session runs the closed-loop policy once (recording its per-step
 * inputs as a run-length script) and then replays that script open-loop `--replays` times.
 *
 *   node heatsink.mjs --manifest games.json --sessions 2 --emit-markers --out /tmp/out [--map vesper] [--max-steps 6000]
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DEFAULT_POLICY, hookSource, pageRunnerSource, type PolicyParams, type RunOutput, type RunPayload } from "./heatsink-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

async function runInFrame(frame: Frame, payload: RunPayload): Promise<RunOutput> {
  const raw = (await frame.evaluate(pageRunnerSource(payload))) as string;
  return JSON.parse(raw) as RunOutput;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "heatsink");
  if (!game?.url) throw new Error("heatsink url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const replays = Number(arg("--replays") ?? 1);
  const waitMs = Number(arg("--wait-ms") ?? 150000);
  const maxSteps = Number(arg("--max-steps") ?? 6000);
  const snapEvery = Number(arg("--snap-every") ?? 30);
  const hudEvery = Number(arg("--hud-every") ?? 600);
  const map = arg("--map") ?? "vesper";
  const seed = Number(arg("--seed") ?? 20261022);
  const markers = process.argv.includes("--emit-markers");
  const params: PolicyParams = { ...DEFAULT_POLICY, ...(arg("--params") ? (JSON.parse(arg("--params") as string) as Partial<PolicyParams>) : {}) };
  const viewport = (arg("--viewport") ?? "800x450").split("x").map(Number);
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: viewport[0] ?? 800, height: viewport[1] ?? 450 } });
      await context.addInitScript(hookSource(map));
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findGameFrame(page, waitMs);
      const session: Record<string, unknown> = { schema: "a3d-crayon-capture-session/1", session: n, startedAt, url: game.url, browser: browser.version(), map };
      if (!frame) {
        session.error = "game frame with window.game not found";
        session.frames = page.frames().map((f) => f.url());
      } else {
        await frame.evaluate(`(window.__a3dHs.freeze = true, window.__a3dHs.dropped)`);
        session.params = params;
        const primary = await runInFrame(frame, { mode: "policy", map, maxSteps, snapEvery, hudEvery, seed, params });
        session.primary = primary;
        const reps: unknown[] = [];
        if (primary.result.outcome !== "error") {
          for (let r = 0; r < replays; r++) {
            const out = await runInFrame(frame, { mode: "script", map, maxSteps, snapEvery, hudEvery, seed, segments: primary.segments });
            reps.push(out.result);
          }
        }
        session.replays = reps;
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `heatsink.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
