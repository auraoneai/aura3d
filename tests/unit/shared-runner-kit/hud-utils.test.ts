import { describe, expect, it } from "vitest";
import { comboTubeFill, contrastRatio, letterbox, luminance } from "../../../examples/shared/runner-kit/hud-utils";

describe("runner-kit hud-utils contrast", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("identical colours are 1:1", () => {
    expect(contrastRatio("#3b1f3f", "#3b1f3f")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#3b1f3f", "#fdf0e0")).toBeCloseTo(contrastRatio("#fdf0e0", "#3b1f3f"), 9);
  });

  it("plum ink on cream paper clears 4.5:1", () => {
    expect(contrastRatio("#3b1f3f", "#fdf0e0")).toBeGreaterThanOrEqual(4.5);
  });

  it("luminance endpoints", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("runner-kit letterbox", () => {
  it("is off when disabled or away from the splash", () => {
    expect(letterbox("splash", 0, 3, false)).toBe(0);
    expect(letterbox("playing", 0, 3, true)).toBe(0);
  });

  it("holds full bars until the rail time, then slides out over 0.5 s", () => {
    expect(letterbox("splash", 1, 3, true)).toBe(1);
    expect(letterbox("splash", 3, 3, true)).toBe(1);
    const mid = letterbox("splash", 3.25, 3, true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(letterbox("splash", 3.5, 3, true)).toBe(0);
    expect(letterbox("splash", 9, 3, true)).toBe(0);
  });
});

describe("runner-kit comboTubeFill", () => {
  it("is empty at zero combo and full at the multiplier cap", () => {
    expect(comboTubeFill(0, 1, 5, 3)).toBe(0);
    expect(comboTubeFill(12, 5, 5, 3)).toBe(1);
  });

  it("fills proportionally within the current multiplier step", () => {
    expect(comboTubeFill(1, 1, 5, 3)).toBeCloseTo(1 / 3, 9);
    expect(comboTubeFill(2, 1, 5, 3)).toBeCloseTo(2 / 3, 9);
    expect(comboTubeFill(3, 2, 5, 3)).toBe(0);
    expect(comboTubeFill(5, 2, 5, 3)).toBeCloseTo(2 / 3, 9);
  });
});