/**
 * wgsl-twins.ts — browser-side driver for the PRD-04 WGSL validation spec
 * (PRD-04 §8.12): each a3d_prd04_* chunk's WGSL twin is concatenated with the
 * WGSL brdf shim and its transitive `requires` twins, wrapped in a trivial
 * @fragment probe entry (so fragment-only builtins — dpdx/dpdy, fwidth,
 * discard — are in stage context), and handed to
 * GPUDevice.createShaderModule().getCompilationInfo() on a real WebGPU
 * adapter. Errors are reported per chunk.
 */
import { PRD04_SHADER_CHUNKS } from "/packages/rendering/src/shaders/physical/index.js";
import { BRDF_R185_WGSL } from "/tests/qr/prd04/shims/brdf_r185.wgsl.js";
import type { ShaderChunk } from "/packages/rendering/src/contracts/program.js";

declare global {
	interface Window {
		__A3D_PRD04_WGSL__?: {
			status: "running" | "ready" | "skipped" | "error";
			skipReason?: string;
			error?: string;
			adapter?: string;
			chunks?: {
				name: string;
				ok: boolean;
				errors: { line: number; message: string }[];
			}[];
		};
	}
}

const report: NonNullable<Window["__A3D_PRD04_WGSL__"]> = { status: "running", chunks: [] };
window.__A3D_PRD04_WGSL__ = report;

function wgslClosure(target: ShaderChunk, all: ShaderChunk[]): ShaderChunk[] {
	const byName = new Map(all.map((c) => [c.name, c]));
	const out: ShaderChunk[] = [];
	const seen = new Set<string>();
	const visit = (name: string) => {
		if (seen.has(name)) return;
		seen.add(name);
		const dep = byName.get(name);
		if (!dep) return; // 'brdf' resolves to the WGSL shim, appended separately.
		for (const r of dep.requires ?? []) visit(r);
		out.push(dep);
	};
	for (const r of target.requires ?? []) visit(r);
	return out;
}

async function main(): Promise<void> {
	const nav = navigator as Navigator & { gpu?: GPU };
	if (!nav.gpu) {
		report.status = "skipped";
		report.skipReason = "navigator.gpu absent — no WebGPU adapter on this runner";
		return;
	}
	let adapter: GPUAdapter | null = null;
	try {
		adapter = await nav.gpu.requestAdapter();
	} catch (error) {
		report.status = "skipped";
		report.skipReason = `requestAdapter threw: ${String(error)}`;
		return;
	}
	if (!adapter) {
		report.status = "skipped";
		report.skipReason = "requestAdapter() returned null — no WebGPU adapter";
		return;
	}
	try {
		report.adapter = JSON.stringify(adapter.info ?? {});
	} catch {
		report.adapter = "unmasked";
	}
	const device = await adapter.requestDevice();

	const chunks = PRD04_SHADER_CHUNKS as readonly ShaderChunk[];
	for (const chunk of chunks) {
		const deps = wgslClosure(chunk, chunks as ShaderChunk[]);
		const source = [
			BRDF_R185_WGSL,
			...deps.map((d) => d.wgsl ?? ""),
			chunk.wgsl ?? "",
			// Fragment probe: puts fragment-only builtins in stage context and
			// gives Tint an entry point to validate against.
			"@fragment fn __a3d_prd04_wgsl_probe() -> @location(0) vec4f { return vec4f(0.0); }"
		].join("\n\n");
		try {
			const module = device.createShaderModule({ code: source });
			const info = await module.getCompilationInfo();
			const errors = info.messages
				.filter((m) => m.type === "error")
				.map((m) => ({ line: m.lineNum, message: m.message }));
			report.chunks!.push({ name: chunk.name, ok: errors.length === 0, errors });
		} catch (error) {
			report.chunks!.push({
				name: chunk.name,
				ok: false,
				errors: [{ line: 0, message: `createShaderModule threw: ${String(error)}` }]
			});
		}
	}
	report.status = "ready";
}

main().catch((error) => {
	report.status = "error";
	report.error = String(error?.stack ?? error);
});
