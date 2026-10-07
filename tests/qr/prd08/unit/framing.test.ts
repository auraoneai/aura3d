/**
 * R-10 framing solver (PRD-08).
 */
import { describe, expect, it } from "vitest";
import {
  distanceForFraction,
  distanceForFractionInContext,
  effectiveAxisFov,
  fractionForDistance,
  fractionForDistanceInContext
} from "@aura3d/engine/lanes";

describe("distanceForFraction / fractionForDistance", () => {
  it("round-trips within 1e-9", () => {
    for (const [h, fov, p] of [
      [2, 50, 0.125],
      [0.5, 35, 0.3],
      [4, 70, 0.9]
    ] as const) {
      const d = distanceForFraction(h, fov, p);
      expect(fractionForDistance(d, h, fov)).toBeCloseTo(p, 9);
    }
  });

  it("matches the closed form h / (2·tan(fov/2)·p)", () => {
    const d = distanceForFraction(1.7, 50, 0.125);
    expect(d).toBeCloseTo(1.7 / (2 * Math.tan((50 * Math.PI) / 360) * 0.125), 9);
  });
});

describe("portrait aspect (390×844)", () => {
  const aspect = 390 / 844;

  it("solves on the narrower horizontal axis", () => {
    const effective = effectiveAxisFov(50, aspect);
    expect(effective).toBeLessThan(50);
    const d = distanceForFractionInContext(1.7, 50, 0.125, { aspect });
    expect(fractionForDistanceInContext(d, 1.7, 50, { aspect })).toBeCloseTo(0.125, 9);
    // Portrait needs a longer distance than landscape to keep the fraction.
    expect(d).toBeGreaterThan(distanceForFraction(1.7, 50, 0.125));
  });

  it("landscape aspects keep the vertical fov", () => {
    expect(effectiveAxisFov(50, 16 / 9)).toBe(50);
  });
});
