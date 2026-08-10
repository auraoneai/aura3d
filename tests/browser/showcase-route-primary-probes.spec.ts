// allow: SIZE_OK - single browser evidence generator; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { analyzeForegroundPng, analyzePngDifferenceBounds, type PngCrop } from "./showcase-visual-quality";
import { projectScenePoint, resolveCompositionCamera, type CompositionCameraProjectionInput } from "./showcase-composition-projection";
// @ts-expect-error -- .mjs evidence tooling has no type declarations; it is validated by its own tests.
import { createConfigFingerprint, writeJsonArtifactAtomically } from "../../tools/evidence-freshness/index.mjs";

const EVIDENCE_TIMEOUT_MS = 30_000;
const VIEWPORT = { width: 1440, height: 900 } as const;
const REPORT_DIR = resolve("tests/reports/showcase-route-primary-probes");
const ROUTE_GATE_CONFIG_PATH = resolve("tools/showcase-library/route-gates.json");
const UI_EVIDENCE_SELECTOR = [
  "header",
  "nav",
  "aside",
  "section[aria-label]",
  "#hud",
  "#panel",
  "#touch-controls",
  "[class*='hud']",
  "[class*='panel']",
  "[class*='controls']",
  "[class*='topbar']",
  "[class*='commandbar']",
  "[class*='telemetry']",
  "[class*='console']"
].join(",");
// Deliberately handled mounted-route statuses; see
// tools/showcase-library/route-evidence-status.mjs for the shared policy.
const ACCEPTED_ROUTE_EVIDENCE_STATUSES = ["ready", "running", "playing", "completed", "unsupported"] as const;
const ROUTE_GATE_CONFIG_TEXT = readFileSync(ROUTE_GATE_CONFIG_PATH, "utf8");
const ROUTE_GATE_CONFIG_HASH = createHash("sha256").update(ROUTE_GATE_CONFIG_TEXT).digest("hex");
const ROUTE_GATE_CONFIG = JSON.parse(ROUTE_GATE_CONFIG_TEXT) as ShowcaseRouteGateConfig;
const ROUTE_FILTER = new Set((process.env.A3D_ROUTE_PRIMARY_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
// `retainedEvidenceFrozen` routes are superseded historical certification records. They stay
// published so their build/deploy/classification gates still run, but a sweep must not rewrite
// their retained probes: doing so churns artifacts and rebinds shared asset evidence to
// screenshots no promoted route reviews. An explicit A3D_ROUTE_PRIMARY_IDS request still runs
// them, so a frozen route can be deliberately refreshed when that is actually intended.
const ROUTES = ROUTE_GATE_CONFIG.routes.filter((route) =>
  route.published &&
  (route.primaryAssets.length > 0 || route.requiresRoutePrimaryProbe === true) &&
  (ROUTE_FILTER.size === 0
    ? route.retainedEvidenceFrozen !== true
    : ROUTE_FILTER.has(route.id))
);
// Targeted runs (A3D_ROUTE_PRIMARY_IDS) retain a distinct summary path so a
// partial artifact can never be read as the full-suite release summary.
const RUN_SCOPE: "full" | "targeted" = ROUTE_FILTER.size === 0 ? "full" : "targeted";

interface ShowcaseRouteGateConfig {
  readonly schema: string;
  readonly routes: readonly ShowcaseRouteGateDefinition[];
}

interface ShowcaseRouteGateDefinition {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
  readonly primaryAssets: readonly string[];
  readonly primaryAssetRoles?: Readonly<Record<string, string>>;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets?: readonly string[];
  readonly primitiveBudget: number;
  readonly requiresTypedPrimaryAssets: boolean;
  readonly requiresRoutePrimaryProbe?: boolean;
  readonly retainedEvidenceFrozen?: boolean;
}

interface RoutePrimaryProbeContext {
  readonly routeId: string;
  readonly routePath: string;
  readonly appId: string;
  readonly sourceHash: string;
  readonly routeGateHash: string;
  readonly rendererFingerprint: string;
  readonly producerFingerprint: string;
  readonly producerId: string;
  readonly producerVersion: string;
  readonly routeHealthHash?: string;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets: readonly string[];
  readonly primaryAssets: readonly {
    readonly id: string;
    readonly role: string;
    readonly expectedTypedRef: string;
    readonly manifestHash?: string;
    readonly routePrimaryEvidenceTarget: boolean;
    readonly evidenceMode: "route-primary-foreground" | "secondary-present";
  }[];
}

interface RoutePrimaryProbeModule {
  createRoutePrimaryProbeContext(route: ShowcaseRouteGateDefinition, root?: string): RoutePrimaryProbeContext;
  readonly routePrimaryProbeThresholds: {
    readonly minNonBlankPixels: number;
    readonly minColorBuckets: number;
    readonly minForegroundWidth: number;
    readonly minForegroundHeight: number;
    readonly minReadabilityScore: number;
  };
  routePrimaryProbeEvidencePath(routeId: string, root?: string): string;
  routePrimaryProbeScreenshotPath(routeId: string, root?: string): string;
  routePrimaryProbeRelativeEvidencePath(routeId: string): string;
  routePrimaryProbeRelativeScreenshotPath(routeId: string): string;
  routePrimaryProbeSummaryPath(runScope: "full" | "targeted", root?: string): string;
  createRoutePrimaryProbeSummary(input: {
    readonly runScope: "full" | "targeted";
    readonly routes: readonly ShowcaseRouteGateDefinition[];
    readonly selectedRouteIds: readonly string[];
    readonly outcomes: readonly ProbeOutcome[];
    readonly routeGateConfig: ShowcaseRouteGateConfig;
    readonly routeGateConfigHash: string;
  }): RoutePrimaryProbeSummary;
}

interface RoutePrimaryProbeSummary {
  readonly schema: string;
  readonly runScope: string;
  readonly summaryPath: string;
  readonly pass: boolean;
  readonly expectedRouteIds: readonly string[];
  readonly executedRouteIds: readonly string[];
  readonly executedRouteCount: number;
  readonly missingRouteIds: readonly string[];
  readonly failingRouteIds: readonly string[];
  readonly blockingRouteIds: readonly string[];
}

interface ProbeOutcome {
  readonly routeId: string;
  readonly pass: boolean;
  readonly failures: readonly string[];
  readonly evidencePath: string;
  readonly screenshotPath: string;
}

type EvidenceRecord = Record<string, unknown>;

interface RendererDiagnostics {
  readonly backend?: string;
  readonly fallback?: string;
  readonly drawCalls?: number;
  readonly renderSize?: readonly number[];
}

interface RendererDiagnosticInput {
  readonly routeEvidence?: EvidenceRecord;
  readonly rootRouteEvidence?: EvidenceRecord;
  readonly canvasRenderSize?: readonly [number, number];
}

interface MountedEvidenceSummary {
  readonly present: boolean;
  readonly status: string;
  readonly evidenceKeys: readonly string[];
  readonly primaryAssets: readonly string[];
  readonly missingPrimaryAssets: readonly string[];
  readonly hasRendererDiagnostics: boolean;
}

interface CompositionProbeMeasurement {
  readonly category: "racing" | "platformer" | "falling-blocks" | "application";
  readonly subjectBounds: PngCrop;
  readonly subjectPixels: number;
  readonly subjectColorBuckets: number;
  readonly subjectClipped: boolean;
  readonly subjectReadabilityScore: number;
  readonly subjectSuppressedScreenshotPath: string;
  readonly subjectSuppressedScreenshotSha256: string;
  /**
   * Play-space and contact geometry are gameplay concepts: they answer "is the
   * car on the road" or "is the character standing on the platform". An
   * application route such as a smart-city dashboard has a hero subject worth
   * measuring but no play space and nothing to stand on, so these are optional
   * rather than forced into a meaningless value.
   */
  readonly projectedPlaySpaceBounds?: PngCrop;
  readonly projectedContactPoint?: { readonly x: number; readonly y: number };
  readonly projectedSubjectHeight?: number;
  readonly subjectTargetSize: number;
  readonly cameraMode: string;
}

test.describe("showcase route-primary probe generation", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("writes retained route-primary probe JSON and screenshots for published typed routes", async ({ page }) => {
    mkdirSync(REPORT_DIR, { recursive: true });
    const routePrimaryProbe = await importRoutePrimaryProbeModule();
    const outcomes: ProbeOutcome[] = [];
    const browserContext = page.context();

    for (const route of ROUTES) {
      const context = routePrimaryProbe.createRoutePrimaryProbeContext(route);
      const routePage = await browserContext.newPage();
      try {
        const outcome = await writeRoutePrimaryProbe(routePage, server, route, context, routePrimaryProbe);
        outcomes.push(outcome);
      } finally {
        await routePage.close();
      }
    }

    const summary = routePrimaryProbe.createRoutePrimaryProbeSummary({
      runScope: RUN_SCOPE,
      routes: ROUTE_GATE_CONFIG.routes,
      selectedRouteIds: ROUTES.map((route) => route.id),
      outcomes,
      routeGateConfig: ROUTE_GATE_CONFIG,
      routeGateConfigHash: ROUTE_GATE_CONFIG_HASH
    });
    writeFileSync(
      routePrimaryProbe.routePrimaryProbeSummaryPath(RUN_SCOPE),
      `${JSON.stringify(summary, null, 2)}\n`
    );

    expect(outcomes.length).toBe(ROUTES.length);
    expect(summary.executedRouteCount, "executed route count").toBe(ROUTES.length);
    expect(summary.missingRouteIds, "selected routes without a retained result").toEqual([]);
    if (RUN_SCOPE === "full") {
      expect(summary.executedRouteIds.slice().sort(), "full run must execute every probe-required route")
        .toEqual(summary.expectedRouteIds.slice().sort());
    }
    for (const outcome of outcomes) {
      expect(existsSync(outcome.evidencePath), `${outcome.routeId} probe JSON`).toBe(true);
      expect(existsSync(outcome.screenshotPath), `${outcome.routeId} probe screenshot`).toBe(true);
      expect(statSync(outcome.screenshotPath).size, `${outcome.routeId} screenshot size`).toBeGreaterThan(0);
      if (outcome.pass) continue;
      expect(outcome.failures.length, `${outcome.routeId} failed route-primary evidence details`).toBeGreaterThan(0);
      expect(routeAllowsFailingProbe(outcome.routeId), `${outcome.routeId} failed while public-ready`).toBe(true);
    }
    // A producer command may not report success while its retained summary is red.
    expect(summary.blockingRouteIds, "routes failing route-primary evidence while still promoted").toEqual([]);
    expect(summary.pass, `retained route-primary summary ${summary.summaryPath} must pass`).toBe(true);
  });
});

async function writeRoutePrimaryProbe(
  page: Page,
  server: ExampleDevServer,
  route: ShowcaseRouteGateDefinition,
  context: RoutePrimaryProbeContext,
  routePrimaryProbe: RoutePrimaryProbeModule
): Promise<ProbeOutcome> {
  const evidencePath = routePrimaryProbe.routePrimaryProbeEvidencePath(route.id);
  const screenshotPath = routePrimaryProbe.routePrimaryProbeScreenshotPath(route.id);
  const relativeEvidencePath = routePrimaryProbe.routePrimaryProbeRelativeEvidencePath(route.id);
  const relativeScreenshotPath = routePrimaryProbe.routePrimaryProbeRelativeScreenshotPath(route.id);
  const suppressedScreenshotPath = resolve(REPORT_DIR, `${route.id}-subject-suppressed.png`);
  const relativeSuppressedScreenshotPath = `tests/reports/showcase-route-primary-probes/${route.id}-subject-suppressed.png`;
  const failures: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  let routeEvidence: EvidenceRecord | undefined;
  let renderer: RendererDiagnostics = {};
  let viewport = { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1 };
  let foreground = emptyForeground();
  let compositionProbe: CompositionProbeMeasurement | undefined;
  let canvasCrop: PngCrop | undefined;
  let analysisCrop: PngCrop | undefined;
  let uiOccluded = false;
  let controlsInViewport = true;
  const thresholds = routePrimaryProbe.routePrimaryProbeThresholds;

  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize(VIEWPORT);
  try {
    const response = await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
    if (!response?.ok()) failures.push(`route-response:${String(response?.status())}`);
    routeEvidence = await waitForMountedRouteEvidence(page, route.globalName);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    canvasCrop = await largestCanvasCrop(page);
    if (!canvasCrop) failures.push("missing-visible-canvas");
    analysisCrop = canvasCrop
      ? route.id === "showcase-product-configurator"
        ? canvasCrop
        : await routePrimaryAnalysisCrop(page, canvasCrop)
      : undefined;
    // Settle an animated subject into its declared neutral pose before anything is captured, so the
    // retained screenshot and the scale-contract measurement taken from it describe the same pose.
    await settleCompositionSubjectPose(page);
    renderer = await waitForRendererDiagnostics(page, route.globalName);
    failures.push(...rendererDiagnosticFailures(renderer));
  } catch (error) {
    failures.push(`route-load:${error instanceof Error ? error.message : String(error)}`);
  }

  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false, scale: "css" });
  const screenshotHash = `sha256-${createHash("sha256").update(screenshot).digest("hex")}`;
  if (canvasCrop) {
    try {
      compositionProbe = await measureCompositionProbe(
        page,
        screenshot,
        canvasCrop,
        canvasCrop,
        suppressedScreenshotPath,
        relativeSuppressedScreenshotPath
      );
      if (compositionProbe) analysisCrop = canvasCrop;
    } catch (error) {
      if (route.id.includes("racing") || route.id.includes("platformer") || route.id.includes("turbo-drift") || route.id.includes("skyline-runner") || route.id.includes("blockfall")) {
        failures.push(`composition-probe:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  try {
    foreground = compositionProbe ? {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      crop: analysisCrop ?? canvasCrop ?? { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      nonBlankPixels: compositionProbe.subjectPixels,
      colorBuckets: compositionProbe.subjectColorBuckets,
      foregroundBounds: compositionProbe.subjectBounds,
      clipped: compositionProbe.subjectClipped,
      nonBackgroundRatio: compositionProbe.subjectPixels / Math.max(1, (analysisCrop?.width ?? canvasCrop?.width ?? VIEWPORT.width) * (analysisCrop?.height ?? canvasCrop?.height ?? VIEWPORT.height)),
      readabilityScore: compositionProbe.subjectReadabilityScore
    } : analyzeForegroundPng(screenshot, analysisCrop);
    if (!foreground.foregroundBounds) failures.push("primary-foreground-missing");
    if (foreground.nonBlankPixels < thresholds.minNonBlankPixels) failures.push(`primary-foreground-too-small:${foreground.nonBlankPixels}`);
    if (foreground.colorBuckets < thresholds.minColorBuckets) failures.push(`primary-color-buckets-too-low:${foreground.colorBuckets}`);
    if (foreground.foregroundBounds && foreground.foregroundBounds.width < thresholds.minForegroundWidth) failures.push(`primary-foreground-width:${foreground.foregroundBounds.width}`);
    if (foreground.foregroundBounds && foreground.foregroundBounds.height < thresholds.minForegroundHeight) failures.push(`primary-foreground-height:${foreground.foregroundBounds.height}`);
    if (foreground.clipped) failures.push("primary-foreground-clipped");
    if (foreground.readabilityScore < thresholds.minReadabilityScore) failures.push(`primary-readability-score:${foreground.readabilityScore}`);
    uiOccluded = foreground.foregroundBounds ? await foregroundOccludedByUi(page, foreground.foregroundBounds) : false;
    if (uiOccluded) failures.push("primary-foreground-occluded-by-ui");
    controlsInViewport = await interactiveControlsInViewport(page);
    if (isPublicGameRouteId(route.id) && !controlsInViewport) failures.push("interactive-controls-outside-viewport");
  } catch (error) {
    failures.push(`screenshot-analysis:${error instanceof Error ? error.message : String(error)}`);
  }

  if (pageErrors.length > 0) failures.push(...pageErrors.map((error) => `page-error:${error}`));
  if (consoleErrors.length > 0) failures.push(...consoleErrors.map((error) => `console-error:${error}`));

  const mountedEvidence = summarizeMountedEvidence(route, routeEvidence);
  if (!mountedEvidence.present) failures.push("mounted-evidence-missing");
  failures.push(...mountedEvidence.missingPrimaryAssets.map((assetId) => `mounted-evidence-missing-primary-asset:${assetId}`));
  const primitivePrimaryCandidates = findPrimitivePrimaryCandidates(route);
  if (primitivePrimaryCandidates.length > 0) {
    failures.push(...primitivePrimaryCandidates.map((candidate) => `primitive-primary-candidate:${candidate}`));
  }

  viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio
  }));

  const pass = failures.length === 0;
  const renderedProbe = {
    screenshotPath: relativeScreenshotPath,
    sha256: screenshotHash,
    width: foreground.width,
    height: foreground.height,
    ...(analysisCrop ? { analysisCrop } : {}),
    nonBlankPixels: foreground.nonBlankPixels,
    colorBuckets: foreground.colorBuckets,
    ...(foreground.foregroundBounds ? { foregroundBounds: foreground.foregroundBounds } : {}),
    visible: Boolean(foreground.foregroundBounds) && foreground.nonBlankPixels >= 2500,
    clipped: foreground.clipped,
    occludedByUi: uiOccluded,
    controlsInViewport,
    readabilityScore: foreground.readabilityScore,
    ...(compositionProbe ? {
      subjectSuppressedScreenshotPath: compositionProbe.subjectSuppressedScreenshotPath,
      subjectSuppressedScreenshotSha256: compositionProbe.subjectSuppressedScreenshotSha256,
      evidenceMethod: "runtime-bound-subject-pixel-difference"
    } : {}),
    failures
  };
  const evidence = {
    schema: "aura3d-route-primary-probe/1.0",
    routeId: route.id,
    routePath: route.path,
    appId: route.id,
    sourceHash: context.sourceHash,
    routeGateHash: context.routeGateHash,
    routePrimaryHeroAsset: context.routePrimaryHeroAsset,
    secondaryPrimaryAssets: context.secondaryPrimaryAssets,
    ...(context.routeHealthHash ? { routeHealthHash: context.routeHealthHash } : {}),
    /*
     * Dependency-bound freshness.
     *
     * The probe already recorded route source, gate config and route-health hashes. It did not record
     * the renderer fingerprint, the producer identity, or the viewport contract -- so a screenshot
     * rendered by different renderer code, or by an older producer, still read as current.
     * `tools/evidence-freshness/explain-staleness.mjs` reported all three as `unbound`, which is what
     * prompted binding them here rather than relying on modification time.
     */
    freshness: {
      schema: "aura3d-evidence-freshness/1.0",
      artifact: `tests/reports/showcase-route-primary-probes/${route.id}.json`,
      producer: {
        id: context.producerId,
        version: context.producerVersion,
        fingerprint: context.producerFingerprint
      },
      generatedAt: new Date().toISOString(),
      dependencies: [
        { kind: "route-source", id: route.id, hash: context.sourceHash },
        { kind: "route-gate-config", id: "route-gates.json", hash: context.routeGateHash },
        ...(context.routeHealthHash
          ? [{ kind: "route-health", id: `${route.id}/route-health.json`, hash: context.routeHealthHash }]
          : []),
        ...context.primaryAssets
          .filter((asset) => asset.manifestHash)
          .map((asset) => ({ kind: "primary-asset", id: asset.id, hash: asset.manifestHash as string })),
        { kind: "renderer-fingerprint", id: "agent-api+assets", hash: context.rendererFingerprint },
        { kind: "producer-version", id: context.producerId, hash: context.producerFingerprint },
        { kind: "viewport-contract", id: route.id, hash: createConfigFingerprint(viewport) }
      ].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)))
    },
    generatedAt: new Date().toISOString(),
    viewport,
    mountedEvidence,
    renderer,
    renderedProbe,
    ...(compositionProbe ? { compositionProbe } : {}),
    primaryAssets: context.primaryAssets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      expectedTypedRef: asset.expectedTypedRef,
      routePrimaryEvidenceTarget: asset.routePrimaryEvidenceTarget,
      evidenceMode: asset.evidenceMode,
      ...(asset.manifestHash ? { manifestHash: asset.manifestHash } : {}),
      ...(asset.routePrimaryEvidenceTarget ? { renderedProbe } : {})
    })),
    primitivePrimaryCandidates,
    pass,
    failures
  };

  // Atomic: a half-written probe JSON parses as garbage while looking like evidence.
  writeJsonArtifactAtomically(evidencePath, evidence);
  return {
    routeId: route.id,
    pass,
    failures,
    evidencePath: relativeEvidencePath,
    screenshotPath: relativeScreenshotPath
  };
}


/**
 * Ask the route to put its composition subject into the neutral pose its `targetSize` describes.
 *
 * No-op for routes that do not implement it, which is every route with a static subject.
 */
async function settleCompositionSubjectPose(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: { settleSubjectPose?: () => unknown } })
      .__AURA3D_COMPOSITION_PROBE__;
    probe?.settleSubjectPose?.();
  });
}

async function measureCompositionProbe(
  page: Page,
  visibleScreenshot: Buffer,
  canvasCrop: PngCrop,
  analysisCrop: PngCrop,
  suppressedScreenshotPath: string,
  relativeSuppressedScreenshotPath: string
): Promise<CompositionProbeMeasurement | undefined> {
  const raw = await page.evaluate(() => {
    const probe = (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: {
      category?: unknown;
      camera?: unknown;
      subject?: unknown;
      playSpacePoints?: unknown;
      contactPoint?: unknown;
      setSubjectSuppressed?: (suppressed: boolean) => unknown;
      settleSubjectPose?: () => unknown;
    } }).__AURA3D_COMPOSITION_PROBE__;
    if (!probe || typeof probe.setSubjectSuppressed !== "function") return undefined;
    /*
     * Settle an animated subject into its declared pose before measuring.
     *
     * The scale-contract check compares the subject's *measured* pixel height against the height projected
     * from `subject.targetSize`. When the route animates its subject through a scale cycle, those two
     * quantities describe different things: Skyline's hero locomotion applies `1 +/- 0.14`, a 28%
     * peak-to-peak swing, so the measured height varied 119-154px across four consecutive captures and
     * `scaleDelta` straddled the 0.18 threshold -- one run legitimately failed while nothing about the
     * route had changed.
     *
     * That is the gate measuring animation phase rather than scale correctness. `settleSubjectPose` lets a
     * route put its subject into the neutral pose its `targetSize` actually describes. It is optional, so
     * routes with a static subject are unaffected, and it is the route's own code that decides what
     * "neutral" means -- this spec cannot know.
     *
     * Deliberately *not* solved by widening the threshold: that would have hidden a real contract
     * mismatch and weakened the check for every route, including ones whose subject does not animate.
     *
     * Invoked before the primary screenshot (see `settleCompositionSubjectPose`), so the retained image and
     * every measurement taken from it describe the same pose.
     */
    return {
      category: probe.category,
      camera: probe.camera,
      subject: probe.subject,
      playSpacePoints: probe.playSpacePoints,
      contactPoint: probe.contactPoint
    };
  });
  if (!raw) return undefined;
  if (raw.category !== "racing" && raw.category !== "platformer" && raw.category !== "falling-blocks" && raw.category !== "application") {
    throw new Error("invalid-category");
  }
  /*
   * A route-primary probe answers "is the hero asset legible in frame". Doing
   * that honestly requires isolating the hero from its surroundings, which is
   * what subject suppression achieves: screenshot with the subject, screenshot
   * without it, and the difference is the subject.
   *
   * Without a probe the spec falls back to `analyzeForegroundPng`, which treats
   * every non-background pixel as foreground. For a full-bleed scene -- a city,
   * a particle field -- that necessarily returns bounds equal to the whole crop
   * and therefore reports `clipped`, because the bounds touch all four edges.
   * That is an artefact of the measurement, not a defect in the route, and it
   * cannot be fixed by changing the scene without making the scene worse.
   *
   * Application routes are admitted here so a non-game route can supply the same
   * subject isolation. They are not required to describe play space or a ground
   * contact point, because those are gameplay properties that do not exist for a
   * dashboard or configurator.
   */
  const isApplicationSubject = raw.category === "application";
  const subject = readCompositionSubject(raw.subject);
  /*
   * Camera projection is optional for an application subject.
   *
   * Projection exists to check gameplay geometry -- that the car sits on the road,
   * that the character's feet meet the platform -- and it needs a single static eye
   * position to do that. An application route may legitimately use an animated
   * camera (`camera.dolly` interpolates `from`/`to` and exposes no fixed
   * `position`), so demanding one would either exclude such routes or force the
   * route to restate the renderer's camera-animation maths in its probe, where it
   * would silently drift from the real camera.
   *
   * The value this probe adds for an application route is subject *isolation*:
   * suppress the hero, diff the frames, measure the hero alone. That needs no
   * camera. So when no static camera is available here, the probe reports the
   * subject measurements and simply omits the projected quantities rather than
   * inventing a camera it cannot verify.
   */
  const cameraRecord = isEvidenceRecord(raw.camera) ? raw.camera : undefined;
  const camera = isApplicationSubject && (!cameraRecord || !cameraRecord.position)
    ? undefined
    : readCompositionCamera(raw.camera);
  const playSpacePoints = isApplicationSubject && raw.playSpacePoints === undefined
    ? []
    : readVec3Array(raw.playSpacePoints, "play-space-points");
  const contactPoint = isApplicationSubject && raw.contactPoint === undefined
    ? undefined
    : readVec3(raw.contactPoint, "contact-point");
  if (!isApplicationSubject && playSpacePoints.length < 2) throw new Error("insufficient-play-space-points");

  await page.evaluate(() => {
    const probe = (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: { setSubjectSuppressed?: (suppressed: boolean) => unknown } }).__AURA3D_COMPOSITION_PROBE__;
    probe?.setSubjectSuppressed?.(true);
  });
  const hiddenScreenshot = await page.screenshot({ path: suppressedScreenshotPath, fullPage: false, scale: "css" });
  await page.evaluate(() => {
    const probe = (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: { setSubjectSuppressed?: (suppressed: boolean) => unknown } }).__AURA3D_COMPOSITION_PROBE__;
    probe?.setSubjectSuppressed?.(false);
  });

  const difference = analyzePngDifferenceBounds(visibleScreenshot, hiddenScreenshot, analysisCrop);
  if (!difference.bounds || difference.changedPixels < 20) throw new Error(`subject-difference-too-small:${difference.changedPixels}`);
  const resolvedCamera = camera ? resolveCompositionCamera(camera, subject) : undefined;
  const projectedPoints = resolvedCamera
    ? playSpacePoints
      .map((point) => projectScenePoint(point, resolvedCamera, canvasCrop))
      .filter((point): point is { x: number; y: number } => Boolean(point))
    : [];
  const projectedContactPoint = resolvedCamera && contactPoint ? projectScenePoint(contactPoint, resolvedCamera, canvasCrop) : undefined;
  const projectedSubjectTop = resolvedCamera
    ? projectScenePoint(addVec3(subject.position, [0, subject.targetSize / 2, 0]), resolvedCamera, canvasCrop)
    : undefined;
  const projectedSubjectBottom = resolvedCamera
    ? projectScenePoint(addVec3(subject.position, [0, -subject.targetSize / 2, 0]), resolvedCamera, canvasCrop)
    : undefined;
  // Where a camera is available the subject's own projection must resolve: that is
  // what ties the measured silhouette to the declared subject. Play-space and
  // contact projections are only required where they are meaningful.
  if (resolvedCamera && (!projectedSubjectTop || !projectedSubjectBottom)) {
    throw new Error("camera-projection-failed");
  }
  if (!isApplicationSubject && (projectedPoints.length < 2 || !projectedContactPoint)) {
    throw new Error("camera-projection-failed");
  }
  const projectedSubjectHeight = projectedSubjectTop && projectedSubjectBottom
    ? Number(Math.abs(projectedSubjectBottom.y - projectedSubjectTop.y).toFixed(3))
    : undefined;
  if (projectedSubjectHeight !== undefined && projectedSubjectHeight <= 0) throw new Error("subject-scale-projection-failed");
  return {
    category: raw.category,
    subjectBounds: difference.bounds,
    subjectPixels: difference.changedPixels,
    subjectColorBuckets: difference.colorBuckets,
    subjectClipped: difference.clipped,
    subjectReadabilityScore: difference.readabilityScore,
    subjectSuppressedScreenshotPath: relativeSuppressedScreenshotPath,
    subjectSuppressedScreenshotSha256: `sha256-${createHash("sha256").update(hiddenScreenshot).digest("hex")}`,
    ...(projectedPoints.length >= 2 ? { projectedPlaySpaceBounds: boundsForProjectedPoints(projectedPoints, canvasCrop) } : {}),
    ...(projectedContactPoint ? { projectedContactPoint } : {}),
    ...(projectedSubjectHeight !== undefined ? { projectedSubjectHeight } : {}),
    subjectTargetSize: subject.targetSize,
    cameraMode: camera?.mode ?? "unprojected"
  };
}

interface CompositionCamera extends CompositionCameraProjectionInput {
  readonly mode: string;
  readonly position?: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly offset?: readonly [number, number, number];
  readonly targetOffset?: readonly [number, number, number];
  readonly offsetMode?: string;
  readonly fov: number;
}

interface CompositionSubject {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly targetSize: number;
}

function readCompositionCamera(value: unknown): CompositionCamera {
  if (!isEvidenceRecord(value)) throw new Error("camera-missing");
  return {
    mode: typeof value.mode === "string" ? value.mode : "missing",
    ...(value.position ? { position: readVec3(value.position, "camera-position") } : {}),
    target: readVec3(value.target, "camera-target"),
    ...(value.offset ? { offset: readVec3(value.offset, "camera-offset") } : {}),
    ...(value.targetOffset ? { targetOffset: readVec3(value.targetOffset, "camera-target-offset") } : {}),
    ...(typeof value.offsetMode === "string" ? { offsetMode: value.offsetMode } : {}),
    fov: typeof value.fov === "number" && Number.isFinite(value.fov) ? value.fov : 42
  };
}

function readCompositionSubject(value: unknown): CompositionSubject {
  if (!isEvidenceRecord(value)) throw new Error("subject-missing");
  const targetSize = value.targetSize;
  if (typeof targetSize !== "number" || !Number.isFinite(targetSize) || targetSize <= 0) throw new Error("subject-target-size");
  return {
    position: readVec3(value.position, "subject-position"),
    rotation: readVec3(value.rotation, "subject-rotation"),
    targetSize
  };
}

function boundsForProjectedPoints(points: readonly { readonly x: number; readonly y: number }[], crop: PngCrop): PngCrop {
  const minX = Math.max(crop.x, Math.floor(Math.min(...points.map((point) => point.x))));
  const minY = Math.max(crop.y, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxX = Math.min(crop.x + crop.width, Math.ceil(Math.max(...points.map((point) => point.x))));
  const maxY = Math.min(crop.y + crop.height, Math.ceil(Math.max(...points.map((point) => point.y))));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function readVec3Array(value: unknown, label: string): readonly (readonly [number, number, number])[] {
  if (!Array.isArray(value)) throw new Error(`${label}-missing`);
  return value.map((entry, index) => readVec3(entry, `${label}-${index}`));
}

function readVec3(value: unknown, label: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`${label}-invalid`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}
function isEvidenceRecord(value: unknown): value is EvidenceRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function addVec3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

async function importRoutePrimaryProbeModule(): Promise<RoutePrimaryProbeModule> {
  return await import(pathToFileURL(resolve("tools/showcase-library/route-primary-probes.mjs")).href) as RoutePrimaryProbeModule;
}

async function waitForMountedRouteEvidence(page: Page, globalName: string): Promise<EvidenceRecord> {
  await page.waitForFunction((input) => {
    const { name, statuses } = input as { name: string; statuses: readonly string[] };
    const evidence = (window as unknown as Record<string, EvidenceRecord | undefined>)[name];
    if (!evidence) return false;
    const status = typeof evidence.status === "string" ? evidence.status : "";
    return statuses.includes(status);
  }, { name: globalName, statuses: ACCEPTED_ROUTE_EVIDENCE_STATUSES }, { timeout: EVIDENCE_TIMEOUT_MS });
  return page.evaluate((name) => {
    return (window as unknown as Record<string, EvidenceRecord>)[name as string];
  }, globalName);
}

function summarizeMountedEvidence(route: ShowcaseRouteGateDefinition, evidence: EvidenceRecord | undefined): MountedEvidenceSummary {
  const evidenceText = JSON.stringify(evidence ?? {});
  const primaryAssets = route.primaryAssets.filter((assetId) =>
    evidenceText.includes(`assets.${assetId}`) || evidenceText.includes(`"id":"${assetId}"`)
  );
  return {
    present: Boolean(evidence),
    status: typeof evidence?.status === "string" ? evidence.status : "missing",
    evidenceKeys: evidence ? Object.keys(evidence).sort() : [],
    primaryAssets,
    missingPrimaryAssets: route.primaryAssets.filter((assetId) => !primaryAssets.includes(assetId)),
    hasRendererDiagnostics: /"drawCalls"\s*:\s*\d+/.test(evidenceText) || /"renderSize"\s*:/.test(evidenceText)
  };
}

async function waitForRendererDiagnostics(page: Page, globalName: string): Promise<RendererDiagnostics> {
  await page.waitForFunction((name) => {
    const evidence = (window as unknown as Record<string, unknown>)[name as string];
    const rootEvidence = (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__;
    const text = JSON.stringify([evidence, rootEvidence]);
    const hasDrawCalls = /"drawCalls"\s*:\s*[1-9]/.test(text);
    const canvas = Array.from(document.querySelectorAll("canvas"))
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return { width: candidate.width, height: candidate.height, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
      })
      .filter((candidate) => candidate.width > 0 && candidate.height > 0)
      .sort((left, right) => right.area - left.area)[0];
    return hasDrawCalls && Boolean(canvas);
  }, globalName, { timeout: 3_000 })
    .catch(() => undefined);

  return extractRendererDiagnostics(await readRendererDiagnosticInput(page, globalName));
}

async function readRendererDiagnosticInput(page: Page, globalName: string): Promise<RendererDiagnosticInput> {
  return page.evaluate((name) => {
    const routeEvidence = (window as unknown as Record<string, EvidenceRecord | undefined>)[name as string];
    const rootRouteEvidence = (window as unknown as { __AURA3D_ROUTE_READY__?: EvidenceRecord }).__AURA3D_ROUTE_READY__;
    const canvas = Array.from(document.querySelectorAll("canvas"))
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return {
          renderSize: [candidate.width, candidate.height] as const,
          area: Math.max(0, rect.width) * Math.max(0, rect.height)
        };
      })
      .filter((candidate) => candidate.renderSize[0] > 0 && candidate.renderSize[1] > 0)
      .sort((left, right) => right.area - left.area)[0];
    return {
      ...(routeEvidence ? { routeEvidence } : {}),
      ...(rootRouteEvidence ? { rootRouteEvidence } : {}),
      ...(canvas ? { canvasRenderSize: canvas.renderSize } : {})
    };
  }, globalName);
}

async function largestCanvasCrop(page: Page): Promise<PngCrop | undefined> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(rect.left)),
          y: Math.max(0, Math.floor(rect.top)),
          width: Math.max(0, Math.floor(Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)))),
          height: Math.max(0, Math.floor(Math.min(rect.height, window.innerHeight - Math.max(0, rect.top)))),
          area: Math.max(0, rect.width) * Math.max(0, rect.height)
        };
      })
      .filter((rect) => rect.width >= 80 && rect.height >= 80)
      .sort((a, b) => b.area - a.area);
    return candidates[0];
  });
}

async function routePrimaryAnalysisCrop(page: Page, canvasCrop: PngCrop): Promise<PngCrop> {
  return page.evaluate(({ crop, selector }) => {
    type Rect = { x: number; y: number; width: number; height: number };
    const viewport: Rect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const area = (rect: Rect) => Math.max(0, rect.width) * Math.max(0, rect.height);
    const normalize = (rect: Rect): Rect => {
      const x = Math.max(0, Math.floor(rect.x));
      const y = Math.max(0, Math.floor(rect.y));
      return {
        x,
        y,
        width: Math.max(0, Math.floor(Math.min(rect.x + rect.width, viewport.width) - x)),
        height: Math.max(0, Math.floor(Math.min(rect.y + rect.height, viewport.height) - y))
      };
    };
    const intersect = (left: Rect, right: Rect) => {
      const x = Math.max(left.x, right.x);
      const y = Math.max(left.y, right.y);
      const width = Math.min(left.x + left.width, right.x + right.width) - x;
      const height = Math.min(left.y + left.height, right.y + right.height) - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
    };
    const usable = (rect: Rect) => rect.width >= 180 && rect.height >= 140;
    const blockers = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.querySelector("canvas") && rect.width >= 2 && rect.height >= 2 &&
          style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01 &&
          // Transparent full-viewport layout wrappers are not visual blockers;
          // their painted child cards are discovered independently.
          style.pointerEvents !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return normalize({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      })
      .filter((rect) => area(rect) > 0 && Boolean(intersect(crop, rect)));
    let candidates: Rect[] = [normalize(crop)];
    for (const blocker of blockers) {
      const next: Rect[] = [];
      for (const candidate of candidates) {
        if (!intersect(candidate, blocker)) {
          next.push(candidate);
          continue;
        }
        const slices = [
          { x: candidate.x, y: candidate.y, width: blocker.x - candidate.x, height: candidate.height },
          { x: blocker.x + blocker.width, y: candidate.y, width: candidate.x + candidate.width - blocker.x - blocker.width, height: candidate.height },
          { x: candidate.x, y: candidate.y, width: candidate.width, height: blocker.y - candidate.y },
          { x: candidate.x, y: blocker.y + blocker.height, width: candidate.width, height: candidate.y + candidate.height - blocker.y - blocker.height }
        ].map(normalize).filter(usable);
        next.push(...slices);
      }
      if (next.length > 0) candidates = next.sort((left, right) => area(right) - area(left)).slice(0, 32);
    }
    const selected = candidates.sort((left, right) => area(right) - area(left))[0] ?? normalize(crop);
    const inset = Math.max(0, Math.min(10, Math.floor((selected.width - 180) / 2), Math.floor((selected.height - 140) / 2)));
    return {
      x: selected.x + inset,
      y: selected.y + inset,
      width: selected.width - inset * 2,
      height: selected.height - inset * 2
    };
  }, { crop: canvasCrop, selector: UI_EVIDENCE_SELECTOR });
}

async function foregroundOccludedByUi(page: Page, foregroundBounds: PngCrop): Promise<boolean> {
  return page.evaluate(({ bounds, selector }) => {
    const foregroundArea = Math.max(1, bounds.width * bounds.height);
    const isVisible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01 &&
        // Full-screen HUD layout wrappers (for example `#panel`) often have
        // pointer-events:none and paint nothing themselves; only their child
        // cards are interactive/visible. Counting the transparent wrapper as
        // an occluder makes every subject inside the viewport look covered.
        style.pointerEvents !== "none";
    };
    const intersectionArea = (rect: DOMRect): number => {
      const width = Math.max(0, Math.min(bounds.x + bounds.width, rect.right) - Math.max(bounds.x, rect.left));
      const height = Math.max(0, Math.min(bounds.y + bounds.height, rect.bottom) - Math.max(bounds.y, rect.top));
      return width * height;
    };
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => !element.querySelector("canvas") && isVisible(element))
      .some((element) => intersectionArea(element.getBoundingClientRect()) / foregroundArea > 0.08);
  }, { bounds: foregroundBounds, selector: UI_EVIDENCE_SELECTOR });
}

async function interactiveControlsInViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [role='button'], input:not([type='hidden']), select"
    )).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    });
    return controls.every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 &&
        rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
  });
}

function isPublicGameRouteId(routeId: string): boolean {
  return routeId.includes("blockfall") || routeId.includes("turbo-drift") ||
    routeId.includes("skyline-runner") || routeId.includes("racing") ||
    routeId.includes("platformer");
}

function findPrimitivePrimaryCandidates(route: ShowcaseRouteGateDefinition): readonly string[] {
  const sourceText = readRouteSourceText(route.id);
  const candidates: string[] = [];
  const primaryWords = /(hero|primary|player|runner|character|car|vehicle|track|world|product|subject|main)/i;
  for (const match of sourceText.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)[\s\S]{0,160}?primitives\.([A-Za-z_]+)\s*\(/g)) {
    const name = match[1] ?? "";
    const primitive = match[2] ?? "primitive";
    if (primaryWords.test(name)) candidates.push(`${name}:${primitive}`);
  }
  if (route.requiresTypedPrimaryAssets) {
    for (const assetId of route.primaryAssets) {
      if (!sourceText.includes(`assets.${assetId}`)) candidates.push(`missing-typed-primary:${assetId}`);
    }
  }
  return Array.from(new Set(candidates)).sort();
}

function readRouteSourceText(routeId: string): string {
  const appDir = resolve("apps", routeId);
  if (!existsSync(appDir)) return "";
  return walkFiles(appDir)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function routeAllowsFailingProbe(routeId: string): boolean {
  const healthPath = resolve("apps", routeId, "route-health.json");
  if (!existsSync(healthPath)) return false;
  const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
    readonly classification?: string;
    readonly publicShowcase?: boolean;
    readonly promotionStatus?: string;
  };
  const classification = String(health.classification ?? "").toLowerCase();
  const promotionStatus = String(health.promotionStatus ?? "").toLowerCase();
  if (health.publicShowcase === false) return true;
  return /blocked|prototype|diagnostic|internal|removed/.test(classification) ||
    /blocked|prototype|diagnostic|internal|removed/.test(promotionStatus);
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function extractRendererDiagnostics(input: RendererDiagnosticInput): RendererDiagnostics {
  const found = findRendererValues(input, 0);
  return {
    ...(found.backend ? { backend: found.backend } : {}),
    ...(found.fallback ? { fallback: found.fallback } : {}),
    ...(typeof found.drawCalls === "number" ? { drawCalls: found.drawCalls } : {}),
    ...(found.renderSize ? { renderSize: found.renderSize } : input.canvasRenderSize ? { renderSize: input.canvasRenderSize } : {})
  };
}

function rendererDiagnosticFailures(renderer: RendererDiagnostics): readonly string[] {
  const failures: string[] = [];
  if (!Number.isInteger(renderer.drawCalls) || (renderer.drawCalls ?? 0) <= 0) {
    failures.push(`renderer-draw-calls:${String(renderer.drawCalls)}`);
  }
  const renderSize = renderer.renderSize;
  if (!Array.isArray(renderSize) ||
      !Number.isInteger(renderSize[0]) ||
      !Number.isInteger(renderSize[1]) ||
      (renderSize[0] ?? 0) <= 0 ||
      (renderSize[1] ?? 0) <= 0) {
    failures.push("renderer-render-size");
  }
  return failures;
}

function findRendererValues(value: unknown, depth: number): {
  backend?: string;
  fallback?: string;
  drawCalls?: number;
  renderSize?: readonly number[];
} {
  if (!value || typeof value !== "object" || depth > 8) return {};
  const record = value as Record<string, unknown>;
  const current = {
    backend: typeof record.backend === "string" ? record.backend : undefined,
    fallback: typeof record.fallback === "string" ? record.fallback : undefined,
    drawCalls: typeof record.drawCalls === "number" ? record.drawCalls : undefined,
    renderSize: Array.isArray(record.renderSize) && record.renderSize.every((entry) => typeof entry === "number")
      ? record.renderSize as readonly number[]
      : undefined
  };
  for (const child of Object.values(record)) {
    const found = findRendererValues(child, depth + 1);
    current.backend ??= found.backend;
    current.fallback ??= found.fallback;
    current.drawCalls = chooseRendererDrawCalls(current.drawCalls, found.drawCalls);
    current.renderSize = chooseRenderSize(current.renderSize, found.renderSize);
  }
  return current;
}

function chooseRendererDrawCalls(current: number | undefined, candidate: number | undefined): number | undefined {
  if (candidate === undefined) return current;
  if (current === undefined) return candidate;
  if (current <= 0 && candidate > 0) return candidate;
  return current;
}

function chooseRenderSize(current: readonly number[] | undefined, candidate: readonly number[] | undefined): readonly number[] | undefined {
  if (!isPositiveRenderSize(candidate)) return current;
  return isPositiveRenderSize(current) ? current : candidate;
}

function isPositiveRenderSize(value: readonly number[] | undefined): boolean {
  return Array.isArray(value) &&
    Number.isInteger(value[0]) &&
    Number.isInteger(value[1]) &&
    (value[0] ?? 0) > 0 &&
    (value[1] ?? 0) > 0;
}

function emptyForeground() {
  return {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    crop: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    nonBlankPixels: 0,
    colorBuckets: 0,
    clipped: false,
    nonBackgroundRatio: 0,
    readabilityScore: 0
  };
}
