/**
 * prd04-chunk-conformance.spec.ts — PRD-04 phase-1 browser gate: every
 * a3d_prd04_* chunk compiles (and links) inside ChunkHarness on a real GPU
 * context (macos-14 + ANGLE Metal in the qr-prd04 workflow).
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

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
		mkdirSync(resolve("tests/reports"), { recursive: true });
		writeFileSync(
			resolve("tests/reports/material-conformance.json"),
			`${JSON.stringify({ phase: 1, surface: "chunk-harness", ...result }, null, 2)}\n`
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
