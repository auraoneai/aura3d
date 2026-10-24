import { describe, expect, it } from "vitest";
import { createCountedRng, createFixedStepLoop } from "../../../packages/engine/src/qa/index.js";

interface Legacy {
  readonly name: string;
  readonly step: number;
  readonly minFrame: number;
  readonly maxFrame: number;
  readonly guard: number | null;
  readonly perFrame: number;
}

/** The accumulator loops the four ports hand-rolled, with each port's own clamp and catch-up guard. */
const LEGACY: readonly Legacy[] = [
  { name: "silt-and-signal", step: 1 / 60, minFrame: 0, maxFrame: 0.1, guard: 8, perFrame: 1 },
  { name: "ninja-runner", step: 1 / 120, minFrame: 0.001, maxFrame: 0.1, guard: 12, perFrame: 1 },
  { name: "roadster-hours", step: 1 / 120, minFrame: 0, maxFrame: 0.05, guard: null, perFrame: 1 },
  { name: "last-train", step: 1 / 60, minFrame: 0, maxFrame: 0.1, guard: 6, perFrame: 1 },
  { name: "last-train speed=3", step: 1 / 60, minFrame: 0, maxFrame: 0.1, guard: 18, perFrame: 3 }
];

function frameSequence(seed: number, count: number): number[] {
  const rng = createCountedRng(seed);
  // whole milliseconds so `(now - last) / 1000` is bit-identical to the legacy `dt`
  return Array.from({ length: count }, () => 2 + Math.floor(rng.next() * 249));
}

function legacyCounts(cfg: Legacy, framesMs: readonly number[]): number[] {
  let acc = 0;
  return framesMs.map((ms) => {
    const dt = Math.min(cfg.maxFrame, Math.max(cfg.minFrame, ms / 1000));
    acc += dt;
    let n = 0;
    while (acc >= cfg.step && (cfg.guard === null || n < cfg.guard)) {
      acc -= cfg.step;
      n++;
    }
    return n;
  });
}

function kitCounts(cfg: Legacy, framesMs: readonly number[]): number[] {
  const loop = createFixedStepLoop({
    stepSeconds: cfg.step,
    minFrameSeconds: Math.max(cfg.minFrame, 0.001),
    maxFrameSeconds: cfg.maxFrame,
    maxCatchUpSteps: cfg.guard ?? 8,
    step: () => undefined
  });
  let now = 0;
  return framesMs.map((ms) => {
    now += ms;
    return loop.tick(now);
  });
}

describe("ported fixed-step loops", () => {
  for (const cfg of LEGACY) {
    it(`${cfg.name}: the kit loop runs the same steps per frame as the hand-rolled accumulator`, () => {
      const frames = frameSequence(20261024, 20000);
      const expected = legacyCounts(cfg, frames);
      const actual = kitCounts(cfg, frames);
      const diverged = expected.findIndex((n, i) => n !== actual[i]);
      expect(diverged, `first differing frame: legacy ${expected[diverged]} vs kit ${actual[diverged]}`).toBe(-1);
      expect(actual.reduce((a, b) => a + b, 0)).toBe(expected.reduce((a, b) => a + b, 0));
    });
  }
});
