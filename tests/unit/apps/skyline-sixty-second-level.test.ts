import { describe, expect, it } from "vitest";
import { LEVEL_PROOF_FRAMES, createSixtySecondLevelProof } from "../../../apps/showcase-skyline-runner/src/level-proof";

/**
 * The five-act Level 1 must physically complete inside a 120-180 second normal-play window.
 *
 * Duration cannot be shown in a screenshot, so it is proven by driving the public `game.platformer`
 * kit with the route's own asset-bound level across a full 3,600-frame window and asserting measured
 * values. Mirrors the Blockfall replay proof and the Turbo race proof.
 *
 * Honesty boundary: this exercises the kit, not mounted browser playback.
 */
describe("Skyline Runner full Level 1 proof", () => {
  const proof = createSixtySecondLevelProof();

  it("simulates the full 180-second acceptance window deterministically", () => {
    expect(proof.frames).toBe(LEVEL_PROOF_FRAMES);
    expect(proof.simulatedSeconds).toBeCloseTo(180, 3);
    expect(proof.deterministic).toBe(true);
  });

  it("sustains at least two minutes and completes before three minutes", () => {
    expect(proof.minimumPlayableSeconds).toBe(120);
    expect(proof.authoredPlayableSeconds).toBe(170);
    expect(proof.mechanics.sustainsMinimumDuration).toBe(true);
    expect(proof.mechanics.completionFallsInsideTargetWindow).toBe(true);
    expect(proof.metrics.secondsPlayable).toBeGreaterThanOrEqual(120);
    expect(proof.metrics.secondsPlayable).toBeLessThanOrEqual(180);
    expect(proof.metrics.finalStatus).toBe("completed");
    expect(proof.metrics.finishFrame).not.toBeNull();
  });

  it("traverses the level under real locomotion rather than standing still", () => {
    expect(proof.mechanics.movementAdvancesTraversal).toBe(true);
    // Ten districts span about 151 game units; a full completion cannot be
    // substituted with a timer or a short repeated opening strip.
    expect(proof.metrics.maxTraversalX).toBeGreaterThan(148);
  });

  it("observes jumps that leave the ground and landings that return to it", () => {
    expect(proof.mechanics.jumpLeavesGround).toBe(true);
    expect(proof.mechanics.landingReturnsToGround).toBe(true);
    expect(proof.metrics.jumpsLaunched).toBeGreaterThan(5);
    // A floating-platform course is mostly airtime, but repeated measured landings must still
    // account for a meaningful fraction of the forward run rather than one incidental frame.
    expect(proof.metrics.groundedFrames).toBeGreaterThan(proof.metrics.framesPlayable * 0.05);
    expect(proof.metrics.airborneFrames).toBeGreaterThan(0);
  });

  it("banks collectibles and activates checkpoints during the run", () => {
    expect(proof.mechanics.collectiblesBanked).toBe(true);
    expect(proof.mechanics.checkpointsActivated).toBe(true);
    expect(proof.metrics.collectedCount).toBeGreaterThan(0);
    // The certified ten-district world contains six relay checkpoints, all of
    // which must be crossed during a successful end-to-end traversal.
    expect(proof.metrics.activatedCheckpointCount).toBeGreaterThanOrEqual(6);
    expect(proof.metrics.finalScore).toBeGreaterThan(0);
  });

  it("restores the start state on reset", () => {
    expect(proof.mechanics.resetReturnsToStart).toBe(true);
  });

  it("does not claim mounted browser playback", () => {
    expect(proof.provesMountedKitPlayback).toBe(false);
    expect(proof.simulation).toBe("apps/showcase-skyline-runner/src/level-proof.ts");
  });
});
