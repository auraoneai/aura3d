import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 HD flagship renderer", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders composed real GLB assets at 1920x1080 with PBR/HDR evidence", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${server.origin}/tests/browser/v6-hd-flagship.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_WEBGL2__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 45_000 }
      );
    } catch (error) {
      throw new Error(`V6 HD flagship harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_WEBGL2__) as {
      status: "ready" | "error";
      error?: string;
      assetIds?: readonly string[];
      proof?: {
        realWebGL2: boolean;
        mockDevice: boolean;
        canvas2dProof: boolean;
        diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null };
        pixels: { nonBlackPixels: number; averageLuma: number; maxLuma: number; uniqueColorBuckets: number };
        importedAsset: {
          assetId: string;
          materialCount: number;
          textureCount: number;
          imageCount: number;
          vertexCount?: number;
          indexCount?: number;
          environmentId?: string;
          hdrEnvironmentUri?: string;
        };
      };
      summary?: { pass: boolean; missing: readonly string[] };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.summary?.pass, result.summary?.missing?.join(", ")).toBe(true);
    expect(result.proof?.realWebGL2).toBe(true);
    expect(result.proof?.mockDevice).toBe(false);
    expect(result.proof?.canvas2dProof).toBe(false);
    expect(result.proof?.importedAsset.assetId).toBe("damaged-helmet-composed-proof");
    expect(result.assetIds).toEqual(["damaged-helmet", "boom-box", "antique-camera"]);
    expect(result.proof?.importedAsset.vertexCount ?? 0).toBeGreaterThanOrEqual(39_000);
    expect(result.proof?.importedAsset.indexCount ?? 0).toBeGreaterThanOrEqual(120_000);
    expect(result.proof?.importedAsset.textureCount).toBeGreaterThanOrEqual(15);
    expect(result.proof?.importedAsset.imageCount).toBeGreaterThanOrEqual(15);
    expect(result.proof?.importedAsset.environmentId).toBe("studio-small-08");
    expect(result.proof?.importedAsset.hdrEnvironmentUri).toContain(".hdr");
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThanOrEqual(6);
    expect(result.proof?.diagnostics.textures ?? 0).toBeGreaterThanOrEqual(21);
    expect(result.proof?.diagnostics.textureBytes ?? 0).toBeGreaterThanOrEqual(200_000_000);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(250);
    expect(result.proof?.pixels.averageLuma).toBeGreaterThan(12);
    expect(result.proof?.pixels.maxLuma).toBeGreaterThan(80);

    const screenshotPath = "tests/reports/v6-hd-flagship/composed-product-hd.png";
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.locator("#v6-webgl2").screenshot({ path: screenshotPath });
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    expect(pixelStats.width).toBe(1920);
    expect(pixelStats.height).toBe(1080);
    expect(pixelStats.uniqueColorBuckets).toBeGreaterThanOrEqual(250);
    expect(pixelStats.foregroundCoverage).toBeGreaterThanOrEqual(0.25);
    expect(pixelStats.centerForegroundCoverage).toBeGreaterThanOrEqual(0.2);
    expect(pixelStats.detailEdgeDensity).toBeGreaterThanOrEqual(0.006);
    expect(pixelStats.localContrast).toBeGreaterThanOrEqual(18);
    expect(fileSize).toBeGreaterThanOrEqual(256 * 1024);

    const reportPath = "tests/reports/v6-hd-flagship.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-v6-hd-flagship/v1",
      generatedAt: new Date().toISOString(),
      pass: true,
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      ...result
    }, null, 2)}\n`);
  });
});
