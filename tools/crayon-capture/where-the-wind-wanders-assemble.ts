#!/usr/bin/env tsx
/**
 * Assemble evidence/crayon-capture/where-the-wind-wanders-reference.json from ACR run logs.
 *   pnpm exec tsx tools/crayon-capture/where-the-wind-wanders-assemble.ts --out <file> <run.log>...
 * Each log carries `@@WIND_CAPTURE_BEGIN:<n>` / `@@WIND_CAPTURE_END:<n>` blocks (one per session).
 * The tolerance is derived from the measured session-to-session spread, never guessed.
 */
import fs from "node:fs";
import path from "node:path";
import { WIND_CAPTURE_SCHEMA, type WindRun } from "./where-the-wind-wanders";

export interface SessionBlock { schema: string; game: string; session: number; capturedAt: string; run: WindRun | { ok: false; error: string } }

export function parseBlocks(log: string): SessionBlock[] {
  const text = log.replace(/\r/g, "");
  const out: SessionBlock[] = [];
  const re = /@@WIND_CAPTURE_BEGIN:(\d+)\n([\s\S]*?)\n@@WIND_CAPTURE_END:\1/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(JSON.parse(m[2]!) as SessionBlock);
  return out;
}

export interface Spread { identical: boolean; maxPositionDelta: number; stepsEqual: boolean; scriptEqual: boolean; lettersEqual: boolean }

export function compareRuns(a: WindRun, b: WindRun): Spread {
  const stepsEqual = a.steps === b.steps;
  const n = Math.min(a.xs.length, b.xs.length);
  let maxPositionDelta = stepsEqual ? 0 : Infinity;
  for (let i = 0; i < n; i++) maxPositionDelta = Math.max(maxPositionDelta, Math.hypot(a.xs[i]! - b.xs[i]!, a.zs[i]! - b.zs[i]!));
  const scriptEqual = JSON.stringify(a.script) === JSON.stringify(b.script);
  const lettersEqual = JSON.stringify(a.lettersAtStep) === JSON.stringify(b.lettersAtStep) && a.bellStep === b.bellStep;
  return { identical: stepsEqual && scriptEqual && lettersEqual && maxPositionDelta === 0, maxPositionDelta, stepsEqual, scriptEqual, lettersEqual };
}

/** Position tolerance: 1.5x the worst observed spread, but never below 1e-6 u (float noise) and at most one step of walking (0.0534 u). */
export function positionTolerance(spreads: readonly Spread[]): number {
  const worst = Math.max(0, ...spreads.map((s) => (Number.isFinite(s.maxPositionDelta) ? s.maxPositionDelta : 0)));
  return Math.max(1e-6, Math.min(0.0534, worst * 1.5));
}

function main(): void {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1]! : "evidence/crayon-capture/where-the-wind-wanders-reference.json";
  const logs = args.filter((a, i) => !a.startsWith("--") && i !== outIndex + 1);
  const blocks = logs.flatMap((file) => parseBlocks(fs.readFileSync(file, "utf8")));
  const valid = blocks.filter((b): b is SessionBlock & { run: WindRun } => b.run.ok === true);
  if (valid.length < 2) throw new Error(`need at least 2 valid sessions, found ${valid.length} of ${blocks.length}: ${blocks.map((b) => (b.run.ok ? "ok" : (b.run as { error: string }).error)).join("; ")}`);
  const base = valid[0]!.run;
  const spreads = valid.slice(1).map((b) => compareRuns(base, b.run));
  const report = {
    schema: WIND_CAPTURE_SCHEMA,
    game: "where-the-wind-wanders",
    url: "https://app.usecrayon.ai/play/a9a3c165-74b3-4ff6-9588-ad97f829ddb5",
    capturedAt: valid[0]!.capturedAt,
    method: "virtual time (fixed 16.7 ms rAF/performance.now), seeded Math.random, synthetic window key events, player read from the captured Scene (billboard sprite starting at (-12, y, 4))",
    vstepMs: base.vstepMs,
    sessions: valid.length,
    attemptedSessions: blocks.length,
    repeatability: { allIdentical: spreads.every((s) => s.identical), spreads },
    tolerance: { positionUnits: positionTolerance(spreads), basis: "1.5x worst session-to-session position delta, clamped to [1e-6, 0.0534]" },
    openLoopStepExact: true,
    start: base.start,
    cameraRight: base.cameraRight,
    steps: base.steps,
    script: base.script,
    xs: base.xs,
    zs: base.zs,
    events: base.events,
    lettersAtStep: base.lettersAtStep,
    bellStep: base.bellStep,
    finalHud: base.finalHud,
    setup: base.setup,
    notes: [
      "The original exposes no state hooks; the trajectory is the player sprite position in the live Scene.",
      "Gameplay time is the rAF timestamp (dt capped at 40 ms); virtual 16.7 ms frames keep the game's 60 fps throttle from skipping frames.",
      "Math.random only drives audio in this game, so it does not affect the trajectory."
    ]
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report)}\n`);
  process.stdout.write(`wrote ${out}: ${valid.length}/${blocks.length} sessions, ${base.steps} steps, tolerance ${report.tolerance.positionUnits}\n`);
}

if (process.argv[1] && /where-the-wind-wanders-assemble\.(ts|mjs|js)$/.test(process.argv[1])) main();
