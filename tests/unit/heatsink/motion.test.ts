/**
 * Thermal Drift HS-19 secondary motion: bob 0 and no pitch or flicker on reduced motion; the bob depends on wall time
 * only (same at 60, 120 and 144 Hz); the boost pitch settles to its target.
 */
import { describe, expect, it } from "vitest";
import { BOB, BOOST_PITCH, droneBob, holoVisible, stepBoostPitch } from "../../../apps/showcase-heatsink/src/motion";

describe("heatsink HS-19 secondary motion", () => {
  it("reduced motion: bob 0, pitch 0, holo always visible", () => {
    for (let t = 0; t < 5; t += 0.1) {
      expect(droneBob(t, true)).toBe(0);
      expect(holoVisible(t, 60, true)).toBe(true);
    }
    expect(stepBoostPitch(-0.05, true, 1 / 60, true)).toBe(0);
  });
  it("bob is a function of wall time, bounded by its amplitude, at any display rate", () => {
    for (const hz of [60, 120, 144]) {
      let peak = 0;
      for (let i = 0; i <= hz * 2; i += 1) peak = Math.max(peak, Math.abs(droneBob(i / hz, false)));
      expect(peak).toBeLessThanOrEqual(BOB.amplitude + 1e-12);
      expect(peak).toBeGreaterThan(BOB.amplitude * 0.9);
    }
    expect(droneBob(1.234, false)).toBe(droneBob(1.234, false));
  });
  it("boost pitch settles nose down while boosting and back to 0 after", () => {
    let p = 0;
    for (let i = 0; i < 120; i += 1) p = stepBoostPitch(p, true, 1 / 60, false);
    expect(p).toBeCloseTo(BOOST_PITCH.radians, 4);
    for (let i = 0; i < 120; i += 1) p = stepBoostPitch(p, false, 1 / 60, false);
    expect(Math.abs(p)).toBeLessThan(1e-4);
  });
  it("holo flickers off briefly but is on most of the time", () => {
    let off = 0;
    for (let i = 0; i < 3000; i += 1) if (!holoVisible(i / 100, 60, false)) off += 1;
    expect(off).toBeGreaterThan(0);
    expect(off / 3000).toBeLessThan(0.1);
  });
});
