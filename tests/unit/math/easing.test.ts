import { describe, expect, it } from "vitest";
import { Easing } from "../../../packages/math/src/Easing";
import { ease, type EaseName } from "../../../packages/game/src/util/ease";

const EASE_NAMES = [
  "linear",
  "quadIn", "quadOut", "quadInOut",
  "cubicIn", "cubicOut", "cubicInOut",
  "quartIn", "quartOut", "quartInOut",
  "quintIn", "quintOut", "quintInOut",
  "sineIn", "sineOut", "sineInOut",
  "expoIn", "expoOut", "expoInOut",
  "circIn", "circOut", "circInOut",
  "backIn", "backOut", "backInOut",
  "elasticIn", "elasticOut", "elasticInOut",
  "bounceIn", "bounceOut", "bounceInOut"
] as const satisfies readonly EaseName[];

const OVERSHOOTING = /^(back|elastic|bounce)/;

describe("Easing §7.6 (PRD-09 1743)", () => {
  it("exposes all 31 EaseName functions on math + game util", () => {
    expect(EASE_NAMES.length).toBe(31);
    for (const name of EASE_NAMES) {
      expect(typeof Easing[name]).toBe("function");
      expect(typeof ease[name]).toBe("function");
      expect(ease[name]).toBe(Easing[name]);
    }
  });

  it("f(0)=0 and f(1)=1 (±1e-9) for all 31", () => {
    for (const name of EASE_NAMES) {
      expect(Math.abs(Easing[name](0)), `${name}(0)`).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(Easing[name](1) - 1), `${name}(1)`).toBeLessThanOrEqual(1e-9);
    }
  });

  it("monotonic non-decreasing on 101 samples (non-overshooting eases)", () => {
    for (const name of EASE_NAMES) {
      if (OVERSHOOTING.test(name)) continue;
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = Easing[name](i / 100);
        expect(v, `${name} at ${i / 100}`).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });

  it("keeps the [0,1] input assertion", () => {
    for (const name of EASE_NAMES) {
      expect(() => Easing[name](-0.1)).toThrow(RangeError);
      expect(() => Easing[name](1.1)).toThrow(RangeError);
      expect(() => Easing[name](Number.NaN)).toThrow(RangeError);
    }
  });

  it("spring: closed-form toward 1 (critical + under-damped)", () => {
    const critical = Easing.spring(120, 2 * Math.sqrt(120));
    expect(critical(0)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(critical(1) - 1)).toBeLessThan(0.05);
    const under = Easing.spring(120, 4);
    let overshot = false;
    for (let i = 1; i <= 100; i++) if (under(i / 100) > 1 + 1e-9) overshot = true;
    expect(overshot, "under-damped spring should overshoot").toBe(true);
    expect(() => Easing.spring(0, 1)).toThrow(RangeError);
    expect(() => Easing.spring(120, -1)).toThrow(RangeError);
  });
});
