import { describe, expect, it } from "vitest";
import { FixedStepAccumulator, Time, ValidationError, resolveEngineConfig } from "@galileo3d/core";

describe("core config and time", () => {
  it("normalizes immutable config defaults", () => {
    const config = resolveEngineConfig();
    expect(config.targetFPS).toBe(60);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("rejects invalid config values", () => {
    expect(() => resolveEngineConfig({ targetFPS: 0 })).toThrow(ValidationError);
    expect(() => resolveEngineConfig({ fixedDelta: -1 })).toThrow(ValidationError);
  });

  it("clamps delta spikes and tracks scaled time", () => {
    const time = new Time(0.1, 0.5);
    const snapshot = time.update(1);
    expect(snapshot.unscaledDelta).toBe(0.1);
    expect(snapshot.delta).toBe(0.05);
    expect(snapshot.elapsed).toBe(0.05);
  });

  it("is deterministic for identical fixed-step sequences", () => {
    const run = () => {
      const accumulator = new FixedStepAccumulator(1 / 60, 4);
      return [accumulator.add(0.01), accumulator.add(0.02), accumulator.add(0.04)].map((result) => [result.steps, result.alpha]);
    };
    expect(run()).toEqual(run());
  });

  it("rejects non-finite fixed-step accumulator configuration and deltas", () => {
    expect(() => new FixedStepAccumulator(Number.POSITIVE_INFINITY, 1)).toThrow(/fixedDelta/i);
    expect(() => new FixedStepAccumulator(Number.NaN, 1)).toThrow(/fixedDelta/i);
    expect(() => new FixedStepAccumulator(1 / 60, 0)).toThrow(/maxSteps/i);
    expect(() => new FixedStepAccumulator(1 / 60, 1).add(Number.NaN)).toThrow(/delta/i);
  });

  it("caps fixed catch-up work and reports dropped time", () => {
    const accumulator = new FixedStepAccumulator(1, 2);
    const result = accumulator.add(10);
    expect(result.steps).toBe(2);
    expect(result.droppedTime).toBeGreaterThan(0);
    expect(result.alpha).toBe(0);
  });
});
