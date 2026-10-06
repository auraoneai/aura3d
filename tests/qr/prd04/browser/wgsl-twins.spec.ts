/**
 * wgsl-twins.spec.ts — PRD-04 §8.12 WGSL validation: every a3d_prd04_* chunk's
 * WGSL twin parses via GPUDevice.createShaderModule().getCompilationInfo() on
 * a real WebGPU adapter (macos-14 CI; skipped with a recorded reason when the
 * runner exposes no adapter).
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

test.describe("PRD-04 WGSL twins validate", () => {
	let server: ExampleDevServer;

	test.beforeAll(async () => {
		server = await startExampleDevServer();
	});

	test.afterAll(async () => {
		await server.close();
	});

	test("all 15 wgsl twins pass getCompilationInfo with zero errors", async ({ page }) => {
		await page.goto(`${server.origin}/tests/qr/prd04/browser/wgsl-twins.html`, {
			waitUntil: "domcontentloaded"
		});
		await page.waitForFunction(
			() => (window as any).__A3D_PRD04_WGSL__?.status !== "running",
			undefined,
			{ timeout: 60_000 }
		);
		const result = await page.evaluate(() => (window as any).__A3D_PRD04_WGSL__);
		mkdirSync(resolve("tests/reports"), { recursive: true });
		writeFileSync(
			resolve("tests/reports/prd04-wgsl-twins.json"),
			`${JSON.stringify({ phase: 6, surface: "webgpu-compilation-info", ...result }, null, 2)}\n`
		);
		if (result?.status === "skipped") {
			test.skip(true, `WebGPU unavailable: ${result.skipReason}`);
			return;
		}
		expect(result?.status, result?.error).toBe("ready");
		expect(result?.chunks?.length).toBe(15);
		for (const chunk of result?.chunks ?? []) {
			expect(chunk.ok, `${chunk.name}: ${JSON.stringify(chunk.errors)}`).toBe(true);
		}
	});
});
