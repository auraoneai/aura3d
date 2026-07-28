import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("depth-aware volumetric light", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders occluded radial participating-media light through the renderer postprocess chain", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/volumetric-light-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_VOLUMETRIC_LIGHT__?.status === "ready" ||
        window.__AURA3D_VOLUMETRIC_LIGHT__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_VOLUMETRIC_LIGHT__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.passNames).toEqual(["volumetric-light"]);
    expect(result?.depthTextures).toBeGreaterThanOrEqual(2);
    expect(result?.changedPixels).toBeGreaterThan(500);
    expect(result?.warmedPixels).toBeGreaterThan(250);
    expect(result?.lumaContrast).toBeGreaterThan(100);
    expect(result?.claimBoundary).toMatch(/no volumetric clouds.*multiple scattering/i);
  });
});

declare global {
  interface Window {
    __AURA3D_VOLUMETRIC_LIGHT__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly passNames?: readonly string[];
      readonly depthTextures?: number;
      readonly changedPixels?: number;
      readonly warmedPixels?: number;
      readonly shadowedCenterLuma?: number;
      readonly litSideLuma?: number;
      readonly lumaContrast?: number;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
