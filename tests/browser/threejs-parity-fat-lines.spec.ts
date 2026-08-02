import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Measurement {
  readonly id: string;
  readonly requestedWidthCss: number;
  readonly pixelRatio: number;
  readonly viewport: readonly [number, number];
  readonly cameraDistance: number;
  readonly fovDegrees: number;
  readonly measuredWidthDevicePixels: number;
  readonly measuredWidthCssPixels: number;
  readonly strokePixels: number;
}

interface FatLineEvidence {
  readonly widthStability: readonly Measurement[];
  readonly maxCssWidthDeviation: number;
  readonly dash: { readonly solidStrokePixels: number; readonly dashedStrokePixels: number; readonly dashReducedCoverage: boolean };
  readonly worldSpaceComparison: {
    readonly screenSpaceNearWidth: number;
    readonly screenSpaceFarWidth: number;
    readonly screenSpaceRatio: number;
    readonly worldSpaceNearWidth: number;
    readonly worldSpaceFarWidth: number;
    readonly worldSpaceRatio: number;
  };
  readonly pass: boolean;
}

const reportDir = "tests/reports/threejs-parity-fat-lines";

test.describe("screen-space fat lines", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keeps pixel width stable across distance, FOV, viewport, and DPR", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/threejs-parity-fat-lines-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const scope = window as unknown as Record<string, unknown>;
      return Boolean(scope.__AURA3D_FAT_LINES__ || scope.__AURA3D_FAT_LINES_ERROR__);
    }, undefined, { timeout: 120_000 });

    const harnessError = await page.evaluate(() => (window as unknown as Record<string, string | undefined>).__AURA3D_FAT_LINES_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const evidence: FatLineEvidence = await page.evaluate(() => (window as unknown as Record<string, FatLineEvidence>).__AURA3D_FAT_LINES__);

    mkdirSync(resolve(reportDir), { recursive: true });
    await page.screenshot({ path: `${reportDir}/fat-lines.png`, fullPage: true });
    writeFileSync(resolve(`${reportDir}/fat-lines.json`), `${JSON.stringify({
      schema: "aura3d-screen-space-fat-lines/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves that a line width specified in CSS pixels renders at that width in device pixels across camera distance, field of view, viewport size, and device pixel ratio, and that world-space triangle quads do not. Covers butt/square/round caps and world-unit dashes. Does not claim a pixel-identical image match against Three.js Line2.",
      ...evidence
    }, null, 2)}\n`);

    // Every configuration must land within 20% of the requested CSS width. A
    // world-space implementation fails this immediately at the far-camera case.
    expect(evidence.widthStability.length).toBeGreaterThanOrEqual(7);
    for (const measurement of evidence.widthStability) {
      expect(measurement.strokePixels, `${measurement.id} drew nothing`).toBeGreaterThan(100);
      const deviation = Math.abs(measurement.measuredWidthCssPixels - measurement.requestedWidthCss) / measurement.requestedWidthCss;
      expect(deviation, `${measurement.id} width ${measurement.measuredWidthCssPixels}px vs requested ${measurement.requestedWidthCss}px`).toBeLessThanOrEqual(0.2);
    }
    expect(evidence.maxCssWidthDeviation).toBeLessThanOrEqual(0.2);

    // Distance independence, stated as a ratio so it cannot be satisfied by a blank frame.
    expect(evidence.worldSpaceComparison.screenSpaceRatio).toBeGreaterThanOrEqual(0.85);
    expect(evidence.worldSpaceComparison.screenSpaceRatio).toBeLessThanOrEqual(1.15);
    // The world-space quad must visibly thin over the same distance change, which is
    // exactly why it is not Line2 parity.
    expect(evidence.worldSpaceComparison.worldSpaceRatio).toBeLessThan(0.6);

    expect(evidence.dash.dashReducedCoverage, JSON.stringify(evidence.dash)).toBe(true);
    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
