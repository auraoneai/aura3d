import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

type AnimationVisualHarnessResult = {
  readonly status: "ready" | "error";
  readonly additiveValue?: readonly [number, number, number];
  readonly additivePixel?: readonly number[];
  readonly additiveOrangePixels?: number;
  readonly error?: string;
};

test.describe("animation visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("covers additive layer composition as browser-visible pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/animation-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const state = (window as Window & { __AURA3D_ANIMATION_BROWSER_TEST__?: AnimationVisualHarnessResult }).__AURA3D_ANIMATION_BROWSER_TEST__;
        return state?.status === "ready" || state?.status === "error";
      },
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => (window as Window & { __AURA3D_ANIMATION_BROWSER_TEST__?: AnimationVisualHarnessResult }).__AURA3D_ANIMATION_BROWSER_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.additiveValue?.[0]).toBeCloseTo(-0.15, 5);
    expect(result?.additiveValue?.[1]).toBeCloseTo(0.1, 5);
    expect(result?.additiveOrangePixels).toBeGreaterThanOrEqual(180);
    expect(result?.additivePixel?.[0]).toBeGreaterThan(180);
    expect(result?.additivePixel?.[1]).toBeGreaterThan(70);
    expect(result?.additivePixel?.[2]).toBeLessThan(80);
    expect(result?.additivePixel?.[3]).toBe(255);
  });
});
