/**
 * GU47 WP-12 AO-P1: `apex-bluehour.cube`, the display LUT of Apex Overdrive's own grade. E-C binds a `colorGrade({ lut })` in
 * the S10b display grade: after the tone map and the look grade's contrast 1.12 / saturation 1.08, before the vignette, on
 * sRGB-encoded display values in [0, 1]. The LUT is authored here as a pure transform, so the committed file
 * (`../assets/luts/apex-bluehour.cube`, written by `tools/make-apex-lut.ts`) is reproducible and unit-tested; no grading
 * tool, no third-party LUT.
 *
 * 1. Tone: a gentle per-channel S-curve (pivot 0.5, strength 0.14): black, mid grey and white stay put, the toe sinks
 *    about 1.5 codes at 5% (gameplay-early p5 <= 14) and the shoulder lifts about 3 codes at 80% (p95 >= 210).
 * 2. No magenta (identity, PRD §6.1 G02): hues within 32 deg of 315 deg lose up to 40% of their chroma (toward their luma,
 *    so they do not brighten) and turn up to 14 deg toward violet. Rival red (355 deg), tail red (5 deg), tangerine
 *    (24 deg), cyan (185 deg), cobalt (226 deg) and the dome's violet (258 deg) are outside the band.
 * 3. Split tone in the identity palette: deep shadows lean cobalt #1f3fa8, highlights lean tangerine #ff8a3d, at most
 *    0.022 per channel, zero at black and at mid grey, and scaled down on saturated colours so the cyan player, the red
 *    rivals and the sodium lamps keep their hue.
 */
import { APEX_PALETTE, hexToUnit } from "./look";

export type LutRgb = readonly [number, number, number];

export const APEX_LUT_TITLE = "apex-bluehour";
/** 17 lattice points per axis (4,913 rows, about 100 KB of text): the transform is smooth, trilinear sampling does the rest. */
export const APEX_LUT_SIZE = 17;
/** Applied fully on every time of day; the per-row white balance stays in the HDR grade (temperature/tint). */
export const APEX_LUT_INTENSITY = 1;
/** Per-channel S-curve strength (0 = identity). */
export const APEX_LUT_CURVE = 0.14;
/** The no-magenta band. */
export const APEX_LUT_MAGENTA = { centerDeg: 315, halfWidthDeg: 32, chromaCut: 0.4, turnDeg: -14 } as const;
/** Split-tone strength (display units, largest channel) and its saturated-colour falloff. */
export const APEX_LUT_SPLIT = { shadow: 0.022, highlight: 0.022, saturationFalloff: 0.6 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const luma = (c: LutRgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The chroma direction of a palette colour (colour minus its luma), scaled so its largest channel is `amount`. */
function tintOf(hex: string, amount: number): LutRgb {
  const c = hexToUnit(hex);
  const l = luma(c);
  const d: [number, number, number] = [c[0] - l, c[1] - l, c[2] - l];
  const m = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])) || 1;
  return [(d[0] / m) * amount, (d[1] / m) * amount, (d[2] / m) * amount];
}

const SHADOW_TINT = tintOf(APEX_PALETTE.cobalt, APEX_LUT_SPLIT.shadow);
const HIGHLIGHT_TINT = tintOf(APEX_PALETTE.tangerine, APEX_LUT_SPLIT.highlight);

/** The S-curve: f(0) = 0, f(0.5) = 0.5, f(1) = 1, monotonic for strengths below 1. */
export function apexToneCurve(x: number, strength = APEX_LUT_CURVE): number {
  const v = clamp01(x);
  return clamp01(v + strength * v * (1 - v) * (2 * v - 1));
}

/** RGB in [0, 1] to HSV (hue in degrees [0, 360), saturation and value in [0, 1]). */
export function rgbToHsv(c: LutRgb): [number, number, number] {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  const delta = max - min;
  let h = 0;
  if (delta > 1e-9) {
    if (max === c[0]) h = 60 * (((c[1] - c[2]) / delta) % 6);
    else if (max === c[1]) h = 60 * ((c[2] - c[0]) / delta + 2);
    else h = 60 * ((c[0] - c[1]) / delta + 4);
  }
  if (h < 0) h += 360;
  return [h, max > 0 ? delta / max : 0, max];
}

/** Weight of a hue inside the no-magenta band: 1 at its centre, falling as cos^2 to 0 at the half width. */
export function magentaWeight(hueDeg: number): number {
  const d = Math.abs(((((hueDeg - APEX_LUT_MAGENTA.centerDeg) % 360) + 540) % 360) - 180);
  if (d >= APEX_LUT_MAGENTA.halfWidthDeg) return 0;
  const k = Math.cos((Math.PI / 2) * (d / APEX_LUT_MAGENTA.halfWidthDeg));
  return k * k;
}

/**
 * Turn a colour's hue by `deg` (rotation about the grey axis, so +deg goes red -> green -> blue like HSV hue) and scale its
 * chroma toward its luma by `chroma`, so a muted colour keeps about the brightness a capture measures (an HSV saturation
 * cut at constant value would brighten it instead).
 */
export function turnAndScaleChroma(c: LutRgb, deg: number, chroma: number): [number, number, number] {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const k = 1 / Math.sqrt(3);
  const dot = k * (c[0] + c[1] + c[2]);
  const cross: LutRgb = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  const rot: LutRgb = [
    c[0] * cos + cross[0] * sin + k * dot * (1 - cos),
    c[1] * cos + cross[1] * sin + k * dot * (1 - cos),
    c[2] * cos + cross[2] * sin + k * dot * (1 - cos)
  ];
  const l = luma(c);
  return [l + (rot[0] - l) * chroma, l + (rot[1] - l) * chroma, l + (rot[2] - l) * chroma];
}

/** The grade one display colour gets (the LUT is this function sampled on the lattice). */
export function apexBluehourGrade(input: LutRgb): [number, number, number] {
  // 1. tone
  let c: [number, number, number] = [apexToneCurve(input[0]), apexToneCurve(input[1]), apexToneCurve(input[2])];
  // 2. no magenta: turn toward violet and mute, at constant luma
  const [h, s] = rgbToHsv(c);
  const wm = s > 0 ? magentaWeight(h) : 0;
  if (wm > 0) c = turnAndScaleChroma(c, APEX_LUT_MAGENTA.turnDeg * wm, 1 - APEX_LUT_MAGENTA.chromaCut * wm);
  // 3. split tone, strongest on near-neutrals
  const l = luma(c);
  const sat = rgbToHsv(c)[1];
  const falloff = 1 - APEX_LUT_SPLIT.saturationFalloff * sat;
  const ws = smoothstep(0, 0.12, l) * (1 - smoothstep(0.12, 0.5, l)) * falloff;
  const wh = smoothstep(0.5, 0.95, l) * falloff;
  return [
    clamp01(c[0] + ws * SHADOW_TINT[0] + wh * HIGHLIGHT_TINT[0]),
    clamp01(c[1] + ws * SHADOW_TINT[1] + wh * HIGHLIGHT_TINT[1]),
    clamp01(c[2] + ws * SHADOW_TINT[2] + wh * HIGHLIGHT_TINT[2])
  ];
}

/** The `.cube` text (Adobe/Resolve 1.0: red fastest, domain [0, 1], four decimals). */
export function apexBluehourCube(size = APEX_LUT_SIZE): string {
  const lines = [
    "# Apex Overdrive \"apex-bluehour\" display LUT (GU47 WP-12 AO-P1), red-fastest, display domain (sRGB-encoded).",
    "# Generated by apps/showcase-roadster-rush/tools/make-apex-lut.ts from src/art/lut.ts (apexBluehourGrade):",
    "# S-curve 0.14, no-magenta band 315 +- 32 deg, cobalt shadows / tangerine highlights split tone. Original work, no source LUT.",
    `TITLE "${APEX_LUT_TITLE}"`,
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0 0 0",
    "DOMAIN_MAX 1 1 1"
  ];
  const n = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = apexBluehourGrade([r / n, g / n, b / n]);
        lines.push(`${out[0].toFixed(4)} ${out[1].toFixed(4)} ${out[2].toFixed(4)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The runtime patch for the look's one grade node (E-C `app.post.setEffect("colorGrade", ...)`): the time-of-day white
 * balance plus the LUT, so the grade stays a single `color-grade` stage.
 */
export function apexGradePatch(
  frame: { readonly grade: { readonly temperature: number; readonly tint: number } },
  lutUrl: string | null
): Record<string, number | string> {
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  return {
    temperature: round3(frame.grade.temperature),
    tint: round3(frame.grade.tint),
    ...(lutUrl ? { lut: lutUrl, lutIntensity: APEX_LUT_INTENSITY } : {})
  };
}
