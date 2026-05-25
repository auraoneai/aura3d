import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 contact shadow parity artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures a same-scene G3D vs Three.js contact-shadow delta", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/runtime-parity-contact-shadow-parity.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V7_CONTACT_SHADOW_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
    } catch (error) {
      throw new Error(`V7 contact-shadow parity harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V7_CONTACT_SHADOW_PARITY__) as {
      status: "ready" | "error";
      error?: string;
      schema?: string;
      parity?: { claim?: string; reason?: string };
      g3d?: {
        diagnostics: { drawCalls: number; lastError: string | null; renderTargets?: number; nativeShadowMapBindings?: number; disposedRenderTargets?: number };
        pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; contactDarkening: number };
        contactShadow: {
          mode: string;
          parity: string;
          quality: string;
          layerCount: number;
          receiverGap: number;
          gapFade: number;
          gapSpread: number;
          directionalOffset: readonly [number, number];
          lightAngleFade: number;
          projectionStretch: number;
          projectionYawRadians: number;
          footprintPointCount: number;
          footprintLayerCount: number;
        };
        contactShadows: readonly {
          mode: string;
          parity: string;
          quality: string;
          layerCount: number;
          footprintPointCount: number;
          footprintLayerCount: number;
        }[];
        rendererShadowMap: { enabled: boolean; type: string; size: number; pcfSamples: number; nativeShadowMapBindings: number; reason: string };
      };
      threejs?: {
        diagnostics: { drawCalls: number; triangles: number; textures: number };
        pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; contactDarkening: number };
        shadowMap: { enabled: boolean; type: string; size: number };
      };
      diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      dataUrls?: { g3d: string; threejs: string; diff: string };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.schema).toBe("g3d-v7-contact-shadow-parity/v1");
    expect(result.parity?.claim).toBe("bounded-threejs-soft-contact-shadow-delta-parity");
    expect(result.parity?.reason).toContain("not full screen-space, ray, or general contact-shadow parity");
    expect(result.g3d?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(30);
    expect(result.g3d?.diagnostics.lastError, JSON.stringify(result.g3d, null, 2)).toBeNull();
    expect(result.g3d?.diagnostics.nativeShadowMapBindings ?? 0).toBeGreaterThan(0);
    expect(result.g3d?.diagnostics.disposedRenderTargets ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.g3d?.contactShadows).toHaveLength(3);
    expect(result.g3d?.contactShadows.every((contact) => contact.mode === "directional-multi-lobe-receiver-contact")).toBe(true);
    expect(result.g3d?.contactShadows.every((contact) => contact.parity === "not-full-contact-shadow")).toBe(true);
    expect(result.g3d?.contactShadows.every((contact) => contact.footprintLayerCount === contact.footprintPointCount)).toBe(true);
    expect((result.g3d?.contactShadows.reduce((total, contact) => total + contact.footprintPointCount, 0) ?? 0)).toBeGreaterThanOrEqual(28);
    expect(result.g3d?.contactShadow.mode).toBe("directional-multi-lobe-receiver-contact");
    expect(result.g3d?.contactShadow.parity).toBe("not-full-contact-shadow");
    expect(result.g3d?.contactShadow.quality).toBe("bounded-receiver-contact");
    expect(result.g3d?.contactShadow.layerCount ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.g3d?.contactShadow.footprintPointCount ?? 0).toBeGreaterThanOrEqual(8);
    expect(result.g3d?.contactShadow.footprintLayerCount).toBe(result.g3d?.contactShadow.footprintPointCount);
    expect(result.g3d?.contactShadow.receiverGap ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(0);
    expect(result.g3d?.contactShadow.receiverGap ?? Number.POSITIVE_INFINITY).toBeLessThan(0.08);
    expect(result.g3d?.contactShadow.gapFade ?? 0).toBeGreaterThan(0.85);
    expect(result.g3d?.contactShadow.gapFade ?? 0).toBeLessThanOrEqual(1);
    expect(result.g3d?.contactShadow.gapSpread ?? 0).toBeGreaterThanOrEqual(1);
    expect(Math.abs(result.g3d?.contactShadow.directionalOffset[0] ?? 0)).toBeGreaterThan(0);
    expect(result.g3d?.contactShadow.lightAngleFade ?? 0).toBeGreaterThan(0.9);
    expect(result.g3d?.contactShadow.projectionStretch ?? 0).toBeGreaterThan(1);
    expect(Math.abs(result.g3d?.contactShadow.projectionYawRadians ?? 0)).toBeGreaterThan(0.1);
    expect(result.g3d?.rendererShadowMap).toMatchObject({
      enabled: true,
      type: "renderer-owned-directional-shadow-map",
      size: 2048,
      pcfSamples: 16
    });
    expect(result.g3d?.rendererShadowMap.nativeShadowMapBindings ?? 0).toBeGreaterThan(0);
    expect(result.g3d?.rendererShadowMap.reason).toContain("same-scene Three.js soft-shadow baseline");
    expect(result.g3d?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(180_000);
    expect(result.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(10);
    expect(result.g3d?.pixelStats.contactDarkening ?? 0).toBeGreaterThan(10);
    expect(result.threejs?.shadowMap).toMatchObject({ enabled: true, type: "PCFSoftShadowMap", size: 2048 });
    expect(result.threejs?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(4);
    expect(result.threejs?.diagnostics.triangles ?? 0).toBeGreaterThan(14_000);
    expect(result.threejs?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(180_000);
    expect(result.threejs?.pixelStats.contactDarkening ?? 0).toBeGreaterThan(10);
    expect(Math.abs((result.g3d?.pixelStats.contactDarkening ?? 0) - (result.threejs?.pixelStats.contactDarkening ?? Number.POSITIVE_INFINITY))).toBeLessThan(3);
    expect(result.diff?.changedPixels ?? 0).toBeGreaterThan(20_000);
    expect(result.diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(13);
    expect(result.diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.95);
    expect(result.dataUrls?.g3d).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.threejs).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.diff).toMatch(/^data:image\/png;base64,/);

    const reportDir = "tests/reports/runtime-parity/contact-shadow-parity";
    mkdirSync(resolve(reportDir), { recursive: true });
    const pngs = [
      ["g3d", `${reportDir}/g3d-contact-shadow.png`, result.dataUrls?.g3d],
      ["threejs", `${reportDir}/threejs-contact-shadow.png`, result.dataUrls?.threejs],
      ["diff", `${reportDir}/contact-shadow-diff.png`, result.dataUrls?.diff]
    ] as const;
    const artifacts = pngs.map(([id, path, dataUrl]) => {
      if (!dataUrl) throw new Error(`Missing ${id} contact-shadow data URL.`);
      writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      const pixelStats = readV6PngStats(resolve(path));
      const fileSize = statSync(resolve(path)).size;
      expect(pixelStats.width).toBe(1024);
      expect(pixelStats.height).toBe(768);
      expect(fileSize).toBeGreaterThan(24 * 1024);
      return { id, path, fileSize, pixelStats };
    });

    const reportPath = `${reportDir}/contact-shadow-parity-report.json`;
    const { dataUrls: _dataUrls, ...report } = result;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      ...report,
      generatedAt: new Date().toISOString(),
      artifacts
    }, null, 2)}\n`);
  });
});
