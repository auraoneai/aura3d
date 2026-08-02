import { describe, expect, it } from "vitest";
import {
  DEMO_REPLAY_60S,
  REPLAY_PROOF_FRAMES,
  createOpeningBoard,
  createSixtySecondReplay,
  createSixtySecondReplayProof,
  runReplay
} from "../../../apps/showcase-blockfall-reactor/src/rules";

describe("Blockfall deterministic 60-second replay proof", () => {
  it("is scoped to the route's own simulation, not the mounted kit", () => {
    const proof = createSixtySecondReplayProof();
    expect(proof.simulation).toBe("apps/showcase-blockfall-reactor/src/rules.ts");
    // The public game.fallingBlocks kit uses a different piece randomizer, so
    // this artifact must never claim to prove mounted kit playback.
    expect(proof.provesMountedKitPlayback).toBe(false);
  });

  it("spans a full 60 seconds at the route's fixed 60 Hz step", () => {
    expect(REPLAY_PROOF_FRAMES).toBe(3600);
    const proof = createSixtySecondReplayProof();
    expect(proof.replayedSeconds).toBeGreaterThanOrEqual(60);
    expect(proof.meetsSixtySecondTarget).toBe(true);
    // Events must be distributed across the window, not clustered at the start.
    const lastFrame = Math.max(...DEMO_REPLAY_60S.map((event) => event.frame));
    expect(lastFrame).toBeGreaterThan(REPLAY_PROOF_FRAMES * 0.9);
    // The planner tops out mid-window, so the run spans multiple segments.
    expect(proof.segmentCount).toBeGreaterThan(1);
  });

  it("is deterministic across repeated runs", () => {
    const proof = createSixtySecondReplayProof();
    expect(proof.deterministic).toBe(true);
    expect(proof.finalChecksum).toBe(proof.secondFinalChecksum);

    // An independent third run must reproduce the same final checksum.
    const third = runReplay(DEMO_REPLAY_60S, {
      frames: REPLAY_PROOF_FRAMES,
      board: createOpeningBoard()
    });
    expect(third.finalChecksum).toBe(proof.finalChecksum);
  });

  it("exercises move, both rotations, hold, soft drop, and hard drop", () => {
    const proof = createSixtySecondReplayProof();
    expect(proof.mechanics.move).toBe(true);
    expect(proof.mechanics.rotateClockwise).toBe(true);
    expect(proof.mechanics.rotateCounterClockwise).toBe(true);
    expect(proof.mechanics.hold).toBe(true);
    expect(proof.mechanics.softDrop).toBe(true);
    expect(proof.mechanics.hardDrop).toBe(true);
  });

  it("produces real line clears, scoring, level progression, and game over", () => {
    const proof = createSixtySecondReplayProof();
    expect(proof.mechanics.lineClear, "replay should clear at least one line").toBe(true);
    expect(proof.mechanics.scoring, "replay should score").toBe(true);
    expect(proof.mechanics.levelProgression, "replay should advance past level 1").toBe(true);
    expect(proof.mechanics.gameOver, "replay should top out to prove game over").toBe(true);
    expect(proof.mechanics.reset, "replay should recover from top-out").toBe(true);
    expect(proof.missingMechanics).toEqual([]);
    expect(proof.pass).toBe(true);
  });

  it("cannot report a mechanic the simulated run did not produce", () => {
    // A near-empty replay must fail: the flags are derived, not declared.
    const shortProof = runReplay(createSixtySecondReplay().slice(0, 2), {
      frames: 60,
      board: createOpeningBoard()
    });
    expect(shortProof.finalSummary.lines).toBe(0);
    expect(shortProof.finalSummary.gameOver).toBe(false);
  });
});
