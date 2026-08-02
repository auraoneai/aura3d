import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-ibl-browser.json";

test.describe("ExternalParity IBL browser evidence", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves generated linear-HDR IBL resources and environment-driven reflections", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/external-parity-ibl-evidence-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_EXTERNAL_PARITY_IBL__ || scope.__AURA3D_EXTERNAL_PARITY_IBL_ERROR__);
    }, undefined, { timeout: 120_000 });

    const harnessError = await page.evaluate(() => (window as unknown as Record<string, string | undefined>).__AURA3D_EXTERNAL_PARITY_IBL_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const evidence = await page.evaluate(() => (window as unknown as Record<string, Record<string, unknown>>).__AURA3D_EXTERNAL_PARITY_IBL__);

    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    mkdirSync(resolve("tests/reports/external-gallery/debug-views"), { recursive: true });
    await page.screenshot({ path: "tests/reports/external-gallery/debug-views/ibl-environment-swap.png", fullPage: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "a3d-external-parity-ibl-browser/2.0",
      generatedAt: new Date().toISOString(),
      screenshot: "tests/reports/external-gallery/debug-views/ibl-environment-swap.png",
      ...evidence
    }, null, 2)}\n`);

    const swap = evidence.environmentSwap as { readonly changedPixelFraction: number; readonly reflectsEnvironment: boolean; readonly captures: readonly Record<string, unknown>[] };
    const pipeline = evidence.externalParityPipeline as { readonly pmremMipCount: number; readonly brdfNonZeroPixels: number; readonly diagnostics: Record<string, boolean> };

    // Two different environments must produce measurably different reflections, which is
    // only possible if the material actually samples the environment.
    expect(swap.captures).toHaveLength(2);
    expect(swap.changedPixelFraction, JSON.stringify(swap)).toBeGreaterThanOrEqual(0.02);
    expect(swap.reflectsEnvironment).toBe(true);

    // Resource-level diagnostics come from the public bundle, not from assertions here.
    expect(pipeline.pmremMipCount).toBeGreaterThanOrEqual(4);
    expect(pipeline.brdfNonZeroPixels).toBeGreaterThan(0);
    expect(pipeline.diagnostics.diffuseIrradiance).toBe(true);
    expect(pipeline.diagnostics.specularPrefilter).toBe(true);
    expect(pipeline.diagnostics.brdfLut).toBe(true);
    // Generated environments must never be read as flagship proof.
    expect(pipeline.diagnostics.notFlagshipProof).toBe(true);
    expect(String(evidence.productBoundary)).toContain("bootstrap-only");

    // Also publish the material-fidelity report the HDR/IBL readiness audit reads. Its
    // original producer drove the deleted `examples/asset-viewer` route, so without this
    // the `bounded-hdr-ibl-evidence` blocker could never be satisfied by any amount of
    // renderer work.
    const card = evidence.materialFidelityCard as {
      readonly environmentResourceSet: string;
      readonly hdrSource: boolean;
      readonly maxLinearValue: number;
      readonly specularMipCount: number;
      readonly brdfLutValidated: boolean;
      readonly diffuseIrradiance: boolean;
      readonly drawCalls: number;
    };
    expect(card.environmentResourceSet).toBe("generated-local-linear-hdr-environment");
    expect(card.hdrSource).toBe(true);
    // Above 1 is what separates a real linear-HDR source from an LDR image in float storage.
    expect(card.maxLinearValue).toBeGreaterThan(1);
    expect(card.specularMipCount).toBeGreaterThanOrEqual(4);
    expect(card.brdfLutValidated).toBe(true);
    expect(card.diffuseIrradiance).toBe(true);
    expect(card.drawCalls).toBeGreaterThanOrEqual(1);

    writeFileSync(resolve("tests/reports/external-parity-asset-material-fidelity.json"), `${JSON.stringify({
      schema: "a3d-external-parity-asset-material-fidelity/2.0",
      generatedAt: new Date().toISOString(),
      ok: true,
      claimBoundary: "Proves that a root-rendered PBR material samples a generated linear-HDR environment with validated specular mips, diffuse irradiance, and BRDF LUT resources. Generated environments are bootstrap-only and are not flagship or cross-renderer parity proof.",
      producer: "tests/browser/external-parity-ibl-evidence.spec.ts",
      validations: [{
        name: "external-parity-material-fidelity-card",
        ok: true,
        evidence: card
      }]
    }, null, 2)}
`);

    expect(evidence.ok).toBe(true);
    expect(errors).toEqual([]);
  });
});
