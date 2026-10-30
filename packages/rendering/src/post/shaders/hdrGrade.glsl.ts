/**
 * GU47 E-C (WP-3) — the linear-HDR grade writer (PRD-03 §6.7 S10 linear grade).
 *
 * `composite.glsl.ts` declared `u_whiteBalance`, `u_lift`, `u_gamma`, `u_gain`,
 * `u_shadows`, `u_midtones` and `u_highlights`, but no program ran it and no
 * code set the uniforms, so `effects.colorGrade({ temperature, tint, lift,
 * gamma, gain, shadows, midtones, highlights })` never reached a pixel. This
 * module is the one fullscreen draw that applies them on the v2 chain:
 *
 *   c  = texture(u_hdr) [· exp2(ev) when S8 auto-exposure is active — the grade
 *        folds into the S8 multiply draw, so AE + grade is still one draw]
 *   c *= u_whiteBalance                    (CAT02/LMS balance folded to RGB on CPU)
 *   c  = pow(max(c · gain + lift, 0), 1 / gamma)          (ASC-CDL style)
 *   c *= shadows·(1−s)² + midtones·2s(1−s) + highlights·s²,
 *        s = saturate(log2(luma / 0.18) / 8 + 0.5)
 *
 * The same math as `COMPOSITE_GLSL`'s grade block. Alpha passes through (the
 * §6.3 indirect-fraction / post material tag lives there). An identity grade
 * resolves to `null` so the stage driver skips the draw and scenes that do not
 * author a grade stay byte-identical.
 */

export const HDR_GRADE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_ev;           // 1×1 EV target (S8); bound to a blank texel when u_hasEv == 0
uniform int u_hasEv;
uniform int u_hasGrade;
uniform vec3 u_whiteBalance;      // CAT02-cone LMS balance, resolved per temperature/tint on CPU
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
in vec2 v_uv;
out vec4 outColor;

float gradeLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture(u_hdr, v_uv);
  vec3 c = src.rgb;
  if (u_hasEv != 0) {
    c *= exp2(texelFetch(u_ev, ivec2(0), 0).r);
  }
  if (u_hasGrade != 0) {
    c *= u_whiteBalance;
    vec3 safeGamma = max(u_gamma, vec3(1e-3));
    c = pow(max(c * u_gain + u_lift, vec3(0.0)), vec3(1.0) / safeGamma);
    float s = clamp(log2(max(gradeLuma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
    c *= u_shadows * (1.0 - s) * (1.0 - s)
       + u_midtones * 2.0 * s * (1.0 - s)
       + u_highlights * s * s;
  }
  outColor = vec4(c, src.a);
}
`;

export type Rgb3 = readonly [number, number, number];

/** Uniform values for `HDR_GRADE_GLSL` (all linear, per channel). */
export interface HdrGradeUniforms {
  readonly whiteBalance: Rgb3;
  readonly lift: Rgb3;
  readonly gamma: Rgb3;
  readonly gain: Rgb3;
  readonly shadows: Rgb3;
  readonly midtones: Rgb3;
  readonly highlights: Rgb3;
}

/** The grade fields the v2 bridge emits (`ColorGradeOptionsV2`, `postBridge.ts`). */
export interface HdrGradeInput {
  readonly temperature?: number;
  readonly tint?: number;
  readonly lift?: unknown;
  readonly gamma?: unknown;
  readonly gain?: unknown;
  readonly shadows?: unknown;
  readonly midtones?: unknown;
  readonly highlights?: unknown;
  /** GU47 E-C runtime control: `app.post.setEffectEnabled("colorGrade", false)` keeps the bag with `enabled: false`. */
  readonly enabled?: boolean;
}

// Linear sRGB (Rec.709 primaries) <-> CAT02 LMS, row-major (lms = M · rgb).
const LINEAR_TO_LMS = [
  3.90405e-1, 5.49941e-1, 8.92632e-3,
  7.08416e-2, 9.63172e-1, 1.35775e-3,
  2.31082e-2, 1.28021e-1, 9.36245e-1
] as const;
const LMS_TO_LINEAR = [
  2.85847, -1.62879, -2.4891e-2,
  -2.10182e-1, 1.1582, 3.24281e-4,
  -4.1812e-2, -1.18169e-1, 1.06867
] as const;
/** D65 white in LMS. */
const D65_LMS: Rgb3 = [0.949237, 1.03542, 1.08728];

function mul3(m: readonly number[], v: Rgb3): [number, number, number] {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]
  ];
}

function cieXyToLms(x: number, y: number): [number, number, number] {
  const Y = 1;
  const X = (Y * x) / y;
  const Z = (Y * (1 - x - y)) / y;
  return [
    0.7328 * X + 0.4296 * Y - 0.1624 * Z,
    -0.7036 * X + 1.6975 * Y + 0.0061 * Z,
    0.003 * X + 0.0136 * Y + 0.9834 * Z
  ];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * White-balance gain for `temperature`/`tint` in [-1, 1] (0 = neutral;
 * +temperature warms, +tint pushes magenta). The reference white moves along
 * the CIE daylight locus (x shift, y = standard illuminant curve + tint), the
 * von Kries balance is taken in CAT02 LMS, and the result is folded into one
 * RGB multiplier (exact for greys) normalised to unit Rec.709 luminance so a
 * temperature change shifts hue, not exposure. The scale matches the common
 * ±100 UI convention divided by 100 (temperature 0.2 ≈ "+20").
 */
export function resolveWhiteBalance(temperature: number, tint: number): Rgb3 {
  const t = clamp(Number.isFinite(temperature) ? temperature : 0, -1, 1);
  const g = clamp(Number.isFinite(tint) ? tint : 0, -1, 1);
  if (t === 0 && g === 0) return [1, 1, 1];
  const t1 = (t * 100) / 65;
  const t2 = (g * 100) / 65;
  const x = 0.31271 - t1 * (t1 < 0 ? 0.1 : 0.05);
  const y = 2.87 * x - 3 * x * x - 0.27509507 + t2 * 0.05;
  const w2 = cieXyToLms(x, y);
  const balance: Rgb3 = [D65_LMS[0] / w2[0], D65_LMS[1] / w2[1], D65_LMS[2] / w2[2]];
  const whiteLms = mul3(LINEAR_TO_LMS, [1, 1, 1]);
  const rgb = mul3(LMS_TO_LINEAR, [whiteLms[0] * balance[0], whiteLms[1] * balance[1], whiteLms[2] * balance[2]]);
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const norm = luma > 1e-6 ? 1 / luma : 1;
  return [Math.max(0, rgb[0] * norm), Math.max(0, rgb[1] * norm), Math.max(0, rgb[2] * norm)];
}

/** `{r,g,b}`, `[r,g,b]` or a scalar (applied to all channels); anything else → fallback. */
export function gradeRgb(value: unknown, fallback: Rgb3): Rgb3 {
  const finite = (v: unknown, f: number): number => (typeof v === "number" && Number.isFinite(v) ? v : f);
  if (typeof value === "number" && Number.isFinite(value)) return [value, value, value];
  if (Array.isArray(value) && value.length >= 3) return [finite(value[0], fallback[0]), finite(value[1], fallback[1]), finite(value[2], fallback[2])];
  if (value && typeof value === "object" && "r" in value) {
    const c = value as { r?: unknown; g?: unknown; b?: unknown };
    return [finite(c.r, fallback[0]), finite(c.g, fallback[1]), finite(c.b, fallback[2])];
  }
  return fallback;
}

const ONE: Rgb3 = [1, 1, 1];
const ZERO: Rgb3 = [0, 0, 0];
const same = (a: Rgb3, b: Rgb3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Uniforms for a grade bag, or `null` when the grade is the identity (or
 * disabled) — the stage driver then skips the draw entirely.
 */
export function resolveHdrGradeUniforms(grade: HdrGradeInput | null | undefined): HdrGradeUniforms | null {
  if (!grade || typeof grade !== "object" || grade.enabled === false) return null;
  const uniforms: HdrGradeUniforms = {
    whiteBalance: resolveWhiteBalance(grade.temperature ?? 0, grade.tint ?? 0),
    lift: gradeRgb(grade.lift, ZERO),
    gamma: gradeRgb(grade.gamma, ONE).map((v) => Math.max(1e-3, v)) as unknown as Rgb3,
    gain: gradeRgb(grade.gain, ONE).map((v) => Math.max(0, v)) as unknown as Rgb3,
    shadows: gradeRgb(grade.shadows, ONE).map((v) => Math.max(0, v)) as unknown as Rgb3,
    midtones: gradeRgb(grade.midtones, ONE).map((v) => Math.max(0, v)) as unknown as Rgb3,
    highlights: gradeRgb(grade.highlights, ONE).map((v) => Math.max(0, v)) as unknown as Rgb3
  };
  const identity = same(uniforms.whiteBalance, ONE) && same(uniforms.lift, ZERO) && same(uniforms.gamma, ONE)
    && same(uniforms.gain, ONE) && same(uniforms.shadows, ONE) && same(uniforms.midtones, ONE) && same(uniforms.highlights, ONE);
  return identity ? null : uniforms;
}

/** CPU mirror of the `u_hasGrade` block (unit tests and receipts' expected values). */
export function applyHdrGrade(rgb: Rgb3, u: HdrGradeUniforms): Rgb3 {
  let c: [number, number, number] = [rgb[0] * u.whiteBalance[0], rgb[1] * u.whiteBalance[1], rgb[2] * u.whiteBalance[2]];
  c = c.map((v, i) => Math.pow(Math.max(v * u.gain[i]! + u.lift[i]!, 0), 1 / Math.max(u.gamma[i]!, 1e-3))) as [number, number, number];
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const s = clamp(Math.log2(Math.max(luma, 1e-6) / 0.18) / 8 + 0.5, 0, 1);
  return c.map((v, i) => v * (u.shadows[i]! * (1 - s) * (1 - s) + u.midtones[i]! * 2 * s * (1 - s) + u.highlights[i]! * s * s)) as unknown as Rgb3;
}
