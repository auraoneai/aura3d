import { describe, expect, it } from "vitest";
import { bloomNormalization } from "../../../../packages/rendering/src/postprocess/NativeBloomPyramid";

/**
 * PRD-03 §6.6 — the additive tent-pyramid normalization. (Kept out of
 * `tests/unit/rendering/native-bloom-pyramid.test.ts`, a lane-15 file.)
 */

describe("bloomNormalization (§6.6 — additive energy-conserving pyramid)", () => {
  it("constant luminance E above threshold composes to E ±2% at any mip count", () => {
    // The additive tent sum of N equal mips is N·E; normalization = 1/N.
    for (const mips of [3, 5, 6]) {
      const gain = bloomNormalization(mips, 0.7);
      const composed = gain * mips * 1.0; // pyramid of constant E=1
      expect(Math.abs(composed - 1.0)).toBeLessThan(0.02);
    }
  });

  it("scatter does not change the constant-signal response", () => {
    expect(bloomNormalization(5, 0)).toBe(bloomNormalization(5, 1));
  });

  it("rejects invalid mips/scatter", () => {
    expect(() => bloomNormalization(0, 0.5)).toThrow();
    expect(() => bloomNormalization(2.5, 0.5)).toThrow();
    expect(() => bloomNormalization(5, -0.1)).toThrow();
    expect(() => bloomNormalization(5, 1.1)).toThrow();
  });
});
