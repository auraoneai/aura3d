// PRD-07 — unified sky evaluation: picks the model, evaluates on CPU, packs
// the uniform block the GPU sky program consumes.

import type { AuraSkySpecLike } from "../contracts/atmosphere";
import { preethamEvaluate, preethamFrame, type PreethamFrame, type PreethamSpec, type Vec3 } from "./PreethamSky";
import { gradientEvaluate, gradientFrame, type GradientFrame, type GradientSpec } from "./GradientSky";

export type SkyModel = "preetham" | "gradient" | "hdri" | "cubemap" | "color" | "none";

export interface StarSpec {
  readonly density?: number;   // stars per steradian-ish cell count
  readonly intensity?: number;
}

export interface CloudSpec {
  readonly scale?: number;
  readonly speed?: number;
  readonly coverage?: number;
  readonly density?: number;
  readonly elevation?: number;
}

export interface SkyFrame {
  readonly model: SkyModel;
  readonly preetham?: PreethamFrame;
  readonly gradient?: GradientFrame;
  readonly color: Vec3;
  readonly intensity: number;
  readonly stars: Required<StarSpec>;
  readonly clouds: Required<CloudSpec>;
  readonly showStars: boolean;
}

/** Defaults for optional `stars` / `clouds` spec fields (unknown → disabled). */
function starSpec(raw: unknown): Required<StarSpec> {
  const o = (raw ?? {}) as StarSpec;
  return { density: o.density ?? 0, intensity: o.intensity ?? 1 };
}
function cloudSpec(raw: unknown): Required<CloudSpec> {
  const o = (raw ?? {}) as CloudSpec;
  return {
    scale: o.scale ?? 0.0002,
    speed: o.speed ?? 0.0001,
    coverage: o.coverage ?? 0,
    density: o.density ?? 0.4,
    elevation: o.elevation ?? 0.5
  };
}

export function skyFrame(spec: AuraSkySpecLike | null | undefined): SkyFrame {
  const s = spec ?? {};
  const model = (s.model as SkyModel) ?? "none";
  const stars = starSpec(s.stars);
  const clouds = cloudSpec(s.clouds);
  const base: SkyFrame = {
    model,
    color: [0, 0, 0],
    intensity: (s.intensity as number) ?? 1,
    stars,
    clouds,
    showStars: stars.density > 0
  };
  switch (model) {
    case "preetham":
      return { ...base, preetham: preethamFrame(s as unknown as PreethamSpec), showStars: true };
    case "gradient":
      return { ...base, gradient: gradientFrame(s as unknown as GradientSpec), showStars: stars.density > 0 };
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

/** GPU sky program defines — one program per (model, stars, clouds) combo. */
export interface SkyProgramDefines {
  readonly model: "PREETHAM" | "GRADIENT" | "COLOR" | "NONE";
  readonly stars: boolean;
  readonly clouds: boolean;
  readonly sunDisc: boolean;
}

export function skyProgramDefines(frame: SkyFrame): SkyProgramDefines {
  return {
    model:
      frame.model === "preetham" ? "PREETHAM" :
      frame.model === "gradient" ? "GRADIENT" :
      frame.model === "color" ? "COLOR" : "NONE",
    stars: frame.showStars,
    clouds: frame.clouds.coverage > 0,
    sunDisc: true
  };
}

export function skyProgramKey(d: SkyProgramDefines): string {
  return `prd07.sky.${d.model}${d.stars ? ".stars" : ""}${d.clouds ? ".clouds" : ""}${d.sunDisc ? ".disc" : ""}`;
}
