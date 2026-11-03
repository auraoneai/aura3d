/**
 * Independent, test-only WGSL BRDF candidate; not a renderer integration.
 *
 * GGX reflection and the microfacet distribution: Walter et al., EGSR 2007,
 * https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf, §§3, 5.
 * Height-correlated Smith masking: Heitz, JCGT 2014, §§3, 6,
 * https://jcgt.org/published/0003/02/03/paper.pdf.
 * Fifth-power Fresnel: Schlick, Computer Graphics Forum 1994,
 * https://doi.org/10.1111/1467-8659.1330233.
 *
 * Aura's generated DFG layout uses (perceptual roughness, N dot V) for (x,y)
 * and the F0 and F90 coefficients for the first two channels. This samples
 * level zero; filtering and texel-center behavior require compatibility review.
 * Inputs are finite;
 * directional cosines are clamped, and alpha has a 0.001 floor. The inverse
 * Fresnel regularizes its non-invertible grazing limit.
 * EPSILON is provisionally 1e-6 for the visibility denominator, not a
 * universal tolerance or a claim of compatibility with existing consumers.
 */
export const NATIVE_BRDF_WGSL = /* wgsl */ `
@group(1) @binding(29) var a3d_prd04_dfgLut: texture_2d<f32>;
@group(1) @binding(28) var a3d_prd04_dfgSmp: sampler;

const PI: f32 = 3.141592653589793;
const RECIPROCAL_PI: f32 = 1.0 / PI;
const EPSILON: f32 = 0.000001;

fn pow2(x: f32) -> f32 { return x * x; }
fn pow2v(x: vec3f) -> vec3f { return x * x; }
fn pow4(x: f32) -> f32 { return pow2(pow2(x)); }
fn max3(v: vec3f) -> f32 { return max(max(v.x, v.y), v.z); }

fn F_Schlick(f0: vec3f, f90: f32, dotVH: f32) -> vec3f {
  let m = 1.0 - clamp(dotVH, 0.0, 1.0);
  let weight = pow4(m) * m;
  return f0 + (vec3f(f90) - f0) * weight;
}
fn Schlick_to_F0(f: vec3f, f90: f32, dotVH: f32) -> vec3f {
  let m = 1.0 - clamp(dotVH, 0.0, 1.0);
  let weight = pow4(m) * m;
  return (f - vec3f(f90) * weight) / max(1.0 - weight, 0.00001);
}
fn V_GGX_SmithCorrelated(alpha: f32, dotNL: f32, dotNV: f32) -> f32 {
  let a = clamp(alpha, 0.001, 1.0);
  let a2 = a * a;
  let nl = clamp(dotNL, 0.0, 1.0);
  let nv = clamp(dotNV, 0.0, 1.0);
  let left = nl * sqrt(nv * nv * (1.0 - a2) + a2);
  let right = nv * sqrt(nl * nl * (1.0 - a2) + a2);
  return 0.5 / max(left + right, EPSILON);
}
fn D_GGX(alpha: f32, dotNH: f32) -> f32 {
  let a = clamp(alpha, 0.001, 1.0);
  let c = clamp(dotNH, 0.0, 1.0);
  let c2 = c * c;
  let denom = (1.0 - c2) + a * a * c2;
  return (a * a) / (PI * denom * denom);
}
fn a3dDFG(roughness: f32, dotNX: f32) -> vec2f {
  return textureSampleLevel(a3d_prd04_dfgLut, a3d_prd04_dfgSmp,
    vec2f(clamp(roughness, 0.0, 1.0), clamp(dotNX, 0.0, 1.0)), 0.0).rg;
}
`;
