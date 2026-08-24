import { describe, expect, it } from "vitest";
import {
  REPLAY_PROOF_FRAMES,
  createSixtySecondReplayPlan,
  runSixtySecondReplay
} from "../../../apps/showcase-siege-golf/src/replay-proof";

/**
 * PRD DoD pin: ">=60s meaningful play per hole demonstrated". Mirrors the
 * blockfall contract: deterministic route-local replay, derived mechanics
 * flags, explicit scope boundary (not mounted kit playback).
 */
describe("siege golf deterministic 60-second replay proof", { timeout: 30_000 }, () => {
  it("is scoped to the route's own hole flow, not mounted playback", () => {
    const { proof } = runSixtySecondReplay();
    expect(proof.simulation).toBe("apps/showcase-siege-golf/src/hole-flow.ts");
    expect(proof.provesMountedKitPlayback).toBe(false);
  });

  it("spans a full 60 seconds at the route's fixed 60 Hz step", () => {
    expect(REPLAY_PROOF_FRAMES).toBe(3600);
    const { proof } = runSixtySecondReplay();
    expect(proof.replayedSeconds).toBeGreaterThanOrEqual(60);
    expect(proof.meetsSixtySecondTarget).toBe(true);
    // Events must be distributed across the window, not clustered early.
    expect(proof.lastEventFrame).toBeGreaterThan(REPLAY_PROOF_FRAMES * 0.5);
  });

  it("is deterministic across repeated runs", () => {
    const { proof } = runSixtySecondReplay();
    expect(proof.deterministic).toBe(true);
    const third = runSixtySecondReplay();
    expect(third.proof.finalChecksum).toBe(proof.finalChecksum);
    expect(third.proof.timelineChecksum).toBe(proof.timelineChecksum);
  });

  it("exercises varied aim and power, not a single degenerate shot", () => {
    const plan = createSixtySecondReplayPlan();
    expect(plan.length).toBeGreaterThan(3);
    expect(new Set(plan.map((entry) => entry.angle.toFixed(3))).size).toBeGreaterThan(1);
    expect(new Set(plan.map((entry) => entry.power.toFixed(3))).size).toBeGreaterThan(2);
    const { proof } = runSixtySecondReplay();
    expect(proof.mechanics.aimAdjust).toBe(true);
    expect(proof.mechanics.chargeVariance).toBe(true);
  });

  it("produces strike, sensor fires, topple, sink, completion, reset, and hash proofs", () => {
    const { proof } = runSixtySecondReplay();
    expect(proof.mechanics.strike).toBe(true);
    expect(proof.mechanics.sensorFire, "cup sensor must fire during the window").toBe(true);
    expect(proof.mechanics.targetDown).toBe(true);
    expect(proof.mechanics.targetSunk).toBe(true);
    expect(proof.mechanics.holeComplete).toBe(true);
    expect(proof.mechanics.reset, "mid-window reset must prove hash equality").toBe(true);
    expect(proof.mechanics.hashProof).toBe(true);
    expect(proof.missingMechanics).toEqual([]);
    expect(proof.pass).toBe(true);
    expect(proof.targetsSunkPeak, "at least one pin must sink during the window").toBeGreaterThanOrEqual(1);
    expect(proof.targetsSunk, "mid-window reset restores the stack, so final sunk is zero").toBe(0);
    expect(proof.resetHashMatch).toBe(true);
  });
});
