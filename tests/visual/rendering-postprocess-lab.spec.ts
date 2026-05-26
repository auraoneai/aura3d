import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

declare global {
  interface Window {
    __AURA3D_POSTPROCESS_LAB__?: {
      readonly status: "ready" | "error";
      readonly graphOrder: readonly string[];
      readonly resources?: readonly string[];
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly pixels?: Record<string, readonly number[]>;
      readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly error?: string;
    };
  }
}

test.describe("postprocess graph lab pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("runs tone mapping, bloom, and FXAA in render-graph dependency order", async ({ page }) => {
    await page.goto(`${server.origin}/examples/_quarantine/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.waitForFunction(
      () => window.__AURA3D_POSTPROCESS_LAB__?.status === "ready" || window.__AURA3D_POSTPROCESS_LAB__?.status === "error",
      undefined,
      { timeout: 15_000 }
    ).then(() => page.evaluate(() => window.__AURA3D_POSTPROCESS_LAB__));

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.graphOrder).toEqual(["scene-depth", "depth-visualization", "tone-mapping", "bloom", "fxaa"]);
    expect(result?.resources).toEqual([
      "hdr-color:hdr-input->tone-mapping",
      "scene-depth:scene-depth->depth-visualization",
      "depth-visualization:depth-visualization->present",
      "tone-mapped-color:tone-mapping->bloom",
      "bloom-color:bloom->fxaa",
      "fxaa-color:fxaa->present"
    ]);
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(result?.diagnostics).toMatchObject({ drawCalls: 0, lastError: null });

    const detail = JSON.stringify(result?.pixels);
    expect(channel(result?.pixels?.toneMappedHighlight, 0), detail).toBeGreaterThan(120);
    expect(channel(result?.pixels?.bloomNeighbor, 0), detail).toBeGreaterThan(channel(result?.pixels?.toneMappedHighlight, 2));
    expect(channel(result?.pixels?.fxaaAfterEdge, 0), detail).toBeGreaterThan(20);
    expect(channel(result?.pixels?.fxaaAfterEdge, 0), detail).toBeGreaterThan(channel(result?.pixels?.fxaaBeforeEdge, 0));
    expect(channel(result?.pixels?.presentation, 3), detail).toBe(255);
  });
});

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}
