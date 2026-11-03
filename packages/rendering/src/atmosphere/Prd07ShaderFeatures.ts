/**
 * The stock PRD-07 forward ShaderFeatures, kept separate from the lane barrel
 * so the selective-bloom path can authenticate them without registering a
 * contributor, calling a selector, or binding a uniform.
 *
 * Merge note (native 5.0 + 4.7.x): the single stock objects live in
 * `vfx/replayFeatureIdentity` (frame-scoped fog/wetness binding, replay
 * guard). They are re-exported under the 4.7.x names so the lane registers
 * one object and both the replay guard and this selective-bloom verifier
 * authenticate that same object.
 */
import { stockFeatureVerifier } from "../program/FeatureSelect";
import { PRD07_FOG_FEATURE, PRD07_WETNESS_FEATURE } from "../vfx/replayFeatureIdentity";

export const PRD07_FOG_SHADER_FEATURE = PRD07_FOG_FEATURE;
export const PRD07_WETNESS_SHADER_FEATURE = PRD07_WETNESS_FEATURE;

/** Authenticate the original objects and functions, not their public IDs. */
export const isStockPrd07BloomFeature = stockFeatureVerifier([PRD07_FOG_SHADER_FEATURE, PRD07_WETNESS_SHADER_FEATURE]);
