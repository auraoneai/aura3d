import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../../examples/shared/runner-kit/index";
import { HUD_PAIRS, TANK_LOW_PERCENT, coveragePercent, tankPercent, tubeFill } from "../../../apps/showcase-splat-turf/src/hud";
import { CONFIG } from "../../../apps/showcase-splat-turf/src/sim";

describe("splat turf HUD", () => {
  it("every HUD ink/paper pair clears WCAG AA 4.5:1", () => {
    for (const [fg, bg] of HUD_PAIRS) {
      expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tank bar percent and low-tank threshold", () => {
    expect(tankPercent({ tank: CONFIG.TANK_MAX })).toBe(100);
    expect(tankPercent({ tank: 0 })).toBe(0);
    expect(tankPercent({ tank: 25 })).toBe(25);
    expect(TANK_LOW_PERCENT).toBe(25);
  });

  it("live coverage percent rounds the sim fraction", () => {
    expect(coveragePercent({ coverage: 0 })).toBe(0);
    expect(coveragePercent({ coverage: 0.856 })).toBe(86);
    expect(coveragePercent({ coverage: 1 })).toBe(100);
  });

  it("combo tube fills towards the next multiplier and pins at the cap", () => {
    expect(tubeFill({ combo: 0, mult: 1 })).toBe(0);
    expect(tubeFill({ combo: 1, mult: 1 })).toBe(0.5);
    expect(tubeFill({ combo: 2, mult: 2 })).toBe(0);
    expect(tubeFill({ combo: 8, mult: CONFIG.MAX_MULT })).toBe(1);
  });
});