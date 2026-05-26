import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("shadow browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a stable projected shadow from a ShadowPass caster and directional light", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/shadow-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SHADOW_BROWSER_TEST__?.status === "ready" || window.__AURA3D_SHADOW_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_SHADOW_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.shadowRendered).toBe(true);
    expect(result?.polygonPointCount).toBeGreaterThanOrEqual(4);

    const [sr = 255, sg = 255, sb = 255, sa = 0] = result?.shadowPixel ?? [];
    const [pr = 0, pg = 0, pb = 0, pa = 0] = result?.planePixel ?? [];
    expect(sr + sg + sb).toBeLessThan(pr + pg + pb - 120);
    expect(sa).toBe(255);
    expect(pa).toBe(255);
  });
});

declare global {
  interface Window {
    __AURA3D_SHADOW_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly shadowRendered?: boolean;
      readonly polygonPointCount?: number;
      readonly shadowPixel?: readonly number[];
      readonly planePixel?: readonly number[];
      readonly error?: string;
    };
  }
}
