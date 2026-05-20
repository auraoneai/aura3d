import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 WebGL2 real renderer", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders an imported GLB through the real WebGL2 renderer and captures visible pixels", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/v6-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_WEBGL2__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 30_000 }
      );
    } catch (error) {
      throw new Error(`V6 WebGL2 harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_WEBGL2__) as {
      status: "ready" | "error";
      error?: string;
      proof?: {
        realWebGL2: boolean;
        mockDevice: boolean;
        canvas2dProof: boolean;
        diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null };
        pixels: { nonBlackPixels: number; averageLuma: number; maxLuma: number; uniqueColorBuckets: number; centerPixel: readonly number[] };
        importedAsset: { assetId: string; materialCount: number; textureCount: number; imageCount: number };
      };
      assetIds?: readonly string[];
      summary?: { pass: boolean; missing: readonly string[] };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.summary?.pass, result.summary?.missing?.join(", ")).toBe(true);
    expect(result.proof?.realWebGL2).toBe(true);
    expect(result.proof?.mockDevice).toBe(false);
    expect(result.proof?.canvas2dProof).toBe(false);
    expect(result.proof?.importedAsset.assetId).toBe("damaged-helmet-composed-proof");
    expect(result.assetIds).toEqual(["damaged-helmet", "boom-box", "antique-camera"]);
    expect(result.proof?.importedAsset.materialCount).toBeGreaterThan(0);
    expect(result.proof?.importedAsset.textureCount).toBeGreaterThanOrEqual(5);
    expect(result.proof?.importedAsset.imageCount).toBeGreaterThanOrEqual(5);
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThan(0);
    expect(result.proof?.diagnostics.textures).toBeGreaterThan(0);
    expect(result.proof?.diagnostics.textureBytes).toBeGreaterThan(0);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.pixels.nonBlackPixels).toBeGreaterThan(2000);
    expect(result.proof?.pixels.averageLuma).toBeGreaterThan(4);
    expect(result.proof?.pixels.maxLuma).toBeGreaterThan(40);
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(8);

    const canvas = page.locator("#v6-webgl2");
    const screenshotPath = "tests/reports/v6-webgl2/damaged-helmet-webgl2.png";
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await canvas.screenshot({ path: screenshotPath });
    const reportPath = "tests/reports/v6-webgl2-real-renderer.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-v6-webgl2-real-renderer/v1",
      generatedAt: new Date().toISOString(),
      screenshot: screenshotPath,
      ...result
    }, null, 2)}\n`);
  });
});
