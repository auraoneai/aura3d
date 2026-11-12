/**
 * WGSL companion of Aura's `a3d_prd04_sheen` chunk
 * (shaders/physical/sheen.glsl.ts), kept operation-for-operation equal to it
 * and written from the published model:
 *
 * - KHR_materials_sheen (Khronos glTF 2.0 extension): sheen color from the RGB
 *   channels and sheen roughness from the A channel of their textures, and the
 *   albedo-scaling layer f = f_sheen + (1 - max(sheenColor) * E(mu)) * f_base.
 * - Charlie distribution D(h) = (2 + 1/alpha) sin(theta_h)^(1/alpha) / (2 pi),
 *   alpha = roughness^2 (Estevez & Kulla, "Production Friendly Microfacet
 *   Sheen BRDF", SIGGRAPH 2017, eq. 2).
 * - Neubelt visibility V = 1 / (4 (N.L + N.V - N.L N.V)) (Neubelt & Pettineo,
 *   "Crafting a Next-Gen Material Pipeline for The Order: 1886", SIGGRAPH 2013),
 *   bounded to one.
 * - Directional albedo E(mu, roughness): Aura's own preintegrated table
 *   (sheenAlbedoLut.ts, the same data the GLSL chunk embeds), read with
 *   bilinear interpolation over a 16 x 16 grid of (roughness, N.V).
 *
 * Requires `brdf` (PI, RECIPROCAL_PI, max3) and `a3d_prd04_bsdf_lobes_common`.
 */
import { A3D_SHEEN_ALBEDO_LUT } from "../physical/sheenAlbedoLut.js";

const wgsl = /* wgsl */ `
fn a3dPrd04SheenInit(lobes: ptr<function, A3DPrd04Lobes>, color: vec3f, roughness: f32,
  colorTex: vec4f, roughnessTex: vec4f) {
  (*lobes).sheenColor = clamp(color * colorTex.rgb, vec3f(0.0), vec3f(1.0));
  (*lobes).sheenRoughness = clamp(roughness * roughnessTex.a, 0.0001, 1.0);
}

fn a3dPrd04DCharlie(roughness: f32, nDotH: f32) -> f32 {
  let alpha = max(roughness * roughness, 0.002);
  let inverseAlpha = 1.0 / alpha;
  let nh = saturate(nDotH);
  let oneMinusNh2 = 1.0 - nh * nh;
  if (oneMinusNh2 <= 0.0) {
    return 0.0;
  }
  let sinSquared = max(oneMinusNh2, 0.0078125);
  return min((2.0 + inverseAlpha) * pow(sinSquared, 0.5 * inverseAlpha) / (2.0 * PI), 65504.0);
}

fn a3dPrd04VNeubelt(nDotV: f32, nDotL: f32) -> f32 {
  let denominator = 4.0 * (nDotL + nDotV - nDotL * nDotV);
  return min(1.0 / max(denominator, 1e-6), 1.0);
}

fn a3dPrd04SheenDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, color: vec3f, roughness: f32) -> vec3f {
  let nl = saturate(dot(normal, lightDir));
  let nv = saturate(dot(normal, viewDir));
  if (nl <= 0.0 || nv <= 0.0) {
    return vec3f(0.0);
  }
  let h = a3dPrd04HalfVector(lightDir, viewDir, normal);
  return clamp(color * a3dPrd04DCharlie(roughness, saturate(dot(normal, h))) * a3dPrd04VNeubelt(nv, nl), vec3f(0.0), vec3f(65504.0));
}

const a3dPrd04SheenAlbedo = array<f32, 256>(${A3D_SHEEN_ALBEDO_LUT.map((value) => value.toFixed(8)).join(", ")});

fn a3dPrd04IBLSheen(nDotV: f32, roughness: f32) -> f32 {
  let position = vec2f(saturate(roughness), saturate(nDotV)) * 15.0;
  let low = vec2i(floor(position));
  let high = min(low + vec2i(1), vec2i(15));
  let f = fract(position);
  let lower = mix(a3dPrd04SheenAlbedo[low.y * 16 + low.x], a3dPrd04SheenAlbedo[low.y * 16 + high.x], f.x);
  let upper = mix(a3dPrd04SheenAlbedo[high.y * 16 + low.x], a3dPrd04SheenAlbedo[high.y * 16 + high.x], f.x);
  return saturate(mix(lower, upper, f.y));
}

fn a3dPrd04SheenIndirect(normal: vec3f, viewDir: vec3f, roughness: f32, color: vec3f, irradiance: vec3f) -> vec3f {
  return irradiance * color * (a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness) * RECIPROCAL_PI);
}

fn a3dPrd04SheenEnergyCompensation(normal: vec3f, viewDir: vec3f, lightDir: vec3f, color: vec3f, roughness: f32) -> f32 {
  let viewAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness);
  let lightAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, lightDir)), roughness);
  return saturate(1.0 - saturate(max3(color)) * max(viewAlbedo, lightAlbedo));
}

fn a3dPrd04SheenEnergyCompensationIndirect(normal: vec3f, viewDir: vec3f, color: vec3f, roughness: f32) -> f32 {
  return saturate(1.0 - saturate(max3(color)) * a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), roughness));
}
`;

export const A3D_PRD04_SHEEN_WGSL = wgsl;
export default wgsl;
