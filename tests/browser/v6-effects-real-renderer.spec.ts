import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 effects real renderer", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders imported GLB with shadow, transparent overlay, and postprocess on WebGL2 pixels", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/v6-effects-real-renderer.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_EFFECTS__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 30_000 }
      );
    } catch (error) {
      throw new Error(`V6 effects harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }
    const result = await page.evaluate(() => window.__V6_EFFECTS__) as {
      status: "ready" | "error";
      error?: string;
      webglSummary?: { pass: boolean; missing: readonly string[] };
      effectsSummary?: { pass: boolean; failures: readonly string[]; shadowProof: boolean; transparencyProof: boolean; postprocessProof: boolean };
      proof?: { diagnostics: { drawCalls: number; renderTargets?: number; textures?: number; lastError: string | null }; pixels: { nonBlackPixels: number; uniqueColorBuckets: number; maxLuma: number } };
      importedMetadata?: { assetId: string; pbrTextureCount: number; normalMapCount: number };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.webglSummary?.pass, result.webglSummary?.missing.join(", ")).toBe(true);
    expect(result.effectsSummary?.pass, result.effectsSummary?.failures.join(", ")).toBe(true);
    expect(result.effectsSummary?.shadowProof).toBe(true);
    expect(result.effectsSummary?.transparencyProof).toBe(true);
    expect(result.effectsSummary?.postprocessProof).toBe(true);
    expect(result.importedMetadata?.assetId).toBe("damaged-helmet");
    expect(result.importedMetadata?.pbrTextureCount).toBeGreaterThan(0);
    expect(result.importedMetadata?.normalMapCount).toBeGreaterThan(0);
    expect(result.proof?.diagnostics.drawCalls).toBeGreaterThanOrEqual(2);
    expect(result.proof?.diagnostics.textures).toBeGreaterThan(0);
    expect(result.proof?.diagnostics.lastError).toBeNull();
    expect(result.proof?.pixels.nonBlackPixels).toBeGreaterThan(2000);
    expect(result.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(12);

    mkdirSync(resolve("tests/reports/v6-effects"), { recursive: true });
    await page.locator("#effects").screenshot({ path: "tests/reports/v6-effects/damaged-helmet-effects.png" });
    writeFileSync(resolve("tests/reports/v6-effects-real-renderer.json"), `${JSON.stringify({
      schema: "g3d-v6-effects-real-renderer/v1",
      generatedAt: new Date().toISOString(),
      screenshot: "tests/reports/v6-effects/damaged-helmet-effects.png",
      ...result
    }, null, 2)}\n`);
  });
});
