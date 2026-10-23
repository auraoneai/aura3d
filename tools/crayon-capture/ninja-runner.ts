#!/usr/bin/env tsx
/**
 * tools/crayon-capture/ninja-runner — scripted, repeatable playthrough of the ORIGINAL Ninja Runner
 * (Phase C reference, R-20). REMOTE RUN ONLY (serverless ACR Task, recipe in
 * evidence/crayon-capture/README.md); never run Playwright on the Mac.
 *
 * The game exposes `window.__konoha` (`ready`, `state`, `start`, `restart`, `action`, `simulate`).
 * Its sim is a pure fixed-step `pf(state, 1/120)` over a seeded course; `Math.random` and wall-clock
 * time only touch visuals and audio. A pre-boot hook freezes `requestAnimationFrame` so the game's
 * own real-time loop cannot add steps; this tool then steps the sim with
 * `__konoha.simulate(1/120 + 1e-6)` (exactly one `pf`) and applies actions through
 * `__konoha.action` (the keyboard handler's own entry point).
 *
 *   node ninja-runner.mjs --manifest games.json --sessions 2 --emit-markers --out /tmp/out \
 *        [--sweep] [--max-steps 20000] [--check-steps 3600] [--viewport 800x450]
 * Each session prints one JSON object between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HOOK_SOURCE } from "./lib.js";
import {
  DEFAULT_POLICY,
  SWEEP_POLICIES,
  pageRunnerSource,
  type CourseDigest,
  type NinjaPayload,
  type NinjaSession,
  type PolicyParams,
  type RunSummary
} from "./ninja-runner-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
interface Context { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

const HAS_HOOKS = `!!(window.__konoha && window.__konoha.ready === true && typeof window.__konoha.simulate === "function")`;

interface PageOutput { error?: string; courseDigest?: CourseDigest; run?: RunSummary; qaCheck?: NinjaSession["qaCheck"] }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function runInFrame(frame: Frame, payload: NinjaPayload): Promise<PageOutput> {
  const raw = (await frame.evaluate(pageRunnerSource(payload))) as string;
  return JSON.parse(raw) as PageOutput;
}

async function findGameFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(2000);
    for (const f of page.frames()) {
      try { if ((await f.evaluate(HAS_HOOKS)) === true) return f; } catch { /* navigating */ }
    }
  }
  return null;
}

/** Wins first; among finishers fewest damage taken then most kills; otherwise furthest distance. */
const rank = (r: RunSummary): number => (r.outcome === "won" ? r.damageTaken * 1000 - r.kills : 1e9 - r.distance);

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === "ninja-runner");
  if (!game?.url) throw new Error("ninja-runner url missing from manifest");
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const waitMs = Number(arg("--wait-ms") ?? 180000);
  const maxSteps = Number(arg("--max-steps") ?? 20000);
  const checkSteps = Number(arg("--check-steps") ?? 3600);
  const [vw, vh] = (arg("--viewport") ?? "800x450").split("x").map(Number) as [number, number];
  const markers = process.argv.includes("--emit-markers");
  const sweep = process.argv.includes("--sweep");
  const explicit = arg("--params") !== undefined;
  const baseParams: PolicyParams = { ...DEFAULT_POLICY, ...(explicit ? (JSON.parse(arg("--params") as string) as Partial<PolicyParams>) : {}) };
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: vw, height: vh } });
      await context.addInitScript(HOOK_SOURCE);
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 120000 });
      const frame = await findGameFrame(page, waitMs);
      const session: NinjaSession = { schema: "a3d-crayon-capture-session/1", session: n, startedAt, url: game.url, browser: browser.version() };
      if (!frame) {
        session.error = "game frame with __konoha hooks not found";
        (session as unknown as Record<string, unknown>).frames = page.frames().map((f) => f.url());
      } else {
        await frame.evaluate(`(window.__a3dCap.freeze = true, window.__a3dCap.dropped)`);
        let params = baseParams;
        if (sweep) {
          const results: { params: PolicyParams; run: RunSummary }[] = [];
          for (const p of SWEEP_POLICIES) {
            const out = await runInFrame(frame, { mode: "policy", params: p, maxSteps });
            if (out.run) results.push({ params: p, run: out.run });
            if (out.run?.outcome === "won") break;
          }
          session.sweep = results.map((x) => ({ params: x.params, outcome: x.run.outcome, distance: x.run.distance, kills: x.run.kills, steps: x.run.steps, time: x.run.time }));
          if (!explicit && results.length) params = results.reduce((m, x) => (rank(x.run) < rank(m.run) ? x : m)).params;
        }
        session.params = params;
        const primary = await runInFrame(frame, { mode: "policy", params, maxSteps });
        if (primary.error || !primary.run) {
          session.error = primary.error ?? "no run";
        } else {
          session.courseDigest = primary.courseDigest;
          session.primary = primary.run;
          const replay = await runInFrame(frame, { mode: "script", script: primary.run.script, maxSteps });
          session.replay = replay.run;
          const idle = await runInFrame(frame, { mode: "idle", maxSteps });
          session.idle = idle.run;
          const qa = await runInFrame(frame, { mode: "qa-check", checkSteps, maxSteps });
          session.qaCheck = qa.qaCheck;
          // restart: a fresh state object, back at s = 0 and running, with its own `start` event
          const rs = (await frame.evaluate(`(function(){ var K = window.__konoha; var before = K.state; K.restart(); var z = K.state; return JSON.stringify({ restarted: z !== before, phaseAfterRestart: z.phase, sAfterRestart: z.s, eventsAfterRestart: z.events.map(function (e) { return e.type; }) }); })()`)) as string;
          session.restartCheck = JSON.parse(rs) as NinjaSession["restartCheck"];
        }
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `ninja-runner.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_CAPTURE_BEGIN:${n}\n${json}\n@@CRAYON_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
