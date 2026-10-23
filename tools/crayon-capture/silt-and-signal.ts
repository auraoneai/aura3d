#!/usr/bin/env tsx
/**
 * tools/crayon-capture/silt-and-signal — scripted, repeatable ride of the ORIGINAL Silt & Signal
 * (R-20 / R-25 reference). REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/README.md);
 * never run Playwright on the Mac.
 *
 * A pre-boot hook (lib HOOK_SOURCE) turns on the game's own `window.silt.qa` API, seeds Math.random and
 * replaces rAF/performance.now with a manual clock; the game's main loop derives dt from the rAF
 * timestamp, so one pump per step is an exact 1/60 s step. A closed-loop keyboard policy rides an
 * objective from `qa.chapter(c, o)`, recording the per-step state and an RLE input script; the script is
 * then replayed (determinism) in the same page and, in every session, in a fresh browser context.
 *
 *   node silt-and-signal.mjs --manifest games.json --sessions 2 --runs 0:0,0:2 --emit-markers --out /tmp/out
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DEFAULT_SILT_POLICY, HAS_SILT_QA, HOOK_SOURCE, pageRunnerSource, siltPolicy, summarizeTrace, type SiltPolicyParams, type SiltRunOutput, type SiltRunPayload } from "./silt-and-signal-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function runInFrame(frame: Frame, payload: SiltRunPayload): Promise<{ out: SiltRunOutput; wallMs: number }> {
  const t0 = Date.now();
  const raw = (await frame.evaluate(pageRunnerSource(siltPolicy.toString(), payload))) as string;
  const out = JSON.parse(raw) as SiltRunOutput;
  if (out.trace.length > 0) out.summary = summarizeTrace(out.trace, payload.objective);
  else out.summary = { steps: 0, completed: false, completedAtStep: null, finalObjective: payload.objective, finalPoint: 0, impacts: 0, final: [0, 0, 0, 0, 0, 0, 0, 0, 0, payload.objective, 0, 0, 0] };
  return { out, wallMs: Date.now() - t0 };
}

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(2000);
    for (const f of page.frames()) {
      let ready = false;
      try { ready = (await f.evaluate(HAS_SILT_QA)) === true; } catch { /* navigating */ }
      if (ready) return f;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "silt-and-signal");
  if (!game?.url) throw new Error("silt-and-signal url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const waitMs = Number(arg("--wait-ms") ?? 240000);
  const maxSteps = Number(arg("--max-steps") ?? 5400);
  const runs = (arg("--runs") ?? "0:0,0:2").split(",").filter(Boolean).map((r) => r.split(":").map(Number) as [number, number]);
  const params: SiltPolicyParams = { ...DEFAULT_SILT_POLICY, ...(arg("--params") ? (JSON.parse(arg("--params") as string) as Partial<SiltPolicyParams>) : {}) };
  const viewport = (arg("--viewport") ?? "800x450").split("x").map(Number) as [number, number];
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] } });
      await context.addInitScript(HOOK_SOURCE);
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 120000 });
      const frame = await findGameFrame(page, waitMs);
      const session: Record<string, unknown> = { schema: "a3d-crayon-capture-session/1", game: "silt-and-signal", session: n, startedAt, url: game.url, browser: browser.version(), viewport, params };
      if (!frame) {
        session.error = "game frame with window.silt.qa not found";
        session.frames = page.frames().map((f) => f.url());
      } else {
        const results: Record<string, unknown>[] = [];
        for (let r = 0; r < runs.length; r++) {
          const [chapter, objective] = runs[r] as [number, number];
          const primary = await runInFrame(frame, { mode: "policy", chapter, objective, params, maxSteps, world: n === 1 && r === 0 });
          const entry: Record<string, unknown> = { chapter, objective, primary: primary.out, primaryWallMs: primary.wallMs };
          if (primary.out.summary.completed) {
            const replay = await runInFrame(frame, { mode: "script", chapter, objective, segments: primary.out.segments, maxSteps });
            entry.replay = { trace: replay.out.trace, summary: replay.out.summary, errors: replay.out.errors, wallMs: replay.wallMs };
          }
          results.push(entry);
          // Print a cumulative block after every ride: an ACR step timeout would otherwise lose the whole session.
          if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${JSON.stringify({ ...session, runs: results, partial: r < runs.length - 1 })}\n@@CRAYON_CAPTURE_END:${n}\n`);
        }
        session.runs = results;
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `silt-and-signal.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
