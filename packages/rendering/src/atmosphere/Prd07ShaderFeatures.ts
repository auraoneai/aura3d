/**
 * The stock PRD-07 forward ShaderFeatures, kept separate from the lane barrel
 * so the selective-bloom path can authenticate them without registering a
 * contributor, calling a selector, or binding a uniform.
 */
import type { ShaderFeature } from "../contracts/program";
import { TextureBinding } from "../TextureBinding";
import { stockFeatureVerifier } from "../program/FeatureSelect";
import { prd07FogSelect, prd07WetnessSelect } from "../vfx/prd07FeaturePars";
import { FOG_APPLY_CHUNK_NAME, FOG_CHUNK_NAME, WETNESS_APPLY_CHUNK_NAME, WETNESS_CHUNK_NAME } from "./fogChunks";
import { bindPrd07FogUniforms, prd07ForwardFog } from "./fogUniformStore";
import { prd07WetnessState } from "./shaders/wetness.glsl";

export const PRD07_FOG_SHADER_FEATURE: ShaderFeature = {
  id: "prd07.fog",
  owner: "prd07",
  flag: "A3D_QR_VFX_FOG",
  // The contributor publishes live fog during normal collect. No optional
  // selective-bloom preparation invokes this selector again.
  select: (input) => (prd07ForwardFog() === null ? undefined : prd07FogSelect(input)),
  // Froxel fog is composited separately; forward programs use analytic fog.
  defines: (value) => ({ A3D_FOG: 1, ...(value === "volumetric" ? { A3D_FOG_FROXEL_TIER: 1 } : {}) }),
  chunks: [FOG_CHUNK_NAME, FOG_APPLY_CHUNK_NAME],
  hooks: ["fragment:pars", "fragment:fog"],
  bindUniforms: (_value, _item, set) => bindPrd07FogUniforms(set)
};

export const PRD07_WETNESS_SHADER_FEATURE: ShaderFeature = {
  id: "prd07.wetness",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  select: (input) => prd07WetnessSelect(input),
  defines: () => ({ A3D_WETNESS: 1 }),
  chunks: [WETNESS_CHUNK_NAME, WETNESS_APPLY_CHUNK_NAME],
  hooks: ["fragment:pars", "fragment:material"],
  bindUniforms: (_value, _item, set) => {
    const w = prd07WetnessState();
    set("u_wetness", w.wetness);
    set("u_puddleThreshold", w.puddleThreshold);
    set("u_rainRipples", w.rainRipples);
    set("u_snowCover", w.snowCover);
    set("u_puddleNoise", new TextureBinding({ name: "u_puddleNoise", texture: w.puddleNoise, required: false }));
  }
};

/** Authenticate the original objects and functions, not their public IDs. */
export const isStockPrd07BloomFeature = stockFeatureVerifier([PRD07_FOG_SHADER_FEATURE, PRD07_WETNESS_SHADER_FEATURE]);
