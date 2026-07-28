import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_CUBE_CAMERA_REFLECTIONS__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly claimBoundary: string;
      readonly faceCount?: number;
      readonly captureRevisions?: readonly [number, number];
      readonly captureChangedFaceCount?: number;
      readonly firstReflectivePixel?: readonly number[];
      readonly movedReflectivePixel?: readonly number[];
      readonly reflectiveFrameChangedPixelCount?: number;
      readonly surfaceStatus?: string;
      readonly trueReflection?: boolean;
      readonly error?: string;
    };
  }
}

test.describe("cube camera reflection capture", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("moves a rendered object through a six-face probe and changes reflective PBR surface pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/cube-camera-reflections-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_CUBE_CAMERA_REFLECTIONS__?.status === "ready" ||
        window.__AURA3D_CUBE_CAMERA_REFLECTIONS__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_CUBE_CAMERA_REFLECTIONS__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.faceCount).toBe(6);
    expect(result?.captureRevisions).toEqual([1, 2]);
    expect(result?.captureChangedFaceCount).toBeGreaterThan(0);
    expect(result?.surfaceStatus).toBe("implemented");
    expect(result?.trueReflection).toBe(true);
    expect(result?.firstReflectivePixel?.[3]).toBe(255);
    expect(result?.movedReflectivePixel?.[3]).toBe(255);
    expect(
      result?.reflectiveFrameChangedPixelCount,
      JSON.stringify({
        firstReflectivePixel: result?.firstReflectivePixel,
        movedReflectivePixel: result?.movedReflectivePixel,
        captureChangedFaceCount: result?.captureChangedFaceCount
      })
    ).toBeGreaterThan(20);
    expect(result?.claimBoundary).toMatch(/no planar mirror, SSR, recursive capture, or createAuraApp claim/i);
  });
});
