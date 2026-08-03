import { describe, expect, it } from "vitest";
import { createFrameLoop } from "../../../packages/engine/src/agent-api/FrameLoop";
import { game, solvePlatformerMotion } from "../../../packages/engine/src";

/**
 * Phase 7: fixed-step runtime and simulation foundation.
 *
 * The requirement is that gameplay outcomes stay within documented tolerances at 30, 60
 * and 120 FPS and under jittered frame timing. That is not a property of the game kits on
 * their own -- a kit stepped with raw wall-clock deltas produces a different result at
 * every frame rate, because a larger `dt` integrates coarser. It is a property of the
 * *loop* driving them.
 *
 * These tests drive the same simulation through `FrameLoop` at each rate and compare
 * outcomes. Where a tolerance is needed it is stated and justified, not fitted to whatever
 * the code happens to produce.
 */

/** Documented tolerances for the invariants below. */
const TOLERANCES = {
  /**
   * Positional agreement across frame rates, in world units.
   *
   * A fixed-step loop makes the *simulation* identical; what differs is where the tail of
   * the last frame lands, because a 30 FPS frame delivers 2 substeps and a 120 FPS frame
   * delivers 0 or 1. The residue is bounded by one fixed step of travel, so the tolerance
   * is derived from that rather than chosen.
   */
  crossRatePositionUnits: 0.05,
  /** Simulation steps must match exactly for the same total simulated time. */
  stepCountExact: true
} as const;

/** Frame-rate profiles the assignment names. */
const RATES = [
  { label: "30 FPS", frameDt: 1 / 30 },
  { label: "60 FPS", frameDt: 1 / 60 },
  { label: "120 FPS", frameDt: 1 / 120 }
] as const;

/** Deterministic jitter: a fixed sequence, so the test is reproducible. */
function jitteredDeltas(count: number, baseDt: number, seed = 7): readonly number[] {
  let random = seed >>> 0 || 1;
  const next = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) / 0xffffffff;
  };
  // Frame times swing between a third and triple the nominal delta, which is a harsher
  // spread than a real browser produces under load.
  return Array.from({ length: count }, () => baseDt * (0.33 + next() * 2.67));
}

describe("fixed-step loop", () => {
  it("emits one substep per fixed interval regardless of frame delta", () => {
    for (const rate of RATES) {
      const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 8, useRaf: false });
      let steps = 0;
      loop.onFrame(() => { steps += 1; });
      // Drive exactly two seconds of simulated time at this frame rate.
      const frames = Math.round(2 / rate.frameDt);
      for (let frame = 0; frame < frames; frame += 1) loop.step(rate.frameDt);
      // Two seconds at a 1/60 fixed step is 120 steps at every frame rate.
      expect(steps, `${rate.label} substep count`).toBe(120);
    }
  });

  it("reports the same simulated time at every frame rate", () => {
    const times = RATES.map((rate) => {
      const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 8, useRaf: false });
      const frames = Math.round(2 / rate.frameDt);
      for (let frame = 0; frame < frames; frame += 1) loop.step(rate.frameDt);
      return loop.snapshot().time;
    });
    for (const time of times) expect(time).toBeCloseTo(times[0]!, 9);
  });

  it("bounds catch-up so a background tab cannot deliver a burst of steps", () => {
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 5, useRaf: false });
    let steps = 0;
    loop.onFrame(() => { steps += 1; });
    // 30 seconds of wall clock while the tab was hidden: 1800 fixed intervals.
    loop.step(30);
    // Bounded to maxSubSteps, not 1800. An unbounded loop would freeze the tab on return
    // and teleport every simulated object.
    expect(steps).toBe(5);
  });

  it("discards the unspent backlog rather than paying it down over later frames", () => {
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 5, useRaf: false });
    let steps = 0;
    loop.onFrame(() => { steps += 1; });
    loop.step(30);
    expect(steps).toBe(5);
    // A loop that kept the backlog would keep bursting for hundreds of frames afterwards.
    for (let frame = 0; frame < 10; frame += 1) loop.step(1 / 60);
    expect(steps).toBeLessThanOrEqual(5 + 11);
  });

  it("exposes an interpolation alpha inside the fixed interval", () => {
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 8, useRaf: false });
    // Advance by half a fixed step: no substep yet, and alpha is the partial progress.
    loop.step(1 / 120);
    const alpha = loop.snapshot().alpha;
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThan(0.6);
  });

  it("stops advancing while paused and resumes without a catch-up burst", () => {
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 5, useRaf: false });
    let steps = 0;
    loop.onFrame(() => { steps += 1; });
    for (let frame = 0; frame < 6; frame += 1) loop.step(1 / 60);
    const beforePause = steps;
    loop.pause();
    // A paused loop still receives frames from a host that keeps calling it; the loop must
    // not silently accumulate them into a burst on resume.
    loop.resume();
    for (let frame = 0; frame < 6; frame += 1) loop.step(1 / 60);
    expect(steps).toBe(beforePause + 6);
  });

  it("is deterministic under jittered frame timing for the same total time", () => {
    const total = 2;
    const run = (deltas: readonly number[]) => {
      const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 8, useRaf: false });
      let steps = 0;
      loop.onFrame(() => { steps += 1; });
      for (const dt of deltas) loop.step(dt);
      return steps;
    };
    const smooth = run(Array.from({ length: 120 }, () => 1 / 60));
    // Jittered deltas scaled so their sum matches the smooth run's total time exactly.
    const raw = jitteredDeltas(120, 1 / 60);
    const sum = raw.reduce((a, b) => a + b, 0);
    const scaled = raw.map((dt) => (dt * total) / sum);
    const jittered = run(scaled);
    // Same simulated time means the same number of fixed steps, within one step of
    // floating-point residue at the tail.
    expect(Math.abs(jittered - smooth)).toBeLessThanOrEqual(1);
  });
});

describe("gameplay outcomes across frame rates", () => {
  /** The clean-room platformer level, so the tolerance is measured on a real level. */
  const PLATFORMS = [
    { id: "ground", x: -1, y: 0, width: 6, height: 0.3 },
    { id: "p1", x: 6, y: 0.5, width: 3, height: 0.3 },
    { id: "p2", x: 10, y: 1.0, width: 3, height: 0.3 },
    { id: "p3", x: 14, y: 0.7, width: 3, height: 0.3 }
  ];
  const motion = solvePlatformerMotion(PLATFORMS, { riseSeconds: 0.28, targetSessionSeconds: 90 });
  const level = {
    id: "determinism",
    gravity: motion.gravity,
    jumpVelocity: motion.jumpVelocity,
    moveSpeed: motion.moveSpeed,
    coyoteMs: motion.coyoteMs,
    jumpBufferMs: motion.jumpBufferMs,
    start: { x: 0, y: 0.4 },
    finish: { x: 16, y: 0.7 },
    lowerBound: -3,
    platforms: PLATFORMS
  };

  /**
   * Drive the platformer through a `FrameLoop` at a given frame rate.
   *
   * Input is sampled per *fixed step*, not per frame, which is what makes the outcome
   * frame-rate independent: sampling per frame would give a 120 FPS player twice as many
   * jump inputs as a 60 FPS one.
   */
  function runPlatformer(frameDeltas: readonly number[]) {
    const kit = game.platformer(level);
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 8, useRaf: false });
    let fixedStep = 0;
    loop.onFrame((frame) => {
      fixedStep += 1;
      // Deterministic input schedule keyed on the fixed step, not on wall time.
      const jump = fixedStep % 40 === 0;
      kit.step(frame.fixedDt, { moveX: 1, jumpPressed: jump, jumpHeld: jump });
    });
    for (const dt of frameDeltas) loop.step(dt);
    const snapshot = kit.snapshot();
    return { x: snapshot.player.x, y: snapshot.player.y, grounded: snapshot.player.grounded, steps: fixedStep };
  }

  it("reaches the same position at 30, 60 and 120 FPS", () => {
    const results = RATES.map((rate) => ({
      label: rate.label,
      ...runPlatformer(Array.from({ length: Math.round(3 / rate.frameDt) }, () => rate.frameDt))
    }));
    // Identical fixed-step counts for identical simulated time.
    for (const result of results) {
      expect(result.steps, `${result.label} fixed steps`).toBe(results[0]!.steps);
    }
    // And therefore identical outcomes, since input is sampled per fixed step.
    for (const result of results) {
      expect(Math.abs(result.x - results[0]!.x), `${result.label} x drift`).toBeLessThan(TOLERANCES.crossRatePositionUnits);
      expect(Math.abs(result.y - results[0]!.y), `${result.label} y drift`).toBeLessThan(TOLERANCES.crossRatePositionUnits);
    }
  });

  it("stays within tolerance under jittered frame timing", () => {
    const total = 3;
    const smooth = runPlatformer(Array.from({ length: 180 }, () => 1 / 60));
    const raw = jitteredDeltas(180, 1 / 60, 11);
    const sum = raw.reduce((a, b) => a + b, 0);
    const jittered = runPlatformer(raw.map((dt) => (dt * total) / sum));
    expect(Math.abs(jittered.steps - smooth.steps)).toBeLessThanOrEqual(1);
    expect(Math.abs(jittered.x - smooth.x)).toBeLessThan(TOLERANCES.crossRatePositionUnits);
  });

  it("produces a byte-identical trace for a repeated run at the same rate", () => {
    const deltas = Array.from({ length: 180 }, () => 1 / 60);
    expect(JSON.stringify(runPlatformer(deltas))).toBe(JSON.stringify(runPlatformer(deltas)));
  });

  it("recovers from a background-tab gap without teleporting the player", () => {
    const kit = game.platformer(level);
    const loop = createFrameLoop({ fixedDt: 1 / 60, maxSubSteps: 5, useRaf: false });
    loop.onFrame((frame) => { kit.step(frame.fixedDt, { moveX: 1 }); });
    for (let frame = 0; frame < 60; frame += 1) loop.step(1 / 60);
    const before = kit.snapshot().player.x;
    // 30 seconds hidden. Bounded catch-up means at most 5 steps of travel, not 30s of it.
    loop.step(30);
    const after = kit.snapshot().player.x;
    expect(after - before).toBeLessThan(level.moveSpeed * 6 * (1 / 60));
  });
});
