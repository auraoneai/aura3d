// PRD-07 P4-T4 — C-02 chunks: "a3d_prd07_fog" and "a3d_prd07_wetness".
// Registered now so programs can `requires` them; the fog uniforms land with
// P4-T5's FOG_PROGRAM_DEFINES material hook-up.

import { registerShaderChunk } from "../contracts/program";

export const FOG_CHUNK_NAME = "a3d_prd07_fog" as const;
export const WETNESS_CHUNK_NAME = "a3d_prd07_wetness" as const;

const FOG_GLSL = `
// ${FOG_CHUNK_NAME} — analytic height/absorption fog (PRD-07 §8.2).
// Uniform block lives in program code (u_fogDensity, u_fogColor, ...); these
// functions take their parameters explicitly so any stage can consume them.
float a3dHeightFogTau(float h0, float h1, float density, float falloff, float hRef) {
  float t = exp(-falloff * (h0 - hRef));
  float dh = (h1 - h0) == 0.0 ? 1e-6 : (h1 - h0);
  return density * (h1 - h0) * t * ((exp(-falloff * dh) - 1.0) / (-falloff * dh));
}
float a3dFogAmount(vec3 worldPos, vec3 camPos, float sigmaD, float sigmaH, float falloff, float hRef, float start) {
  float dist = distance(worldPos, camPos) - start;
  if (dist <= 0.0) return 0.0;
  float h0 = camPos.y;
  float h1 = worldPos.y;
  float tau = abs(h1 - h0) < 1e-3 ? sigmaH * dist : a3dHeightFogTau(h0, h1, sigmaH, falloff, hRef);
  tau += sigmaD * dist;
  return clamp(1.0 - exp(-tau), 0.0, 1.0);
}
vec3 a3dApplyFog(vec3 color, vec3 worldPos, vec3 camPos, vec3 fogColor, float sigmaD, float sigmaH, float falloff, float hRef, float start) {
  float a = a3dFogAmount(worldPos, camPos, sigmaD, sigmaH, falloff, hRef, start);
  return mix(color, fogColor, a);
}
`;

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
