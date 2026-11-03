/**
 * independent-bsdf-goldens.ts — independently derived expected values for the
 * PRD-04 CPU BSDF oracle (`physical-bsdf-reference.ts`), replacing the former
 * GPU golden that was produced by evaluating another engine's GLSL
 * (S5-WP29-05). Nothing here imports, runs or reads another 3D engine, and
 * nothing here imports the oracle under test: every expectation is written
 * again from the cited publication or specification, in a different algebraic
 * form where the publication offers one, so a transcription error in either
 * file shows up as a disagreement.
 *
 * Sources (equations, not implementation listings):
 * - [EK17]  Conty Estevez & Kulla, "Production Friendly Microfacet Sheen BRDF",
 *           SIGGRAPH 2017 course notes, eq. 2 (Charlie sine-power NDF).
 * - [NP13]  Neubelt & Pettineo, "Crafting a Next-Gen Material Pipeline for
 *           The Order: 1886", SIGGRAPH 2013 course notes (cloth visibility
 *           1 / (4 (NL + NV - NL NV))).
 * - [H14]   Heitz, "Understanding the Masking-Shadowing Function in
 *           Microfacet-Based BRDFs", JCGT 3(2) 2014, eqs. 85, 86 and 99
 *           (anisotropic GGX D, Smith Lambda, height-correlated G2).
 * - [W07]   Walter et al., "Microfacet Models for Refraction through Rough
 *           Surfaces", EGSR 2007, eq. 33 (isotropic GGX D).
 * - [K13]   Karis, "Real Shading in Unreal Engine 4", SIGGRAPH 2013 notes,
 *           Schlick Fresnel with the spherical-Gaussian exponent
 *           2^((-5.55473 c - 6.98316) c), and the split-sum F0 A + F90 B.
 * - [FA19]  Fdez-Aguera, "A Multiple-Scattering Microfacet Model for Real-Time
 *           Image-Based Lighting", JCGT 8(1) 2019, eqs. 10-17.
 * - [BB17]  Belcour & Barla, "A Practical Extension to Microfacet Theory for
 *           the Modeling of Varying Iridescence", SIGGRAPH 2017 (Airy sum
 *           truncated at two orders, Gaussian-fit XYZ sensitivity), as
 *           restated by the Khronos KHR_materials_iridescence specification
 *           (film-IOR fade over 0..30 nm, phase shifts of pi on reflection).
 * - [LR14]  Lagarde & de Rousiers, "Moving Frostbite to PBR", SIGGRAPH 2014
 *           course notes, specular occlusion from ambient occlusion.
 * - [KHR]   Khronos glTF 2.0 extensions: KHR_materials_ior (F0 from IOR),
 *           KHR_materials_specular (dielectric F0 colour and F90),
 *           KHR_materials_anisotropy (alphaT = mix(alpha, 1, anisotropy^2)),
 *           KHR_materials_volume (transmittance c^(d / attenuationDistance)),
 *           KHR_materials_clearcoat (base (1 - cc Fc) + cc coat).
 * - [L]     B. Lindbloom, XYZ -> linear sRGB (D65) matrix, from the sRGB
 *           primaries of IEC 61966-2-1.
 * - Snell's law in vector form (any optics text) for the refracted ray.
 *
 * Renderer conventions that are not publications are taken from Aura3D's own
 * shader sources and named where used: the 2^-7 sin^2 floor in the Charlie
 * NDF (`ShaderLibrary.ts`), the curve-fitted sheen albedo coefficients
 * (stated as literals below, since a fitted curve has no closed form to
 * re-derive), the IOR roughness scale
 * (`physical/transmission.glsl.ts`), the 1e-6 visibility denominator guard,
 * and the reciprocal direct-light multiscatter compensation (the two-direction
 * generalisation of [FA19] eq. 16-17 that the oracle documents).
 *
 * The 16x16 split-sum table that the oracle samples is not re-derived here;
 * `independentSplitSumTexel` integrates it independently (Heitz G2 with
 * Gauss-Legendre quadrature in `native-reference-environment-clean.ts`) so the
 * unit test can bound the table separately from the formulas that consume it.
 */
import { environmentBRDF as integrateSplitSum } from "./native-reference-environment-clean";

type V3 = [number, number, number];

const PI = Math.PI;
/** Aura3D's visibility denominator guard (matches the WGSL/GLSL chunks). */
const VIS_GUARD = 1e-6;
/** Aura3D's Charlie NDF sin^2 floor: 2^-7, keeps sin2h^(1/(2 alpha)) representable in fp16. */
const CHARLIE_SIN2_FLOOR = 2 ** -7;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const linspace = (a: number, b: number, n: number): number[] =>
	Array.from({ length: n }, (_, i) => (i === n - 1 ? b : a + ((b - a) * i) / (n - 1)));
const range01 = (n: number): number[] => linspace(0, 1, n);

/** [K13] Schlick with the spherical-Gaussian exponent, written as a lerp from F0 to F90. */
function schlickSG(f0: number, f90: number, cosine: number): number {
	const w = Math.pow(2, cosine * (-5.55473 * cosine - 6.98316));
	return f0 + (f90 - f0) * w;
}

/** [EK17] eq. 2 with alpha = roughness^2 and the Aura3D sin^2 floor. */
export function charlieD(roughness: number, nh: number): number {
	const alpha = roughness * roughness;
	const sin2 = Math.max(1 - nh * nh, CHARLIE_SIN2_FLOOR);
	return ((2 + 1 / alpha) / (2 * PI)) * Math.exp(Math.log(sin2) / (2 * alpha));
}

/** [NP13], clamped to [0,1] like the shader's saturate (the NV = NL = 0 pole saturates to 1). */
export function neubeltV(nv: number, nl: number): number {
	const denominator = 4 * (nv + nl * (1 - nv));
	return Math.min(1, 1 / denominator);
}

/**
 * Fitted sheen directional albedo exp(a * N.V + b), with a and b quadratic in
 * roughness plus a 1 / (roughness + 0.1) term. These are the oracle's
 * documented curve-fit constants (the Aura shaders now integrate a
 * preintegrated table instead, see physical/sheenAlbedoLut.ts); a fitted curve
 * has no closed form to re-derive, so the constants are stated here.
 */
const SHEEN_FIT = {
	a: [-1.9362, 1.0678, 0.4573, -0.8469] as const,
	b: [-0.6014, 0.5538, -0.467, -0.1255] as const,
};

export function sheenAlbedoFit(nv: number, roughness: number): number {
	const basis = [1, roughness, roughness * roughness, 1 / (roughness + 0.1)];
	const dotc = (c: readonly number[]) => c.reduce((s, ci, i) => s + ci * basis[i]!, 0);
	return clamp01(Math.exp(dotc(SHEEN_FIT.a) * clamp01(nv) + dotc(SHEEN_FIT.b)));
}

/** [H14] eq. 85, in the slope-space form 1 / (pi aT aB (hT^2/aT^2 + hB^2/aB^2 + hN^2)^2). */
export function ggxAnisoD(aT: number, aB: number, nh: number, th: number, bh: number): number {
	const s = (th * th) / (aT * aT) + (bh * bh) / (aB * aB) + nh * nh;
	return 1 / (PI * aT * aB * s * s);
}

/**
 * [H14] eqs. 86 + 99: V = G2 / (4 NL NV), G2 = 1 / (1 + Lambda(v) + Lambda(l)),
 * Lambda(w) = (sqrt(1 + (aT^2 wT^2 + aB^2 wB^2) / wN^2) - 1) / 2.
 * With one cosine at the horizon the continuous one-sided limit is used; with
 * both at the horizon V is singular and the Aura3D guard 0.5 / 1e-6 applies.
 */
export function ggxAnisoV(aT: number, aB: number, tv: number, bv: number, tl: number, bl: number, nv: number, nl: number): number {
	const proj = (t: number, b: number) => aT * aT * t * t + aB * aB * b * b;
	if (nv > 0 && nl > 0) {
		const lambda = (t: number, b: number, n: number) => (Math.sqrt(1 + proj(t, b) / (n * n)) - 1) / 2;
		const g2 = 1 / (1 + lambda(tv, bv, nv) + lambda(tl, bl, nl));
		const v = g2 / (4 * nl * nv);
		return Math.min(v, 0.5 / VIS_GUARD);
	}
	// Limit n -> 0 of n * sqrt(1 + p / n^2) is sqrt(p); V -> 1 / (2 (NL sqrt(pV) + NV sqrt(pL))).
	const denominator = nl * Math.sqrt(proj(tv, bv) + nv * nv) + nv * Math.sqrt(proj(tl, bl) + nl * nl);
	return 0.5 / Math.max(denominator, VIS_GUARD);
}

/** [KHR] anisotropy: alphaT = mix(roughness^2, 1, anisotropy^2). */
export function khrAlphaT(roughness: number, anisotropy: number): number {
	const alpha = roughness * roughness;
	const s = anisotropy * anisotropy;
	return alpha * (1 - s) + s;
}

/** [W07] eq. 33 written as alpha^2 / (pi (cos^2 (alpha^2 - 1) + 1)^2) with cos^2 = 1 - sin^2. */
function ggxD(alpha: number, nh: number): number {
	const a2 = alpha * alpha;
	const c2 = nh * nh;
	const denominator = a2 * c2 + (1 - c2);
	return a2 / (PI * denominator * denominator);
}

/** Isotropic [H14] G2 / (4 NL NV) via Lambda, with the same horizon limits as `ggxAnisoV`. */
function ggxV(alpha: number, nl: number, nv: number): number {
	return ggxAnisoV(alpha, alpha, Math.sqrt(Math.max(0, 1 - nv * nv)), 0, Math.sqrt(Math.max(0, 1 - nl * nl)), 0, nv, nl);
}

// [L] XYZ -> linear sRGB (D65).
const XYZ_TO_SRGB = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.969266, 1.8760108, 0.041556],
	[0.0556434, -0.2040259, 1.0572252]
] as const;

/**
 * [BB17] Fourier-space Gaussian fit of the XYZ colour matching functions,
 * evaluated at optical path difference `opd` (nm) with per-channel phase `shift`.
 * Each lobe is (amplitude, centre, variance); X carries a second lobe.
 */
const SENSITIVITY_LOBES: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
	[[5.4856e-13, 1.681e6, 4.3278e9], [9.747e-14, 2.2399e6, 4.5282e9]],
	[[4.4201e-13, 1.7953e6, 9.3046e9]],
	[[5.2481e-13, 2.2084e6, 6.6121e9]]
];
const SENSITIVITY_NORMALISATION = 1.0685e-7;

function sensitivity(opd: number, shift: V3): V3 {
	const phase = 2 * PI * opd * 1e-9;
	const xyz = SENSITIVITY_LOBES.map((lobes, channel) =>
		lobes.reduce(
			(sum, [amplitude, centre, variance]) =>
				sum + amplitude * Math.sqrt(2 * PI * variance) * Math.cos(centre * phase + shift[channel]!) * Math.exp(-variance * phase * phase),
			0
		) / SENSITIVITY_NORMALISATION
	);
	return XYZ_TO_SRGB.map((row) => row[0] * xyz[0]! + row[1] * xyz[1]! + row[2] * xyz[2]!) as V3;
}

const fresnelNormal = (n2: number, n1: number): number => {
	const r = (n2 - n1) / (n2 + n1);
	return r * r;
};

/** [BB17]/[KHR] thin-film iridescence Fresnel for incident medium `n1`, film `filmIor`, base F0 `baseF0`. */
export function iridescenceFresnel(n1: number, filmIor: number, cos1: number, thicknessNm: number, baseF0: V3): V3 {
	// KHR: fade the film IOR to the outside IOR as thickness goes to 0 (smoothstep over 0..30 nm).
	const t = clamp01(thicknessNm / 0.03);
	const n2 = n1 + (filmIor - n1) * (t * t * (3 - 2 * t));
	// Snell: sin^2(theta2) = (n1/n2)^2 sin^2(theta1); total internal reflection reflects everything.
	const cos2Sq = 1 - ((n1 / n2) ** 2) * (1 - cos1 * cos1);
	if (cos2Sq < 0) return [1, 1, 1];
	const cos2 = Math.sqrt(cos2Sq);
	// First interface (air/film), Schlick.
	const r12 = schlickSG(fresnelNormal(n2, n1), 1, cos1);
	const t121 = 1 - r12;
	const phi12 = n2 < n1 ? PI : 0;
	const phi21 = PI - phi12;
	const opd = 2 * n2 * thicknessNm * cos2;
	const out: V3 = [0, 0, 0];
	const rTerms: number[] = [];
	const cs: number[] = [];
	const phis: number[] = [];
	for (let c = 0; c < 3; c++) {
		// Second interface (film/base): base IOR recovered from its normal-incidence F0.
		const s = Math.sqrt(Math.min(Math.max(baseF0[c]!, 0), 0.9999));
		const n3 = (1 + s) / (1 - s);
		const r23 = schlickSG(fresnelNormal(n3, n2), 1, cos2);
		const r123 = Math.min(Math.max(r12 * r23, 1e-5), 0.9999);
		const rs = (t121 * t121 * r23) / (1 - r123);
		out[c] = r12 + rs; // order-0 term C0
		rTerms[c] = Math.sqrt(r123);
		cs[c] = rs - t121;
		phis[c] = phi21 + (n3 < n2 ? PI : 0);
	}
	for (let m = 1; m <= 2; m++) {
		const sm = sensitivity(m * opd, [m * phis[0]!, m * phis[1]!, m * phis[2]!]);
		for (let c = 0; c < 3; c++) {
			const cm = cs[c]! * rTerms[c]! ** m;
			out[c] += cm * 2 * sm[c]!;
		}
	}
	return [Math.max(out[0], 0), Math.max(out[1], 0), Math.max(out[2], 0)];
}

/** [LR14] specular occlusion. */
export function frostbiteSpecularOcclusion(nv: number, ao: number, roughness: number): number {
	return clamp01((nv + ao) ** Math.pow(2, -16 * roughness - 1) - 1 + ao);
}

/** Aura3D transmission convention (`physical/transmission.glsl.ts`): roughness scaled by saturate((ior - 1) * 2). */
export function iorScaledRoughness(roughness: number, ior: number): number {
	return clamp01(roughness) * clamp01((ior - 1) * 2);
}

/** [KHR] volume: transmittance = c^(d / attenuationDistance); infinite distance transmits fully. */
export function beerLambert(distance: number, color: V3, attenuationDistance: number): V3 {
	if (!Number.isFinite(attenuationDistance)) return [1, 1, 1];
	return color.map((c) => Math.pow(c, distance / attenuationDistance)) as V3;
}

/** [KHR] ior: F0 = ((n - n_i) / (n + n_i))^2. */
export function khrIorF0(ior: number, incident = 1): number {
	return fresnelNormal(ior, incident);
}

/** [KHR] specular: dielectric F0 colour = min(F0(ior) * specularColorFactor, 1) * specularFactor. */
export function khrSpecularColor(ior: number, colorFactor: V3, specularFactor: number): V3 {
	const f0 = khrIorF0(ior);
	return colorFactor.map((c) => Math.min(f0 * c, 1) * specularFactor) as V3;
}

/** [KHR] specular: F90 = mix(specularFactor, 1, metallic). */
export function khrSpecularF90(specularFactor: number, metallic: number): number {
	return specularFactor * (1 - metallic) + metallic;
}

/** [KHR] clearcoat layering with Fc = Schlick(0.04, 1, NVcc). */
export function khrClearcoatCompose(base: V3, clearcoat: number, nvcc: number, coatDirect: V3, coatIndirect: V3): V3 {
	const fc = schlickSG(0.04, 1, nvcc);
	return base.map((b, i) => b - b * clearcoat * fc + clearcoat * (coatDirect[i]! + coatIndirect[i]!)) as V3;
}

/**
 * GL LINEAR / CLAMP_TO_EDGE lookup (OpenGL ES 3.0 section 3.8.10) of a 16x16 RG
 * table at (u = roughness, v = NV); returns [A, B]. The table is input data.
 */
export function bilinearRG(table: ArrayLike<number>, size: number, u: number, v: number): [number, number] {
	const x = clamp01(u) * size - 0.5;
	const y = clamp01(v) * size - 0.5;
	const i0 = Math.floor(x);
	const j0 = Math.floor(y);
	const a = x - i0;
	const b = y - j0;
	const at = (i: number, j: number, k: number) =>
		table[(Math.min(Math.max(j, 0), size - 1) * size + Math.min(Math.max(i, 0), size - 1)) * 2 + k]!;
	const channel = (k: number) =>
		(1 - a) * (1 - b) * at(i0, j0, k) + a * (1 - b) * at(i0 + 1, j0, k) + (1 - a) * b * at(i0, j0 + 1, k) + a * b * at(i0 + 1, j0 + 1, k);
	return [channel(0), channel(1)];
}

/** [K13] split-sum single scattering F0 A + F90 B. */
export function splitSum(ab: readonly [number, number], f0: V3, f90: number): V3 {
	return f0.map((f) => f * ab[0] + f90 * ab[1]) as V3;
}

/** [FA19] eqs. 15-17: Ess = A + B, Favg = F0 + (1 - F0)/21, Fms = FssEss Favg / (1 - Ems Favg), multi = Fms Ems. */
export function fdezAgueraMulti(ab: readonly [number, number], f0: V3, f90: number): V3 {
	const ems = 1 - (ab[0] + ab[1]);
	const fssEss = splitSum(ab, f0, f90);
	return f0.map((f, i) => {
		const favg = f + (1 - f) / 21;
		return (fssEss[i]! * favg * ems) / (1 - ems * favg);
	}) as V3;
}

/**
 * Direct GGX with reciprocal multiscatter compensation. V and L lie in one
 * plane on the same side of N, so H bisects their polar angles:
 * N.H = cos((thetaV + thetaL) / 2), V.H = cos((thetaL - thetaV) / 2).
 */
export function ggxDirectMultiscatter(nv: number, nl: number, roughness: number, f0: V3, f90: number, abV: readonly [number, number], abL: readonly [number, number]): V3 {
	const alpha = roughness * roughness;
	const tv = Math.acos(clamp01(nv));
	const tl = Math.acos(clamp01(nl));
	const nh = clamp01(Math.cos((tv + tl) / 2));
	const vh = clamp01(Math.cos((tl - tv) / 2));
	const dv = ggxD(alpha, nh) * ggxV(alpha, nl, nv);
	const essV = abV[0] + abV[1];
	const essL = abL[0] + abL[1];
	const comp = (1 - essV) * (1 - essL);
	const fssV = splitSum(abV, f0, f90);
	const fssL = splitSum(abL, f0, f90);
	return f0.map((f, i) => {
		const single = schlickSG(f, f90, vh) * dv;
		const favg = f + (1 - f) / 21;
		const fms = (fssV[i]! * fssL[i]! * favg) / (1 - comp * favg + VIS_GUARD);
		return single + fms * comp;
	}) as V3;
}

/** Sheen lobe for in-plane V/L: D_Charlie(N.H) V_Neubelt colour, N.H from the half polar angle. */
export function sheenLobe(nv: number, nl: number, color: V3, roughness: number): V3 {
	const nh = clamp01(Math.cos((Math.acos(clamp01(nv)) + Math.acos(clamp01(nl))) / 2));
	const lobe = charlieD(roughness, nh) * neubeltV(nv, nl);
	return color.map((c) => c * lobe) as V3;
}

/**
 * Snell refraction of the view ray into a surface with normal +Z (V at polar
 * angle theta in the YZ plane): the transmitted direction has tangential part
 * -(1/ior) sin(theta) and normal part -cos(theta_t), cos^2 = 1 - sin^2/ior^2;
 * total internal reflection yields no ray. Scaled by thickness and model scale.
 */
export function snellTransmissionRay(nv: number, thickness: number, ior: number, modelScale: V3): V3 {
	const sinI = Math.sqrt(Math.max(0, 1 - nv * nv));
	const sinT = sinI / ior;
	const cosT2 = 1 - sinT * sinT;
	if (cosT2 < 0) return [Number.NaN, Number.NaN, Number.NaN];
	const dir: V3 = [0, -sinT, -Math.sqrt(cosT2)];
	return [dir[0] * thickness * modelScale[0], dir[1] * thickness * modelScale[1], dir[2] * thickness * modelScale[2]];
}

/** Independent split-sum table texel (centre sampling) from Heitz G2 quadrature; [A, B]. */
export function independentSplitSumTexel(i: number, j: number, size: number): [number, number] {
	const basis = integrateSplitSum((j + 0.5) / size, (i + 0.5) / size, { polarSamples: 256, azimuthSamples: 256 });
	return [basis.f0, basis.f90];
}

// ---------------------------------------------------------------------------
// Case grid. The axes are inputs chosen for coverage (uniform grids over each
// argument's domain, plus the documented fixed parameters); argorder[0] is the
// fastest-varying axis.

export const F0_PALETTE: readonly V3[] = [
	[0.04, 0.04, 0.04],
	[0.5, 0.4, 0.3],
	[0.9, 0.9, 0.9],
	[0.2, 0.6, 0.9]
];
const F0_INDEX = [0, 1.3333, 2.6666, 3.9999];
export const palette = (x: number): V3 => F0_PALETTE[Math.max(0, Math.min(3, Math.floor(x)))]!;

export interface IndependentCase {
	readonly fn: string;
	readonly desc: string;
	readonly out: 1 | 3;
	readonly argorder: readonly string[];
	readonly axes: Readonly<Record<string, readonly number[]>>;
	readonly fixed: Readonly<Record<string, number | readonly number[]>>;
	/** Whether the expectation consumes the oracle's 16x16 split-sum table (see `TableLookup`). */
	readonly usesTable?: boolean;
}

export const INDEPENDENT_BSDF_CASES: readonly IndependentCase[] = [
	{ fn: "dCharlie", desc: "D_Charlie [EK17 eq. 2]", out: 1, argorder: ["roughness", "dotNH"], axes: { roughness: linspace(0.05, 1, 16), dotNH: range01(16) }, fixed: {} },
	{ fn: "vNeubelt", desc: "V_Neubelt [NP13]", out: 1, argorder: ["dotNV", "dotNL"], axes: { dotNV: range01(16), dotNL: range01(16) }, fixed: {} },
	{ fn: "iblSheenBRDF", desc: "fitted sheen albedo (Aura3D WGSL coefficients)", out: 1, argorder: ["dotNV", "roughness"], axes: { dotNV: range01(16), roughness: linspace(1e-4, 1, 16) }, fixed: {} },
	{ fn: "dGGXAnisotropic", desc: "anisotropic GGX D [H14 eq. 85]; alphaT=0.49 alphaB=0.09", out: 1, argorder: ["dotNH", "dotTH", "dotBH"], axes: { dotNH: range01(16), dotTH: linspace(-1, 1, 16), dotBH: linspace(-1, 1, 8) }, fixed: { alphaT: 0.49, alphaB: 0.09 } },
	{ fn: "vGGXAnisotropic", desc: "anisotropic height-correlated visibility [H14 eqs. 86, 99]", out: 1, argorder: ["dotNV", "dotNL", "alphaT"], axes: { dotNV: range01(16), dotNL: range01(16), alphaT: linspace(0.04, 1, 8) }, fixed: { alphaB: 0.09, dotTV: 0.3, dotBV: 0.4, dotTL: 0.55, dotBL: 0.65 } },
	{ fn: "evalIridescence", desc: "thin-film iridescence [BB17]/[KHR]; baseF0=(0.04,0.2,0.5)", out: 3, argorder: ["cosTheta1", "thickness", "eta2"], axes: { cosTheta1: linspace(0.001, 1, 16), thickness: linspace(0, 1200, 16), eta2: linspace(1, 2.4, 8) }, fixed: { outsideIOR: 1, baseF0: [0.04, 0.2, 0.5] } },
	{ fn: "computeSpecularOcclusion", desc: "specular occlusion [LR14]", out: 1, argorder: ["dotNV", "ao", "roughness"], axes: { dotNV: range01(16), ao: range01(16), roughness: range01(8) }, fixed: {} },
	{ fn: "applyIorToRoughness", desc: "IOR roughness scale (Aura3D transmission chunk)", out: 1, argorder: ["roughness", "ior"], axes: { roughness: range01(16), ior: linspace(1, 2.4, 8) }, fixed: {} },
	{ fn: "volumeAttenuation", desc: "volume transmittance [KHR volume]; color=(0.85,0.62,0.35)", out: 3, argorder: ["transmissionDistance", "attenuationDistance"], axes: { transmissionDistance: linspace(0, 4, 16), attenuationDistance: linspace(0.1, 10, 8) }, fixed: { attenuationColor: [0.85, 0.62, 0.35] } },
	{ fn: "iorToF0", desc: "F0 from IOR [KHR ior]", out: 1, argorder: ["ior"], axes: { ior: linspace(1, 2.4, 16) }, fixed: { incidentIOR: 1 } },
	{ fn: "specIorSpecularColor", desc: "dielectric specular colour [KHR specular]", out: 3, argorder: ["ior", "specularIntensity"], axes: { ior: linspace(1, 2.4, 16), specularIntensity: range01(8) }, fixed: { specularColorFactor: [0.9, 0.8, 0.7] } },
	{ fn: "specIorSpecularF90", desc: "specular F90 [KHR specular]", out: 1, argorder: ["specularIntensity", "metalness"], axes: { specularIntensity: range01(16), metalness: range01(8) }, fixed: {} },
	{ fn: "clearcoatFccCompose", desc: "clearcoat layering [KHR clearcoat]", out: 3, argorder: ["clearcoat", "dotNVcc", "scale"], axes: { clearcoat: range01(16), dotNVcc: range01(16), scale: range01(8) }, fixed: {} },
	{ fn: "environmentBRDF", desc: "split-sum F0 A + F90 B [K13]; f90=1", out: 3, argorder: ["dotNV", "roughness", "f0idx"], axes: { dotNV: range01(16), roughness: range01(16), f0idx: F0_INDEX }, fixed: { f90: 1 }, usesTable: true },
	{ fn: "multiscatteringSingle", desc: "single scattering FssEss [FA19]", out: 3, argorder: ["dotNV", "roughness", "f0idx"], axes: { dotNV: range01(16), roughness: range01(16), f0idx: F0_INDEX }, fixed: { specularF90: 1 }, usesTable: true },
	{ fn: "multiscatteringMulti", desc: "multiple scattering Fms Ems [FA19]", out: 3, argorder: ["dotNV", "roughness", "f0idx"], axes: { dotNV: range01(16), roughness: range01(16), f0idx: F0_INDEX }, fixed: { specularF90: 1 }, usesTable: true },
	{ fn: "sheenDirect", desc: "direct sheen lobe; sheenColor=(0.4,0.6,0.9)", out: 3, argorder: ["dotNV", "dotNL", "roughness"], axes: { dotNV: range01(16), dotNL: range01(16), roughness: range01(8) }, fixed: { sheenColor: [0.4, 0.6, 0.9] } },
	{ fn: "brdfGGXMultiscatter", desc: "direct GGX [W07][H14][K13] + reciprocal multiscatter", out: 3, argorder: ["dotNV", "dotNL", "roughness", "f0idx"], axes: { dotNV: range01(16), dotNL: range01(16), roughness: linspace(0.05, 1, 4), f0idx: F0_INDEX }, fixed: { specularF90: 1 }, usesTable: true },
	{ fn: "anisotropyAlphaT", desc: "alphaT [KHR anisotropy]", out: 1, argorder: ["roughness", "anisotropy"], axes: { roughness: range01(16), anisotropy: range01(16) }, fixed: {} },
	{ fn: "volumeTransmissionRay", desc: "refracted transmission ray (Snell); identity model, modelScale 1.5", out: 3, argorder: ["dotNV", "thickness", "ior"], axes: { dotNV: range01(16), thickness: linspace(0, 3, 16), ior: linspace(1, 2.4, 8) }, fixed: { modelScale: [1.5, 1.5, 1.5] } }
];

/** Table lookup used by table-backed expectations: (roughness, NV) -> [A, B]. */
export type TableLookup = (roughness: number, nv: number) => [number, number];

/** Independently derived expected outputs for one case sample. */
export function independentExpected(c: IndependentCase, args: Record<string, number>, table: TableLookup): number[] {
	const fx = (n: string) => c.fixed[n] as number;
	const v3 = (n: string) => c.fixed[n] as unknown as V3;
	switch (c.fn) {
		case "dCharlie":
			return [charlieD(args.roughness!, args.dotNH!)];
		case "vNeubelt":
			return [neubeltV(args.dotNV!, args.dotNL!)];
		case "iblSheenBRDF":
			return [sheenAlbedoFit(args.dotNV!, args.roughness!)];
		case "dGGXAnisotropic":
			return [ggxAnisoD(fx("alphaT"), fx("alphaB"), args.dotNH!, args.dotTH!, args.dotBH!)];
		case "vGGXAnisotropic":
			return [ggxAnisoV(args.alphaT!, fx("alphaB"), fx("dotTV"), fx("dotBV"), fx("dotTL"), fx("dotBL"), args.dotNV!, args.dotNL!)];
		case "evalIridescence":
			return iridescenceFresnel(fx("outsideIOR"), args.eta2!, args.cosTheta1!, args.thickness!, v3("baseF0"));
		case "computeSpecularOcclusion":
			return [frostbiteSpecularOcclusion(args.dotNV!, args.ao!, args.roughness!)];
		case "applyIorToRoughness":
			return [iorScaledRoughness(args.roughness!, args.ior!)];
		case "volumeAttenuation":
			return beerLambert(args.transmissionDistance!, v3("attenuationColor"), args.attenuationDistance!);
		case "iorToF0":
			return [khrIorF0(args.ior!, fx("incidentIOR"))];
		case "specIorSpecularColor":
			return khrSpecularColor(args.ior!, v3("specularColorFactor"), args.specularIntensity!);
		case "specIorSpecularF90":
			return [khrSpecularF90(args.specularIntensity!, args.metalness!)];
		case "clearcoatFccCompose": {
			// Same synthetic layer inputs as the oracle dispatch: linear functions of `scale`.
			const s = args.scale!;
			const base: V3 = [0.5 * s + 0.1, 0.4 * s + 0.1, 0.3 * s + 0.1];
			const k = 0.5 + 0.5 * s;
			const q = 1 - 0.5 * s;
			return khrClearcoatCompose(base, args.clearcoat!, args.dotNVcc!, [0.8 * k, 0.2 * k, 0.1 * k], [0.1 * q, 0.3 * q, 0.6 * q]);
		}
		case "environmentBRDF":
			return splitSum(table(args.roughness!, args.dotNV!), palette(args.f0idx!), fx("f90"));
		case "multiscatteringSingle":
			return splitSum(table(args.roughness!, args.dotNV!), palette(args.f0idx!), fx("specularF90"));
		case "multiscatteringMulti":
			return fdezAgueraMulti(table(args.roughness!, args.dotNV!), palette(args.f0idx!), fx("specularF90"));
		case "sheenDirect":
			return sheenLobe(args.dotNV!, args.dotNL!, v3("sheenColor"), args.roughness!);
		case "brdfGGXMultiscatter":
			return ggxDirectMultiscatter(args.dotNV!, args.dotNL!, args.roughness!, palette(args.f0idx!), fx("specularF90"), table(args.roughness!, args.dotNV!), table(args.roughness!, args.dotNL!));
		case "anisotropyAlphaT":
			return [khrAlphaT(args.roughness!, args.anisotropy!)];
		case "volumeTransmissionRay":
			return snellTransmissionRay(args.dotNV!, args.thickness!, args.ior!, v3("modelScale"));
		default:
			throw new Error(`no independent derivation for case ${c.fn}`);
	}
}
