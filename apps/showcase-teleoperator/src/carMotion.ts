/**
 * GD-16 (the parts that need no rigged asset; GU47 WP-14): a pitch spring on the rendered car body and a 120 ms colour
 * fade on the signal heads. Presentation only: the spring follows the sim's read-only `pitch` and writes nothing back.
 * GU47(WP-36): the rigged passenger and the pedestrians wait for the humanoid assets.
 */

/** Underdamped body spring: the nose dips past the sim pitch under braking and settles in about 0.4 s. */
export const PITCH_SPRING = { omega: 11, zeta: 0.55, max: 0.05 } as const;

export function createPitchSpring() {
  let value = 0;
  let velocity = 0;
  return {
    /** Advances the spring towards `target` (radians). Reduced motion: no overshoot, the sim pitch as is. */
    update(target: number, dt: number, motionOk: boolean): number {
      if (!motionOk) {
        value = target;
        velocity = 0;
        return value;
      }
      // semi-implicit Euler in 1/120 s substeps (stable for any frame time)
      let left = Math.min(Math.max(dt, 0), 0.25);
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 120);
        const accel = PITCH_SPRING.omega * PITCH_SPRING.omega * (target - value) - 2 * PITCH_SPRING.zeta * PITCH_SPRING.omega * velocity;
        velocity += accel * h;
        value += velocity * h;
        left -= h;
      }
      value = Math.max(-PITCH_SPRING.max, Math.min(PITCH_SPRING.max, value));
      return value;
    },
    get value(): number {
      return value;
    },
    reset(): void {
      value = 0;
      velocity = 0;
    }
  };
}

export const SIGNAL_FADE_S = 0.12;
export const SIGNAL_COLORS = ["#43d17a", "#ffb347", "#ff4a3d"] as const;

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Signal head colour `elapsed` seconds after a change from `from` to `to` (linear over `SIGNAL_FADE_S`). */
export function signalFadeColor(from: string, to: string, elapsed: number): string {
  const t = Math.max(0, Math.min(1, elapsed / SIGNAL_FADE_S));
  const a = hex(from);
  const b = hex(to);
  return toHex(a.map((v, i) => v + (b[i]! - v) * t));
}
