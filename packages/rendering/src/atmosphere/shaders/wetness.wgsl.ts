// S5-DEF-02 — native WGSL form of the PRD-07 §6.8 wet-look response
// (`a3d_prd07_wetness`). The generated WebGPU PBR program includes this chunk
// only when the stock `prd07.wetness` feature is selected. The four scalar
// uniforms of the GLSL chunk arrive packed in `material.wetness`:
//   x = u_wetness, y = u_puddleThreshold, z = u_rainRipples, w = u_snowCover.
// The GLSL chunk declares u_rainRipples but does not read it; neither does this.
//
// Puddle noise: the frame-scoped 5.0 wetness packet never carries a noise
// texture (`PRD07_PUDDLE_TEXTURE_UNVERIFIED`), and the WebGL2 device samples its
// white 1x1 fallback when `u_puddleNoise` is unbound. The native program has no
// noise binding and uses that same neutral value, 1.0. A caller-supplied noise
// texture is rejected when the material is packed (never silently ignored).
//
// Status: experimental. Source and CPU-reference parity only; no real-GPU
// pixel evidence yet.

import type { WetnessUniformState } from "./wetness.glsl";

/** Noise value used by the native path, equal to the WebGL2 white fallback texel. */
export const PRD07_NATIVE_PUDDLE_NOISE = 1;

export const PRD07_WETNESS_WGSL = `
// a3d_prd07_wetness (WGSL) — §6.8 wet-look material response.
const A3D_WET_DARKEN: f32 = 0.55;
const A3D_WET_PUDDLE_ROUGHNESS: f32 = 0.06;
const A3D_SNOW_ALBEDO: vec3f = vec3f(0.95, 0.96, 1.0);
const A3D_SNOW_ROUGHNESS: f32 = 0.9;
const A3D_WET_NEUTRAL_NOISE: f32 = ${PRD07_NATIVE_PUDDLE_NOISE.toFixed(1)};

// Puddle mask: noise thresholded by wet. A noise value at or above the upper
// edge is fully inside a puddle; this also defines the threshold == 1 edge.
fn a3dWetPuddle(noise: f32, threshold: f32, wet: f32) -> f32 {
  if (noise >= 1.0) { return wet; }
  return smoothstep(threshold, 1.0, noise) * wet;
}

// albedo *= mix(1, 0.55, wet * porosity); snow cover mixes toward snow white.
fn a3dWetAlbedo(albedo: vec3f, porosity: f32) -> vec3f {
  let wet = clamp(material.wetness.x, 0.0, 1.0);
  let darkened = albedo * mix(1.0, A3D_WET_DARKEN, wet * clamp(porosity, 0.0, 1.0));
  return mix(darkened, A3D_SNOW_ALBEDO, clamp(material.wetness.w, 0.0, 1.0));
}

// roughness = mix(roughness, 0.06, wet * puddle); snow cover mixes toward 0.9.
fn a3dWetRoughness(roughness: f32) -> f32 {
  let wet = clamp(material.wetness.x, 0.0, 1.0);
  let puddle = a3dWetPuddle(A3D_WET_NEUTRAL_NOISE, material.wetness.y, wet);
  let rough = mix(roughness, A3D_WET_PUDDLE_ROUGHNESS, clamp(wet * puddle, 0.0, 1.0));
  return mix(rough, A3D_SNOW_ROUGHNESS, clamp(material.wetness.w, 0.0, 1.0));
}
`;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** CPU mirror of `a3dWetPuddle`. */
export function nativeWetnessPuddleCpu(noise: number, threshold: number, wet: number): number {
  if (noise >= 1) return wet;
  const t = clamp01((noise - threshold) / (1 - threshold));
  return t * t * (3 - 2 * t) * wet;
}

/**
 * CPU mirror of the native WGSL response for one surface, including the
 * generated program's final [0.0525, 1] roughness clamp. `roughness` is the
 * already clamped dry roughness. Porosity is 1, as in the GLSL apply chunk.
 */
export function applyNativeWetnessMaterialCpu(
  albedo: readonly [number, number, number],
  roughness: number,
  state: Pick<WetnessUniformState, "wetness" | "puddleThreshold" | "snowCover">
): { readonly albedo: readonly [number, number, number]; readonly roughness: number } {
  const wet = clamp01(state.wetness);
  const snow = clamp01(state.snowCover);
  const factor = 1 + (0.55 - 1) * wet;
  const snowColor = [0.95, 0.96, 1.0] as const;
  const out = albedo.map((channel, index) => {
    const darkened = Math.max(channel, 0) * factor;
    return darkened + (snowColor[index]! - darkened) * snow;
  });
  const puddle = nativeWetnessPuddleCpu(PRD07_NATIVE_PUDDLE_NOISE, state.puddleThreshold, wet);
  const rough = roughness + (0.06 - roughness) * clamp01(wet * puddle);
  return {
    albedo: [out[0]!, out[1]!, out[2]!],
    roughness: Math.min(1, Math.max(0.0525, rough + (0.9 - rough) * snow))
  };
}
