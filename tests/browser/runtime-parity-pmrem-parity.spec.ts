import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 PMREM parity artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures a same-scene G3D vs Three.js PMREM reflection delta", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/runtime-parity-pmrem-parity.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V7_PMREM_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
    } catch (error) {
      throw new Error(`V7 PMREM parity harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V7_PMREM_PARITY__) as {
      status: "ready" | "error";
      error?: string;
      schema?: string;
      parity?: { claim?: string; reason?: string };
      g3d?: {
        diagnostics: { drawCalls: number; lastError: string | null };
        pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
        cubemapPMREMModel: string;
        cubemapPMREMShaderSampling: string;
        cubemapFaceSize: number;
        cubemapMipCount: number;
        cubemapAtlas: {
          faceSize: number;
          displayedMipLevels: readonly number[];
          displayedFaceCount: number;
          model: string;
          luminanceVarianceByDisplayedMip: readonly number[];
          edgeMeanDeltaByDisplayedMip: readonly number[];
        };
      };
      threejs?: {
        diagnostics: { drawCalls: number; triangles: number; textures: number };
        pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
        pmremGenerator: boolean;
      };
      diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      skybox?: {
        parity?: { claim?: string };
        g3d?: { diagnostics: { drawCalls: number; lastError: string | null }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number } };
        threejs?: { diagnostics: { drawCalls: number; triangles: number; textures: number }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number } };
        diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      };
      transmission?: {
        parity?: { claim?: string };
        g3d?: { diagnostics: { drawCalls: number; lastError: string | null }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number } };
        threejs?: { diagnostics: { drawCalls: number; triangles: number; textures: number }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number } };
        diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      };
      texturedParallax?: {
        claim?: string;
        enabled?: {
          diagnostics: { drawCalls: number; lastError: string | null };
          pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
          materialPath: string;
          uniforms: {
            transmissionParallaxStrength: number;
            transmissionBounceCount: number;
            transmissionCausticStrength: number;
          };
        };
        disabled?: {
          diagnostics: { drawCalls: number; lastError: string | null };
          pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number };
          materialPath: string;
          uniforms: {
            transmissionParallaxStrength: number;
            transmissionBounceCount: number;
            transmissionCausticStrength: number;
          };
        };
        diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      };
      texturedTransmissionParity?: {
        claim?: string;
        g3d?: { diagnostics: { drawCalls: number; lastError: string | null }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number }; materialPath: string };
        threejs?: { diagnostics: { drawCalls: number; triangles: number; textures: number }; pixelStats: { nonBlackPixels: number; uniqueColorBuckets: number; averageLuma: number; maxLuma: number }; materialPath: string };
        diff?: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number };
      };
      dataUrls?: {
        g3d: string;
        threejs: string;
        diff: string;
        cubemapAtlas: string;
        g3dSkybox: string;
        threejsSkybox: string;
        skyboxDiff: string;
        g3dTransmission: string;
        threejsTransmission: string;
        transmissionDiff: string;
        g3dTexturedParallax: string;
        g3dTexturedFlat: string;
        texturedParallaxDiff: string;
        threejsTexturedTransmission: string;
        texturedTransmissionDiff: string;
      };
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.schema).toBe("g3d-v7-pmrem-parity/v1");
    expect(result.parity?.claim).toBe("bounded-threejs-cubemap-pmrem-parity");
    expect(result.g3d?.cubemapPMREMModel).toBe("equirectangular-to-cubemap-ggx-importance-sampled-prefilter");
    expect(result.g3d?.cubemapPMREMShaderSampling).toBe("webgl2-sampler-cube");
    expect(result.g3d?.cubemapFaceSize).toBeGreaterThanOrEqual(128);
    expect(result.g3d?.cubemapMipCount).toBeGreaterThanOrEqual(8);
    expect(result.g3d?.cubemapAtlas.faceSize).toBeGreaterThanOrEqual(128);
    expect(result.g3d?.cubemapAtlas.displayedMipLevels).toHaveLength(3);
    expect(result.g3d?.cubemapAtlas.displayedFaceCount).toBe(18);
    expect(result.g3d?.cubemapAtlas.model).toBe("equirectangular-to-cubemap-ggx-importance-sampled-prefilter");
    expect(result.g3d?.cubemapAtlas.luminanceVarianceByDisplayedMip[0] ?? 0).toBeGreaterThan(result.g3d?.cubemapAtlas.luminanceVarianceByDisplayedMip[2] ?? Number.POSITIVE_INFINITY);
    expect(result.g3d?.cubemapAtlas.edgeMeanDeltaByDisplayedMip.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(result.g3d?.diagnostics.drawCalls).toBeGreaterThanOrEqual(4);
    expect(result.g3d?.diagnostics.lastError).toBeNull();
    expect(result.g3d?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(80_000);
    expect(result.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(120);
    expect(result.g3d?.pixelStats.maxLuma ?? 0).toBeGreaterThan(100);
    expect(result.threejs?.pmremGenerator).toBe(true);
    expect(result.threejs?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.threejs?.diagnostics.triangles ?? 0).toBeGreaterThan(10_000);
    expect(result.threejs?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(80_000);
    expect(result.threejs?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(80);
    expect(Math.abs((result.g3d?.pixelStats.averageLuma ?? 0) - (result.threejs?.pixelStats.averageLuma ?? Number.POSITIVE_INFINITY))).toBeLessThan(10);
    expect(result.diff?.changedPixels ?? 0).toBeGreaterThan(20_000);
    expect(result.diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(11);
    expect(result.diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.96);
    expect(result.skybox?.parity?.claim).toBe("bounded-hdr-skybox-parity");
    expect(result.skybox?.g3d?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.skybox?.g3d?.diagnostics.lastError).toBeNull();
    expect(result.skybox?.g3d?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(250_000);
    expect(result.skybox?.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(20);
    expect(result.skybox?.g3d?.pixelStats.maxLuma ?? 0).toBeGreaterThan(70);
    expect(result.skybox?.threejs?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(0);
    expect(result.skybox?.threejs?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(250_000);
    expect(result.skybox?.threejs?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(20);
    expect(result.skybox?.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(result.skybox?.threejs?.pixelStats.uniqueColorBuckets ?? Number.POSITIVE_INFINITY);
    expect(Math.abs((result.skybox?.g3d?.pixelStats.averageLuma ?? 0) - (result.skybox?.threejs?.pixelStats.averageLuma ?? Number.POSITIVE_INFINITY))).toBeLessThan(5);
    expect(result.skybox?.diff?.changedPixels ?? 0).toBeGreaterThan(20_000);
    expect(result.skybox?.diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(18);
    expect(result.skybox?.diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.93);
    expect(result.transmission?.parity?.claim).toBe("bounded-cubemap-transmission-refraction-parity");
    expect(result.transmission?.g3d?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.transmission?.g3d?.diagnostics.lastError).toBeNull();
    expect(result.transmission?.g3d?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(result.transmission?.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(80);
    expect(result.transmission?.g3d?.pixelStats.maxLuma ?? 0).toBeGreaterThan(80);
    expect(result.transmission?.threejs?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.transmission?.threejs?.diagnostics.triangles ?? 0).toBeGreaterThan(50_000);
    expect(result.transmission?.threejs?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(result.transmission?.threejs?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(60);
    expect(result.transmission?.threejs?.pixelStats.maxLuma ?? 0).toBeGreaterThan(80);
    expect(Math.abs((result.transmission?.g3d?.pixelStats.averageLuma ?? 0) - (result.transmission?.threejs?.pixelStats.averageLuma ?? Number.POSITIVE_INFINITY))).toBeLessThan(12);
    expect(result.transmission?.diff?.changedPixels ?? 0).toBeGreaterThan(20_000);
    expect(result.transmission?.diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(13);
    expect(result.transmission?.diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.95);
    expect(result.texturedParallax?.claim).toBe("g3d-textured-pbr-parallax-transmission-browser-proof");
    expect(result.texturedParallax?.enabled?.materialPath).toBe("TexturedPBRMaterial");
    expect(result.texturedParallax?.disabled?.materialPath).toBe("TexturedPBRMaterial");
    expect(result.texturedParallax?.enabled?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.texturedParallax?.enabled?.diagnostics.lastError).toBeNull();
    expect(result.texturedParallax?.disabled?.diagnostics.lastError).toBeNull();
    expect(result.texturedParallax?.enabled?.uniforms.transmissionParallaxStrength).toBeGreaterThan(0.85);
    expect(result.texturedParallax?.enabled?.uniforms.transmissionBounceCount).toBe(3);
    expect(result.texturedParallax?.enabled?.uniforms.transmissionCausticStrength).toBeGreaterThan(0.4);
    expect(result.texturedParallax?.disabled?.uniforms.transmissionParallaxStrength).toBe(0);
    expect(result.texturedParallax?.enabled?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(result.texturedParallax?.enabled?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(90);
    expect(result.texturedParallax?.enabled?.pixelStats.maxLuma ?? 0).toBeGreaterThan(80);
    expect(result.texturedParallax?.disabled?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(Number.isFinite(result.texturedParallax?.diff?.changedPixels ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(result.texturedParallax?.diff?.meanDelta ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(result.texturedParallax?.diff?.structuralSimilarityProxy ?? Number.NaN)).toBe(true);
    expect(result.texturedTransmissionParity?.claim).toBe("bounded-textured-transmission-volume-threejs-delta");
    expect(result.texturedTransmissionParity?.g3d?.materialPath).toBe("TexturedPBRMaterial");
    expect(result.texturedTransmissionParity?.threejs?.materialPath).toBe("MeshPhysicalMaterial");
    expect(result.texturedTransmissionParity?.g3d?.diagnostics.lastError).toBeNull();
    expect(result.texturedTransmissionParity?.g3d?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.texturedTransmissionParity?.threejs?.diagnostics.drawCalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(result.texturedTransmissionParity?.threejs?.diagnostics.triangles ?? 0).toBeGreaterThan(50_000);
    expect(result.texturedTransmissionParity?.g3d?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(result.texturedTransmissionParity?.threejs?.pixelStats.nonBlackPixels ?? 0).toBeGreaterThan(90_000);
    expect(result.texturedTransmissionParity?.g3d?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(90);
    expect(result.texturedTransmissionParity?.threejs?.pixelStats.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(60);
    expect(Math.abs((result.texturedTransmissionParity?.g3d?.pixelStats.averageLuma ?? 0) - (result.texturedTransmissionParity?.threejs?.pixelStats.averageLuma ?? Number.POSITIVE_INFINITY))).toBeLessThan(14);
    expect(result.texturedTransmissionParity?.diff?.changedPixels ?? 0).toBeGreaterThan(20_000);
    expect(result.texturedTransmissionParity?.diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(20);
    expect(result.texturedTransmissionParity?.diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.92);
    expect(result.dataUrls?.g3d).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.threejs).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.diff).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.cubemapAtlas).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.g3dSkybox).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.threejsSkybox).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.skyboxDiff).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.g3dTransmission).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.threejsTransmission).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.transmissionDiff).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.g3dTexturedParallax).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.g3dTexturedFlat).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.texturedParallaxDiff).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.threejsTexturedTransmission).toMatch(/^data:image\/png;base64,/);
    expect(result.dataUrls?.texturedTransmissionDiff).toMatch(/^data:image\/png;base64,/);

    const reportDir = "tests/reports/runtime-parity/pmrem-parity";
    mkdirSync(resolve(reportDir), { recursive: true });
    const pngs = [
      ["g3d", `${reportDir}/g3d-pmrem-spheres.png`, result.dataUrls?.g3d],
      ["threejs", `${reportDir}/threejs-pmrem-spheres.png`, result.dataUrls?.threejs],
      ["diff", `${reportDir}/pmrem-diff.png`, result.dataUrls?.diff],
      ["cubemapAtlas", `${reportDir}/g3d-cubemap-pmrem-atlas.png`, result.dataUrls?.cubemapAtlas],
      ["g3dSkybox", `${reportDir}/g3d-hdr-skybox.png`, result.dataUrls?.g3dSkybox],
      ["threejsSkybox", `${reportDir}/threejs-hdr-skybox.png`, result.dataUrls?.threejsSkybox],
      ["skyboxDiff", `${reportDir}/hdr-skybox-diff.png`, result.dataUrls?.skyboxDiff],
      ["g3dTransmission", `${reportDir}/g3d-transmission-pmrem.png`, result.dataUrls?.g3dTransmission],
      ["threejsTransmission", `${reportDir}/threejs-transmission-pmrem.png`, result.dataUrls?.threejsTransmission],
      ["transmissionDiff", `${reportDir}/transmission-pmrem-diff.png`, result.dataUrls?.transmissionDiff],
      ["g3dTexturedParallax", `${reportDir}/g3d-textured-parallax-transmission.png`, result.dataUrls?.g3dTexturedParallax],
      ["g3dTexturedFlat", `${reportDir}/g3d-textured-parallax-disabled.png`, result.dataUrls?.g3dTexturedFlat],
      ["texturedParallaxDiff", `${reportDir}/textured-parallax-transmission-diff.png`, result.dataUrls?.texturedParallaxDiff],
      ["threejsTexturedTransmission", `${reportDir}/threejs-textured-transmission.png`, result.dataUrls?.threejsTexturedTransmission],
      ["texturedTransmissionDiff", `${reportDir}/textured-transmission-threejs-diff.png`, result.dataUrls?.texturedTransmissionDiff]
    ] as const;
    const artifacts = pngs.map(([id, path, dataUrl]) => {
      if (!dataUrl) throw new Error(`Missing ${id} PMREM data URL.`);
      writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      const pixelStats = readV6PngStats(resolve(path));
      const fileSize = statSync(resolve(path)).size;
      expect(pixelStats.width).toBe(id === "cubemapAtlas" ? 768 : 1024);
      expect(pixelStats.height).toBe(id === "cubemapAtlas" ? 384 : 768);
      expect(fileSize).toBeGreaterThan(32 * 1024);
      return { id, path, fileSize, pixelStats };
    });

    const reportPath = `${reportDir}/pmrem-parity-report.json`;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    const { dataUrls: _dataUrls, ...report } = result;
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      ...report,
      generatedAt: new Date().toISOString(),
      artifacts
    }, null, 2)}\n`);
  });
});
