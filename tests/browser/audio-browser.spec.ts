import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("audio browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("unlocks a real browser context and plays a short AudioSource", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/audio-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#audio-start").click();
    await page.waitForFunction(
      () => window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "ready" || window.__AURA3D_AUDIO_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_AUDIO_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.contextState).toBe("running");
    expect(result?.clipDuration).toBeGreaterThan(0);
    expect(result?.sourceStateAfterPlay).toBe("playing");
    expect(result?.sourceStateAfterStop).toBe("stopped");
  });
});

declare global {
  interface Window {
    __AURA3D_AUDIO_BROWSER_TEST__?: {
      readonly status: "waiting" | "ready" | "error";
      readonly contextState: string;
      readonly clipDuration: number;
      readonly sourceStateAfterPlay: string;
      readonly sourceStateAfterStop: string;
      readonly error?: string;
    };
  }
}
