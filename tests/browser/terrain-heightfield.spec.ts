import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("terrain heightfield geometry", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders reusable indexed terrain with non-flat height evidence", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/terrain-heightfield-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_TERRAIN_HEIGHTFIELD__?.status === "ready" ||
        window.__AURA3D_TERRAIN_HEIGHTFIELD__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_TERRAIN_HEIGHTFIELD__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.vertexCount).toBe(48 * 36);
    expect(result?.triangleCount).toBe(47 * 35 * 2);
    expect(result?.colliderKind).toBe("heightfield");
    expect(result?.nonBackgroundPixels).toBeGreaterThan(3_000);
    expect(result?.greenTerrainPixels).toBeGreaterThan(1_000);
    expect((result?.heightRange?.[1] ?? 0) - (result?.heightRange?.[0] ?? 0)).toBeGreaterThan(0.35);
    expect(result?.claimBoundary).toMatch(/does not claim native heightfield collision/i);
  });
});

declare global {
  interface Window {
    __AURA3D_TERRAIN_HEIGHTFIELD__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly vertexCount?: number;
      readonly triangleCount?: number;
      readonly colliderKind?: string;
      readonly nonBackgroundPixels?: number;
      readonly greenTerrainPixels?: number;
      readonly heightRange?: readonly [number, number];
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
