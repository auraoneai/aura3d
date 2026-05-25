import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 HD product hero renderer", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a close 2560x1440 imported PBR asset hero under real HDR", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(`${server.origin}/tests/browser/production-runtime-hd-product-hero.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_HD_PRODUCT_HERO__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 45_000 }
      );
    } catch (error) {
      throw new Error(`V6 HD product hero harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_HD_PRODUCT_HERO__) as {
      status: "ready" | "error";
      error?: string;
      assetId?: string;
      proof?: {
        realWebGL2: boolean;
        mockDevice: boolean;
        canvas2dProof: boolean;
        diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null };
        features: readonly { id: string; state: string; detail: string }[];
        pixels: { uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
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
      hdrPipeline?: { realRadianceHdr?: boolean; environmentTextureEncoding?: string; maxLinearValue?: number; specularPrefilter?: boolean; brdfLut?: boolean; specularMipCount?: number };
      summary?: { pass: boolean; missing: readonly string[] };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.summary?.pass, result.summary?.missing?.join(", ")).toBe(true);
    expect(result.assetId).toBe("damaged-helmet");
    expect(result.proof?.realWebGL2).toBe(true);
    expect(result.proof?.mockDevice).toBe(false);
    expect(result.proof?.canvas2dProof).toBe(false);
    expect(result.proof?.importedAsset.assetId).toBe("damaged-helmet-hd-product-hero");
    expect(result.proof?.importedAsset.vertexCount ?? 0).toBeGreaterThanOrEqual(14_000);
    expect(result.proof?.importedAsset.indexCount ?? 0).toBeGreaterThanOrEqual(46_000);
    expect(result.proof?.importedAsset.textureCount).toBeGreaterThanOrEqual(5);
    expect(result.proof?.importedAsset.imageCount).toBeGreaterThanOrEqual(5);
    expect(result.proof?.importedAsset.environmentId).toBe("studio-small-08");
    expect(result.proof?.importedAsset.hdrEnvironmentUri).toContain(".hdr");
    expect(result.hdrPipeline?.realRadianceHdr).toBe(true);
    expect(result.hdrPipeline?.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(result.hdrPipeline?.maxLinearValue ?? 0).toBeGreaterThan(1);
    expect(result.hdrPipeline?.specularPrefilter).toBe(true);
    expect(result.hdrPipeline?.brdfLut).toBe(true);
    expect(result.hdrPipeline?.specularMipCount ?? 0).toBeGreaterThanOrEqual(4);
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThanOrEqual(3);
    expect(result.proof?.diagnostics.textures ?? 0).toBeGreaterThanOrEqual(7);
    expect(result.proof?.diagnostics.textureBytes ?? 0).toBeGreaterThanOrEqual(80_000_000);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.features.some((feature) => feature.id === "anisotropic-texture-filtering")).toBe(true);
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(300);
    expect(result.proof?.pixels.maxLuma).toBeGreaterThan(80);

    const screenshotPath = "tests/reports/production-runtime-hd-product-hero/damaged-helmet-hero.png";
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.locator("#production-runtime-hd-product-hero").screenshot({ path: screenshotPath });
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    expect(pixelStats.width).toBe(2560);
    expect(pixelStats.height).toBe(1440);
    expect(pixelStats.uniqueColorBuckets).toBeGreaterThanOrEqual(300);
    expect(pixelStats.foregroundCoverage).toBeGreaterThanOrEqual(0.05);
    expect(pixelStats.centerForegroundCoverage).toBeGreaterThanOrEqual(0.08);
    expect(pixelStats.detailEdgeDensity).toBeGreaterThanOrEqual(0.013);
    expect(pixelStats.localContrast).toBeGreaterThanOrEqual(26);
    expect(fileSize).toBeGreaterThanOrEqual(384 * 1024);

    const reportPath = "tests/reports/production-runtime-hd-product-hero.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-production-runtime-hd-product-hero/v1",
      generatedAt: new Date().toISOString(),
      pass: true,
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      ...result
    }, null, 2)}\n`);
  });
});
