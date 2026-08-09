import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
 * listeners, which is why WS-1.6 corrected the wording before this work started. The test now drives the
 * retained application route rather than a test-only harness, so the parity row has a real production
 * consumer as well as browser evidence.
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
    await page.goto(`${server.origin}/apps/context-loss-recovery/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean(window.__AURA3D_CONTEXT_LOSS_RECOVERY__),
      undefined,
      { timeout: 60_000 }
    );
    let probe = await page.evaluate(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__!);
    expect(probe.error ?? consoleErrors.join(" | "), "diagnostic route must run to completion").toBeFalsy();

    // The API must exist on the root surface. This is the whole point of the row.
    expect(probe.apiPresent.onDeviceLost).toBe(true);
    expect(probe.apiPresent.onDeviceRestored).toBe(true);
    expect(probe.apiPresent.deviceLost).toBe(true);

    // A healthy app renders and reports no loss.
    expect(probe.beforeLoss.litPixels).toBeGreaterThan(1_000);
    expect(probe.beforeLoss.deviceLost).toBe(false);
    expect(probe.runtimeBackend).toBe("production-runtime");
    expect(probe.rendererMode).toBe("production");

    /*
     * WEBGL_lose_context is the only script-driven way to provoke a real loss. If a browser does not
     * expose it the behavioural half cannot be exercised, and the test says so rather than passing
     * vacuously — a green check that proved nothing is the defect class P1 removed.
     */
    expect(probe.extensionAvailable, "WEBGL_lose_context is required to provoke a real context loss").toBe(true);

    // Subscribed BEFORE ready(), so this also proves a pre-mount subscription is not silently dropped.
    await page.getByRole("button", { name: "Lose WebGL context" }).click();
    await page.waitForFunction(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__?.status === "lost");
    probe = await page.evaluate(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__!);
    expect(probe.lostCount).toBeGreaterThanOrEqual(1);
    expect(probe.deviceLost).toBe(true);
    expect(probe.pausedOnLoss).toBe(true);

    // Restoration is observable and clears the flag.
    await page.getByRole("button", { name: "Restore WebGL context" }).click();
    await page.waitForFunction(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__?.status === "restored");
    probe = await page.evaluate(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__!);
    expect(probe.restoredCount).toBeGreaterThanOrEqual(1);
    expect(probe.recoveryCount).toBeGreaterThanOrEqual(1);
    expect(probe.deviceLost).toBe(false);
    expect(probe.resourcesRecreated, JSON.stringify(probe)).toBe(true);
    expect(probe.sceneRestored).toBe(true);
    expect(probe.afterRestore.litPixels).toBeGreaterThan(1_000);
    expect(probe.afterRestore.pixelHash).toBe(probe.beforeLoss.pixelHash);
    expect(probe.afterRestore.runtimeMounted).toBe(true);

    const lifecycleEvidence = {
      schema: "aura3d-public-context-lifecycle/1.0",
      generatedAt: new Date().toISOString(),
      pass: probe.runtimeBackend === "production-runtime"
        && probe.rendererMode === "production"
        && probe.beforeLoss.litPixels > 1_000
        && probe.lostCount >= 1
        && probe.restoredCount >= 1
        && probe.recoveryCount >= 1
        && probe.pausedOnLoss
        && probe.resourcesRecreated
        && probe.sceneRestored
        && probe.afterRestore.litPixels > 1_000
        && probe.afterRestore.pixelHash === probe.beforeLoss.pixelHash
        && !probe.deviceLost
        && Object.values(probe.apiPresent).every(Boolean),
      probe
    };
    mkdirSync(resolve("tests/reports/public-renderer-normal-path"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/public-renderer-normal-path/context-lifecycle.json"),
      `${JSON.stringify(lifecycleEvidence, null, 2)}\n`
    );
    expect(lifecycleEvidence.pass).toBe(true);

    // Unsubscribing detaches: a second loss after unsubscribe must not increment.
    const lostCountBeforeUnsubscribe = probe.lostCount;
    await page.getByRole("button", { name: "Unsubscribe loss listener" }).click();
    await page.getByRole("button", { name: "Lose WebGL context" }).click();
    await page.waitForTimeout(100);
    probe = await page.evaluate(() => window.__AURA3D_CONTEXT_LOSS_RECOVERY__!);
    expect(probe.lossSubscriptionActive).toBe(false);
    expect(probe.lostCount).toBe(lostCountBeforeUnsubscribe);
  });
});

declare global {
  interface Window {
    __AURA3D_CONTEXT_LOSS_RECOVERY__?: {
      readonly status: "ready" | "lost" | "recovering" | "restored" | "error";
      readonly extensionAvailable: boolean;
      readonly beforeLoss: { readonly litPixels: number; readonly pixelHash: string; readonly deviceLost: boolean };
      readonly afterRestore: { readonly litPixels: number; readonly pixelHash: string; readonly runtimeMounted: boolean };
      readonly lostCount: number;
      readonly restoredCount: number;
      readonly recoveryCount: number;
      readonly deviceLost: boolean;
      readonly pausedOnLoss: boolean;
      readonly resourcesRecreated: boolean;
      readonly sceneRestored: boolean;
      readonly runtimeBackend: string | undefined;
      readonly rendererMode: string;
      readonly lossSubscriptionActive: boolean;
      readonly apiPresent: { readonly onDeviceLost: boolean; readonly onDeviceRestored: boolean; readonly deviceLost: boolean };
      readonly error?: string;
    };
  }
}
