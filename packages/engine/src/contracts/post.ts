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
export interface AuraAutoExposureOptions { readonly minEv?: number; readonly maxEv?: number; readonly speedUp?: number; readonly speedDown?: number; readonly meteringMask?: "center-weighted" | "average"; readonly compensationEv?: number; }
export interface AuraPostPreset { readonly id: AuraPostPresetId; readonly output: AuraOutputOptions; readonly effects: readonly AuraNodeBuilder<AuraEffectNode>[]; readonly emissiveStrengthRange: readonly [number, number]; }

/**
 * The §6.8 cinematic presets — real data lives in `agent-api/postPresets.ts`
 * (`prd03PostPresets`); this re-export is the C-13 stable name. The named
 * re-export resolves after `postPresets.ts` finishes evaluating (ESM live
 * binding), which is safe because `postPresets` is only read at call time.
 */
export { prd03PostPresets as postPresets } from "../agent-api/postPresets.js";

/**
 * threejs-parity SH-03 (§5.0, task B-01): named order slots for custom passes.
 * A number is an absolute order key (sorted ascending); the named slots map to
 * fixed stages of the v2 post graph.
 */
export type AuraPostPassOrder = "before-bloom" | "after-bloom" | "before-tonemap" | "after-tonemap" | number;
export interface AuraCustomPostPass { readonly name: string; readonly insertAt: PostInsertAt; readonly fragment: { readonly glsl: string; readonly wgsl?: string }; readonly uniforms?: Readonly<Record<string, number | readonly number[]>>; readonly inputs?: readonly ("color" | "depth" | "velocity")[];
  /** threejs-parity SH-03: ordering inside the chosen insertAt stage; omitted = registration order (today's behavior). */
  readonly order?: AuraPostPassOrder;
  /** threejs-parity SH-03: `false` keeps the pass registered but skips execution. */
  readonly enabled?: boolean;
}
export interface AuraPostSurface { addPostPass(p: AuraCustomPostPass): () => void; setQualityTier(t: AuraQualityTier | "auto"): void;
  /** SH-03: mutate one numeric uniform of a registered custom pass by name; staged onto the live descriptor — no re-registration or shader rebuild. Optional on stub surfaces. */
  setPassUniform?(passName: string, key: string, value: number | readonly number[]): void;
  /**
   * GU47 E-C: patch one post effect at runtime — `bloom`, `colorGrade`, `depthOfField`, `motionBlur`,
   * `chromaticAberration`, `volumetricFog` or `vignette` (the factory name; the effect id such as
   * `"color-grade"` works too). `patch` keys are the effect's node fields (`app.post.setEffect("bloom",
   * { intensity: 1.4 })`); later calls merge over earlier ones. Applied on the next frame, no scene
   * rebuild. An effect the scene does not declare is added with the patch over its defaults. Unknown
   * names, fields or non-finite values throw `AuraRuntimeError("POST_FIELD_UNSUPPORTED")`.
   */
  setEffect(name: string, patch: Record<string, number | string | boolean | number[]>): void;
  /** GU47 E-C: switch one of the `setEffect` effects off (dropped from the chain) or back on (authored node plus patches, or the defaults when the scene declares none). Next frame, no scene rebuild. */
  setEffectEnabled(name: string, enabled: boolean): void;
}
export interface AuraPostDiagnostics { readonly tier: AuraQualityTier; readonly antiAlias: AuraAntiAliasMode; readonly renderPixels: number; readonly pixelRatio: number; readonly renderScale: number; readonly stages: PostGraphReport["stages"]; readonly skipped: PostGraphReport["skipped"]; readonly velocityCoverage: { readonly items: number; readonly withVelocity: number }; }
// effects factories (bloom, ambientOcclusion, antiAlias, colorGrade, vignette, filmGrain, chromaticAberration, depthOfField, motionBlur): field lists frozen in PRD 03 §APIs; unknown fields throw AuraRuntimeError("POST_FIELD_UNSUPPORTED") before first frame when A3D_QR_POST is on, warn (option-ignored) when off.

/** PR 0a stub surface: addPostPass maps to registerPostPass; setQualityTier records. */
export class StubPostSurface implements AuraPostSurface {
  addPostPass(p: AuraCustomPostPass): () => void {
    return () => { /* pass release on the stub chain is a no-op */ void p; };
  }
  setQualityTier(_t: AuraQualityTier | "auto"): void { /* recorded; the legacy chain does not retier */ }
  setEffect(_name: string, _patch: Record<string, number | string | boolean | number[]>): void { /* the stub chain has no runtime post control */ }
  setEffectEnabled(_name: string, _enabled: boolean): void { /* the stub chain has no runtime post control */ }
}
