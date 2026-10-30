import { describe, expect, it } from "vitest";
import { LEAN_GAIN, REDUCED_MOTION_SCALE, RiderMotion, TRAM_BOB, tramBob } from "../../../examples/last-train-port/riderMotion";

describe("rider lean and tram bob (GU47 WP-31 LT-15)", () => {
  it("lean reaches 63% of a roll step within 0.15-0.35 s", () => {
    const m = new RiderMotion();
    const roll = 0.15, target = -roll * LEAN_GAIN;
    let t = 0;
    while (Math.abs(m.lean) < 0.632 * Math.abs(target) && t < 2) { m.step(roll, 1 / 60); t += 1 / 60; }
    expect(t).toBeGreaterThanOrEqual(0.15);
    expect(t).toBeLessThanOrEqual(0.35);
  });

  it("sways further past a roll of 0.22", () => {
    const a = new RiderMotion(), b = new RiderMotion();
    for (let i = 0; i < 300; i++) { a.step(0.2, 1 / 60); b.step(0.3, 1 / 60); }
    expect(Math.abs(b.lean) / 0.3).toBeGreaterThan(Math.abs(a.lean) / 0.2);
  });

  it("reduced motion holds the lean and bob at <= 30%", () => {
    const m = new RiderMotion();
    let full = 0, reduced = 0;
    for (let i = 0; i < 300; i++) { reduced = m.step(0.3, 1 / 60, true); full = m.lean; }
    expect(Math.abs(reduced)).toBeLessThanOrEqual(Math.abs(full) * REDUCED_MOTION_SCALE + 1e-12);
    for (let s = 0; s < 3; s += 0.07) {
      expect(Math.abs(tramBob(s, 12))).toBeLessThanOrEqual(TRAM_BOB + 1e-12);
      expect(Math.abs(tramBob(s, 12, true))).toBeLessThanOrEqual(TRAM_BOB * REDUCED_MOTION_SCALE + 1e-12);
    }
    expect(Math.abs(tramBob(1.3, 0))).toBe(0);
  });
});
