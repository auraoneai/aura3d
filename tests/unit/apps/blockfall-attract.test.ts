/**
 * BF-A6 unit proof — the attract fixture replays to its pinned score hash.
 *
 * The committed expert run doubles as a regression harness: any change to the
 * route's deterministic rules module that shifts a lock, clear, or score changes
 * the final checksum here before it can silently change mounted behavior.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAttractPlayback,
  parseAttractRun,
  verifyAttractRun,
  type AttractRunFixture
} from "../../../apps/showcase-blockfall-reactor/src/attract";

const FIXTURE_PATH = "tests/fixtures/blockfall/expert-run.json";

describe("Blockfall attract-mode expert run", () => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as unknown;
  const run = parseAttractRun(raw) as AttractRunFixture;

  it("is a committed expert segment with real play in it", () => {
    expect(run.kind).toBe("blockfall-expert-attract-run");
    expect(run.openingBoard).toBe(true);
    expect(run.events.length).toBeGreaterThan(100);
    expect(run.frames).toBeGreaterThanOrEqual(240);
    // An "expert" run must actually be competent: clears many lines and scores.
    expect(run.expected.finalLines).toBeGreaterThanOrEqual(10);
    expect(run.expected.finalScore).toBeGreaterThan(1000);
    const actionKinds = new Set(run.events.map((event) => event.action.type));
    for (const required of ["move", "rotate", "hardDrop"] as const) {
      expect(actionKinds.has(required)).toBe(true);
    }
  });

  it("replays deterministically to the pinned score hash and state checksum", () => {
    const result = verifyAttractRun(run);
    expect(result.deterministicSecondRun).toBe(true);
    expect(result.finalScore).toBe(run.expected.finalScore);
    expect(result.finalLines).toBe(run.expected.finalLines);
    expect(result.stateChecksum).toBe(run.expected.stateChecksum);
    expect(result.scoreHash).toBe(run.expected.scoreHash);
    expect(result.pass).toBe(true);
  });

  it("rejects drifted or mistyped fixtures instead of replaying them", () => {
    expect(() => parseAttractRun(null)).toThrow();
    expect(() => parseAttractRun({ kind: "something-else" })).toThrow();
    const mutated = JSON.parse(JSON.stringify(run)) as AttractRunFixture;
    (mutated.expected as { stateChecksum: string }).stateChecksum = "deadbeef";
    const result = verifyAttractRun(mutated);
    expect(result.pass).toBe(false);
  });

  it("keeps the mounted embedded twin byte-identical to the committed fixture", async () => {
    // The route imports src/expert-run-data.ts (browsers cannot import .json);
    // drift between the twin and the fixture would silently desync attract play
    // from the regression harness pinned above.
    const module = await import("../../../apps/showcase-blockfall-reactor/src/expert-run-data");
    const embedded = JSON.parse(module.EXPERT_RUN_DATA_JSON) as AttractRunFixture;
    expect(embedded).toEqual(run);
  });

  it("steps playback frame-by-frame and loops for the title screen", () => {
    const playback = createAttractPlayback(run.events, 40);
    let fired = 0;
    for (let frame = 0; frame < 40; frame += 1) {
      const actions = playback.advance();
      fired += actions.length;
    }
    // One full loop completed and the counter wrapped to the next.
    expect(playback.loopsCompleted).toBe(1);
    expect(playback.frame).toBe(0);
    expect(fired).toBe(run.events.filter((event) => event.frame <= 40).length);
  });
});
