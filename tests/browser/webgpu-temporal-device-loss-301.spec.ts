import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { runTemporalDeviceLoss301 } from "./webgpu-temporal-device-loss-301-harness";

test.describe("native WebGPU temporal device loss", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  test("destroys a real device with pending readback, disposes histories, rejects stale work and explicitly reseeds WebGPU", async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      (window as unknown as { webglFallbackRequests301: number }).webglFallbackRequests301 = 0;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        if (/^webgl/.test(String(args[0]))) (window as unknown as { webglFallbackRequests301: number }).webglFallbackRequests301++;
        return Reflect.apply(original, this, args);
      } as typeof original;
    });
    await page.goto(`${server.origin}/tests/browser/webgpu-temporal-device-loss-301-harness.html`);
    await page.waitForFunction(() => typeof (window as unknown as { runTemporalDeviceLoss301: unknown }).runTemporalDeviceLoss301 === "function");
    const report = await page.evaluate(() => (window as unknown as { runTemporalDeviceLoss301: typeof runTemporalDeviceLoss301 }).runTemporalDeviceLoss301());
    await testInfo.attach("native-device-loss", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    expect(await page.evaluate(() => (window as unknown as { webglFallbackRequests301: number }).webglFallbackRequests301)).toBe(0);
    expect(report.backend).toBe("webgpu");
    expect(report.replacementBackend).toBe("webgpu");
    expect(report.loss.reason).toBe("destroyed");
    expect(report.contextLost).toBe(true);
    expect(report.lastError).toMatch(/device lost/i);
    expect(report.renderError).toMatch(/context is lost/i);
    expect(report.readError).toMatch(/context is lost/i);
    expect(report.historyDisposed).toBe(true);
    expect(report.allTargetsDisposed).toBe(true);
    expect(report.beforeNonzero).toBe(true);
    expect(report.reseededNonzero).toBe(true);
    expect(report.reseedReferenceMaxDelta).toBeLessThanOrEqual(1);
  });
});
