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

export interface GradientSpec {
  readonly model: "gradient";
  readonly zenith: Vec3 | readonly number[];
  readonly horizon: Vec3 | readonly number[];
  readonly ground?: Vec3 | readonly number[];
  readonly exponent?: number;
  readonly horizonGlow?: number;
  readonly sun?: AuraSkySunSpecLike;
  readonly bands?: readonly AuraSkyBand[];
  readonly intensity?: number;
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
}

export function gradientFrame(spec: GradientSpec): GradientFrame {
  return {
    zenith: toVec3(spec.zenith, [0.08, 0.16, 0.38]),
    horizon: toVec3(spec.horizon, [0.55, 0.65, 0.8]),
    ground: toVec3(spec.ground ?? [0.12, 0.12, 0.13], [0.12, 0.12, 0.13]),
    exponent: spec.exponent ?? 1.6,
    horizonGlow: spec.horizonGlow ?? 0.35,
    sunDirection: spec.sun ? sunDirection(spec.sun) : null,
    bands: (spec.bands ?? []).slice(0, SKY_BAND_CAPACITY).map((b) => ({
      elevationDeg: b.elevationDeg,
      widthDeg: Math.max(0.5, b.widthDeg),
      color: bandColor(b.color),
      intensity: Math.max(0, b.intensity)
    })),
    intensity: spec.intensity ?? 1
  };
}

/** Linear radiance along `dir` (CPU mirror of the GLSL gradient path). */
export function gradientEvaluate(frame: GradientFrame, dir: Vec3): Vec3 {
  const d = normalize3(dir);
  const y = d[1];
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
    if (frame.bands.length > 0) {
      const elev = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
      for (const band of frame.bands) {
        const dy = elev - band.elevationDeg;
        const w = Math.exp(-(dy * dy) / (band.widthDeg * band.widthDeg * 0.5)) * band.intensity;
        out = [out[0] + band.color[0] * w, out[1] + band.color[1] * w, out[2] + band.color[2] * w];
      }
    }
    return scale(out, frame.intensity);
  }
  const t = Math.min(1, -y * 3);
  return scale([
    lerp(frame.horizon[0], frame.ground[0], t),
    lerp(frame.horizon[1], frame.ground[1], t),
    lerp(frame.horizon[2], frame.ground[2], t)
  ], frame.intensity);
}

function bandColor(c: string | readonly number[]): Vec3 {
  if (typeof c === "string" && c.startsWith("#") && c.length === 7) {
    const srgb = (h: string) => Math.pow(parseInt(h, 16) / 255, 2.2);
    return [srgb(c.slice(1, 3)), srgb(c.slice(3, 5)), c.length === 7 ? srgb(c.slice(5, 7)) : 0];
  }
  if (Array.isArray(c) && c.length >= 3) return [Number(c[0]), Number(c[1]), Number(c[2])];
  return [0, 0, 0];
}

function toVec3(v: Vec3 | readonly number[], fallback: Vec3): Vec3 {
  return v && v.length >= 3 ? [v[0] ?? fallback[0], v[1] ?? fallback[1], v[2] ?? fallback[2]] : fallback;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
