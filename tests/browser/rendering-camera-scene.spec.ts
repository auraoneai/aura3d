import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering camera scene integration", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("uses camera matrices for scene renderables in browser execution", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-camera-scene-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_CAMERA_SCENE_TEST__?.status === "ready" || window.__GALILEO3D_CAMERA_SCENE_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_CAMERA_SCENE_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.drawCalls).toBe(1);
    expect(result?.modelTranslation).toEqual([2, 3, 4, 1]);
    expect(result?.normalScale).toEqual([0.5, 0.25, 0.125, 1]);
    expect(result?.mvpTranslation).toEqual([3, 5, 7, 1]);
    expect(result?.sceneCameraDrawCalls).toBe(1);

    const [r = 0, g = 0, b = 0, a = 0] = result?.sceneCameraPixel ?? [];
    expect(r).toBeGreaterThan(160);
    expect(g).toBeGreaterThan(25);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(40);
    expect(a).toBe(255);

    expect(result?.movingCameraFrames).toHaveLength(3);
    for (const frame of result?.movingCameraFrames ?? []) {
      expect(frame.drawCalls, JSON.stringify(frame)).toBe(1);
      expect(frame.nonDarkPixels, JSON.stringify(frame)).toBeGreaterThan(300);
      expect(frame.colorBuckets, JSON.stringify(frame)).toBeGreaterThan(1);
    }

    expect(result?.orbitCameraFrames).toHaveLength(3);
    for (const frame of result?.orbitCameraFrames ?? []) {
      expect(frame.drawCalls, JSON.stringify(frame)).toBe(1);
      expect(frame.nonDarkPixels, JSON.stringify(frame)).toBeGreaterThan(900);
      expect(frame.colorBuckets, JSON.stringify(frame)).toBeGreaterThan(4);
    }
  });
});

declare global {
  interface Window {
    __GALILEO3D_CAMERA_SCENE_TEST__?: {
      readonly status: "ready" | "error";
      readonly drawCalls?: number;
      readonly modelTranslation?: readonly number[];
      readonly normalScale?: readonly number[];
      readonly mvpTranslation?: readonly number[];
      readonly sceneCameraDrawCalls?: number;
      readonly sceneCameraPixel?: readonly number[];
      readonly movingCameraFrames?: readonly {
        readonly cameraX: number;
        readonly drawCalls: number;
        readonly nonDarkPixels: number;
        readonly colorBuckets: number;
      }[];
      readonly orbitCameraFrames?: readonly {
        readonly cameraX: number;
        readonly drawCalls: number;
        readonly nonDarkPixels: number;
        readonly colorBuckets: number;
      }[];
      readonly error?: string;
    };
  }
}
