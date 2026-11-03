/**
 * r185-oracle.test.ts — checks the PRD-04 CPU BSDF oracle
 * (../oracles/physical-bsdf-reference.ts) against independently derived
 * expectations (../oracles/independent-bsdf-goldens.ts: each value re-derived
 * from the cited publication or Khronos specification, in a different
 * algebraic form where one exists). S5-WP29-05 replaced the former golden,
 * which had been produced by evaluating another engine's GLSL on a GPU; no
 * value here comes from running or reading another 3D engine.
 *
 * The file keeps its historical name. The 16x16 split-sum table the oracle
 * samples (oracles/dfg-lut.ts) is Aura3D's own integration (generateDfgLut in
 * packages/rendering/src/program/DFGLutData.ts); it is input data to the oracle
 * and is bounded separately against an independent quadrature of the same
 * integral (last describe block).
 *
 * PRD-04 P1-3 tolerance: <= 1e-4. Both sides are now CPU binary64, so every
 * case, including the table-backed ones (same table, independently written
 * sampler), is held to 1e-6; the former GPU half-float filtering floor
 * (2e-3 on table-backed cases) no longer applies.
 */
import { describe, expect, it } from "vitest";
import * as ref from "../oracles/physical-bsdf-reference";
import { DFG_LUT, DFG_LUT_SIZE } from "../oracles/dfg-lut";
import {
	INDEPENDENT_BSDF_CASES,
	bilinearRG,
	independentExpected,
	independentSplitSumTexel,
	type IndependentCase
} from "../oracles/independent-bsdf-goldens";

type GoldenCase = IndependentCase;

function vec3(v: number | number[]): ref.Vec3 {
	return Array.isArray(v) ? [v[0], v[1], v[2]] : [v, v, v];
}

const F0_PALETTE: ref.Vec3[] = [
	[0.04, 0.04, 0.04],
	[0.5, 0.4, 0.3],
	[0.9, 0.9, 0.9],
	[0.2, 0.6, 0.9]
];

function palIdx(x: number): number {
	return Math.max(0, Math.min(3, Math.floor(x)));
}

/** Dispatch one case to the JS oracle under test; returns per-sample values. */
function evaluate(c: GoldenCase, args: Record<string, number>): number[] {
	const fx = (n: string) => c.fixed[n] as number;
	switch (c.fn) {
		case "dCharlie":
			return [ref.dCharlie(args.roughness, args.dotNH)];
		case "vNeubelt":
			return [ref.vNeubelt(args.dotNV, args.dotNL)];
		case "iblSheenBRDF":
			return [ref.iblSheenBRDF(args.dotNV, args.roughness)];
		case "dGGXAnisotropic":
			return [ref.dGGXAnisotropic(fx("alphaT"), fx("alphaB"), args.dotNH, args.dotTH, args.dotBH)];
		case "vGGXAnisotropic":
			return [ref.vGGXAnisotropic(
				args.alphaT, fx("alphaB"), fx("dotTV"), fx("dotBV"),
				fx("dotTL"), fx("dotBL"), args.dotNV, args.dotNL
			)];
		case "anisotropyAlphaT":
			return [ref.anisotropyAlphaT(args.roughness, args.anisotropy)];
		case "evalIridescence":
			return ref.evalIridescence(fx("outsideIOR"), args.eta2, args.cosTheta1, args.thickness, vec3(fx("baseF0")));
		case "computeSpecularOcclusion":
			return [ref.computeSpecularOcclusion(args.dotNV, args.ao, args.roughness)];
		case "applyIorToRoughness":
			return [ref.applyIorToRoughness(args.roughness, args.ior)];
		case "volumeAttenuation":
			return ref.volumeAttenuation(args.transmissionDistance, vec3(fx("attenuationColor")), args.attenuationDistance);
		case "iorToF0":
			return [ref.iorToFresnel0f(args.ior, 1.0)];
		case "specIorSpecularColor":
			return ref.specIorSpecularColor(args.ior, vec3(fx("specularColorFactor")), args.specularIntensity);
		case "specIorSpecularF90":
			return [ref.specIorSpecularF90(args.specularIntensity, args.metalness)];
		case "clearcoatFccCompose": {
			const s = args.scale;
			const outgoing: ref.Vec3 = [0.5 * s + 0.1, 0.4 * s + 0.1, 0.3 * s + 0.1];
			const ccD: ref.Vec3 = [0.8 * (0.5 + 0.5 * s), 0.2 * (0.5 + 0.5 * s), 0.1 * (0.5 + 0.5 * s)];
			const ccI: ref.Vec3 = [0.1 * (1 - 0.5 * s), 0.3 * (1 - 0.5 * s), 0.6 * (1 - 0.5 * s)];
			return ref.clearcoatCompose(outgoing, args.clearcoat, args.dotNVcc, ccD, ccI);
		}
		case "environmentBRDF":
			return ref.environmentBRDF(args.dotNV, F0_PALETTE[palIdx(args.f0idx)], 1.0, args.roughness);
		case "multiscatteringSingle":
			return ref.computeMultiscattering(args.dotNV, F0_PALETTE[palIdx(args.f0idx)], 1.0, args.roughness).single;
		case "multiscatteringMulti":
			return ref.computeMultiscattering(args.dotNV, F0_PALETTE[palIdx(args.f0idx)], 1.0, args.roughness).multi;
		case "sheenDirect":
			return ref.sheenDirect(args.dotNV, args.dotNL, vec3(fx("sheenColor")), args.roughness);
		case "brdfGGXMultiscatter": {
			const v: ref.Vec3 = [0, Math.sqrt(Math.max(0, 1 - args.dotNV * args.dotNV)), args.dotNV];
			const l: ref.Vec3 = [0, Math.sqrt(Math.max(0, 1 - args.dotNL * args.dotNL)), args.dotNL];
			const n: ref.Vec3 = [0, 0, 1];
			const h = ref.norm3(ref.add3(l, v));
			const dotVH = Math.min(Math.max(ref.dot3(v, h), 0), 1);
			const dotNH = Math.min(Math.max(ref.dot3(n, h), 0), 1);
			const f0 = F0_PALETTE[palIdx(args.f0idx)];
			return ref.brdfGGXMultiscatter(args.dotNL, args.dotNV, dotVH, dotNH, f0, 1.0, args.roughness);
		}
		case "volumeTransmissionRay": {
			const n: ref.Vec3 = [0, 0, 1];
			const v: ref.Vec3 = [0, Math.sqrt(Math.max(0, 1 - args.dotNV * args.dotNV)), args.dotNV];
			return ref.volumeTransmissionRay(n, v, args.thickness, args.ior, [1.5, 1.5, 1.5]);
		}
		default:
			throw new Error(`no oracle dispatch for golden case ${c.fn}`);
	}
}

const tableLookup = (roughness: number, nv: number) => bilinearRG(DFG_LUT, DFG_LUT_SIZE, roughness, nv);

describe("BSDF oracle vs independently derived values (PRD-04 P1-3, S5-WP29-05)", () => {
	it("case grid is complete and every case has an oracle dispatch", () => {
		expect(INDEPENDENT_BSDF_CASES.length).toBeGreaterThanOrEqual(19);
		expect(new Set(INDEPENDENT_BSDF_CASES.map((c) => c.fn)).size).toBe(INDEPENDENT_BSDF_CASES.length);
		for (const c of INDEPENDENT_BSDF_CASES) {
			for (const name of c.argorder) expect(c.axes[name]?.length, `${c.fn}.${name}`).toBeGreaterThan(0);
		}
	});

	for (const c of INDEPENDENT_BSDF_CASES) {
		it(`${c.fn}: ${c.desc}`, () => {
			// argorder[0] is the fastest axis.
			const total = c.argorder.reduce((acc, k) => acc * c.axes[k]!.length, 1);
			let worst = 0;
			let worstAt = "";
			let nonFinite = 0;
			for (let idx = 0; idx < total; idx++) {
				const args: Record<string, number> = {};
				let stride = 1;
				for (const name of c.argorder) {
					const axis = c.axes[name]!;
					args[name] = axis[Math.floor(idx / stride) % axis.length]!;
					stride *= axis.length;
				}
				const got = evaluate(c, args);
				const expected = independentExpected(c, args, tableLookup);
				expect(got.length, `${c.fn} output arity`).toBe(c.out);
				expect(expected.length, `${c.fn} expected arity`).toBe(c.out);
				for (let k = 0; k < c.out; k++) {
					if (!Number.isFinite(expected[k]!)) {
						// e.g. roughness = 0 in the Charlie NDF (1/alpha blow-up): the
						// oracle must be non-finite there too.
						expect(Number.isFinite(got[k]!), `${c.fn}@${idx}.${k} finite where the derivation is not`).toBe(false);
						nonFinite += 1;
						continue;
					}
					expect(Number.isFinite(got[k]!), `${c.fn}@${idx}.${k} non-finite (expected ${expected[k]})`).toBe(true);
					const abs = Math.abs(got[k]! - expected[k]!);
					const rel = abs / Math.max(Math.abs(expected[k]!), 1e-6);
					const err = Math.min(abs, rel);
					if (err > worst) {
						worst = err;
						worstAt = `@${idx}.${k} ${JSON.stringify(args)} got=${got[k]} expected=${expected[k]}`;
					}
				}
			}
			expect(nonFinite, `${c.fn}: every sample non-finite`).toBeLessThan(total * c.out);
			// Per sample, relative-or-absolute: min(abs, rel) <= 1e-6. Binary64 on both
			// sides; the only systematic difference is the oracle's (and the shader
			// chunks') six-digit 1/21 = 0.047619 in Favg, worth up to ~7e-9 relative.
			expect(worst, `${c.fn} worst min(abs,rel)=${worst.toExponential(3)} ${worstAt}`).toBeLessThanOrEqual(1e-6);
		});
	}
});

describe("split-sum table sampled by the oracle vs an independent quadrature", () => {
	// dfg-lut.ts is input data (16x16 RG binary16, texel centres; Aura's
	// 65536-point Hammersley integration, DFG_LUT_SAMPLES). Each texel is
	// re-integrated independently (Heitz height-correlated G2, Schlick (1-VH)^5,
	// 256 x 256 Gauss-Legendre/midpoint quadrature;
	// native-reference-environment-clean.ts). Measured agreement (2026-11-02):
	// <= 3.13e-4 for N.V >= 0.28 (rows 4..15; binary16 half-ulp near 1 is
	// 2.4e-4); the four grazing rows (N.V <= 0.22) differ by up to 2.31e-3, where
	// sampled estimators are least accurate. The bounds below are those
	// measurements, not a claim about which estimator a renderer should use.
	it("every texel agrees with the independent integral within the measured bounds", () => {
		const n = DFG_LUT_SIZE;
		const failures: string[] = [];
		for (let j = 0; j < n; j++) {
			const bound = j >= 4 ? 3.2e-4 : 2.4e-3;
			for (let i = 0; i < n; i++) {
				const [a, b] = independentSplitSumTexel(i, j, n);
				const t = (j * n + i) * 2;
				const da = Math.abs(a - DFG_LUT[t]!);
				const db = Math.abs(b - DFG_LUT[t + 1]!);
				if (da > bound || db > bound) failures.push(`texel(${i},${j}) dA=${da.toExponential(2)} dB=${db.toExponential(2)} bound=${bound}`);
			}
		}
		expect(failures).toEqual([]);
	}, 60_000); // heavy deterministic computation; ACR shards exceed the 5 s default
});
