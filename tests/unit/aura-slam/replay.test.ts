import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReferenceCapture } from "../../../examples/aura-slam/contract/reference";
import type { LoggedEvent } from "../../../examples/aura-slam/contract/events";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";

/**
 * Gate G1: replay the scripted run captured from the ORIGINAL engine (evidence/aura-slam/reference.json, schema
 * a3d-crayon-capture/1) through the native simulation and match every checkpoint and the event log within the tolerance
 * derived from the independent capture sessions. Skipped only while the reference file has not been committed yet.
 */
const REFERENCE = fileURLToPath(new URL("../../../evidence/aura-slam/reference.json", import.meta.url));
const present = existsSync(REFERENCE);

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

describe.skipIf(!present)("native simulation replays the original engine's recorded run (gate G1)", () => {
  const capture: Capture = present ? JSON.parse(readFileSync(REFERENCE, "utf8")) : { runs: [] };
  const runs = runsOf(capture);
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
