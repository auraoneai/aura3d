/**
 * physical-lobes-numeric.spec.ts — PRD-04 P3-4 (U-BSDF-PARITY browser half):
 * every lobe's GLSL runs in ChunkHarness over the case input grid on a real
 * GPU context and matches the independently derived expectations of
 * tests/qr/prd04/oracles/independent-bsdf-goldens.ts within 1e-3 (2e-3
 * absolute floor for the table-backed cases — hardware half-float filtering,
 * same bound the CPU oracle test documents).
 *
 * S5-WP29-05: expectations no longer come from another engine's GLSL
 * evaluated per device class (the former fixtures/bsdf/r185-golden*.json);
 * they are computed on the page from the cited publications, the same
 * derivation tests/qr/prd04/unit/r185-oracle.test.ts holds the CPU oracle to.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

test.describe("PRD-04 physical lobes numeric parity (P3-4)", () => {
	let server: ExampleDevServer;

	test.beforeAll(async () => {
		server = await startExampleDevServer();
	});

	test.afterAll(async () => {
		await server.close();
	});

	test("each lobe function matches the independently derived grid within 1e-3", async ({ page }) => {
		await page.goto(`${server.origin}/tests/qr/prd04/browser/lobe-numeric.html`, {
			waitUntil: "domcontentloaded"
		});
		await page.waitForFunction(
			() => (window as any).__A3D_PRD04_LOBE_NUMERIC__?.status === "ready"
				|| (window as any).__A3D_PRD04_LOBE_NUMERIC__?.status === "error",
			undefined,
			{ timeout: 120_000 }
		);
		const result = await page.evaluate(() => (window as any).__A3D_PRD04_LOBE_NUMERIC__);
		mkdirSync(resolve("tests/reports"), { recursive: true });
		writeFileSync(
			resolve("tests/reports/physical-lobes-numeric.json"),
			`${JSON.stringify({ phase: 3, surface: "lobe-numeric", ...result }, null, 2)}\n`
		);
		expect(result?.status, result?.error).toBe("ready");
		expect(result?.cases?.length).toBeGreaterThanOrEqual(19);
		for (const c of result?.cases ?? []) {
			expect(c.log, `${c.fn} program`).toBe("");
			expect(
				c.failures,
				`${c.fn}: ${c.failures.length} samples out of bounds ` +
					`(maxAbs=${c.maxAbs.toExponential(2)} maxRel=${c.maxRel.toExponential(2)}) ` +
					`first: ${c.failures.slice(0, 3).map((f) => `@${f.idx} abs=${f.abs.toExponential(2)} args=${JSON.stringify(f.args ?? {})}`).join(", ")}`
			).toEqual([]);
		}
		// 04-S5 §15.4: the perturbed control (sheenColor x0.012) must FAIL —
		// a harness that cannot detect a real deviation is vacuous.
		const control = result?.control;
		mkdirSync(resolve("tests/reports/prd04/probes"), { recursive: true });
		writeFileSync(
			resolve("tests/reports/prd04/probes/s5-lobes-control.json"),
			`${JSON.stringify({ probe: "s5-lobes-control", ...control }, null, 2)}\n`
		);
		expect(control, "perturbed control ran").toBeDefined();
		expect(
			control!.failures.length,
			`control must fail vs the expected grid (perturbation=${control!.perturbation}, maxAbs=${control!.maxAbs.toExponential(2)})`
		).toBeGreaterThan(0);
	});
});
