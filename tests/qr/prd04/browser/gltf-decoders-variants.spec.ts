/**
 * gltf-decoders-variants.spec.ts — PRD-04 P5-2/P5-3 browser gate.
 * DamagedHelmet loads through Draco and Meshopt via the C-16 `decoders` option
 * and renders within masked CIEDE2000 mean ≤ 1.0 of the uncompressed GLB on the
 * same build; MaterialsVariantsShoe's three variants produce pairwise mean
 * subject colour ΔE2000 ≥ 10, and an unknown name reports `variant-unknown`
 * with the default kept. macos-14 CI only.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface ReadyPayload {
  readonly maskedPixels: number;
  readonly helmetDracoDeltaEMean: number;
  readonly helmetMeshoptDeltaEMean: number;
  readonly variants: readonly string[];
  readonly variantResults: Record<string, { readonly applied: string; readonly meanLab: readonly number[] }>;
  readonly variantPairwiseDeltaE: readonly number[];
  readonly variantUnknown: string;
}

test.describe("PRD-04 glTF decoders + material variants (P5-2/P5-3)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("draco/meshopt decode renders match baseline; variants rebuild", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd04/browser/gltf-decoders-variants.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd04-decoders-variants.json"),
      `${JSON.stringify({ phase: 5, surface: "gltf-decoders-variants", error, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();
    expect(payload!.maskedPixels).toBeGreaterThan(1000);
    expect(payload!.helmetDracoDeltaEMean, `draco ΔE2000 mean ${payload!.helmetDracoDeltaEMean}`).toBeLessThanOrEqual(1.0);
    expect(payload!.helmetMeshoptDeltaEMean, `meshopt ΔE2000 mean ${payload!.helmetMeshoptDeltaEMean}`).toBeLessThanOrEqual(1.0);

    expect(payload!.variants.length).toBeGreaterThanOrEqual(3);
    for (const [name, result] of Object.entries(payload!.variantResults)) {
      expect(result.applied, `variant ${name} applied`).toBe("applied");
    }
    for (const delta of payload!.variantPairwiseDeltaE) {
      expect(delta, `pairwise subject ΔE2000 ${delta}`).toBeGreaterThanOrEqual(10);
    }
    expect(payload!.variantUnknown).toBe("variant-unknown");
  });
});
