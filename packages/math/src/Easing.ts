/**
 * Easing — the full Penner set keyed by PRD-09 §7.6 `EaseName` plus
 * `spring(stiffness, damping)`, a closed-form spring toward 1.
 *
 * Every function asserts its input is in [0, 1] (unchanged contract). Output
 * may overshoot for back/elastic/bounce/spring by design.
 */
export const Easing = Object.freeze({
  linear(t: number): number {
    assertUnit(t);
    return t;
  },
  easeInQuad(t: number): number {
    assertUnit(t);
    return t * t;
  },
  easeOutQuad(t: number): number {
    assertUnit(t);
    return t * (2 - t);
  },
  easeInOutCubic(t: number): number {
    assertUnit(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  // ---- §7.6 EaseName set -------------------------------------------------
  quadIn: ease((t) => t * t),
  quadOut: ease((t) => 1 - (1 - t) * (1 - t)),
  quadInOut: ease((t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)),

  cubicIn: ease((t) => t * t * t),
  cubicOut: ease((t) => 1 - Math.pow(1 - t, 3)),
  cubicInOut: ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)),

  quartIn: ease((t) => t * t * t * t),
  quartOut: ease((t) => 1 - Math.pow(1 - t, 4)),
  quartInOut: ease((t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2)),

  quintIn: ease((t) => t * t * t * t * t),
  quintOut: ease((t) => 1 - Math.pow(1 - t, 5)),
  quintInOut: ease((t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2)),

  sineIn: ease((t) => 1 - Math.cos((t * Math.PI) / 2)),
  sineOut: ease((t) => Math.sin((t * Math.PI) / 2)),
  sineInOut: ease((t) => -(Math.cos(Math.PI * t) - 1) / 2),

  expoIn: ease((t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10))),
  expoOut: ease((t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))),
  expoInOut: ease((t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
  ),

  circIn: ease((t) => 1 - Math.sqrt(1 - t * t)),
  circOut: ease((t) => Math.sqrt(1 - Math.pow(t - 1, 2))),
  circInOut: ease((t) =>
    t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2
  ),

  backIn: ease((t) => BACK_INOUT * t * t * t - BACK * t * t),
  backOut: ease((t) => 1 + BACK_INOUT * Math.pow(t - 1, 3) + BACK * Math.pow(t - 1, 2)),
  backInOut: ease((t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((BACK_INOUT2 + 1) * 2 * t - BACK_INOUT2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((BACK_INOUT2 + 1) * (2 * t - 2) + BACK_INOUT2) + 2) / 2
  ),

  elasticIn: ease((t) =>
    t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ELASTIC_C4)
  ),
  elasticOut: ease((t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1
  ),
  elasticInOut: ease((t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1
  ),

  bounceIn: ease((t) => 1 - bounceOut(1 - t)),
  bounceOut: ease(bounceOut),
  bounceInOut: ease((t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2)),

  /**
   * §7.6 `Easing.spring(stiffness, damping)` — critically/under-damped spring
   * from 0 toward 1; `t` is normalized [0,1] time. Closed-form solution of
   * `x'' = -k(x-1) - c·x'` at `x(0)=0`, `x'(0)=0`. Output may overshoot when
   * under-damped.
   */
  spring(stiffness: number, damping: number): (t: number) => number {
    if (!(stiffness > 0) || damping < 0) {
      throw new RangeError("spring requires stiffness > 0 and damping >= 0.");
    }
    const omega0 = Math.sqrt(stiffness);
    const zeta = damping / (2 * omega0);
    return ease((t) => {
      if (zeta < 1 - 1e-9) {
        const wd = omega0 * Math.sqrt(1 - zeta * zeta);
        const env = Math.exp(-zeta * omega0 * t);
        return 1 - env * (Math.cos(wd * t) + (zeta * omega0 / wd) * Math.sin(wd * t));
      }
      if (zeta > 1 + 1e-9) {
        const r1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
        const r2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
        return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
      }
      return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
    });
  }
});

function ease(fn: (t: number) => number): (t: number) => number {
  return (t: number) => {
    assertUnit(t);
    return fn(t);
  };
}

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

const BACK = 1.70158;
const BACK_INOUT = 2.70158;
const BACK_INOUT2 = BACK * 1.525;
const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;

function assertUnit(t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    throw new RangeError("Easing input must be a finite value in [0, 1].");
  }
}
