import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const screenshotDir = "tests/reports/v4-example-screenshots";
const reportPath = `${screenshotDir}/manifest.json`;
const viewport = { width: 1280, height: 800 };

type FlagshipExample = {
  readonly id: "product-configurator" | "architecture-viewer" | "game-slice";
  readonly path: string;
  readonly stateKey: "__GALILEO3D_PRODUCT_DEMO__" | "__GALILEO3D_ARCHITECTURE_DEMO__" | "__GALILEO3D_GAME_DEMO__";
  readonly canvasSelector: string;
  readonly requiredEvidence: readonly string[];
};

const examples: readonly FlagshipExample[] = [
  {
    id: "product-configurator",
    path: "/examples/product-configurator/index.html",
    stateKey: "__GALILEO3D_PRODUCT_DEMO__",
    canvasSelector: "[data-testid='product-configurator-canvas']",
    requiredEvidence: ["modelBacked", "v4ProductAssetLoaded", "v4RenderPreset", "generatedEnvironmentMap", "environmentReflectionEvidence", "proceduralTextureFixturesApplied", "oldBranchEcommerceTurntablePort", "productTurntableAutoRotate", "productHotspotManager", "productLightingPresetManager", "productCapturePlan", "productBatchExportPlan", "productArExportBoundary", "brdfLutValidated", "stableDirectionalShadowMap", "postprocessRealSceneReadback", "contactShadowAlternative", "annotationsVisible", "partSelection", "explodedView"],
  },
  {
    id: "architecture-viewer",
    path: "/examples/architecture-viewer/index.html",
    stateKey: "__GALILEO3D_ARCHITECTURE_DEMO__",
    canvasSelector: "[data-testid='architecture-viewer-canvas']",
    requiredEvidence: ["roomModel", "v4ArchitectureAssetLoaded", "v4RenderPreset", "generatedEnvironmentMap", "environmentReflectionEvidence", "proceduralTextureFixturesApplied", "richArchitectureComposition", "oldBranchArchitectureCompositionPort", "oldBranchArchitecturalMaterialLibraryPort", "oldBranchMeasurementToolPort", "oldBranchSectionHatchingPort", "sectionCutHatching", "oldBranchLightingControllerPort", "kitchenBathroomFurnitureExteriorDetails", "bedroomFurnitureDetails", "brdfLutValidated", "stableDirectionalShadowMap", "postprocessRealSceneReadback", "materialRoomSelection", "measurementMetadata", "contactShadowAlternative", "orbitWalkCameraModes", "lightingPresets"],
  },
  {
    id: "game-slice",
    path: "/examples/game-slice/index.html",
    stateKey: "__GALILEO3D_GAME_DEMO__",
    canvasSelector: "[data-testid='game-slice-canvas']",
    requiredEvidence: ["levelAssetLoaded", "playerAssetLoaded", "litSkinnedCharacter", "skinnedHeroAnimation", "v4RenderPreset", "generatedEnvironmentMap", "environmentReflectionEvidence", "proceduralTextureFixturesApplied", "seededStarfieldNebulaBackground", "brdfLutValidated", "stableDirectionalShadowMap", "postprocessRealSceneReadback", "physicsController", "particles", "spatialAudio", "objectiveLoop", "animationStateMachine"],
  },
];

test.describe("v4 flagship example screenshot audit", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures current flagship screenshots and verifies portfolio cards", async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    const root = process.cwd();
    mkdirSync(join(root, screenshotDir), { recursive: true });
    const entries: Array<Record<string, unknown>> = [];

    for (const example of examples) {
      const errors = captureErrors(page);
      let releaseGameRunKey = false;
      const url = `${server.origin}${example.path}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForState(page, example.stateKey);

      if (example.id === "product-configurator") {
        await page.getByRole("button", { name: "Detail" }).click();
        await page.getByRole("button", { name: "Copper" }).click();
        await page.getByRole("button", { name: "Controls" }).click();
        await page.getByRole("button", { name: "Exploded view" }).click();
        await page.waitForFunction(() => (
          window.__GALILEO3D_PRODUCT_DEMO__?.explodedView === true
          && window.__GALILEO3D_PRODUCT_DEMO__?.featureEvidence?.explodedView === true
        ));
        await page.getByRole("button", { name: "Exploded view" }).click();
        await page.getByRole("button", { name: "Hero" }).click();
        await page.getByRole("button", { name: "Ear cups" }).click();
        await page.getByRole("button", { name: "Export PNG" }).click();
        await page.waitForFunction(() => (
          window.__GALILEO3D_PRODUCT_DEMO__?.export.requested === true
          && window.__GALILEO3D_PRODUCT_DEMO__?.selectedPart === "ear-cups"
          && window.__GALILEO3D_PRODUCT_DEMO__?.cameraPreset === "hero"
          && window.__GALILEO3D_PRODUCT_DEMO__?.explodedView === false
          && window.__GALILEO3D_PRODUCT_DEMO__?.featureEvidence?.explodedView === true
        ));
      } else if (example.id === "architecture-viewer") {
        await page.getByRole("button", { name: "Gallery" }).click();
        await page.getByRole("button", { name: "Walk" }).click();
        await page.getByRole("button", { name: "Exhibit" }).click();
        await page.waitForFunction(() => (
          window.__GALILEO3D_ARCHITECTURE_DEMO__?.cameraMode === "walk"
          && window.__GALILEO3D_ARCHITECTURE_DEMO__?.lightPreset === "exhibit"
        ));
        await page.getByRole("button", { name: "Section" }).click();
        await page.waitForFunction(() => (
          window.__GALILEO3D_ARCHITECTURE_DEMO__?.cameraMode === "section"
          && window.__GALILEO3D_ARCHITECTURE_DEMO__?.lightPreset === "exhibit"
        ));
      } else {
        await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.visualAssetsLoaded === true);
        await page.locator(example.canvasSelector).focus();
        await page.keyboard.down("ArrowRight");
        releaseGameRunKey = true;
        await page.waitForFunction(() => (
          window.__GALILEO3D_GAME_DEMO__?.metrics.playerAnimationState === "run"
          && Number(window.__GALILEO3D_GAME_DEMO__?.metrics.playerAnimationTransitions ?? 0) > 0
        ));
      }

      await page.waitForTimeout(300);
      const state = await readState(page, example.stateKey);
      const pixelStats = await canvasPixelStats(page, example.canvasSelector);
      const screenshotPath = `${screenshotDir}/${example.id}.png`;
      await page.screenshot({ path: join(root, screenshotPath), fullPage: true });
      if (releaseGameRunKey) await page.keyboard.up("ArrowRight");

      expect(errors).toEqual([]);
      expect(state.status).toBe("ready");
      expect(state.renderer).toBe("webgl2");
      expect(state.screenshotPath).toBe(screenshotPath);
      expect(typeof state.visualClaim).toBe("string");
      expect(state.visualClaim.length).toBeGreaterThan(20);
      expect(Array.isArray(state.knownLimits)).toBe(true);
      expect(state.knownLimits.length).toBeGreaterThan(0);
      expect(typeof state.claimBoundary).toBe("string");
      expect(state.claimBoundary.length).toBeGreaterThan(20);
      expect(typeof state.featureEvidence).toBe("object");
      for (const key of example.requiredEvidence) {
        expect(state.featureEvidence[key], `${example.id} featureEvidence.${key}`).toBeTruthy();
      }
      expect(Number(state.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(0);
      expect(state.v4RenderPreset?.presetId).toBe("galileo3d-v4-visual-quality-preset");
      expect(state.v4RenderPreset?.colorManagement?.toneMapper).toBe("reinhard");
      expect(state.v4RenderPreset?.activeFeatures).toEqual(expect.arrayContaining(["color-management", "tone-mapping", "bounded-pbr", "environment-reflections", "directional-shadows", "postprocess-bloom", "postprocess-fxaa"]));
      expect(state.directionalShadow?.mode).toBe("bounded-directional-shadow-map");
      expect(state.directionalShadow?.presetId).toBe("galileo3d-v4-visual-quality-preset");
      expect(state.directionalShadow?.cascadeCount).toBeGreaterThanOrEqual(3);
      expect(state.directionalShadow?.mapSize).toBeGreaterThanOrEqual(512);
      expect(state.directionalShadow?.pcfSamples).toBeGreaterThanOrEqual(9);
      expect(state.directionalShadow?.casterCount).toBeGreaterThan(0);
      expect(state.directionalShadow?.receiverCount).toBeGreaterThan(0);
      expect(state.directionalShadow?.visibleReceiverDarkening).toBe(true);
      expect(state.directionalShadow?.productionShadowSamplingClaimed).toBe(false);
      expect(state.environmentResources?.resourceSet).toBe("generated-local-linear-hdr-environment");
      expect(state.environmentResources?.hdrSource).toBe(true);
      expect(Number(state.environmentResources?.maxLinearValue ?? 0)).toBeGreaterThan(1);
      expect(state.environmentResources?.specularMipCount).toBeGreaterThanOrEqual(4);
      expect(state.environmentResources?.validation?.brdfLutTexture).toBe(true);
      expect(state.environmentResources?.validation?.diffuseIrradiance).toBe(true);
      expect(state.postprocess?.source).toBe("webgl2-backbuffer-readback");
      expect(state.postprocess?.path).toBe("V4RenderPreset.toneMapPixels.bloomPixels.fxaaPixels");
      expect(Number(state.postprocess?.changedPixels ?? 0)).toBeGreaterThan(0);
      expect(Number(state.postprocess?.outputColorBuckets ?? 0)).toBeGreaterThan(1);
      if (example.id === "architecture-viewer") {
        expect(state.oldBranchSectionHatching?.source).toBe("origin-master-architecture-section-hatching-adapted");
        expect(state.oldBranchSectionHatching?.pattern).toBe("concrete-crosshatch");
        expect(Number(state.metrics?.sectionHatchingLineCount ?? 0)).toBeGreaterThanOrEqual(24);
        expect(Number(state.metrics?.sectionHatchingLayerCount ?? 0)).toBe(2);
        expect(String(state.metrics?.sectionHatchingHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
      }
      expect(pixelStats.nonBlankPixels).toBeGreaterThan(300);
      expect(pixelStats.occupiedAreaRatio).toBeGreaterThan(0.15);
      expect(pixelStats.occupiedQuadrants).toBeGreaterThanOrEqual(3);

      entries.push({
        id: example.id,
        url,
        screenshotPath,
        runtimeStateKey: example.stateKey,
        visualClaim: state.visualClaim,
        knownLimits: state.knownLimits,
        claimBoundary: state.claimBoundary,
        featureEvidence: state.featureEvidence,
        metrics: state.metrics,
        drawCalls: state.diagnostics?.drawCalls,
        pixelStats,
      });
    }

    const portfolioErrors = captureErrors(page);
    await page.goto(`${server.origin}/examples/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_PORTFOLIO__?.status === "ready");
    await page.waitForLoadState("networkidle");
    const portfolioScreenshotPath = `${screenshotDir}/portfolio.png`;
    await page.screenshot({ path: join(root, portfolioScreenshotPath), fullPage: true });
    const portfolioState = await page.evaluate(() => window.__GALILEO3D_PORTFOLIO__);
    const cardIds = await page.locator("[data-example-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-example-id")));
    const readinessIds = await page.locator("[data-readiness-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-readiness-id")));

    expect(portfolioErrors).toEqual([]);
    expect(cardIds).toEqual(["product-configurator", "architecture-viewer", "game-slice", "racing-showcase"]);
    expect(readinessIds).toEqual(["product-visual", "pbr", "hdr-render-target", "shadow-map", "postprocess-suite", "gltf", "webgpu"]);
    expect(portfolioState?.examples).toBe(4);
    expect(portfolioState?.cards).toHaveLength(4);
    expect(portfolioState?.readinessDemos).toHaveLength(7);
    expect(portfolioState?.readinessDemos.filter((demo) => demo.status === "achieved").map((demo) => demo.id)).toEqual(["gltf", "webgpu"]);
    expect(portfolioState?.readinessDemos.filter((demo) => demo.status === "visual-blocked").map((demo) => demo.id)).toEqual(["product-visual", "pbr", "hdr-render-target", "shadow-map", "postprocess-suite"]);
    for (const card of portfolioState?.cards ?? []) {
      expect(String(card.screenshotPath)).toContain("/tests/reports/v4-example-screenshots/");
      expect(card.knownLimits.length).toBeGreaterThan(0);
      expect(card.visualGate.status).toBe("passed-v4-screenshot-audit");
      expect(card.visualGate.reportPath).toBe("/tests/reports/v4-example-screenshots/manifest.json");
      expect(card.visualGate.visualQualityReportPath).toBe("/tests/reports/v4-visual-quality.json");
    }

    entries.push({
      id: "portfolio",
      url: `${server.origin}/examples/index.html`,
      screenshotPath: portfolioScreenshotPath,
      runtimeStateKey: "__GALILEO3D_PORTFOLIO__",
      visualClaim: portfolioState?.visualClaim,
      knownLimits: portfolioState?.knownLimits,
      claimBoundary: portfolioState?.claimBoundary,
      cards: portfolioState?.cards,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      command: "pnpm exec playwright test tests/browser/example-screenshot-audit-v4.spec.ts",
      browserName,
      browserVersion: page.context().browser()?.version() ?? "unknown",
      viewport,
      dpr: await page.evaluate(() => window.devicePixelRatio),
      screenshotDir,
      entries,
      pass: true,
    };
    writeFileSync(join(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
  });

  test("architecture viewer keeps a visible scene after manual orbit and zone changes", async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/architecture-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__GALILEO3D_ARCHITECTURE_DEMO__");

    await page.getByRole("button", { name: "Studio" }).click();
    for (let index = 0; index < 5; index += 1) {
      await page.locator("[data-view-control='orbit']").click();
    }
    const canvas = page.locator("[data-testid='architecture-viewer-canvas']");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Architecture canvas is not visible.");
    await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.48, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const state = await readState(page, "__GALILEO3D_ARCHITECTURE_DEMO__");
    const pixelStats = await canvasPixelStats(page, "[data-testid='architecture-viewer-canvas']");
    expect(errors).toEqual([]);
    expect(state.cameraMode).toBe("orbit");
    expect(Math.abs(Number(state.metrics?.yaw ?? 0))).toBeLessThanOrEqual(0.47);
    expect(pixelStats.nonBlankPixels).toBeGreaterThan(12_000);
    expect(pixelStats.colorBuckets).toBeGreaterThan(8);
    expect(pixelStats.occupiedAreaRatio).toBeGreaterThan(0.55);
    expect(pixelStats.occupiedQuadrants).toBeGreaterThanOrEqual(4);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function waitForState(page: Page, key: FlagshipExample["stateKey"]): Promise<void> {
  await page.waitForFunction((stateKey) => {
    const state = (globalThis as Record<string, { status?: string } | undefined>)[stateKey];
    return state?.status === "ready" || state?.status === "error";
  }, key, { timeout: 120_000 });
}

async function readState(page: Page, key: FlagshipExample["stateKey"]): Promise<Record<string, any>> {
  return page.evaluate((stateKey) => {
    const state = (globalThis as Record<string, any>)[stateKey];
    if (!state) throw new Error(`Missing runtime state ${stateKey}`);
    if (state.status !== "ready") throw new Error(`${stateKey} reported ${state.status}: ${state.error ?? "missing error"}`);
    return state;
  }, key);
}

async function canvasPixelStats(page: Page, selector: string): Promise<{
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly occupiedWidth: number;
  readonly occupiedHeight: number;
  readonly occupiedAreaRatio: number;
  readonly occupiedQuadrants: number;
}> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) {
      return { nonBlankPixels: 0, colorBuckets: 0, occupiedWidth: 0, occupiedHeight: 0, occupiedAreaRatio: 0, occupiedQuadrants: 0 };
    }
    const width = Math.min(220, canvas.width);
    const height = Math.min(160, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    const quadrants = [false, false, false, false];
    let nonBlankPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      if (r > 8 || g > 8 || b > 8) {
        const pixelIndex = index / 4;
        const px = pixelIndex % width;
        const py = Math.floor(pixelIndex / width);
        nonBlankPixels += 1;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        quadrants[(py >= height / 2 ? 2 : 0) + (px >= width / 2 ? 1 : 0)] = true;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    const occupiedWidth = maxX >= minX ? maxX - minX + 1 : 0;
    const occupiedHeight = maxY >= minY ? maxY - minY + 1 : 0;
    return {
      nonBlankPixels,
      colorBuckets: buckets.size,
      occupiedWidth,
      occupiedHeight,
      occupiedAreaRatio: Number(((occupiedWidth * occupiedHeight) / Math.max(1, width * height)).toFixed(4)),
      occupiedQuadrants: quadrants.filter(Boolean).length,
    };
  }, selector);
}

declare global {
  interface Window {
    __GALILEO3D_PRODUCT_DEMO__?: Record<string, any>;
    __GALILEO3D_ARCHITECTURE_DEMO__?: Record<string, any>;
    __GALILEO3D_GAME_DEMO__?: Record<string, any>;
    __GALILEO3D_PORTFOLIO__?: {
      readonly status: "ready";
      readonly examples: number;
      readonly visualClaim: string;
      readonly knownLimits: readonly string[];
      readonly claimBoundary: string;
      readonly readinessDemos: readonly {
        readonly id: string;
        readonly status: "visual-blocked" | "local-ready" | "achieved" | "external-blocked";
        readonly reportPath: string;
        readonly proofCommand: string;
      }[];
      readonly cards: readonly {
        readonly id: string;
        readonly screenshotPath: string;
        readonly knownLimits: readonly string[];
        readonly visualGate: {
          readonly status: "blocked-v4-visual-quality" | "passed-v4-screenshot-audit";
          readonly reportPath: string;
          readonly visualQualityReportPath: string;
          readonly blocker?: string;
        };
      }[];
    };
  }
}
