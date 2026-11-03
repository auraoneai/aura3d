import type { MaterialLobe } from "../contracts/materialLobes";
import type { MaterialExtensionFeature, ShaderFeature } from "../contracts/program";
import { PRD04_MATERIAL_LOBES } from "../materials/lobes";
import { indirectFractionFeature, INDIRECT_FRACTION_BIT } from "../post/chunks/indirectFraction.glsl";
import { PRD02_SHADOW_FILTER_FEATURE } from "../shadows/Prd02ShadowFilter";
import { PRD02_IBL_SHADER_FEATURE } from "../shaders/Prd02IblFeature";
import { isStockPrd07BloomFeature, PRD07_WETNESS_SHADER_FEATURE } from "../atmosphere/Prd07ShaderFeatures";

const trustedFeatures = new Map<string, { readonly feature: ShaderFeature; accepts(value: string | number | boolean): boolean; readonly unchanged?: (feature: ShaderFeature) => boolean }>([
  [PRD02_IBL_SHADER_FEATURE.id, { feature: PRD02_IBL_SHADER_FEATURE, accepts: value => value === true }],
  [PRD02_SHADOW_FILTER_FEATURE.id, { feature: PRD02_SHADOW_FILTER_FEATURE, accepts: value => value === 1 || value === 2 || value === 3 }],
  [indirectFractionFeature.id, { feature: indirectFractionFeature, accepts: value => value === INDIRECT_FRACTION_BIT }],
  // The renderer applies the uniform (noise-free) wetness response to the
  // native materials on the CPU; see deferredWetnessMaterials.
  [PRD07_WETNESS_SHADER_FEATURE.id, { feature: PRD07_WETNESS_SHADER_FEATURE, accepts: value => value === true, unchanged: isStockPrd07BloomFeature }]
]);
const trustedLobes = new Set(PRD04_MATERIAL_LOBES.filter(lobe => lobe.id === "sheen" || lobe.id === "emissive-strength"));

export interface NativeDeferredFeatureAdmission {
  readonly reason?: string;
  readonly indirectFraction: boolean;
  readonly ibl: boolean;
  /** Present (true) only when the stock PRD-07 wetness feature is selected for this item. */
  readonly wetness?: true;
}

/**
 * The registry is replaceable. A known ID alone cannot establish the shader
 * implementation selected for this draw; compare provider objects as well.
 * Material values and geometry are separately checked by the native adapter.
 */
export function admitNativeDeferredFeatures(
  selected: Readonly<Record<string, string | number | boolean>>,
  features: readonly ShaderFeature[],
  extensions: readonly MaterialExtensionFeature[],
  lobes: readonly MaterialLobe[]
): NativeDeferredFeatureAdmission {
  const reject = (reason: string): NativeDeferredFeatureAdmission => ({ reason, indirectFraction: false, ibl: false });
  for (const [id, value] of Object.entries(selected)) {
    const trusted = trustedFeatures.get(id);
    if (!trusted || features.find(feature => feature.id === id) !== trusted.feature || !trusted.accepts(value) ||
        (trusted.unchanged && !trusted.unchanged(trusted.feature))) {
      return reject(`shader feature ${id} requires the full forward renderer`);
    }
  }
  for (const extension of extensions) {
    const matching = lobes.filter(lobe => extension.lobe === lobe.id || extension.lobe === lobe.glTFExtension);
    if (matching.length !== 1 || !trustedLobes.has(matching[0]!) || extension.maps.length > 0) {
      return reject(`material lobe ${extension.lobe} requires the full forward renderer`);
    }
  }
  return {
    indirectFraction: selected[indirectFractionFeature.id] === INDIRECT_FRACTION_BIT,
    ibl: selected[PRD02_IBL_SHADER_FEATURE.id] === true,
    ...(selected[PRD07_WETNESS_SHADER_FEATURE.id] === true ? { wetness: true } : {})
  };
}
