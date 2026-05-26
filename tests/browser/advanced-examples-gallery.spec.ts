import { createHash } from "node:crypto";
import { chromium, expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { DEMOS as DEMO_DEFINITIONS } from "../../apps/advanced-examples-gallery/src/metadata";
import { configuredAuthoredAssetIdsForDemo, expectedAuthoredAssetCountForDemo } from "../../apps/advanced-examples-gallery/src/authoredLayer";
import { assertNoRejectedVisualReviews } from "./advanced-gallery-visual-acceptance";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR } from "../../tools/advanced-gallery-evidence-paths";
import { ADVANCED_GALLERY_CONTEXTUAL_ROUTE } from "../../tools/naming-taxonomy/contextualAliases";

type DemoId = typeof DEMO_DEFINITIONS[number]["id"];
const DEMO_IDS: readonly DemoId[] = DEMO_DEFINITIONS.map((demo) => demo.id);
const evidenceMode = process.env.A3D_ADVANCED_GALLERY_EVIDENCE_MODE === "full-gallery" ? "full-gallery" : "focused-route";
const ADVANCED_GALLERY_FULL_REPORT_DIR = ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR;

interface AdvancedGalleryRuntime {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly demoId: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly visibleObjects: number;
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly fps: number;
  readonly frameMs: number;
  readonly width: number;
  readonly height: number;
  readonly postprocess: boolean;
  readonly environmentBackground?: RendererEnvironmentBackgroundRuntimeEvidence;
  readonly environmentLighting?: RendererEnvironmentLightingRuntimeEvidence;
  readonly environmentFog?: RendererEnvironmentFogRuntimeEvidence;
  readonly postprocessDiagnostics?: {
    readonly passes: number;
    readonly passNames: readonly string[];
    readonly targetFormat?: "rgba8" | "rgba16f" | "rgba32f";
    readonly renderTargets: number;
    readonly textures: number;
    readonly width: number;
    readonly height: number;
    readonly plan?: {
      readonly source: "Renderer.postprocessPlan";
      readonly passCount: number;
      readonly passNames: readonly string[];
      readonly targetFormat: "rgba8" | "rgba16f" | "rgba32f";
      readonly sourceTargetFormat: "rgba8" | "rgba16f" | "rgba32f";
      readonly executionMode: string;
      readonly canFuseLdr: boolean;
      readonly missingInputs: readonly string[];
      readonly readbackPassNames: readonly string[];
      readonly clarityWarnings: readonly string[];
      readonly claimBoundary: string;
    };
  };
  readonly systems: readonly string[];
  readonly approximations: readonly string[];
  readonly interactionState: {
    readonly source: "galleryInteractionAdapter + metadata controls";
    readonly selected: string;
    readonly cameraPreset: string;
    readonly pointer: { readonly x: number; readonly y: number };
    readonly controls: Record<string, number | boolean | string>;
    readonly routeInteractions: readonly string[];
    readonly pointerAction: "product-hotspot" | "scene-ripple-or-select";
    readonly routePointerCreatesRipple: boolean;
    readonly activeRippleCount: number;
    readonly productHotspotTargetCount: number;
    readonly sharedPointerMath: "galleryInteractionAdapter";
  };
  readonly animationState: {
    readonly source: "scene frame + authored runtime";
    readonly frameCount: number;
    readonly routeAnimatedSystems: readonly string[];
    readonly authoredAnimationTracksApplied: number;
    readonly authoredSkinningPalettesUpdated: number;
    readonly motionSampleSource: "screenshot-delta + frameCount";
    readonly paused: boolean;
  };
  readonly resetState: {
    readonly source: "reset action restores createControlValues, hero camera, cleared selection, and cleared ripples";
    readonly resettable: true;
    readonly defaultControls: Record<string, number | boolean | string>;
    readonly currentMatchesDefaults: boolean;
    readonly currentControlKeys: readonly string[];
    readonly defaultControlKeys: readonly string[];
    readonly resetClearsSelection: true;
    readonly resetClearsRipples: true;
    readonly resetCameraPreset: "hero";
  };
  readonly unsupportedBoundaries: readonly string[];
  readonly dataGalaxyEvidence?: {
    readonly source?: string;
    readonly routeId?: string;
    readonly updateMode?: string;
    readonly gpuBackend?: {
      readonly supported?: boolean;
      readonly backend?: string;
      readonly nativeGpuComputeDispatches?: number;
      readonly claimBoundary?: string;
    };
    readonly budget?: {
      readonly requestedParticles?: number;
      readonly effectiveParticles?: number;
      readonly primaryCount?: number;
      readonly vortexCount?: number;
      readonly networkCount?: number;
      readonly waveCount?: number;
    };
    readonly geometry?: {
      readonly pointCount?: number;
      readonly lineSegmentCount?: number;
      readonly drawBatches?: number;
    };
    readonly authoredAssetDisclosure?: {
      readonly generatedNoTextureAuthoredGlb?: boolean;
      readonly premiumTextureBackedAuthoredHero?: boolean;
    };
    readonly unsupportedGaps?: readonly string[];
  };
  readonly timings: {
    readonly buildSceneMs: number;
    readonly authoredFrameMs: number;
    readonly cameraMs: number;
    readonly renderMs: number;
    readonly totalLoopMs: number;
    readonly steadyStateLoopMs?: number;
    readonly steadyStateRenderMs?: number;
  };
  readonly authoredAsset?: {
    readonly status: "idle" | "loading" | "ready" | "error";
    readonly assetIds: readonly string[];
    readonly assets: readonly string[];
    readonly drawItems: number;
    readonly animations: number;
    readonly animatedAssets: number;
    readonly clips: readonly string[];
    readonly animationDiagnostics: readonly {
      readonly assetId: string;
      readonly clip: string;
      readonly time: number;
      readonly paused: boolean;
      readonly tracksApplied: number;
      readonly morphWeightTracksApplied: number;
      readonly skinningPalettesUpdated: number;
    }[];
    readonly transformDiagnostics: readonly {
      readonly assetId: string;
      readonly source: string;
      readonly enabled: boolean;
      readonly yawRadians: number;
      readonly angularVelocityRadiansPerSecond: number;
      readonly timeSeconds: number;
    }[];
    readonly materialVariants: readonly {
      readonly assetId: string;
      readonly assetTitle: string;
      readonly selected: string;
      readonly available: readonly string[];
      readonly ready: boolean;
      readonly usingFallback: boolean;
    }[];
    readonly assetProvenance?: readonly {
      readonly assetId: string;
      readonly assetTitle?: string;
      readonly sourceKind?: string;
      readonly localUrl?: string;
      readonly manifestPath?: string;
      readonly sourceScript?: string;
      readonly sourceAssetPath?: string;
      readonly generated?: boolean;
      readonly derivative?: boolean;
      readonly supportOnly?: boolean;
      readonly acceptableAsFocalHero?: boolean;
      readonly textureBacked?: boolean;
      readonly generatedNoTexture?: boolean;
      readonly semanticRoles?: readonly string[];
      readonly supportScaffoldRoles?: readonly string[];
      readonly defaultExcludedRoles?: readonly string[];
      readonly textureBackedFocalMaterials?: readonly string[];
      readonly knownLimitations?: readonly string[];
    }[];
    readonly materialDiagnostics: readonly {
      readonly assetId: string;
      readonly assetTitle: string;
      readonly label: string;
      readonly drawItems: number;
      readonly skinnedDrawItems: number;
      readonly texturedDrawItems: number;
      readonly baseColorTextureDrawItems?: number;
      readonly colorBearingTextureDrawItems?: number;
      readonly surfaceDetailTextureDrawItems?: number;
      readonly effectiveTextureBackedDrawItems?: number;
      readonly texturedSkinnedDrawItems: number;
      readonly untexturedSkinnedDrawItems: number;
      readonly fallbackWhiteDrawItems: number;
      readonly renderableBindingCount: number;
      readonly materialOverrideTargetCount: number;
      readonly materialOverrideSource: "GLTFRenderResources.collectMaterialOverrideTargets" | "not-applicable";
      readonly excludedNodeCount?: number;
      readonly excludedNodeSample?: readonly string[];
      readonly excludedNodeSemanticRoles?: readonly string[];
      readonly fallbackWhiteLabels: readonly string[];
      readonly textureBackedMaterialNames: readonly string[];
      readonly untexturedSkinnedLabels: readonly string[];
    }[];
    readonly loadMs: number;
    readonly errors: readonly string[];
  };
  readonly error?: string;
}

interface RendererEnvironmentBackgroundRuntimeEvidence {
  readonly source: "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass";
  readonly routeId: string;
  readonly enabled: true;
  readonly rendererField: "source.environmentBackground";
  readonly passName: "environment-background";
  readonly projection: "equirect" | "cubemap";
  readonly encoding: "linear";
  readonly outputColorSpace: "srgb";
  readonly textureDimension: "2d" | "cube";
  readonly textureLabel: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly cubeFaceCount: number | null;
  readonly visibleInDefaultShowcase: boolean;
  readonly activeInCurrentFrame: boolean;
  readonly visibleBackgroundUsage: "default-showcase" | "diagnostic-proof-only";
  readonly visibilityReason: string;
  readonly lightingIntensity: number;
  readonly backgroundIntensity: number;
  readonly hdr: {
    readonly loader: "loadV6HdrEnvironment";
    readonly uri: string;
    readonly id: string;
    readonly label: string;
    readonly radianceWidth: number;
    readonly radianceHeight: number;
    readonly format: "rgbe-hdr";
    readonly realRadianceHdr: true;
    readonly environmentTextureFormat: string;
    readonly cubemapTextureFormat: string;
    readonly pmremMipCount: number;
  };
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

interface RendererEnvironmentLightingRuntimeEvidence {
  readonly source: "loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture";
  readonly routeId: string;
  readonly enabled: true;
  readonly rendererField: "source.environmentLighting";
  readonly forwardPassField: "ForwardPassOptions.environmentLighting";
  readonly textureDimension: "cube";
  readonly textureLabel: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly cubeFaceCount: 6;
  readonly fallbackEquirectTextureDimension: "2d";
  readonly fallbackEquirectTextureLabel: string;
  readonly brdfLutTextureLabel: string;
  readonly environmentMapIntensity: number;
  readonly environmentMapSpecularIntensity: number;
  readonly environmentMapRotation: number;
  readonly environmentMapMipCount: number;
  readonly environmentMapEncoding: "linear";
  readonly nativeEnvironmentBindings: number;
  readonly uniformKeys: readonly string[];
  readonly textureBindingContract: "TextureBinding.expectedDimension=cube";
  readonly materialSchemaContract: "MaterialUniformKind.textureCube";
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

interface RendererEnvironmentFogRuntimeEvidence {
  readonly source: "Renderer.environmentFog -> ForwardPass.environmentFog";
  readonly routeId: string;
  readonly enabled: true;
  readonly rendererField: "source.environmentFog";
  readonly forwardPassField: "ForwardPassOptions.environmentFog";
  readonly profilePreset: string;
  readonly mode: string;
  readonly color: readonly [number, number, number];
  readonly near: number;
  readonly far: number;
  readonly density: number;
  readonly heightFalloff: number;
  readonly heightReference: number;
  readonly maxOpacity: number;
  readonly capabilityIds: readonly string[];
  readonly uniformKeys: readonly string[];
  readonly uniforms: {
    readonly u_environmentFogEnabled: 1;
    readonly u_environmentFogMode: 1 | 2 | 3;
    readonly u_environmentFogColor: readonly [number, number, number];
    readonly u_environmentFogNear: number;
    readonly u_environmentFogFar: number;
    readonly u_environmentFogDensity: number;
    readonly u_environmentFogHeightFalloff: number;
    readonly u_environmentFogHeightReference: number;
    readonly u_environmentFogMaxOpacity: number;
  };
  readonly sampleDistances: readonly number[];
  readonly sampleFactors: readonly number[];
  readonly monotonicDistanceResponse: boolean;
  readonly proxyGeometryExcludedFromClaim: true;
  readonly proxyGeometryLabels: readonly string[];
  readonly proxyGeometryInstanceCount: number;
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

interface ViteDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

test.describe("V9 advanced examples gallery", () => {
  let server: ViteDevServer | undefined;

  test.beforeAll(async () => {
    server = await startViteDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("blocks release acceptance until human visual review accepts every screenshot", () => {
    expect(DEMO_DEFINITIONS).toHaveLength(10);
    expect(new Set(DEMO_IDS).size).toBe(10);
    assertNoRejectedVisualReviews(DEMO_DEFINITIONS, expect);
  });

  for (const demo of DEMO_IDS) {
    test(`${demo} renders as a complex animated A3D demo`, async () => {
      test.setTimeout(captureTimeoutMs(demo));
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1.25 });
      const errors = collectPageErrors(page);
      try {
        if (!server) throw new Error("Vite dev server was not initialized.");
        await page.goto(`${server.origin}${ADVANCED_GALLERY_CONTEXTUAL_ROUTE}#${demo}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(({ expectedDemo, authoredRequired, backgroundRequired }) => {
          const runtime = (window as unknown as { readonly __A3D_V9_ADVANCED_EXAMPLES_GALLERY__?: AdvancedGalleryRuntime }).__A3D_V9_ADVANCED_EXAMPLES_GALLERY__;
          if (!runtime || runtime.demoId !== expectedDemo) return false;
          if (runtime.status === "error") return true;
          if (runtime.frameCount < 4 || runtime.drawCalls <= 0) return false;
          if (backgroundRequired && (!runtime.environmentBackground || !runtime.environmentLighting)) return false;
          if (authoredRequired) {
            const authored = runtime.authoredAsset;
            return authored?.status === "ready" || authored?.status === "error";
          }
          return true;
        }, { expectedDemo: demo, authoredRequired: isAuthoredRoute(demo), backgroundRequired: isRendererEnvironmentBackgroundRoute(demo) });
        await page.waitForTimeout(450);
        const runtime = await readRuntime(page);
        expect(errors).toEqual([]);
        expect(runtime.status).not.toBe("error");
        expect(runtime.error).toBeUndefined();
        expect(runtime.demoId).toBe(demo);
        expect(runtime.frameCount).toBeGreaterThanOrEqual(4);
        expect(runtime.drawCalls).toBeGreaterThan(0);
        expect(runtime.objectCount).toBeGreaterThanOrEqual(demo === "product-configurator" ? 20 : 50);
        expect(runtime.systems.length).toBeGreaterThanOrEqual(5);
        expect(runtime.width).toBeGreaterThanOrEqual(1280);
        expect(runtime.height).toBeGreaterThanOrEqual(720);
        assertPostprocessRuntime(demo, runtime);
        assertRendererEnvironmentBackgroundRuntime(demo, runtime);
        assertRendererEnvironmentLightingRuntime(demo, runtime);
        assertRendererEnvironmentFogRuntime(demo, runtime);
        assertAuthoredRouteRuntime(demo, runtime);

        const beforeMotion = await readCanvasSample(page);
        await page.waitForTimeout(600);
        const runtimeAfterMotion = await readRuntime(page);
        const afterMotion = await readCanvasSample(page);
        const motion = compareCanvasSamples(beforeMotion, afterMotion);
        expect(runtimeAfterMotion.frameCount, `${demo} frame count advances`).toBeGreaterThan(runtime.frameCount);
        assertAuthoredAnimationAdvances(demo, runtime, runtimeAfterMotion);
        assertMeasuredPerformanceEvidence(demo, runtimeAfterMotion);
        assertRuntimeStateEvidence(demo, runtimeAfterMotion);
        expect(motion.changedRatio, `${demo} visible motion changed ratio`).toBeGreaterThan(minimumMotionRatio(demo));

        const reportDir = evidenceMode === "full-gallery"
          ? ADVANCED_GALLERY_FULL_REPORT_DIR
          : `${ADVANCED_GALLERY_FULL_REPORT_DIR}/focused/${demo}`;
        const screenshotPath = `${reportDir}/${demo}.png`;
        const viewportScreenshotPath = `${reportDir}/${demo}-viewport.png`;
        const heroScreenshotPath = `${reportDir}/${demo}-hero.png`;
        mkdirSync(join(process.cwd(), reportDir), { recursive: true });
        let nextCaptureFrame = runtimeAfterMotion.frameCount + 1;
        const fullCaptureReadiness = await captureScreenshot(page, demo, "full", nextCaptureFrame, { path: screenshotPath, fullPage: true });
        nextCaptureFrame = fullCaptureReadiness.frameCount;
        const viewportCaptureReadiness = await captureScreenshot(page, demo, "viewport", nextCaptureFrame, {
          path: viewportScreenshotPath,
          clip: { x: 0, y: 0, width: 1060, height: 920 }
        });
        nextCaptureFrame = viewportCaptureReadiness.frameCount;
        const heroCaptureReadiness = await captureScreenshot(page, demo, "hero", nextCaptureFrame, { path: heroScreenshotPath, fullPage: false }, "hero");
        expect(statSync(screenshotPath).size).toBeGreaterThan(30_000);
        expect(statSync(viewportScreenshotPath).size).toBeGreaterThan(30_000);
        expect(statSync(heroScreenshotPath).size).toBeGreaterThan(30_000);
        const stats = readV6PngStats(heroScreenshotPath);
        expect(stats.width).toBeGreaterThanOrEqual(1000);
        expect(stats.height).toBeGreaterThanOrEqual(920);
        if (getVisualReviewStatus(demo) === "accepted") {
          expect(getVisualReview(demo).screenshotSha256, `${demo} accepted metadata must carry a review hash`).toMatch(/^[a-f0-9]{64}$/);
          expect(stats.uniqueColorBuckets).toBeGreaterThan(minimumUniqueColorBuckets(demo));
          expect(stats.foregroundCoverage).toBeGreaterThan(0.14);
          expect(stats.centerForegroundCoverage).toBeGreaterThan(demo === "data-galaxy" ? 0.12 : 0.16);
          expect(stats.detailEdgeDensity).toBeGreaterThan(minimumDetailEdgeDensity(demo));
          expect(stats.localContrast).toBeGreaterThan(minimumLocalContrast(demo));
        } else {
          expect(stats.uniqueColorBuckets).toBeGreaterThan(80);
          expect(stats.foregroundCoverage).toBeGreaterThan(0.06);
          expect(stats.centerForegroundCoverage).toBeGreaterThan(0.04);
          expect(stats.detailEdgeDensity).toBeGreaterThan(0.006);
          expect(stats.localContrast).toBeGreaterThan(8);
        }
        nextCaptureFrame = heroCaptureReadiness.frameCount;
        const rendererEnvironmentBackgroundVisualDeltaEvidence = await captureRendererEnvironmentBackgroundVisualDeltaEvidence(page, demo, nextCaptureFrame, reportDir);
        if (rendererEnvironmentBackgroundVisualDeltaEvidence) nextCaptureFrame = rendererEnvironmentBackgroundVisualDeltaEvidence.backgroundOnCaptureReadiness.frameCount;
        const rendererFogVisualDeltaEvidence = await captureRendererFogVisualDeltaEvidence(page, demo, nextCaptureFrame, reportDir);
        await expect(page.locator("#loading")).toBeHidden();

        writeFileSync(
          `${reportDir}/${demo}.json`,
          `${JSON.stringify({
            schema: "a3d-v9-advanced-gallery-route-report/v1",
            capturedAt: new Date().toISOString(),
            evidenceMode,
            evidenceScope: {
              mode: evidenceMode,
              routeId: demo,
              expectedRouteCount: DEMO_IDS.length,
              fullGalleryRun: evidenceMode === "full-gallery",
              focusedRouteOnly: evidenceMode !== "full-gallery",
              claimBoundary: evidenceMode === "full-gallery"
                ? "This report was produced by the full advanced gallery capture command and may participate in full-gallery review/audit evidence."
                : "This report was produced by a focused route capture and is verification evidence for this route only; it must not be treated as a complete gallery run."
            },
            visualReviewStatus: getVisualReviewStatus(demo),
            performanceEvidence: performanceEvidence(demo, runtimeAfterMotion),
            rendererEnvironmentBackgroundEvidence: runtimeAfterMotion.environmentBackground ?? null,
            rendererEnvironmentLightingEvidence: runtimeAfterMotion.environmentLighting ?? null,
            rendererEnvironmentBackgroundVisualDeltaEvidence,
            rendererEnvironmentFogEvidence: runtimeAfterMotion.environmentFog ?? null,
            rendererFogVisualDeltaEvidence,
            dataGalaxyEvidence: runtimeAfterMotion.dataGalaxyEvidence ?? null,
            runtime: runtimeAfterMotion,
            authored: runtimeAfterMotion.authoredAsset,
            motion,
            captureReadiness: {
              full: fullCaptureReadiness,
              viewport: viewportCaptureReadiness,
              hero: heroCaptureReadiness
            },
            screenshots: {
              full: screenshotEvidence(screenshotPath),
              viewport: screenshotEvidence(viewportScreenshotPath),
              hero: screenshotEvidence(heroScreenshotPath)
            },
            screenshotPath,
            viewportScreenshotPath,
            heroScreenshotPath,
            screenshotSha256: sha256File(screenshotPath),
            viewportScreenshotSha256: sha256File(viewportScreenshotPath),
            heroScreenshotSha256: sha256File(heroScreenshotPath),
            screenshotMtimeMs: statSync(screenshotPath).mtimeMs,
            screenshotMtimeIso: statSync(screenshotPath).mtime.toISOString(),
            viewportScreenshotMtimeMs: statSync(viewportScreenshotPath).mtimeMs,
            viewportScreenshotMtimeIso: statSync(viewportScreenshotPath).mtime.toISOString(),
            heroScreenshotMtimeMs: statSync(heroScreenshotPath).mtimeMs,
            heroScreenshotMtimeIso: statSync(heroScreenshotPath).mtime.toISOString(),
            pngStats: stats
          }, null, 2)}\n`
        );
      } finally {
        await browser.close();
      }
    });
  }
});

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
    errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

interface CanvasSample {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly number[];
}

type CaptureLabel = "full" | "viewport" | "hero";
type ReviewCaptureMode = "none" | "hero";
type RendererEnvironmentBackgroundProofMode = "on" | "off";
type RendererFogProofMode = "on" | "off";

interface CaptureReadinessEvidence {
  readonly label: CaptureLabel;
  readonly demoId: string;
  readonly frameCount: number;
  readonly runtimeStatus: AdvancedGalleryRuntime["status"] | "missing";
  readonly drawCalls: number;
  readonly loadingHiddenAttribute: boolean;
  readonly loadingComputedDisplay: string;
  readonly loadingVisible: boolean;
  readonly reviewCapture: ReviewCaptureMode;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly canvasVisible: boolean;
}

interface PerformanceEvidence {
  readonly source: "app-runtime-timings";
  readonly measuredFields: readonly string[];
  readonly acceptanceUsesRafFrameMs: false;
  readonly budgetMs: number;
  readonly loopMs: number;
  readonly renderMs: number;
  readonly rafFrameMs: number;
  readonly loopWithinBudget: boolean;
  readonly renderWithinBudget: boolean;
}

interface RendererFogVisualDeltaEvidence {
  readonly source: "renderer-fog-on-off-screenshot-delta";
  readonly demoId: DemoId;
  readonly rendererSource: "Renderer.environmentFog -> ForwardPass.environmentFog";
  readonly fogOnScreenshot: ReturnType<typeof screenshotEvidence>;
  readonly fogOffScreenshot: ReturnType<typeof screenshotEvidence>;
  readonly changedRatio: number;
  readonly meanDelta: number;
  readonly minimumChangedRatio: number;
  readonly minimumMeanDelta: number;
  readonly passed: true;
  readonly fogOnCaptureReadiness: CaptureReadinessEvidence;
  readonly fogOffCaptureReadiness: CaptureReadinessEvidence;
  readonly claimBoundary: string;
}

interface RendererEnvironmentBackgroundVisualDeltaEvidence {
  readonly source: "renderer-environment-background-on-off-screenshot-delta";
  readonly demoId: DemoId;
  readonly rendererSource: "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass";
  readonly backgroundOnScreenshot: ReturnType<typeof screenshotEvidence>;
  readonly backgroundOffScreenshot: ReturnType<typeof screenshotEvidence>;
  readonly changedRatio: number;
  readonly meanDelta: number;
  readonly minimumChangedRatio: number;
  readonly minimumMeanDelta: number;
  readonly passed: true;
  readonly backgroundOnCaptureReadiness: CaptureReadinessEvidence;
  readonly backgroundOffCaptureReadiness: CaptureReadinessEvidence;
  readonly claimBoundary: string;
}

function minimumMotionRatio(demo: DemoId): number {
  if (demo === "product-configurator") return 0.0002;
  if (demo === "fog-cathedral") return 0.0004;
  if (demo === "smart-city" || demo === "data-galaxy" || demo === "digital-twin") return 0.001;
  return 0.0006;
}

function minimumDetailEdgeDensity(demo: DemoId): number {
  if (demo === "water-lab" || demo === "ocean-observatory") return 0.028;
  if (demo === "product-configurator") return 0.007;
  if (demo === "robotics-lab" || demo === "fog-cathedral") return 0.028;
  return 0.035;
}

function minimumUniqueColorBuckets(demo: DemoId): number {
  if (demo === "product-configurator") return 390;
  return 400;
}

function minimumLocalContrast(demo: DemoId): number {
  if (demo === "product-configurator") return 30;
  return 35;
}

function maximumFrameMs(demo: DemoId): number {
  if (demo === "reactor-post") return 80;
  if (demo === "smart-city" || demo === "digital-twin") return 55;
  if (demo === "water-lab" || demo === "ocean-observatory" || demo === "fog-cathedral") return 45;
  return 34;
}

function isHeavyCaptureRoute(demo: DemoId): boolean {
  return demo === "product-configurator"
    || demo === "data-galaxy"
    || demo === "smart-city"
    || demo === "fog-cathedral"
    || demo === "digital-twin";
}

function captureTimeoutMs(demo: DemoId): number {
  if (demo === "product-configurator") return 1_200_000;
  if (demo === "smart-city" || demo === "data-galaxy" || demo === "fog-cathedral" || demo === "digital-twin") return 900_000;
  return isHeavyCaptureRoute(demo) ? 720_000 : 180_000;
}

function assertMeasuredPerformanceEvidence(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  const evidence = performanceEvidence(demo, runtime);
  expect(Number.isFinite(evidence.loopMs), `${demo} measured loop work must be finite`).toBe(true);
  expect(Number.isFinite(evidence.renderMs), `${demo} measured render work must be finite`).toBe(true);
  expect(evidence.loopMs, `${demo} measured loop work must be non-negative`).toBeGreaterThanOrEqual(0);
  expect(evidence.renderMs, `${demo} measured render work must be non-negative`).toBeGreaterThanOrEqual(0);
  if (getVisualReviewStatus(demo) === "accepted") {
    expect(evidence.loopWithinBudget, `${demo} accepted measured loop work must stay within the route budget`).toBe(true);
    expect(evidence.renderWithinBudget, `${demo} accepted measured render work must stay within the route budget`).toBe(true);
  } else {
    expect(runtime.frameMs, `${demo} smoke RAF frame time must stay finite but is not acceptance performance evidence`).toBeLessThanOrEqual(5000);
    expect(evidence.loopMs, `${demo} smoke loop work must stay finite`).toBeLessThanOrEqual(5000);
    expect(evidence.renderMs, `${demo} smoke render work must stay finite`).toBeLessThanOrEqual(5000);
  }
}

function assertRuntimeStateEvidence(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  const definition = DEMO_DEFINITIONS.find((entry) => entry.id === demo);
  expect(definition, `${demo} metadata definition`).toBeDefined();
  const defaultControlKeys = [
    ...(definition?.controls ?? [])
      .filter((control) => control.value !== undefined)
      .map((control) => control.key)
  ].sort();

  expect(runtime.interactionState.source, `${demo} interaction state source`).toBe("galleryInteractionAdapter + metadata controls");
  expect(runtime.interactionState.sharedPointerMath, `${demo} shared pointer math`).toBe("galleryInteractionAdapter");
  expect(runtime.interactionState.routeInteractions, `${demo} route interaction labels`).toEqual(definition?.interactions ?? []);
  expect(Object.keys(runtime.interactionState.controls).sort(), `${demo} runtime control keys`).toEqual(defaultControlKeys);
  expect(runtime.interactionState.pointer.x, `${demo} pointer x`).toBeGreaterThanOrEqual(0);
  expect(runtime.interactionState.pointer.x, `${demo} pointer x`).toBeLessThanOrEqual(1);
  expect(runtime.interactionState.pointer.y, `${demo} pointer y`).toBeGreaterThanOrEqual(0);
  expect(runtime.interactionState.pointer.y, `${demo} pointer y`).toBeLessThanOrEqual(1);
  expect(runtime.interactionState.pointerAction, `${demo} pointer action`).toBe(demo === "product-configurator" ? "product-hotspot" : "scene-ripple-or-select");
  expect(runtime.interactionState.routePointerCreatesRipple, `${demo} ripple policy`).toBe(demo === "water-lab" || demo === "ocean-observatory");

  expect(runtime.animationState.source, `${demo} animation state source`).toBe("scene frame + authored runtime");
  expect(runtime.animationState.frameCount, `${demo} animation state frame count`).toBe(runtime.frameCount);
  expect(runtime.animationState.routeAnimatedSystems.length, `${demo} route animated systems`).toBeGreaterThanOrEqual(runtime.systems.length);
  expect(runtime.animationState.motionSampleSource, `${demo} motion sample source`).toBe("screenshot-delta + frameCount");
  if (demo === "robotics-lab" || demo === "smart-city") {
    expect(runtime.animationState.authoredAnimationTracksApplied, `${demo} authored animation tracks`).toBeGreaterThan(0);
  }

  expect(runtime.resetState.source, `${demo} reset state source`).toBe("reset action restores createControlValues, hero camera, cleared selection, and cleared ripples");
  expect(runtime.resetState.resettable, `${demo} resettable`).toBe(true);
  expect(runtime.resetState.defaultControlKeys, `${demo} default reset controls`).toEqual(defaultControlKeys);
  expect(runtime.resetState.currentControlKeys, `${demo} current reset controls`).toEqual(defaultControlKeys);
  expect(runtime.resetState.resetClearsSelection, `${demo} reset clears selection`).toBe(true);
  expect(runtime.resetState.resetClearsRipples, `${demo} reset clears ripples`).toBe(true);
  expect(runtime.resetState.resetCameraPreset, `${demo} reset camera`).toBe("hero");
  expect(runtime.unsupportedBoundaries.length, `${demo} unsupported boundary disclosures`).toBeGreaterThan(0);
}

function performanceEvidence(demo: DemoId, runtime: AdvancedGalleryRuntime): PerformanceEvidence {
  const budgetMs = maximumFrameMs(demo);
  const loopMs = Number.isFinite(runtime.timings.steadyStateLoopMs) && (runtime.timings.steadyStateLoopMs ?? 0) > 0
    ? runtime.timings.steadyStateLoopMs!
    : runtime.timings.totalLoopMs;
  const renderMs = Number.isFinite(runtime.timings.steadyStateRenderMs) && (runtime.timings.steadyStateRenderMs ?? 0) > 0
    ? runtime.timings.steadyStateRenderMs!
    : runtime.timings.renderMs;
  return {
    source: "app-runtime-timings",
    measuredFields: [
      "runtime.timings.steadyStateLoopMs",
      "runtime.timings.steadyStateRenderMs",
      "runtime.timings.totalLoopMs",
      "runtime.timings.renderMs"
    ],
    acceptanceUsesRafFrameMs: false,
    budgetMs,
    loopMs,
    renderMs,
    rafFrameMs: runtime.frameMs,
    loopWithinBudget: loopMs <= budgetMs,
    renderWithinBudget: renderMs <= budgetMs
  };
}

function getVisualReviewStatus(demo: DemoId): "failed" | "candidate" | "accepted" {
  return DEMO_DEFINITIONS.find((definition) => definition.id === demo)?.visualReview.status ?? "failed";
}

function getVisualReview(demo: DemoId): typeof DEMO_DEFINITIONS[number]["visualReview"] {
  const review = DEMO_DEFINITIONS.find((definition) => definition.id === demo)?.visualReview;
  if (!review) throw new Error(`Missing visual review metadata for ${demo}`);
  return review;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertPostprocessRuntime(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  if (demo === "product-configurator") {
    expect(runtime.postprocess, "product-configurator route must use the direct renderer path after the material matrix proved tone/FXAA was not the current Product proof path").toBe(false);
    expect(runtime.postprocessDiagnostics, "product-configurator should not report a stale postprocess stack").toBeUndefined();
    return;
  }
  if (demo === "data-galaxy") {
    expect(runtime.postprocess, "data-galaxy renderer-owned tone/color/FXAA postprocess active").toBe(true);
    expect(runtime.postprocessDiagnostics?.passNames, "data-galaxy pass stack").toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(runtime.postprocessDiagnostics?.targetFormat, "data-galaxy should use HDR source before tone/color/FXAA").toBe("rgba16f");
    expect(runtime.postprocessDiagnostics?.plan, "data-galaxy renderer postprocess plan").toMatchObject({
      source: "Renderer.postprocessPlan",
      passCount: 3,
      passNames: ["tone-mapping", "color-grade", "fxaa"],
      targetFormat: "rgba16f",
      sourceTargetFormat: "rgba16f",
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: []
    });
    return;
  }
  if (demo !== "reactor-post") return;
  expect(runtime.postprocess, "reactor-post renderer-owned postprocess active").toBe(true);
  expect(runtime.postprocessDiagnostics?.passNames, "reactor-post default pass stack").toEqual(["tone-mapping", "color-grade", "fxaa"]);
  expect(runtime.postprocessDiagnostics?.targetFormat, "reactor-post default capture target is LDR when bloom is off").toBe("rgba8");
  expect(runtime.postprocessDiagnostics?.renderTargets, "reactor-post renderer-owned render targets").toBeGreaterThanOrEqual(1);
  expect(runtime.postprocessDiagnostics?.width, "reactor-post postprocess target width").toBe(runtime.width);
  expect(runtime.postprocessDiagnostics?.height, "reactor-post postprocess target height").toBe(runtime.height);
  expect(runtime.postprocessDiagnostics?.plan, "reactor-post renderer postprocess plan").toMatchObject({
    source: "Renderer.postprocessPlan",
    passCount: 3,
    passNames: ["tone-mapping", "color-grade", "fxaa"],
    executionMode: "renderer-owned-fused-ldr-native",
    canFuseLdr: true,
    missingInputs: [],
    readbackPassNames: []
  });
  expect(runtime.postprocessDiagnostics?.plan?.claimBoundary, "reactor-post postprocess plan claim boundary").toContain("does not prove EffectComposer parity");
}

function isRendererEnvironmentBackgroundRoute(demo: DemoId): boolean {
  return demo === "product-configurator" || demo === "data-galaxy";
}

function assertRendererEnvironmentBackgroundRuntime(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  if (!isRendererEnvironmentBackgroundRoute(demo)) return;
  const evidence = runtime.environmentBackground;
  expect(evidence, `${demo} renderer environment background runtime evidence`).toBeDefined();
  expect(evidence?.source, `${demo} renderer background source`).toBe("loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass");
  expect(evidence?.rendererField, `${demo} renderer background field`).toBe("source.environmentBackground");
  expect(evidence?.passName, `${demo} renderer background pass`).toBe("environment-background");
  expect(evidence?.enabled, `${demo} renderer background enabled`).toBe(true);
  expect(evidence?.routeId, `${demo} renderer background route`).toBe(demo);
  expect(evidence?.encoding, `${demo} background encoding`).toBe("linear");
  expect(evidence?.outputColorSpace, `${demo} background output color space`).toBe("srgb");
  expect(evidence?.hdr.loader, `${demo} HDR loader`).toBe("loadV6HdrEnvironment");
  expect(evidence?.hdr.realRadianceHdr, `${demo} real Radiance HDR`).toBe(true);
  expect(evidence?.hdr.format, `${demo} HDR format`).toBe("rgbe-hdr");
  expect(evidence?.hdr.radianceWidth ?? 0, `${demo} HDR radiance width`).toBeGreaterThanOrEqual(512);
  expect(evidence?.hdr.radianceHeight ?? 0, `${demo} HDR radiance height`).toBeGreaterThanOrEqual(256);
  expect(evidence?.textureWidth ?? 0, `${demo} background texture width`).toBeGreaterThan(0);
  expect(evidence?.textureHeight ?? 0, `${demo} background texture height`).toBeGreaterThan(0);
  if (demo === "data-galaxy") {
    expect(evidence?.visibleInDefaultShowcase, `${demo} route-correct HDRI background is visible by default`).toBe(true);
    expect(evidence?.activeInCurrentFrame, `${demo} route-correct HDRI background is active in default showcase frames`).toBe(true);
    expect(evidence?.visibleBackgroundUsage, `${demo} visible background usage policy`).toBe("default-showcase");
  } else {
    expect(evidence?.visibleInDefaultShowcase, `${demo} visible HDRI background is lighting/proof only by default`).toBe(false);
    expect(evidence?.activeInCurrentFrame, `${demo} visible HDRI background should not be active in default showcase frames`).toBe(false);
    expect(evidence?.visibleBackgroundUsage, `${demo} visible background usage policy`).toBe("diagnostic-proof-only");
    expect(evidence?.backgroundIntensity ?? 1, `${demo} diagnostic background intensity is separated from lighting intensity`).toBeLessThan(evidence?.lightingIntensity ?? 0);
  }
  expect(evidence?.rendererEvidence, `${demo} renderer background evidence trail`).toContain("loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass");
  expect(evidence?.claimBoundary, `${demo} background claim boundary`).toMatch(/does not prove/i);
  if (demo === "product-configurator") {
    expect(evidence?.projection, `${demo} background projection`).toBe("equirect");
    expect(evidence?.textureDimension, `${demo} background texture dimension`).toBe("2d");
    expect(evidence?.cubeFaceCount, `${demo} equirect cube face count`).toBeNull();
  } else {
    expect(evidence?.projection, `${demo} background projection`).toBe("cubemap");
    expect(evidence?.textureDimension, `${demo} background texture dimension`).toBe("cube");
    expect(evidence?.cubeFaceCount, `${demo} cubemap face count`).toBe(6);
  }
}

function assertRendererEnvironmentLightingRuntime(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  if (!isRendererEnvironmentBackgroundRoute(demo)) return;
  const evidence = runtime.environmentLighting;
  expect(evidence, `${demo} renderer environment lighting runtime evidence`).toBeDefined();
  expect(evidence?.source, `${demo} renderer lighting source`).toBe("loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture");
  expect(evidence?.rendererField, `${demo} renderer lighting field`).toBe("source.environmentLighting");
  expect(evidence?.forwardPassField, `${demo} forward lighting field`).toBe("ForwardPassOptions.environmentLighting");
  expect(evidence?.enabled, `${demo} renderer lighting enabled`).toBe(true);
  expect(evidence?.routeId, `${demo} renderer lighting route`).toBe(demo);
  expect(evidence?.textureDimension, `${demo} environment cube texture dimension`).toBe("cube");
  expect(evidence?.cubeFaceCount, `${demo} environment cube face count`).toBe(6);
  expect(evidence?.textureWidth ?? 0, `${demo} environment cube texture width`).toBeGreaterThan(0);
  expect(evidence?.textureHeight ?? 0, `${demo} environment cube texture height`).toBeGreaterThan(0);
  expect(evidence?.fallbackEquirectTextureDimension, `${demo} environment fallback texture dimension`).toBe("2d");
  expect(evidence?.environmentMapMipCount ?? 0, `${demo} PMREM mip count`).toBeGreaterThanOrEqual(2);
  expect(evidence?.environmentMapEncoding, `${demo} environment map encoding`).toBe("linear");
  expect(evidence?.nativeEnvironmentBindings ?? 0, `${demo} native environment texture bindings`).toBeGreaterThan(0);
  expect(evidence?.textureBindingContract, `${demo} texture binding contract`).toBe("TextureBinding.expectedDimension=cube");
  expect(evidence?.materialSchemaContract, `${demo} material schema contract`).toBe("MaterialUniformKind.textureCube");
  expect(evidence?.uniformKeys, `${demo} environment lighting uniform keys`).toEqual(expect.arrayContaining([
    "u_environmentMapTexture",
    "u_environmentCubeMapTexture",
    "u_environmentMapTextureEnabled",
    "u_environmentCubeMapTextureEnabled",
    "u_environmentMapTextureIntensity",
    "u_environmentMapTextureSpecularIntensity",
    "u_environmentMapTextureRotation",
    "u_environmentMapTextureMipCount",
    "u_environmentMapTextureEncoding",
    "u_environmentBrdfLutTexture",
    "u_environmentBrdfLutEnabled"
  ]));
  expect(evidence?.rendererEvidence, `${demo} renderer lighting evidence trail`).toContain("loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture");
  expect(evidence?.claimBoundary, `${demo} lighting claim boundary`).toMatch(/does not prove.*live cube cameras/i);
}

function assertRendererEnvironmentFogRuntime(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  if (demo !== "fog-cathedral" && demo !== "robotics-lab") return;
  const evidence = runtime.environmentFog;
  expect(evidence, `${demo} renderer environment fog runtime evidence`).toBeDefined();
  expect(evidence?.source, `${demo} renderer fog source`).toBe("Renderer.environmentFog -> ForwardPass.environmentFog");
  expect(evidence?.rendererField, `${demo} renderer fog field`).toBe("source.environmentFog");
  expect(evidence?.forwardPassField, `${demo} forward fog field`).toBe("ForwardPassOptions.environmentFog");
  expect(evidence?.enabled, `${demo} renderer fog enabled`).toBe(true);
  expect(evidence?.routeId, `${demo} renderer fog route`).toBe(demo);
  expect(evidence?.uniforms.u_environmentFogEnabled, `${demo} fog uniform enabled`).toBe(1);
  expect(evidence?.uniformKeys, `${demo} fog uniform key set`).toEqual(expect.arrayContaining([
    "u_environmentFogEnabled",
    "u_environmentFogMode",
    "u_environmentFogColor",
    "u_environmentFogNear",
    "u_environmentFogFar",
    "u_environmentFogDensity",
    "u_environmentFogMaxOpacity"
  ]));
  expect(evidence?.capabilityIds.length ?? 0, `${demo} fog capability evidence`).toBeGreaterThan(0);
  expect(evidence?.sampleDistances.length ?? 0, `${demo} fog sample distances`).toBeGreaterThanOrEqual(4);
  expect(evidence?.sampleFactors.length, `${demo} fog sample factors`).toBe(evidence?.sampleDistances.length);
  expect(evidence?.monotonicDistanceResponse, `${demo} fog samples monotonic`).toBe(true);
  expect(evidence?.proxyGeometryExcludedFromClaim, `${demo} proxy fog excluded from renderer claim`).toBe(true);
  expect(evidence?.rendererEvidence, `${demo} renderer fog evidence trail`).toContain("Renderer.environmentFog -> ForwardPass.environmentFog");
  expect(evidence?.claimBoundary, `${demo} proxy fog claim boundary`).toMatch(/Proxy fog geometry is excluded/i);
  if (demo === "fog-cathedral") {
    expect(evidence?.profilePreset, `${demo} fog profile preset`).toBe("morning-mist");
    expect(evidence?.mode, `${demo} fog mode`).toBe("exponential-squared");
    expect(evidence?.proxyGeometryInstanceCount ?? 0, `${demo} proxy fog helper instances are reported but not counted as renderer fog`).toBeGreaterThan(0);
    expect(evidence?.proxyGeometryLabels, `${demo} proxy fog labels`).toContain("layered atmospheric depth haze");
  } else {
    expect(evidence?.profilePreset, `${demo} fog profile preset`).toBe("warehouse-dust");
    expect(evidence?.mode, `${demo} fog mode`).toBe("linear");
    expect(evidence?.proxyGeometryInstanceCount, `${demo} has no fog proxy geometry counted toward renderer fog`).toBe(0);
  }
}

async function captureRendererEnvironmentBackgroundVisualDeltaEvidence(
  page: Page,
  demo: DemoId,
  minimumFrameCount: number,
  reportDir: string
): Promise<RendererEnvironmentBackgroundVisualDeltaEvidence | null> {
  if (!isRendererEnvironmentBackgroundRoute(demo)) return null;
  const runtime = await readRuntime(page);
  assertRendererEnvironmentBackgroundRuntime(demo, runtime);
  if (!runtime.environmentBackground) throw new Error(`${demo} missing renderer environment background evidence before visual-delta capture.`);

  const basePath = `${reportDir}/${demo}`;
  const backgroundOffPath = `${basePath}-renderer-environment-background-off.png`;
  const backgroundOnPath = `${basePath}-renderer-environment-background-on.png`;
  const minimumChangedRatio = demo === "data-galaxy" ? 0.0012 : 0.0006;
  const minimumMeanDelta = demo === "data-galaxy" ? 0.16 : 0.1;

  await setRendererEnvironmentBackgroundProofMode(page, "off");
  const backgroundOffCaptureReadiness = await waitForScreenshotReady(page, demo, "viewport", minimumFrameCount, "none");
  await page.screenshot({ path: backgroundOffPath, clip: { x: 0, y: 0, width: 1060, height: 920 } });
  const backgroundOffSample = await readCanvasSample(page);

  await setRendererEnvironmentBackgroundProofMode(page, "on");
  const backgroundOnCaptureReadiness = await waitForScreenshotReady(page, demo, "viewport", backgroundOffCaptureReadiness.frameCount, "none");
  await page.screenshot({ path: backgroundOnPath, clip: { x: 0, y: 0, width: 1060, height: 920 } });
  const backgroundOnSample = await readCanvasSample(page);

  const delta = compareCanvasSamples(backgroundOffSample, backgroundOnSample);
  expect(delta.changedRatio, `${demo} renderer environment background on/off changed pixel ratio`).toBeGreaterThan(minimumChangedRatio);
  expect(delta.meanDelta, `${demo} renderer environment background on/off mean pixel delta`).toBeGreaterThan(minimumMeanDelta);
  expect(statSync(backgroundOffPath).size, `${demo} background-off proof screenshot size`).toBeGreaterThan(30_000);
  expect(statSync(backgroundOnPath).size, `${demo} background-on proof screenshot size`).toBeGreaterThan(30_000);

  return {
    source: "renderer-environment-background-on-off-screenshot-delta",
    demoId: demo,
    rendererSource: runtime.environmentBackground.source,
    backgroundOnScreenshot: screenshotEvidence(backgroundOnPath),
    backgroundOffScreenshot: screenshotEvidence(backgroundOffPath),
    changedRatio: delta.changedRatio,
    meanDelta: delta.meanDelta,
    minimumChangedRatio,
    minimumMeanDelta,
    passed: true,
    backgroundOnCaptureReadiness,
    backgroundOffCaptureReadiness,
    claimBoundary: "This proves a visible renderer-level environmentBackground contribution for the captured route. It does not prove EXR, dynamic reflections, physical sky, volumetric atmosphere, or CSS/backdrop imagery."
  };
}

async function setRendererEnvironmentBackgroundProofMode(page: Page, mode: RendererEnvironmentBackgroundProofMode): Promise<void> {
  await page.evaluate((nextMode) => {
  if (nextMode === "off") {
      document.documentElement.dataset.environmentBackgroundProof = "off";
    } else if (nextMode === "on") {
      document.documentElement.dataset.environmentBackgroundProof = "on";
    } else {
      delete document.documentElement.dataset.environmentBackgroundProof;
    }
  }, mode);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function captureRendererFogVisualDeltaEvidence(
  page: Page,
  demo: DemoId,
  minimumFrameCount: number,
  reportDir: string
): Promise<RendererFogVisualDeltaEvidence | null> {
  if (demo !== "fog-cathedral" && demo !== "robotics-lab") return null;
  const runtime = await readRuntime(page);
  assertRendererEnvironmentFogRuntime(demo, runtime);
  if (!runtime.environmentFog) throw new Error(`${demo} missing renderer fog evidence before visual-delta capture.`);

  const basePath = `${reportDir}/${demo}`;
  const fogOffPath = `${basePath}-renderer-fog-off.png`;
  const fogOnPath = `${basePath}-renderer-fog-on.png`;
  const minimumChangedRatio = demo === "fog-cathedral" ? 0.0015 : 0.00035;
  const minimumMeanDelta = demo === "fog-cathedral" ? 0.25 : 0.08;

  await setRendererFogProofMode(page, "off");
  const fogOffCaptureReadiness = await waitForScreenshotReady(page, demo, "viewport", minimumFrameCount, "none");
  await page.screenshot({ path: fogOffPath, clip: { x: 0, y: 0, width: 1060, height: 920 } });
  const fogOffSample = await readCanvasSample(page);

  await setRendererFogProofMode(page, "on");
  const fogOnCaptureReadiness = await waitForScreenshotReady(page, demo, "viewport", fogOffCaptureReadiness.frameCount, "none");
  await page.screenshot({ path: fogOnPath, clip: { x: 0, y: 0, width: 1060, height: 920 } });
  const fogOnSample = await readCanvasSample(page);

  const delta = compareCanvasSamples(fogOffSample, fogOnSample);
  expect(delta.changedRatio, `${demo} renderer fog on/off changed pixel ratio`).toBeGreaterThan(minimumChangedRatio);
  expect(delta.meanDelta, `${demo} renderer fog on/off mean pixel delta`).toBeGreaterThan(minimumMeanDelta);
  expect(statSync(fogOffPath).size, `${demo} fog-off proof screenshot size`).toBeGreaterThan(30_000);
  expect(statSync(fogOnPath).size, `${demo} fog-on proof screenshot size`).toBeGreaterThan(30_000);

  return {
    source: "renderer-fog-on-off-screenshot-delta",
    demoId: demo,
    rendererSource: runtime.environmentFog.source,
    fogOnScreenshot: screenshotEvidence(fogOnPath),
    fogOffScreenshot: screenshotEvidence(fogOffPath),
    changedRatio: delta.changedRatio,
    meanDelta: delta.meanDelta,
    minimumChangedRatio,
    minimumMeanDelta,
    passed: true,
    fogOnCaptureReadiness,
    fogOffCaptureReadiness,
    claimBoundary: "This proves a visible renderer-level environmentFog contribution for the captured route. It does not prove volumetric fog, god rays, weather, or proxy-card atmosphere."
  };
}

async function setRendererFogProofMode(page: Page, mode: RendererFogProofMode): Promise<void> {
  await page.evaluate((nextMode) => {
    if (nextMode === "off") {
      document.documentElement.dataset.rendererFogProof = "off";
    } else {
      delete document.documentElement.dataset.rendererFogProof;
    }
  }, mode);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

function screenshotEvidence(path: string): { readonly path: string; readonly sha256: string; readonly sizeBytes: number; readonly mtimeMs: number; readonly mtimeIso: string } {
  const stat = statSync(path);
  return {
    path,
    sha256: sha256File(path),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    mtimeIso: stat.mtime.toISOString()
  };
}

async function captureScreenshot(
  page: Page,
  demo: DemoId,
  label: CaptureLabel,
  minimumFrameCount: number,
  options: NonNullable<Parameters<Page["screenshot"]>[0]>,
  reviewCapture: ReviewCaptureMode = "none"
): Promise<CaptureReadinessEvidence> {
  await setReviewCaptureMode(page, reviewCapture);
  try {
    const readiness = await waitForScreenshotReady(page, demo, label, minimumFrameCount, reviewCapture);
    await page.screenshot(options);
    return readiness;
  } finally {
    if (reviewCapture !== "none") await setReviewCaptureMode(page, "none");
  }
}

async function waitForScreenshotReady(
  page: Page,
  demo: DemoId,
  label: CaptureLabel,
  minimumFrameCount: number,
  reviewCapture: ReviewCaptureMode
): Promise<CaptureReadinessEvidence> {
  await page.waitForFunction(({ expectedDemo, frameFloor, expectedCapture }) => {
    const runtime = (window as unknown as { readonly __A3D_V9_ADVANCED_EXAMPLES_GALLERY__?: AdvancedGalleryRuntime }).__A3D_V9_ADVANCED_EXAMPLES_GALLERY__;
    const loading = document.querySelector<HTMLElement>("#loading");
    const loadingStyle = loading ? getComputedStyle(loading) : undefined;
    const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
    const canvasStyle = canvas ? getComputedStyle(canvas) : undefined;
    const canvasRect = canvas?.getBoundingClientRect();
    return runtime?.demoId === expectedDemo
      && (runtime.status === "ready" || runtime.status === "running")
      && runtime.frameCount >= frameFloor
      && runtime.drawCalls > 0
      && loading?.hasAttribute("hidden") === true
      && loadingStyle?.display === "none"
      && (document.documentElement.dataset.reviewCapture ?? "none") === expectedCapture
      && Boolean(canvas)
      && (canvas?.width ?? 0) >= 1000
      && (canvas?.height ?? 0) >= 700
      && (canvasRect?.width ?? 0) > 0
      && (canvasRect?.height ?? 0) > 0
      && canvasStyle?.display !== "none"
      && canvasStyle?.visibility !== "hidden";
  }, { expectedDemo: demo, frameFloor: minimumFrameCount, expectedCapture: reviewCapture });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const readiness = await readCaptureReadiness(page, label);
  assertCaptureReadiness(demo, label, reviewCapture, minimumFrameCount, readiness);
  return readiness;
}

async function setReviewCaptureMode(page: Page, mode: ReviewCaptureMode): Promise<void> {
  await page.evaluate((nextMode) => {
    if (nextMode === "hero") {
      document.documentElement.dataset.reviewCapture = "hero";
      return;
    }
    delete document.documentElement.dataset.reviewCapture;
  }, mode);
}

async function readCaptureReadiness(page: Page, label: CaptureLabel): Promise<CaptureReadinessEvidence> {
  return page.evaluate((captureLabel) => {
    const runtime = (window as unknown as { readonly __A3D_V9_ADVANCED_EXAMPLES_GALLERY__?: AdvancedGalleryRuntime }).__A3D_V9_ADVANCED_EXAMPLES_GALLERY__;
    const loading = document.querySelector<HTMLElement>("#loading");
    const loadingStyle = loading ? getComputedStyle(loading) : undefined;
    const loadingRect = loading?.getBoundingClientRect();
    const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
    const canvasStyle = canvas ? getComputedStyle(canvas) : undefined;
    const canvasRect = canvas?.getBoundingClientRect();
    const loadingVisible = Boolean(
      loading
      && !loading.hasAttribute("hidden")
      && loadingStyle?.display !== "none"
      && loadingStyle?.visibility !== "hidden"
      && loadingStyle?.opacity !== "0"
      && (loadingRect?.width ?? 0) > 0
      && (loadingRect?.height ?? 0) > 0
    );
    return {
      label: captureLabel,
      demoId: runtime?.demoId ?? "missing",
      frameCount: runtime?.frameCount ?? 0,
      runtimeStatus: runtime?.status ?? "missing",
      drawCalls: runtime?.drawCalls ?? 0,
      loadingHiddenAttribute: loading?.hasAttribute("hidden") === true,
      loadingComputedDisplay: loadingStyle?.display ?? "missing",
      loadingVisible,
      reviewCapture: document.documentElement.dataset.reviewCapture === "hero" ? "hero" : "none",
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      canvasCssWidth: canvasRect?.width ?? 0,
      canvasCssHeight: canvasRect?.height ?? 0,
      canvasVisible: Boolean(
        canvas
        && (canvasRect?.width ?? 0) > 0
        && (canvasRect?.height ?? 0) > 0
        && canvasStyle?.display !== "none"
        && canvasStyle?.visibility !== "hidden"
      )
    };
  }, label);
}

function assertCaptureReadiness(
  demo: DemoId,
  label: CaptureLabel,
  reviewCapture: ReviewCaptureMode,
  minimumFrameCount: number,
  readiness: CaptureReadinessEvidence
): void {
  expect(readiness.label, `${demo} ${label} capture label`).toBe(label);
  expect(readiness.demoId, `${demo} ${label} capture demo`).toBe(demo);
  expect(readiness.runtimeStatus === "ready" || readiness.runtimeStatus === "running", `${demo} ${label} capture runtime ready`).toBe(true);
  expect(readiness.frameCount, `${demo} ${label} capture fresh frame`).toBeGreaterThanOrEqual(minimumFrameCount);
  expect(readiness.drawCalls, `${demo} ${label} capture draw calls`).toBeGreaterThan(0);
  expect(readiness.loadingHiddenAttribute, `${demo} ${label} capture loading hidden attribute`).toBe(true);
  expect(readiness.loadingComputedDisplay, `${demo} ${label} capture loading computed display`).toBe("none");
  expect(readiness.loadingVisible, `${demo} ${label} capture loading overlay visibility`).toBe(false);
  expect(readiness.reviewCapture, `${demo} ${label} capture mode`).toBe(reviewCapture);
  expect(readiness.canvasWidth, `${demo} ${label} capture canvas backing width`).toBeGreaterThanOrEqual(1000);
  expect(readiness.canvasHeight, `${demo} ${label} capture canvas backing height`).toBeGreaterThanOrEqual(700);
  expect(readiness.canvasCssWidth, `${demo} ${label} capture canvas CSS width`).toBeGreaterThan(0);
  expect(readiness.canvasCssHeight, `${demo} ${label} capture canvas CSS height`).toBeGreaterThan(0);
  expect(readiness.canvasVisible, `${demo} ${label} capture canvas visible`).toBe(true);
}

async function readCanvasSample(page: Page): Promise<CanvasSample> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
    if (!canvas) throw new Error("Advanced gallery canvas is unavailable.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("Advanced gallery WebGL2 context is unavailable.");
    const width = Math.min(160, canvas.width);
    const height = Math.min(160, canvas.height);
    const x = Math.max(0, Math.floor((canvas.width - width) * 0.5));
    const y = Math.max(0, Math.floor((canvas.height - height) * 0.5));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { width, height, pixels: [...pixels] };
  });
}

function compareCanvasSamples(before: CanvasSample, after: CanvasSample): { readonly changedRatio: number; readonly meanDelta: number } {
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  const length = Math.min(before.pixels.length, after.pixels.length);
  let changed = 0;
  let totalDelta = 0;
  for (let index = 0; index + 2 < length; index += 4) {
    const delta = Math.abs((before.pixels[index] ?? 0) - (after.pixels[index] ?? 0))
      + Math.abs((before.pixels[index + 1] ?? 0) - (after.pixels[index + 1] ?? 0))
      + Math.abs((before.pixels[index + 2] ?? 0) - (after.pixels[index + 2] ?? 0));
    if (delta > 8) changed += 1;
    totalDelta += delta;
  }
  const samples = Math.max(1, length / 4);
  return {
    changedRatio: changed / samples,
    meanDelta: totalDelta / samples
  };
}

function assertAuthoredRouteRuntime(demo: DemoId, runtime: AdvancedGalleryRuntime): void {
  const requiredDrawItems: Partial<Record<DemoId, number>> = {
    "water-lab": 1,
    "ocean-observatory": 1,
	    "reactor-post": 1,
	    "smart-city": 3,
	    "product-configurator": 12,
    "robotics-lab": 16,
    "physics-playground": 3,
    "fog-cathedral": 3,
    "digital-twin": 35
  };
  const minimum = requiredDrawItems[demo];
  if (minimum === undefined) return;
  const authored = runtime.authoredAsset;
  expect(authored, `${demo} authored runtime`).toBeDefined();
  expect(authored?.status, `${demo} authored status`).toBe("ready");
  expect(authored?.errors ?? [], `${demo} authored errors`).toEqual([]);
  expect(authored?.drawItems ?? 0, `${demo} authored draw items`).toBeGreaterThanOrEqual(minimum);
  expect(authored?.assets.length ?? 0, `${demo} authored assets`).toBeGreaterThanOrEqual(expectedAuthoredAssetCountForDemo(demo));
  expect(new Set(authored?.assetIds ?? []), `${demo} configured authored asset ids`).toEqual(new Set(configuredAuthoredAssetIdsForDemo(demo)));
  if (demo === "robotics-lab" || demo === "digital-twin") {
    expect(authored?.animatedAssets ?? 0, `${demo} animated authored assets`).toBeGreaterThan(0);
    expect(authored?.clips.length ?? 0, `${demo} authored clips`).toBeGreaterThan(0);
    expect(authored?.animationDiagnostics.some((diagnostic) => diagnostic.tracksApplied > 0), `${demo} authored tracks applied`).toBe(true);
  }
  if (demo === "robotics-lab") {
    const diagnostics = authored?.materialDiagnostics ?? [];
    const clips = authored?.clips ?? [];
    expect(clips.some((clip) => clip === "Soldier: Run"), `${demo} soldier training clip`).toBe(true);
    expect(clips.filter((clip) => clip === "Robot Expressive: Dance").length, `${demo} primary robot training clip`).toBe(1);
    expect(clips.some((clip) => clip === "Robot Expressive: Walking"), `${demo} secondary robot training clip`).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.skinnedDrawItems > 0), `${demo} skinned authored draw items`).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.texturedSkinnedDrawItems > 0), `${demo} texture-backed skinned authored draw items`).toBe(true);
    expect(diagnostics.reduce((total, diagnostic) => total + diagnostic.fallbackWhiteDrawItems, 0), `${demo} fallback white authored materials`).toBe(0);
  }
  if (demo === "digital-twin") {
    expect(runtime.instanceCount, `${demo} real instance transforms`).toBeGreaterThanOrEqual(150);
    expect(runtime.objectCount, `${demo} rendered object/instance total`).toBeGreaterThanOrEqual(200);
  }
  if (demo === "smart-city") {
    expect(runtime.instanceCount, `${demo} real city/traffic instances`).toBeGreaterThanOrEqual(300);
    expect(runtime.objectCount, `${demo} rendered city scale`).toBeGreaterThanOrEqual(400);
  }
	  if (demo === "product-configurator") {
	    const diagnostics = authored?.materialDiagnostics ?? [];
	    const transformDiagnostics = authored?.transformDiagnostics ?? [];
	    const provenance = authored?.assetProvenance ?? [];
	    expect(authored?.assetIds ?? [], `${demo} texture-backed car asset`).toContain("car-concept");
	    expect(authored?.assetIds ?? [], `${demo} texture-backed watch asset must not clutter hero`).not.toContain("chronograph-watch");
	    expect(authored?.assetIds ?? [], `${demo} texture-backed shoe asset must not clutter hero`).not.toContain("materials-variants-shoe");
	    expect(authored?.assetIds ?? [], `${demo} transparent sunglasses asset must not clutter hero`).not.toContain("sunglasses-khronos");
	    expect(authored?.assetIds ?? [], `${demo} generated no-texture studio scaffold must not be active`).not.toContain("product-configurator-studio-blender");
	    expect(provenance.find((entry) => entry.assetId === "car-concept"), `${demo} original car provenance`).toMatchObject({
	      sourceKind: "external-fixture",
	      generated: false,
	      derivative: false,
	      supportOnly: false,
	      acceptableAsFocalHero: true,
	      textureBacked: true,
	      generatedNoTexture: false
	    });
	    expect(provenance.some((entry) => entry.assetId === "product-configurator-studio-blender"), `${demo} inactive generated studio provenance`).toBe(false);
	    expect(provenance.some((entry) => entry.assetId === "car-concept-batched"), `${demo} inactive batched derivative provenance`).toBe(false);
	    expect(authored?.drawItems ?? 0, `${demo} authored car draw items`).toBeGreaterThanOrEqual(80);
	    expect(transformDiagnostics.some((diagnostic) =>
	      diagnostic.assetId === "car-concept"
	      && diagnostic.source === "authored-turntable"
	      && diagnostic.enabled === false
	      && diagnostic.angularVelocityRadiansPerSecond === 0
	    ), `${demo} authored car stable default transform evidence`).toBe(true);
	    expect(diagnostics.some((diagnostic) =>
	      diagnostic.assetId === "car-concept"
	      && diagnostic.texturedDrawItems >= 80
	      && (diagnostic.effectiveTextureBackedDrawItems ?? 0) >= 80
	      && (diagnostic.colorBearingTextureDrawItems ?? 0) > 0
	    ), `${demo} texture-backed car diagnostics`).toBe(true);
	    expect((authored?.materialVariants ?? []).some((variant) => variant.assetId === "car-concept" && variant.selected === "Carmine Candy"), `${demo} car material variant evidence`).toBe(true);
    expect(diagnostics.reduce((total, diagnostic) => total + diagnostic.fallbackWhiteDrawItems, 0), `${demo} fallback white authored materials`).toBe(0);
  }
}

function assertAuthoredAnimationAdvances(demo: DemoId, before: AdvancedGalleryRuntime, after: AdvancedGalleryRuntime): void {
  if (demo !== "robotics-lab" && demo !== "digital-twin") return;
  const beforeDiagnostics = before.authoredAsset?.animationDiagnostics ?? [];
  const afterDiagnostics = after.authoredAsset?.animationDiagnostics ?? [];
  const advancedSkinnedClip = afterDiagnostics.some((afterDiagnostic) => {
    const beforeDiagnostic = beforeDiagnostics.find((candidate) =>
      candidate.assetId === afterDiagnostic.assetId
      && candidate.clip === afterDiagnostic.clip
    );
    const timeChanged = Math.abs(afterDiagnostic.time - (beforeDiagnostic?.time ?? afterDiagnostic.time)) > 0.001;
    return Boolean(beforeDiagnostic)
      && timeChanged
      && afterDiagnostic.tracksApplied > 0
      && afterDiagnostic.skinningPalettesUpdated > 0;
  });
  expect(advancedSkinnedClip, `${demo} authored skinned animation time and palettes advance`).toBe(true);
}

function isAuthoredRoute(demo: DemoId): boolean {
  return demo === "water-lab"
    || demo === "ocean-observatory"
	    || demo === "reactor-post"
	    || demo === "smart-city"
	    || demo === "product-configurator"
    || demo === "robotics-lab"
    || demo === "physics-playground"
    || demo === "fog-cathedral"
    || demo === "digital-twin";
}

async function readRuntime(page: Page): Promise<AdvancedGalleryRuntime> {
  return page.evaluate(() => {
    const runtime = (window as unknown as { readonly __A3D_V9_ADVANCED_EXAMPLES_GALLERY__?: AdvancedGalleryRuntime }).__A3D_V9_ADVANCED_EXAMPLES_GALLERY__;
    if (!runtime) throw new Error("Advanced gallery runtime was not published.");
    return runtime;
  });
}

async function startViteDevServer(): Promise<ViteDevServer> {
  if (process.env.A3D_ADVANCED_GALLERY_BASE_URL) {
    return { origin: process.env.A3D_ADVANCED_GALLERY_BASE_URL.replace(/\/$/, ""), close: async () => {} };
  }
  const port = await resolveVitePort();
  const child = spawn("pnpm", [
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      A3D_VITE_TEST_SERVER: "advanced-gallery",
      VITE_FORCE_HMR_DISABLED: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForViteReady(child, port);
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => closeVite(child)
  };
}

async function resolveVitePort(): Promise<number> {
  const explicit = Number(process.env.A3D_ADVANCED_GALLERY_PORT ?? 0);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 5192;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

function waitForViteReady(child: ChildProcessWithoutNullStreams, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite test server on ${port}.\n${output}`));
    }, 20_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Vite test server exited with code ${code}.\n${output}`));
    };
    const cleanup = (): void => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function closeVite(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 2_000).unref();
  });
}
