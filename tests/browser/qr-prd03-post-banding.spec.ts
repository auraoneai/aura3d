import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 S12 / Phase-1: `triangularDither` (PCG2D) on the last write of the
 * FXAA path kills 8-bit banding. Renders `prd03-night-fog-banding` flag-on and
 * asserts the longest identical-8bit run along the fog gradient stays ≤ 1.5×
 * the ideal quantization run, and Sobel (|G| ≥ 1 LSB) finds < 0.5% contour
 * pixels.
 *
 * Also checks §6.11: `depthOfField` focused at 10 m on a 0.05/100 camera keeps
 * the 10 m box sharp (flag-on `depthRange` plumbing — CCR-03-1).
 */

interface BandingResult {
  maxRun: number;
  worstRatio: number;
  contourFraction: number;
  error?: string;
}

interface DofResult {
  sharpEnergy: number;
  blurredEnergy: number;
  error?: string;
}

interface HarnessResult {
  banding: BandingResult;
  dof: DofResult;
}

test.describe("PRD-03 Phase 1 — dither banding + depthRange DOF", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let harness: HarnessResult;

  test.beforeAll(async ({ browser }, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-post-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    await page.waitForFunction(
      () => typeof (window as { runQrPrd03Post?: unknown }).runQrPrd03Post === "function",
    );
    harness = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Post?: () => Promise<HarnessResult> }).runQrPrd03Post!;
      const { banding, dof } = await run();
      return { banding, dof };
    });
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("triangularDither keeps the night-fog gradient contour-free", () => {
    expect(harness.banding.error ?? null).toBeNull();
    expect(harness.banding.worstRatio).toBeLessThanOrEqual(1.5);
    expect(harness.banding.contourFraction).toBeLessThan(0.005);
  });

  test("depthRange feeds DOF: a box at 10 m is sharpest at focus ≈10 m", () => {
    expect(harness.dof.error ?? null).toBeNull();
    expect(harness.dof.sharpEnergy).toBeGreaterThan(harness.dof.blurredEnergy * 1.25);
  });
});
