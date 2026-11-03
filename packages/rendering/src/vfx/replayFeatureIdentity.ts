// Original PRD07 features live here without registering anything. ForwardPass
// can recognize their identities without importing the side-effectful lane.
// This proof is for inactive features only. Managed packet consumption does
// not by itself establish the renderer's async lease or replay safety.
import type { QrFlagName } from "../contracts/core";
import type { ShaderFeature } from "../contracts/program";
import { makeShaderFeatureReplayGuard } from "../program/FeatureSelect";
import { FOG_CHUNK_NAME, FOG_APPLY_CHUNK_NAME, WETNESS_CHUNK_NAME, WETNESS_APPLY_CHUNK_NAME } from "../atmosphere/fogChunks";
import { bindPrd07FogUniforms, prd07ForwardFog } from "../atmosphere/fogUniformStore";
import { prd07WetnessState } from "../atmosphere/shaders/wetness.glsl";
import { TextureBinding } from "../TextureBinding";
import { prd07FogSelect, prd07WetnessSelect } from "./prd07FeaturePars";

export const PRD07_FOG_FEATURE: ShaderFeature = {
  id: "prd07.fog",
  owner: "prd07",
  flag: "A3D_QR_VFX_FOG",
  // Only while a fog node published state; fog-free scenes keep their programs.
  select: (input) => (prd07ForwardFog(input.frameContext) === null ? undefined : prd07FogSelect(input)),
  // Never define FOG_VOLUMETRIC on forward programs: even a value of 0 is
  // `defined()` and would require a3dSampleFroxel(), while the volume pass
  // composites froxels separately. The select value still keys the variant.
  defines: (value) => ({ A3D_FOG: 1, ...(value === "volumetric" ? { A3D_FOG_FROXEL_TIER: 1 } : {}) }),
  chunks: [FOG_CHUNK_NAME, FOG_APPLY_CHUNK_NAME],
  hooks: ["fragment:pars", "fragment:fog"],
  // Explicitly managed contexts use their live packet or fail closed; other
  // contexts retain legacy behavior until renderer integration is complete.
  bindUniforms: (_value, _item, set, frame) => bindPrd07FogUniforms(set, frame)
};

export const PRD07_WETNESS_FEATURE: ShaderFeature = {
  id: "prd07.wetness",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  // Only a live wetness response on a lit forward draw selects this feature.
  select: (input) => prd07WetnessSelect(input),
  defines: () => ({ A3D_WETNESS: 1 }),
  chunks: [WETNESS_CHUNK_NAME, WETNESS_APPLY_CHUNK_NAME],
  hooks: ["fragment:pars", "fragment:material"],
  bindUniforms: (_value, _item, set, frame) => {
    const w = prd07WetnessState(frame);
    set("u_wetness", w.wetness);
    set("u_puddleThreshold", w.puddleThreshold);
    set("u_rainRipples", w.rainRipples);
    set("u_snowCover", w.snowCover);
    set("u_puddleNoise", new TextureBinding({ name: "u_puddleNoise", texture: w.puddleNoise, required: false }));
  }
};

const unchangedOriginal = makeShaderFeatureReplayGuard([PRD07_FOG_FEATURE, PRD07_WETNESS_FEATURE]);

/** Identity comparison alone does not read properties on unknown objects. */
export function isOriginalPrd07FeatureIdentity(feature: ShaderFeature): boolean {
  return feature === PRD07_FOG_FEATURE || feature === PRD07_WETNESS_FEATURE;
}

/**
 * Identify an unchanged built-in without inspecting unknown objects or proxies.
 * The caller may skip this feature only when the returned flag is off. An active
 * PRD07 feature must still reject replay until its state is frame scoped.
 */
export function originalPrd07FeatureFlag(feature: ShaderFeature): QrFlagName | undefined {
  if (!isOriginalPrd07FeatureIdentity(feature)) return undefined;
  if (!unchangedOriginal(feature)) return undefined;
  return feature === PRD07_FOG_FEATURE ? "A3D_QR_VFX_FOG" : "A3D_QR_VFX";
}
