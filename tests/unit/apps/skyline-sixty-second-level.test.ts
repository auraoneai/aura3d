import { describe, expect, it } from "vitest";
import { LEVEL_PROOF_FRAMES, createSixtySecondLevelProof } from "../../../apps/showcase-skyline-runner/src/level-proof";

/**
 * FS-103: "Retain at least 30 seconds of asset-aligned level duration and a 60-second" review run.
 *
 * Duration cannot be shown in a screenshot, so it is proven by driving the public `game.platformer`
 * kit with the route's own asset-bound level across a full 3,600-frame window and asserting measured
 * values. Mirrors the Blockfall replay proof and the Turbo race proof.
 *
 * Honesty boundary: this exercises the kit, not mounted browser playback.
 */
describe("Skyline Runner sixty-second level proof", () => {
  const proof = createSixtySecondLevelProof();

  it("simulates a full 60-second window deterministically", () => {
    expect(proof.frames).toBe(LEVEL_PROOF_FRAMES);
    expect(proof.simulatedSeconds).toBeCloseTo(60, 3);
    expect(proof.deterministic).toBe(true);
  });

  it("sustains at least the authored 30 seconds of asset-aligned play", () => {
    expect(proof.minimumPlayableSeconds).toBe(30);
    // The level is authored for 30 seconds; the proof window is twice that.
    expect(proof.authoredPlayableSeconds).toBeGreaterThanOrEqual(30);
    expect(proof.mechanics.sustainsMinimumDuration).toBe(true);
    expect(proof.metrics.secondsPlayable).toBeGreaterThanOrEqual(30);
  });

  it("traverses the level under real locomotion rather than standing still", () => {
    expect(proof.mechanics.movementAdvancesTraversal).toBe(true);
    // The authored platform run spans roughly 15 units, so a real sweep covers most of it.
    expect(proof.metrics.maxTraversalX).toBeGreaterThan(8);
  });

  it("observes jumps that leave the ground and landings that return to it", () => {
    expect(proof.mechanics.jumpLeavesGround).toBe(true);
    expect(proof.mechanics.landingReturnsToGround).toBe(true);
    expect(proof.metrics.jumpsLaunched).toBeGreaterThan(5);
    // The hero must spend substantial time on the ground, not read as permanently airborne.
    expect(proof.metrics.groundedFrames).toBeGreaterThan(proof.frames * 0.2);
    expect(proof.metrics.airborneFrames).toBeGreaterThan(0);
  });

  it("banks collectibles and activates checkpoints during the run", () => {
    expect(proof.mechanics.collectiblesBanked).toBe(true);
    expect(proof.mechanics.checkpointsActivated).toBe(true);
    expect(proof.metrics.collectedCount).toBeGreaterThan(0);
    // The level declares six checkpoints; a real traversal reaches several of them.
    expect(proof.metrics.activatedCheckpointCount).toBeGreaterThanOrEqual(3);
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
