// Height -> color ramp used by every bar so that color always corresponds to
// the bar's current height. A perceptually ordered cool -> warm gradient: low
// values read blue/teal, high values read yellow/orange/red.

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Stop {
  readonly t: number;
  readonly rgb: RGB;
}

const STOPS: readonly Stop[] = [
  { t: 0.0, rgb: { r: 0.18, g: 0.32, b: 0.96 } }, // deep blue
  { t: 0.22, rgb: { r: 0.12, g: 0.66, b: 0.95 } }, // cyan
  { t: 0.45, rgb: { r: 0.13, g: 0.79, b: 0.5 } }, // green
  { t: 0.65, rgb: { r: 0.95, g: 0.82, b: 0.25 } }, // yellow
  { t: 0.82, rgb: { r: 1.0, g: 0.55, b: 0.17 } }, // orange
  { t: 1.0, rgb: { r: 0.98, g: 0.23, b: 0.23 } }, // red
];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Map a normalized height in [0, 1] to a linear-RGB color on the ramp. */
export function heightToColor(value: number): RGB {
  const t = clamp01(value);
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const k = (t - a.t) / span;
      return {
        r: a.rgb.r + (b.rgb.r - a.rgb.r) * k,
        g: a.rgb.g + (b.rgb.g - a.rgb.g) * k,
        b: a.rgb.b + (b.rgb.b - a.rgb.b) * k,
      };
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

const toHex = (channel: number): string =>
  Math.round(clamp01(channel) * 255)
    .toString(16)
    .padStart(2, "0");

/** Map a normalized height in [0, 1] to a `#rrggbb` string. */
export function heightToHex(value: number): `#${string}` {
  const { r, g, b } = heightToColor(value);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** CSS gradient string for the on-screen legend, sampled from the same ramp. */
export function legendGradientCss(): string {
  const samples = STOPS.map((stop) => `${heightToHex(stop.t)} ${Math.round(stop.t * 100)}%`);
  return `linear-gradient(90deg, ${samples.join(", ")})`;
}
