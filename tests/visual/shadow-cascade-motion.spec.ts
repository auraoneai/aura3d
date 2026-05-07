import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

declare global {
  interface Window {
    __GALILEO3D_SHADOW_LAB__?: {
      status: "ready" | "error";
      renderer: "webgl2-plus-shadow-pass";
      diagnostics?: { drawCalls: number; lastError: string | null };
      cascadeCount?: number;
      cascadeSplits?: readonly { index: number; near: number; far: number }[];
      cascadeRendered?: readonly boolean[];
      initialShadowCentroid?: readonly [number, number];
      movedShadowCentroid?: readonly [number, number];
      shadowPixel?: readonly number[];
      planePixel?: readonly number[];
      canvasFrame?: { width: number; height: number };
      error?: string;
    };
  }
}

test.describe("shadow cascade motion visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a WebGL2 caster and stable cascaded shadow-pass metadata for a moved caster projection", async ({ page }) => {
    await page.goto(`${server.origin}/examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.waitForFunction(
      () => window.__GALILEO3D_SHADOW_LAB__?.status === "ready" || window.__GALILEO3D_SHADOW_LAB__?.status === "error",
      undefined,
      { timeout: 15_000 }
    ).then(() => page.evaluate(() => window.__GALILEO3D_SHADOW_LAB__));

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2-plus-shadow-pass");
    expect(result?.diagnostics?.drawCalls).toBe(1);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.cascadeCount).toBe(3);
    expect(result?.cascadeRendered).toEqual([true, true, true]);
    expect(result?.cascadeSplits?.map((split) => split.index)).toEqual([0, 1, 2]);
    expect(result?.cascadeSplits?.[0]?.near).toBeCloseTo(0.1, 5);
    expect(result?.cascadeSplits?.[2]?.far).toBeCloseTo(36, 5);
    expect(result?.canvasFrame).toEqual({ width: 480, height: 540 });

    const initial = result?.initialShadowCentroid;
    const moved = result?.movedShadowCentroid;
    expect(initial).toBeDefined();
    expect(moved).toBeDefined();
    expect((moved?.[0] ?? 0) - (initial?.[0] ?? 0)).toBeGreaterThan(0.7);

    expect(rgbSum(result?.shadowPixel)).toBeLessThan(rgbSum(result?.planePixel) - 130);
  });
});

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function rgbSum(pixel: readonly number[] | undefined): number {
  return channel(pixel, 0) + channel(pixel, 1) + channel(pixel, 2);
}
