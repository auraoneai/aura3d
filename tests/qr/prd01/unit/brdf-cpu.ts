/**
 * CPU ports for 01-S8 (`brdf-reference.test.ts`): three r185's GLSL
 * (`lights_physical_pars_fragment.glsl.js`, `common.glsl.js` F_Schlick) and
 * Aura's generated `brdf` chunk (`program/chunks/brdf.glsl.ts`), both sampling
 * the same r185 DFG LUT with GL-style bilinear filtering (texel centres at
 * (i + 0.5) / 16, clamp-to-edge). Written test-side so the comparison is
 * between two independent transcriptions of the GLSL, not one function twice.
 */

import { DFG_LUT_RG16F, DFG_LUT_SIZE } from "../../../../packages/rendering/src/program/DFGLutData";

export type V3 = readonly [number, number, number];
export const PI = Math.PI;
export const RECIPROCAL_PI = 1 / Math.PI;
export const EPSILON = 1e-6;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, b: V3): V3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const normalize = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
export const mix3 = (a: V3, b: V3, t: number): V3 => add(scale(a, 1 - t), scale(b, t));
export const splat = (s: number): V3 => [s, s, s];
const saturate = (x: number) => Math.min(1, Math.max(0, x));
const pow2 = (x: number) => x * x;
const min3 = (a: V3, s: number): V3 => [Math.min(a[0], s), Math.min(a[1], s), Math.min(a[2], s)];
const div3 = (a: V3, b: V3): V3 => [a[0] / b[0], a[1] / b[1], a[2] / b[2]];

/** IEEE 754 binary16 → number. */
export function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

const LUT = Array.from(DFG_LUT_RG16F, halfToFloat);
const texel = (x: number, y: number): [number, number] => {
  const cx = Math.min(DFG_LUT_SIZE - 1, Math.max(0, x));
  const cy = Math.min(DFG_LUT_SIZE - 1, Math.max(0, y));
  const i = 2 * (cy * DFG_LUT_SIZE + cx);
  return [LUT[i]!, LUT[i + 1]!];
};

/** `texture(dfgLUT, vec2(roughness, dotNV)).rg` with LINEAR + CLAMP_TO_EDGE. */
export function sampleDFG(u: number, v: number): [number, number] {
  const x = u * DFG_LUT_SIZE - 0.5;
  const y = v * DFG_LUT_SIZE - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const a = texel(x0, y0), b = texel(x0 + 1, y0), c = texel(x0, y0 + 1), d = texel(x0 + 1, y0 + 1);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  return [0, 1].map((k) => lerp(lerp(a[k]!, b[k]!, tx), lerp(c[k]!, d[k]!, tx), ty)) as [number, number];
}

export interface MaterialInput {
  readonly baseColor: V3;
  readonly metallic: number;
  readonly roughness: number;
  readonly ior: number;
  readonly specularIntensity: number;
  readonly specularColorFactor: V3;
}

/** r185 lights_physical_fragment (no spec-AA, no specular maps) — shared by both ports. */
export interface Physical {
  readonly diffuseContribution: V3;
  readonly baseColor: V3;
  readonly metallic: number;
  readonly roughness: number;
  readonly specularColor: V3;
  readonly specularColorBlended: V3;
  readonly specularF90: number;
}

export function physicalMaterial(m: MaterialInput): Physical {
  const specularColor = scale(min3(scale(m.specularColorFactor, pow2((m.ior - 1) / (m.ior + 1))), 1), m.specularIntensity);
  return {
    diffuseContribution: scale(m.baseColor, 1 - m.metallic),
    baseColor: m.baseColor,
    metallic: m.metallic,
    roughness: Math.min(Math.max(m.roughness, 0.0525), 1),
    specularColor,
    specularColorBlended: mix3(specularColor, m.baseColor, m.metallic),
    specularF90: m.specularIntensity + (1 - m.specularIntensity) * m.metallic
  };
}

function V_GGX_SmithCorrelated(alpha: number, dotNL: number, dotNV: number): number {
  const a2 = pow2(alpha);
  const gv = dotNL * Math.sqrt(a2 + (1 - a2) * pow2(dotNV));
  const gl = dotNV * Math.sqrt(a2 + (1 - a2) * pow2(dotNL));
  return 0.5 / Math.max(gv + gl, EPSILON);
}

function D_GGX(alpha: number, dotNH: number): number {
  const a2 = pow2(alpha);
  const denom = pow2(dotNH) * (a2 - 1) + 1;
  return (RECIPROCAL_PI * a2) / pow2(denom);
}

/** Schlick's Fresnel: r185 uses Epic's exp2 fit; `pow5` is Schlick's original form. */
export type FresnelForm = "exp2" | "pow5";
function fresnel(form: FresnelForm, f0: V3, f90: number, dotVH: number): V3 {
  const f = form === "exp2" ? 2 ** ((-5.55473 * dotVH - 6.98316) * dotVH) : (1 - dotVH) ** 5;
  return add(scale(f0, 1 - f), splat(f90 * f));
}

/** Single-scatter GGX (r185 BRDF_GGX, isotropic). */
export function brdfGgx(form: FresnelForm, L: V3, V: V3, N: V3, m: Physical): V3 {
  const H = normalize(add(L, V));
  const dotNL = saturate(dot(N, L)), dotNV = saturate(dot(N, V)), dotNH = saturate(dot(N, H)), dotVH = saturate(dot(V, H));
  const alpha = pow2(m.roughness);
  return scale(fresnel(form, m.specularColorBlended, m.specularF90, dotVH), V_GGX_SmithCorrelated(alpha, dotNL, dotNV) * D_GGX(alpha, dotNH));
}

/** r185 BRDF_GGX_Multiscatter (Turquin compensation over the DFG LUT); `multiscatter=false` → single only. */
export function brdfGgxMultiscatter(form: FresnelForm, L: V3, V: V3, N: V3, m: Physical, multiscatter = true): V3 {
  const single = brdfGgx(form, L, V, N, m);
  if (!multiscatter) return single;
  const dotNL = saturate(dot(N, L)), dotNV = saturate(dot(N, V));
  const dfgV = sampleDFG(m.roughness, dotNV), dfgL = sampleDFG(m.roughness, dotNL);
  const FssEssV = add(scale(m.specularColorBlended, dfgV[0]), splat(m.specularF90 * dfgV[1]));
  const FssEssL = add(scale(m.specularColorBlended, dfgL[0]), splat(m.specularF90 * dfgL[1]));
  const EmsV = 1 - (dfgV[0] + dfgV[1]), EmsL = 1 - (dfgL[0] + dfgL[1]);
  const Favg = add(m.specularColorBlended, scale(sub(splat(1), m.specularColorBlended), 0.047619));
  const Fms = div3(mul(mul(FssEssV, FssEssL), Favg), sub(splat(1 + EPSILON), scale(Favg, EmsV * EmsL)));
  return add(single, scale(Fms, EmsV * EmsL));
}

/** r185 computeMultiscattering → [singleScatter, multiScatter]. */
function multiscattering(N: V3, V: V3, specularColor: V3, f90: number, roughness: number): [V3, V3] {
  const dfg = sampleDFG(roughness, saturate(dot(N, V)));
  const FssEss = add(scale(specularColor, dfg[0]), splat(f90 * dfg[1]));
  const Ems = 1 - (dfg[0] + dfg[1]);
  const Favg = add(specularColor, scale(sub(splat(1), specularColor), 0.047619));
  const Fms = div3(mul(FssEss, Favg), sub(splat(1), scale(Favg, Ems)));
  return [FssEss, scale(Fms, Ems)];
}

/**
 * r185 RE_IndirectSpecular_Physical + its indirect diffuse, no clearcoat /
 * sheen / iridescence: `radiance` = prefiltered specular radiance,
 * `irradiance` = π-scaled diffuse irradiance (r185 getIBLIrradiance).
 */
export function threeIndirect(radiance: V3, irradiance: V3, N: V3, V: V3, m: Physical): { readonly specular: V3; readonly diffuse: V3 } {
  const [ssD, msD] = multiscattering(N, V, m.specularColor, m.specularF90, m.roughness);
  const [ssM, msM] = multiscattering(N, V, m.baseColor, m.specularF90, m.roughness);
  const single = mix3(ssD, ssM, m.metallic);
  const multi = mix3(msD, msM, m.metallic);
  const cosineWeighted = scale(irradiance, RECIPROCAL_PI);
  return {
    specular: add(mul(radiance, single), mul(multi, cosineWeighted)),
    diffuse: mul(mul(m.diffuseContribution, sub(splat(1), add(ssD, msD))), cosineWeighted)
  };
}

/** BRDF_Lambert(diffuseContribution) · irradiance(dotNL) — direct diffuse, both engines. */
export function lambertDirect(L: V3, N: V3, m: Physical): V3 {
  return scale(m.diffuseContribution, RECIPROCAL_PI * saturate(dot(N, L)));
}

// ── Aura generated `brdf` chunk (program/chunks/brdf.glsl.ts), line for line ──

/** Aura's F_Schlick form, kept in sync with the chunk's `F_Schlick`. */
export const AURA_FRESNEL: FresnelForm = "exp2";

/** a3dDirectSpecular (single GGX + r185 multiscatter, verbatim structure). */
export function auraDirectSpecular(L: V3, V: V3, N: V3, m: Physical, multiscatter = true): V3 {
  return brdfGgxMultiscatter(AURA_FRESNEL, L, V, N, m, multiscatter);
}

/** a3dIndirectSpecular(radiance, irradiance, …) + a3dIndirectDiffuse(irradiance, …). */
export function auraIndirect(radiance: V3, irradiance: V3, N: V3, V: V3, m: Physical): { readonly specular: V3; readonly diffuse: V3 } {
  const dotNV = saturate(dot(N, V));
  const dfg = sampleDFG(m.roughness, dotNV);
  const singleDielectric = add(scale(m.specularColor, dfg[0]), splat(m.specularF90 * dfg[1]));
  const singleMetallic = add(scale(m.baseColor, dfg[0]), splat(m.specularF90 * dfg[1]));
  const single = mix3(singleDielectric, singleMetallic, m.metallic);
  const FavgD = add(m.specularColor, scale(sub(splat(1), m.specularColor), 0.047619));
  const FavgM = add(m.baseColor, scale(sub(splat(1), m.baseColor), 0.047619));
  const Ems = 1 - (dfg[0] + dfg[1]);
  const multiD = scale(div3(mul(singleDielectric, FavgD), sub(splat(1), scale(FavgD, Ems))), Ems);
  const multiM = scale(div3(mul(singleMetallic, FavgM), sub(splat(1), scale(FavgM, Ems))), Ems);
  const multi = mix3(multiD, multiM, m.metallic);
  const cosineWeighted = scale(irradiance, RECIPROCAL_PI);
  const remaining = mul(m.diffuseContribution, sub(splat(1), add(singleDielectric, multiD)));
  return {
    specular: add(mul(radiance, single), mul(multi, cosineWeighted)),
    diffuse: mul(remaining, cosineWeighted)
  };
}
