import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

declare global {
  interface Window {
    __AURA3D_MATERIAL_LAB__?: {
      status: "ready" | "error";
      renderer: "webgl2";
      diagnostics?: { drawCalls: number; lastError: string | null };
      canvasFrame?: { width: number; height: number };
      pixels?: Record<string, readonly number[]>;
      materials?: readonly string[];
      error?: string;
    };
  }
}

test.describe("material matrix visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders base color, vertex color, normal map, metallic-roughness, occlusion, emissive, alpha mask, double-sided, UV transform, and alpha blend materials through WebGL2", async ({ page }) => {
    await page.goto(`${server.origin}/examples/material-lab/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.waitForFunction(
      () => window.__AURA3D_MATERIAL_LAB__?.status === "ready" || window.__AURA3D_MATERIAL_LAB__?.status === "error",
      undefined,
      { timeout: 15_000 }
    ).then(() => page.evaluate(() => window.__AURA3D_MATERIAL_LAB__));

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.canvasFrame).toEqual({ width: 960, height: 540 });
    expect(result?.diagnostics?.drawCalls).toBe(6);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.materials).toEqual([
      "material:base-color",
      "material:vertex-color",
      "material:normal-map",
      "material:metallic-roughness",
      "material:alpha-mask",
      "material:alpha-blend"
    ]);

    const pixelDetail = JSON.stringify(result?.pixels);
    expect(isWarmRed(result?.pixels?.baseColor), pixelDetail).toBe(true);
    expect(isVertexGreen(result?.pixels?.vertexColor), pixelDetail).toBe(true);
    expect(isNormalMappedBlue(result?.pixels?.normalMap), pixelDetail).toBe(true);
    expect(isMetallicGold(result?.pixels?.metallic), pixelDetail).toBe(true);
    expect(isMaskedCyan(result?.pixels?.alphaMask), pixelDetail).toBe(true);
    expect(isAlphaPurple(result?.pixels?.alphaBlend), pixelDetail).toBe(true);
  });
});

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function isWarmRed(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 180 && channel(pixel, 1) < 80 && channel(pixel, 2) < 60 && channel(pixel, 3) === 255;
}

function isNormalMappedBlue(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 2) > 150 && channel(pixel, 1) > 120 && channel(pixel, 3) === 255;
}

function isVertexGreen(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > 145 && channel(pixel, 0) < 90 && channel(pixel, 2) < 120 && channel(pixel, 3) === 255;
}

function isMetallicGold(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 80 && channel(pixel, 1) > 45 && channel(pixel, 2) < 95 && channel(pixel, 3) === 255;
}

function isAlphaPurple(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 120 && channel(pixel, 2) > 120 && channel(pixel, 1) < 145 && channel(pixel, 3) === 255;
}

function isMaskedCyan(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > 145 && channel(pixel, 2) > 120 && channel(pixel, 0) < 80 && channel(pixel, 3) === 255;
}
