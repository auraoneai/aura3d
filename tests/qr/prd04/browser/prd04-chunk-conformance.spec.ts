/**
 * prd04-chunk-conformance.spec.ts — PRD-04 phase-1 browser gate: every
 * a3d_prd04_* chunk compiles (and links) inside ChunkHarness on a real GPU
 * context (macos-14 + ANGLE Metal in the qr-prd04 workflow).
 */
import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

/**
 * §15.3 extension→probe map: which a3d_prd04_* chunk compiles constitute an
 * extension's probe. Extensions with no chunk probe (diffuse_transmission,
 * pbrSpecularGlossiness, variants) stay out of the generated section and keep
 * their current matrix status.
 */
const EXTENSION_PROBES: Readonly<Record<string, readonly string[]>> = {
	KHR_materials_clearcoat: ["a3d_prd04_clearcoat"],
	KHR_materials_sheen: ["a3d_prd04_sheen"],
	KHR_materials_iridescence: ["a3d_prd04_iridescence"],
	KHR_materials_anisotropy: ["a3d_prd04_anisotropy"],
	KHR_materials_transmission: ["a3d_prd04_transmission", "a3d_prd04_volume"],
	KHR_materials_volume: ["a3d_prd04_volume"],
	KHR_materials_dispersion: ["a3d_prd04_dispersion"],
	KHR_materials_ior: ["a3d_prd04_specular_ior"],
	KHR_materials_specular: ["a3d_prd04_specular_ior"],
	KHR_materials_emissive_strength: ["a3d_prd04_emissive_strength"],
	KHR_materials_unlit: ["a3d_prd04_unlit"],
	KHR_texture_transform: ["a3d_prd04_uv_transform"]
};

const QR_FLAGS = process.env.PRD04_FLAGS ?? "none";

function gpanelJudgementId(): string | null {
	// Latest integrated G-PANEL scene judgement id, produced by the capture job's
	// judgement stage at IC checkpoints; absent ⇒ no conformant extension yet.
	const path = resolve("tests/reports/prd04/gpanel/latest.json");
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return typeof parsed?.judgementId === "string" ? parsed.judgementId : null;
	} catch {
		return null;
	}
}

test.describe("PRD-04 lobe chunks compile in ChunkHarness", () => {
	let server: ExampleDevServer;

	test.beforeAll(async () => {
		server = await startExampleDevServer();
	});

	test.afterAll(async () => {
		await server.close();
	});

	test("all 15 a3d_prd04_* chunks compile+link", async ({ page }) => {
		await page.goto(`${server.origin}/tests/qr/prd04/browser/chunk-harness.html`, {
			waitUntil: "domcontentloaded"
		});
		await page.waitForFunction(
			() => (window as any).__A3D_PRD04_CHUNK_HARNESS__?.status === "ready"
				|| (window as any).__A3D_PRD04_CHUNK_HARNESS__?.status === "error",
			undefined,
			{ timeout: 60_000 }
		);
		const result = await page.evaluate(() => (window as any).__A3D_PRD04_CHUNK_HARNESS__);
		const judgementId = gpanelJudgementId();
		const extensions = Object.fromEntries(
			Object.entries(EXTENSION_PROBES).map(([extension, probes]) => [
				extension,
				{
					probes,
					passed:
						result?.status === "ready" &&
						probes.every((chunkName) =>
							result?.chunks?.some(
								(chunk: any) => chunk.name === chunkName && chunk.vertexOk && chunk.fragmentOk && chunk.linkOk
							)
						),
					qrFlags: QR_FLAGS,
					gpanelJudgementId: judgementId
				}
			])
		);
		mkdirSync(resolve("tests/reports"), { recursive: true });
		writeFileSync(
			resolve("tests/reports/material-conformance.json"),
			`${JSON.stringify({ phase: 1, surface: "chunk-harness", ...result, extensions }, null, 2)}\n`
		);
		writeFileSync(
			resolve("tests/reports/prd04-chunk-harness.json"),
			`${JSON.stringify(result, null, 2)}\n`
		);
		expect(result?.status, result?.error).toBe("ready");
		expect(result?.chunks?.length).toBe(15);
		for (const chunk of result?.chunks ?? []) {
			expect(chunk.vertexOk, `${chunk.name} vertex`).toBe(true);
			expect(chunk.fragmentOk, `${chunk.name} fragment`).toBe(true);
			expect(chunk.linkOk, `${chunk.name} link: ${chunk.log}`).toBe(true);
		}
	});
});
