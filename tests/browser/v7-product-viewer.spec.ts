import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 flagship product viewer comparison", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("saves G3D, Three.js, and comparison artifacts for the same product scene", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${server.origin}/tests/browser/v6-threejs-parity.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_THREEJS_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 120_000 }
      );
    } catch (error) {
      throw new Error(`V7 product viewer comparison did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_THREEJS_PARITY__) as {
      status: "ready" | "error";
      error?: string;
      hdr?: unknown;
      results?: {
        id: string;
        assetId: string;
        g3d: { drawCalls: number; nonBlackPixels: number; uniqueColorBuckets: number; pass: boolean };
        threejs: { drawCalls: number; triangles: number; geometries: number; textures: number; nonBlackPixels: number; uniqueColorBuckets: number };
        diff: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number; pass: boolean };
      }[];
    };
    expect(result.status, result.error).toBe("ready");
    const product = result.results?.find((item) => item.id === "product-helmet");
    expect(product).toBeDefined();
    expect(product?.assetId).toBe("damaged-helmet");
    expect(product?.g3d.pass).toBe(true);
    expect(product?.threejs.nonBlackPixels).toBeGreaterThan(1000);
    expect(product?.diff.pass, JSON.stringify(product?.diff)).toBe(true);

    const reportDir = "tests/reports/v7/product-viewer";
    mkdirSync(resolve(reportDir), { recursive: true });
    await saveCanvasPng(page, "product-helmet-g3d", `${reportDir}/g3d-product-viewer.png`);
    await saveCanvasPng(page, "product-helmet-threejs", `${reportDir}/threejs-product-viewer.png`);
    await saveComparisonPng(page, `${reportDir}/comparison.png`);
    writeFileSync(resolve(`${reportDir}/product-viewer-report.json`), `${JSON.stringify({
      schema: "g3d-v7-product-viewer-comparison/v1",
      generatedAt: new Date().toISOString(),
      asset: {
        id: "damaged-helmet",
        file: "fixtures/v6/assets/corpus/damaged-helmet.glb"
      },
      environment: {
        id: "studio-small-08",
        file: "fixtures/v6/environments/hdri/studio_small_08_1k.hdr"
      },
      screenshots: {
        g3d: `${reportDir}/g3d-product-viewer.png`,
        threejs: `${reportDir}/threejs-product-viewer.png`,
        comparison: `${reportDir}/comparison.png`
      },
      comparison: product,
      honestDeltas: [
        "G3D and Three.js use the same GLB and HDRI in this artifact.",
        "The G3D renderer path is the Galileo/G3D WebGL2 renderer; Three.js is used only as a competitor baseline.",
        "The images are not claimed as exact parity; diff metrics and visual inspection remain required.",
        "Known open gaps remain around true cubemap PMREM parity, full contact-shadow parity, and broader material-extension parity."
      ],
      hdr: result.hdr
    }, null, 2)}\n`);
  });

  test("drives the flagship viewer camera from public SDK controls", async ({ page }) => {
    await page.goto(`${server.origin}/apps/v6-product-configurator/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__g3dV6Runtime as { status?: string; viewerDiagnostics?: { camera?: unknown } } | undefined;
        return runtime?.status === "ready" && runtime.viewerDiagnostics?.camera;
      },
      undefined,
      { timeout: 60_000 }
    );

    const before = await viewerCamera(page);
    const readyDiagnostics = await viewerDiagnostics(page);
    const renderResolution = await page.evaluate(() => {
      const canvas = document.getElementById("viewport");
      const runtime = window.__g3dV6Runtime as {
        runtime?: {
          renderResolution?: {
            width: number;
            height: number;
            cssWidth: number;
            cssHeight: number;
            pixelRatio: number;
          };
        };
      } | undefined;
      if (!(canvas instanceof HTMLCanvasElement) || !runtime?.runtime?.renderResolution) {
        throw new Error("Missing high-resolution product viewer render target diagnostics.");
      }
      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderResolution: runtime.runtime.renderResolution,
        datasetResolution: canvas.dataset.renderResolution
      };
    });
    expect(Math.max(renderResolution.canvasWidth, renderResolution.canvasHeight)).toBeGreaterThanOrEqual(5120);
    expect(Math.min(renderResolution.canvasWidth, renderResolution.canvasHeight)).toBeGreaterThanOrEqual(2880);
    expect(Math.max(renderResolution.renderResolution.width, renderResolution.renderResolution.height)).toBeGreaterThanOrEqual(5120);
    expect(Math.min(renderResolution.renderResolution.width, renderResolution.renderResolution.height)).toBeGreaterThanOrEqual(2880);
    expect(renderResolution.renderResolution.pixelRatio).toBeGreaterThan(1);
    expect(renderResolution.datasetResolution).toBe(`${renderResolution.canvasWidth}x${renderResolution.canvasHeight}`);
    const readyRuntime = await page.evaluate(() => window.__g3dV6Runtime as {
      runtime?: { shadowMapCount?: number };
      proof?: { diagnostics?: { nativeShadowMapBindings?: number; nativeEnvironmentBindings?: number } };
    } | undefined);
    expect(readyRuntime?.runtime?.shadowMapCount).toBeGreaterThanOrEqual(1);
    expect(readyRuntime?.proof?.diagnostics?.nativeShadowMapBindings).toBeGreaterThan(0);
    expect(readyRuntime?.proof?.diagnostics?.nativeEnvironmentBindings).toBeGreaterThan(0);
    await expect(page.locator("#asset-picker")).toHaveValue("chronograph-watch");
    expect(readyDiagnostics.environment.cubemapPMREM).toBe(true);
    expect(readyDiagnostics.environment.cubemapPMREMShaderSampling).toBe("webgl2-sampler-cube");
    expect(readyDiagnostics.environment.cubemapFaceSize).toBeGreaterThanOrEqual(128);
    expect(readyDiagnostics.environment.cubemapMipCount).toBeGreaterThanOrEqual(8);
    expect(readyDiagnostics.stage.enabled).toBe(true);
    expect(readyDiagnostics.stage.itemCount).toBeGreaterThanOrEqual(2);
    expect(readyDiagnostics.stage.directionalShadowMap).toBe(true);
    expect(readyDiagnostics.stage.softFiltering).toBe("pcf-16");
    expect(readyDiagnostics.stage.depthAwareAmbientOcclusion).toBe(true);
    expect(readyDiagnostics.stage.contactShadow.mode).toBe("directional-multi-lobe-receiver-contact");
    expect(readyDiagnostics.stage.contactShadow.parity).toBe("not-full-contact-shadow");
    expect(readyDiagnostics.stage.contactShadow.quality).toBe("bounded-receiver-contact");
    expect(readyDiagnostics.stage.contactShadow.layerCount).toBeGreaterThanOrEqual(6);
    expect(readyDiagnostics.stage.contactShadow.softness).toBeGreaterThan(0.7);
    expect(Math.abs(readyDiagnostics.stage.contactShadow.directionalOffset[0])).toBeGreaterThan(0);
    expect(readyDiagnostics.background.enabled).toBe(true);
    expect(readyDiagnostics.background.itemCount).toBeGreaterThanOrEqual(1);
    expect(readyDiagnostics.background.mode).toBe("visible-hdr-studio-skybox");
    await expect(page.locator("a", { hasText: "Three.js comparison report" })).toHaveAttribute("href", "/tests/reports/v7/product-viewer/product-viewer-report.json");

    await page.locator("#orbit-right").click();
    const afterOrbit = await viewerCamera(page);
    expect(afterOrbit.yawRadians).toBeGreaterThan(before.yawRadians);

    await page.locator("#pan-left").click();
    const afterPan = await viewerCamera(page);
    expect(afterPan.targetOffset[0]).toBeLessThan(afterOrbit.targetOffset[0]);

    await page.locator("#zoom-in").click();
    const afterZoom = await viewerCamera(page);
    expect(afterZoom.zoom).toBeLessThan(afterPan.zoom);
    expect(afterZoom.paddingRatio).toBeLessThan(afterPan.paddingRatio);

    await page.locator("#environment-rotation-control").fill("0.35");
    const afterEnvironmentRotation = await viewerDiagnostics(page);
    expect(afterEnvironmentRotation.background.environmentRotation).toBeCloseTo(0.35, 5);

    await page.locator("#background-blur-control").fill("0.64");
    const afterBackgroundBlur = await viewerDiagnostics(page);
    expect(afterBackgroundBlur.background.blur).toBeCloseTo(0.64, 5);

    await page.locator("#shadows-control").uncheck();
    const afterGroundingToggle = await viewerDiagnostics(page);
    expect(afterGroundingToggle.stage.enabled).toBe(false);
    expect(afterGroundingToggle.stage.itemCount).toBe(0);
    expect(afterGroundingToggle.stage.directionalShadowMap).toBe(false);
    expect(afterGroundingToggle.stage.softFiltering).toBe("off");
    expect(afterGroundingToggle.stage.depthAwareAmbientOcclusion).toBe(true);
    expect(afterGroundingToggle.stage.contactShadow.parity).toBe("not-full-contact-shadow");
    expect(afterGroundingToggle.background.enabled).toBe(true);
    expect(afterGroundingToggle.background.itemCount).toBeGreaterThanOrEqual(1);

    await page.locator("#background-control").uncheck();
    const afterBackgroundToggle = await viewerDiagnostics(page);
    expect(afterBackgroundToggle.background.enabled).toBe(false);
    expect(afterBackgroundToggle.background.itemCount).toBe(0);

    await page.locator("#environment-picker").selectOption("venice-sunset");
    const afterEnvironment = await viewerDiagnostics(page);
    expect(afterEnvironment.environment.id).toBe("venice-sunset");
  });

  test("saves a high-resolution flagship product viewer canvas artifact", async ({ page }) => {
    await page.goto(`${server.origin}/apps/v6-product-configurator/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__g3dV6Runtime as { status?: string; runtime?: { renderResolution?: { width?: number } } } | undefined;
      return runtime?.status === "error" || (runtime?.status === "ready" && (runtime.runtime?.renderResolution?.width ?? 0) >= 5120);
      },
      undefined,
      { timeout: 150_000 }
    );
    const readyRuntime = await page.evaluate(() => window.__g3dV6Runtime as { status?: string; error?: string } | undefined);
    expect(readyRuntime?.status, readyRuntime?.error).toBe("ready");

    const reportDir = "tests/reports/v7/product-viewer";
    const screenshotPath = `${reportDir}/flagship-product-viewer-5120.png`;
    const reportPath = `${reportDir}/flagship-product-viewer-5120.json`;
    mkdirSync(resolve(reportDir), { recursive: true });
    const dataUrl = await page.evaluate(() => {
      const canvas = document.getElementById("viewport");
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing flagship product viewer canvas.");
      }
      return canvas.toDataURL("image/png");
    });
    writeFileSync(resolve(screenshotPath), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    const runtime = await page.evaluate(() => window.__g3dV6Runtime);
    expect(Math.max(pixelStats.width, pixelStats.height)).toBeGreaterThanOrEqual(5120);
    expect(Math.min(pixelStats.width, pixelStats.height)).toBeGreaterThanOrEqual(2880);
    expect(pixelStats.uniqueColorBuckets).toBeGreaterThanOrEqual(320);
    expect(pixelStats.averageLuma).toBeGreaterThanOrEqual(42);
    expect(pixelStats.foregroundCoverage).toBeGreaterThanOrEqual(0.35);
    expect(pixelStats.foregroundCoverage).toBeLessThanOrEqual(0.7);
    const aspect = pixelStats.width / pixelStats.height;
    const wideHeroFrame = aspect >= 1.6;
    expect(pixelStats.centerForegroundCoverage).toBeGreaterThanOrEqual(wideHeroFrame ? 0.62 : 0.7);
    expect(pixelStats.foregroundBoundsCoverage).toBeGreaterThanOrEqual(wideHeroFrame ? 0.7 : 0.78);
    expect(pixelStats.foregroundBoundsCoverage).toBeLessThanOrEqual(1);
    expect(pixelStats.detailEdgeDensity).toBeGreaterThanOrEqual(0.0115);
    expect(pixelStats.localContrast).toBeGreaterThanOrEqual(78);
    expect(fileSize).toBeGreaterThanOrEqual(512 * 1024);
    expect(runtime?.runtime?.shadowMapCount).toBeGreaterThanOrEqual(1);
    expect(runtime?.proof?.diagnostics?.nativeShadowMapBindings).toBeGreaterThan(0);
    expect(runtime?.proof?.diagnostics?.nativeEnvironmentBindings).toBeGreaterThan(0);
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-v7-flagship-product-viewer-ultra-res/v1",
      generatedAt: new Date().toISOString(),
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      runtime
    }, null, 2)}\n`);
  });

  test("runs the public SDK product viewer template", async ({ page }) => {
    await page.goto(`${server.origin}/templates/v6-product-viewer/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.getElementById("metrics")?.textContent?.includes("draw calls"),
      undefined,
      { timeout: 60_000 }
    );
    const metrics = await page.locator("#metrics").textContent();
    expect(metrics).toContain("materials");
    expect(metrics).toContain("textures");

    await page.locator("#orbit").click();
    await expect(page.locator("#metrics")).toContainText("orbit");
    await page.locator("#capture").click();
    const capture = await page.evaluate(() => window.__g3dProductViewerCapture);
    expect(capture?.startsWith("data:image/png;base64,")).toBe(true);

    const reportDir = "tests/reports/v7/sdk-template";
    const screenshotPath = `${reportDir}/product-viewer-template.png`;
    const reportPath = `${reportDir}/product-viewer-template.json`;
    mkdirSync(resolve(reportDir), { recursive: true });
    await page.locator("#viewport").screenshot({ path: screenshotPath });
    const pixelStats = readV6PngStats(resolve(screenshotPath));
    const fileSize = statSync(resolve(screenshotPath)).size;
    const templateSource = readFileSync(resolve("templates/v6-product-viewer/src/main.ts"), "utf8");
    const report = {
      schema: "g3d-v7-sdk-template-product-viewer/v1",
      generatedAt: new Date().toISOString(),
      screenshot: screenshotPath,
      fileSize,
      pixelStats,
      metrics,
      publicSdkImports: {
        usesEngineV6: templateSource.includes("@galileo3d/engine/v6"),
        usesLoadGltfScene: templateSource.includes("loadGltfScene"),
        usesLoadHdrEnvironment: templateSource.includes("loadHdrEnvironment"),
        usesCreateProductViewer: templateSource.includes("createProductViewer")
      },
      noThreeRuntimeImport: !/from\s+["']three(?:\/[^"']*)?["']/.test(templateSource)
        && !/from\s+["']@galileo3d\/three-compat(?:\/[^"']*)?["']/.test(templateSource)
        && !/\bTHREE\./.test(templateSource),
      captureDataUrl: typeof capture === "string" ? `${capture.slice(0, 32)}...` : null,
      broadThreeJsReplacement: false,
      reason: "This proves the V6 product viewer template runs through the public G3D SDK. It is not broad Three.js ecosystem replacement proof."
    };
    expect(report.publicSdkImports.usesEngineV6).toBe(true);
    expect(report.publicSdkImports.usesLoadGltfScene).toBe(true);
    expect(report.publicSdkImports.usesLoadHdrEnvironment).toBe(true);
    expect(report.publicSdkImports.usesCreateProductViewer).toBe(true);
    expect(report.noThreeRuntimeImport).toBe(true);
    expect(pixelStats.width).toBeGreaterThanOrEqual(800);
    expect(pixelStats.height).toBeGreaterThanOrEqual(800);
    expect(pixelStats.nonBlackPixels).toBeGreaterThan(20_000);
    expect(fileSize).toBeGreaterThan(64 * 1024);
    writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  });
});

async function viewerCamera(page: Page): Promise<{
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
  readonly targetOffset: readonly [number, number, number];
  readonly zoom: number;
}> {
  return page.evaluate(() => {
    const runtime = window.__g3dV6Runtime as {
      viewerDiagnostics?: {
        camera?: {
          yawRadians: number;
          pitchRadians: number;
          paddingRatio: number;
          targetOffset: readonly [number, number, number];
          zoom: number;
        };
      };
    } | undefined;
    if (!runtime?.viewerDiagnostics?.camera) {
      throw new Error("Missing G3D viewer camera diagnostics.");
    }
    return runtime.viewerDiagnostics.camera;
  });
}

async function viewerDiagnostics(page: Page): Promise<{
  readonly environment: {
    readonly id: string;
    readonly cubemapPMREM: boolean;
    readonly cubemapPMREMShaderSampling: string;
    readonly cubemapFaceSize: number;
    readonly cubemapMipCount: number;
  };
    readonly stage: {
      readonly enabled: boolean;
      readonly itemCount: number;
      readonly floorY: number;
      readonly directionalShadowMap: boolean;
      readonly softFiltering: string;
      readonly depthAwareAmbientOcclusion: boolean;
      readonly contactShadow: {
        readonly mode: string;
        readonly parity: string;
        readonly quality: string;
        readonly layerCount: number;
        readonly softness: number;
        readonly directionalOffset: readonly [number, number];
      };
    };
  readonly background: {
    readonly enabled: boolean;
    readonly itemCount: number;
    readonly mode: string;
    readonly blur: number;
    readonly environmentRotation: number;
  };
}> {
  return page.evaluate(() => {
    const runtime = window.__g3dV6Runtime as {
      viewerDiagnostics?: {
        environment?: { readonly id: string };
        stage?: {
          readonly enabled: boolean;
          readonly itemCount: number;
          readonly floorY: number;
          readonly directionalShadowMap: boolean;
          readonly softFiltering: string;
        };
        background?: {
          readonly enabled: boolean;
          readonly itemCount: number;
          readonly mode: string;
          readonly blur: number;
          readonly environmentRotation: number;
        };
      };
    } | undefined;
    if (!runtime?.viewerDiagnostics?.stage || !runtime.viewerDiagnostics.environment || !runtime.viewerDiagnostics.background) {
      throw new Error("Missing G3D viewer diagnostics.");
    }
    return {
      environment: runtime.viewerDiagnostics.environment,
      stage: runtime.viewerDiagnostics.stage,
      background: runtime.viewerDiagnostics.background
    };
  });
}

async function saveComparisonPng(page: Page, path: string): Promise<void> {
  const dataUrl = await page.evaluate(async () => {
    const ids = ["product-helmet-g3d", "product-helmet-threejs", "product-helmet-diff"] as const;
    const images = await Promise.all(ids.map(async (id) => {
      const canvas = document.getElementById(id);
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas ${id}`);
      const image = new Image();
      image.src = canvas.dataset.captureDataUrl ?? canvas.toDataURL("image/png");
      await image.decode();
      return { id, image };
    }));
    const cellWidth = 768;
    const labelHeight = 42;
    const output = document.createElement("canvas");
    output.width = cellWidth * images.length;
    output.height = 768 + labelHeight;
    const context = output.getContext("2d");
    if (!context) throw new Error("Unable to create comparison canvas.");
    context.fillStyle = "#0f131a";
    context.fillRect(0, 0, output.width, output.height);
    context.font = "22px system-ui, sans-serif";
    context.fillStyle = "#eef3fb";
    const labels = ["G3D WebGL2", "Three.js Baseline", "Difference"];
    for (let index = 0; index < images.length; index += 1) {
      context.fillText(labels[index]!, index * cellWidth + 24, 28);
      context.drawImage(images[index]!.image, index * cellWidth, labelHeight, cellWidth, 768);
    }
    return output.toDataURL("image/png");
  });
  writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}

async function saveCanvasPng(page: Page, canvasId: string, path: string): Promise<void> {
  const dataUrl = await page.evaluate((id) => {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas ${id}`);
    return canvas.dataset.captureDataUrl ?? canvas.toDataURL("image/png");
  }, canvasId);
  writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}
