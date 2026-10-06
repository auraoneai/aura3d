/**
 * PRD-02 §6.10 — the real C-12 `resolveLightingSamplerBudget`.
 *
 * Sums lighting-owned sampler units for a generated lighting program plus
 * the material's own map count and enforces `MAX_TEXTURE_IMAGE_UNITS`:
 * first the two PRD-02-local downgrades that keep the feature
 * (PCSS → Vogel frees the raw cascade/atlas units; LTC → Gauss–Legendre
 * frees 2), then drops in the frozen `LIGHTING_SAMPLER_DROP_ORDER`.
 * Every downgrade/drop is reported in `droppedFeatures` (diagnostics
 * reads them verbatim); it never fails.
 *
 * The C-12 contract stub (`{ droppedFeatures: [] }`) stays the flag-off
 * result; callers route to this implementation under A3D_QR_LIGHTING.
 */
import { LIGHTING_SAMPLER_DROP_ORDER } from "../contracts/sampling";

/** Feature ids the budget understands, matched against define spellings. */
const FEATURE_DEFINES: Readonly<Record<string, readonly string[]>> = {
  "env-cube": ["env-cube", "A3D_ENV_CUBE", "ENV_CUBE"],
  "dfg-lut": ["dfg-lut", "A3D_DFG_LUT", "DFG_LUT"],
  "cascade-compare": ["cascade-compare", "A3D_CASCADE_COUNT", "DIRECTIONAL_SHADOW", "SHADOW_CASCADES"],
  "pcss-raw": ["pcss-raw", "A3D_PCSS", "PCSS"],
  "local-shadow-atlas": ["local-shadow-atlas", "A3D_LOCAL_SHADOW_ATLAS", "LOCAL_SHADOW_ATLAS"],
  "contact-shadow": ["contact-shadow", "A3D_CONTACT_SHADOWS", "CONTACT_SHADOW"],
  "reflection-probe-2": ["reflection-probe-2", "A3D_PROBE_COUNT", "REFLECTION_PROBES"],
  "irradiance-volume": ["irradiance-volume", "A3D_IRRADIANCE_VOLUME", "IRRADIANCE_VOLUME"],
  "ltc": ["ltc", "A3D_LTC", "AREA_LIGHT_LTC"],
  "sh-texture": ["sh-texture", "A3D_SH_TEXTURE", "SH_TEXTURE"],
  "cascade-3": ["cascade-3", "A3D_CASCADE_3"],
  "lobe:iridescence": ["lobe:iridescence", "LOBE_IRIDESCENCE"],
  "lobe:sheen": ["lobe:sheen", "LOBE_SHEEN"],
  "lobe:anisotropy": ["lobe:anisotropy", "LOBE_ANISOTROPY"],
  "lobe:clearcoat": ["lobe:clearcoat", "LOBE_CLEARCOAT"]
};

/** Sampler units each feature owns (§6.10 table). */
const FEATURE_UNITS: Readonly<Record<string, number>> = {
  "env-cube": 1,
  "dfg-lut": 1,
  "cascade-compare": 1,
  "pcss-raw": 2,            // raw cascade map + raw atlas map (Ultra)
  "local-shadow-atlas": 1,  // compare sampler
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

export interface LightingSamplerBudgetResult {
  readonly droppedFeatures: readonly string[];
  readonly lightingUnits: number;
  readonly materialSamplers: number;
  readonly limit: number;
  /** Feature set after downgrades/drops — what the program should compile with. */
  readonly activeFeatures: readonly string[];
}

function presentFeatures(programDefines: Readonly<Record<string, unknown>>): Set<string> {
  const found = new Set<string>();
  for (const [feature, spellings] of Object.entries(FEATURE_DEFINES)) {
    for (const key of spellings) {
      const value = programDefines[key];
      if (value === undefined || value === false || value === 0) continue;
      found.add(feature);
      break;
    }
  }
  // Implicit table rows: every lighting program owns the env cube + DFG LUT.
  found.add("env-cube");
  found.add("dfg-lut");
  // A3D_CASCADE_COUNT > 2 implies the third-cascade unit.
  const cascades = Number(programDefines["A3D_CASCADE_COUNT"] ?? 0);
  if (cascades > 2) {
    found.add("cascade-compare");
    found.add("cascade-3");
  }
  return found;
}

export function resolveLightingSamplerBudgetReal(
  programDefines: Readonly<Record<string, unknown>>,
  materialSamplerCount: number,
  deviceLimits: { readonly maxTextureImageUnits: number }
): LightingSamplerBudgetResult {
  const limit = deviceLimits.maxTextureImageUnits;
  const features = presentFeatures(programDefines);
  const dropped: string[] = [];
  const unitsOf = () => [...features].reduce((sum, f) => sum + (FEATURE_UNITS[f] ?? 0), 0);

  // 1. PCSS → Vogel keeps the feature, frees the two raw maps.
  if (unitsOf() + materialSamplerCount > limit && features.has("pcss-raw")) {
    features.delete("pcss-raw");
    dropped.push("pcss-raw");
  }
  // 2. LTC → Gauss–Legendre keeps area lights, frees the two LUTs.
  if (unitsOf() + materialSamplerCount > limit && features.has("ltc")) {
    features.delete("ltc");
    dropped.push("ltc");
  }
  // 3. Drop in the frozen order until it fits; the two always-on rows
  //    (env-cube, dfg-lut) are not in the order and never drop.
  for (const name of LIGHTING_SAMPLER_DROP_ORDER) {
    if (unitsOf() + materialSamplerCount <= limit) break;
    if (features.has(name)) {
      features.delete(name);
      dropped.push(name);
    }
  }
  return {
    droppedFeatures: dropped,
    lightingUnits: unitsOf(),
    materialSamplers: materialSamplerCount,
    limit,
    activeFeatures: [...features].sort()
  };
}
