import { describe, expect, it } from "vitest";
import { comboTubeFill, contrastRatio } from "../../../examples/shared/runner-kit/index";
import { HUD_INK, HUD_PAIRS, HUD_PAPER } from "../../../apps/showcase-shape-shift-sprint/src/hud";
import { CONFIG } from "../../../apps/showcase-shape-shift-sprint/src/sim";

describe("shape shift sprint HUD contrast and meters", () => {
  it("every HUD ink/paper pair clears WCAG AA 4.5:1", () => {
    expect(contrastRatio(HUD_INK, HUD_PAPER)).toBeGreaterThanOrEqual(4.5);
    for (const [fg, bg] of HUD_PAIRS) {
      expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("combo tube fills towards the next multiplier and pins at the cap", () => {
    expect(comboTubeFill(0, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(1, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBeCloseTo(1 / 3, 9);
    expect(comboTubeFill(3, 2, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(12, CONFIG.MAX_MULT, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(1);
  });
});
