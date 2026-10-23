#!/usr/bin/env tsx
/**
 * tools/crayon-capture/strange-orbit — scripted, repeatable playthrough of the ORIGINAL
 * Strange Orbit game (Phase A reference, R-20). REMOTE RUN ONLY (serverless ACR Task,
 * recipe in evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * The game's sim is a pure `pp(state, input, 1/60)`; randomness and wall-clock time only
 * touch visuals and audio. A pre-boot hook (lib.ts HOOK_SOURCE) turns on the game's own QA
 * hooks and freezes its real-time loop, then this tool steps the sim with `__orbit.advance`
 * at exactly 1/60 s, driven by a closed-loop policy whose per-step inputs are recorded as a
 * run-length script. The script is then replayed (determinism) and replayed with timing
 * perturbations (sensitivity), in every fresh browser context.
 *
 *   node strange-orbit.mjs --manifest games.json --sessions 2 --emit-markers --out /tmp/out \
 *        [--params '{"laneGain":0.06,...}'] [--sweep] [--perturb 1,3,6] [--delays 1,2,3,5] [--max-steps 36000]
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_POLICY_PARAMS,
  HOOK_SOURCE,
  cruisePolicy,
  pageRunnerSource,
  type PolicyParams,
  type RunOutput,
  type RunPayload,
  type RunResult
} from "./lib.js";

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

const HAS_QA = `!!(window.__orbit && typeof window.__orbit.advance === "function" && window.__orbit.state && window.__orbit.state.ready)`;

const SWEEP_DELAYS = [1, 2];
const SWEEP_SETS: PolicyParams[] = [];
for (const bypassLane of [4.5, 5.5, 6.5, 7.5, 8.5]) {
  for (const [bypassFrom, bypassTo] of [[1100, 1190], [1130, 1190], [1130, 1250], [1150, 1230]] as const) {
    SWEEP_SETS.push({ ...DEFAULT_POLICY_PARAMS, bypassLane, bypassFrom, bypassTo });
  }
}

/** Finished runs only; controllers that survive every observation delay rank first, then fewest hits, then fastest. */
const rank = (r: { outcome: string; hits: number; respawns: number; finishTime: number | null }, survived: number, tried: number): number =>
  r.outcome === "finished" ? (tried - survived) * 1e7 + (r.respawns + r.hits) * 1000 + (r.finishTime ?? 1e6) : Number.POSITIVE_INFINITY;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function runInFrame(frame: Frame, payload: RunPayload): Promise<RunOutput> {
  const raw = (await frame.evaluate(pageRunnerSource(cruisePolicy.toString(), payload))) as string;
  return JSON.parse(raw) as RunOutput;
}

/** Drops bulky detail from finished repeats; keeps the trace of runs that did not finish so failures can be explained. */
const compact = (r: RunResult): RunResult => ({ ...r, trace: r.outcome === "finished" ? [] : r.trace, hudFrames: r.outcome === "finished" ? [] : r.hudFrames });

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(1500);
    for (const f of page.frames()) {
      let ready = false;
      try { ready = (await f.evaluate(HAS_QA)) === true; } catch { /* navigating */ }
      if (ready) return f;
      try { await f.evaluate(CLICK_START); } catch { /* navigating */ }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "strange-orbit");
  if (!game?.url) throw new Error("strange-orbit url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const waitMs = Number(arg("--wait-ms") ?? 90000);
  const maxSteps = Number(arg("--max-steps") ?? 36000);
  const perturb = (arg("--perturb") ?? "1,3,6").split(",").filter(Boolean).map(Number);
  const delays = (arg("--delays") ?? "1,2,3,5").split(",").filter(Boolean).map(Number);
  const markers = process.argv.includes("--emit-markers");
  const sweep = process.argv.includes("--sweep");
  const explicitParams = arg("--params") !== undefined;
  const baseParams: PolicyParams = { ...DEFAULT_POLICY_PARAMS, ...(explicitParams ? (JSON.parse(arg("--params") as string) as Partial<PolicyParams>) : {}) };
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(HOOK_SOURCE);
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findGameFrame(page, waitMs);
      const session: Record<string, unknown> = { schema: "a3d-crayon-capture-session/1", session: n, startedAt, url: game.url, browser: browser.version() };
      if (!frame) {
        session.error = "game frame with QA hooks not found";
        session.frames = page.frames().map((f) => f.url());
      } else {
        await frame.evaluate(`(window.__a3dCap.freeze = true, window.__a3dCap.dropped)`);
        let params = baseParams;
        if (sweep) {
          const results: { params: PolicyParams; summary: Record<string, unknown>; rank: number }[] = [];
          for (const p of SWEEP_SETS) {
            const t0 = Date.now();
            const out = await runInFrame(frame, { mode: "policy", params: p, maxSteps });
            const r = out.result;
            const survives: boolean[] = [];
            if (r.outcome === "finished") {
              for (const observationDelay of SWEEP_DELAYS) {
                const lagged = await runInFrame(frame, { mode: "policy", params: p, observationDelay, maxSteps });
                survives.push(lagged.result.outcome === "finished");
              }
            }
            results.push({
              params: p,
              rank: rank(r, survives.filter(Boolean).length, SWEEP_DELAYS.length),
              summary: { survives, wallMs: Date.now() - t0, outcome: r.outcome, error: r.error, finishTime: r.finishTime, steps: r.steps, laps: r.lapTimes.length, hits: r.hits, respawns: r.respawns, gatesPassed: r.gatesPassed, place: r.place, routeEvents: r.routeEvents.slice(0, 4), tail: r.trace.slice(-3) }
            });
          }
          session.sweep = results.map((x) => ({ params: x.params, ...x.summary }));
          const best = results.reduce((m, x) => (x.rank < m.rank ? x : m));
          if (!explicitParams && Number.isFinite(best.rank)) params = best.params;
        }
        const t0 = Date.now();
        const primary = await runInFrame(frame, { mode: "policy", params, maxSteps });
        session.params = params;
        session.primaryWallMs = Date.now() - t0;
        session.primary = primary;
        if (primary.result.outcome === "finished") {
          const replay = await runInFrame(frame, { mode: "script", segments: primary.segments, maxSteps });
          session.replay = compact(replay.result);
          const perturbed: { leadIn: number; result: RunResult }[] = [];
          for (const leadIn of perturb) {
            const out = await runInFrame(frame, { mode: "script", segments: primary.segments, leadIn, maxSteps });
            perturbed.push({ leadIn, result: compact(out.result) });
          }
          session.perturbations = perturbed;
          const lagged: { delay: number; result: RunResult }[] = [];
          for (const delay of delays) {
            const out = await runInFrame(frame, { mode: "policy", params, observationDelay: delay, maxSteps });
            lagged.push({ delay, result: compact(out.result) });
          }
          session.closedLoop = lagged;
        }
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `strange-orbit.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
