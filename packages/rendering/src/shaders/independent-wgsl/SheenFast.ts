/**
 * Aura-authored separable sheen approximation for the opt-in generated WebGPU
 * preview. This is a different BRDF from the Charlie/Neubelt candidate in
 * Sheen.ts, not a claim of glTF sheen model or visual parity. No shader source,
 * lookup data, or fitted samples from another engine are used.
 * The host's sheen color and roughness inputs follow Khronos
 * KHR_materials_sheen, including decoded color RGB and roughness alpha:
 * https://github.com/KhronosGroup/glTF/blob/59ecbdba704206bb656965ab4e202881806066f1/extensions/2.0/Khronos/KHR_materials_sheen/README.md
 * The response below is independently derived and is not specified there.
 *
 * For perceptual roughness r in [0,1], set p=1+7(1-r)² and k=r²/8. The
 * choices give a narrower grazing response for smooth surfaces and a small
 * normal-view response for rough ones; they are not fit to a measured cloth.
 * For a hemisphere direction with cosine μ define
 *
 *   w(μ) = k + (1-k)(1-μ)^p
 *   I = integral_0^1 w(μ) μ dμ = k/2 + (1-k)/((p+1)(p+2))
 *   f(V,L) = 0.98 * color * w(N·V) * w(N·L) / (2πI)
 *
 * f is nonnegative and reciprocal, and its directional hemispherical
 * reflectance is exactly 0.98 * color * w(N·V) in real arithmetic. To layer
 * over any reciprocal energy-bounded substrate, multiply each direct light's
 * substrate BRDF by 1 - 0.98 * max(color) * max(w(N·V), w(N·L)). This is
 * symmetric and never greater than the view-side residual energy. The sheen
 * contribution and attenuated substrate therefore have directional energy
 * at most one. For a uniform environment, use irradiance/π times the exact
 * directional albedo, with view-side compensation for the substrate.
 *
 * For validated finite inputs the shader uses no textures, loops, division by
 * zero, or trig; one pow per view and one per direct light suffice when the
 * caller caches parameters and the view weight. The constant 0.98 leaves a 2%
 * real-arithmetic reserve; it is not an established f32 error bound. The
 * renderer preview accepts sheen together with other layered lobes and with
 * nonuniform environment, probe, volume and lightmap sources: for nonuniform
 * sources it applies the exact uniform-light albedo to the substrate's
 * cosine-weighted irradiance (occluded like the substrate), an approximation
 * because irradiance alone cannot resolve this BRDF's directional response.
 * WGSL compilation, GPU precision, timing and visual appearance are validated
 * only by the browser/GPU acceptance runs.
 */
export const A3D_PRD04_SHEEN_FAST_WGSL = /* wgsl */ `
fn a3dFastSheenExponent(roughness: f32) -> f32 {
  let r = clamp(roughness, 0.0, 1.0);
  let smoothness = 1.0 - r;
  return 1.0 + 7.0 * smoothness * smoothness;
}

fn a3dFastSheenOffset(roughness: f32) -> f32 {
  let r = clamp(roughness, 0.0, 1.0);
  return r * r / 8.0;
}

fn a3dFastSheenShape(cosine: f32, exponent: f32, offset: f32) -> f32 {
  let mu = clamp(cosine, 0.0, 1.0);
  let p = clamp(exponent, 1.0, 8.0);
  let k = clamp(offset, 0.0, 0.125);
  return k + (1.0 - k) * pow(1.0 - mu, p);
}

fn a3dFastSheenNormalization(exponent: f32, offset: f32) -> f32 {
  let p = clamp(exponent, 1.0, 8.0);
  let k = clamp(offset, 0.0, 0.125);
  let integral = k * 0.5 + (1.0 - k) / ((p + 1.0) * (p + 2.0));
  return 0.98 / (2.0 * 3.141592653589793 * integral);
}

fn a3dFastSheenDirect(viewWeight: f32, lightWeight: f32, normalization: f32) -> f32 {
  return clamp(viewWeight, 0.0, 1.0) * clamp(lightWeight, 0.0, 1.0) * normalization;
}

fn a3dFastSheenCompensation(viewWeight: f32, lightWeight: f32, intensity: f32) -> f32 {
  let largestWeight = max(clamp(viewWeight, 0.0, 1.0), clamp(lightWeight, 0.0, 1.0));
  return 1.0 - 0.98 * clamp(intensity, 0.0, 1.0) * largestWeight;
}

fn a3dFastSheenAlbedo(viewWeight: f32) -> f32 {
  return 0.98 * clamp(viewWeight, 0.0, 1.0);
}
`;

export default A3D_PRD04_SHEEN_FAST_WGSL;
