import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("input browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures keyboard focus, touch-style pointer IDs, and pointer lock settlement", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/input-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#lock-target").click();
    await page.waitForFunction(
      () => window.__AURA3D_INPUT_BROWSER_TEST__?.status === "ready" || window.__AURA3D_INPUT_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_INPUT_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.keyboardBeforeBlur).toBe(true);
    expect(result?.keyboardAfterBlur).toBe(false);
    expect(result?.pointerButtonDown).toBe(true);
    expect(result?.touchCountDuringDown).toBe(1);
    expect(result?.touchCountAfterUp).toBe(0);
    expect(result?.pointerLock.available).toBe(true);
    expect(result?.pointerLock.requested).toBe(true);
    expect(result?.pointerLock.settled).toBe(true);
  });
});

declare global {
  interface Window {
    __AURA3D_INPUT_BROWSER_TEST__?: {
      readonly status: "running" | "ready" | "error";
      readonly keyboardBeforeBlur: boolean;
      readonly keyboardAfterBlur: boolean;
      readonly pointerButtonDown: boolean;
      readonly touchCountDuringDown: number;
      readonly touchCountAfterUp: number;
      readonly pointerLock: {
        readonly available: boolean;
        readonly requested: boolean;
        readonly settled: boolean;
        readonly granted: boolean;
        readonly error?: string;
      };
      readonly error?: string;
    };
  }
}
