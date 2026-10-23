#!/usr/bin/env tsx
/**
 * tools/crayon-capture/silt-and-signal-assemble — turns the marker blocks of a remote capture run log into
 * evidence/crayon-capture/silt-and-signal-reference.json (schema a3d-crayon-capture/1) and the compact
 * replay fixture the port's browser spec reads (tests/browser/data/silt-and-signal-reference-replay.json).
 *
 *   tsx silt-and-signal-assemble.ts <run.log> [<run.log> ...] [--out evidence/crayon-capture/silt-and-signal-reference.json]
 *
 * Local, pure file work: no browser. Variance is measured, not assumed: every session's primary trace is compared
 * with the first session's, and every in-page replay with its own primary.
 */
import fs from "node:fs";
import path from "node:path";
import {
  SILT_CAPTURE_SCHEMA, SILT_SIM_STEP, TRACE_COLUMNS, compareTraces, deriveTolerance, validateReport,
  type SiltRunOutput, type SiltRunSummary, type SiltScriptSegment, type SiltTraceRow
} from "./silt-and-signal-lib.js";

interface SessionRun {
  chapter: number;
  objective: number;
  primary: SiltRunOutput;
  primaryWallMs: number;
  replay?: { trace: SiltTraceRow[]; summary: SiltRunSummary; errors: string[]; wallMs: number };
}
interface Session { session: number; startedAt: string; browser: string; viewport: [number, number]; error?: string; runs?: SessionRun[]; source?: string }

export function parseSessions(logText: string, source: string): Session[] {
  // The driver prints a cumulative block after every ride; keep the last block of each session number.
  const last = new Map<number, Session>();
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\r?\n([\s\S]*?)\r?\n@@CRAYON_CAPTURE_END:\1/g;
  for (let m = re.exec(logText); m; m = re.exec(logText)) {
    const session = JSON.parse(m[2] as string) as Session;
    session.source = source;
    last.set(Number(m[1]), session);
  }
  return [...last.values()];
}

/** Largest absolute difference over every column and every common step. */
function maxDelta(a: readonly SiltTraceRow[], b: readonly SiltTraceRow[]): number {
  let worst = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) for (let c = 0; c < TRACE_COLUMNS.length; c++) worst = Math.max(worst, Math.abs(((a[i] as SiltTraceRow)[c] as number) - ((b[i] as SiltTraceRow)[c] as number)));
  return worst;
}

const posDelta = (a: SiltTraceRow[], b: SiltTraceRow[]): { position: number; yaw: number; completionSteps: number; firstDivergence: number | null; lengthMatch: boolean } => {
  const c = compareTraces(a, b, 1e-9);
  const ix = TRACE_COLUMNS.indexOf("x"), iy = TRACE_COLUMNS.indexOf("y"), iz = TRACE_COLUMNS.indexOf("z"), iyaw = TRACE_COLUMNS.indexOf("yaw");
  return {
    position: Math.max(c.maxAbs[ix] as number, c.maxAbs[iy] as number, c.maxAbs[iz] as number),
    yaw: c.maxAbs[iyaw] as number,
    completionSteps: Math.abs(a.length - b.length),
    firstDivergence: c.firstDivergence,
    lengthMatch: c.lengthMatch
  };
};

export function assemble(sessions: Session[], logs: string[]): Record<string, unknown> {
  sessions.forEach((s, i) => { s.session = i + 1; });
  const good = sessions.filter((s) => s.runs && s.runs.length > 0 && !s.error);
  if (good.length === 0) throw new Error(`no usable session in ${logs.join(", ")}: ${sessions.map((s) => s.error ?? "no runs").join("; ")}`);
  const keys = [...new Set(good.flatMap((s) => (s.runs as SessionRun[]).map((r) => `${r.chapter}:${r.objective}`)))];
  const rides: Record<string, unknown>[] = [];
  const limitRides: Record<string, unknown>[] = [];
  const allDeltas: { position: number; yaw: number; completionSteps: number }[] = [];
  const completedRun = (r: SessionRun): boolean => r.primary.summary.completed || r.primary.mode === "scene";
  for (const key of keys) {
    const [chapter, objective] = key.split(":").map(Number) as [number, number];
    const all = good.map((s) => ({ session: s, run: (s.runs as SessionRun[]).find((r) => r.chapter === chapter && r.objective === objective) })).filter((x) => x.run) as { session: Session; run: SessionRun }[];
    // Parity references are rides that completed without a collision (the port has no colliders).
    const runs = all.filter(({ run }) => completedRun(run) && run.primary.summary.impacts === 0);
    if (runs.length === 0) {
      const sample = all[0]!.run;
      limitRides.push({
        chapter, objective, sessions: all.length,
        completed: all.every(({ run }) => completedRun(run)),
        steps: sample.primary.summary.steps,
        impacts: sample.primary.summary.impacts,
        minY: Math.min(...sample.primary.trace.map((r) => r[1])),
        reason: sample.primary.summary.impacts > 0 ? "the ride collides with world colliders; the port has no colliders" : "the controller did not complete the objective within the step limit",
        // Measured, not assumed: how repeatable the original is on this ride across sessions, and whether its own in-page replay matches.
        sessionMaxDelta: Math.max(0, ...all.slice(1).map(({ run }) => maxDelta(sample.primary.trace, run.primary.trace))),
        replayMaxDelta: Math.max(0, ...all.filter(({ run }) => run.replay).map(({ run }) => maxDelta(run.primary.trace, (run.replay as NonNullable<SessionRun["replay"]>).trace)))
      });
      continue;
    }
    const first = runs[0] as { session: Session; run: SessionRun };
    const reference = first.run.primary;
    const comparisons: Record<string, unknown>[] = [];
    for (let i = 0; i < runs.length; i++) {
      const { session, run } = runs[i] as { session: Session; run: SessionRun };
      if (i > 0) {
        const d = posDelta(reference.trace, run.primary.trace);
        comparisons.push({ kind: "primary-vs-session-1-primary", session: session.session, ...d });
        allDeltas.push({ position: d.position, yaw: d.yaw, completionSteps: d.completionSteps });
      }
      if (run.replay) {
        const d = posDelta(run.primary.trace, run.replay.trace);
        comparisons.push({ kind: "in-page-replay-vs-own-primary", session: session.session, ...d });
        allDeltas.push({ position: d.position, yaw: d.yaw, completionSteps: d.completionSteps });
      }
    }
    const tolerance = deriveTolerance(allDeltas.length ? allDeltas : [{ position: 0, yaw: 0, completionSteps: 0 }]);
    rides.push({
      chapter,
      objective,
      objectiveId: undefined,
      start: reference.start,
      segments: reference.segments as SiltScriptSegment[],
      trace: reference.trace,
      // Portal and hold objectives end by entering a scene (mode "scene") without advancing the objective index.
      summary: reference.summary.completed || reference.mode !== "scene" ? reference.summary : { ...reference.summary, completed: true, completedAtStep: reference.trace.length },
      endMode: reference.mode,
      sessions: runs.length,
      comparisons,
      tolerance,
      world: (runs.map((r) => r.run.primary.world).find(Boolean) as { colliders?: unknown[]; targets?: unknown[]; neriWorld?: unknown } | undefined)
    });
  }
  const primaryRide = rides[0] as Record<string, unknown>;
  const report = {
    schema: SILT_CAPTURE_SCHEMA,
    game: "silt-and-signal" as const,
    capturedAt: new Date().toISOString(),
    method: {
      clock: "pre-boot hook replaces requestAnimationFrame/performance.now/Date.now in the about:srcdoc game frame with a manual clock; one pump per step is an exact 1/60 s step (the game derives dt from the rAF timestamp)",
      randomness: "Math.random replaced by a seeded generator before any game script runs",
      qa: "the game's own window.silt.qa API, enabled by patching URLSearchParams in the frame (a srcdoc frame has an empty location.search)",
      input: "keyboard KeyboardEvents (W/S/A/D/E/Q/B/Shift/F) from a closed-loop policy; the recorded run-length script is replayed",
      rendering: "GL draw calls are skipped while stepping (the simulation reads no pixels)",
      stepSeconds: SILT_SIM_STEP
    },
    source: { logs, browser: good[0]?.browser, viewport: good[0]?.viewport, sessions: good.map((s) => ({ session: s.session, startedAt: s.startedAt, log: s.source })) },
    trace: { columns: TRACE_COLUMNS },
    reference: { ...primaryRide, tolerance: primaryRide.tolerance },
    rides,
    limitRides,
    limitations: [
      "The reference is a keyboard-only closed-loop controller; the original also accepts pointer/gamepad axes (continuous steer and lift) which the port does not need for parity.",
      "The run flies at cruise altitude (>= 9 m) in the open so the terrain floor clamp (floor + 2.4) and colliders are not engaged; `impacts` in the trace must stay 0.",
      "Chapter terrain, colliders and creature ticks are not part of the port's simulation (see examples/silt-and-signal-port/PORTING-NOTES.md)."
    ]
  };
  const errors = validateReport(report);
  if (errors.length) throw new Error(`invalid report: ${errors.join("; ")}`);
  return report;
}

function main(): void {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = path.resolve(outIdx >= 0 ? (args[outIdx + 1] as string) : "evidence/crayon-capture/silt-and-signal-reference.json");
  const logs = args.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || (i !== outIdx + 1)));
  const sessions = logs.flatMap((l) => parseSessions(fs.readFileSync(l, "utf8"), path.basename(l)));
  const report = assemble(sessions, logs.map((l) => path.basename(l)));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report));
  const rides = (report as unknown as { rides: { chapter: number; objective: number; endMode: string; segments: SiltScriptSegment[]; trace: SiltTraceRow[]; start: unknown; summary: unknown; tolerance: unknown }[] }).rides;
  const fixtureOut = path.resolve("tests/browser/data/silt-and-signal-reference-replay.json");
  fs.mkdirSync(path.dirname(fixtureOut), { recursive: true });
  fs.writeFileSync(fixtureOut, JSON.stringify({
    columns: TRACE_COLUMNS,
    sampleEvery: 30,
    rides: rides.map((r) => ({
      chapter: r.chapter,
      objective: r.objective,
      endMode: r.endMode,
      start: r.start,
      segments: r.segments,
      summary: r.summary,
      tolerance: r.tolerance,
      steps: r.trace.length,
      samples: r.trace.filter((_, i) => (i + 1) % 30 === 0 || i === r.trace.length - 1)
    }))
  }));
  process.stdout.write(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB) and ${fixtureOut}\n`);
}

if (process.argv[1] && /silt-and-signal-assemble/.test(process.argv[1])) main();
