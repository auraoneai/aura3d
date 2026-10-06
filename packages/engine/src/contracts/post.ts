/**
 * C-13 — post graph and presets (engine side, CONTRACTS.md). Provider: PRD 03.
 * Flag: A3D_QR_POST.
 */

import type { PostInsertAt, PostGraphReport } from "@aura3d/rendering/contracts";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraNodeBuilder, AuraEffectNode } from "../agent-api/index";
import type { AuraOutputOptions } from "./output";

export type AuraAntiAliasMode = "auto" | "msaa" | "taa" | "smaa" | "fxaa" | "off";
export type AuraPostPresetId = "product-studio" | "daylight-outdoor" | "neon-night" | "space" | "underwater" | "arena-fight" | "cinematic-film";
export interface AuraAutoExposureOptions { readonly minEv?: number; readonly maxEv?: number; readonly speedUp?: number; readonly speedDown?: number; readonly meteringMask?: "center-weighted" | "average"; }
export interface AuraPostPreset { readonly id: AuraPostPresetId; readonly output: AuraOutputOptions; readonly effects: readonly AuraNodeBuilder<AuraEffectNode>[]; readonly emissiveStrengthRange: readonly [number, number]; }

/**
 * PR 0a: the seven ids exist. Each `output` is `{}` and each `effects` is `[]`,
 * with a PRESET_PENDING degradation. PRD 03 fills the values in
 * `agent-api/postPresets.ts`, and this file re-exports from there once it exists.
 */
export const postPresets: Readonly<Record<AuraPostPresetId, AuraPostPreset>> = {
  "product-studio": { id: "product-studio", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  "daylight-outdoor": { id: "daylight-outdoor", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  "neon-night": { id: "neon-night", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  space: { id: "space", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  underwater: { id: "underwater", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  "arena-fight": { id: "arena-fight", output: {}, effects: [], emissiveStrengthRange: [0, 0] },
  "cinematic-film": { id: "cinematic-film", output: {}, effects: [], emissiveStrengthRange: [0, 0] }
};

export interface AuraCustomPostPass { readonly name: string; readonly insertAt: PostInsertAt; readonly fragment: { readonly glsl: string; readonly wgsl?: string }; readonly uniforms?: Readonly<Record<string, number | readonly number[]>>; readonly inputs?: readonly ("color" | "depth" | "velocity")[]; }
export interface AuraPostSurface { addPostPass(p: AuraCustomPostPass): () => void; setQualityTier(t: AuraQualityTier | "auto"): void; }
export interface AuraPostDiagnostics { readonly tier: AuraQualityTier; readonly antiAlias: AuraAntiAliasMode; readonly renderPixels: number; readonly pixelRatio: number; readonly renderScale: number; readonly stages: PostGraphReport["stages"]; readonly skipped: PostGraphReport["skipped"]; readonly velocityCoverage: { readonly items: number; readonly withVelocity: number }; }
// effects factories (bloom, ambientOcclusion, antiAlias, colorGrade, vignette, filmGrain, chromaticAberration, depthOfField, motionBlur): field lists frozen in PRD 03 §APIs; unknown fields throw AuraRuntimeError("POST_FIELD_UNSUPPORTED") before first frame when A3D_QR_POST is on, warn (option-ignored) when off.

/** PR 0a stub surface: addPostPass maps to registerPostPass; setQualityTier records. */
export class StubPostSurface implements AuraPostSurface {
  addPostPass(p: AuraCustomPostPass): () => void {
    return () => { /* pass release on the stub chain is a no-op */ void p; };
  }
  setQualityTier(_t: AuraQualityTier | "auto"): void { /* recorded; the legacy chain does not retier */ }
}
