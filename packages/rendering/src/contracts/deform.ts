/**
 * C-18 — deform hook point (CONTRACTS.md). Provider: PRD 06. Flag: A3D_QR_ANIMATION.
 */

import type { ProgramFeatures } from "./program";
import type { Texture } from "../Texture";

export interface SkinningPaletteBinding { readonly kind: "palette" | "skeleton" | "uniforms"; readonly mode: "rgba32f-texture" | "rgba16f-texture" | "mat4-uniforms" | "mat3x4-uniforms"; readonly texture?: Texture; readonly matrices?: Float32Array; readonly boneCount: number; }
export interface DeformVertexContext { readonly item: import("./renderItem").RenderItem; readonly features: ProgramFeatures; }
export interface MorphTargetTexture { readonly texture: Texture; readonly width: number; readonly height: number; rowOf(vertex: number, target: number): number; }
export interface SkinningDeformer { readonly mode: "linear" | "dual-quat"; paletteFor(item: import("./renderItem").RenderItem): SkinningPaletteBinding; }
export const DEFORM_CHUNKS: Readonly<Record<"skinning" | "morph" | "instance", string>> = { skinning: "a3d_prd06_skinning", morph: "a3d_prd06_morph", instance: "a3d_prd01_instance" };
/** C-02 feature id PRD 06 registers: "prd06.deform". `vertexPars` + `vertex` chunks are owner-scoped. */
export const deformFeatureId: "prd06.deform" = "prd06.deform";

/**
 * PR 0a stub: returns {fallback:"cpu", reason:"PRD06_PENDING"} — morphs keep
 * running on the CPU path exactly as today (agent-api/index.ts skinningTexture is untouched).
 */
export function buildMorphTargetTexture(item: import("./renderItem").RenderItem): MorphTargetTexture | { readonly fallback: "cpu"; readonly reason: string } {
  return { fallback: "cpu", reason: "PRD06_PENDING" };
}
