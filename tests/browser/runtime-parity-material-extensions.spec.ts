import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 material extension artifacts", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders dedicated material extension assets across the V7 suite", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/tests/browser/runtime-parity-material-extensions.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V7_MATERIAL_EXTENSIONS__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
    } catch (error) {
      throw new Error(`V7 material extension harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V7_MATERIAL_EXTENSIONS__) as {
      status: "ready" | "error";
      error?: string;
      expectedExtensions?: readonly string[];
      expectedFeatures?: readonly string[];
      extensionsUsed?: readonly string[];
      materialFeatures?: readonly string[];
      assets?: readonly {
        id: string;
        expectedExtension: string;
        expectedFeature: string;
        extensionsUsed: readonly string[];
        materialFeatures: readonly string[];
        unsupportedExtensions: readonly string[];
        materialCount: number;
        textureCount: number;
      }[];
      hdrPipeline?: { realRadianceHdr?: boolean; specularPrefilter?: boolean; brdfLut?: boolean; specularMipCount?: number; maxLinearValue?: number };
      proof?: {
        realWebGL2: boolean;
        mockDevice: boolean;
        canvas2dProof: boolean;
        diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null };
        importedAsset: { assetId: string; extensionsUsed?: readonly string[]; materialCount: number; textureCount: number; environmentId?: string; hdrEnvironmentUri?: string };
        pixels: { uniqueColorBuckets: number; maxLuma: number };
      };
      summary?: { pass: boolean; missing: readonly string[] };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.summary?.pass, result.summary?.missing?.join(", ")).toBe(true);
    expect(result.proof?.realWebGL2).toBe(true);
    expect(result.proof?.mockDevice).toBe(false);
    expect(result.proof?.canvas2dProof).toBe(false);
    expect(result.proof?.importedAsset.assetId).toBe("v7-material-extension-suite");
    expect(result.expectedExtensions).toEqual([
      "KHR_materials_anisotropy",
      "KHR_materials_iridescence",
      "KHR_materials_transmission",
      "KHR_materials_volume",
      "KHR_materials_clearcoat",
      "KHR_materials_sheen",
      "KHR_materials_specular",
      "KHR_materials_ior",
      "KHR_materials_dispersion",
      "KHR_materials_emissive_strength",
      "KHR_materials_diffuse_transmission"
    ]);
    expect(result.extensionsUsed).toEqual(expect.arrayContaining(result.expectedExtensions ?? []));
    expect(result.materialFeatures).toEqual(expect.arrayContaining(result.expectedFeatures ?? []));
    for (const asset of result.assets ?? []) {
      expect(asset.extensionsUsed).toContain(asset.expectedExtension);
      expect(asset.materialFeatures).toContain(asset.expectedFeature);
      expect(asset.unsupportedExtensions).not.toContain(asset.expectedExtension);
      expect(asset.materialCount).toBeGreaterThan(0);
      expect(asset.textureCount).toBeGreaterThan(0);
    }
    expect(result.materialFeatures).toEqual(expect.arrayContaining([
      "anisotropy",
      "iridescence",
      "transmission",
      "volume",
      "clearcoat",
      "sheen",
      "specular",
      "ior",
      "dispersion",
      "emissive",
      "diffuse-transmission"
    ]));
    expect(result.hdrPipeline?.realRadianceHdr).toBe(true);
    expect(result.hdrPipeline?.specularPrefilter).toBe(true);
    expect(result.hdrPipeline?.brdfLut).toBe(true);
    expect(result.hdrPipeline?.specularMipCount ?? 0).toBeGreaterThanOrEqual(4);
    expect(result.hdrPipeline?.maxLinearValue ?? 0).toBeGreaterThan(1);
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThanOrEqual(8);
    expect(result.proof?.diagnostics.textures ?? 0).toBeGreaterThanOrEqual(8);
    expect(result.proof?.diagnostics.textureBytes ?? 0).toBeGreaterThanOrEqual(12_000_000);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(220);
    expect(result.proof?.pixels.maxLuma).toBeGreaterThan(60);

    const screenshotPath = "tests/reports/runtime-parity/material-extensions/material-extensions.png";
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.locator("#v7-material-extensions").screenshot({ path: screenshotPath });
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    expect(pixelStats.width).toBe(1280);
    expect(pixelStats.height).toBe(720);
    expect(pixelStats.uniqueColorBuckets).toBeGreaterThanOrEqual(220);
    expect(pixelStats.detailEdgeDensity).toBeGreaterThanOrEqual(0.004);
    expect(pixelStats.localContrast).toBeGreaterThanOrEqual(16);
    expect(fileSize).toBeGreaterThanOrEqual(192 * 1024);

    const dedicatedArtifacts = [];
    const orderedAssets = result.assets ?? [];
    for (const asset of orderedAssets) {
      const artifactPath = `tests/reports/runtime-parity/material-extensions/${asset.id}.png`;
      await page.goto(`${server.origin}/tests/browser/runtime-parity-material-extensions.html?asset=${asset.id}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const result = window.__V7_MATERIAL_EXTENSIONS__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
      const dedicatedResult = await page.evaluate(() => window.__V7_MATERIAL_EXTENSIONS__) as {
        status: "ready" | "error";
        error?: string;
        mode?: string;
        assets?: readonly {
          id: string;
          expectedExtension: string;
          expectedFeature: string;
          extensionsUsed: readonly string[];
          materialFeatures: readonly string[];
          unsupportedExtensions: readonly string[];
          materialCount: number;
          textureCount: number;
        }[];
        proof?: { pixels: { uniqueColorBuckets: number; maxLuma: number }; diagnostics: { lastError: string | null } };
        summary?: { pass: boolean; missing: readonly string[] };
      };
      expect(dedicatedResult.status, dedicatedResult.error).toBe("ready");
      expect(dedicatedResult.mode).toBe("dedicated-extension-artifact");
      expect(dedicatedResult.assets).toHaveLength(1);
      expect(dedicatedResult.assets?.[0]?.id).toBe(asset.id);
      expect(dedicatedResult.assets?.[0]?.extensionsUsed).toContain(asset.expectedExtension);
      expect(dedicatedResult.assets?.[0]?.materialFeatures).toContain(asset.expectedFeature);
      expect(dedicatedResult.assets?.[0]?.unsupportedExtensions).not.toContain(asset.expectedExtension);
      expect(dedicatedResult.assets?.[0]?.materialCount).toBeGreaterThan(0);
      expect(dedicatedResult.assets?.[0]?.textureCount).toBeGreaterThan(0);
      expect(dedicatedResult.summary?.pass, dedicatedResult.summary?.missing?.join(", ")).toBe(true);
      expect(dedicatedResult.proof?.diagnostics.lastError).toBeNull();
      const capture = await page.evaluate(() => {
        const canvas = document.getElementById("v7-material-extensions");
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("Missing material extension canvas.");
        }
        return {
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height
        };
      });
      writeFileSync(resolve(artifactPath), Buffer.from(capture.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      const artifactStats = readV6PngStats(resolve(artifactPath));
      const artifactSize = statSync(resolve(artifactPath)).size;
      expect(artifactStats.width).toBe(capture.width);
      expect(artifactStats.height).toBe(capture.height);
      const visualThresholds = dedicatedVisualThresholds(asset.id);
      expect(artifactStats.uniqueColorBuckets, `${asset.id} unique color buckets`).toBeGreaterThanOrEqual(visualThresholds.uniqueColorBuckets);
      expect(artifactStats.detailEdgeDensity, `${asset.id} detail edge density`).toBeGreaterThanOrEqual(visualThresholds.detailEdgeDensity);
      expect(artifactSize).toBeGreaterThanOrEqual(96 * 1024);
      const visualSignal = {
        uniqueColorBuckets: artifactStats.uniqueColorBuckets,
        detailEdgeDensity: artifactStats.detailEdgeDensity,
        localContrast: artifactStats.localContrast,
        fileSize: artifactSize,
        thresholds: visualThresholds,
        passesThresholds: artifactStats.uniqueColorBuckets >= visualThresholds.uniqueColorBuckets
          && artifactStats.detailEdgeDensity >= visualThresholds.detailEdgeDensity
          && artifactSize >= 96 * 1024
      };
      const extensionAudit = {
        id: asset.id,
        expectedExtension: asset.expectedExtension,
        expectedFeature: asset.expectedFeature,
        extensionImported: dedicatedResult.assets?.[0]?.extensionsUsed.includes(asset.expectedExtension) === true,
        featureReported: dedicatedResult.assets?.[0]?.materialFeatures.includes(asset.expectedFeature) === true,
        unsupportedExpectedExtension: dedicatedResult.assets?.[0]?.unsupportedExtensions.includes(asset.expectedExtension) === true,
        visualSignal,
        pass: dedicatedResult.assets?.[0]?.extensionsUsed.includes(asset.expectedExtension) === true
          && dedicatedResult.assets?.[0]?.materialFeatures.includes(asset.expectedFeature) === true
          && dedicatedResult.assets?.[0]?.unsupportedExtensions.includes(asset.expectedExtension) !== true
          && visualSignal.passesThresholds
      };
      expect(extensionAudit.pass).toBe(true);
      dedicatedArtifacts.push({
        id: asset.id,
        expectedExtension: asset.expectedExtension,
        expectedFeature: asset.expectedFeature,
        screenshot: artifactPath,
        fileSize: artifactSize,
        pixelStats: artifactStats,
        extensionAudit,
        proof: dedicatedResult.proof
      });
    }

    const reportPath = "tests/reports/runtime-parity/material-extensions/material-extensions.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-v7-material-extension-artifacts/v1",
      generatedAt: new Date().toISOString(),
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      dedicatedArtifacts,
      extensionAudit: dedicatedArtifacts.map((artifact) => artifact.extensionAudit),
      ...result
    }, null, 2)}\n`);
  });
});

function dedicatedVisualThresholds(assetId: string): { readonly uniqueColorBuckets: number; readonly detailEdgeDensity: number } {
  switch (assetId) {
    case "compare-ior":
      return { uniqueColorBuckets: 80, detailEdgeDensity: 0.0035 };
    case "compare-dispersion":
      return { uniqueColorBuckets: 55, detailEdgeDensity: 0.002 };
    case "compare-emissive-strength":
      return { uniqueColorBuckets: 70, detailEdgeDensity: 0.002 };
    case "diffuse-transmission-test":
      return { uniqueColorBuckets: 80, detailEdgeDensity: 0.002 };
    default:
      return { uniqueColorBuckets: 120, detailEdgeDensity: 0.002 };
  }
}
