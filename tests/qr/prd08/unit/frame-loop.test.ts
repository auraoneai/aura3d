/**
 * L-1/L-2/L-3 FrameLoop flag-on behaviour (PRD-08 §6.1).
 * Flag-off invariants are covered by tests/unit/engine/fixed-step-determinism.test.ts.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { createFrameLoop } from "@aura3d/engine";
import type { FrameLoopTick } from "@aura3d/engine/lanes";

const loopFlags = resolveQrFlags({ options: ["camera.loop"] });
const offFlags = resolveQrFlags({});

function makeLoop(options: Record<string, unknown> = {}) {
  return createFrameLoop({ useRaf: false, flags: loopFlags, ...options });
}

describe("L-1 maxFrameDt clamp", () => {
  it("flag-on step(0.25) consumes only 0.1 s and counts the clamp", () => {
    const loop = makeLoop();
    const snap = loop.step(0.25);
    expect(snap.time).toBeCloseTo(0.1, 5);
    expect(snap.clampedFrames).toBe(1);
  });

  it("flag-off step(0.25) is unchanged (5 substeps, legacy leftover clamp)", () => {
    const loop = createFrameLoop({ useRaf: false, flags: offFlags });
    const snap = loop.step(0.25);
    expect(snap.time).toBeCloseTo(5 / 60, 5);
    expect(snap.clampedFrames).toBe(0);
  });
});

describe("L-2 substeps + overload policies", () => {
  it("defaults to 6 substeps under the flag (5 without)", () => {
    expect(makeLoop().snapshot().maxSubSteps).toBe(6);
    expect(createFrameLoop({ useRaf: false, flags: offFlags }).snapshot().maxSubSteps).toBe(5);
  });

  it("overload:slow-motion counts demand>cap and clamps leftover to fixedDt", () => {
    const loop = makeLoop({ fixedDt: 1 / 120, overload: "slow-motion" });
    const snap = loop.step(0.1);
    expect(snap.lastFrame?.substeps).toBe(6);
    expect(snap.overloadFrames).toBe(1);
    expect(snap.alpha).toBeGreaterThan(0);
  });

  it("overload:catch-up drains the whole 0.1 s backlog at fixedDt 1/120", () => {
    const loop = makeLoop({ fixedDt: 1 / 120, overload: "catch-up" });
    const snap = loop.step(0.1);
    expect(snap.lastFrame?.substeps).toBe(12);
    expect(snap.alpha).toBeCloseTo(0, 5);
  });
});

describe("L-3 once-per-tick onTick", () => {
  it("emits once per step call, including 0-substep ticks", () => {
    const loop = makeLoop();
    const ticks: FrameLoopTick[] = [];
    loop.onTick((t) => ticks.push(t));
    loop.step(0);
    loop.step(1 / 60);
    loop.step(1 / 60);
    expect(ticks).toHaveLength(3);
    expect(ticks[0].substeps).toBe(0);
    expect(ticks[1].substeps).toBe(1);
    expect(ticks[2].substeps).toBe(1);
  });
});

describe("T-2 live timeScale binding", () => {
  it("a bound 0 source freezes substeps but keeps the tick", () => {
    const loop = makeLoop();
    loop.bindTimeScale(() => 0);
    const ticks: FrameLoopTick[] = [];
    loop.onTick((t) => ticks.push(t));
    const snap = loop.step(1 / 60);
    expect(snap.lastFrame).toBeUndefined();
    expect(ticks).toHaveLength(1);
    expect(ticks[0].substeps).toBe(0);
    loop.bindTimeScale(undefined);
    loop.setTimeScale(1);
    expect(loop.step(1 / 60).lastFrame?.substeps).toBe(1);
  });
});

describe("§6.7 substep death-spiral guard", () => {
  it("drops the cap by one after 30 consecutive over-budget ticks", () => {
    let wall = 0;
    const loop = makeLoop({ now: () => (wall += 200) });
    for (let i = 0; i < 30; i += 1) loop.step(1 / 60);
    const snap = loop.snapshot();
    expect(snap.substepCap).toBe(5);
    expect(snap.substepCapReduced).toBe(1);
  });
});
