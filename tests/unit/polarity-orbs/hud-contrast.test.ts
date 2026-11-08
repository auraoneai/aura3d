import { describe, expect, it } from "vitest";
import { comboTubeFill, contrastRatio } from "../../../examples/shared/runner-kit/index";
import { HUD_CONTRAST_PAIRS, LOOK } from "../../../apps/showcase-polarity-orbs/src/look";
import { CONFIG } from "../../../apps/showcase-polarity-orbs/src/sim";

describe("polarity orbs HUD contrast and meters", () => {
  it("every HUD ink/paper pair clears WCAG AA 4.5:1", () => {
    expect(contrastRatio(LOOK.ink, LOOK.paper)).toBeGreaterThanOrEqual(4.5);
    expect(HUD_CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(8);
    for (const pair of HUD_CONTRAST_PAIRS) {
      expect(contrastRatio(pair.ink, pair.paper), `${pair.name} (${pair.ink} on ${pair.paper})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("combo tube fills towards the next multiplier and pins at the cap", () => {
    expect(comboTubeFill(0, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(1, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBeCloseTo(1 / 3, 9);
    expect(comboTubeFill(3, 2, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(12, CONFIG.MAX_MULT, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(1);
  });
});
