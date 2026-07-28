import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("scene-space transmission refraction", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures opaque scene color and visibly offsets it through transmission geometry", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/transmission-refraction-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_TRANSMISSION_REFRACTION__?.status === "ready" ||
        window.__AURA3D_TRANSMISSION_REFRACTION__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_TRANSMISSION_REFRACTION__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("production-runtime-webgl2");
    expect(result?.flat?.mode).toBe("renderer-owned-scene-color-readback");
    expect(result?.flat?.excludedTransmissionItems).toBe(1);
    expect(result?.refracted?.excludedTransmissionItems).toBe(1);
    expect(result?.refracted?.materialBindings).toBe(1);
    expect(result?.refracted?.mipCount).toBeGreaterThan(1);
    expect(result?.refracted?.refractionScale).toBe(0.14);
    expect(result?.changedPixels).toBeGreaterThan(300);
    expect(result?.centerChangedPixels).toBeGreaterThan(200);
    expect(result?.claimBoundary).toMatch(/no depth ray marching.*physical caustic projection/i);
  });
});

declare global {
  interface Window {
    __AURA3D_TRANSMISSION_REFRACTION__?: {
      readonly status: "ready" | "error";
      readonly renderer: "production-runtime-webgl2";
      readonly flat?: {
        readonly mode: string;
        readonly excludedTransmissionItems: number;
      };
      readonly refracted?: {
        readonly excludedTransmissionItems: number;
        readonly materialBindings: number;
        readonly mipCount: number;
        readonly refractionScale: number;
      };
      readonly changedPixels?: number;
      readonly centerChangedPixels?: number;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
