// PRD-07 P3-T1 — gradient sky evaluator (zenith/horizon/ground + sun halo).
import { dot3, normalize3, smoothstep, sunDirection, type Vec3, type AuraSkySunSpecLike } from "./PreethamSky";

/** Ordered additive emission band (aurora, city glow) on a gradient sky. */
export interface AuraSkyBand {
  readonly elevationDeg: number;
  readonly widthDeg: number;
  readonly color: string | readonly number[];
  readonly intensity: number;
}

/** Band count carried to the shader — u_bandParams/u_bandColors are [4]. */
export const SKY_BAND_CAPACITY = 4;

/** 5.7.0 stylised profile capacities (shader uniform array lengths). */
export const SKY_GRADIENT_MID_CAPACITY = 6;
export const SKY_GRADIENT_GLOW_CAPACITY = 3;

type ColorLike = string | Vec3 | readonly number[];

/** Stylised sun fields (`sun` on a stylised gradient). */
export interface StylizedSunSpecLike extends AuraSkySunSpecLike {
  readonly color?: ColorLike;
  readonly glow?: readonly { readonly exponent: number; readonly intensity: number }[];
  readonly discIntensity?: number;
  readonly discSoftness?: number;
  readonly discBlend?: "add" | "replace";
}

export interface GradientSpec {
  readonly model: "gradient";
  readonly zenith: ColorLike;
  readonly horizon: ColorLike;
  readonly ground?: ColorLike;
  readonly exponent?: number;
  readonly horizonGlow?: number;
  readonly sun?: StylizedSunSpecLike;
  readonly bands?: readonly AuraSkyBand[];
  readonly intensity?: number;
  /** 5.7.0: "stylized" selects the stylised profile (the engine builder sets it); absent or "classic" is the pre-5.7 sky. */
  readonly style?: "classic" | "stylized";
  readonly mid?: { readonly color: ColorLike; readonly blend?: readonly [number, number] } | readonly { readonly color: ColorLike; readonly blend?: readonly [number, number] }[];
  readonly zenithBlend?: readonly [number, number];
  readonly groundBlend?: readonly [number, number];
  readonly horizonHeight?: number;
  readonly horizonSharpness?: number;
  readonly haze?: { readonly color?: ColorLike; readonly intensity: number; readonly falloff?: number };
  readonly dither?: boolean;
}

/**
 * 5.7.0 stylised gradient profile, resolved. Colours are linear RGB (hex decoded with the exact sRGB curve);
 * blend ranges are `[start, end]` in `u = (dir.y - horizonHeight) * horizonSharpness`.
 */
export interface StylizedGradientFrame {
  readonly horizonHeight: number;
  readonly horizonSharpness: number;
  readonly groundBlend: readonly [number, number];
  readonly mid: readonly { readonly color: Vec3; readonly blend: readonly [number, number] }[];
  readonly zenithBlend: readonly [number, number];
  readonly haze: { readonly color: Vec3; readonly intensity: number; readonly falloff: number };
  /** Sun colour × intensity (linear); null without a sun. */
  readonly sunColor: Vec3 | null;
  readonly glow: readonly { readonly exponent: number; readonly intensity: number }[];
  /** Disc edge as cosines of the angle to the sun: `smoothstep(discCosOuter, discCosInner, cos)`. */
  readonly discCosOuter: number;
  readonly discCosInner: number;
  readonly discIntensity: number;
  readonly discBlend: "add" | "replace";
  readonly dither: boolean;
}

export interface GradientFrame {
  readonly zenith: Vec3;
  readonly horizon: Vec3;
  readonly ground: Vec3;
  readonly exponent: number;
  readonly horizonGlow: number;
  readonly sunDirection: Vec3 | null;
  readonly bands: readonly { readonly elevationDeg: number; readonly widthDeg: number; readonly color: Vec3; readonly intensity: number }[];
  readonly intensity: number;
  /** 5.7.0: the stylised profile; absent on the classic profile. */
  readonly stylized?: StylizedGradientFrame;
}

/** True when a gradient spec selects the 5.7.0 stylised profile. */
export function isStylizedGradientSpec(spec: GradientSpec): boolean {
  return spec.style === "stylized";
}

export function gradientFrame(spec: GradientSpec): GradientFrame {
  const bands = (spec.bands ?? []).slice(0, SKY_BAND_CAPACITY).map((b) => ({
    elevationDeg: b.elevationDeg,
    widthDeg: Math.max(0.5, b.widthDeg),
    color: bandColor(b.color),
    intensity: Math.max(0, b.intensity)
  }));
  if (isStylizedGradientSpec(spec)) {
    const horizon = toLinearExact(spec.horizon, [0.55, 0.65, 0.8]);
    return {
      zenith: toLinearExact(spec.zenith, [0.08, 0.16, 0.38]),
      horizon,
      ground: toLinearExact(spec.ground, horizon),
      exponent: 1.6,
      horizonGlow: 0,
      sunDirection: spec.sun ? sunDirection(spec.sun) : null,
      bands,
      intensity: finiteOr(spec.intensity, 1),
      stylized: stylizedFrame(spec, horizon)
    };
  }
  return {
    zenith: toVec3(spec.zenith, [0.08, 0.16, 0.38]),
    horizon: toVec3(spec.horizon, [0.55, 0.65, 0.8]),
    ground: toVec3(spec.ground, [0.12, 0.12, 0.13]),
    exponent: spec.exponent ?? 1.6,
    horizonGlow: spec.horizonGlow ?? 0.35,
    sunDirection: spec.sun ? sunDirection(spec.sun) : null,
    bands,
    intensity: spec.intensity ?? 1
  };
}

const DEFAULT_GLOW = [{ exponent: 8, intensity: 0.25 }, { exponent: 64, intensity: 0.45 }] as const;
/** Default stylised disc: 1.2 degrees across (0.6 degree radius). */
const DEFAULT_DISC_SIZE = (1.2 * Math.PI) / 180;

function stylizedFrame(spec: GradientSpec, horizon: Vec3): StylizedGradientFrame {
  const mids = spec.mid === undefined ? [] : Array.isArray(spec.mid) ? spec.mid : [spec.mid as { readonly color: ColorLike; readonly blend?: readonly [number, number] }];
  const sun = spec.sun;
  const discSize = sun?.discSize !== undefined && Number.isFinite(sun.discSize) ? Math.max(0, sun.discSize) : DEFAULT_DISC_SIZE;
  const radius = discSize / 2;
  const softness = Math.min(1, Math.max(0, finiteOr(sun?.discSoftness, 0.25)));
  const discCosOuter = Math.cos(radius);
  // Keep the edges ordered (smoothstep is undefined for equal edges on both backends).
  const discCosInner = Math.max(Math.cos(radius * (1 - softness)), discCosOuter + 1e-7);
  const sunIntensity = Math.max(0, finiteOr(sun?.intensity, 1));
  const sunColor = toLinearExact(sun?.color, [1, 0.95, 0.85]);
  const midColor = (c: ColorLike): Vec3 => toLinearExact(c, horizon);
  return {
    horizonHeight: finiteOr(spec.horizonHeight, 0),
    horizonSharpness: Math.max(1e-6, finiteOr(spec.horizonSharpness, 1)),
    groundBlend: range(spec.groundBlend, [0, 0.25]),
    mid: mids.slice(0, SKY_GRADIENT_MID_CAPACITY).map((band) => ({ color: midColor(band.color), blend: range(band.blend, [0, 0.3]) })),
    zenithBlend: range(spec.zenithBlend, mids.length > 0 ? [0.22, 0.85] : [0, 1]),
    haze: {
      color: toLinearExact(spec.haze?.color, horizon),
      intensity: Math.min(1, Math.max(0, finiteOr(spec.haze?.intensity, 0))),
      falloff: Math.max(0, finiteOr(spec.haze?.falloff, 8))
    },
    sunColor: sun ? [sunColor[0] * sunIntensity, sunColor[1] * sunIntensity, sunColor[2] * sunIntensity] : null,
    glow: (sun?.glow ?? DEFAULT_GLOW).slice(0, SKY_GRADIENT_GLOW_CAPACITY).map((lobe) => ({
      exponent: Math.max(1e-3, finiteOr(lobe.exponent, 1)),
      intensity: finiteOr(lobe.intensity, 0)
    })),
    discCosOuter,
    discCosInner,
    discIntensity: discSize > 0 ? Math.max(0, finiteOr(sun?.discIntensity, 3)) : 0,
    discBlend: sun?.discBlend === "replace" ? "replace" : "add",
    dither: spec.dither === true
  };
}

/**
 * CPU reference of the 5.7.0 stylised gradient (linear radiance before `bands`/`intensity`, no dither): the
 * GLSL `stylizedGradient` and the WGSL `skyStylizedGradient` evaluate the same expression in f32.
 */
export function stylizedGradientBase(frame: GradientFrame, sky: StylizedGradientFrame, d: Vec3): Vec3 {
  const u = (d[1] - sky.horizonHeight) * sky.horizonSharpness;
  let c: Vec3 = frame.horizon;
  c = mix3(c, frame.ground, smoothstep(sky.groundBlend[0], sky.groundBlend[1], -u));
  for (const band of sky.mid) c = mix3(c, band.color, smoothstep(band.blend[0], band.blend[1], u));
  c = mix3(c, frame.zenith, smoothstep(sky.zenithBlend[0], sky.zenithBlend[1], u));
  const haze = Math.min(1, Math.max(0, sky.haze.intensity * Math.exp(-Math.max(u, 0) * sky.haze.falloff)));
  c = mix3(c, sky.haze.color, haze);
  if (sky.sunColor && frame.sunDirection) {
    const cosA = dot3(d, frame.sunDirection);
    const s = Math.max(cosA, 0);
    let g = 0;
    for (const lobe of sky.glow) g += lobe.intensity * Math.pow(s, lobe.exponent);
    c = [c[0] + sky.sunColor[0] * g, c[1] + sky.sunColor[1] * g, c[2] + sky.sunColor[2] * g];
    const disc = smoothstep(sky.discCosOuter, sky.discCosInner, cosA);
    const k = sky.discIntensity;
    const discColor: Vec3 = [sky.sunColor[0] * k, sky.sunColor[1] * k, sky.sunColor[2] * k];
    c = sky.discBlend === "replace"
      ? mix3(c, discColor, disc)
      : [c[0] + discColor[0] * disc, c[1] + discColor[1] * disc, c[2] + discColor[2] * disc];
  }
  return c;
}

/** Linear radiance along `dir` (CPU mirror of the GLSL gradient path). */
export function gradientEvaluate(frame: GradientFrame, dir: Vec3): Vec3 {
  const d = normalize3(dir);
  const y = d[1];
  if (frame.stylized) {
    let out = stylizedGradientBase(frame, frame.stylized, d);
    out = addBands(frame, out, y);
    return scale(out, frame.intensity);
  }
  if (y >= 0) {
    const t = Math.pow(Math.max(0, Math.min(1, y)), 1 / frame.exponent);
    const glow = frame.horizonGlow * smoothstep(0.25, 0, Math.abs(y));
    let out: Vec3 = [
      lerp(frame.horizon[0], frame.zenith[0], t) + glow * frame.horizon[0],
      lerp(frame.horizon[1], frame.zenith[1], t) + glow * frame.horizon[1],
      lerp(frame.horizon[2], frame.zenith[2], t) + glow * frame.horizon[2]
    ];
    if (frame.sunDirection) {
      const c = dot3(d, frame.sunDirection);
      const disc = smoothstep(0.9995, 0.9999, c);
      const halo = Math.pow(Math.max(0, c), 350) * 0.6;
      out = [out[0] + disc * 40 + halo, out[1] + disc * 36 + halo * 0.9, out[2] + disc * 30 + halo * 0.7];
    }
    out = addBands(frame, out, y);
    return scale(out, frame.intensity);
  }
  const t = Math.min(1, -y * 3);
  return scale([
    lerp(frame.horizon[0], frame.ground[0], t),
    lerp(frame.horizon[1], frame.ground[1], t),
    lerp(frame.horizon[2], frame.ground[2], t)
  ], frame.intensity);
}

/** Additive emission bands (both profiles). */
function addBands(frame: GradientFrame, color: Vec3, y: number): Vec3 {
  let out = color;
  if (frame.bands.length > 0) {
    const elev = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
    for (const band of frame.bands) {
      const dy = elev - band.elevationDeg;
      const w = Math.exp(-(dy * dy) / (band.widthDeg * band.widthDeg * 0.5)) * band.intensity;
      out = [out[0] + band.color[0] * w, out[1] + band.color[1] * w, out[2] + band.color[2] * w];
    }
  }
  return out;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function range(value: readonly [number, number] | undefined, fallback: readonly [number, number]): readonly [number, number] {
  if (!value || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) return fallback;
  // Ordered edges: smoothstep is undefined when start >= end on both backends.
  return value[1] > value[0] ? [value[0], value[1]] : [value[0], value[0] + 1e-6];
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

const srgbChannel = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/**
 * Stylised-profile colour as linear RGB: a `#rgb`/`#rrggbb` hex decodes with the exact sRGB curve (the classic
 * profile keeps its gamma-2.2 decode, `toVec3`), an array is linear as given.
 */
function toLinearExact(v: ColorLike | undefined, fallback: Vec3): Vec3 {
  if (typeof v === "string") {
    const hex = /^#[0-9a-f]{3}$/i.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
    const ch = (h: string) => srgbChannel(parseInt(h, 16) / 255);
    return [ch(hex.slice(1, 3)), ch(hex.slice(3, 5)), ch(hex.slice(5, 7))];
  }
  return toVec3(v, fallback);
}

function bandColor(c: string | readonly number[]): Vec3 {
  return toVec3(c, [0, 0, 0]);
}

/**
 * A colour as linear RGB: an array as given, or an sRGB hex string
 * (`#rrggbb` / `#rgb`). GU47 phase 2: the public `sky.gradient` passes its
 * zenith / horizon / ground as hex strings, which this used to index as
 * characters (`["#", "0", "5"]`): the uniforms read NaN, the sky drew
 * nothing and the stars over it never showed (receipt `sky`).
 */
function toVec3(v: string | Vec3 | readonly number[] | undefined, fallback: Vec3): Vec3 {
  if (typeof v === "string") {
    const hex = /^#[0-9a-f]{3}$/i.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
    const srgb = (h: string) => Math.pow(parseInt(h, 16) / 255, 2.2);
    return [srgb(hex.slice(1, 3)), srgb(hex.slice(3, 5)), srgb(hex.slice(5, 7))];
  }
  if (!v || v.length < 3) return fallback;
  const out = [0, 1, 2].map((i) => Number(v[i] ?? fallback[i])) as unknown as Vec3;
  return out.every(Number.isFinite) ? out : fallback;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
