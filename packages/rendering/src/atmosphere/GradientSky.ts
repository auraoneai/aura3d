// PRD-07 P3-T1 — gradient sky evaluator (zenith/horizon/ground + sun halo).
import { dot3, normalize3, smoothstep, sunDirection, type Vec3, type AuraSkySunSpecLike } from "./PreethamSky";

export interface GradientSpec {
  readonly model: "gradient";
  readonly zenith: Vec3 | readonly number[];
  readonly horizon: Vec3 | readonly number[];
  readonly ground?: Vec3 | readonly number[];
  readonly exponent?: number;
  readonly horizonGlow?: number;
  readonly sun?: AuraSkySunSpecLike;
  readonly intensity?: number;
}

export interface GradientFrame {
  readonly zenith: Vec3;
  readonly horizon: Vec3;
  readonly ground: Vec3;
  readonly exponent: number;
  readonly horizonGlow: number;
  readonly sunDirection: Vec3 | null;
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
    return scale(out, frame.intensity);
  }
  const t = Math.min(1, -y * 3);
  return scale([
    lerp(frame.horizon[0], frame.ground[0], t),
    lerp(frame.horizon[1], frame.ground[1], t),
    lerp(frame.horizon[2], frame.ground[2], t)
  ], frame.intensity);
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
