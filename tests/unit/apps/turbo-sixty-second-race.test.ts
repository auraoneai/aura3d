import { describe, expect, it } from "vitest";
import { RACE_PROOF_FRAMES, createSixtySecondRaceProof } from "../../../apps/showcase-turbo-drift-circuit/src/race-proof";

/**
 * FS-102: "Ensure the race lasts at least 30 seconds and retain a 60-second playable review run."
 *
 * Duration is not something a screenshot can show, so it is proven by simulating the public
 * `game.racing` kit with the route's own certified configuration over a full 3,600-frame window and
 * asserting what was measured. This mirrors the Blockfall 60-second replay proof.
 *
 * Honesty boundary: this exercises the kit, not mounted browser playback. `provesMountedKitPlayback`
 * is `false` in the artifact and asserted below so the distinction cannot be lost.
 */
describe("Turbo Drift Circuit sixty-second race proof", () => {
  const proof = createSixtySecondRaceProof();

  it("simulates a full 60-second window deterministically", () => {
    expect(proof.frames).toBe(RACE_PROOF_FRAMES);
    expect(proof.simulatedSeconds).toBeCloseTo(60, 3);
    // Two independent runs from fresh state agree, so the recorded metrics are reproducible rather
    // than one lucky sample.
    expect(proof.deterministic).toBe(true);
  });

  it("proves the race is raceable for at least the required 30 seconds", () => {
    expect(proof.minimumRaceSeconds).toBe(30);
    expect(proof.mechanics.completesMinimumDuration).toBe(true);
    // The run actually finishes rather than timing out, and it does so after the 30-second floor.
    expect(proof.metrics.finalStatus).toBe("finished");
    expect(proof.metrics.raceSecondsToFinish).not.toBeNull();
    expect(proof.metrics.raceSecondsToFinish!).toBeGreaterThanOrEqual(30);
    expect(proof.metrics.raceSecondsToFinish!).toBeLessThanOrEqual(60);
  });

  it("credits ordered checkpoints across multiple completed laps", () => {
    // `checkpoint` counts gates within a lap and resets at each lap boundary, so ordering allows a
    // single-step advance or a reset when the lap number increases, and nothing else.
    expect(proof.mechanics.orderedCheckpointsCredited).toBe(true);
    expect(proof.metrics.checkpointsCredited).toBeGreaterThan(20);
    expect(proof.metrics.lapsCompleted).toBeGreaterThanOrEqual(2);
  });

  it("observes real throttle, steering, and handbrake drift rather than declaring them", () => {
    expect(proof.mechanics.throttleAccelerates).toBe(true);
    expect(proof.mechanics.steeringChangesHeading).toBe(true);
    // Drift must come from the kit's own slip value under handbrake, not from steering input.
    expect(proof.mechanics.handbrakeBuildsDrift).toBe(true);
    expect(proof.metrics.maxDrift).toBeGreaterThan(0.12);
    expect(proof.metrics.framesDrifting).toBeGreaterThan(0);
    expect(proof.metrics.maxSpeed).toBeGreaterThan(1);
  });

  it("keeps the car on the road for the large majority of the run", () => {
    // A controller that cannot hold the racing line would sit off-track for most of the window.
    // Before `signedTrackOffset` existed this measured 2,105 off-track frames of 3,600.
    expect(proof.metrics.offTrackFrames).toBeLessThan(proof.frames * 0.15);
    expect(proof.metrics.framesAtSpeed).toBeGreaterThan(proof.frames * 0.8);
  });

  it("advances the opponent independently of the player", () => {
    expect(proof.mechanics.opponentAdvancesIndependently).toBe(true);
    expect(proof.metrics.opponentCheckpointsCredited).toBeGreaterThan(0);
    expect(proof.metrics.finalOpponentProgress).not.toBe(proof.metrics.finalPlayerProgress);
  });

  it("restores the start state on reset", () => {
    expect(proof.mechanics.resetReturnsToStart).toBe(true);
  });

  it("does not claim mounted browser playback", () => {
    // The sequence is planned against the kit, so it must not be read as route playback proof.
    expect(proof.provesMountedKitPlayback).toBe(false);
    expect(proof.simulation).toBe("apps/showcase-turbo-drift-circuit/src/race-proof.ts");
  });
});
