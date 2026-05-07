import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

type SkinnedAnimationVisualResult = {
  readonly status: "ready" | "error";
  readonly skinnedPixel?: readonly number[];
  readonly externalCharacter?: {
    readonly assetId: "cesium-man";
    readonly vertexCount: number;
    readonly jointCount: number;
    readonly frameAGreenPixels: number;
    readonly frameBGreenPixels: number;
    readonly changedPixels: number;
    readonly drawCalls: readonly [number, number];
  };
  readonly paletteJointCount?: number;
  readonly paletteChildTranslation?: readonly [number, number, number];
  readonly skinnedDrawCalls?: number;
  readonly error?: string;
};

test.describe("skinned animation visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders skinned geometry through the renderer skinning path", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/animation-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const state = (window as Window & { __GALILEO3D_ANIMATION_BROWSER_TEST__?: SkinnedAnimationVisualResult }).__GALILEO3D_ANIMATION_BROWSER_TEST__;
        return state?.status === "ready" || state?.status === "error";
      },
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => (window as Window & { __GALILEO3D_ANIMATION_BROWSER_TEST__?: SkinnedAnimationVisualResult }).__GALILEO3D_ANIMATION_BROWSER_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.paletteJointCount).toBe(2);
    expect(result?.paletteChildTranslation?.[0]).toBeCloseTo(0.75, 5);
    expect(result?.skinnedDrawCalls).toBe(1);
    expect(result?.skinnedPixel?.[0]).toBeGreaterThanOrEqual(15);
    expect(result?.skinnedPixel?.[1]).toBeGreaterThanOrEqual(190);
    expect(result?.skinnedPixel?.[2]).toBeGreaterThanOrEqual(80);
    expect(result?.skinnedPixel?.[3]).toBe(255);
    expect(result?.externalCharacter).toMatchObject({
      assetId: "cesium-man",
      vertexCount: 3273,
      jointCount: 19,
      drawCalls: [1, 1]
    });
    expect(result?.externalCharacter?.frameAGreenPixels).toBeGreaterThan(250);
    expect(result?.externalCharacter?.frameBGreenPixels).toBeGreaterThan(250);
    expect(result?.externalCharacter?.changedPixels).toBeGreaterThan(50);
  });
});
