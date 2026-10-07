// PRD-07 lane barrel — engine-side vfx/atmosphere surface.

export { attachVfxBridge, type VfxBridge } from "./bridge";
export { createAppEffects, createEffectsExtension, registerPrd07System, prd07SystemFor } from "./effects-api";
export { createAtmosphereExtension } from "./atmosphere-api";
export { collectEffectsSection, collectAtmosphereSection } from "./diagnostics";
export { registerPrd07LookLintRules } from "./lookLint";
export {
  AURA_VFX_BUILTIN_SEQUENCES,
  validateVfxAtlasManifest,
  vfxAtlasPageForTier,
  type AuraVfxAtlasManifest,
  type AuraVfxAtlasPage,
  type AuraVfxAtlasSequenceEntry,
  type AuraVfxBuiltinSequence
} from "./atlas";
