import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 PBR/HDR real renderer", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the same imported GLB under two real HDR environments with visibly different pixels", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/production-runtime-pbr-hdr-real-renderer.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_PBR_HDR__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 30_000 }
      );
    } catch (error) {
      throw new Error(`V6 PBR/HDR harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_PBR_HDR__) as {
      status: "ready" | "error";
      error?: string;
      studioSummary?: { pass: boolean; missing: readonly string[] };
      sunsetSummary?: { pass: boolean; missing: readonly string[] };
      studioPipeline?: { realRadianceHdr: boolean; environmentTextureEncoding?: string; maxLinearValue: number; specularMipCount: number; textureBytes: number };
      sunsetPipeline?: { realRadianceHdr: boolean; environmentTextureEncoding?: string; maxLinearValue: number; specularMipCount: number; textureBytes: number };
      studioProof?: { diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null }; pixels: { averageLuma: number; uniqueColorBuckets: number; nonBlackPixels: number } };
      sunsetProof?: { diagnostics: { drawCalls: number; textures?: number; textureBytes?: number; lastError: string | null }; pixels: { averageLuma: number; uniqueColorBuckets: number; nonBlackPixels: number } };
      pixelDelta?: number;
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.studioSummary?.pass, result.studioSummary?.missing?.join(", ")).toBe(true);
    expect(result.sunsetSummary?.pass, result.sunsetSummary?.missing?.join(", ")).toBe(true);
    expect(result.studioPipeline?.realRadianceHdr).toBe(true);
    expect(result.sunsetPipeline?.realRadianceHdr).toBe(true);
    expect(result.studioPipeline?.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(result.sunsetPipeline?.environmentTextureEncoding).toBe("rgba16f-linear");
    expect(result.studioPipeline?.maxLinearValue).toBeGreaterThan(1);
    expect(result.sunsetPipeline?.maxLinearValue).toBeGreaterThan(1);
    expect(result.studioPipeline?.specularMipCount).toBeGreaterThanOrEqual(9);
    expect(result.sunsetPipeline?.specularMipCount).toBeGreaterThanOrEqual(9);
    expect(result.studioPipeline?.textureBytes).toBeGreaterThan(2_000_000);
    expect(result.sunsetPipeline?.textureBytes).toBeGreaterThan(2_000_000);
    expect(result.studioProof?.diagnostics.drawCalls).toBeGreaterThan(0);
    expect(result.sunsetProof?.diagnostics.drawCalls).toBeGreaterThan(0);
    expect(result.studioProof?.diagnostics.textures).toBeGreaterThan(0);
    expect(result.sunsetProof?.diagnostics.textures).toBeGreaterThan(0);
    expect(result.studioProof?.diagnostics.lastError).toBeNull();
    expect(result.sunsetProof?.diagnostics.lastError).toBeNull();
    expect(result.studioProof?.pixels.nonBlackPixels).toBeGreaterThan(2000);
    expect(result.sunsetProof?.pixels.nonBlackPixels).toBeGreaterThan(2000);
    expect(result.pixelDelta).toBeGreaterThan(5);

    mkdirSync(resolve("tests/reports/production-runtime-pbr-hdr"), { recursive: true });
    await page.locator("#studio").screenshot({ path: "tests/reports/production-runtime-pbr-hdr/damaged-helmet-studio-hdr.png" });
    await page.locator("#sunset").screenshot({ path: "tests/reports/production-runtime-pbr-hdr/damaged-helmet-sunset-hdr.png" });
    const reportPath = "tests/reports/production-runtime-pbr-hdr-real-renderer.json";
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "a3d-production-runtime-pbr-hdr-real-renderer/v1",
      generatedAt: new Date().toISOString(),
      screenshots: [
        "tests/reports/production-runtime-pbr-hdr/damaged-helmet-studio-hdr.png",
        "tests/reports/production-runtime-pbr-hdr/damaged-helmet-sunset-hdr.png"
      ],
      ...result
    }, null, 2)}\n`);
  });
});
