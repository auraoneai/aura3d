import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { validateProductDemoSources } from "../../tools/demo-validation/product-demo-source-validation";

type DemoDefinition = {
  id: string;
  stateName: "__AURA3D_PRODUCT_DEMO__" | "__AURA3D_ARCHITECTURE_DEMO__";
  canvasSelector: string;
};

const productDemos: readonly DemoDefinition[] = [
  {
    id: "product-configurator",
    stateName: "__AURA3D_PRODUCT_DEMO__",
    canvasSelector: "[data-testid='product-configurator-canvas']",
  },
  {
    id: "architecture-viewer",
    stateName: "__AURA3D_ARCHITECTURE_DEMO__",
    canvasSelector: "[data-testid='architecture-viewer-canvas']",
  },
] as const;

test.describe("productStudio product demos", () => {
  test.describe.configure({ timeout: 180_000 });

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    const sourceValidation = validateProductDemoSources();
    expect(sourceValidation.violations).toEqual([]);
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const demo of productDemos) {
    test(`${demo.id} product demo reaches ready in Chromium`, async ({ page }) => {
      const errors = await collectPageErrors(page, async () => {
        await openProductDemo(page, server, demo);
      });
      const state = await readDemoState(page, demo.stateName);
      const canvasCount = await page.locator(demo.canvasSelector).count();
      const nonBlank = await canvasHasNonBlankWebGLPixels(page, demo.canvasSelector);

      expect(errors).toEqual([]);
      expect(canvasCount).toBe(1);
      expect(state.status).toBe("ready");
      expect(state.renderer).toBe("webgl2");
      expect(state.metrics.rendererBacked).toBe(true);
      expect(state.metrics.drawCalls).toBe(state.diagnostics?.drawCalls);
      expect(Number(state.metrics.cpuFrameMs)).toBeGreaterThanOrEqual(0);
      expect(Number(state.metrics.gpuFrameMs)).toBeGreaterThanOrEqual(0);
      expect(state.metrics.gpuTimingSupported).toBe(false);
      expect(state.metrics.gpuTimingSource).toBe("cpu-fallback");
      expect(String(state.metrics.gpuTimingFallbackReason)).toContain("CPU");
      expect(Number(state.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(0);
      expect(state.diagnostics?.contextLost).toBe(false);
      expect(state.diagnostics?.lastError).toBeNull();
      expect(nonBlank).toBe(true);
    });
  }

  test("product configurator cycles material variants on pointer input", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    const before = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");

    await page.locator(productDemos[0].canvasSelector).click({ position: { x: 320, y: 280 } });
    await page.waitForFunction(() => (window.__AURA3D_PRODUCT_DEMO__?.interactions ?? 0) >= 1);
    const after = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");

    expect(before.activeVariant).toBe("graphite");
    expect(after.activeVariant).toBe("copper");
    expect(after.interactions).toBeGreaterThanOrEqual(1);
    expect(after.metrics.materialVariants).toBe(3);
    expect(after.metrics.workflowBacked).toBe(true);
    expect(after.metrics.materialMode).toBe("metal-check");
  });

  test("product configurator swatch buttons select material variants", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);

    await page.getByRole("button", { name: "ceramic" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.activeVariant === "ceramic");
    const state = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");

    expect(state.activeVariant).toBe("ceramic");
    expect(state.interactions).toBe(1);
    await expect(page.getByRole("button", { name: "ceramic" })).toHaveAttribute("aria-pressed", "true");
  });

  test("every product finish materially changes subject-region pixels", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    const graphite = await canvasWebGLStats(page, productDemos[0].canvasSelector);
    await page.getByRole("button", { name: "Copper" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.activeVariant === "copper");
    const copper = await canvasWebGLStats(page, productDemos[0].canvasSelector);
    await page.getByRole("button", { name: "Ceramic" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.activeVariant === "ceramic");
    const ceramic = await canvasWebGLStats(page, productDemos[0].canvasSelector);

    const colorDistance = (left: typeof graphite, right: typeof graphite) =>
      Math.abs(left.meanR - right.meanR) + Math.abs(left.meanG - right.meanG) + Math.abs(left.meanB - right.meanB);
    expect(colorDistance(graphite, copper)).toBeGreaterThan(8);
    expect(colorDistance(copper, ceramic)).toBeGreaterThan(8);
    expect(colorDistance(graphite, ceramic)).toBeGreaterThan(8);
    expect(new Set([graphite.colorBuckets, copper.colorBuckets, ceramic.colorBuckets]).size).toBeGreaterThan(1);
  });

  test("product configurator exposes a typed provenance-backed GLB through the public workflow and PNG export", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    await page.getByRole("button", { name: "Export PNG" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.export.requested === true);
    const state = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");

    expect(state.asset.id).toBe("showcaseHeadphones");
    expect(state.asset.source).toBe("typed-provenance-backed-asset");
    expect(state.asset.url).toContain("showcaseHeadphones");
    expect(state.asset.hash).toMatch(/^sha256-/);
    expect(state.asset.license).toContain("CC-BY-4.0");
    expect(state.asset.author).toContain("Ankledot");
    expect(state.asset.meshCount).toBeGreaterThan(0);
    expect(state.asset.materialCount).toBeGreaterThan(0);
    expect(state.metrics.workflowBacked).toBe(true);
    expect(state.metrics.publicWorkflow).toBe("product-configurator");
    expect(state.metrics.typedAsset).toBe(true);
    expect(state.metrics.provenanceBacked).toBe(true);
    expect(state.knownLimits.join(" ")).toContain("no second proxy product");
    expect(state.export.requested).toBe(true);
    expect(state.export.dataUrlBytes).toBeGreaterThan(1000);

    await page.screenshot({ path: "tests/reports/foundation-product-configurator-model-backed.png", fullPage: true });
  });

  test("product configurator environment presets visibly affect metallic real-model pixels", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    await page.getByRole("button", { name: "Copper" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.activeVariant === "copper");
    await page.getByRole("button", { name: "Softbox" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.environmentPreset === "softbox");
    await page.waitForTimeout(200);
    const softboxStats = await canvasWebGLStats(page, productDemos[0].canvasSelector);
    await writeProductDemoScreenshot(page, "tests/reports/external-parity-example-screenshots/product-configurator-env-softbox.png");

    await page.getByRole("button", { name: "Inspection" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.environmentPreset === "inspection");
    await page.waitForTimeout(200);
    const inspectionStats = await canvasWebGLStats(page, productDemos[0].canvasSelector);
    await writeProductDemoScreenshot(page, "tests/reports/external-parity-example-screenshots/product-configurator-env-inspection.png");
    await page.getByRole("button", { name: "High" }).click();
    await page.waitForFunction(() => window.__AURA3D_PRODUCT_DEMO__?.exposure === "high");
    const highExposureStats = await canvasWebGLStats(page, productDemos[0].canvasSelector);
    const state = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");

    expect(state.activeVariant).toBe("copper");
    expect(state.metrics.lightingMode).toBe("inspection-bay");
    expect(state.metrics.materialMode).toBe("metal-check");
    expect(softboxStats.nonBlankPixels).toBeGreaterThan(300);
    expect(inspectionStats.nonBlankPixels).toBeGreaterThan(300);
    expect(inspectionStats.colorBuckets).toBeGreaterThanOrEqual(softboxStats.colorBuckets - 8);
    expect(Math.abs(inspectionStats.meanR - softboxStats.meanR) + Math.abs(inspectionStats.meanG - softboxStats.meanG) + Math.abs(inspectionStats.meanB - softboxStats.meanB)).toBeGreaterThan(3);
    expect(Math.abs(inspectionStats.highlightEnergy - softboxStats.highlightEnergy)).toBeGreaterThan(20);
    expect(state.exposure).toBe("high");
    expect(Number(state.metrics.exposure)).toBeGreaterThan(1.3);
    expect(highExposureStats.meanR + highExposureStats.meanG + highExposureStats.meanB).toBeGreaterThan(inspectionStats.meanR + inspectionStats.meanG + inspectionStats.meanB + 4);
  });

  test("product configurator exposes bounds-derived hero, profile, detail, and keyboard camera controls", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    const canvas = page.locator(productDemos[0].canvasSelector);

    await page.getByRole("button", { name: "Profile" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_PRODUCT_DEMO__?.cameraPreset)).toBe("profile");
    await page.getByRole("button", { name: "Detail" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_PRODUCT_DEMO__?.cameraPreset)).toBe("detail");
    await canvas.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_PRODUCT_DEMO__?.cameraPreset)).toBe("hero");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_PRODUCT_DEMO__?.cameraPreset)).toBe("profile");

    const state = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");
    expect(state.metrics.cameraPresets).toBe(3);
    expect(state.metrics.cameraMode).toBe("side-profile");
    expect(state.interactions).toBeGreaterThanOrEqual(4);
  });

  test("product configurator reports only the public workflow capabilities it actually exercises", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    const state = await readDemoState(page, "__AURA3D_PRODUCT_DEMO__");
    expect(state.metrics.materialVariants).toBe(3);
    expect(state.metrics.lightingPresets).toBe(3);
    expect(state.metrics.cameraPresets).toBe(3);
    expect(state.claimBoundary).toContain("does not claim a complete commerce backend");
    expect(state.knownLimits.join(" ")).toContain("native USDZ");
    expect(state.lod).toBeUndefined();
    expect(state.turntable).toBeUndefined();
    expect(state.featureEvidence).toBeUndefined();
  });

  test("architecture viewer updates selected zone and measurement on pointer input", async ({ page }) => {
    await openProductDemo(page, server, productDemos[1]);

    await page.locator(productDemos[1].canvasSelector).click({ position: { x: 220, y: 240 } });
    await page.waitForFunction(() => window.__AURA3D_ARCHITECTURE_DEMO__?.selectedZone === "gallery");
    const state = await readDemoState(page, "__AURA3D_ARCHITECTURE_DEMO__");

    expect(state.selectedZone).toBe("gallery");
    expect(state.interactions).toBe(1);
    expect(state.measurements.areaSqm).toBe(310);
    expect(state.measurements.spanMeters).toBeGreaterThan(17);
    expect(state.measurements.source).toBe("model-element-metadata");
    expect(state.measurements.elementId).toBe("room-gallery-l1");
    expect(state.featureEvidence.architecturalMeasurementSet).toBe(true);
    expect(state.measurements.snapPointCount).toBeGreaterThanOrEqual(16);
    expect(state.measurements.computedDistanceMeters).toBe(12);
    expect(state.measurements.computedAreaSqm).toBe(144);
    expect(state.measurements.computedAngleDegrees).toBeCloseTo(90, 3);
    expect(state.measurements.computedHeightMeters).toBe(2.1);
    expect(state.measurements.distanceLabel).toBe("12.00 m");
    expect(state.measurements.areaLabel).toBe("144.00 m2");
    expect(state.measurements.angleLabel).toBe("90.00 deg");
    expect(state.measurements.heightLabel).toBe("2.10 m");
    expect(state.measurements.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(state.selectedElement).toMatchObject({
      id: "room-gallery-l1",
      kind: "room",
      level: "L1",
    });
    expect(state.model.source).toContain("fixtures/advanced-gallery/assets/smart-city-district/smart-city-district.gltf");
    expect(state.model.elements).toContain("north-curtain-wall-panel-1");
    expect(state.model.elements).toContain("mezzanine-stair-tread-9");
    expect(state.metrics.zones).toBe(3);
    expect(state.metrics.selectedAreaSqm).toBe(310);
    expect(state.metrics.productionLikeArchitectureModel).toBe(true);
    expect(state.metrics.localArchitectureFixture).toBe(true);
    expect(state.metrics.actualElementSelection).toBe(true);
    expect(state.metrics.selectedElementId).toBe("room-gallery-l1");
    expect(state.metrics.measurementSource).toBe("model-element-metadata");
    expect(state.metrics.architecturalMeasurementSet).toBe(true);
    expect(state.metrics.measurementToolSnapPoints).toBeGreaterThanOrEqual(16);
    expect(state.metrics.measurementToolDistanceMeters).toBe(12);
    expect(state.metrics.measurementToolAreaSqm).toBe(144);
    expect(state.metrics.measurementToolAngleDegrees).toBeCloseTo(90, 3);
    expect(state.metrics.measurementToolHeightMeters).toBe(2.1);
    expect(state.metrics.measurementToolHash).toMatch(/^[0-9a-f]{8}$/);
    expect(state.featureEvidence.architecturalLightingState).toBe(true);
    expect(state.architecturalLighting.preset).toBe("noon");
    expect(state.architecturalLighting.interiorLights).toHaveLength(10);
    expect(state.architecturalLighting.activeInteriorLightCount).toBe(0);
    expect(state.architecturalLighting.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(state.metrics.architecturalLightingState).toBe(true);
    expect(state.metrics.lightingControllerPreset).toBe("noon");
    expect(state.metrics.lightingControllerInteriorLights).toBe(10);
    expect(state.metrics.lightingControllerActiveInteriorLights).toBe(0);
    expect(state.metrics.lightingControllerKelvinMin).toBe(2700);
    expect(state.metrics.lightingControllerKelvinMax).toBe(5000);
    expect(Number(state.metrics.architecturalElements)).toBeGreaterThanOrEqual(40);
    expect(Number(state.metrics.curtainWallPanels)).toBe(9);
    expect(Number(state.metrics.curtainWallMullions)).toBe(12);
    expect(Number(state.metrics.stairTreads)).toBe(9);
    expect(state.metrics.contactShadowAlternative).toBe(true);
    expect(Number(state.metrics.contactShadowCount)).toBeGreaterThanOrEqual(12);
    expect(Number(state.metrics.shadowReceiverElements)).toBeGreaterThanOrEqual(3);

    await writeProductDemoScreenshot(page, "tests/reports/architecture-viewer-product-demo.png");
  });

  test("architecture viewer exposes orbit, pan, zoom, focus, reset, keyboard, and touch controls", async ({ page }) => {
    await openProductDemo(page, server, productDemos[1]);
    const canvas = page.locator(productDemos[1].canvasSelector);

    await dispatchButtonClick(page, "button[data-view-control='pan']");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.panX)).toBeGreaterThan(0);

    await page.keyboard.press("=");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.zoom)).toBeGreaterThan(1);

    const beforeYaw = await page.evaluate(() => Number(window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.yaw ?? 0));
    await dispatchSyntheticPointerDrag(page, productDemos[1].canvasSelector, "touch", false);
    await expect.poll(() => page.evaluate(() => Number(window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.yaw ?? 0))).not.toBe(beforeYaw);

    await dispatchButtonClick(page, "button[data-view-control='focus']");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.zoom)).toBeGreaterThan(1.1);
    await dispatchButtonClick(page, "button[data-view-control='reset']");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ARCHITECTURE_DEMO__?.metrics.panX)).toBe(0);

    const state = await readDemoState(page, "__AURA3D_ARCHITECTURE_DEMO__");
    expect(state.metrics.fitToBounds).toBe(true);
    expect(state.metrics.resetView).toBe(true);
    expect(state.metrics.touchControls).toBe(true);
    expect(state.metrics.selectionDiagnostics).toBe(true);
  });

});

async function collectPageErrors(page: Page, run: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await run();
  return errors;
}

async function openProductDemo(page: Page, server: ExampleDevServer, demo: DemoDefinition): Promise<void> {
  await page.goto(`${server.origin}/examples/${demo.id}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (stateName) => {
      const state = (globalThis as Record<string, any>)[stateName];
      return state?.status === "ready" || state?.status === "error";
    },
    demo.stateName,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(250);
}

async function readDemoState(page: Page, stateName: DemoDefinition["stateName"]): Promise<Record<string, any>> {
  return page.evaluate((name) => {
    const state = (globalThis as Record<string, any>)[name];
    if (!state) {
      throw new Error(`Missing product demo state ${name}.`);
    }
    if (state.status !== "ready") {
      throw new Error(`Product demo ${name} did not reach ready: ${state.error ?? "missing error detail"}`);
    }
    return state;
  }, stateName);
}

async function writeProductDemoScreenshot(page: Page, relativePath: string): Promise<void> {
  const screenshotPath = resolve(relativePath);
  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function canvasHasNonBlankWebGLPixels(page: Page, canvasSelector: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      return false;
    }

    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      return false;
    }

    const width = Math.min(96, canvas.width);
    const height = Math.min(96, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8 || pixels[index + 3] > 8) {
        return true;
      }
    }
    return false;
  }, canvasSelector);
}

async function canvasWebGLStats(page: Page, canvasSelector: string): Promise<{
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly meanR: number;
  readonly meanG: number;
  readonly meanB: number;
  readonly highlightEnergy: number;
}> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) {
      return { nonBlankPixels: 0, colorBuckets: 0, meanR: 0, meanG: 0, meanB: 0, highlightEnergy: 0 };
    }
    const width = Math.min(220, canvas.width);
    const height = Math.min(160, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let highlightEnergy = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        sumR += r;
        sumG += g;
        sumB += b;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
        highlightEnergy += Math.max(0, r + g + b - 384);
      }
    }
    const divisor = Math.max(1, nonBlankPixels);
    return {
      nonBlankPixels,
      colorBuckets: buckets.size,
      meanR: Number((sumR / divisor).toFixed(3)),
      meanG: Number((sumG / divisor).toFixed(3)),
      meanB: Number((sumB / divisor).toFixed(3)),
      highlightEnergy: Number(highlightEnergy.toFixed(3))
    };
  }, canvasSelector);
}

async function dispatchSyntheticPointerDrag(
  page: Page,
  selector: string,
  pointerType: "mouse" | "touch",
  shiftKey: boolean,
): Promise<void> {
  await page.evaluate(
    ({ selector: targetSelector, pointerType: inputPointerType, shiftKey: inputShiftKey }) => {
      const canvas = document.querySelector<HTMLElement>(targetSelector);
      if (!canvas) throw new Error(`Missing canvas ${targetSelector}`);
      const rect = canvas.getBoundingClientRect();
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId: inputPointerType === "touch" ? 42 : 7,
        pointerType: inputPointerType,
        shiftKey: inputShiftKey,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        ...base,
        clientX: rect.left + rect.width * 0.48,
        clientY: rect.top + rect.height * 0.48,
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        ...base,
        clientX: rect.left + rect.width * 0.62,
        clientY: rect.top + rect.height * 0.44,
      }));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        ...base,
        clientX: rect.left + rect.width * 0.62,
        clientY: rect.top + rect.height * 0.44,
      }));
    },
    { selector, pointerType, shiftKey },
  );
}

async function dispatchButtonClick(page: Page, selector: string): Promise<void> {
  await page.evaluate((targetSelector) => {
    const button = document.querySelector<HTMLButtonElement>(targetSelector);
    if (!button) throw new Error(`Missing button ${targetSelector}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, selector);
}
