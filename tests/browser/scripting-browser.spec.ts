import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("scripting browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("runs a simple behavior demo that moves a scene node", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/scripting-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SCRIPTING_BROWSER_TEST__?.status === "ready" || window.__AURA3D_SCRIPTING_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_SCRIPTING_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.position).toEqual([3, 3, 4]);
    expect(result?.errorCount).toBe(0);
    expect(result?.nonBlankPixels).toBeGreaterThan(300);
  });
});

declare global {
  interface Window {
    __AURA3D_SCRIPTING_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly position?: readonly number[];
      readonly nonBlankPixels?: number;
      readonly errorCount?: number;
      readonly error?: string;
    };
  }
}
