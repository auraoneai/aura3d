#!/usr/bin/env tsx
/**
 * Assemble the Kid Goku reference from an ACR run log of `kid-goku-beyond-the-clouds.ts`.
 *
 *   tsx tools/crayon-capture/kid-goku-beyond-the-clouds-assemble.ts <run.log> [--acr-run <id>]
 *
 * Writes evidence/crayon-capture/kid-goku-beyond-the-clouds-reference.json (schema a3d-crayon-capture/1) and the replay fixture
 * tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json used by the port's unit and browser tests.
 * Session 1 = closed-loop policy (records the input script), session 2 = open-loop replay of that script in a fresh context
 * (determinism), session 3 = the policy again (policy repeatability). The tolerance is derived from the measured spread, never guessed.
 */
import fs from "node:fs";

interface Snap { step: number; phase: string; s: number; lane: number; jump: number; speed: number; hearts: number; score: number; combo: number; balls: number[]; meat: number; falls: number; pole: number | null; finished: boolean; nimbus: Record<string, unknown> }
interface Session {
  session: number; mode: string; error?: string; steps?: number; stopped?: string; segments?: unknown[]; trace?: Snap[]; final?: Snap; start?: Snap;
  bootWallMs?: number; runWallMs?: number; vtError?: string | null; browser?: string; viewport?: unknown; startedAt?: string;
}

export function parseBlocks(log: string): Session[] {
  const out: Session[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\r?\n([\s\S]*?)\r?\n@@CRAYON_CAPTURE_END:\1/g;
  for (const m of log.matchAll(re)) out.push(JSON.parse(m[2] as string) as Session);
  return out;
}

const FIELDS = ["s", "lane", "jump", "speed", "hearts", "score", "combo", "meat", "falls"] as const;
export interface Spread { compared: number; exact: boolean; worst: Record<string, number>; mismatches: number; lengthA: number; lengthB: number }
export function compareTraces(a: Snap[], b: Snap[]): Spread {
  const n = Math.min(a.length, b.length);
  const worst: Record<string, number> = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  let mismatches = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] as Snap, y = b[i] as Snap;
    let bad = x.step !== y.step || JSON.stringify(x.balls) !== JSON.stringify(y.balls) || x.finished !== y.finished || x.pole !== y.pole;
    for (const f of FIELDS) {
      const d = Math.abs((x[f] as number) - (y[f] as number));
      worst[f] = Math.max(worst[f] as number, d);
      if (d > 0) bad = true;
    }
    if (bad) mismatches++;
  }
  return { compared: n, exact: mismatches === 0 && a.length === b.length, worst, mismatches, lengthA: a.length, lengthB: b.length };
}

const SAFETY = 1.5;
export function toleranceFrom(spreads: Spread[]): { s: number; lane: number; jump: number; speed: number; basis: string } {
  const w = (f: string) => Math.max(0, ...spreads.map((x) => x.worst[f] ?? 0));
  // `s` is rounded to 0.1 by the original's snapshot(), so its floor is one rounding quantum.
  return {
    s: Math.max(0.1 + 1e-9, w("s") * SAFETY), lane: Math.max(1e-6, w("lane") * SAFETY), jump: Math.max(1e-6, w("jump") * SAFETY), speed: Math.max(1e-6, w("speed") * SAFETY),
    basis: `max(measured spread x ${SAFETY}, floor); floors: s 0.1 (snapshot rounding), others 1e-6`
  };
}

function main(): void {
  const [, , logPath, ...rest] = process.argv;
  if (!logPath) throw new Error("usage: assemble <run.log> [--acr-run <id>]");
  const acrRun = rest[rest.indexOf("--acr-run") + 1] ?? null;
  const sessions = parseBlocks(fs.readFileSync(logPath, "utf8"));
  const ok = sessions.filter((s) => !s.error && s.trace && s.trace.length > 0);
  if (ok.length === 0) throw new Error(`no usable sessions in ${logPath} (${sessions.map((s) => s.error ?? "?").join("; ")})`);
  const primary = ok.find((s) => s.session === 1) ?? ok[0]!;
  const replay = ok.find((s) => s.mode === "script");
  const repeat = ok.find((s) => s.mode === "policy" && s.session !== primary.session);
  const spreads: Spread[] = [];
  const reports: Record<string, unknown> = {};
  if (replay) { const sp = compareTraces(primary.trace!, replay.trace!); spreads.push(sp); reports.openLoopReplay = sp; }
  if (repeat) { const sp = compareTraces(primary.trace!, repeat.trace!); spreads.push(sp); reports.policyRepeat = sp; }
  const tolerance = toleranceFrom(spreads);
  const every = (primary.trace![1]?.step ?? 5) - (primary.trace![0]?.step ?? 0) || 5;
  const first = primary.trace![0]!;
  const last = primary.trace![primary.trace!.length - 1]!;
  const reference = {
    schema: "a3d-crayon-capture/1",
    game: "kid-goku-beyond-the-clouds",
    title: "Kid Goku: Beyond the Clouds",
    url: sessions[0] ? (sessions[0] as unknown as { url: string }).url : null,
    capturedAt: new Date().toISOString(),
    acrRun,
    method: "virtual time (rAF + performance.now frozen, 1/60 s per step, seeded Math.random), KeyboardEvent input, state from window.__CLOUD_RUNNER__.snapshot()",
    sessionsRun: sessions.length,
    sessionsUsable: ok.length,
    browser: primary.browser ?? null,
    viewport: primary.viewport ?? null,
    runShape: { steps: primary.steps, stopped: primary.stopped, traceEvery: every, startSnapshot: primary.start, firstTrace: first, finalSnapshot: last },
    inputScript: { segments: primary.segments, encoding: "run-length: { steps, input }", openLoopStepExact: true },
    determinism: reports,
    tolerance,
    wallMs: { boot: primary.bootWallMs, run: primary.runWallMs },
    trace: primary.trace,
    limits: [
      "snapshot().s is rounded to 0.1 by the original; every other field is unrounded",
      "the reference covers the segment before the first obstacle/creature collision unless final hearts < 3 (the encounter system is not ported)",
      "finishes are not compared: the run stops at the scripted step budget"
    ]
  };
  fs.writeFileSync("evidence/crayon-capture/kid-goku-beyond-the-clouds-reference.json", JSON.stringify(reference, null, 1) + "\n");
  fs.mkdirSync("tests/browser/data", { recursive: true });
  fs.writeFileSync(
    "tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json",
    JSON.stringify({ schema: "a3d-kid-goku-replay/1", every, segments: primary.segments, tolerance, trace: primary.trace }) + "\n"
  );
  process.stdout.write(`wrote reference: ${primary.trace!.length} trace points, steps=${primary.steps}, stopped=${primary.stopped}, final s=${last.s} hearts=${last.hearts} balls=${JSON.stringify(last.balls)}\n`);
  process.stdout.write(`determinism: ${JSON.stringify(reports)}\ntolerance: ${JSON.stringify(tolerance)}\n`);
}

if (process.argv[1] && /kid-goku-beyond-the-clouds-assemble\.(ts|mjs|js)$/.test(process.argv[1])) main();
