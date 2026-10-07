/**
 * T2.4 — Aura-side broken-control variants (§8.4). Only the controls
 * expressible through the public API today are applied; the rest throw
 * `NotExpressibleVariantError` and are never captured — they are measured on
 * the three side and recorded as audit failures.
 */
import type { BrokenControlId } from "../../shared/contracts";
import type { SceneSpec } from "../../shared/types";

export class NotExpressibleVariantError extends Error {
  readonly variant: string;
  constructor(variant: string) {
    super(`broken-control ${variant} not expressible via the Aura public API`);
    this.name = "NotExpressibleVariantError";
    this.variant = variant;
  }
}

/**
 * Expressible: no-shadows (castShadow:false), no-ibl (hdri intensity 0),
 * dpr-half (pixelRatio 0.5x — renderer-level, see common.ts), flat-sky
 * (color background). NOT expressible: no-aa, no-tonemap, albedo-only.
 */
export const AURA_EXPRESSIBLE_VARIANTS: ReadonlySet<BrokenControlId> = new Set([
  "no-shadows", "no-ibl", "dpr-half", "flat-sky"
]);

export function auraVariantExpressible(variant: string | undefined): boolean {
  return variant === undefined || variant === "default" || variant === "aura3d-tuned"
    || AURA_EXPRESSIBLE_VARIANTS.has(variant as BrokenControlId);
}

export function applyVariantSpec(spec: SceneSpec, variant: string | undefined): SceneSpec {
  if (!variant || variant === "default" || variant === "aura3d-tuned") return spec;
  if (!AURA_EXPRESSIBLE_VARIANTS.has(variant as BrokenControlId)) throw new NotExpressibleVariantError(variant);
  if (variant === "no-shadows") {
    return { ...spec, lights: spec.lights.map((light) => ("castShadow" in light ? { ...light, castShadow: false } : light)) };
  }
  if (variant === "no-ibl") {
    return { ...spec, environment: spec.environment ? { ...spec.environment, intensity: 0 } : spec.environment };
  }
  if (variant === "flat-sky") {
    if (spec.background.kind !== "hdri") return spec;
    return { ...spec, background: { kind: "color", color: spec.background.fallbackColor } };
  }
  return spec;
}
