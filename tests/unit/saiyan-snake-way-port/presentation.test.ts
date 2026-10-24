import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { createRenderInterpolator } from "../../../packages/game/src/motion/smoothing";
import { advanceRunPhase, blendSamples, sampleOf, stepChaseRig, withSample, type PresentSample } from "../../../examples/saiyan-snake-way-port/presentation";
import { createRun, stepRun, STEP, type RunState } from "../../../examples/saiyan-snake-way-port/sim";

const at = (s: number, extra: Partial<PresentSample> = {}): PresentSample => ({ phase: "run", s, laneX: 0, y: 0, laneVel: 0, ...extra });

describe("blendSamples", () => {
  it("blends the last two samples", () => {
    const out = blendSamples(at(9, { laneX: 0, y: 0, laneVel: 0 }), at(10, { laneX: 2, y: 1, laneVel: 4 }), 0.25);
    expect(out.s).toBeCloseTo(9.25, 12);
    expect(out.laneX).toBeCloseTo(0.5, 12);
    expect(out.y).toBeCloseTo(0.25, 12);
    expect(out.laneVel).toBeCloseTo(1, 12);
  });

  it("snaps on a phase change, a restart or a jump", () => {
    const cur = at(10);
    expect(blendSamples(at(9, { phase: "fall" }), cur, 0.5)).toBe(cur);
    expect(blendSamples(at(11), cur, 0.5)).toBe(cur);
    expect(blendSamples(at(-50), cur, 0.5)).toBe(cur);
  });

  it("withSample swaps only the blended fields", () => {
    const S = { ...at(10), speed: 30, ents: [] as number[] };
    const out = withSample(S, at(9.5, { laneX: 1 }));
    expect(out.s).toBe(9.5);
    expect(out.laneX).toBe(1);
    expect(out.speed).toBe(30);
    expect(out.ents).toBe(S.ents);
  });
});

describe("advanceRunPhase and stepChaseRig", () => {
  it("advances with distance, or slowly while standing still", () => {
    expect(advanceRunPhase(1, 2, 0.016)).toBeCloseTo(1 + 2 * 0.62, 12);
    expect(advanceRunPhase(1, 0, 0.016)).toBeCloseTo(1 + 0.016 * 2.5, 12);
  });

  it("snaps on the first call and then follows", () => {
    const first = stepChaseRig(null, [0, 0, -1], [0, 2, 0], 0.016);
    expect(first.f).toEqual([0, 0, -1]);
    expect(first.u).toEqual([0, 1, 0]);
    const next = stepChaseRig(first, [1, 0, 0], [0, 1, 0], 0.016);
    expect(next.f[0]).toBeGreaterThan(0);
    expect(next.f[0]).toBeLessThan(1);
  });
});

describe("live presentation is even at any refresh rate", () => {
  function drawnDistances(periodMs: number, blend: boolean): { cv: number; standing: number } {
    const S: RunState = createRun();
    const interpolator = createRenderInterpolator<PresentSample>(blendSamples);
    interpolator.reset(sampleOf(S));
    const loop = createFixedStepLoop({
      stepSeconds: STEP, maxFrameSeconds: 0.1, minFrameSeconds: 0, maxCatchUpSteps: 8,
      step() { stepRun(S, { taps: [], held: [] }, STEP); S.ents = []; S.stumble = 0; S.shake = 0; interpolator.push(sampleOf(S)); }
    });
    loop.tick(0);
    let now = 0;
    let before: number | null = null;
    const deltas: number[] = [];
    while (now < 8000) {
      now += periodMs;
      loop.tick(now);
      const alpha = Math.min(1, loop.accumulator / STEP);
      const s = (blend && alpha < 1 ? withSample(S, interpolator.sample(alpha) as PresentSample) : S).s;
      if (now > 3000 && before !== null) deltas.push(s - before);
      before = s;
    }
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const sd = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length);
    return { cv: sd / mean, standing: deltas.filter((d) => d <= 1e-5).length };
  }

  it("never draws a standing frame at 120 and 144 Hz once blended", () => {
    for (const period of [1000 / 120, 1000 / 144]) {
      const blended = drawnDistances(period, true);
      const raw = drawnDistances(period, false);
      expect(raw.standing).toBeGreaterThan(100);
      expect(blended.standing).toBe(0);
      expect(blended.cv).toBeLessThan(0.1);
      expect(raw.cv).toBeGreaterThan(0.8);
    }
  });
});
