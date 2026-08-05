import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WS-2.6 — context-loss recovery, through the root API.
 *
 * The parity table listed this as a `gap` and the reason mattered: `WebGL2Device.ts:349-350` has listened
 * for `webglcontextlost`/`webglcontextrestored` for a long time and acted on them internally. What did not
 * exist was any way for a developer using `createAuraApp` to *observe* it, so the only symptom reaching
 * them was a canvas that quietly stopped updating. The device layer was never the gap.
 *
 * A vaguer note ("context loss is not handled") would have invited closing the row by pointing at those
 * listeners, which is why WS-1.6 corrected the wording before this work started.
 */
test.describe("context loss recovery", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("a lost context is observable through createAuraApp, and unsubscribing detaches", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/context-loss-recovery-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __contextLossProbe?: unknown }).__contextLossProbe)
        || (window as unknown as { __contextLossProbeError?: unknown }).__contextLossProbeError !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const harnessError = await page.evaluate(() => (window as unknown as { __contextLossProbeError?: string }).__contextLossProbeError);
    expect(harnessError ?? consoleErrors.join(" | "), "harness must run to completion").toBeFalsy();

    const probe = await page.evaluate(() => (window as unknown as {
      __contextLossProbe: {
        readonly extensionAvailable: boolean;
        readonly beforeLoss: { readonly litPixels: number; readonly deviceLost: boolean };
        readonly afterLoss: { readonly lostCount: number; readonly deviceLost: boolean };
        readonly afterRestore: { readonly restoredCount: number; readonly deviceLost: boolean };
        readonly afterUnsubscribe: { readonly lostCount: number };
        readonly apiPresent: { readonly onDeviceLost: boolean; readonly onDeviceRestored: boolean; readonly deviceLost: boolean };
      };
    }).__contextLossProbe);

    // The API must exist on the root surface. This is the whole point of the row.
    expect(probe.apiPresent.onDeviceLost).toBe(true);
    expect(probe.apiPresent.onDeviceRestored).toBe(true);
    expect(probe.apiPresent.deviceLost).toBe(true);

    // A healthy app renders and reports no loss.
    expect(probe.beforeLoss.litPixels).toBeGreaterThan(1_000);
    expect(probe.beforeLoss.deviceLost).toBe(false);

    /*
     * WEBGL_lose_context is the only script-driven way to provoke a real loss. If a browser does not
     * expose it the behavioural half cannot be exercised, and the test says so rather than passing
     * vacuously — a green check that proved nothing is the defect class P1 removed.
     */
    expect(probe.extensionAvailable, "WEBGL_lose_context is required to provoke a real context loss").toBe(true);

    // Subscribed BEFORE ready(), so this also proves a pre-mount subscription is not silently dropped.
    expect(probe.afterLoss.lostCount).toBeGreaterThanOrEqual(1);
    expect(probe.afterLoss.deviceLost).toBe(true);

    // Restoration is observable and clears the flag.
    expect(probe.afterRestore.restoredCount).toBeGreaterThanOrEqual(1);
    expect(probe.afterRestore.deviceLost).toBe(false);

    // Unsubscribing detaches: a second loss after unsubscribe must not increment.
    expect(probe.afterUnsubscribe.lostCount).toBe(probe.afterLoss.lostCount);
  });
});
