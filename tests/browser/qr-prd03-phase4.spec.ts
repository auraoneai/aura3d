import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 Phase-4 probes (TAA/motion blur/DOF/camera velocity, §8.6–§8.9):
 *
 *  - S1-C camera velocity: 1° yaw over constant mid-depth → velocity within
 *    2% of the JS-analytic reprojection.
 *  - TAA case a: static 1-px line — max per-pixel temporal luma stddev ≤ 0.01.
 *  - TAA case b: camera yaw pan — ghost count near zero (report-only today;
 *    the runtime camera node surface lands with C-22, lane-08).
 *  - TAA case c: `app.cutCamera()` — post-cut frame matches a fresh
 *    no-history frame within 2 LSB on every pixel.
 *  - Motion blur (§8.8/C-23): blur extent at 60 vs 30 simulated fps differs
 *    by ≤10% (shutter×timeScale makes blur velocity-proportional).
 *  - Metric DoF (§8.9): focus-plane pixels within 2 LSB of no-DoF; bokeh
 *    diameter of a 30 m point light near the analytic 12.3 px.
 *
 * Runs on the remote browser lane (CI-ROUTING); cases tagged untested are
 * asserted only when the runtime surface exists.
 */

interface Phase4Result {
  readonly schema: string;
  readonly cameraVelocity: { maxRelError?: number; error?: string };
  readonly taaStatic: { maxStddev?: number; meanStddev?: number; error?: string };
  readonly taaPan: { ghostPixels?: number; untested?: string; error?: string };
  readonly taaCut: { pixelsOver2Lsb?: number; untested?: string; error?: string };
  readonly motionBlur: { relDiff?: number; untested?: boolean; error?: string };
  readonly dofMetric: { focusViolations?: number; bokehDiameter?: number; expectedBokeh?: number; error?: string };
  readonly taau: { fullResError?: number; upscaledError?: number; untested?: string; error?: string };
}

test.describe("PRD-03 Phase 4 — temporal/AA/cinematic", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let result: Phase4Result;

  test.beforeAll(async ({ browser }, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-phase4-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    try {
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03Phase4?: unknown }).runQrPrd03Phase4 === "function",
    );
    } catch {
      // Cold CI transform of the engine module graph can outrun one
      // budget; the dev server caches transpiled modules, so a reload
      // re-serves the whole graph from cache and lands the global.
      await page.reload();
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03Phase4?: unknown }).runQrPrd03Phase4 === "function",
    );
    }
    result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Phase4?: () => Promise<Phase4Result> }).runQrPrd03Phase4!;
      return run();
    });
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("S1-C camera velocity within 2% of analytic for a 1° yaw", () => {
    expect(result.cameraVelocity.error ?? null).toBeNull();
    expect(result.cameraVelocity.maxRelError!).toBeLessThanOrEqual(0.02);
  });

  test("TAA case a — static 1-px line temporal luma stddev ≤ 0.01", () => {
    expect(result.taaStatic.error ?? null).toBeNull();
    expect(result.taaStatic.maxStddev!).toBeLessThanOrEqual(0.01);
  });

  test("TAA case b — camera pan ghost pixels (report-only until C-22 lands)", () => {
    if (result.taaPan.untested) test.info().annotations.push({ type: "untested", description: result.taaPan.untested });
    expect(result.taaPan.error ?? null).toBeNull();
    if (!result.taaPan.untested) expect(result.taaPan.ghostPixels!).toBeLessThanOrEqual(64); // ~2 px on a 320² frame
  });

  test("TAA case c — cutCamera() post-cut frame equals no-history within 2 LSB", () => {
    expect(result.taaCut.error ?? null).toBeNull();
    if (!result.taaCut.untested) expect(result.taaCut.pixelsOver2Lsb!).toBe(0);
  });

  test("motion blur extent at 60 vs 30 simulated fps differs ≤10%", () => {
    expect(result.motionBlur.error ?? null).toBeNull();
    if (!result.motionBlur.untested) expect(result.motionBlur.relDiff!).toBeLessThanOrEqual(0.1);
  });

  test("metric DoF — focus plane within 2 LSB, bokeh diameter ≈12.3 px ±15%", () => {
    expect(result.dofMetric.error ?? null).toBeNull();
    expect(result.dofMetric.focusViolations!).toBe(0);
    expect(result.dofMetric.bokehDiameter!).toBeGreaterThanOrEqual(12.3 * 0.85);
    expect(result.dofMetric.bokehDiameter!).toBeLessThanOrEqual(12.3 * 1.15);
  });

  test("TAAU — renderScale 0.67 edge error ≤ 1.3× full-res TAA (§8.6)", () => {
    const r = result.taau;
    expect(r.error ?? null).toBeNull();
    if (r.untested) test.info().annotations.push({ type: "untested", description: r.untested });
    if (!r.untested) {
      expect(r.fullResError!).toBeGreaterThanOrEqual(0);
      expect(r.upscaledError!).toBeGreaterThanOrEqual(0);
      expect(r.upscaledError!).toBeLessThanOrEqual(Math.max(1.3 * r.fullResError!, 0.05));
    }
  });
});
