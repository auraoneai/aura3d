import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("runtime material extension parity artifact", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures same-extension A3D vs Three.js material deltas", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/runtime-parity-material-extension-parity.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__RUNTIME_MATERIAL_EXTENSION_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 150_000 }
      );
    } catch (error) {
      throw new Error(`runtime material extension parity harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__RUNTIME_MATERIAL_EXTENSION_PARITY__) as {
      status: "ready" | "error";
      error?: string;
      schema?: string;
      parity?: { claim?: string; reason?: string };
      cases?: {
        id: string;
        expectedExtension: string;
        expectedFeature: string;
        parity: { claim: string };
        a3d: {
          diagnostics: { drawCalls: number; lastError: string | null; textures?: number; textureBytes?: number };
          summary: { pass: boolean; missing: readonly string[] };
          pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
          extensionsUsed: readonly string[];
          materialFeatures: readonly string[];
          unsupportedExtensions: readonly string[];
          transmissionBackdrop?: {
            mode: string;
            byteLength: number;
            mipCount: number;
            materialBindings: number;
            strength: number;
            refractionScale: number;
            width: number;
            height: number;
          };
        };
        threejs: {
          diagnostics: { drawCalls: number; triangles: number; textures: number };
          pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
          pmremGenerator: boolean;
        };
        diff: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
        dataUrls: { a3d: string; threejs: string; diff: string };
      }[];
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.schema).toBe("a3d-runtime-material-extension-parity");
    expect(result.parity?.claim).toBe("bounded-eleven-extension-material-delta-coverage");
    expect(result.cases).toHaveLength(11);

    const reportDir = "tests/reports/runtime-parity/material-extension-parity";
    mkdirSync(resolve(reportDir), { recursive: true });
    const cases = [];
    for (const entry of result.cases ?? []) {
      expect(entry.parity.claim).toBe("bounded-eleven-extension-material-delta-coverage");
      expect(entry.a3d.extensionsUsed).toContain(entry.expectedExtension);
      expect(entry.a3d.materialFeatures).toContain(entry.expectedFeature);
      expect(entry.a3d.unsupportedExtensions).not.toContain(entry.expectedExtension);
      expect(entry.a3d.summary.pass, entry.a3d.summary.missing.join(", ")).toBe(true);
      expect(entry.a3d.diagnostics.lastError).toBeNull();
      expect(entry.a3d.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(entry.a3d.diagnostics.textures ?? 0).toBeGreaterThan(0);
      expect(entry.a3d.diagnostics.textureBytes ?? 0).toBeGreaterThan(128 * 1024);
      if (entry.id === "compare-ior") {
        expect(entry.a3d.transmissionBackdrop?.mode).toBe("renderer-owned-scene-color-readback");
        expect(entry.a3d.transmissionBackdrop?.strength).toBeGreaterThan(0.75);
        expect(entry.a3d.transmissionBackdrop?.refractionScale).toBeGreaterThan(0.02);
        expect(entry.a3d.transmissionBackdrop?.byteLength).toBe(512 * 512 * 4);
        expect(entry.a3d.transmissionBackdrop?.mipCount).toBeGreaterThan(1);
        expect(entry.a3d.transmissionBackdrop?.materialBindings).toBeGreaterThan(0);
        expect(entry.a3d.transmissionBackdrop?.width).toBe(512);
        expect(entry.a3d.transmissionBackdrop?.height).toBe(512);
      } else {
        expect(entry.a3d.transmissionBackdrop).toBeUndefined();
      }
      expect(entry.a3d.pixelStats.nonBlackPixels).toBeGreaterThan(5_000);
      expect(entry.a3d.pixelStats.uniqueColorBuckets, `${entry.id} A3D unique color buckets`).toBeGreaterThanOrEqual(minParityUniqueColorBuckets(entry.id));
      expect(entry.a3d.pixelStats.maxLuma, `${entry.id} A3D max luma`).toBeGreaterThan(40);
      expect(entry.threejs.pmremGenerator).toBe(true);
      expect(entry.threejs.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(entry.threejs.pixelStats.nonBlackPixels).toBeGreaterThan(5_000);
      const thresholds = parityThresholds(entry.id);
      const lumaDelta = Math.abs(entry.a3d.pixelStats.averageLuma - entry.threejs.pixelStats.averageLuma);
      expect.soft(lumaDelta, `${entry.id} luma delta`).toBeLessThan(thresholds.lumaDelta);
      expect.soft(entry.diff.changedPixels, `${entry.id} changed pixels`).toBeGreaterThan(1_000);
      expect.soft(entry.diff.meanDelta, `${entry.id} mean delta`).toBeLessThan(thresholds.meanDelta);
      expect.soft(entry.diff.structuralSimilarityProxy, `${entry.id} structural similarity`).toBeGreaterThan(thresholds.structuralSimilarityProxy);

      const artifacts = [];
      for (const [kind, dataUrl] of Object.entries(entry.dataUrls)) {
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        const path = `${reportDir}/${entry.id}-${kind}.png`;
        writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
        const pixelStats = readProductionPngStats(resolve(path));
        const fileSize = statSync(resolve(path)).size;
        expect(pixelStats.width).toBe(512);
        expect(pixelStats.height).toBe(512);
        const strictCalibratedCase = ["compare-anisotropy", "compare-iridescence", "compare-transmission", "compare-volume"].includes(entry.id);
        expect.soft(fileSize, `${entry.id} ${kind} file size`).toBeGreaterThan((strictCalibratedCase ? 24 : 12) * 1024);
        artifacts.push({ kind, path, fileSize, pixelStats });
      }
      const { dataUrls: _dataUrls, ...reportEntry } = entry;
      cases.push({ ...reportEntry, parityThresholds: thresholds, artifacts });
    }

    const reportPath = `${reportDir}/material-extension-parity-report.json`;
    const { cases: _cases, ...report } = result;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      ...report,
      generatedAt: new Date().toISOString(),
      cases
    }, null, 2)}\n`);
  });
});

function minParityUniqueColorBuckets(assetId: string): number {
  switch (assetId) {
    case "compare-ior":
    case "compare-dispersion":
      return 20;
    case "compare-emissive-strength":
      return 28;
    default:
      return 40;
  }
}

function parityThresholds(assetId: string): {
  readonly lumaDelta: number;
  readonly meanDelta: number;
  readonly structuralSimilarityProxy: number;
} {
  switch (assetId) {
    case "compare-ior":
      return { lumaDelta: 24, meanDelta: 32, structuralSimilarityProxy: 0.88 };
    case "diffuse-transmission-test":
      return { lumaDelta: 12, meanDelta: 33, structuralSimilarityProxy: 0.87 };
    default:
      return { lumaDelta: 12, meanDelta: 32, structuralSimilarityProxy: 0.88 };
  }
}
