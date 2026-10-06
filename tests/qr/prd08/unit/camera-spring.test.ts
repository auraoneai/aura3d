/**
 * C-8 spring math (PRD-08 §6.3).
 */
import { describe, expect, it } from "vitest";
import { smoothingToHalflife, springDamp, springStep } from "@aura3d/engine/lanes";

describe("springDamp", () => {
  it("halves the remaining gap every halflife", () => {
    expect(springDamp(0, 1, 0.25, 0.25)).toBeCloseTo(0.5, 6);
    expect(springDamp(0.5, 1, 0.25, 0.25)).toBeCloseTo(0.75, 6);
    expect(springDamp(10, -4, 0.1, 0.1)).toBeCloseTo(3, 6);
  });

  it("snaps to target for non-positive halflife or dt", () => {
    expect(springDamp(0, 1, 0, 0.1)).toBe(1);
    expect(springDamp(0, 1, 0.1, 0)).toBe(1);
  });
});

describe("springStep (critically damped)", () => {
  it("leaves a 0.597 gap at t = halflife from rest", () => {
    const { x } = springStep(0, 0, 1, 0.25, 0.25);
    expect(1 - x).toBeCloseTo(0.597, 2);
  });

  it("converges without overshoot and carries velocity", () => {
    let state = { x: 0, v: 0 };
    for (let i = 0; i < 120; i += 1) state = springStep(state.x, state.v, 1, 0.05, 1 / 120);
    expect(state.x).toBeCloseTo(1, 3);
    expect(Math.abs(state.v)).toBeLessThan(0.05);
    // No overshoot: monotonic approach from rest.
    let prev = 0;
    let s = { x: 0, v: 0 };
    for (let i = 0; i < 60; i += 1) {
      s = springStep(s.x, s.v, 1, 0.1, 1 / 60);
      expect(s.x).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s.x;
    }
  });
});

describe("smoothingToHalflife (legacy map)", () => {
  it("maps smoothing 0.045 to ≈0.251 s", () => {
    expect(smoothingToHalflife(0.045)).toBeCloseTo(0.251, 2);
  });
  it("smoothing 0 maps to halflife 0", () => {
    expect(smoothingToHalflife(0)).toBe(0);
  });
});
