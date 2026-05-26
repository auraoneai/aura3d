import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 HD PBR material renderer", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders PBR material extension assets at 1920x1080 with HDR evidence", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${server.origin}/tests/browser/production-runtime-hd-materials.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_HD_MATERIALS__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 45_000 }
      );
    } catch (error) {
      throw new Error(`V6 HD materials harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_HD_MATERIALS__) as {
      status: "ready" | "error";
      error?: string;
      assetIds?: readonly string[];
      materialExtensionCoverage?: readonly string[];
      hdrPipeline?: { realRadianceHdr?: boolean; environmentTextureEncoding?: string; maxLinearValue?: number; specularPrefilter?: boolean; brdfLut?: boolean; specularMipCount?: number };
      proof?: {
        realWebGL2: boolean;
        mockDevice: boolean;
        canvas2dProof: boolean;
        diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null };
        pixels: { averageLuma: number; maxLuma: number; uniqueColorBuckets: number };
        importedAsset: {
          assetId: string;
          materialCount: number;
          textureCount: number;
          imageCount: number;
          referenceMaterialCount?: number;
          vertexCount?: number;
          indexCount?: number;
          extensionsUsed?: readonly string[];
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
    expect(result.proof?.importedAsset.assetId).toBe("hd-pbr-material-composed-proof");
    expect(result.assetIds).toEqual(["damaged-helmet", "clear-coat-test", "sheen-test-grid", "specular-test"]);
    expect(result.materialExtensionCoverage).toEqual(expect.arrayContaining([
      "KHR_materials_clearcoat",
      "KHR_materials_sheen",
      "KHR_materials_specular"
    ]));
    expect(result.hdrPipeline?.realRadianceHdr).toBe(true);
    expect(result.hdrPipeline?.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(result.hdrPipeline?.maxLinearValue ?? 0).toBeGreaterThan(1);
    expect(result.hdrPipeline?.specularPrefilter).toBe(true);
    expect(result.hdrPipeline?.brdfLut).toBe(true);
    expect(result.hdrPipeline?.specularMipCount ?? 0).toBeGreaterThanOrEqual(4);
    expect(result.proof?.importedAsset.textureCount).toBeGreaterThanOrEqual(5);
    expect((result.proof?.importedAsset.materialCount ?? 0) + (result.proof?.importedAsset.referenceMaterialCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(result.proof?.importedAsset.environmentId).toBe("industrial-high-contrast");
    expect(result.proof?.importedAsset.hdrEnvironmentUri).toContain(".hdr");
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThanOrEqual(10);
    expect(result.proof?.diagnostics.textures ?? 0).toBeGreaterThanOrEqual(7);
    expect(result.proof?.diagnostics.textureBytes ?? 0).toBeGreaterThanOrEqual(80_000_000);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(180);
    expect(result.proof?.pixels.maxLuma).toBeGreaterThan(80);

    const screenshotPath = "tests/reports/production-runtime-hd-materials/pbr-materials-hd.png";
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.locator("#production-runtime-hd-materials").screenshot({ path: screenshotPath });
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    expect(pixelStats.width).toBe(1920);
    expect(pixelStats.height).toBe(1080);
    expect(pixelStats.uniqueColorBuckets).toBeGreaterThanOrEqual(180);
    expect(pixelStats.foregroundCoverage).toBeGreaterThanOrEqual(0.2);
    expect(pixelStats.centerForegroundCoverage).toBeGreaterThanOrEqual(0.16);
    expect(pixelStats.detailEdgeDensity).toBeGreaterThanOrEqual(0.004);
    expect(pixelStats.localContrast).toBeGreaterThanOrEqual(16);
    expect(fileSize).toBeGreaterThanOrEqual(192 * 1024);

    const reportPath = "tests/reports/production-runtime-hd-materials.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "a3d-production-runtime-hd-materials/v1",
      generatedAt: new Date().toISOString(),
      pass: true,
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      ...result
    }, null, 2)}\n`);
  });
});
