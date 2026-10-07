// PRD-07 — unified sky evaluation: picks the model, evaluates on CPU, packs
// the uniform block the GPU sky program consumes.

import type { AuraSkySpecLike } from "../contracts/atmosphere";
import { preethamEvaluate, preethamFrame, sunDirection, type PreethamFrame, type PreethamSpec, type Vec3 } from "./PreethamSky";
import { gradientEvaluate, gradientFrame, type GradientFrame, type GradientSpec } from "./GradientSky";
import { starFrame, starVisibilityAtSunElevation, type StarFrame, type StarSpec } from "./StarField";
import { cloudFrame, type CloudFrame, type CloudSpec } from "./CloudLayer";

export type { StarSpec } from "./StarField";
export type { CloudSpec } from "./CloudLayer";

export type SkyModel = "preetham" | "gradient" | "hdri" | "cubemap" | "color" | "none";

/** §8.5 moon spec (elevation/azimuth degrees + phase 0..1 illumination). */
export interface MoonSpec {
  readonly elevationDeg?: number;
  readonly azimuthDeg?: number;
  /** Lunar phase 0..1: 0 = new, 0.5 = full, 1 = new. */
  readonly phase?: number;
  readonly color?: string | Vec3;
  readonly intensity?: number;
  readonly size?: number;
}

export interface MoonFrame {
  readonly direction: Vec3;
  readonly phase: number;
  readonly color: Vec3;
  readonly intensity: number;
  readonly size: number;
}

export interface SkyFrame {
  readonly model: SkyModel;
  readonly preetham?: PreethamFrame;
  readonly gradient?: GradientFrame;
  readonly color: Vec3;
  readonly intensity: number;
  readonly stars: StarFrame;
  readonly clouds: CloudFrame;
  readonly moon: MoonFrame | null;
  readonly showStars: boolean;
}

function hexToLinear(c: string): Vec3 {
  if (c.startsWith("#") && c.length === 7) {
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    return [lin(parseInt(c.slice(1, 3), 16)), lin(parseInt(c.slice(3, 5), 16)), lin(parseInt(c.slice(5, 7), 16))];
  }
  return [1, 1, 1];
}

/** Resolve the optional `moon` spec field; null disables the disc. */
export function moonFrame(raw: unknown): MoonFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as MoonSpec;
  const elevationDeg = o.elevationDeg ?? 0;
  const azimuthDeg = o.azimuthDeg ?? 0;
  const direction = sunDirection({ elevationDeg, azimuthDeg });
  const phase = Math.max(0, Math.min(1, o.phase ?? 0.5));
  const color = Array.isArray(o.color)
    ? [Number(o.color[0] ?? 1), Number(o.color[1] ?? 1), Number(o.color[2] ?? 1)] as Vec3
    : hexToLinear((o.color as string) ?? "#dbeafe");
  return {
    direction,
    phase,
    color,
    intensity: o.intensity ?? 0.8,
    size: o.size ?? 0.042 // radians — legacy moon disc angular radius
  };
}

export function skyFrame(spec: AuraSkySpecLike | null | undefined): SkyFrame {
  const s = spec ?? {};
  const model = (s.model as SkyModel) ?? "none";
  const stars = starFrame(s.stars);
  const clouds = cloudFrame(s.clouds);
  const moon = moonFrame(s.moon);
  const base: SkyFrame = {
    model,
    color: [0, 0, 0],
    intensity: (s.intensity as number) ?? 1,
    stars,
    clouds,
    moon,
    showStars: stars.density > 0
  };
  switch (model) {
    case "preetham": {
      const preetham = preethamFrame(s as unknown as PreethamSpec);
      const sunElevationDeg = (Math.asin(Math.max(-1, Math.min(1, preetham.sunDirection[1]))) * 180) / Math.PI;
      // Stars dim as the sun approaches — fade law from StarField (0 above 6°).
      const visibility = starVisibilityAtSunElevation(sunElevationDeg);
      return { ...base, preetham, stars: { ...stars, intensity: stars.intensity * Math.max(0.0001, visibility) }, showStars: true };
    }
    case "gradient": {
      const gradient = gradientFrame(s as unknown as GradientSpec);
      const sunElevationDeg = gradient.sunDirection
        ? (Math.asin(Math.max(-1, Math.min(1, gradient.sunDirection[1]))) * 180) / Math.PI
        : -90;
      const visibility = starVisibilityAtSunElevation(sunElevationDeg);
      return { ...base, gradient, stars: { ...stars, intensity: stars.intensity * Math.max(0.0001, visibility) }, showStars: stars.density > 0 };
    }
    case "color":
      return { ...base, color: ((s.color ?? s.value ?? [0, 0, 0]) as Vec3) };
    default:
      return base;
  }
}

/** CPU radiance along `dir` for horizonRadiance + tests. */
export function evaluateSky(frame: SkyFrame, dir: Vec3): Vec3 {
  switch (frame.model) {
    case "preetham":
      return frame.preetham ? preethamEvaluate(frame.preetham, dir) : [0, 0, 0];
    case "gradient":
      return frame.gradient ? gradientEvaluate(frame.gradient, dir) : [0, 0, 0];
    case "color":
      return frame.color;
    default:
      return [0, 0, 0];
  }
}

/** GPU sky program defines — one program per (model, stars, clouds, moon) combo. */
export interface SkyProgramDefines {
  readonly model: "PREETHAM" | "GRADIENT" | "COLOR" | "NONE";
  readonly stars: boolean;
  readonly clouds: boolean;
  readonly sunDisc: boolean;
  readonly moon: boolean;
  /** P4-T7 — background fog: apply a3dApplyFog at backgroundDistance. */
  readonly fog: boolean;
}

export function skyProgramDefines(frame: SkyFrame, extra?: { readonly fog?: boolean }): SkyProgramDefines {
  return {
    model:
      frame.model === "preetham" ? "PREETHAM" :
      frame.model === "gradient" ? "GRADIENT" :
      frame.model === "color" ? "COLOR" : "NONE",
    stars: frame.showStars,
    clouds: frame.clouds.coverage > 0,
    sunDisc: true,
    moon: frame.moon !== null,
    fog: extra?.fog === true
  };
}

export function skyProgramKey(d: SkyProgramDefines): string {
  return `prd07.sky.${d.model}${d.stars ? ".stars" : ""}${d.clouds ? ".clouds" : ""}${d.sunDisc ? ".disc" : ""}${d.moon ? ".moon" : ""}${d.fog ? ".fog" : ""}`;
}
