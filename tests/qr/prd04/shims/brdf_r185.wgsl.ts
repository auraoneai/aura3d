/**
 * brdf_r185.wgsl.ts — WGSL shim standing in for the `brdf` chunk's WGSL twin
 * until PRD-11's C-29 generator lands (PRD-04 §8.12). Companion of
 * brdf_r185.glsl.ts: same helper set, same r185 math, test-only.
 *
 * WGSL has no user-function overloading, so the vec3 overloads of GLSL
 * `pow2`/`saturate` are `pow2v` (f32 `saturate` stays builtin). `F_Schlick`
 * is defined vec3-only; scalar call sites splat and take `.x`.
 *
 * Symbols provided: PI, RECIPROCAL_PI, EPSILON, pow2, pow2v, pow4, max3,
 * F_Schlick, Schlick_to_F0, V_GGX_SmithCorrelated, D_GGX, a3dDFG,
 * a3d_prd04_dfgLut (texture+sampler bindings used by a3dDFG).
 */
export const BRDF_R185_WGSL = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const RECIPROCAL_PI: f32 = 0.3183098861837907;
const EPSILON: f32 = 1e-6;

fn pow2(x: f32) -> f32 {
	return x * x;
}

fn pow2v(x: vec3f) -> vec3f {
	return x * x;
}

fn pow4(x: f32) -> f32 {
	let x2 = x * x;
	return x2 * x2;
}

fn max3(v: vec3f) -> f32 {
	return max(max(v.x, v.y), v.z);
}

fn F_Schlick(f0: vec3f, f90: f32, dotVH: f32) -> vec3f {
	// Optimized variant (presented in Epic's SIGGRAPH course notes)
	let fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
	return f0 * (1.0 - fresnel) + (f90 * fresnel);
}

fn Schlick_to_F0(f: vec3f, f90: f32, dotVH: f32) -> vec3f {
	let x = clamp(1.0 - dotVH, 0.0, 1.0);
	let x2 = x * x;
	let x5 = clamp(x * x2 * x2, 0.0, 0.9999);
	return (f - vec3f(f90) * x5) / (1.0 - x5);
}

// r185 lights_physical_pars_fragment.glsl.js V/D terms (GGX isotropic arm —
// the anisotropic variant lives in the a3d_prd04_anisotropy twin).
fn V_GGX_SmithCorrelated(alpha: f32, dotNL: f32, dotNV: f32) -> f32 {
	let a2 = alpha * alpha;
	let gv = dotNL * sqrt(a2 + (1.0 - a2) * dotNV * dotNV);
	let gl = dotNV * sqrt(a2 + (1.0 - a2) * dotNL * dotNL);
	return 0.5 / max(gv + gl, EPSILON);
}

fn D_GGX(alpha: f32, dotNH: f32) -> f32 {
	let a2 = alpha * alpha;
	let denom = dotNH * dotNH * (a2 - 1.0) + 1.0;
	return RECIPROCAL_PI * a2 / (denom * denom);
}

// The single DFG-LUT accessor (PRD-04 §8.2): lookup at (roughness, NdotX).rg.
@group(1) @binding(29) var a3d_prd04_dfgLut: texture_2d<f32>;
@group(1) @binding(28) var a3d_prd04_dfgSmp: sampler;

fn a3dDFG(roughness: f32, dotNX: f32) -> vec2f {
	// textureSampleLevel (level 0) — the LUT fetch is LOD-free and stage-agnostic.
	return textureSampleLevel(a3d_prd04_dfgLut, a3d_prd04_dfgSmp, vec2f(roughness, dotNX), 0.0).rg;
}
`;
