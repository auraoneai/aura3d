/**
 * GU47 WP-32 RH47-14: one display LUT per route (`../assets/luts/saltwind-<route>.cube`), authored here as a pure transform
 * so the committed files are reproducible (`writeSaltwindLuts`, unit-tested against the files). E-C binds them through
 * `colorGrade({ lut, lutIntensity })` on display-encoded values in [0, 1], after the per-route white balance
 * (temperature / tint in the look row).
 *
 * Each LUT is a split tone in the route's own colours, zero at black, mid grey and white and at most `strength` per channel:
 * Sunbreak lifts the shadows toward sea teal and the highlights toward salt white (hazy, cool water, warm haze); Redline
 * leans the shadows violet and the highlights ochre-orange (last light); Halo keeps the shadows indigo and the highlights
 * mercury-white, and leaves saturated reds alone so the beacons and gantries keep their signal red.
 */
export type LutRgb = readonly [number, number, number];
export const SALTWIND_LUT_SIZE = 17;
export const SALTWIND_LUT_INTENSITY = 0.8;

export interface SplitTone { readonly shadow: string; readonly highlight: string; readonly strength: number }

export const SALTWIND_LUTS: Readonly<Record<"sunbreak" | "redline" | "halo", SplitTone>> = {
  sunbreak: { shadow: "#12606e", highlight: "#f1e2c4", strength: 0.025 },
  redline: { shadow: "#4b3a86", highlight: "#e6a35a", strength: 0.035 },
  halo: { shadow: "#1b2a6a", highlight: "#dbe6ee", strength: 0.03 }
};

const unit = (hex: string): LutRgb => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const luma = (c: LutRgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The chroma direction of a colour (colour minus its luma), scaled so its largest channel is 1. */
function chroma(hex: string): LutRgb {
  const c = unit(hex), y = luma(c);
  const d: LutRgb = [c[0] - y, c[1] - y, c[2] - y];
  const m = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])) || 1;
  return [d[0] / m, d[1] / m, d[2] / m];
}

/** The route's transform of one display colour. */
export function saltwindGrade(tone: SplitTone, rgb: LutRgb): LutRgb {
  const y = luma(rgb);
  const sat = Math.max(...rgb) - Math.min(...rgb);
  const keep = 1 - 0.7 * clamp01((sat - 0.35) / 0.4); // saturated colours (signal red) keep their hue
  const shadowW = Math.sin(Math.PI * clamp01(y * 2)) * (y < 0.5 ? 1 : 0);
  const highW = Math.sin(Math.PI * clamp01(y * 2 - 1)) * (y > 0.5 ? 1 : 0);
  const s = chroma(tone.shadow), h = chroma(tone.highlight);
  return [0, 1, 2].map((i) => clamp01(rgb[i]! + tone.strength * keep * (s[i]! * shadowW + h[i]! * highW))) as unknown as LutRgb;
}

/** The `.cube` text (red fastest, as the format requires). */
export function saltwindCube(route: keyof typeof SALTWIND_LUTS): string {
  const n = SALTWIND_LUT_SIZE;
  const lines = [`TITLE "saltwind-${route}"`, `LUT_3D_SIZE ${n}`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const out = saltwindGrade(SALTWIND_LUTS[route], [r / (n - 1), g / (n - 1), b / (n - 1)]);
    lines.push(out.map((v) => v.toFixed(6)).join(" "));
  }
  return `${lines.join("\n")}\n`;
}
