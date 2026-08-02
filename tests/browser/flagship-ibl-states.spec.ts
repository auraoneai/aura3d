import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface FlagshipEntry {
  readonly id: string;
  readonly label: string;
  readonly preset: string;
  readonly featureEvidence: {
    readonly generatedEnvironmentMap: boolean;
    readonly environmentResourceSet: string;
    readonly environmentReflectionEvidence: boolean;
    readonly brdfLutValidated: boolean;
  };
  readonly metrics: {
    readonly environmentTextureMipCount: number;
    readonly environmentBrdfLutValidated: boolean;
    readonly environmentDiffuseIrradiance: boolean;
    readonly environmentSpecularIntensity: number;
    readonly drawCalls: number;
    readonly maxLinearValue: number;
    readonly nonBackgroundPixels: number;
    readonly brdfNonZeroPixels: number;
  };
}

interface FlagshipState {
  readonly status: string;
  readonly entries: readonly FlagshipEntry[];
  readonly claimBoundary: string;
  readonly error?: string;
}

const reportPath = "tests/reports/advanced-examples-gallery/visual-review-report.json";

/**
 * FS-501: republishes flagship linear-HDR IBL state.
 *
 * The three flagship ids the HDR/IBL readiness audit requires were deleted with the
 * docs/examples consolidation, and nothing wrote
 * `advanced-examples-gallery/visual-review-report.json` afterwards, so the
 * `flagship-linear-hdr-ibl-state` blocker could not be closed by any renderer work. This
 * regenerates that report from a route that measures the environment's actual pixel
 * contribution rather than declaring it.
 */
test.describe("flagship linear-HDR IBL states", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("publishes generated linear-HDR environment state for every flagship id", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/apps/flagship-ibl-states/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as Record<string, unknown>).__AURA3D_FLAGSHIP_IBL__),
      undefined,
      { timeout: 120_000 }
    );

    const state: FlagshipState = await page.evaluate(() => (window as unknown as Record<string, FlagshipState>).__AURA3D_FLAGSHIP_IBL__);
    if (state.error) throw new Error(state.error);

    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    await page.screenshot({ path: "tests/reports/advanced-examples-gallery/flagship-ibl-states.png", fullPage: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "a3d-advanced-gallery-visual-review/2.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/flagship-ibl-states.spec.ts",
      screenshot: "tests/reports/advanced-examples-gallery/flagship-ibl-states.png",
      claimBoundary: state.claimBoundary,
      entries: state.entries
    }, null, 2)}\n`);

    expect(state.status).toBe("ready");
    // All three flagship ids the readiness audit names must be present.
    expect(state.entries.map((entry) => entry.id)).toEqual([
      "product-configurator",
      "architecture-viewer",
      "game-slice"
    ]);

    for (const entry of state.entries) {
      const context = `${entry.id}: ${JSON.stringify(entry.metrics)}`;
      expect(entry.featureEvidence.generatedEnvironmentMap, context).toBe(true);
      expect(entry.featureEvidence.environmentResourceSet, context).toBe("generated-local-linear-hdr-environment");
      expect(entry.featureEvidence.brdfLutValidated, context).toBe(true);
      // Reflection evidence is derived from an environment-on/environment-off pixel
      // difference, so it cannot be true for a material that ignores the environment.
      expect(entry.featureEvidence.environmentReflectionEvidence, context).toBe(true);
      expect(entry.metrics.environmentSpecularIntensity, context).toBeGreaterThan(0);
      expect(entry.metrics.environmentTextureMipCount, context).toBeGreaterThanOrEqual(4);
      expect(entry.metrics.environmentBrdfLutValidated, context).toBe(true);
      expect(entry.metrics.environmentDiffuseIrradiance, context).toBe(true);
      expect(entry.metrics.drawCalls, context).toBeGreaterThan(0);
      // Above 1 distinguishes a real linear-HDR source from an LDR image in float storage.
      expect(entry.metrics.maxLinearValue, context).toBeGreaterThan(1);
      expect(entry.metrics.nonBackgroundPixels, context).toBeGreaterThan(1000);
      expect(entry.metrics.brdfNonZeroPixels, context).toBeGreaterThan(0);
    }

    // Generated environments must never read as flagship-quality or cross-renderer proof.
    expect(state.claimBoundary).toContain("bootstrap-only");
    expect(errors).toEqual([]);
  });
});
