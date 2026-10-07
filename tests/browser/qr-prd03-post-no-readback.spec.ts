import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 §6.9 (Phase 3): "a `post-no-readback.spec.ts` wraps `device.readPixels`
 * and `readPixelsAsync` in counters and asserts `counters().readbacks == 0`
 * after 300 frames across the 18 games." The 18-game sweep runs in the remote
 * `games` suite (CI-ROUTING — no local captures); this spec proves the local
 * invariant on a post-heavy flag-on scene that exercises every Phase-3 stage
 * (S1 depth, S2 GTAO, S4 god rays, S9 bloom, LDR vignette/grain/CA tail):
 *
 *  - `diagnostics().frame.readbacksThisFrame` stays 0 for all 300 frames
 *    (C-28 counter wrap of every device readback entry point), and
 *  - the app's own `gl.readPixels` is never invoked either — nothing bypasses
 *    the device interface.
 *
 * `POSTPROCESS_PASS_NOT_GPU` already hard-fails dev builds for any pass that
 * falls off the GPU path, so a surviving 300-frame run plus zero counters is
 * the compound assertion.
 */

interface NoReadbackResult {
  readonly frames: number;
  readonly deviceReadbacks: number;
  readonly glReadbacks: number;
  readonly skipped: readonly string[];
  readonly stages: readonly string[];
  readonly error?: string;
}

test.describe("PRD-03 Phase 3 — §6.9 CPU-readback ban", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let result: NoReadbackResult;

  test.beforeAll(async ({ browser }, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-no-readback-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    try {
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03NoReadback?: unknown }).runQrPrd03NoReadback === "function",
    );
    } catch {
      // Cold CI transform of the engine module graph can outrun one
      // budget; the dev server caches transpiled modules, so a reload
      // re-serves the whole graph from cache and lands the global.
      await page.reload();
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03NoReadback?: unknown }).runQrPrd03NoReadback === "function",
    );
    }
    result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03NoReadback?: () => Promise<NoReadbackResult> }).runQrPrd03NoReadback!;
      return run(300);
    });
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran the full 300-frame flag-on post chain", () => {
    expect(result.error ?? null).toBeNull();
    expect(result.frames).toBe(300);
  });

  test("device readback counters stay 0 for all 300 frames", () => {
    expect(result.deviceReadbacks).toBe(0);
  });

  test("the raw gl.readPixels path is never invoked either", () => {
    expect(result.glReadbacks).toBe(0);
  });

  test("diagnostics().post.skipped carries AO_INDIRECT_FRACTION_PENDING (C-02 stub)", () => {
    expect(result.skipped).toContain("AO_INDIRECT_FRACTION_PENDING");
    expect(result.stages).toContain("S2-gtao");
    expect(result.stages).toContain("S4-god-rays");
  });
});
