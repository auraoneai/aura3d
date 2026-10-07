/**
 * lobe-numeric.ts — PRD-04 P3-4 (U-BSDF-PARITY browser half): for every case
 * in fixtures/bsdf/r185-golden.json, build a fragment shader that calls the
 * corresponding `a3d_prd04_*` chunk function over the golden arg grid, render
 * it into an RGBA32F buffer on a real GPU context, and read the values back.
 *
 * The Playwright spec compares the returned grid against the golden within
 * ≤1e-3 (2e-3 absolute floor for the DFG-LUT cases — half-float filtering,
 * same bound as the CPU oracle test).
 */
import { PRD04_SHADER_CHUNKS } from "/packages/rendering/src/shaders/physical/index.js";
import { BRDF_R185_SHIM_CHUNK } from "/tests/qr/prd04/shims/brdf_r185.glsl.js";
import { DFG_LUT_R185, DFG_LUT_SIZE } from "/tests/qr/prd04/oracles/dfg-lut-r185.js";
import type { ShaderChunk } from "/packages/rendering/src/contracts/program.js";

declare global {
	interface Window {
		__A3D_PRD04_LOBE_NUMERIC__?: {
			status: "running" | "ready" | "error";
			error?: string;
			cases?: {
				fn: string;
				total: number;
				out: number;
				maxAbs: number;
				maxRel: number;
				values: (number | null)[];
				failures: { idx: number; abs: number; rel: number }[];
				log: string;
			}[];
		};
	}
}

interface GoldenCase {
	fn: string;
	desc: string;
	out: 1 | 3;
	argorder: string[];
	axes: Record<string, number[]>;
	fixed: Record<string, number | number[]>;
	values: (number | null)[];
}

const report: NonNullable<Window["__A3D_PRD04_LOBE_NUMERIC__"]> = { status: "running", cases: [] };
window.__A3D_PRD04_LOBE_NUMERIC__ = report;

/** golden fn → a3d call body (u_x{i} = per-pixel grid args, u_f_* = fixed). */
const CALLS: Record<string, string> = {
	dCharlie: "o = vec4( a3dPrd04DCharlie( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	vNeubelt: "o = vec4( a3dPrd04VNeubelt( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	iblSheenBRDF: "o = vec4( a3dPrd04IBLSheen( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	dGGXAnisotropic: "o = vec4( a3dPrd04DGGXAnisotropic( u_f_alphaT, u_f_alphaB, u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );",
	vGGXAnisotropic: "o = vec4( a3dPrd04VGGXAnisotropic( u_x2, u_f_alphaB, u_f_dotTV, u_f_dotBV, u_f_dotTL, u_f_dotBL, u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	evalIridescence: "o = vec4( a3dPrd04EvalIridescence( u_f_outsideIOR, u_x2, u_x0, u_x1, u_f_baseF0 ), 1.0 );",
	computeSpecularOcclusion: "o = vec4( a3dPrd04SpecularOcclusion( u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );",
	applyIorToRoughness: "o = vec4( a3dApplyIorToRoughness( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	volumeAttenuation: "o = vec4( a3dVolumeAttenuation( u_x0, u_f_attenuationColor, u_x1 ), 1.0 );",
	iorToF0: "o = vec4( a3dPrd04IorToFresnel0f( u_x0, 1.0 ), 0.0, 0.0, 1.0 );",
	specIorSpecularColor: "o = vec4( a3dPrd04SpecIorSpecularColor( u_x0, u_f_specularColorFactor, u_x1 ), 1.0 );",
	specIorSpecularF90: "o = vec4( a3dPrd04SpecIorSpecularF90( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
	clearcoatFccCompose:
		"vec3 outgoing = vec3(0.5,0.4,0.3) * u_x2 + vec3(0.1);\n" +
		"vec3 ccD = vec3(0.8,0.2,0.1) * (0.5 + 0.5 * u_x2);\n" +
		"vec3 ccI = vec3(0.1,0.3,0.6) * (1.0 - 0.5 * u_x2);\n" +
		"vec3 ccN = vec3(0.0,0.0,1.0);\n" +
		"vec3 ccV = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n" +
		"o = vec4( a3dPrd04ComposeClearcoat( outgoing, u_x0, ccN, ccV, ccD, ccI ), 1.0 );",
	environmentBRDF:
		"vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n" +
		"vec3 f0 = f0s[int(u_x2)];\n" +
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"o = vec4( a3dPrd04EnvironmentBRDF( N, V, f0, 1.0, u_x1 ), 1.0 );",
	multiscatteringSingle:
		"vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n" +
		"vec3 f0 = f0s[int(u_x2)];\n" +
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"vec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n" +
		"a3dPrd04ComputeMultiscattering( N, V, f0, 1.0, u_x1, single, multi );\n" +
		"o = vec4( single, 1.0 );",
	multiscatteringMulti:
		"vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n" +
		"vec3 f0 = f0s[int(u_x2)];\n" +
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"vec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n" +
		"a3dPrd04ComputeMultiscattering( N, V, f0, 1.0, u_x1, single, multi );\n" +
		"o = vec4( multi, 1.0 );",
	sheenDirect:
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"vec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n" +
		"o = vec4( a3dPrd04SheenDirect( L, V, N, u_f_sheenColor, u_x2 ), 1.0 );",
	brdfGGXMultiscatter:
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"vec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n" +
		"vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n" +
		"o = vec4( BRDF_GGX_Multiscatter( L, V, N, f0s[ int(u_x3) ], 1.0, u_x2 ), 1.0 );",
	anisotropyAlphaT: "o = vec4( mix( pow2(u_x0), 1.0, pow2(u_x1) ), 0.0, 0.0, 1.0 );",
	volumeTransmissionRay:
		"vec3 N = vec3(0.0,0.0,1.0);\n" +
		"vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n" +
		"mat4 m = mat4(1.0); m[0][0]=1.5; m[1][1]=1.5; m[2][2]=1.5;\n" +
		"o = vec4( a3dVolumeTransmissionRay( N, V, u_x1, u_x2, m ), 1.0 );"
};

const PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
`;

const VERTEX_SRC = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
	vec2 p = vec2( float( ( gl_VertexID << 1 ) & 2 ), float( gl_VertexID & 2 ) );
	v_uv = p;
	gl_Position = vec4( p * 2.0 - 1.0, 0.0, 1.0 );
}
`;

/** Topological closure of `requires` over all lane chunks, deps first. */
function closure(names: string[]): ShaderChunk[] {
	const byName = new Map([BRDF_R185_SHIM_CHUNK, ...PRD04_SHADER_CHUNKS].map((c) => [c.name, c]));
	const out: ShaderChunk[] = [];
	const seen = new Set<string>(["brdf"]); // shim appended separately
	const visit = (n: string) => {
		if (seen.has(n)) return;
		seen.add(n);
		const dep = byName.get(n);
		if (!dep) return;
		for (const r of dep.requires ?? []) visit(r);
		out.push(dep);
	};
	for (const n of names) visit(n);
	return out;
}

/** Chunk names each golden case needs (in addition to the brdf shim). */
const NEEDS: Record<string, string[]> = {
	dCharlie: ["a3d_prd04_sheen"],
	vNeubelt: ["a3d_prd04_sheen"],
	iblSheenBRDF: ["a3d_prd04_sheen"],
	dGGXAnisotropic: ["a3d_prd04_anisotropy"],
	vGGXAnisotropic: ["a3d_prd04_anisotropy"],
	anisotropyAlphaT: ["a3d_prd04_anisotropy"],
	evalIridescence: ["a3d_prd04_iridescence"],
	computeSpecularOcclusion: ["a3d_prd04_bsdf_lobes_common"],
	environmentBRDF: ["a3d_prd04_bsdf_lobes_common"],
	multiscatteringSingle: ["a3d_prd04_bsdf_lobes_common"],
	multiscatteringMulti: ["a3d_prd04_bsdf_lobes_common"],
	applyIorToRoughness: ["a3d_prd04_transmission", "a3d_prd04_volume"],
	volumeAttenuation: ["a3d_prd04_transmission", "a3d_prd04_volume"],
	volumeTransmissionRay: ["a3d_prd04_transmission", "a3d_prd04_volume"],
	iorToF0: ["a3d_prd04_specular_ior"],
	specIorSpecularColor: ["a3d_prd04_specular_ior"],
	specIorSpecularF90: ["a3d_prd04_specular_ior"],
	clearcoatFccCompose: ["a3d_prd04_clearcoat"],
	sheenDirect: ["a3d_prd04_sheen"],
	brdfGGXMultiscatter: []
};

const DFG_CASES = new Set(["environmentBRDF", "multiscatteringSingle", "multiscatteringMulti", "brdfGGXMultiscatter"]);

/** Numeric literal usable inside a float ctor — "1" is an int literal to GLSL. */
function glslFloat(v: number): string {
	if (Object.is(v, -0)) return "-0.0";
	return Number.isInteger(v) ? `${v}.0` : String(v);
}

function buildFragment(c: GoldenCase, width: number): string {
	const axes = c.argorder.map((name) => c.axes[name]!);
	const parts: string[] = [PREAMBLE, BRDF_R185_SHIM_CHUNK.glsl];
	for (const chunk of closure(NEEDS[c.fn] ?? [])) parts.push(chunk.glsl);
	for (const [name, value] of Object.entries(c.fixed)) {
		parts.push(`uniform ${Array.isArray(value) ? "vec3" : "float"} u_f_${name};`);
	}
	for (let i = 0; i < axes.length; i++) {
		// GLSL ES 3.0 forbids int literals inside float[] ctors — emit "1.0", not "1"
		// (ANGLE/Metal rejects `float[](1, 0)`; SwiftShader tolerates it).
		parts.push(`const float AX${i}[${axes[i]!.length}] = float[](${axes[i]!.map(glslFloat).join(", ")});`);
	}
	let decode = "";
	let stride = 1;
	for (let i = 0; i < axes.length; i++) {
		decode += `\tfloat u_x${i} = AX${i}[( idx / ${stride} ) % ${axes[i]!.length}];\n`;
		stride *= axes[i]!.length;
	}
	parts.push(
		`const int GRID_W = ${width};`,
		`layout(location = 0) out vec4 fragColor;`,
		`void main() {`,
		`\tint idx = int( floor( gl_FragCoord.y ) ) * GRID_W + int( floor( gl_FragCoord.x ) );`,
		decode,
		`\tvec4 o;`,
		`\t${CALLS[c.fn]}`,
		`\tfragColor = o;`,
		`}`
	);
	return parts.join("\n");
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): { ok: boolean; shader: WebGLShader | null; log: string } {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true;
	return { ok, shader: ok ? shader : null, log: gl.getShaderInfoLog(shader) ?? "" };
}

function runCase(gl: WebGL2RenderingContext, c: GoldenCase, dfgTex: WebGLTexture): (number | null)[] | { error: string } {
	const total = c.argorder.reduce((acc, k) => acc * c.axes[k]!.length, 1);
	const width = Math.min(1024, total);
	const height = Math.ceil(total / width);
	const src = buildFragment(c, width);
	const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
	const fs = compile(gl, gl.FRAGMENT_SHADER, src);
	if (!vs.ok || !fs.ok) return { error: `compile failed: ${fs.log}` };
	const prog = gl.createProgram()!;
	gl.attachShader(prog, vs.shader!);
	gl.attachShader(prog, fs.shader!);
	gl.linkProgram(prog);
	if (gl.getProgramParameter(prog, gl.LINK_STATUS) !== true) {
		return { error: `link failed: ${gl.getProgramInfoLog(prog) ?? ""}` };
	}
	const fb = gl.createFramebuffer()!;
	const rb = gl.createRenderbuffer()!;
	gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA32F, width, height);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
	gl.useProgram(prog);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, dfgTex);
	const lutLoc = gl.getUniformLocation(prog, "u_dfgLut");
	if (lutLoc) gl.uniform1i(lutLoc, 0);
	for (const [name, value] of Object.entries(c.fixed)) {
		const loc = gl.getUniformLocation(prog, `u_f_${name}`);
		if (!loc) continue;
		if (Array.isArray(value)) gl.uniform3fv(loc, value);
		else gl.uniform1f(loc, value);
	}
	gl.viewport(0, 0, width, height);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	const pixels = new Float32Array(width * height * 4);
	gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
	gl.deleteProgram(prog);
	gl.deleteFramebuffer(fb);
	gl.deleteRenderbuffer(rb);
	gl.deleteShader(vs.shader!);
	gl.deleteShader(fs.shader!);
	const values: (number | null)[] = [];
	for (let i = 0; i < total; i++) {
		for (let k = 0; k < c.out; k++) {
			const v = pixels[i * 4 + k]!;
			values.push(Number.isFinite(v) ? v : null);
		}
	}
	return values;
}

async function main(): Promise<void> {
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
	if (!gl) {
		report.status = "error";
		report.error = "WebGL2 context unavailable";
		return;
	}
	if (!gl.getExtension("EXT_color_buffer_float")) {
		report.status = "error";
		report.error = "EXT_color_buffer_float unavailable";
		return;
	}
	const dfgTex = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, dfgTex);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, DFG_LUT_SIZE, DFG_LUT_SIZE, 0, gl.RG, gl.FLOAT, DFG_LUT_R185);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const golden = (await (await fetch("/tests/qr/prd04/fixtures/bsdf/r185-golden.json")).json()) as { cases: GoldenCase[] };
	for (const c of golden.cases) {
		const total = c.argorder.reduce((acc, k) => acc * c.axes[k]!.length, 1);
		const entry = { fn: c.fn, total, out: c.out, maxAbs: 0, maxRel: 0, values: [] as (number | null)[], failures: [] as { idx: number; abs: number; rel: number }[], log: "" };
		const result = runCase(gl, c, dfgTex);
		if (!Array.isArray(result)) {
			entry.log = result.error;
			report.cases!.push(entry);
			continue;
		}
		entry.values = result;
		const absBound = DFG_CASES.has(c.fn) ? 2e-3 : 1e-3;
		for (let i = 0; i < total * c.out; i++) {
			const got = result[i];
			const expected = c.values[i];
			if (expected === null) continue; // non-finite golden cell — spec asserts parity separately
			if (got === null) {
				entry.failures.push({ idx: i, abs: Infinity, rel: Infinity });
				continue;
			}
			const abs = Math.abs(got - expected);
			const rel = abs / Math.max(Math.abs(expected), 1e-6);
			entry.maxAbs = Math.max(entry.maxAbs, abs);
			entry.maxRel = Math.max(entry.maxRel, rel);
			if (abs > absBound && rel > 1e-3) entry.failures.push({ idx: i, abs, rel });
		}
		report.cases!.push(entry);
	}
	report.status = "ready";
	document.getElementById("status")!.textContent = "ready";
}

main().catch((error) => {
	report.status = "error";
	report.error = error instanceof Error ? error.stack ?? error.message : String(error);
	document.getElementById("status")!.textContent = "error";
});
