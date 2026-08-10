import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/2.0-cinematic-architecture-rendering");
const VIEWPORT = { width: 1440, height: 900 } as const;

test("proves the public Cinematic Architecture rendering stack and camera paths", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${server.origin}/apps/showcase-cinematic-architecture/`);
    await waitForRenderingEvidence(page, "gallery", "establish");
    const gallery = await readEvidence(page);
    const galleryCapture = await captureCanvas(page, "gallery-establish-canvas.png");

    await page.locator("[data-mood='nocturne']").click();
    await waitForRenderingEvidence(page, "nocturne", "establish");
    const nocturne = await readEvidence(page);
    const nocturneCapture = await captureCanvas(page, "nocturne-establish-canvas.png");

    await page.locator("[data-path='balcony']").click();
    await waitForRenderingEvidence(page, "nocturne", "balcony");
    const balcony = await readEvidence(page);
    const balconyCapture = await captureCanvas(page, "nocturne-balcony-canvas.png");

    for (const state of [gallery, nocturne, balcony]) {
      expect(state.renderer.runtime.backend).toBe("production-runtime");
      expect(state.renderer.runtime.mounted).toBe(true);
      expect(state.renderer.runtime.submittedObjects).toBeGreaterThan(0);
      expect(state.renderer.environment.enabled).toBe(true);
      expect(state.renderer.environment.evidence).toContain("generated HDR");
      expect(state.renderer.shadows.requested).toBe(true);
      expect(state.renderer.shadows.mapRendered).toBe(true);
      expect(state.renderer.shadows.mapSampled).toBe(true);
      expect(state.renderer.shadows.nativeShadowMapBindings).toBeGreaterThan(0);
      expect(state.renderer.postprocess.pixelBacked).toBe(true);
      expect(state.renderer.postprocess.targetFormat).toBe("rgba16f");
      expect(state.renderer.postprocess.actualPasses).toEqual(expect.arrayContaining(["ssao", "bloom", "tone-mapping"]));
      expect(state.renderer.exposure.exposure).toBeGreaterThan(0);
      expect(state.renderer.toneMapping).toBe("aces-filmic");
      expect(state.renderer.outputColorSpace).toBe("srgb");
      expect(state.renderer.linearWorkflow).toBe(true);
    }
    expect(gallery.renderer.environment.preset).toBe("studio");
    expect(nocturne.renderer.environment.preset).toBe("night-cinematic");
    expect(galleryCapture.sha256).not.toBe(nocturneCapture.sha256);
    expect(nocturneCapture.sha256).not.toBe(balconyCapture.sha256);
    expect(gallery.interactionState.revision).toBeLessThan(nocturne.interactionState.revision);
    expect(nocturne.interactionState.revision).toBeLessThan(balcony.interactionState.revision);
    expect(pageErrors).toEqual([]);

    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({
      schema: "aura3d.cinematic-architecture-rendering/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      viewport: VIEWPORT,
      states: { gallery, nocturne, balcony },
      captures: { gallery: galleryCapture, nocturne: nocturneCapture, balcony: balconyCapture },
      assertions: {
        publicRoute: true,
        productionPbrImportedAssetPath: true,
        generatedHdrIbl: true,
        nativeShadowMapRenderedAndSampled: true,
        pixelBackedHdrPostprocess: true,
        ssaoBloomToneMapping: true,
        explicitExposureAndSrgbOutput: true,
        cameraPathChangesPixels: true,
        universalThreejsParityClaimed: false
      },
      pageErrors
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function waitForRenderingEvidence(page: Page, mood: string, cameraPath: string): Promise<void> {
  await page.waitForFunction(([expectedMood, expectedPath]) => {
    const evidence = window.__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__;
    const diagnostics = evidence?.renderer;
    return evidence?.status === "ready"
      && evidence.controls.mood === expectedMood
      && evidence.controls.cameraPath === expectedPath
      && evidence.frameCount > 1
      && diagnostics?.runtime.backend === "production-runtime";
  }, [mood, cameraPath], { timeout: 90_000 });
}

async function captureCanvas(page: Page, filename: string): Promise<{ readonly path: string; readonly sha256: string }> {
  const bytes = await page.locator("#aura-scene").screenshot({ path: resolve(REPORT_DIRECTORY, filename) });
  return {
    path: `tests/reports/2.0-cinematic-architecture-rendering/${filename}`,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function readEvidence(page: Page) {
  return await page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__!;
    return {
      controls: evidence.controls,
      interactionState: evidence.interactionState,
      renderer: evidence.renderer
    };
  });
}
