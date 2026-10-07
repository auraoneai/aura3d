/**
 * Y-1 seeded 1D gradient noise (PRD-08 §6.5).
 */
import { describe, expect, it } from "vitest";
import { perlin1 } from "@aura3d/engine/lanes";

describe("perlin1", () => {
  it("is deterministic per seed", () => {
    for (const x of [0, 0.37, 3.9, 42.42]) {
      expect(perlin1(x, 7)).toBe(perlin1(x, 7));
    }
  });

  it("differs between seeds", () => {
    let differs = 0;
    for (let i = 0; i < 32; i += 1) {
      if (perlin1(i * 0.71, 1) !== perlin1(i * 0.71, 2)) differs += 1;
    }
    expect(differs).toBeGreaterThan(8);
  });

  it("is continuous: |Δ| < 0.1 for Δx = 0.01", () => {
    for (let x = 0; x < 20; x += 0.01) {
      expect(Math.abs(perlin1(x + 0.01, 3) - perlin1(x, 3))).toBeLessThan(0.1);
    }
  });

  it("reaches ≥ 0.9 amplitude over x ∈ [0, 100]", () => {
    let max = 0;
    for (let x = 0; x <= 100; x += 0.002) {
      max = Math.max(max, Math.abs(perlin1(x, 5)));
    }
    expect(max).toBeGreaterThanOrEqual(0.9);
  });

  it("stays within [-1, 1]", () => {
    for (let x = -50; x < 50; x += 0.013) {
      const v = perlin1(x, 11);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
