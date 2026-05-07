import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("core EngineLoop RAF mode", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("starts on requestAnimationFrame and stops without scheduling extra frames", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/core-raf-loop-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_CORE_RAF_TEST__?.status === "ready" || window.__GALILEO3D_CORE_RAF_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_CORE_RAF_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.frameCount).toBe(3);
    expect(result?.fixedStepTotal).toBeGreaterThanOrEqual(0);
    expect(result?.alphaSamples).toHaveLength(3);
    for (const alpha of result?.alphaSamples ?? []) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});

declare global {
  interface Window {
    __GALILEO3D_CORE_RAF_TEST__?: {
      readonly status: "running" | "ready" | "error";
      readonly frameCount: number;
      readonly fixedStepTotal: number;
      readonly alphaSamples: readonly number[];
      readonly error?: string;
    };
  }
}
