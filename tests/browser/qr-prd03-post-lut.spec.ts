import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 §6.7 S10b / Phase-2: the display-grade 33³ RGBA8 LUT bake is
 * analytically faithful (4096-step ramp LUT vs analytic grade ≤1 LSB) and
 * cached — `DisplayLutCache.bakeCount === 1` across 60 identical frames.
 * Remote gate: runs under the GitLab macOS browser lane (lane rules — no
 * local captures).
 */

interface Phase2Result {
  lut: { maxAbsDiff: number; meanAbsDiff: number; steps: number; error?: string };
  rebake: { bakeCount: number; frames: number; error?: string };
}

test.describe("PRD-03 Phase 2 — display LUT bake + cache", () => {
  let server: ExampleDevServer;
  let result: Phase2Result;

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-phase2-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    await page.waitForFunction(
      () => typeof (window as { runQrPrd03Phase2?: unknown }).runQrPrd03Phase2 === "function",
    );
    const all = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Phase2?: () => Promise<{ lut: Phase2Result["lut"]; rebake: Phase2Result["rebake"] }> }).runQrPrd03Phase2!;
      const { lut, rebake } = await run();
      return { lut, rebake };
    });
    result = all;
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("4096-step ramp through the baked LUT matches the analytic grade within 1 LSB", () => {
    expect(result.lut.error ?? null).toBeNull();
    expect(result.lut.steps).toBe(4096);
    expect(result.lut.maxAbsDiff).toBeLessThanOrEqual(1);
  });

  test("rebake count is 1 across 60 frames of identical grade", () => {
    expect(result.rebake.error ?? null).toBeNull();
    expect(result.rebake.bakeCount).toBe(1);
  });
});
