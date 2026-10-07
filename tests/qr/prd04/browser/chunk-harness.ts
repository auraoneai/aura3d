/**
 * chunk-harness.ts — browser-side driver for the PRD-04 chunk conformance
 * spec (PRD-04 §14 P1-2 / phase-1 exit: every a3d_prd04_* chunk compiles in
 * ChunkHarness).
 *
 * For each registered chunk the page builds a ChunkHarness program containing
 * the r185 brdf shim, the chunk's transitive `requires` closure (resolved
 * against the registered chunk set + shim), and the chunk itself, then
 * compiles+links it on a real WebGL2 context and reports per-chunk status.
 */
import { PRD04_SHADER_CHUNKS } from "/packages/rendering/src/shaders/physical/index.js";
import { buildChunkHarnessProgram } from "/packages/rendering/src/contracts/testing/ChunkHarness.js";
import { BRDF_R185_SHIM_CHUNK } from "/tests/qr/prd04/shims/brdf_r185.glsl.js";
import type { ShaderChunk } from "/packages/rendering/src/contracts/program.js";

declare global {
	interface Window {
		__A3D_PRD04_CHUNK_HARNESS__?: {
			status: "running" | "ready" | "error";
			error?: string;
			glVersion?: string;
			renderer?: string;
			chunks?: { name: string; vertexOk: boolean; fragmentOk: boolean; linkOk: boolean; log: string }[];
		};
	}
}

const report: NonNullable<Window["__A3D_PRD04_CHUNK_HARNESS__"]> = { status: "running", chunks: [] };
window.__A3D_PRD04_CHUNK_HARNESS__ = report;

function chunkClosure(target: ShaderChunk, all: ShaderChunk[]): ShaderChunk[] {
	// Topological-ish closure: pull in transitive requires before `target`.
	const byName = new Map(all.map((c) => [c.name, c]));
	const out: ShaderChunk[] = [];
	const seen = new Set<string>();
	const visit = (name: string) => {
		if (seen.has(name)) return;
		seen.add(name);
		const dep = byName.get(name);
		if (!dep) return; // 'brdf' resolves to the shim, appended separately.
		for (const r of dep.requires ?? []) visit(r);
		out.push(dep);
	};
	for (const r of target.requires ?? []) visit(r);
	return out;
}

async function main(): Promise<void> {
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
	if (!gl) {
		report.status = "error";
		report.error = "WebGL2 context unavailable";
		return;
	}
	report.glVersion = gl.getParameter(gl.VERSION) as string;
	const dbg = gl.getExtension("WEBGL_debug_renderer_info");
	report.renderer = dbg
		? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
		: "unmasked";

	const all = [...PRD04_SHADER_CHUNKS, BRDF_R185_SHIM_CHUNK];
	for (const chunk of PRD04_SHADER_CHUNKS) {
		const deps = chunkClosure(chunk, all);
		const chunks = [BRDF_R185_SHIM_CHUNK, ...deps, chunk];
		const { vertex, fragment } = buildChunkHarnessProgram(chunks);
		const vertexOk = compile(gl, gl.VERTEX_SHADER, vertex);
		const fragmentOk = compile(gl, gl.FRAGMENT_SHADER, fragment);
		let linkOk = false;
		let log = "";
		if (vertexOk && fragmentOk) {
			const prog = gl.createProgram();
			const vs = gl.createShader(gl.VERTEX_SHADER)!;
			gl.shaderSource(vs, vertex);
			gl.compileShader(vs);
			const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
			gl.shaderSource(fs, fragment);
			gl.compileShader(fs);
			gl.attachShader(prog!, vs);
			gl.attachShader(prog!, fs);
			gl.linkProgram(prog!);
			linkOk = gl.getProgramParameter(prog!, gl.LINK_STATUS) === true;
			log = gl.getProgramInfoLog(prog!) ?? "";
			gl.deleteProgram(prog);
		} else {
			log = vertexOk ? "fragment compile failed" : "vertex compile failed";
		}
		report.chunks!.push({ name: chunk.name, vertexOk, fragmentOk, linkOk, log });
	}
	report.status = "ready";
	document.getElementById("status")!.textContent = "ready";
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): boolean {
	const sh = gl.createShader(type)!;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) === true;
	if (!ok) {
		console.error("chunk compile failed:", gl.getShaderInfoLog(sh));
	}
	gl.deleteShader(sh);
	return ok;
}

main().catch((error) => {
	report.status = "error";
	report.error = error instanceof Error ? error.stack ?? error.message : String(error);
	document.getElementById("status")!.textContent = "error";
});
