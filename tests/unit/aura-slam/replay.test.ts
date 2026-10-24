import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReferenceCapture } from "../../../examples/aura-slam/contract/reference";
import type { LoggedEvent } from "../../../examples/aura-slam/contract/events";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";
import { firstRowDivergence, loadReference, nativeFactory, originalFactory, replayScenario, type ReferenceFile, type ReferenceScenario, type ReplayResult } from "./replay-lib";

/**
 * Gate G1: replay the scripted run captured from the ORIGINAL engine (evidence/aura-slam/reference.json, schema
 * a3d-crayon-capture/1) through the native simulation and match every checkpoint and the event log within the tolerance
 * derived from the independent capture sessions. Skipped only while the reference file has not been committed yet.
 */
const REFERENCE = fileURLToPath(new URL("../../../evidence/aura-slam/reference.json", import.meta.url));
const present = existsSync(REFERENCE);
/** The committed baseline (slam-ref) has `scenarios[]` recorded through the live page (adapter included), not the `runs[]` schema of contract/reference.ts. */
const scenarioSchema = present && Array.isArray((JSON.parse(readFileSync(REFERENCE, "utf8")) as { scenarios?: unknown }).scenarios);

type Capture = ReferenceCapture | { runs: ReferenceCapture[] };
const runsOf = (capture: Capture): ReferenceCapture[] => ("runs" in capture ? capture.runs : [capture]);

function replay(ref: ReferenceCapture) {
  const events: LoggedEvent[] = [];
  let tick = 0;
  const engine = createMatchEngine({
    difficulty: ref.options.difficulty, venue: ref.options.venue,
    onEvent: (e) => events.push({ tick, type: e.type, ...("winner" in e ? { winner: e.winner } : {}), ...("call" in e ? { call: e.call } : {}) } as LoggedEvent),
  });
  if (ref.options.firstServer !== engine.state.firstServer) engine.resetMatch({ difficulty: ref.options.difficulty, venue: ref.options.venue, firstServer: ref.options.firstServer } as never);
  const byTick = new Map<number, ReferenceCapture["script"]>();
  for (const entry of ref.script) byTick.set(entry.tick, [...(byTick.get(entry.tick) ?? []), entry]);
  const checkpoints = new Map(ref.checkpoints.map((c) => [c.tick, c]));
  const errors: string[] = [];
  for (tick = 0; tick < ref.steps; tick++) {
    for (const entry of byTick.get(tick) ?? []) engine.applyInput(entry.side, entry.input);
    engine.step(ref.dt);
    const cp = checkpoints.get(tick + 1) ?? checkpoints.get(tick);
    if (!cp) continue;
    const s = engine.state;
    const tol = ref.tolerance;
    const near = (name: string, got: number, want: number, t: number) => { if (!(Math.abs(got - want) <= t)) errors.push(`tick ${cp.tick} ${name}: ${got} vs ${want}`); };
    near("ball.x", s.ball.x, cp.ball.x, tol.position); near("ball.y", s.ball.y, cp.ball.y, tol.position); near("ball.z", s.ball.z, cp.ball.z, tol.position);
    near("ball.vx", s.ball.vx, cp.ball.vx, tol.velocity); near("ball.vy", s.ball.vy, cp.ball.vy, tol.velocity); near("ball.vz", s.ball.vz, cp.ball.vz, tol.velocity);
    near("player.x", s.player.x, cp.player.x, tol.position); near("player.y", s.player.y, cp.player.y, tol.position);
    near("ai.x", s.ai.x, cp.ai.x, tol.position); near("ai.y", s.ai.y, cp.ai.y, tol.position);
    if (s.phase !== cp.phase) errors.push(`tick ${cp.tick} phase ${s.phase} vs ${cp.phase}`);
    if (s.server !== cp.server) errors.push(`tick ${cp.tick} server ${s.server} vs ${cp.server}`);
    if (s.ball.bounceCount !== cp.ball.bounceCount) errors.push(`tick ${cp.tick} bounceCount ${s.ball.bounceCount} vs ${cp.ball.bounceCount}`);
    if (s.rallyHits !== cp.rallyHits) errors.push(`tick ${cp.tick} rallyHits ${s.rallyHits} vs ${cp.rallyHits}`);
    if (JSON.stringify(s.score) !== JSON.stringify(cp.score)) errors.push(`tick ${cp.tick} score ${JSON.stringify(s.score)} vs ${JSON.stringify(cp.score)}`);
  }
  return { errors, events, engine };
}

describe.skipIf(!present || scenarioSchema)("native simulation replays the original engine's recorded run (gate G1)", () => {
  const capture: Capture = present && !scenarioSchema ? JSON.parse(readFileSync(REFERENCE, "utf8")) : { runs: [] };
  const runs = scenarioSchema ? [] : runsOf(capture);
  it("the reference file is a non-empty a3d-crayon-capture/1 aura-slam capture", () => {
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) { expect(run.schema).toBe("a3d-crayon-capture/1"); expect(run.game).toBe("aura-slam"); expect(run.checkpoints.length).toBeGreaterThan(0); }
  });
  runs.forEach((run, i) => {
    it(`run ${i} (${run.options.difficulty}, ${run.options.venue}, ${run.steps} steps): every checkpoint within tolerance`, () => {
      const result = replay(run);
      expect(result.errors.slice(0, 10)).toEqual([]);
    });
    it(`run ${i}: the event log matches (type, winner and call, in order, on the same ticks)`, () => {
      const result = replay(run);
      const wanted = run.events.filter((e) => ["point", "complete", "hit"].includes(String(e.type)));
      const got = result.events.filter((e) => ["point", "complete", "hit"].includes(String(e.type)));
      expect(got.map((e) => [e.tick, e.type, e.winner ?? null, e.call ?? null])).toEqual(wanted.map((e) => [e.tick, e.type, e.winner ?? null, e.call ?? null]));
    });
  });
});

describe.skipIf(present)("replay gate G1 is waiting for evidence/aura-slam/reference.json", () => {
  it.todo("reference capture not committed yet: run the slam-ref capture, then this suite replays it");
});

describe.skipIf(!scenarioSchema)("baseline reference (live page capture): structure and what a replay must preserve", () => {
  const ref = scenarioSchema ? (JSON.parse(readFileSync(REFERENCE, "utf8")) as { schema: string; game: string; scenarios: Array<{ id: string; setup: Record<string, unknown>; script: { encoding: string; inputs: unknown[] }; sessions: Array<{ digest: string; steps: number }>; sampled: { columns: string[]; rows: unknown[][] }; events: unknown[]; reference: { steps: number; winner: string | null } }>; tolerance: { exactDigestRequired: string[]; sampledAbsTolerance: number; eventStepTolerance: number } }) : null;
  it("is the a3d-crayon-capture/1 capture with six scenarios, two identical sessions each", () => {
    expect(ref!.schema).toBe("a3d-crayon-capture/1");
    expect(ref!.game).toBe("aura-slam-3d");
    expect(ref!.scenarios.map((s) => s.id)).toEqual(expect.arrayContaining(["auto-beginner-hard", "auto-club-grass", "auto-pro-clay", "auto-legend-hard", "manual-human-policy"]));
    for (const s of ref!.scenarios) {
      expect(s.sessions.length).toBeGreaterThanOrEqual(2);
      expect(new Set(s.sessions.map((x) => x.digest)).size, `${s.id} sessions agree`).toBe(1);
      expect(s.sampled.rows.length).toBeGreaterThan(0);
    }
    expect(ref!.tolerance.sampledAbsTolerance).toBeLessThanOrEqual(1e-6);
  });
  it("the sim itself equals the original engine over full matches (see autoplay-golden.test.ts, remote replay in aura-slam-int.spec.ts)", () => {
    expect(existsSync(fileURLToPath(new URL("../../browser/aura-slam-golden.json", import.meta.url)))).toBe(true);
  });
});

/**
 * Gate G1 at shell level: the six live-page scenarios (five Auto matches and the scripted manual run with its saved key
 * events) replayed through the native engine, native input mapper and adapter controller, compared with the baseline.
 * The baseline was captured on Linux x64; libm results differ from this machine's by ~1e-16, which only matters when a
 * rounded value lands on a rounding boundary and then compounds (the legend scenario). So a scenario passes when the
 * native replay is exact against the baseline, or, on a platform whose libm drifts, when it is identical to the ORIGINAL
 * engine replayed in this process through the same driver and equals the baseline up to the point the original's own
 * replay leaves it. The remote spec tests/browser/aura-slam-replay.spec.ts requires exact digests in the real shell.
 */
describe.skipIf(!scenarioSchema)("gate G1: shell-level replay of the live page's scenarios", () => {
  const reference: ReferenceFile | null = scenarioSchema ? loadReference() : null;
  const ids = reference?.scenarios.map((s) => s.id) ?? [];
  const results = new Map<string, { native: ReplayResult; original: ReplayResult | null }>();
  const run = (sc: ReferenceScenario) => {
    let entry = results.get(sc.id);
    if (!entry) {
      const native = replayScenario(sc, nativeFactory);
      const exact = native.digest === sc.reference.digest && native.steps === sc.reference.steps;
      entry = { native, original: exact ? null : replayScenario(sc, originalFactory()) };
      results.set(sc.id, entry);
    }
    return entry;
  };
  const tol = reference?.tolerance.sampledAbsTolerance ?? 1e-6;

  it("covers the six scenarios, including the manual run's saved key events", () => {
    expect(ids).toEqual(expect.arrayContaining(["auto-beginner-hard", "auto-beginner-moon", "auto-club-grass", "auto-pro-clay", "auto-legend-hard", "manual-human-policy"]));
    const manual = reference!.scenarios.find((s) => s.id === "manual-human-policy")!;
    expect(manual.script.inputs?.length).toBe(286);
  });

  for (const id of ids) {
    it(`${id}: steps, result, score timeline, event log and sampled rows match the baseline`, () => {
      const sc = reference!.scenarios.find((s) => s.id === id)!;
      const { native, original } = run(sc);
      const exact = native.digest === sc.reference.digest;
      if (exact) {
        expect(native.steps).toBe(sc.reference.steps);
        expect({ mode: native.finalMode, phase: native.finalPhase, winner: native.winner, matchWon: native.matchWon, score: native.score }).toEqual({
          mode: sc.reference.finalMode, phase: sc.reference.finalPhase, winner: sc.reference.winner, matchWon: sc.reference.matchWon, score: sc.reference.score });
        expect(native.stats).toEqual(sc.reference.stats);
        expect(native.timeline).toEqual(sc.reference.timeline);
        expect(native.eventCounts).toEqual(sc.reference.eventCounts);
        expect(native.events).toEqual(sc.events);
        expect(firstRowDivergence(native.rows, sc, tol)).toBeNull();
        return;
      }
      // Platform libm drift: native must equal the original engine here, and the baseline wherever the original does.
      expect(original, "original replay computed").not.toBeNull();
      expect(native.digest, "native replay is bit-identical to the original engine's on this platform").toBe(original!.digest);
      expect(native.steps).toBe(original!.steps);
      expect(native.timeline).toEqual(original!.timeline);
      expect(native.events).toEqual(original!.events);
      expect([...native.rows]).toEqual([...original!.rows]);
      const drift = firstRowDivergence(native.rows, sc, tol);
      expect(drift, "the baseline leaves the replay only at libm drift").not.toBeNull();
      expect(drift!.step, "drift starts late in the match").toBeGreaterThan(1000);
      const early = sc.events.filter((e) => e.step < drift!.step - 5);
      expect(native.events.filter((e) => e.step < drift!.step - 5)).toEqual(early);
      expect(native.timeline.filter((t) => t.step < drift!.step - 5)).toEqual(sc.reference.timeline.filter((t) => t.step < drift!.step - 5));
    }, 240_000);
  }
});
