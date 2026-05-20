import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/v4-ibl-browser.json";

test.describe("V4 IBL browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("shows environment reflections and generated IBL resources in the material showroom", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/_quarantine/material-showroom/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_MATERIAL_SHOWROOM__?.status === "ready", undefined, { timeout: 30_000 });
    await page.getByTestId("material-showroom-environment-preset").selectOption("sunset");
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_MATERIAL_SHOWROOM__?.environmentPreset)).toBe("sunset");

    const screenshotPath = "tests/reports/v4-gallery/debug-views/ibl-material-showroom.png";
    mkdirSync(join(process.cwd(), "tests/reports/v4-gallery/debug-views"), { recursive: true });
    await page.locator("[data-testid='material-showroom-canvas']").screenshot({ path: screenshotPath });

    const state = await page.evaluate(() => window.__GALILEO3D_MATERIAL_SHOWROOM__);
    const v4Pipeline = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const pipeline = rendering.createV4EnvironmentPipeline({
        target: "studio-softbox-hdr",
        rotation: 0.2,
        intensity: 1.25,
        backgroundIntensity: 0.35
      });
      return {
        target: pipeline.target,
        preset: pipeline.preset,
        sourceStatus: pipeline.sourceStatus,
        capabilities: pipeline.capabilities,
        releaseBlockers: pipeline.releaseBlockers,
        diagnostics: pipeline.ibl.diagnostics,
        specularMipCount: pipeline.ibl.resources.diagnostics.specularMipCount,
        diffuseIrradianceSize: pipeline.ibl.resources.diagnostics.diffuseIrradianceSize,
        brdfLutSize: pipeline.ibl.resources.diagnostics.brdfLutSize,
        pmremMipCount: pipeline.ibl.pmrem.diagnostics.mipCount,
        brdfNonZeroPixels: pipeline.ibl.brdfLut.diagnostics.nonZeroPixels
      };
    });
    const report = {
      ok: errors.length === 0 &&
        state?.status === "ready" &&
        state.featureEvidence?.activeFeatures?.includes("environment-reflections") === true &&
        Number(state.environmentResources?.specularMipCount ?? 0) >= 4 &&
        v4Pipeline.diagnostics.hdrSource === true &&
        v4Pipeline.diagnostics.diffuseIrradiance === true &&
        v4Pipeline.diagnostics.specularPrefilter === true &&
        v4Pipeline.diagnostics.brdfLut === true &&
        v4Pipeline.diagnostics.notFlagshipProof === true,
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "Browser IBL evidence for V4 Milestone 3 only. Generated local environments are bootstrap-only and are not flagship visual proof.",
      requiredNextProof: [
        "licensed HDR environment files with provenance",
        "rough metal/chrome screenshots under at least three environments",
        "same-scene Three.js material and product comparisons"
      ],
      errors,
      state,
      v4Pipeline
    };
    mkdirSync(join(process.cwd(), "tests/reports"), { recursive: true });
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(state?.featureEvidence?.activeFeatures).toContain("environment-reflections");
    expect(Number(state?.environmentResources?.specularMipCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(v4Pipeline.diagnostics.hdrSource).toBe(true);
    expect(v4Pipeline.diagnostics.diffuseIrradiance).toBe(true);
    expect(v4Pipeline.diagnostics.specularPrefilter).toBe(true);
    expect(v4Pipeline.diagnostics.brdfLut).toBe(true);
    expect(v4Pipeline.diagnostics.notFlagshipProof).toBe(true);
    expect(v4Pipeline.pmremMipCount).toBeGreaterThanOrEqual(4);
    expect(v4Pipeline.brdfNonZeroPixels).toBeGreaterThan(0);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __GALILEO3D_MATERIAL_SHOWROOM__?: {
      readonly status?: "ready" | "error";
      readonly environmentPreset?: string;
      readonly featureEvidence?: {
        readonly activeFeatures?: readonly string[];
      };
      readonly environmentResources?: {
        readonly resourceSet?: string;
        readonly specularMipCount?: number;
        readonly validation?: {
          readonly environmentTexture?: boolean;
          readonly brdfLutTexture?: boolean;
          readonly specularMipLevels?: boolean;
          readonly diffuseIrradiance?: boolean;
        };
      };
    };
  }
}
