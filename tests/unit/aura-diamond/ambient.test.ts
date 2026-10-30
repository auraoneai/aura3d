import { describe, expect, it } from "vitest";
import { CHEER_HOP_M, CHEER_MAX_DELAY_S, CHEER_SECONDS, cheerDelay, cheerHop, earthYaw } from "../../../apps/showcase-aura-diamond-3d/art/ambient";

describe("aura-diamond GU47 ambient motion (DIA-N1)", () => {
  it("starts every waver's cheer within 0.5 s of the home run, staggered", () => {
    const delays = Array.from({ length: 18 }, (_, i) => cheerDelay(i));
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(Math.min(0.5, CHEER_MAX_DELAY_S + 1e-9));
    }
    expect(new Set(delays.map((d) => d.toFixed(3))).size).toBe(18);
    for (let i = 0; i < 18; i++) {
      const moved = [0.05, 0.1, 0.15, 0.2, 0.25].some((dt) => cheerHop(i, cheerDelay(i) + dt) > 0);
      expect(moved).toBe(true);
    }
  });

  it("hops at most 0.28 m, never below the ground, and settles after the cheer", () => {
    for (let t = -1; t < CHEER_SECONDS + 1; t += 0.01) {
      const h = cheerHop(3, t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(CHEER_HOP_M);
    }
    expect(cheerHop(3, CHEER_SECONDS + CHEER_MAX_DELAY_S)).toBe(0);
    expect(cheerHop(3, Infinity)).toBe(0);
  });

  it("holds the crowd and the Earth still under reduced motion; the Earth turns otherwise", () => {
    for (let t = 0; t < CHEER_SECONDS; t += 0.05) expect(cheerHop(5, t, true)).toBe(0);
    expect(earthYaw(60, true)).toBe(0);
    expect(earthYaw(60)).toBeCloseTo(Math.PI / 2, 6);
    expect(earthYaw(0)).toBe(0);
  });
});
