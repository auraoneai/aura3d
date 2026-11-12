/**
 * Aura's Charlie-distribution fabric sheen with numerical hemispherical
 * integration. Its WGSL companion (physical-wgsl/sheen.wgsl.ts) mirrors it.
 * Equations: KHR_materials_sheen; Estevez & Kulla 2017 Charlie D; Neubelt & Pettineo 2013 V (PRD-04 §8).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/sheen.wgsl.js";
import { A3D_SHEEN_ALBEDO_LUT } from "./sheenAlbedoLut.js";

export { A3D_SHEEN_ALBEDO_LUT };

const glsl = /* glsl */ `
void a3dPrd04SheenInit(inout A3DPrd04Lobes lobes, vec3 color, float roughness,
  vec4 colorTex, vec4 roughnessTex) {
  lobes.sheenColor = clamp(color * colorTex.rgb, 0.0, 1.0);
  lobes.sheenRoughness = clamp(roughness * roughnessTex.a, 0.0001, 1.0);
}
// Charlie microfacet distribution, Estevez and Kulla (2017).
float a3dPrd04DCharlie(float roughness, float nDotH) {
  float alpha = max(roughness * roughness, 0.002);
  float inverseAlpha = 1.0 / alpha;
  float nh = saturate(nDotH);
  float oneMinusNh2 = 1.0 - nh * nh;
  if (oneMinusNh2 <= 0.0) return 0.0;
  float sinSquared = max(oneMinusNh2, 0.0078125);
  return min((2.0 + inverseAlpha) * pow(sinSquared, 0.5 * inverseAlpha) / (2.0 * PI), 65504.0);
}
float a3dPrd04VNeubelt(float nDotV, float nDotL) {
  float denominator = 4.0 * (nDotL + nDotV - nDotL * nDotV);
  return min(1.0 / max(denominator, 1e-6), 1.0);
}
vec3 a3dPrd04SheenDirect(vec3 lightDir, vec3 viewDir, vec3 normal, vec3 color, float roughness) {
  float nl = saturate(dot(normal, lightDir)), nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) return vec3(0.0);
  vec3 h = a3dHalfVector(lightDir, viewDir, normal);
  return clamp(color * a3dPrd04DCharlie(roughness, saturate(dot(normal, h))) * a3dPrd04VNeubelt(nv, nl), vec3(0.0), vec3(65504.0));
}
// Bilinear interpolation of the bounded directional albedo preintegration.
const float a3dPrd04SheenAlbedo[256] = float[256](${A3D_SHEEN_ALBEDO_LUT.map((value) => value.toFixed(8)).join(", ")});
float a3dPrd04IBLSheen(float nDotV, float roughness) {
  vec2 position = vec2(saturate(roughness), saturate(nDotV)) * 15.0;
  ivec2 low = ivec2(floor(position));
  ivec2 high = min(low + ivec2(1), ivec2(15));
  vec2 f = fract(position);
  float lower = mix(a3dPrd04SheenAlbedo[low.y * 16 + low.x],
                    a3dPrd04SheenAlbedo[low.y * 16 + high.x], f.x);
  float upper = mix(a3dPrd04SheenAlbedo[high.y * 16 + low.x],
                    a3dPrd04SheenAlbedo[high.y * 16 + high.x], f.x);
  return saturate(mix(lower, upper, f.y));
}
vec3 a3dPrd04SheenIndirect(vec3 normal, vec3 viewDir, float roughness, vec3 color, vec3 irradiance) {
  return irradiance * color * (a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness) * RECIPROCAL_PI);
}
float a3dPrd04SheenEnergyCompensation(vec3 normal, vec3 viewDir, vec3 lightDir, vec3 color, float roughness) {
  float viewAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness);
  float lightAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, lightDir)), roughness);
  return saturate(1.0 - saturate(max3(color)) * max(viewAlbedo, lightAlbedo));
}
float a3dPrd04SheenEnergyCompensationIndirect(vec3 normal, vec3 viewDir, vec3 color, float roughness) {
  return saturate(1.0 - saturate(max3(color)) * a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness));
}
`;

export const A3D_PRD04_SHEEN: ShaderChunk = {
  name: "a3d_prd04_sheen", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
