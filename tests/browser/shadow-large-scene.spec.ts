import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { ProbeVariant, ShadowProbeCapture } from "./shadow-large-scene-harness";

const reportDir = "tests/reports/shadow-large-scene";

test.describe("large-scene directional shadow", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("sun shadows leave open ground and sun-facing walls lit", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/shadow-large-scene-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __SHADOW_PROBE__?: unknown }).__SHADOW_PROBE__), undefined, { timeout: 60_000 });

    mkdirSync(resolve(reportDir), { recursive: true });
    const run = async (id: string, shadow: boolean, far: number, variant: ProbeVariant = {}): Promise<ShadowProbeCapture> => {
      const capture = await page.evaluate(
        ([i, s, f, v]) => (window as unknown as { __SHADOW_PROBE__: { capture(id: string, s: boolean, f: number, v?: unknown): Promise<ShadowProbeCapture> } }).__SHADOW_PROBE__.capture(i as string, s as boolean, f as number, v),
        [id, shadow, far, variant] as const
      );
      await page.locator("#stage canvas").screenshot({ path: `${reportDir}/${id}.png` });
      return capture;
    };
    const control = await run("control-shadow-off", false, 600);
    const far100 = await run("shadow-on-far100", true, 100);
    const far600 = await run("shadow-on-far600", true, 600);
    const variants: Record<string, ProbeVariant> = {
      sparsePostAo: { sparseCasters: true, hdri: true, fog: true, hemisphere: true, post: true, ao: true }
    };
    const matrix: Record<string, { off: ShadowProbeCapture; on: ShadowProbeCapture }> = {};
    for (const [name, v] of Object.entries(variants)) {
      const off = await run(`v-${name}-off`, false, 3200, v);
      const on = await run(`v-${name}-on`, true, 3200, v);
      matrix[name] = { off, on };
    }
    console.log(`SHADOW_VARIANT_JSON ${JSON.stringify(matrix)}`);
    for (const [name, { off, on }] of Object.entries(matrix)) {
      expect(on.bridgeReason, `${name} bridge reason`).toBe("rendered");
      for (const band of ["ground-near", "ground-mid", "ground-far", "wall-left", "wall-right"]) {
        const lit = off.bands.find((b) => b.band === band)!.meanLuma;
        const now = on.bands.find((b) => b.band === band)!.meanLuma;
        expect(now / Math.max(1, lit), `${name} ${band} luma ratio vs shadow-off control`).toBeGreaterThan(0.6);
      }
    }
    writeFileSync(resolve(`${reportDir}/shadow-large-scene.json`), `${JSON.stringify({ control, far100, far600 }, null, 2)}\n`);

    console.log(`SHADOW_PROBE_JSON ${JSON.stringify({ control, far100, far600 })}`);

    const ratio = (capture: ShadowProbeCapture, band: string): number => {
      const lit = control.bands.find((b) => b.band === band)!.meanLuma;
      const now = capture.bands.find((b) => b.band === band)!.meanLuma;
      return now / Math.max(1, lit);
    };
    for (const capture of [far100, far600]) {
      expect(capture.runtimeBackend, `${capture.id} backend`).toBe("production-runtime");
      // The prd02 bridge reports through its own reason; the legacy mapRendered/mapSampled counters stay 0 on that path.
      expect(capture.bridgeReason, `${capture.id} bridge reason`).toBe("rendered");
      for (const band of ["ground-near", "ground-mid", "ground-far", "wall-left", "wall-right"]) {
        // Open ground and sun-facing walls must keep most of the unshadowed brightness; a shadow
        // lookup that marks every receiver as shadowed drops these to the ambient floor.
        expect(ratio(capture, band), `${capture.id} ${band} luma ratio vs shadow-off control`).toBeGreaterThan(0.6);
      }
      // The lit side must not be black.
      expect(capture.bands.find((b) => b.band === "ground-near")!.meanLuma, `${capture.id} ground-near luma`).toBeGreaterThan(40);
    }
    expect(errors).toEqual([]);
  });
});
