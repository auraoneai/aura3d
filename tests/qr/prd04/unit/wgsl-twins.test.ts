/**
 * wgsl-twins.test.ts — PRD-04 P6-1 structural gate: every a3d_prd04_* chunk
 * carries a `wgsl` twin whose declared `a3d*` function names cover the GLSL
 * chunk's (§8.12 "same a3d_ name"), with no GLSL-isms left behind.
 */
import { describe, expect, it } from "vitest";
import { PRD04_SHADER_CHUNKS } from "../../../../packages/rendering/src/shaders/physical/index";
import { PRD04_WGSL_TWINS } from "../../../../packages/rendering/src/shaders/physical-wgsl/index";

function glslFunctionNames(glsl: string): Set<string> {
	// Match declarations/call targets named a3d* before a "(" — every chunk's
	// public surface is a3d-prefixed, so declarations are unambiguous.
	const names = new Set<string>();
	for (const m of glsl.matchAll(/(?:^|\s)(?:vec[234]|float|void|mat[234]|int|bool|highp\s+vec3)\s+(a3d[A-Za-z0-9_]*)\s*\(/g)) {
		names.add(m[1]);
	}
	return names;
}

function wgslFunctionNames(wgsl: string): Set<string> {
	const names = new Set<string>();
	for (const m of wgsl.matchAll(/fn\s+(a3d[A-Za-z0-9_]*)\s*\(/g)) {
		names.add(m[1]);
	}
	return names;
}

describe("PRD-04 P6-1 WGSL twins", () => {
	it("every a3d_prd04_* chunk attaches a non-empty wgsl twin", () => {
		expect(PRD04_SHADER_CHUNKS).toHaveLength(15);
		for (const chunk of PRD04_SHADER_CHUNKS) {
			expect(typeof chunk.wgsl, chunk.name).toBe("string");
			expect(chunk.wgsl!.trim().length, chunk.name).toBeGreaterThan(0);
			expect(PRD04_WGSL_TWINS[chunk.name], chunk.name).toBe(chunk.wgsl);
		}
	});

	it("WGSL twin function names cover the GLSL chunk's a3d* functions", () => {
		for (const chunk of PRD04_SHADER_CHUNKS) {
			const glslNames = glslFunctionNames(chunk.glsl);
			const wgslNames = wgslFunctionNames(chunk.wgsl!);
			for (const name of glslNames) {
				expect(wgslNames.has(name), `${chunk.name}: missing WGSL twin for ${name}`).toBe(true);
			}
		}
	});

	it("WGSL twins contain no GLSL-only constructs", () => {
		const banned = [
			/\bvec[234]\s*\(/, // GLSL vec constructors (WGSL uses vecN<f32>/vecNf)
			/\bmat[234]\s*\(/, // GLSL mat constructors
			/\btextureLod\b/,
			/\btextureSize\s*\(/,
			/\bdFdx\b|\bdFdy\b/,
			/\binout\b|\bconst\s+in\b|\bhighp\b/,
			/\bsampler2D\b/,
			/#ifdef|#endif|#if\s+defined/,
			/\bisinf\b/
		];
		for (const chunk of PRD04_SHADER_CHUNKS) {
			for (const pattern of banned) {
				expect(pattern.test(chunk.wgsl!), `${chunk.name} contains ${pattern}`).toBe(false);
			}
		}
	});

	it("shared structs exist on both sides where the GLSL chunk declares them", () => {
		const expectations: Record<string, string[]> = {
			a3d_prd04_bsdf_lobes_common: ["A3DPrd04Lobes"],
			a3d_prd04_debug_view: ["A3DPrd04DebugInput"],
			a3d_prd04_transmission: ["A3DPrd04TransmissionUniforms"]
		};
		for (const chunk of PRD04_SHADER_CHUNKS) {
			for (const structName of expectations[chunk.name] ?? []) {
				expect(chunk.wgsl!, `${chunk.name} missing struct ${structName}`).toContain(`struct ${structName}`);
			}
		}
	});

	it("iridescence integrates the same visible spectrum and CIE response in both languages", () => {
		const chunk = PRD04_SHADER_CHUNKS.find((entry) => entry.name === "a3d_prd04_iridescence")!;
		const glsl = chunk.glsl;
		const wgsl = chunk.wgsl!;
		const glslCie = glsl.match(/vec3 a3dPrd04CieXyz\([^)]*\)\s*\{([^}]*)\}/s)![1];
		const wgslCie = wgsl.match(/fn a3dPrd04CieXyz\([^)]*\)\s*->\s*vec3f\s*\{([^}]*)\}/s)![1];
		const glslFits = Array.from(glslCie.matchAll(/\(wavelength - ([\d.]+)\) \* \(wavelength < ([\d.]+) \? ([\d.]+) : ([\d.]+)\)/g),
			(m) => [m[1], m[2], m[3], m[4]]);
		const wgslFits = Array.from(wgslCie.matchAll(/\(wavelength - ([\d.]+)\) \* select\(([\d.]+), ([\d.]+), wavelength < ([\d.]+)\)/g),
			(m) => [m[1], m[4], m[3], m[2]]);
		expect(glslFits).toHaveLength(7);
		expect(wgslFits).toEqual(glslFits);
		const response = (source: string) => source.match(/return vec3f?\(([\s\S]*?)\);/)![1].replace(/\s/g, "");
		expect(response(wgslCie)).toBe(response(glslCie));
		const numbers = (source: string) => source.match(/-?\d+\.\d+/g);
		const glslMatrix = glsl.match(/mat3 xyzToRgb = mat3\(([\s\S]*?)\);/)![1];
		const wgslMatrix = wgsl.match(/let xyzToRgb = mat3x3f\(([\s\S]*?)\n\s*\);/)![1];
		expect(numbers(wgslMatrix)).toEqual(numbers(glslMatrix));
		for (const source of [glsl, wgsl]) {
			expect(source).toMatch(/i <= 40/);
			expect(source).toMatch(/380\.0 \+ 10\.0 \* (?:float|f32)\(i\)/);
			expect(source).toContain("cos(4.0 * PI * n2 * thickness * c2 / wavelength)");
			expect(source).toContain("weight * 0.5 * (reflectedS + reflectedP)");
			expect(source).toContain("normalization += weight");
		}
	});

	it("WGSL iridescence handles empty films, total reflection, bounded inputs and energy", () => {
		const wgsl = PRD04_SHADER_CHUNKS.find((entry) => entry.name === "a3d_prd04_iridescence")!.wgsl!;
		expect(wgsl).toMatch(/if \(thickness <= 0\.0\)\s*\{[^}]*return baseF0 \+[^}]*grazing2 \* grazing2 \* grazing/s);
		expect(wgsl).toMatch(/if \(c2Squared <= 0\.0\)\s*\{\s*return vec3f\(1\.0\)/);
		expect(wgsl).toContain("sqrt(clamp(f0, vec3f(0.0), vec3f(0.9999)))");
		expect(wgsl).toContain("saturate(factor * factorTex.r)");
		expect(wgsl).toContain("mix(thicknessMin, thicknessMax, saturate(thicknessTex.g))");
		expect(wgsl).toContain("mix(dielectric, metallic, saturate(metalness))");
		expect(wgsl).toContain("min(vec3f(1.0) - single, missing * average)");
	});

	it("tangent frames share guarded normalization, handedness and degenerate UV fallbacks", () => {
		const chunk = PRD04_SHADER_CHUNKS.find((entry) => entry.name === "a3d_prd04_tangent_frame")!;
		const wgsl = chunk.wgsl!;
		// Normalize only constructor spelling; the assertions cover both language paths.
		for (const source of [chunk.glsl, wgsl.replace(/\bvec([234])f\b/g, "vec$1").replace(/\bmat3x3f\b/g, "mat3")]) {
			for (const operation of [
				"dot(value, value)",
				"magnitudeSquared > 1e-12",
				"a3dPrd04SafeNormalize(skinnedModel * tangent.xyz, vec3(1.0, 0.0, 0.0)), tangent.w",
				"abs(n.z) < 0.9",
				"a3dPrd04SafeNormalize(cross(axis, n), vec3(1.0, 0.0, 0.0))",
				"a3dPrd04SafeNormalize(normal, vec3(0.0, 0.0, 1.0))",
				"tangent.xyz - n * dot(n, tangent.xyz)",
				"tangent.w < 0.0",
				"mat3(t * faceDirection, b * faceDirection, n)",
				"ux.x * uy.y - ux.y * uy.x",
				"abs(determinant) < 1e-10",
				"mat3(tangent, cross(n, tangent), n)",
				"(px * uy.y - py * ux.y) / determinant",
				"(py * ux.x - px * uy.x) / determinant",
				"rawTangent - n * dot(n, rawTangent)",
				"dot(cross(n, tangent), rawBitangent) < 0.0",
				"mat3(tangent, cross(n, tangent) * handedness, n)"
			]) expect(source).toContain(operation);
		}
		expect(wgsl).toMatch(/if \(magnitudeSquared > 1e-12\)\s*\{\s*return value \* inverseSqrt\(magnitudeSquared\);\s*\}\s*return fallback;/);
		expect(wgsl).toContain("select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(n.z) < 0.9)");
		expect(wgsl).toContain("select(1.0, -1.0, tangent.w < 0.0)");
		expect(wgsl).toContain("select(1.0, -1.0, dot(cross(n, tangent), rawBitangent) < 0.0)");
	});
});
