// PRD-07 P4-T4 — C-02 chunks: "a3d_prd07_fog" and "a3d_prd07_wetness".
// Registered now so programs can `requires` them; the fog uniforms land with
// P4-T5's FOG_PROGRAM_DEFINES material hook-up.

import { registerShaderChunk } from "../contracts/program";

export const FOG_CHUNK_NAME = "a3d_prd07_fog" as const;
export const WETNESS_CHUNK_NAME = "a3d_prd07_wetness" as const;

import { PRD07_FOG_CHUNK_GLSL } from "./shaders/fog.glsl";

// §8.4 uniform-block chunk (u_fogA/u_fogB/u_fogColor/u_fogAbsorption/u_fogMode/
// u_fogNear/u_fogFar/u_fogVolumes + env uniforms u_cameraPosition/u_sunDirection/
// u_sunColor). Packed by HeightFog.packV2; modes 0-6 incl. legacy-parity 6.
const FOG_GLSL = PRD07_FOG_CHUNK_GLSL;

const WETNESS_GLSL = `
// ${WETNESS_CHUNK_NAME} — behind A3D_WETNESS (PRD-07 §8.3).
// Programs sample u_wetness / u_puddleThreshold / u_rainRipples / u_snowCover.
#ifdef A3D_WETNESS
float a3dWetnessFactor(vec3 worldPos, float wetness, float puddleThreshold) {
  return clamp(wetness, 0.0, 1.0) * step(puddleThreshold, 1.0 - abs(worldPos.y) * 0.0 + wetness);
}
#endif
`;

/** Idempotent chunk registration (P1-T1). */
export function registerPrd07Chunks(): void {
  const chunks = [
    { name: FOG_CHUNK_NAME, owner: "prd07" as const, stage: "fragment" as const, glsl: FOG_GLSL },
    { name: WETNESS_CHUNK_NAME, owner: "prd07" as const, stage: "fragment" as const, glsl: WETNESS_GLSL }
  ];
  for (const chunk of chunks) {
    try {
      registerShaderChunk(chunk);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("SHADER_CHUNK_DUPLICATE"))) throw error;
    }
  }
}
