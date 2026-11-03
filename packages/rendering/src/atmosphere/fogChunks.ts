// PRD-07 P4-T4 — C-02 chunks: "a3d_prd07_fog" and "a3d_prd07_wetness".
// Registered now so programs can `requires` them; the fog uniforms land with
// P4-T5's FOG_PROGRAM_DEFINES material hook-up.

import { registerShaderChunk, type ShaderChunk } from "../contracts/program";
import { stockChunkVerifier } from "../program/FeatureSelect";

export const FOG_CHUNK_NAME = "a3d_prd07_fog" as const;
export const WETNESS_CHUNK_NAME = "a3d_prd07_wetness" as const;
/** #880 / T0-05 call chunks (statements only) for the C-02 body hooks. */
export const FOG_APPLY_CHUNK_NAME = "a3d_prd07_fog_apply" as const;
export const WETNESS_APPLY_CHUNK_NAME = "a3d_prd07_wetness_apply" as const;

import { PRD07_FOG_APPLY_CHUNK_GLSL, PRD07_FOG_CHUNK_GLSL } from "./shaders/fog.glsl";
import { PRD07_WETNESS_APPLY_CHUNK_GLSL, PRD07_WETNESS_CHUNK_GLSL } from "./shaders/wetness.glsl";

// §8.4 uniform-block chunk (u_fogA/u_fogB/u_fogColor/u_fogAbsorption/u_fogMode/
// u_fogNear/u_fogFar/u_fogVolumes + env uniforms u_cameraPosition/u_sunDirection/
// u_sunColor). Packed by HeightFog.packV2; modes 0-6 incl. legacy-parity 6.
const FOG_GLSL = PRD07_FOG_CHUNK_GLSL;

// §6.8 wetness chunk (u_wetness/u_puddleThreshold/u_rainRipples/u_snowCover +
// u_puddleNoise). Real §6.8 formulas live in shaders/wetness.glsl.ts.
const WETNESS_GLSL = PRD07_WETNESS_CHUNK_GLSL;

// Record only objects this module actually registered. A custom chunk already
// occupying the name is not stock, even when its GLSL happens to match.
const registeredStockChunks = new WeakMap<ShaderChunk, (chunk: ShaderChunk) => boolean>();

export function isStockPrd07BloomChunk(chunk: ShaderChunk): boolean {
  return registeredStockChunks.get(chunk)?.(chunk) === true;
}

/** Idempotent chunk registration (P1-T1). */
export function registerPrd07Chunks(): void {
  // Keep the original fresh-object-per-call registration behavior, including
  // when an earlier registry object was subsequently customized.
  const chunks: readonly ShaderChunk[] = [
    { name: FOG_CHUNK_NAME, owner: "prd07", stage: "fragment", glsl: FOG_GLSL },
    { name: WETNESS_CHUNK_NAME, owner: "prd07", stage: "fragment", glsl: WETNESS_GLSL },
    // Pars/call split (#880): the declaration chunks above go to
    // `fragment:pars`; these run inside main() and require them.
    { name: FOG_APPLY_CHUNK_NAME, owner: "prd07", stage: "fragment", glsl: PRD07_FOG_APPLY_CHUNK_GLSL, requires: [FOG_CHUNK_NAME] },
    { name: WETNESS_APPLY_CHUNK_NAME, owner: "prd07", stage: "fragment", glsl: PRD07_WETNESS_APPLY_CHUNK_GLSL, requires: [WETNESS_CHUNK_NAME] }
  ];
  const verify = stockChunkVerifier(chunks);
  for (const chunk of chunks) {
    try {
      registerShaderChunk(chunk);
      registeredStockChunks.set(chunk, verify);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("SHADER_CHUNK_DUPLICATE"))) throw error;
    }
  }
}
