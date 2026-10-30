import { describe, expect, it } from "vitest";
import { PITCH_SPRING, SIGNAL_COLORS, SIGNAL_FADE_S, createPitchSpring, signalFadeColor } from "../../../apps/showcase-teleoperator/src/carMotion";

describe("grid dispatch GD-16 pitch spring and signal fade", () => {
  it("the body overshoots a braking dip, then settles on the sim pitch", () => {
    const s = createPitchSpring();
    let peak = 0;
    for (let i = 0; i < 30; i++) peak = Math.max(peak, s.update(0.03, 1 / 60, true));
    expect(peak).toBeGreaterThan(0.03);
    expect(peak).toBeLessThanOrEqual(PITCH_SPRING.max);
    for (let i = 0; i < 120; i++) s.update(0.03, 1 / 60, true);
    expect(s.value).toBeCloseTo(0.03, 3);
  });

  it("reduced motion shows the sim pitch with no spring", () => {
    const s = createPitchSpring();
    expect(s.update(0.02, 1 / 60, false)).toBe(0.02);
    expect(s.update(-0.01, 1 / 60, false)).toBe(-0.01);
  });

  it("the spring is frame-rate independent", () => {
    const a = createPitchSpring();
    const b = createPitchSpring();
    for (let i = 0; i < 60; i++) a.update(0.03, 1 / 60, true);
    for (let i = 0; i < 30; i++) b.update(0.03, 1 / 30, true);
    expect(Math.abs(a.value - b.value)).toBeLessThan(1e-3);
  });

  it("signals fade over 120 ms", () => {
    expect(SIGNAL_FADE_S).toBe(0.12);
    expect(signalFadeColor(SIGNAL_COLORS[0], SIGNAL_COLORS[1], 0)).toBe(SIGNAL_COLORS[0]);
    expect(signalFadeColor(SIGNAL_COLORS[0], SIGNAL_COLORS[1], 0.12)).toBe(SIGNAL_COLORS[1]);
    const mid = signalFadeColor("#000000", "#ffffff", 0.06);
    expect(mid).toBe("#808080");
  });
});
