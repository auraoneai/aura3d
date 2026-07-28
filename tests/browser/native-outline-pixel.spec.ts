import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test("ported native WebGL2 postprocess passes match their CPU byte kernels", async ({ page }) => {
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/native-outline-pixel-harness.html`);
    await page.waitForFunction(() => window.__AURA3D_NATIVE_OUTLINE_PIXEL__?.status !== undefined);
    const result = await page.evaluate(() => window.__AURA3D_NATIVE_OUTLINE_PIXEL__);
    expect(result, result?.error).toMatchObject({
      status: "ready",
      width: 9,
      height: 7,
      maxChannelDelta: 0,
      changedChannelCount: 0,
      bloomMaxChannelDelta: 0,
      bloomChangedChannelCount: 0
    });
    expect(result?.ssaoMaxChannelDelta).toBeLessThanOrEqual(1);
    expect(result?.ssaoChangedChannelCount).toBe(0);
    expect(result?.ssaoEffectChangedChannelCount).toBeGreaterThan(0);
    expect(result?.ssrMaxChannelDelta).toBeLessThanOrEqual(1);
    expect(result?.ssrChangedChannelCount).toBeLessThanOrEqual(4);
    expect(result?.ssrEffectChangedChannelCount).toBeGreaterThan(0);
    expect(result?.depthOfFieldMaxChannelDelta).toBeLessThanOrEqual(1);
    expect(result?.depthOfFieldChangedChannelCount).toBeLessThanOrEqual(8);
    expect(result?.depthOfFieldEffectChangedChannelCount).toBeGreaterThan(0);
    expect(result?.motionBlurMaxChannelDelta).toBeLessThanOrEqual(1);
    expect(result?.motionBlurChangedChannelCount).toBeLessThanOrEqual(8);
    expect(result?.motionBlurEffectChangedChannelCount).toBeGreaterThan(0);
    expect(result?.taaMaxChannelDelta).toBeLessThanOrEqual(1);
    expect(result?.taaChangedChannelCount).toBeLessThanOrEqual(8);
    expect(result?.taaEffectChangedChannelCount).toBeGreaterThan(0);
  } finally {
    await server.close();
  }
});
