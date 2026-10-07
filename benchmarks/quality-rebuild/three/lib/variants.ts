/**
 * T2.5 — three-side broken-control variants (§6.4). All seven controls are
 * expressible on the three reference: four are spec rewrites (`applyVariantSpec`)
 * and three are renderer-level switches read by `runThreeScene`
 * (`variantDprScale`, `variantAntialias`, `variantToneMapped`, `albedo-only`
 * material swap in common.ts).
 */
import type { BrokenControlId } from "../../shared/contracts";
import type { SceneSpec } from "../../shared/types";

export const THREE_BROKEN_CONTROL_IDS: readonly BrokenControlId[] = [
  "no-shadows", "no-ibl", "dpr-half", "no-aa", "no-tonemap", "flat-sky", "albedo-only"
];

export function isThreeVariant(variant: string | undefined): variant is BrokenControlId {
  return typeof variant === "string" && (THREE_BROKEN_CONTROL_IDS as readonly string[]).includes(variant);
}

/** Spec-level rewrites: castShadow off, environment intensity 0, flat background. */
export function applyVariantSpec(spec: SceneSpec, variant: string | undefined): SceneSpec {
  if (!variant || variant === "default" || variant === "aura3d-tuned") return spec;
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

export function variantDprScale(variant: string | undefined): number {
  return variant === "dpr-half" ? 0.5 : 1;
}

/** WebGLRenderer({antialias}) — the "no-aa" control. */
export function variantAntialias(variant: string | undefined): boolean {
  return variant !== "no-aa";
}

/** true → renderer applies ACES; "no-tonemap" forces NoToneMapping. */
export function variantToneMapped(variant: string | undefined): boolean {
  return variant !== "no-tonemap";
}
