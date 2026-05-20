import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 glTF render pipeline", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders multiple imported corpus assets with PBR/HDR renderer metadata", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/v6-gltf-render-pipeline.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_GLTF_RENDER__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 45_000 }
      );
    } catch (error) {
      throw new Error(`V6 glTF render harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }
    const result = await page.evaluate(() => window.__V6_GLTF_RENDER__) as {
      status: "ready" | "error";
      error?: string;
      hdr?: { realRadianceHdr: boolean; specularMipCount: number };
      results?: {
        id: string;
        metadata: {
          materialCount: number;
          textureCount: number;
          pbrTextureCount: number;
          normalMapCount: number;
          materialExtensionCoverage: readonly string[];
          hasSkinning: boolean;
          hasAnimation: boolean;
        };
        summary: { pass: boolean; missing: readonly string[] };
        proof: { diagnostics: { drawCalls: number; textures?: number; lastError: string | null }; pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
      }[];
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.hdr?.realRadianceHdr).toBe(true);
    expect(result.hdr?.specularMipCount).toBeGreaterThanOrEqual(9);
    expect(result.results?.length).toBe(3);
    for (const rendered of result.results ?? []) {
      expect(rendered.summary.pass, `${rendered.id}: ${rendered.summary.missing.join(", ")}`).toBe(true);
      expect(rendered.proof.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(rendered.proof.diagnostics.textures).toBeGreaterThan(0);
      expect(rendered.proof.diagnostics.lastError).toBeNull();
      expect(rendered.proof.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(rendered.proof.pixels.uniqueColorBuckets).toBeGreaterThan(4);
    }
    const helmet = result.results?.find((item) => item.id === "damaged-helmet");
    const clearcoat = result.results?.find((item) => item.id === "clear-coat-test");
    const character = result.results?.find((item) => item.id === "cesium-man");
    expect(helmet?.metadata.pbrTextureCount).toBeGreaterThan(0);
    expect(helmet?.metadata.normalMapCount).toBeGreaterThan(0);
    expect(clearcoat?.metadata.materialExtensionCoverage).toContain("KHR_materials_clearcoat");
    expect(character?.metadata.hasSkinning).toBe(true);
    expect(character?.metadata.hasAnimation).toBe(true);

    mkdirSync(resolve("tests/reports/v6-gltf-render"), { recursive: true });
    await page.locator("#damaged-helmet").screenshot({ path: "tests/reports/v6-gltf-render/damaged-helmet.png" });
    await page.locator("#clearcoat").screenshot({ path: "tests/reports/v6-gltf-render/clearcoat.png" });
    await page.locator("#cesium-man").screenshot({ path: "tests/reports/v6-gltf-render/cesium-man.png" });
    writeFileSync(resolve("tests/reports/v6-gltf-render-real-renderer.json"), `${JSON.stringify({
      schema: "g3d-v6-gltf-render-real-renderer/v1",
      generatedAt: new Date().toISOString(),
      screenshots: [
        "tests/reports/v6-gltf-render/damaged-helmet.png",
        "tests/reports/v6-gltf-render/clearcoat.png",
        "tests/reports/v6-gltf-render/cesium-man.png"
      ],
      ...result
    }, null, 2)}\n`);
  });
});
