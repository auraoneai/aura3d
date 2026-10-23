#!/usr/bin/env tsx
/**
 * tools/crayon-capture/last-train-assemble — turn the remote Last Train capture logs into
 * `evidence/crayon-capture/last-train-reference.json` and the data the port consumes
 * (`examples/last-train-port/data/{route,tables}.json`). Exits non-zero and writes nothing unless the
 * sessions validate (>= 2 independent sessions, no error, every requested loop finished, identical results).
 *
 *   tsx tools/crayon-capture/last-train-assemble.ts --log run.log [--log run2.log] \
 *       --out evidence/crayon-capture/last-train-reference.json --data examples/last-train-port/data
 */
import fs from "node:fs";
import path from "node:path";
import { LAST_TRAIN_SCHEMA, compareSessions, driftFraction, type CaptureSession, type LoopSummary } from "./last-train-lib.js";

export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\r?\n([\s\S]*?)\r?\n@@CRAYON_CAPTURE_END:\1/g;
  for (const m of log.matchAll(re)) out.push(JSON.parse(m[2] as string));
  return out;
}

export function validateSessions(sessions: readonly CaptureSession[], loopsWanted = 3): string[] {
  const problems: string[] = [];
  if (sessions.length < 2) problems.push(`need >= 2 sessions, got ${sessions.length}`);
  for (const s of sessions) {
    if (s.error) problems.push(`session ${s.session} error: ${String(s.error).split("\n")[0]}`);
    if ((s.loops?.length ?? 0) < loopsWanted) problems.push(`session ${s.session} finished ${s.loops?.length ?? 0}/${loopsWanted} loops`);
    if (!s.inputs) problems.push(`session ${s.session} has no input script`);
  }
  const [first, ...rest] = sessions;
  if (first) {
    for (const s of rest) {
      const c = compareSessions(first, s);
      if (!c.identicalInputs) problems.push(`session ${s.session} input script differs from session ${first.session}`);
      if (!c.identicalEvents) problems.push(`session ${s.session} event sequence differs from session ${first.session}`);
      if (c.maxTraceDelta > 0) problems.push(`session ${s.session} trace differs by up to ${c.maxTraceDelta}`);
    }
  }
  return problems;
}

type Json = Record<string, unknown>;

export function buildReference(sessions: readonly CaptureSession[], meta: { sources: string[]; generatedAt: string }): Json {
  const [first] = sessions as [CaptureSession, ...CaptureSession[]];
  const loops = first.loops as readonly LoopSummary[];
  const heap = sessions.map((s) => s.loops.map((l) => l.heapUsedBytes));
  const keySeries = (k: keyof LoopSummary["stateKeys"]): number[] => loops.map((l) => l.stateKeys[k]);
  const constants = { ...(first.constants as Json) };
  delete constants.passengerTable;
  return {
    schema: LAST_TRAIN_SCHEMA,
    game: "last-train-to-the-sea",
    source: { module: "tests/fixtures/crayon/last-train/PROVENANCE.md", capturedBy: "tools/crayon-capture/last-train.ts", sources: meta.sources },
    generatedAt: meta.generatedAt,
    method: "Pre-boot hook patches the game's module text so its pure state functions (WM step, GM doors/depart/new-service/time-of-day, FM constructor) are stepped headlessly at 1/60 s by a closed-loop controller; no rendering, no wall-clock time in the simulation.",
    setup: { fixedStep: 1 / 60, controller: (first as unknown as { params: unknown }).params, difficulty: "low", startStation: 0, loops: loops.length, timeOfDay: ["day", "night", "day"] },
    constants,
    inputs: first.inputs,
    inputsNote: "Run-length script `<steps>x[ABRLP]/<pace>` (A accelerate, B brake, R reverse, L left, P right); one entry per 1/60 s step over all loops, doors/depart actions are in `events`.",
    events: first.events,
    trace: { columns: ["t", "leg", "distance", "speed", "roll", "rollVelocity", "aboard", "score", "fares", "tips", "lost", "comfort", "catches"], every: 30, rows: first.trace },
    loops,
    repeatability: {
      sessions: sessions.length,
      identicalInputs: true,
      identicalEvents: true,
      maxTraceDelta: 0,
      note: "Each session is a fresh browser context; the simulation is a pure function of the inputs, so sessions are bit-identical."
    },
    memory: {
      note: "Headless state stepping allocates no renderer resources, so this is JS heap and simulation-state size only. Renderer memory (geometries, textures) is measured on the port, not the original.",
      stateKeyCounts: { deliveredRides: keySeries("deliveredRides"), claimedRides: keySeries("claimedRides"), arrivals: keySeries("arrivals"), trips: keySeries("trips") },
      stateKeysDrift: { deliveredRides: driftFraction(keySeries("deliveredRides")), claimedRides: driftFraction(keySeries("claimedRides")), arrivals: driftFraction(keySeries("arrivals")), trips: driftFraction(keySeries("trips")) },
      heapUsedBytesPerSession: heap,
      heapNote: "performance.memory with --enable-precise-memory-info; it moves with GC (not monotonic across loops and differs between sessions), so it is recorded but not used as a pass/fail signal."
    },
    totals: { steps: (first as unknown as { totalSteps: number }).totalSteps, final: (first as unknown as { final: unknown }).final }
  };
}

function args(name: string): string[] {
  return process.argv.flatMap((a, i, all) => (a === name ? [all[i + 1] as string] : []));
}

function main(): void {
  const logs = args("--log");
  const out = args("--out")[0] ?? "evidence/crayon-capture/last-train-reference.json";
  const dataDir = args("--data")[0] ?? "examples/last-train-port/data";
  const sessions = logs.flatMap((l) => parseMarkerBlocks(fs.readFileSync(l, "utf8")) as CaptureSession[]);
  const problems = validateSessions(sessions);
  if (problems.length) {
    process.stderr.write(`last-train capture does not validate:\n- ${problems.join("\n- ")}\n`);
    process.exit(1);
  }
  const first = sessions[0] as CaptureSession;
  const reference = buildReference(sessions, { sources: logs.map((l) => path.basename(l)), generatedAt: new Date().toISOString() });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(reference));
  fs.mkdirSync(dataDir, { recursive: true });
  const route = (first as unknown as { route: unknown }).route;
  fs.writeFileSync(path.join(dataDir, "route.json"), JSON.stringify(route));
  const tables = { ...(first.constants as Json) };
  fs.writeFileSync(path.join(dataDir, "tables.json"), JSON.stringify(tables));
  process.stdout.write(`wrote ${out} and ${dataDir}/{route,tables}.json\n`);
}

if (process.argv[1] && /last-train-assemble/.test(process.argv[1])) main();
