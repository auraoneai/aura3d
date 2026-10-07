/**
 * PRD-10 §7.1.3 — wind authoring options and normalization to the frozen C-26
 * `AuraWindSpec` (direction vec3, strength, gust, gustFrequency, turbulence).
 * The `A3DWind` UBO and chunk name are frozen by C-26 (`WIND_CHUNK = "a3d_prd10_wind"`, §8.2).
 */
import type { AuraVec3 } from "../index.js";
import type { AuraWindSpec } from "../../contracts/world.js";
import type { AuraWorldNodeBase } from "./types.js";

/** Authoring options; normalized to the frozen C-26 `AuraWindSpec`. */
export interface AuraWindOptions extends AuraWorldNodeBase {
  /** Stable node id (diagnostics + wind records); auto-assigned at build. */
  readonly id?: string;
  readonly directionDeg?: number; // default 35   -> direction = [sin, 0, cos]
  readonly strength?: number; // 0..2, default 0.5 -> strength
  readonly gustStrength?: number; // 0..1, default 0.35 -> gust
  readonly gustScale?: number; // metres per gust cell, default 40 -> gustFrequency = 1 / gustScale
  readonly turbulence?: number; // 0..1, default 0.2
}

export interface AuraWindNode extends AuraWorldNodeBase {
  readonly kind: "wind";
  readonly id: string;
  readonly wind: Required<AuraWindSpec>;
}

/** Pure; also backs the C-26 `world.wind()` getter default. */
export function normalizeWind(options?: AuraWindOptions): Required<AuraWindSpec> {
  const directionDeg = options?.directionDeg ?? 35;
  const radians = (directionDeg * Math.PI) / 180;
  const direction: AuraVec3 = [Math.sin(radians), 0, Math.cos(radians)];
  const strength = options?.strength ?? 0.5;
  const gust = options?.gustStrength ?? 0.35;
  const gustScale = options?.gustScale ?? 40;
  return {
    direction,
    strength,
    gust,
    gustFrequency: gustScale > 0 ? 1 / gustScale : 0,
    turbulence: options?.turbulence ?? 0.2
  };
}
