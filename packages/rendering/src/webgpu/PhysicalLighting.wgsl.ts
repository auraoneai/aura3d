/**
 * Native WebGPU physical-lighting library. The embedding shader supplies
 * normalized directions and independently integrated DFG samples; it owns all
 * texture and uniform bindings. Inputs and outputs use linear-light values.
 *
 * This is a shader library, not a render pipeline: callers must compose it in
 * their shader and bind the material parameters and LUT before using it.
 */
export const PHYSICAL_LIGHTING_WGSL = /* wgsl */ `
const A3D_PHYSICAL_PI: f32 = 3.141592653589793;
struct AuraPhysicalMaterial {
  baseColor: vec3f,
  metalness: f32,
  roughness: f32,
  ior: f32,
  specularIntensity: f32,
  specularColorFactor: vec3f,
  diffuseRoughness: f32,
  retroreflection: f32,
};
struct AuraPhysicalLightResult {
  diffuse: vec3f,
  specular: vec3f,
};

fn a3dPhysicalPow5(x: f32) -> f32 {
  let x2 = x * x;
  return x2 * x2 * x;
}
fn a3dPhysicalFresnel(f0: vec3f, f90: f32, cosTheta: f32) -> vec3f {
  return f0 + (vec3f(f90) - f0) * a3dPhysicalPow5(1.0 - clamp(cosTheta, 0.0, 1.0));
}
fn a3dPhysicalDggx(alpha: f32, nDotH: f32) -> f32 {
  let a = max(alpha, 0.0001);
  let c = clamp(nDotH, 0.0, 1.0);
  let denominator = 1.0 + c * c * (a * a - 1.0);
  return a * a / (A3D_PHYSICAL_PI * max(denominator * denominator, 1e-12));
}
fn a3dPhysicalVisibility(alpha: f32, nDotL: f32, nDotV: f32) -> f32 {
  let a2 = max(alpha * alpha, 1e-8);
  let nl = clamp(nDotL, 0.0, 1.0);
  let nv = clamp(nDotV, 0.0, 1.0);
  let lambdaV = nl * sqrt(a2 + (1.0 - a2) * nv * nv);
  let lambdaL = nv * sqrt(a2 + (1.0 - a2) * nl * nl);
  return 0.5 / max(lambdaV + lambdaL, 1e-6);
}
fn a3dPhysicalRoughDiffuse(n: vec3f, v: vec3f, l: vec3f, roughness: f32, retroreflection: f32) -> f32 {
  let nl = clamp(dot(n, l), 0.0, 1.0);
  let nv = clamp(dot(n, v), 0.0, 1.0);
  let sinL = sqrt(max(1.0 - nl * nl, 0.0));
  let sinV = sqrt(max(1.0 - nv * nv, 0.0));
  var tangentAlignment = 0.0;
  if (sinL * sinV > 1e-6) {
    tangentAlignment = max(dot(l - n * nl, v - n * nv) / (sinL * sinV), 0.0);
  }
  let sigma = clamp(roughness, 0.0, 1.0) * (0.5 * A3D_PHYSICAL_PI);
  let sigma2 = sigma * sigma;
  let a = 1.0 - 0.5 * sigma2 / (sigma2 + 0.33);
  let b = 0.45 * sigma2 / (sigma2 + 0.09);
  let sinAlpha = max(sinL, sinV);
  let tanBeta = min(sinL, sinV) / max(max(nl, nv), 1e-6);
  let diffuse = clamp(a + b * tangentAlignment * sinAlpha * tanBeta, 0.0, 1.0);
  let alignment = pow(clamp(dot(l, v), 0.0, 1.0), 8.0);
  return diffuse * (1.0 - clamp(retroreflection, 0.0, 1.0) * (1.0 - alignment));
}
fn a3dPhysicalDirect(
  n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, material: AuraPhysicalMaterial,
  viewDfg: vec2f, lightDfg: vec2f
) -> AuraPhysicalLightResult {
  let nl = clamp(dot(n, l), 0.0, 1.0);
  let nv = clamp(dot(n, v), 0.0, 1.0);
  var result: AuraPhysicalLightResult;
  result.diffuse = vec3f(0.0);
  result.specular = vec3f(0.0);
  if (nl <= 0.0 || nv <= 0.0) { return result; }
  let halfSum = l + v;
  var h = n;
  if (dot(halfSum, halfSum) > 1e-6) { h = normalize(halfSum); }
  let metalness = clamp(material.metalness, 0.0, 1.0);
  let ior = max(material.ior, 0.0001);
  let dielectric = (ior - 1.0) / (ior + 1.0);
  let f0Dielectric = clamp(dielectric * dielectric * max(material.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(material.specularIntensity, 0.0, 1.0);
  let base = max(material.baseColor, vec3f(0.0));
  let f0 = mix(f0Dielectric, min(base, vec3f(1.0)), metalness);
  let f90 = mix(clamp(material.specularIntensity, 0.0, 1.0), 1.0, metalness);
  let available = vec3f(1.0) - clamp(max(a3dPhysicalFresnel(f0, f90, nv), a3dPhysicalFresnel(f0, f90, nl)), vec3f(0.0), vec3f(1.0));
  let rough = clamp(material.roughness, 0.0525, 1.0);
  let alpha = rough * rough;
  let fresnel = a3dPhysicalFresnel(f0, f90, dot(v, h));
  let single = fresnel * a3dPhysicalDggx(alpha, dot(n, h)) * a3dPhysicalVisibility(alpha, nl, nv);
  let missingV = 1.0 - clamp(viewDfg.x + viewDfg.y, 0.0, 1.0);
  let missingL = 1.0 - clamp(lightDfg.x + lightDfg.y, 0.0, 1.0);
  let meanFresnel = clamp(f0 + (vec3f(f90) - f0) / 21.0, vec3f(0.0), vec3f(1.0));
  let irradiance = max(radiance, vec3f(0.0)) * nl;
  result.diffuse = irradiance * min(base, vec3f(1.0)) * (1.0 - metalness) * available
    * (a3dPhysicalRoughDiffuse(n, v, l, material.diffuseRoughness, material.retroreflection) / A3D_PHYSICAL_PI);
  result.specular = irradiance * (single + meanFresnel * (missingV * missingL / A3D_PHYSICAL_PI));
  return result;
}
fn a3dPhysicalIndirect(
  nDotV: f32, radiance: vec3f, irradiance: vec3f, material: AuraPhysicalMaterial, dfg: vec2f
) -> AuraPhysicalLightResult {
  let metalness = clamp(material.metalness, 0.0, 1.0);
  let ior = max(material.ior, 0.0001);
  let dielectric = (ior - 1.0) / (ior + 1.0);
  let f0Dielectric = clamp(dielectric * dielectric * max(material.specularColorFactor, vec3f(0.0)), vec3f(0.0), vec3f(1.0)) * clamp(material.specularIntensity, 0.0, 1.0);
  let base = clamp(material.baseColor, vec3f(0.0), vec3f(1.0));
  let f0 = mix(f0Dielectric, base, metalness);
  let f90 = mix(clamp(material.specularIntensity, 0.0, 1.0), 1.0, metalness);
  let lut = clamp(dfg, vec2f(0.0), vec2f(1.0));
  let missing = 1.0 - clamp(lut.x + lut.y, 0.0, 1.0);
  let single = clamp(f0 * lut.x + vec3f(f90 * lut.y), vec3f(0.0), vec3f(1.0));
  let average = clamp(f0 + (vec3f(f90) - f0) / 21.0, vec3f(0.0), vec3f(1.0));
  let multiple = min(vec3f(1.0) - single, missing * average);
  let dielectricSingle = clamp(f0Dielectric * lut.x + vec3f(f90 * lut.y), vec3f(0.0), vec3f(1.0));
  let dielectricAverage = clamp(f0Dielectric + (vec3f(f90) - f0Dielectric) / 21.0, vec3f(0.0), vec3f(1.0));
  let dielectricMultiple = min(vec3f(1.0) - dielectricSingle, missing * dielectricAverage);
  var result: AuraPhysicalLightResult;
  result.specular = max(radiance, vec3f(0.0)) * single + max(irradiance, vec3f(0.0)) * (multiple / A3D_PHYSICAL_PI);
  result.diffuse = max(irradiance, vec3f(0.0)) * base * (1.0 - metalness)
    * max(vec3f(1.0) - dielectricSingle - dielectricMultiple, vec3f(0.0)) / A3D_PHYSICAL_PI;
  return result;
}
fn a3dPhysicalDistanceFalloff(distance: f32, range: f32, decay: f32) -> f32 {
  let d = max(distance, 0.0);
  var window = 1.0;
  if (range > 0.0) {
    let ratio = d / range;
    let ratio2 = ratio * ratio;
    let remaining = clamp(1.0 - ratio2 * ratio2, 0.0, 1.0);
    window = remaining * remaining;
  }
  var power = 1.0;
  if (decay > 0.0) { power = pow(d, decay); }
  return window / max(power, 0.01);
}
`;
