import { describe, expect, it } from "vitest";
import { comboTubeFill, contrastRatio } from "../../../examples/shared/runner-kit/index";
import { HUD_INK, HUD_PAPER } from "../../../apps/showcase-beat-hopper/src/hud";
import { LOOK, beatPulse } from "../../../apps/showcase-beat-hopper/src/look";
import { CONFIG } from "../../../apps/showcase-beat-hopper/src/sim";

const HUD_PAIRS: readonly (readonly [string, string])[] = [
  [HUD_INK, HUD_PAPER],
  [HUD_INK, "#1e0f42"],
  ["#cfc6ee", HUD_PAPER],
  [LOOK.perfect, HUD_PAPER],
  [LOOK.good, HUD_PAPER],
  [LOOK.miss, HUD_PAPER],
  [LOOK.player, HUD_PAPER],
  [HUD_PAPER, LOOK.bar],
  [HUD_PAPER, LOOK.gold]
];

describe("beat-hopper HUD contrast and helpers", () => {
  it("every HUD ink/paper pair clears WCAG AA 4.5:1", () => {
    for (const [fg, bg] of HUD_PAIRS) {
      expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("combo tube fills every 4 hits toward the x5 cap", () => {
    expect(comboTubeFill(0, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(2, 1, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0.5);
    expect(comboTubeFill(4, 2, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(0);
    expect(comboTubeFill(16, CONFIG.MAX_MULT, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT)).toBe(1);
  });

  it("beatPulse peaks at 1 on the beat and decays smoothly toward 0", () => {
    expect(beatPulse(0, CONFIG.BEAT)).toBeCloseTo(1, 9);
    expect(beatPulse(CONFIG.BEAT * 0.5, CONFIG.BEAT)).toBeLessThan(0.25);
    expect(beatPulse(CONFIG.BEAT * 0.99, CONFIG.BEAT)).toBeLessThan(0.01);
  });
});
