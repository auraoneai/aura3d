import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("runtime PBR shadow-map artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures renderer-owned PBR directional shadow-map proof", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/runtime-parity-pbr-shadow-map.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__RUNTIME_PBR_SHADOW_MAP__ as { status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__RUNTIME_PBR_SHADOW_MAP__) as {
      status: "ready" | "error";
      error?: string;
      schema?: string;
      parity?: { claim?: string };
      scene?: { shadowMap?: { requested?: boolean; size?: number; pcfSamples?: number } };
      shadowed?: {
        diagnostics: { drawCalls: number; lastError: string | null; renderTargets?: number };
        pixelStats: { shadowPatchLuma: number; litPatchLuma: number; contactDarkening: number; nonBlackPixels: number; uniqueColorBuckets: number };
      };
      unshadowed?: {
        diagnostics: { drawCalls: number; lastError: string | null };
        pixelStats: { shadowPatchLuma: number; litPatchLuma: number; contactDarkening: number; nonBlackPixels: number; uniqueColorBuckets: number };
      };
      visualDelta?: { contactDarkeningGain: number; shadowPatchDelta: number };
      dataUrls?: { shadowed?: string; unshadowed?: string };
    };

    expect(result.status, `${result.error ?? ""}\n${pageErrors.join("\n")}`).toBe("ready");
    expect(result.schema).toBe("a3d-runtime-pbr-shadow-map");
    expect(result.parity?.claim).toBe("not-claimed");
    expect(result.scene?.shadowMap).toMatchObject({ requested: true, size: 2048, pcfSamples: 16 });
    expect(result.shadowed?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(3);
    expect(result.shadowed?.diagnostics.lastError).toBeNull();
    expect(result.shadowed?.diagnostics.renderTargets ?? 0).toBe(0);
    expect(result.unshadowed?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(2);
    expect(result.unshadowed?.diagnostics.lastError).toBeNull();
    expect(result.shadowed?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(180_000);
    expect(result.unshadowed?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(180_000);
    expect(result.shadowed?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThan(20);
    expect(result.visualDelta?.shadowPatchDelta ?? 0, JSON.stringify({
      shadowed: result.shadowed?.pixelStats,
      unshadowed: result.unshadowed?.pixelStats,
      visualDelta: result.visualDelta
    }, null, 2)).toBeGreaterThan(4);
    expect(result.visualDelta?.contactDarkeningGain ?? 0).toBeGreaterThan(4);
    expect(result.dataUrls?.shadowed).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.unshadowed).toMatch(/^data:image\/png;base64,/);

    const reportDir = "tests/reports/runtime-parity/pbr-shadow-map";
    mkdirSync(resolve(reportDir), { recursive: true });
    const artifacts = ([
      ["shadowed", `${reportDir}/a3d-pbr-shadow-map.png`, result.dataUrls?.shadowed],
      ["unshadowed", `${reportDir}/a3d-pbr-no-shadow.png`, result.dataUrls?.unshadowed]
    ] as const).map(([id, path, dataUrl]) => {
      if (!dataUrl) throw new Error(`Missing ${id} PBR shadow data URL.`);
      writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      const pixelStats = readProductionPngStats(resolve(path));
      const fileSize = statSync(resolve(path)).size;
      expect(pixelStats.width).toBe(1024);
      expect(pixelStats.height).toBe(768);
      expect(fileSize).toBeGreaterThan(32 * 1024);
      return { id, path, fileSize, pixelStats };
    });

    const reportPath = `${reportDir}/pbr-shadow-map-report.json`;
    const { dataUrls: _dataUrls, ...report } = result;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      ...report,
      generatedAt: new Date().toISOString(),
      artifacts
    }, null, 2)}\n`);
  });
});
