/**
 * PRD-02 §6.10 — lighting sampler-unit budget.
 * Lighting features share the fragment shader's 16 image units with the
 * material's own samplers; this resolver downgrades then drops lighting
 * features until the total fits. Deterministic: same inputs → same plan.
 *
 * Order (§6.10): first PCSS → Vogel (frees the 2 raw units pcss-raw costs),
 * then LTC → Gauss-Legendre (frees ltc's 2 units), then the frozen
 * LIGHTING_SAMPLER_DROP_ORDER.
 */
import { LIGHTING_SAMPLER_DROP_ORDER } from "../contracts/sampling.js";

/** Texture units each feature consumes (§6.10). */
export const FEATURE_UNITS: Readonly<Record<string, number>> = {
  "env-cube": 1,
  "dfg-lut": 1,
  "cascade-compare": 1,
  "pcss-raw": 2,
  "local-shadow-atlas": 1,
  "contact-shadow": 1,
  "reflection-probe-2": 2,
  "irradiance-volume": 3,
  "ltc": 2,
  "sh-texture": 1,
  "cascade-3": 1,
  "lobe:iridescence": 1,
  "lobe:sheen": 1,
  "lobe:anisotropy": 1,
  "lobe:clearcoat": 1
};

/** Spelling used in program defines → feature name (§6.10 names). */
export const FEATURE_DEFINES: Readonly<Record<string, string>> = {
  A3D_ENV_CUBE: "env-cube",
  A3D_DFG_LUT: "dfg-lut",
  A3D_CASCADE_COMPARE: "cascade-compare",
  A3D_SHADOW_PCSS: "pcss-raw",
  A3D_LOCAL_SHADOW_ATLAS: "local-shadow-atlas",
  A3D_CONTACT_SHADOW: "contact-shadow",
  A3D_REFLECTION_PROBE_2: "reflection-probe-2",
  A3D_IRRADIANCE_VOLUME: "irradiance-volume",
  A3D_LTC: "ltc",
  A3D_SH_TEXTURE: "sh-texture",
  A3D_IRIDESCENCE: "lobe:iridescence",
  A3D_SHEEN: "lobe:sheen",
  A3D_ANISOTROPY: "lobe:anisotropy",
  A3D_CLEARCOAT: "lobe:clearcoat"
};

export interface SamplerBudgetResult {
  /** Feature names removed entirely (CCR-02-1 reportable). */
  readonly droppedFeatures: readonly string[];
  /** Total lighting sampler units after the plan. */
  readonly lightingUnits: number;
  readonly materialSamplers: number;
  readonly limit: number;
  /** Feature names still active after downgrade+drop. */
  readonly activeFeatures: readonly string[];
}

/** Features that are always present when the lighting path runs. */
export function presentFeatures(defines: Readonly<Record<string, unknown>>): string[] {
  const present = new Set<string>(["env-cube", "dfg-lut"]);
  for (const [define, feature] of Object.entries(FEATURE_DEFINES)) {
    if (defines[define]) present.add(feature);
  }
  const cascadeCount = Number(defines.A3D_CASCADE_COUNT ?? 0);
  if (cascadeCount > 2) present.add("cascade-3");
  if (cascadeCount > 0) present.add("cascade-compare");
  return [...present];
}

export function resolveLightingSamplerBudgetReal(
  defines: Readonly<Record<string, unknown>>,
  materialSamplerCount: number,
  options: { readonly maxTextureImageUnits?: number } = {}
): SamplerBudgetResult {
  const limit = options.maxTextureImageUnits ?? 16;
  const active = new Set(presentFeatures(defines));
  const dropped: string[] = [];

  const units = () => [...active].reduce((sum, f) => sum + (FEATURE_UNITS[f] ?? 1), 0);
  const over = () => units() + materialSamplerCount > limit;

  // Step 1: PCSS → Vogel frees the 2 raw units.
  if (over() && active.has("pcss-raw")) {
    active.delete("pcss-raw"); // cascade-compare remains — Vogel samples the compare map only
    dropped.push("pcss-raw");
  }
  // Step 2: LTC → Gauss-Legendre 4-tap frees the ltc table units.
  if (over() && active.has("ltc")) {
    active.delete("ltc");
    dropped.push("ltc");
  }
  // Step 3: frozen drop order.
  for (const feature of LIGHTING_SAMPLER_DROP_ORDER) {
    if (!over()) break;
    if (active.has(feature)) {
      active.delete(feature);
      dropped.push(feature);
    }
  }
  return {
    droppedFeatures: dropped,
    lightingUnits: units(),
    materialSamplers: materialSamplerCount,
    limit,
    activeFeatures: [...active]
  };
}
