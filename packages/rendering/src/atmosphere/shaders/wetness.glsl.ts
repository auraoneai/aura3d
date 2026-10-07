// PRD-07 P5-T5 — `a3d_prd07_wetness` chunk (§6.8, C-21 WETNESS_CHUNK).
// Guarded by #define A3D_WETNESS (the prd07.wetness ShaderFeature emits it
// when selected). Uniforms are global: u_wetness, u_puddleThreshold,
// u_rainRipples (atlas frame), u_snowCover; the puddle mask is world-space
// tiled noise thresholded by wet. While the C-02 program generator is a
// stub the chunk is registered but never spliced — WETNESS_PENDING reports
// once via noteWetnessPending().

import type { Texture } from "../../Texture";

export const PRD07_WETNESS_CHUNK_GLSL = `
// a3d_prd07_wetness — §6.8 wet-look material response.
#ifdef A3D_WETNESS
#ifndef A3D_PRD07_WETNESS_CHUNK
#define A3D_PRD07_WETNESS_CHUNK
uniform float u_wetness;          // global wetness [0,1] (AtmosphereWetness)
uniform float u_puddleThreshold;  // noise threshold for puddles
uniform float u_rainRipples;      // ripple flipbook frame; 0 = off
uniform float u_snowCover;        // snow cover [0,1]
uniform sampler2D u_puddleNoise;  // world-space tiled noise (u puddleNoise)

// World-space puddle mask: tiled noise at worldPos.xz / 6 thresholded by wet.
float a3dWetnessPuddle(vec3 worldPos, float wet) {
  float n = texture(u_puddleNoise, worldPos.xz / 6.0).r;
  return smoothstep(u_puddleThreshold, 1.0, n) * wet;
}

// §6.8: albedo *= mix(1, 0.55, wet·porosity); snow cover → snow white.
vec3 a3dWetnessAlbedo(vec3 albedo, float porosity) {
  float wet = clamp(u_wetness, 0.0, 1.0);
  vec3 a = albedo * mix(1.0, 0.55, wet * clamp(porosity, 0.0, 1.0));
  return mix(a, vec3(0.95, 0.96, 1.0), clamp(u_snowCover, 0.0, 1.0));
}

// §6.8: roughness = mix(roughness, 0.06, wet·puddle); snow cover → 0.9.
float a3dWetnessRoughness(float roughness, vec3 worldPos) {
  float wet = clamp(u_wetness, 0.0, 1.0);
  float puddle = a3dWetnessPuddle(worldPos, wet);
  float r = mix(roughness, 0.06, clamp(wet * puddle, 0.0, 1.0));
  return mix(r, 0.9, clamp(u_snowCover, 0.0, 1.0));
}
#endif // A3D_PRD07_WETNESS_CHUNK
#endif // A3D_WETNESS
`;

export const PRD07_WETNESS_CHUNK_NAME = "a3d_prd07_wetness";

/* ------------------------------------------------------------------ *
 * Global wetness state — driven by the engine (`atmosphere.setWetness`,
 * WeatherVolume). bindUniforms on the prd07.wetness feature reads this
 * store; the CPU mirror below is the vitest oracle for the GLSL math.
 * ------------------------------------------------------------------ */

export interface WetnessUniformState {
  readonly wetness: number;
  readonly puddleThreshold: number;
  readonly rainRipples: number;
  readonly snowCover: number;
  readonly puddleNoise: Texture | null;
}

let wetnessState: WetnessUniformState = {
  wetness: 0,
  puddleThreshold: 0.62,
  rainRipples: 0,
  snowCover: 0,
  puddleNoise: null
};

let wetnessPendingNoted = false;

/** Called when the wetness feature selected but couldn't splice (stub gen). */
export function noteWetnessPending(): string | null {
  if (wetnessPendingNoted) return null;
  wetnessPendingNoted = true;
  return "WETNESS_PENDING";
}

/** Test hook. */
export function resetWetnessPending(): void {
  wetnessPendingNoted = false;
}

export function setPrd07WetnessState(state: Partial<WetnessUniformState>): void {
  wetnessState = { ...wetnessState, ...state };
}

export function prd07WetnessState(): WetnessUniformState {
  return wetnessState;
}

/**
 * CPU mirror of the §6.8 response (noise-free: `puddle` supplied directly).
 * albedo *= mix(1, 0.55, wet·porosity); roughness = mix(r, 0.06, wet·puddle);
 * snow cover mixes albedo → snow white and roughness → 0.9.
 */
export function applyWetnessMaterialCpu(
  albedo: readonly [number, number, number],
  roughness: number,
  wet: number,
  porosity: number,
  puddle: number,
  snowCover = 0
): { readonly albedo: readonly [number, number, number]; readonly roughness: number } {
  const w = Math.min(1, Math.max(0, wet));
  const por = Math.min(1, Math.max(0, porosity));
  const snow = Math.min(1, Math.max(0, snowCover));
  const wetFactor = 1 + (0.55 - 1) * w * por;
  const wetRough = roughness + (0.06 - roughness) * Math.min(1, Math.max(0, w * puddle));
  const a = albedo.map((c) => c * wetFactor);
  const snowed = a.map((c, i) => c + (([0.95, 0.96, 1.0] as const)[i]! - c) * snow);
  return {
    albedo: [snowed[0]!, snowed[1]!, snowed[2]!],
    roughness: wetRough + (0.9 - wetRough) * snow
  };
}
