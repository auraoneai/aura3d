import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 §6.5 / Phase-1 exit: Aura's flag-on FXAA is the verbatim three r185
 * `FXAAShader` port (plus triangular dither on the final write). This spec
 * renders identical RGBA8 inputs through both programs on WebGL2 and asserts:
 *
 *  (a) a 1-px white line at 3°: per-column max luma ≥ 0.9× three's, mean |Δ|
 *      ≤ 2 LSB (the old 4-neighbour shader fails this — it only blends);
 *  (b) low-contrast noise (±0.012 luma, below the 0.0312 contrast threshold):
 *      unchanged within 1 LSB;
 *  (c) a 1-px checkerboard: within 2 LSB mean (both blur it — FXAA cannot tell
 *      texture edges from geometry edges).
 *
 * Runs wherever the browser suite runs (GitHub macos-14 per CI-ROUTING).
 */

interface FxaaCaseResult {
  columnMaxAura: number[];
  columnMaxThree: number[];
  meanAbsDiff: number;
  maxAbsDiff: number;
}

interface HarnessResult {
  fxaa: { results: Record<string, FxaaCaseResult>; error?: string };
}

test.describe("PRD-03 Phase 1 — FXAA r185 port vs three FXAAShader", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;

  test.beforeAll(async ({}, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on FXAA matches three r185 within dither tolerance", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/qr-prd03-post-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    await page.waitForFunction(
      () => typeof (window as { runQrPrd03Post?: unknown }).runQrPrd03Post === "function",
    );
    const harness = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Post?: () => Promise<HarnessResult> }).runQrPrd03Post!;
      return (await run()).fxaa;
    });
    expect(harness.error ?? null).toBeNull();
    const { line, noise, checker } = harness.results;

    // (a) line: aura keeps ≥0.9× three's per-column peak, mean |Δ| ≤ 2 LSB.
    for (let x = 0; x < line.columnMaxThree.length; x += 1) {
      expect(line.columnMaxAura[x], `column ${x} max luma`).toBeGreaterThanOrEqual(line.columnMaxThree[x] * 0.9 - 1e-6);
    }
    expect(line.meanAbsDiff).toBeLessThanOrEqual(2);

    // (b) noise: below the contrast threshold — unchanged within 1 LSB.
    expect(noise.maxAbsDiff).toBeLessThanOrEqual(1);

    // (c) checkerboard: both blur it; mean |Δ| ≤ 2 LSB.
    expect(checker.meanAbsDiff).toBeLessThanOrEqual(2);
  });
});
