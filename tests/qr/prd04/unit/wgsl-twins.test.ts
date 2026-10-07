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
});
