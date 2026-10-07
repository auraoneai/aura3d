/**
 * physical-bsdf-reference.ts — CPU oracle for the PRD 04 lobe chunks
 * (PRD-04 §14 P1-3).
 *
 * Every function is a JS transcription of the same math the GLSL chunks
 * evaluate (and of the r185 GLSL the golden JSON was rendered with). The unit
 * test replays the golden's parameter grid through these functions and
 * asserts ≤1e-4 relative error against GPU-evaluated three r185 GLSL.
 */
import { DFG_LUT_R185, DFG_LUT_SIZE } from "./dfg-lut-r185";

export const PI = Math.PI;
export const RECIPROCAL_PI = 1 / PI;
export const EPSILON = 1e-6;

export const saturate = (a: number): number => Math.min(Math.max(a, 0), 1);
export const sat3 = (v: [number, number, number]): [number, number, number] => [
	saturate(v[0]), saturate(v[1]), saturate(v[2])
];
export const pow2 = (x: number): number => x * x;
export const pow4 = (x: number): number => x * x * x * x;
const _exp2 = (x: number): number => 2 ** x;
export const max3 = (v: [number, number, number]): number => Math.max(v[0], v[1], v[2]);

export type Vec3 = [number, number, number];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: Vec3, b: Vec3 | number): Vec3 =>
	typeof b === "number" ? [a[0] * b, a[1] * b, a[2] * b] : [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const div3 = (a: Vec3, b: Vec3 | number): Vec3 =>
	typeof b === "number" ? [a[0] / b, a[1] / b, a[2] / b] : [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a: Vec3): Vec3 => div3(a, len3(a));
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
	a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
];
export const clamp3 = (a: Vec3, lo: number, hi: number): Vec3 => [
	Math.min(Math.max(a[0], lo), hi),
	Math.min(Math.max(a[1], lo), hi),
	Math.min(Math.max(a[2], lo), hi)
];
export const min3v = (a: Vec3, b: Vec3): Vec3 => [
	Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])
];
export const max3v = (a: Vec3, b: Vec3): Vec3 => [
	Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])
];

// --- shared scalar/vec helpers (r185 common.glsl.js) ------------------------

export function fSchlick(f0: Vec3, f90: number, dotVH: number): Vec3 {
	const fresnel = _exp2((-5.55473 * dotVH - 6.98316) * dotVH);
	return add3(mul3(f0, 1 - fresnel), [f90 * fresnel, f90 * fresnel, f90 * fresnel]);
}

export function fSchlickScalar(f0: number, f90: number, dotVH: number): number {
	const fresnel = _exp2((-5.55473 * dotVH - 6.98316) * dotVH);
	return f0 * (1 - fresnel) + f90 * fresnel;
}

export function schlickToF0(f: Vec3, f90: number, dotVH: number): Vec3 {
	const x = Math.min(Math.max(1 - dotVH, 0), 1);
	const x2 = x * x;
	const x5 = Math.min(Math.max(x * x2 * x2, 0), 0.9999);
	return [
		(f[0] - f90 * x5) / (1 - x5),
		(f[1] - f90 * x5) / (1 - x5),
		(f[2] - f90 * x5) / (1 - x5)
	];
}

export function brdfLambert(diffuseColor: Vec3): Vec3 {
	return mul3(diffuseColor, RECIPROCAL_PI);
}

// --- DFG LUT sampling (r185 DFGLUTData.js; LINEAR + CLAMP_TO_EDGE) ----------

export function a3dDFG(roughness: number, dotNX: number): [number, number] {
	// GL_LINEAR sampling of the 16x16 RG16F LUT at (roughness, dotNX).
	const n = DFG_LUT_SIZE;
	const su = Math.min(Math.max(roughness, 0), 1) * n - 0.5;
	const sv = Math.min(Math.max(dotNX, 0), 1) * n - 0.5;
	const x0 = Math.floor(su), y0 = Math.floor(sv);
	const fx = su - x0, fy = sv - y0;
	const texel = (x: number, y: number): [number, number] => {
		const cx = Math.min(Math.max(x, 0), n - 1);
		const cy = Math.min(Math.max(y, 0), n - 1);
		const i = (cy * n + cx) * 2;
		return [DFG_LUT_R185[i], DFG_LUT_R185[i + 1]];
	};
	const c00 = texel(x0, y0), c10 = texel(x0 + 1, y0);
	const c01 = texel(x0, y0 + 1), c11 = texel(x0 + 1, y0 + 1);
	return [
		(c00[0] * (1 - fx) + c10[0] * fx) * (1 - fy) + (c01[0] * (1 - fx) + c11[0] * fx) * fy,
		(c00[1] * (1 - fx) + c10[1] * fx) * (1 - fy) + (c01[1] * (1 - fx) + c11[1] * fx) * fy
	];
}

// --- GGX (r185 lights_physical_pars_fragment.glsl.js) -----------------------

export function vGGXSmithCorrelated(alpha: number, dotNL: number, dotNV: number): number {
	const a2 = alpha * alpha;
	const gv = dotNL * Math.sqrt(a2 + (1 - a2) * dotNV * dotNV);
	const gl = dotNV * Math.sqrt(a2 + (1 - a2) * dotNL * dotNL);
	return 0.5 / Math.max(gv + gl, EPSILON);
}

export function dGGX(alpha: number, dotNH: number): number {
	const a2 = alpha * alpha;
	const denom = dotNH * dotNH * (a2 - 1) + 1;
	return RECIPROCAL_PI * a2 / (denom * denom);
}

export function environmentBRDF(dotNV: number, specularColor: Vec3, specularF90: number, roughness: number): Vec3 {
	const fab = a3dDFG(roughness, saturate(dotNV));
	return add3(mul3(specularColor, fab[0]), [specularF90 * fab[1], specularF90 * fab[1], specularF90 * fab[1]]);
}

// --- sheen (r185 lights_physical_pars_fragment.glsl.js:321-375) -------------

export function dCharlie(roughness: number, dotNH: number): number {
	const alpha = pow2(roughness);
	const invAlpha = 1 / alpha;
	const cos2h = dotNH * dotNH;
	const sin2h = Math.max(1 - cos2h, 0.0078125);
	return (2 + invAlpha) * Math.pow(sin2h, invAlpha * 0.5) / (2 * PI);
}

export function vNeubelt(dotNV: number, dotNL: number): number {
	return saturate(1 / (4 * (dotNL + dotNV - dotNL * dotNV)));
}

export function sheenDirect(dotNV: number, dotNL: number, sheenColor: Vec3, sheenRoughness: number): Vec3 {
	// N=(0,0,1), V/L reconstructed like the golden generator.
	const v: Vec3 = [0, Math.sqrt(Math.max(0, 1 - dotNV * dotNV)), dotNV];
	const l: Vec3 = [0, Math.sqrt(Math.max(0, 1 - dotNL * dotNL)), dotNL];
	const n: Vec3 = [0, 0, 1];
	const halfDir = norm3(add3(l, v));
	const dotNH = saturate(dot3(n, halfDir));
	const d = dCharlie(sheenRoughness, dotNH);
	const vv = vNeubelt(dotNV, dotNL);
	return mul3(sheenColor, d * vv);
}

export function iblSheenBRDF(dotNV: number, roughness: number): number {
	const ndv = saturate(dotNV);
	const r2 = roughness * roughness;
	const rInv = 1 / (roughness + 0.1);
	const a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	const b = -0.6014 + 0.5538 * roughness - 0.467 * r2 - 0.1255 * rInv;
	return saturate(Math.exp(a * ndv + b));
}

export function sheenIndirect(dotNV: number, sheenRoughness: number, sheenColor: Vec3, irradiance: Vec3): Vec3 {
	const albedo = iblSheenBRDF(dotNV, sheenRoughness);
	return mul3(mul3(irradiance, sheenColor), albedo * RECIPROCAL_PI);
}

export function sheenEnergyCompensation(dotNV: number, dotNL: number, sheenColor: Vec3, sheenRoughness: number): number {
	const aV = iblSheenBRDF(dotNV, sheenRoughness);
	const aL = iblSheenBRDF(dotNL, sheenRoughness);
	return 1 - max3(sheenColor) * Math.max(aV, aL);
}

export function sheenEnergyCompensationIndirect(dotNV: number, sheenColor: Vec3, sheenRoughness: number): number {
	const albedo = iblSheenBRDF(dotNV, sheenRoughness);
	return 1 - max3(sheenColor) * albedo;
}

// --- anisotropy -------------------------------------------------------------

export function vGGXAnisotropic(alphaT: number, alphaB: number, dotTV: number, dotBV: number, dotTL: number, dotBL: number, dotNV: number, dotNL: number): number {
	const gv = dotNL * Math.hypot(alphaT * dotTV, alphaB * dotBV, dotNV);
	const gl = dotNV * Math.hypot(alphaT * dotTL, alphaB * dotBL, dotNL);
	return 0.5 / Math.max(gv + gl, EPSILON);
}

export function dGGXAnisotropic(alphaT: number, alphaB: number, dotNH: number, dotTH: number, dotBH: number): number {
	const a2 = alphaT * alphaB;
	const vx = alphaB * dotTH, vy = alphaT * dotBH, vz = a2 * dotNH;
	const v2 = vx * vx + vy * vy + vz * vz;
	const w2 = a2 / v2;
	return RECIPROCAL_PI * a2 * w2 * w2;
}

export function anisotropyAlphaT(roughness: number, anisotropy: number): number {
	return pow2(roughness) + (1 - pow2(roughness)) * pow2(anisotropy);
}

export function anisotropyBentNormal(viewDir: Vec3, normal: Vec3, bitangent: Vec3, anisotropy: number, roughness: number): Vec3 {
	let bent = cross3(bitangent, viewDir);
	bent = norm3(cross3(bent, bitangent));
	const t = pow2(pow2(1 - anisotropy * (1 - roughness)));
	return norm3(mix3(bent, normal, t));
}

// --- iridescence (r185 iridescence_fragment.glsl.js) ------------------------

const XYZ_TO_REC709 = [
	3.2404542, -0.969266, 0.0556434,
	-1.5371385, 1.8760108, -0.2040259,
	-0.4985314, 0.041556, 1.0572252
];

export function fresnel0ToIor(fresnel0: Vec3): Vec3 {
	const sq = [Math.sqrt(fresnel0[0]), Math.sqrt(fresnel0[1]), Math.sqrt(fresnel0[2])];
	return [
		(1 + sq[0]) / (1 - sq[0]),
		(1 + sq[1]) / (1 - sq[1]),
		(1 + sq[2]) / (1 - sq[2])
	];
}

export function iorToFresnel0(transmittedIor: Vec3, incidentIor: number): Vec3 {
	return [
		pow2((transmittedIor[0] - incidentIor) / (transmittedIor[0] + incidentIor)),
		pow2((transmittedIor[1] - incidentIor) / (transmittedIor[1] + incidentIor)),
		pow2((transmittedIor[2] - incidentIor) / (transmittedIor[2] + incidentIor))
	];
}

export function iorToFresnel0f(transmittedIor: number, incidentIor: number): number {
	return pow2((transmittedIor - incidentIor) / (transmittedIor + incidentIor));
}

const smoothstep = (a: number, b: number, x: number): number => {
	const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return t * t * (3 - 2 * t);
};

export function evalSensitivity(OPD: number, shift: Vec3): Vec3 {
	const phase = 2 * PI * OPD * 1e-9;
	const val: Vec3 = [5.4856e-13, 4.4201e-13, 5.2481e-13];
	const pos: Vec3 = [1.681e6, 1.7953e6, 2.2084e6];
	const variance: Vec3 = [4.3278e9, 9.3046e9, 6.6121e9];

	const xyz: Vec3 = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		xyz[i] = val[i] * Math.sqrt(2 * PI * variance[i]) * Math.cos(pos[i] * phase + shift[i]) * Math.exp(-phase * phase * variance[i]);
	}
	xyz[0] += 9.747e-14 * Math.sqrt(2 * PI * 4.5282e9) * Math.cos(2.2399e6 * phase + shift[0]) * Math.exp(-4.5282e9 * phase * phase);
	for (let i = 0; i < 3; i++) xyz[i] /= 1.0685e-7;

	// GLSL mat3 ctor is column-major: M*v = col0*x + col1*y + col2*z.
	return [
		XYZ_TO_REC709[0] * xyz[0] + XYZ_TO_REC709[3] * xyz[1] + XYZ_TO_REC709[6] * xyz[2],
		XYZ_TO_REC709[1] * xyz[0] + XYZ_TO_REC709[4] * xyz[1] + XYZ_TO_REC709[7] * xyz[2],
		XYZ_TO_REC709[2] * xyz[0] + XYZ_TO_REC709[5] * xyz[1] + XYZ_TO_REC709[8] * xyz[2]
	];
}

export function evalIridescence(outsideIOR: number, eta2: number, cosTheta1: number, thinFilmThickness: number, baseF0: Vec3): Vec3 {
	const iridescenceIOR = outsideIOR + (eta2 - outsideIOR) * smoothstep(0, 0.03, thinFilmThickness);
	const sinTheta2Sq = pow2(outsideIOR / iridescenceIOR) * (1 - pow2(cosTheta1));
	const cosTheta2Sq = 1 - sinTheta2Sq;
	if (cosTheta2Sq < 0) return [1, 1, 1];
	const cosTheta2 = Math.sqrt(cosTheta2Sq);

	const R0 = iorToFresnel0f(iridescenceIOR, outsideIOR);
	const R12 = fSchlickScalar(R0, 1, cosTheta1);
	const T121 = 1 - R12;
	const phi12 = iridescenceIOR < outsideIOR ? PI : 0;
	const phi21 = PI - phi12;

	const baseIOR = fresnel0ToIor(clamp3(baseF0, 0, 0.9999));
	const R1 = iorToFresnel0(baseIOR, iridescenceIOR);
	const R23 = fSchlick(R1, 1, cosTheta2);
	const phi23: Vec3 = [
		baseIOR[0] < iridescenceIOR ? PI : 0,
		baseIOR[1] < iridescenceIOR ? PI : 0,
		baseIOR[2] < iridescenceIOR ? PI : 0
	];

	const OPD = 2 * iridescenceIOR * thinFilmThickness * cosTheta2;
	const phi: Vec3 = [phi21 + phi23[0], phi21 + phi23[1], phi21 + phi23[2]];

	const R123 = clamp3(mul3([R12, R12, R12], R23), 1e-5, 0.9999);
	const r123: Vec3 = [Math.sqrt(R123[0]), Math.sqrt(R123[1]), Math.sqrt(R123[2])];
	const Rs = mul3(div3(mul3([T121 * T121, T121 * T121, T121 * T121], R23), [1 - R123[0], 1 - R123[1], 1 - R123[2]]), 1);

	const C0 = add3([R12, R12, R12], Rs);
	let I: Vec3 = C0;

	let Cm = sub3(Rs, [T121, T121, T121]);
	for (let m = 1; m <= 2; m++) {
		Cm = mul3(Cm, r123);
		const Sm = mul3(evalSensitivity(m * OPD, [m * phi[0], m * phi[1], m * phi[2]]), 2);
		I = add3(I, mul3(Cm, Sm));
	}
	return max3v(I, [0, 0, 0]);
}

// --- specular occlusion / specular-ior --------------------------------------

export function computeSpecularOcclusion(dotNV: number, ambientOcclusion: number, roughness: number): number {
	return saturate(Math.pow(dotNV + ambientOcclusion, _exp2(-16 * roughness - 1)) - 1 + ambientOcclusion);
}

export function specIorSpecularColor(ior: number, specularColorFactor: Vec3, specularIntensity: number): Vec3 {
	const f0 = pow2((ior - 1) / (ior + 1));
	return mul3(min3v(mul3([f0, f0, f0], specularColorFactor), [1, 1, 1]), specularIntensity);
}

export function specIorSpecularF90(specularIntensity: number, metalness: number): number {
	return specularIntensity + (1 - specularIntensity) * metalness;
}

export function specIorSpecularColorBlended(specularColor: Vec3, diffuseColor: Vec3, metalness: number): Vec3 {
	return mix3(specularColor, diffuseColor, metalness);
}

// --- clearcoat ---------------------------------------------------------------

export function clearcoatDirect(dotNL: number, dotNV: number, dotNH: number, dotVH: number, clearcoatRoughness: number): Vec3 {
	const alpha = pow2(clearcoatRoughness);
	const F = fSchlick([0.04, 0.04, 0.04], 1, dotVH);
	const V = vGGXSmithCorrelated(alpha, dotNL, dotNV);
	const D = dGGX(alpha, dotNH);
	return mul3(F, V * D);
}

export function clearcoatIndirect(dotNVcc: number, clearcoatRoughness: number, clearcoatRadiance: Vec3): Vec3 {
	const f = environmentBRDF(dotNVcc, [0.04, 0.04, 0.04], 1, clearcoatRoughness);
	return mul3(clearcoatRadiance, f);
}

export function clearcoatFcc(dotNVcc: number): number {
	return fSchlickScalar(0.04, 1, dotNVcc);
}

export function clearcoatCompose(outgoing: Vec3, clearcoat: number, dotNVcc: number, ccDirect: Vec3, ccIndirect: Vec3): Vec3 {
	const fcc = clearcoatFcc(dotNVcc);
	const damped = mul3(outgoing, 1 - clearcoat * fcc);
	return add3(damped, mul3(add3(ccDirect, ccIndirect), clearcoat));
}

// --- transmission / volume ---------------------------------------------------

export function applyIorToRoughness(roughness: number, ior: number): number {
	return roughness * Math.min(Math.max(ior * 2 - 2, 0), 1);
}

export function volumeAttenuation(transmissionDistance: number, attenuationColor: Vec3, attenuationDistance: number): Vec3 {
	if (!Number.isFinite(attenuationDistance)) return [1, 1, 1];
	// transmittance = exp( log(color) * transmissionDistance / attenuationDistance )
	return [0, 1, 2].map(
		(i) => Math.exp((Math.log(attenuationColor[i]) / attenuationDistance) * transmissionDistance)
	) as Vec3;
}

export function volumeTransmissionRay(n: Vec3, v: Vec3, thickness: number, ior: number, modelScale: Vec3): Vec3 {
	// r185 getVolumeTransmissionRay: refract(-v, normalize(n), 1/ior), then
	// normalize * thickness * modelScale (component-wise, AFTER normalize).
	const eta = 1 / ior;
	const cosI = -dot3(n, v); // dot(N, -v) — incident points into the surface
	const k = 1 - eta * eta * (1 - cosI * cosI);
	const refr: Vec3 = k < 0
		? [0, 0, 0]
		: [
			eta * -v[0] - (eta * cosI + Math.sqrt(k)) * n[0],
			eta * -v[1] - (eta * cosI + Math.sqrt(k)) * n[1],
			eta * -v[2] - (eta * cosI + Math.sqrt(k)) * n[2]
		];
	const unit = norm3(refr);
	return [unit[0] * thickness * modelScale[0], unit[1] * thickness * modelScale[1], unit[2] * thickness * modelScale[2]];
}

// --- multiscatter + full GGX (composite oracle for the LUT-backed cases) -----

export function computeMultiscattering(dotNV: number, specularColor: Vec3, specularF90: number, roughness: number): { single: Vec3; multi: Vec3 } {
	const fab = a3dDFG(roughness, saturate(dotNV));
	const Fr = specularColor;
	const FssEss: Vec3 = [
		Fr[0] * fab[0] + specularF90 * fab[1],
		Fr[1] * fab[0] + specularF90 * fab[1],
		Fr[2] * fab[0] + specularF90 * fab[1]
	];
	const Ess = fab[0] + fab[1];
	const Ems = 1 - Ess;
	const Favg: Vec3 = [Fr[0] + (1 - Fr[0]) * 0.047619, Fr[1] + (1 - Fr[1]) * 0.047619, Fr[2] + (1 - Fr[2]) * 0.047619];
	const Fms: Vec3 = [
		(FssEss[0] * Favg[0]) / (1 - Ems * Favg[0]),
		(FssEss[1] * Favg[1]) / (1 - Ems * Favg[1]),
		(FssEss[2] * Favg[2]) / (1 - Ems * Favg[2])
	];
	return { single: FssEss, multi: mul3(Fms, Ems) };
}

export function brdfGGX(dotNL: number, dotNV: number, dotVH: number, dotNH: number, specularColorBlended: Vec3, specularF90: number, roughness: number): Vec3 {
	const alpha = pow2(roughness);
	const F = fSchlick(specularColorBlended, specularF90, dotVH);
	const V = vGGXSmithCorrelated(alpha, dotNL, dotNV);
	const D = dGGX(alpha, dotNH);
	return mul3(F, V * D);
}

export function brdfGGXMultiscatter(dotNL: number, dotNV: number, dotVH: number, dotNH: number, specularColorBlended: Vec3, specularF90: number, roughness: number): Vec3 {
	const single = brdfGGX(dotNL, dotNV, dotVH, dotNH, specularColorBlended, specularF90, roughness);
	const dfgV = a3dDFG(roughness, saturate(dotNV));
	const dfgL = a3dDFG(roughness, saturate(dotNL));
	const FssEss_V: Vec3 = [
		specularColorBlended[0] * dfgV[0] + specularF90 * dfgV[1],
		specularColorBlended[1] * dfgV[0] + specularF90 * dfgV[1],
		specularColorBlended[2] * dfgV[0] + specularF90 * dfgV[1]
	];
	const FssEss_L: Vec3 = [
		specularColorBlended[0] * dfgL[0] + specularF90 * dfgL[1],
		specularColorBlended[1] * dfgL[0] + specularF90 * dfgL[1],
		specularColorBlended[2] * dfgL[0] + specularF90 * dfgL[1]
	];
	const Ess_V = dfgV[0] + dfgV[1];
	const Ess_L = dfgL[0] + dfgL[1];
	const Ems_V = 1 - Ess_V;
	const Ems_L = 1 - Ess_L;
	const Favg: Vec3 = [
		specularColorBlended[0] + (1 - specularColorBlended[0]) * 0.047619,
		specularColorBlended[1] + (1 - specularColorBlended[1]) * 0.047619,
		specularColorBlended[2] + (1 - specularColorBlended[2]) * 0.047619
	];
	const Fms: Vec3 = [
		(FssEss_V[0] * FssEss_L[0] * Favg[0]) / (1 - Ems_V * Ems_L * Favg[0] + EPSILON),
		(FssEss_V[1] * FssEss_L[1] * Favg[1]) / (1 - Ems_V * Ems_L * Favg[1] + EPSILON),
		(FssEss_V[2] * FssEss_L[2] * Favg[2]) / (1 - Ems_V * Ems_L * Favg[2] + EPSILON)
	];
	const comp = Ems_V * Ems_L;
	return add3(single, mul3(Fms, comp));
}
