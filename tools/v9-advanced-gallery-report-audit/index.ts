import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMOS } from "../../apps/v9-advanced-examples-gallery/src/metadata";

type ReviewStatus = "failed" | "candidate" | "accepted" | "hero" | string;

interface RouteReport {
  readonly schema?: string;
  readonly capturedAt?: string;
  readonly evidenceMode?: string;
  readonly evidenceScope?: {
    readonly mode?: string;
    readonly fullGalleryRun?: boolean;
    readonly focusedRouteOnly?: boolean;
    readonly expectedRouteCount?: number;
  };
  readonly visualReviewStatus?: ReviewStatus;
  readonly performanceEvidence?: {
    readonly source?: string;
    readonly measuredFields?: readonly string[];
    readonly acceptanceUsesRafFrameMs?: boolean;
    readonly loopWithinBudget?: boolean;
    readonly renderWithinBudget?: boolean;
  };
  readonly rendererEnvironmentFogEvidence?: unknown;
  readonly rendererEnvironmentBackgroundEvidence?: unknown;
  readonly rendererEnvironmentLightingEvidence?: unknown;
  readonly rendererEnvironmentBackgroundVisualDeltaEvidence?: {
    readonly source?: string;
    readonly rendererSource?: string;
    readonly changedRatio?: number;
    readonly meanDelta?: number;
    readonly minimumChangedRatio?: number;
    readonly minimumMeanDelta?: number;
    readonly passed?: boolean;
    readonly backgroundOnScreenshot?: { readonly path?: string; readonly sha256?: string; readonly sizeBytes?: number };
    readonly backgroundOffScreenshot?: { readonly path?: string; readonly sha256?: string; readonly sizeBytes?: number };
  };
  readonly rendererFogVisualDeltaEvidence?: {
    readonly source?: string;
    readonly rendererSource?: string;
    readonly changedRatio?: number;
    readonly meanDelta?: number;
    readonly minimumChangedRatio?: number;
    readonly minimumMeanDelta?: number;
    readonly passed?: boolean;
    readonly fogOnScreenshot?: { readonly path?: string; readonly sha256?: string; readonly sizeBytes?: number };
    readonly fogOffScreenshot?: { readonly path?: string; readonly sha256?: string; readonly sizeBytes?: number };
  };
  readonly runtime?: {
    readonly status?: string;
    readonly objectCount?: number;
    readonly instanceCount?: number;
    readonly drawCalls?: number;
    readonly systems?: readonly string[];
    readonly approximations?: readonly string[];
    readonly timings?: {
      readonly renderMs?: number;
      readonly totalLoopMs?: number;
      readonly authoredLoadMs?: number;
    };
    readonly authoredAsset?: AuthoredEvidence;
    readonly waterTelemetry?: unknown;
    readonly dataGalaxyEvidence?: DataGalaxyEvidence;
    readonly postprocessDiagnostics?: unknown;
  };
  readonly dataGalaxyEvidence?: DataGalaxyEvidence;
  readonly authored?: AuthoredEvidence;
  readonly motion?: {
    readonly changedRatio?: number;
    readonly meanDelta?: number;
  };
  readonly captureReadiness?: Record<string, {
    readonly frameCount?: number;
    readonly runtimeStatus?: string;
    readonly drawCalls?: number;
    readonly canvasWidth?: number;
    readonly canvasHeight?: number;
  }>;
  readonly screenshots?: Record<string, {
    readonly path?: string;
    readonly sha256?: string;
    readonly sizeBytes?: number;
  }>;
  readonly screenshotSha256?: string;
  readonly viewportScreenshotSha256?: string;
  readonly heroScreenshotSha256?: string;
  readonly pngStats?: {
    readonly width?: number;
    readonly height?: number;
    readonly uniqueColorBuckets?: number;
    readonly foregroundCoverage?: number;
    readonly centerForegroundCoverage?: number;
    readonly detailEdgeDensity?: number;
    readonly localContrast?: number;
  };
}

interface AuthoredEvidence {
  readonly status?: string;
  readonly assetIds?: readonly string[];
  readonly assets?: readonly string[];
  readonly drawItems?: number;
  readonly animations?: number;
  readonly animatedAssets?: number;
  readonly clips?: readonly string[];
  readonly errors?: readonly string[];
  readonly materialVariants?: readonly {
    readonly assetId?: string;
    readonly selected?: string;
    readonly available?: readonly string[];
  }[];
  readonly animationDiagnostics?: readonly {
    readonly assetId?: string;
    readonly clip?: string;
    readonly tracksApplied?: number;
    readonly skinningPalettesUpdated?: number;
  }[];
  readonly materialDiagnostics?: readonly {
      readonly assetId?: string;
      readonly drawItems?: number;
      readonly materialCount?: number;
      readonly textureCount?: number;
      readonly fallbackWhiteDrawItems?: number;
      readonly missingGeometryDrawItems?: number;
      readonly missingMaterialDrawItems?: number;
      readonly renderableBindingCount?: number;
      readonly materialOverrideTargetCount?: number;
      readonly materialOverrideSource?: string;
      readonly materialControlTargetCount?: number;
      readonly materialControlUniqueMaterialCount?: number;
      readonly materialControlSource?: string;
      readonly materialControlSelectedVariant?: string;
      readonly materialControlControlKey?: string;
      readonly texturedDrawItems?: number;
      readonly textureBackedMaterialNames?: readonly string[];
      readonly shaderInactiveTextureSlotDiagnostics?: readonly {
        readonly slot?: string;
        readonly drawItems?: number;
        readonly materialNames?: readonly string[];
        readonly labels?: readonly string[];
      }[];
    }[];
  readonly assetProvenance?: readonly {
    readonly assetId?: string;
    readonly sourceKind?: string;
    readonly manifestPath?: string;
    readonly sourceScript?: string;
    readonly sourceAssetPath?: string;
    readonly generated?: boolean;
    readonly derivative?: boolean;
    readonly supportOnly?: boolean;
    readonly acceptableAsFocalHero?: boolean;
    readonly textureBacked?: boolean;
    readonly generatedNoTexture?: boolean;
  }[];
}

interface DataGalaxyEvidence {
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
    readonly pointDrawBatches?: number;
    readonly lineSegmentCount?: number;
    readonly lineDrawBatches?: number;
    readonly drawBatches?: number;
  };
  readonly focalHierarchy?: {
    readonly centralSubject?: string;
    readonly primaryLayerRole?: string;
    readonly supportLayerRole?: string;
    readonly authoredGlbRole?: string;
  };
  readonly authoredAssetDisclosure?: {
    readonly activeGeneratedAssetIds?: readonly string[];
    readonly generatedNoTextureAuthoredGlb?: boolean;
    readonly premiumTextureBackedAuthoredHero?: boolean;
    readonly supportOnlyUntilVisualReview?: boolean;
  };
  readonly unsupportedGaps?: readonly string[];
  readonly integrationSteps?: readonly string[];
}

interface RouteAudit {
  readonly routeId: string;
  readonly reportPath: string;
  readonly capturedAt?: string;
  readonly evidenceMode?: string;
  readonly fullGalleryEvidence: boolean;
  readonly visualReviewStatus?: ReviewStatus;
  readonly reportPresent: boolean;
  readonly statusDoesNotClaimAcceptance: boolean;
  readonly reusableSystemsCount: number;
  readonly reusableSystems: readonly string[];
  readonly unsupportedDisclosureCount: number;
  readonly unsupportedDisclosures: readonly string[];
  readonly disclosureKeywords: readonly string[];
  readonly telemetry: {
    readonly hasMeasuredPerformanceEvidence: boolean;
    readonly doesNotUseRafAsAcceptance: boolean;
    readonly hasRuntimeWorkTimings: boolean;
    readonly hasMotionEvidence: boolean;
    readonly hasCaptureReadiness: boolean;
    readonly hasScreenshotHashes: boolean;
    readonly hasCurrentScreenshotArtifacts: boolean;
    readonly hasImageStats: boolean;
  };
  readonly authored: {
    readonly status?: string;
    readonly assetCount: number;
    readonly drawItems?: number;
    readonly clipCount: number;
    readonly animationTracksApplied: number;
    readonly skinningPalettesUpdated: number;
    readonly materialDiagnosticCount: number;
    readonly fallbackWhiteDrawItems: number;
    readonly missingResourceDrawItems: number;
    readonly textureBackedDrawItems: number;
    readonly textureBackedAssetCount: number;
  };
  readonly specializedEvidence: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

interface AuditReport {
  readonly schema: "g3d-v9-advanced-gallery-report-disclosure-audit/v1";
  readonly generatedAt: string;
  readonly sourceDir: string;
  readonly outputPath: string;
  readonly acceptanceGateMutation: false;
  readonly thresholdMutation: false;
  readonly marksRoutesAccepted: false;
  readonly visualReview?: VisualReviewSummary;
  readonly summary: {
    readonly expectedRouteReports: number;
    readonly presentRouteReports: number;
    readonly routeReports: number;
    readonly missingRouteReports: number;
    readonly unexpectedRouteReports: number;
    readonly nonAcceptedRoutes: number;
    readonly routesWithReusableSystems: number;
    readonly routesWithUnsupportedDisclosure: number;
    readonly routesWithMeasuredPerformanceEvidence: number;
    readonly routesWithScreenshotHashes: number;
    readonly routesWithCurrentScreenshotArtifacts: number;
    readonly routesWithImageStats: number;
    readonly blockers: number;
    readonly warnings: number;
  };
  readonly routeAudits: readonly RouteAudit[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

interface VisualReviewSummary {
  readonly reportPath: string;
  readonly reportPresent: boolean;
  readonly releaseGate?: string;
  readonly pass?: boolean;
  readonly demoCount?: number;
  readonly acceptedCount?: number;
  readonly candidateCount?: number;
  readonly failedCount?: number;
  readonly blockedCount?: number;
  readonly imageQualityPassingCount?: number;
  readonly requiresHumanAcceptedMetadata?: boolean;
  readonly requiresAcceptedImageQualityThresholds?: boolean;
  readonly contactSheetSha256?: string;
  readonly contactSheetSourceSetSha256?: string;
  readonly contactSheetGeneratedAt?: string;
  readonly humanAcceptanceStillBlocksRelease: boolean;
}

const defaultReportDir = "tests/reports/v9/advanced-examples-gallery";
let reportDir = defaultReportDir;
let outputPath = join(defaultReportDir, "reusable-systems-disclosure-audit.json");
let visualReviewReportPath = join(defaultReportDir, "visual-review-report.json");
let assetRoot = ".";
const expectedRouteIds = DEMOS.map((demo) => demo.id).sort();
const disclosurePattern = /\b(approximation|approximations|unsupported|not|no|without|missing|proxy|bounded|candidate|failed|does not|do not|cannot|still|remain|remains|gap|gaps|limitation|limitations|not connected|not enabled|not used|not claimed|not claim)\b/i;
const screenshotHashPattern = /^[a-f0-9]{64}$/;
const generatedAssetManifestRequirements = [
  {
    routeId: "product-configurator",
    id: "product-configurator-studio-blender",
    manifestPath: "fixtures/v9/assets/product-configurator-studio-blender/manifest.json",
    outputKey: "glb",
    expectedOutputPath: "fixtures/v9/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb",
    expectedSourceScript: "tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py",
    requireGeneratedNoTexture: true,
    requireDerivative: false,
    expectedSourceAssetPath: undefined
  },
  {
    routeId: "product-configurator",
    id: "product-configurator-car-batched",
    manifestPath: "fixtures/v9/assets/product-configurator-car-batched/manifest.json",
    outputKey: "glb",
    expectedOutputPath: "fixtures/v9/assets/product-configurator-car-batched/car-concept-batched.glb",
    expectedSourceScript: "tools/v9-advanced-gallery-assets/optimize-product-car-blender.py",
    requireGeneratedNoTexture: false,
    requireDerivative: true,
    expectedSourceAssetPath: "fixtures/v8/assets/vehicles/car-concept.glb"
  },
  {
    routeId: "data-galaxy",
    id: "data-galaxy-core-blender",
    manifestPath: "fixtures/v9/assets/data-galaxy-core-blender/manifest.json",
    outputKey: "glb",
    expectedOutputPath: "fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb",
    expectedSourceScript: "tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py",
    requireGeneratedNoTexture: false,
    requireDerivative: false,
    expectedSourceAssetPath: undefined
  }
] as const;

function main(): void {
  configureCli(process.argv.slice(2));
  mkdirSync(reportDir, { recursive: true });
  const expectedPaths = expectedRouteReportPaths();
  const presentPaths = routeReportPaths();
  const expectedPathSet = new Set(expectedPaths);
  const presentPathSet = new Set(presentPaths);
  const missingRouteIds = expectedRouteIds.filter((routeId) => !presentPathSet.has(routeReportPath(routeId)));
  const unexpectedRouteReports = presentPaths
    .filter((path) => !expectedPathSet.has(path))
    .map((path) => path.slice(reportDir.length + 1, -".json".length));
  const routeAudits = expectedPaths.map((path) => auditRouteReport(path));
  const visualReview = readVisualReviewSummary();
  const blockers = routeAudits.flatMap((route) => route.blockers.map((message) => `${route.routeId}: ${message}`));
  const warnings = routeAudits.flatMap((route) => route.warnings.map((message) => `${route.routeId}: ${message}`));
  if (missingRouteIds.length > 0) {
    blockers.unshift(`report folder is partial; missing expected route JSON reports: ${missingRouteIds.join(", ")}`);
  }
  if (unexpectedRouteReports.length > 0) {
    blockers.unshift(`report folder contains unexpected route JSON reports: ${unexpectedRouteReports.join(", ")}`);
  }
  const audit: AuditReport = {
    schema: "g3d-v9-advanced-gallery-report-disclosure-audit/v1",
    generatedAt: new Date().toISOString(),
    sourceDir: reportDir,
    outputPath,
    acceptanceGateMutation: false,
    thresholdMutation: false,
    marksRoutesAccepted: false,
    visualReview,
    summary: {
      expectedRouteReports: expectedPaths.length,
      presentRouteReports: presentPaths.filter((path) => expectedPathSet.has(path)).length,
      routeReports: routeAudits.length,
      missingRouteReports: missingRouteIds.length,
      unexpectedRouteReports: unexpectedRouteReports.length,
      nonAcceptedRoutes: routeAudits.filter((route) => route.statusDoesNotClaimAcceptance).length,
      routesWithReusableSystems: routeAudits.filter((route) => route.reusableSystemsCount >= 5).length,
      routesWithUnsupportedDisclosure: routeAudits.filter((route) => route.unsupportedDisclosureCount > 0).length,
      routesWithMeasuredPerformanceEvidence: routeAudits.filter((route) => route.telemetry.hasMeasuredPerformanceEvidence).length,
      routesWithScreenshotHashes: routeAudits.filter((route) => route.telemetry.hasScreenshotHashes).length,
      routesWithCurrentScreenshotArtifacts: routeAudits.filter((route) => route.telemetry.hasCurrentScreenshotArtifacts).length,
      routesWithImageStats: routeAudits.filter((route) => route.telemetry.hasImageStats).length,
      blockers: blockers.length,
      warnings: warnings.length
    },
    routeAudits,
    blockers,
    warnings
  };
  writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  printSummary(audit);
  if (blockers.length > 0) process.exitCode = 1;
}

function configureCli(args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--report-dir") {
      const value = args[index + 1];
      if (!value) throw new Error("--report-dir requires a value");
      reportDir = value;
      index += 1;
    } else if (arg === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error("--output requires a value");
      outputPath = value;
      index += 1;
    } else if (arg === "--visual-review-report") {
      const value = args[index + 1];
      if (!value) throw new Error("--visual-review-report requires a value");
      visualReviewReportPath = value;
      index += 1;
    } else if (arg === "--asset-root") {
      const value = args[index + 1];
      if (!value) throw new Error("--asset-root requires a value");
      assetRoot = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (outputPath === join(defaultReportDir, "reusable-systems-disclosure-audit.json")) {
    outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
  }
  if (visualReviewReportPath === join(defaultReportDir, "visual-review-report.json")) {
    visualReviewReportPath = join(reportDir, "visual-review-report.json");
  }
}

function routeReportPaths(): string[] {
  return readdirSync(reportDir)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => name !== "visual-review-report.json")
    .filter((name) => name !== "reusable-systems-disclosure-audit.json")
    .filter((name) => name !== "visual-regression-inventory.json")
    .map((name) => join(reportDir, name))
    .sort();
}

function expectedRouteReportPaths(): string[] {
  return expectedRouteIds.map((routeId) => routeReportPath(routeId));
}

function routeReportPath(routeId: string): string {
  return join(reportDir, `${routeId}.json`);
}

function readVisualReviewSummary(): VisualReviewSummary {
  const report = readJsonRecord(visualReviewReportPath);
  const summary = getRecord(report, "summary");
  const gate = getRecord(report, "gate");
  const contactSheet = getRecord(report, "contactSheet");
  const acceptedCount = getNumber(summary, "acceptedCount");
  const demoCount = getNumber(summary, "demoCount");
  const releaseGate = getString(report, "releaseGate");
  return {
    reportPath: visualReviewReportPath,
    reportPresent: Boolean(report),
    releaseGate,
    pass: getBoolean(report, "pass"),
    demoCount,
    acceptedCount,
    candidateCount: getNumber(summary, "candidateCount"),
    failedCount: getNumber(summary, "failedCount"),
    blockedCount: getNumber(summary, "blockedCount"),
    imageQualityPassingCount: getNumber(summary, "imageQualityPassingCount"),
    requiresHumanAcceptedMetadata: getBoolean(gate, "requiresHumanAcceptedMetadata"),
    requiresAcceptedImageQualityThresholds: getBoolean(gate, "requiresAcceptedImageQualityThresholds"),
    contactSheetSha256: getString(contactSheet, "sha256") ?? getString(summary, "contactSheetSha256"),
    contactSheetSourceSetSha256: getString(contactSheet, "sourceSetSha256") ?? getString(summary, "contactSheetSourceSetSha256"),
    contactSheetGeneratedAt: getString(contactSheet, "generatedAt"),
    humanAcceptanceStillBlocksRelease: releaseGate === "blocked"
      && acceptedCount === 0
      && typeof demoCount === "number"
      && demoCount > 0
      && getBoolean(gate, "requiresHumanAcceptedMetadata") === true
  };
}

function auditRouteReport(reportPath: string): RouteAudit {
  const routeId = reportPath.slice(reportDir.length + 1, -".json".length);
  const report = readRouteReport(reportPath);
  const runtime = report?.runtime;
  const authored = report?.authored ?? runtime?.authoredAsset;
  const systems = stringList(runtime?.systems);
  const disclosures = stringList(runtime?.approximations);
  const disclosureKeywords = Array.from(new Set(disclosures.flatMap((entry) => disclosureKeywordMatches(entry)))).sort();
  const screenshotHashes = [
    report?.screenshotSha256,
    report?.viewportScreenshotSha256,
    report?.heroScreenshotSha256,
    ...Object.values(report?.screenshots ?? {}).map((entry) => entry?.sha256)
  ].filter((value): value is string => typeof value === "string");
  const telemetry = {
    hasMeasuredPerformanceEvidence: report?.performanceEvidence?.source === "app-runtime-timings"
      && report.performanceEvidence.measuredFields?.includes("runtime.timings.totalLoopMs") === true
      && report.performanceEvidence.measuredFields?.includes("runtime.timings.renderMs") === true,
    doesNotUseRafAsAcceptance: report?.performanceEvidence?.acceptanceUsesRafFrameMs === false,
    hasRuntimeWorkTimings: isFiniteNumber(runtime?.timings?.renderMs) && isFiniteNumber(runtime?.timings?.totalLoopMs),
    hasMotionEvidence: isFiniteNumber(report?.motion?.changedRatio) && isFiniteNumber(report?.motion?.meanDelta),
    hasCaptureReadiness: ["full", "viewport", "hero"].every((kind) => isFiniteNumber(report?.captureReadiness?.[kind]?.frameCount)),
    hasScreenshotHashes: screenshotHashes.length >= 6 && screenshotHashes.every((hash) => screenshotHashPattern.test(hash)),
    hasCurrentScreenshotArtifacts: hasCurrentScreenshotArtifacts(routeId, report),
    hasImageStats: isFiniteNumber(report?.pngStats?.detailEdgeDensity)
      && isFiniteNumber(report?.pngStats?.localContrast)
      && isFiniteNumber(report?.pngStats?.uniqueColorBuckets)
  };
  const authoredAudit = auditAuthored(authored);
  const specializedEvidence = specializedEvidenceLabels(report);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!report) blockers.push("route report JSON is missing or unreadable");
  const fullGalleryEvidence = report?.evidenceMode === "full-gallery"
    && report.evidenceScope?.fullGalleryRun === true
    && report.evidenceScope?.focusedRouteOnly === false
    && report.evidenceScope?.expectedRouteCount === expectedRouteIds.length;
  if (report && !fullGalleryEvidence) {
    blockers.push("route report is focused/partial evidence, not a full-gallery capture report; run pnpm v9:advanced-gallery before release audit claims");
  }
  if (report?.visualReviewStatus === "accepted" || report?.visualReviewStatus === "hero") {
    blockers.push("route report claims accepted/hero status; this audit must not be used to promote routes");
  }
  if (systems.length < 5) blockers.push(`runtime.systems has ${systems.length} entries; expected at least 5 reusable/visible systems`);
  if (disclosures.length === 0) blockers.push("runtime.approximations has no unsupported-feature disclosure entries");
  if (disclosures.length > 0 && disclosureKeywords.length === 0) blockers.push("unsupported-feature disclosures do not contain bounded/non-claiming language");
  if (!telemetry.hasMeasuredPerformanceEvidence) blockers.push("performanceEvidence does not cite measured runtime render/loop work");
  if (!telemetry.doesNotUseRafAsAcceptance) blockers.push("performanceEvidence does not explicitly reject RAF cadence as acceptance evidence");
  if (!telemetry.hasRuntimeWorkTimings) blockers.push("runtime.timings lacks finite renderMs/totalLoopMs");
  if (!telemetry.hasMotionEvidence) blockers.push("motion evidence lacks finite changedRatio/meanDelta");
  if (!telemetry.hasCaptureReadiness) blockers.push("captureReadiness does not cover full, viewport, and hero captures");
  if (!telemetry.hasScreenshotHashes) blockers.push("screenshot evidence lacks lowercase SHA-256 hashes for full, viewport, and hero screenshots");
  if (!telemetry.hasCurrentScreenshotArtifacts) blockers.push("screenshot evidence hashes do not match current full, viewport, and hero artifacts on disk");
  if (!telemetry.hasImageStats) blockers.push("pngStats lacks finite image quality metrics");
  if (isRendererFogRoute(routeId) && !hasRendererFogVisualDeltaEvidence(routeId, report)) {
    blockers.push("renderer fog route lacks fog-on/fog-off screenshot visual-delta evidence");
  }
  if (isRendererEnvironmentBackgroundRoute(routeId) && !hasRendererEnvironmentBackgroundVisualDeltaEvidence(routeId, report)) {
    blockers.push("renderer environment background route lacks background-on/background-off screenshot visual-delta evidence");
  }
  if (isRendererEnvironmentBackgroundRoute(routeId) && !hasRendererEnvironmentLightingEvidence(routeId, report)) {
    blockers.push("renderer environment background route lacks renderer-level PMREM/cube environment lighting evidence");
  }
  if (routeId === "reactor-post" && !hasRendererPostprocessPlanEvidence(report)) {
    blockers.push("reactor-post lacks renderer postprocess pass-plan diagnostics");
  }
  if (routeId === "product-configurator" && !hasProductConfiguratorMaterialVariantEvidence(authored)) {
    blockers.push("product-configurator lacks texture-backed imported material-variant evidence for real product assets");
  }
  blockers.push(...assetQualityBlockers(routeId, authored, report));
  if (routeId === "data-galaxy") {
    blockers.push(...dataGalaxyStructuredEvidenceBlockers(report));
  }
  blockers.push(...generatedAssetRuntimeProvenanceBlockers(routeId, authored));
  blockers.push(...generatedAssetManifestBlockers(routeId));

  if (authored?.status === "ready" && authoredAudit.materialDiagnosticCount === 0) {
    warnings.push("authored asset is ready but material diagnostics are absent");
  }
  if (authoredAudit.fallbackWhiteDrawItems > 0) warnings.push(`${authoredAudit.fallbackWhiteDrawItems} fallback-white authored draw items reported`);
  if (authoredAudit.missingResourceDrawItems > 0) warnings.push(`${authoredAudit.missingResourceDrawItems} missing authored geometry/material draw items reported`);
  warnings.push(...assetQualityWarnings(routeId, authored));
  if (specializedEvidence.length === 0) warnings.push("no route-specialized evidence bucket was detected");

  return {
    routeId,
    reportPath,
    capturedAt: report?.capturedAt,
    evidenceMode: report?.evidenceMode,
    fullGalleryEvidence,
    visualReviewStatus: report?.visualReviewStatus,
    reportPresent: Boolean(report),
    statusDoesNotClaimAcceptance: report?.visualReviewStatus !== "accepted" && report?.visualReviewStatus !== "hero",
    reusableSystemsCount: systems.length,
    reusableSystems: systems,
    unsupportedDisclosureCount: disclosures.length,
    unsupportedDisclosures: disclosures,
    disclosureKeywords,
    telemetry,
    authored: authoredAudit,
    specializedEvidence,
    blockers,
    warnings
  };
}

function auditAuthored(authored: AuthoredEvidence | undefined): RouteAudit["authored"] {
  const animationDiagnostics = authored?.animationDiagnostics ?? [];
  const materialDiagnostics = authored?.materialDiagnostics ?? [];
  const texturedDiagnostics = materialDiagnostics.filter((diagnostic) => finiteOrZero(diagnostic.texturedDrawItems) > 0);
  return {
    status: authored?.status,
    assetCount: authored?.assetIds?.length ?? authored?.assets?.length ?? 0,
    drawItems: authored?.drawItems,
    clipCount: authored?.clips?.length ?? 0,
    animationTracksApplied: animationDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.tracksApplied), 0),
    skinningPalettesUpdated: animationDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.skinningPalettesUpdated), 0),
    materialDiagnosticCount: materialDiagnostics.length,
    fallbackWhiteDrawItems: materialDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.fallbackWhiteDrawItems), 0),
    missingResourceDrawItems: materialDiagnostics.reduce((sum, diagnostic) =>
      sum + finiteOrZero(diagnostic.missingGeometryDrawItems) + finiteOrZero(diagnostic.missingMaterialDrawItems), 0),
    textureBackedDrawItems: materialDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.texturedDrawItems), 0),
    textureBackedAssetCount: texturedDiagnostics.length
  };
}

function assetQualityWarnings(routeId: string, authored: AuthoredEvidence | undefined): string[] {
  const materialDiagnostics = authored?.materialDiagnostics ?? [];
  if (materialDiagnostics.length === 0) return [];
  const texturedDiagnostics = materialDiagnostics.filter((diagnostic) => finiteOrZero(diagnostic.texturedDrawItems) > 0);
  const untexturedDiagnostics = materialDiagnostics.filter((diagnostic) =>
    finiteOrZero(diagnostic.drawItems) > 0 && finiteOrZero(diagnostic.texturedDrawItems) <= 0
  );
  const warnings: string[] = [];
  if (routeId === "product-configurator") {
    const realProductTextured = texturedDiagnostics.filter((diagnostic) => diagnostic.assetId !== "product-configurator-studio-blender");
    if (realProductTextured.length === 0) {
      warnings.push("product-configurator has no texture-backed non-studio hero GLB evidence; no-texture support fixtures must not be treated as premium product proof");
    }
    const studio = materialDiagnostics.find((diagnostic) => diagnostic.assetId === "product-configurator-studio-blender");
    if (studio && finiteOrZero(studio.drawItems) > 0) {
      warnings.push("product-configurator still has active no-texture product-studio scaffold draw items; this must not be treated as premium product proof");
    }
  }
  if (routeId === "data-galaxy" && texturedDiagnostics.length === 0 && untexturedDiagnostics.length > 0) {
    warnings.push("data-galaxy active authored GLBs have draw items but zero texture-backed material evidence; this remains scaffold/sample content rather than premium asset proof");
  }
  return warnings;
}

function assetQualityBlockers(routeId: string, authored: AuthoredEvidence | undefined, report: RouteReport | undefined): string[] {
  const materialDiagnostics = authored?.materialDiagnostics ?? [];
  if (materialDiagnostics.length === 0) return [];
  const totalDrawItems = finiteOrZero(authored?.drawItems)
    || materialDiagnostics.reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
  if (totalDrawItems <= 0) return [];

  const noTextureDrawItems = materialDiagnostics
    .filter((diagnostic) => finiteOrZero(diagnostic.drawItems) > 0 && finiteOrZero(diagnostic.texturedDrawItems) <= 0)
    .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
  const blockers: string[] = [];

  if (routeId === "product-configurator") {
    const shaderInactiveTextureSlots = materialDiagnostics
      .flatMap((diagnostic) => (diagnostic.shaderInactiveTextureSlotDiagnostics ?? []).map((slot) => ({
        assetId: diagnostic.assetId ?? "unknown",
        slot: slot.slot ?? "unknown",
        drawItems: finiteOrZero(slot.drawItems)
      })))
      .filter((slot) => slot.drawItems > 0);
    if (shaderInactiveTextureSlots.length > 0) {
      const summary = shaderInactiveTextureSlots
        .map((slot) => `${slot.assetId}:${slot.slot}:${slot.drawItems}`)
        .join(", ");
      blockers.push(`product-configurator has runtime-bound texture slots that are inactive in the selected textured-PBR shader variant (${summary}); material fidelity cannot be promoted until shader support or disclosures are corrected`);
    }
    const supportDrawItems = materialDiagnostics
      .filter((diagnostic) => diagnostic.assetId === "product-configurator-studio-blender" || /studio|support|scaffold/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
    if (supportDrawItems / totalDrawItems > 0.35) {
      blockers.push(`product-configurator support/scaffold draw items dominate authored evidence (${supportDrawItems}/${totalDrawItems}); generated studio support cannot carry Product acceptance`);
    }
    if (noTextureDrawItems / totalDrawItems > 0.25) {
      blockers.push(`product-configurator no-texture authored draw items dominate Product evidence (${noTextureDrawItems}/${totalDrawItems}); support/no-texture fixtures cannot carry acceptance`);
    }
  }

  if (routeId === "data-galaxy") {
    const evidence = report?.dataGalaxyEvidence ?? report?.runtime?.dataGalaxyEvidence;
    const generatedNoTextureDisclosure = evidence?.authoredAssetDisclosure?.generatedNoTextureAuthoredGlb === true;
    const generatedDrawItems = materialDiagnostics
      .filter((diagnostic) => diagnostic.assetId === "data-galaxy-core-blender" || /generated|scaffold|core-blender/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.drawItems), 0);
    const generatedTexturedDrawItems = materialDiagnostics
      .filter((diagnostic) => diagnostic.assetId === "data-galaxy-core-blender" || /generated|scaffold|core-blender/i.test(diagnostic.assetId ?? ""))
      .reduce((sum, diagnostic) => sum + finiteOrZero(diagnostic.texturedDrawItems), 0);
    if (generatedNoTextureDisclosure && generatedDrawItems / totalDrawItems > 0.5) {
      blockers.push(`data-galaxy generated/no-texture authored draw items dominate evidence (${generatedDrawItems}/${totalDrawItems}); support-only GLBs must stay subordinate to particle/data-system proof`);
    }
    if (!generatedNoTextureDisclosure && generatedDrawItems > 0 && generatedTexturedDrawItems <= 0) {
      blockers.push(`data-galaxy generated authored GLB is disclosed as texture-backed but reports 0 textured draw items (${generatedDrawItems} generated draw items)`);
    }
    const authoredRole = evidence?.focalHierarchy?.authoredGlbRole ?? "";
    if (evidence?.authoredAssetDisclosure?.generatedNoTextureAuthoredGlb === true
      && evidence.authoredAssetDisclosure.premiumTextureBackedAuthoredHero === false
      && /\b(hero|focal|premium|primary|acceptance proof|accepted proof)\b/i.test(authoredRole)) {
      blockers.push("data-galaxy generated/no-texture authored GLB is described as focal or premium proof; audit only allows it as disclosed support-only context");
    }
  }

  return blockers;
}

function dataGalaxyStructuredEvidenceBlockers(report: RouteReport | undefined): string[] {
  const evidence = report?.dataGalaxyEvidence ?? report?.runtime?.dataGalaxyEvidence;
  if (!evidence) return ["data-galaxy lacks structured dataGalaxyEvidence for CPU/static particle and generated authored-content disclosure"];
  const blockers: string[] = [];
  if (evidence.source !== "dataGalaxyBudgets+dataGalaxyEvidence") blockers.push("data-galaxy structured evidence has an unexpected source");
  if (evidence.routeId !== "data-galaxy") blockers.push("data-galaxy structured evidence routeId is missing or wrong");
  if (evidence.updateMode !== "static-geometry") blockers.push("data-galaxy structured evidence must report static-geometry updateMode until a real compute path exists");
  if (evidence.gpuBackend?.supported !== false || evidence.gpuBackend?.backend !== "none") {
    blockers.push("data-galaxy structured evidence must report no native GPU particle backend until implemented");
  }
  if (evidence.gpuBackend?.nativeGpuComputeDispatches !== 0) {
    blockers.push("data-galaxy structured evidence must report 0 native GPU compute dispatches until implemented");
  }
  const budget = evidence.budget;
  if (!budget || !isFiniteNumber(budget.requestedParticles) || !isFiniteNumber(budget.effectiveParticles)) {
    blockers.push("data-galaxy structured evidence lacks requested/effective particle counts");
  }
  if (budget && finiteOrZero(budget.primaryCount) + finiteOrZero(budget.vortexCount) + finiteOrZero(budget.networkCount) + finiteOrZero(budget.waveCount) !== finiteOrZero(budget.effectiveParticles)) {
    blockers.push("data-galaxy structured evidence particle layer counts do not sum to effectiveParticles");
  }
  if (!isFiniteNumber(evidence.geometry?.pointCount) || !isFiniteNumber(evidence.geometry?.lineSegmentCount) || !isFiniteNumber(evidence.geometry?.drawBatches)) {
    blockers.push("data-galaxy structured evidence lacks point/line/draw-batch geometry counts");
  }
  if (typeof evidence.authoredAssetDisclosure?.generatedNoTextureAuthoredGlb !== "boolean"
    || evidence.authoredAssetDisclosure?.premiumTextureBackedAuthoredHero !== false
    || evidence.authoredAssetDisclosure?.supportOnlyUntilVisualReview !== true) {
    blockers.push("data-galaxy structured evidence lacks generated/support-only authored GLB disclosure");
  }
  if (!evidence.authoredAssetDisclosure?.activeGeneratedAssetIds?.includes("data-galaxy-core-blender")) {
    blockers.push("data-galaxy structured evidence does not name data-galaxy-core-blender as the active generated authored asset");
  }
  if ((evidence.unsupportedGaps?.length ?? 0) <= 0) blockers.push("data-galaxy structured evidence lacks unsupportedGaps");
  if ((evidence.integrationSteps?.length ?? 0) <= 0) blockers.push("data-galaxy structured evidence lacks integrationSteps");
  return blockers;
}

function generatedAssetManifestBlockers(routeId: string): string[] {
  const requirements = generatedAssetManifestRequirements.filter((requirement) => requirement.routeId === routeId);
  const blockers: string[] = [];
  for (const requirement of requirements) {
    const manifestPath = join(assetRoot, requirement.manifestPath);
    const manifest = readJsonRecord(manifestPath);
    const prefix = `${requirement.id} generated asset manifest`;
    if (!manifest) {
      blockers.push(`${prefix} is missing or unreadable at ${requirement.manifestPath}`);
      continue;
    }
    if (getString(manifest, "id") !== requirement.id) blockers.push(`${prefix} has wrong id`);
    if (getString(getRecord(manifest, "routeLinkage"), "routeId") !== routeId) blockers.push(`${prefix} has wrong route linkage`);
    if (getString(getRecord(manifest, "source"), "sourceScript") !== requirement.expectedSourceScript) {
      blockers.push(`${prefix} has missing or unexpected source script`);
    }
    const source = getRecord(manifest, "source");
    if (getBoolean(source, "derivativeOfExternalAsset") !== requirement.requireDerivative) {
      blockers.push(`${prefix} derivativeOfExternalAsset does not match expected role`);
    }
    const status = getRecord(manifest, "status");
    if (getBoolean(status, "generated") !== true) blockers.push(`${prefix} must explicitly mark generated: true`);
    if (getBoolean(status, "supportOnly") !== true) blockers.push(`${prefix} must explicitly mark supportOnly: true`);
    if (getBoolean(status, "acceptableAsFocalHero") !== false) blockers.push(`${prefix} must explicitly mark acceptableAsFocalHero: false`);
    if (requirement.requireDerivative && getBoolean(status, "derivative") !== true) blockers.push(`${prefix} must explicitly mark derivative: true`);
    if (!requirement.requireDerivative && getBoolean(status, "derivative") !== false) blockers.push(`${prefix} must explicitly mark derivative: false`);
    if (requirement.requireGeneratedNoTexture) {
      if (getBoolean(status, "generatedNoTexture") !== true) blockers.push(`${prefix} must explicitly disclose generatedNoTexture: true`);
      if (getBoolean(status, "textureBacked") !== false) blockers.push(`${prefix} must not claim textureBacked material proof`);
    }

    const outputs = getRecord(manifest, "outputs");
    const output = getRecord(outputs, requirement.outputKey);
    const outputPath = getString(output, "path");
    if (outputPath !== requirement.expectedOutputPath) blockers.push(`${prefix} has missing or unexpected ${requirement.outputKey} output path`);
    if (outputPath && !manifestFileEvidenceMatches(output, outputPath)) {
      blockers.push(`${prefix} ${requirement.outputKey} hash/size does not match current file`);
    }

    const exported = getRecord(manifest, "exportedGlb");
    if (!exported) {
      blockers.push(`${prefix} lacks exportedGlb counts`);
    } else {
      const textureBacked = getNumber(exported, "textureBackedMaterialCount");
      const textureCount = getNumber(exported, "textureCount");
      const materialCount = getNumber(exported, "materialCount");
      const meshCount = getNumber(exported, "meshCount");
      const nodeCount = getNumber(exported, "nodeCount");
      if (!isFiniteNumber(materialCount) || materialCount <= 0) blockers.push(`${prefix} exportedGlb lacks materialCount`);
      if (!isFiniteNumber(meshCount) || meshCount <= 0) blockers.push(`${prefix} exportedGlb lacks meshCount`);
      if (!isFiniteNumber(nodeCount) || nodeCount <= 0) blockers.push(`${prefix} exportedGlb lacks nodeCount`);
      if (requirement.requireGeneratedNoTexture && (textureCount !== 0 || textureBacked !== 0)) {
        blockers.push(`${prefix} generated/no-texture boundary does not match exported GLB texture counts`);
      }
      if (!requirement.requireGeneratedNoTexture && (!isFiniteNumber(textureBacked) || textureBacked <= 0)) {
        blockers.push(`${prefix} generated/support texture-backed count is missing; generated support content cannot be used as material evidence`);
      }
    }

    if (requirement.expectedSourceAssetPath) {
      const sourceAsset = getRecord(source, "sourceAsset");
      if (getString(sourceAsset, "path") !== requirement.expectedSourceAssetPath) {
        blockers.push(`${prefix} sourceAsset path does not identify the original source GLB`);
      } else if (!manifestFileEvidenceMatches(sourceAsset, requirement.expectedSourceAssetPath)) {
        blockers.push(`${prefix} sourceAsset hash/size does not match current source GLB`);
      }
      const supportTruth = getRecord(manifest, "supportTruth");
      const cannotReplace = Array.isArray(supportTruth?.cannotReplace)
        ? supportTruth.cannotReplace.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (!cannotReplace.includes(requirement.expectedSourceAssetPath)) {
        blockers.push(`${prefix} supportTruth does not state it cannot replace the original source GLB`);
      }
    }
  }
  return blockers;
}

function generatedAssetRuntimeProvenanceBlockers(routeId: string, authored: AuthoredEvidence | undefined): string[] {
  const requiredIds = new Set(generatedAssetManifestRequirements
    .filter((requirement) => requirement.routeId === routeId)
    .map((requirement): string => requirement.id));
  const activeGeneratedIds = (authored?.assetIds ?? authored?.assets ?? [])
    .filter((assetId): assetId is string => typeof assetId === "string" && requiredIds.has(assetId));
  if (activeGeneratedIds.length === 0) return [];
  const provenance = authored?.assetProvenance ?? [];
  const blockers: string[] = [];
  for (const assetId of activeGeneratedIds) {
    const expectedManifest = generatedAssetManifestRequirements.find((requirement) => requirement.id === assetId && requirement.routeId === routeId);
    const entry = provenance.find((candidate) => candidate.assetId === assetId);
    if (!entry) {
      blockers.push(`${assetId} active generated/support asset lacks structured runtime provenance disclosure`);
      continue;
    }
    if (entry.generated !== true) blockers.push(`${assetId} runtime provenance must mark generated: true`);
    if (entry.supportOnly !== true) blockers.push(`${assetId} runtime provenance must mark supportOnly: true`);
    if (entry.acceptableAsFocalHero !== false) blockers.push(`${assetId} runtime provenance must mark acceptableAsFocalHero: false`);
    if (expectedManifest && entry.manifestPath !== expectedManifest.manifestPath) blockers.push(`${assetId} runtime provenance manifestPath does not match audited manifest`);
    if (expectedManifest && entry.sourceScript !== expectedManifest.expectedSourceScript) blockers.push(`${assetId} runtime provenance sourceScript does not match audited generator`);
    if (expectedManifest?.requireGeneratedNoTexture === true && entry.generatedNoTexture !== true) {
      blockers.push(`${assetId} runtime provenance must disclose generatedNoTexture: true`);
    }
    if (expectedManifest?.requireGeneratedNoTexture === false && entry.textureBacked !== true) {
      blockers.push(`${assetId} runtime provenance must disclose textureBacked: true`);
    }
    if (expectedManifest?.requireDerivative === true) {
      if (entry.derivative !== true) blockers.push(`${assetId} runtime provenance must mark derivative: true`);
      if (entry.sourceAssetPath !== expectedManifest.expectedSourceAssetPath) {
        blockers.push(`${assetId} runtime provenance must name the original source asset`);
      }
    }
  }
  return blockers;
}

function manifestFileEvidenceMatches(
  evidence: Record<string, unknown> | undefined,
  expectedRelativePath: string
): boolean {
  const evidencePath = getString(evidence, "path");
  const evidenceSha256 = getString(evidence, "sha256");
  const evidenceByteSize = getNumber(evidence, "byteSize");
  if (evidencePath !== expectedRelativePath || !evidenceSha256 || !screenshotHashPattern.test(evidenceSha256)) return false;
  const path = join(assetRoot, expectedRelativePath);
  if (!existsSync(path)) return false;
  const stats = statSync(path);
  if (evidenceByteSize !== stats.size) return false;
  return createHashForFile(path) === evidenceSha256;
}

function specializedEvidenceLabels(report: RouteReport | undefined): string[] {
  const labels: string[] = [];
  const runtime = report?.runtime;
  const authored = report?.authored ?? runtime?.authoredAsset;
  if (runtime?.waterTelemetry) labels.push("waterTelemetry");
  if (report?.dataGalaxyEvidence || runtime?.dataGalaxyEvidence) labels.push("dataGalaxyEvidence");
  if (runtime?.postprocessDiagnostics) labels.push("postprocessDiagnostics");
  if (report?.rendererEnvironmentBackgroundEvidence) labels.push("rendererEnvironmentBackgroundEvidence");
  if (report?.rendererEnvironmentLightingEvidence) labels.push("rendererEnvironmentLightingEvidence");
  if (report?.rendererEnvironmentBackgroundVisualDeltaEvidence) labels.push("rendererEnvironmentBackgroundVisualDeltaEvidence");
  if (report?.rendererEnvironmentFogEvidence) labels.push("rendererEnvironmentFogEvidence");
  if (report?.rendererFogVisualDeltaEvidence) labels.push("rendererFogVisualDeltaEvidence");
  if ((authored?.animationDiagnostics?.length ?? 0) > 0) labels.push("authoredAnimationDiagnostics");
  if ((authored?.materialDiagnostics?.length ?? 0) > 0) labels.push("authoredMaterialDiagnostics");
  if ((runtime?.instanceCount ?? 0) > 0) labels.push("instanceCount");
  if ((authored?.drawItems ?? 0) > 0) labels.push("authoredDrawItems");
  return labels;
}

function isRendererFogRoute(routeId: string): boolean {
  return routeId === "fog-cathedral" || routeId === "robotics-lab";
}

function isRendererEnvironmentBackgroundRoute(routeId: string): boolean {
  return routeId === "product-configurator" || routeId === "data-galaxy";
}

function hasRendererEnvironmentBackgroundVisualDeltaEvidence(routeId: string, report: RouteReport | undefined): boolean {
  const evidence = report?.rendererEnvironmentBackgroundVisualDeltaEvidence;
  if (!evidence) return false;
  const onPath = join(reportDir, `${routeId}-renderer-environment-background-on.png`);
  const offPath = join(reportDir, `${routeId}-renderer-environment-background-off.png`);
  return Boolean(report?.rendererEnvironmentBackgroundEvidence)
    && evidence.source === "renderer-environment-background-on-off-screenshot-delta"
    && evidence.rendererSource === "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass"
    && evidence.passed === true
    && isFiniteNumber(evidence.changedRatio)
    && isFiniteNumber(evidence.meanDelta)
    && isFiniteNumber(evidence.minimumChangedRatio)
    && isFiniteNumber(evidence.minimumMeanDelta)
    && evidence.changedRatio > evidence.minimumChangedRatio
    && evidence.meanDelta > evidence.minimumMeanDelta
    && screenshotEvidenceMatches(evidence.backgroundOnScreenshot, onPath)
    && screenshotEvidenceMatches(evidence.backgroundOffScreenshot, offPath);
}

function hasRendererEnvironmentLightingEvidence(routeId: string, report: RouteReport | undefined): boolean {
  const evidence = report?.rendererEnvironmentLightingEvidence;
  const claimBoundary = getString(evidence, "claimBoundary") ?? "";
  const uniformKeys = isRecord(evidence) && Array.isArray(evidence.uniformKeys)
    ? evidence.uniformKeys.filter((value): value is string => typeof value === "string")
    : [];
  return isRecord(evidence)
    && getString(evidence, "source") === "loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture"
    && getString(evidence, "routeId") === routeId
    && getString(evidence, "rendererField") === "source.environmentLighting"
    && getString(evidence, "forwardPassField") === "ForwardPassOptions.environmentLighting"
    && getString(evidence, "textureDimension") === "cube"
    && getNumber(evidence, "cubeFaceCount") === 6
    && getString(evidence, "fallbackEquirectTextureDimension") === "2d"
    && getNumber(evidence, "environmentMapMipCount") !== undefined
    && (getNumber(evidence, "environmentMapMipCount") ?? 0) >= 2
    && getNumber(evidence, "nativeEnvironmentBindings") !== undefined
    && (getNumber(evidence, "nativeEnvironmentBindings") ?? 0) > 0
    && getString(evidence, "textureBindingContract") === "TextureBinding.expectedDimension=cube"
    && getString(evidence, "materialSchemaContract") === "MaterialUniformKind.textureCube"
    && uniformKeys.includes("u_environmentCubeMapTexture")
    && uniformKeys.includes("u_environmentCubeMapTextureEnabled")
    && uniformKeys.includes("u_environmentMapTextureMipCount")
    && /does not prove/i.test(claimBoundary)
    && /live cube cameras/i.test(claimBoundary)
    && /refraction|SSR|planar/i.test(claimBoundary);
}

function hasRendererPostprocessPlanEvidence(report: RouteReport | undefined): boolean {
  const diagnostics = report?.runtime?.postprocessDiagnostics;
  if (!isRecord(diagnostics)) return false;
  const plan = getRecord(diagnostics, "plan");
  const claimBoundary = getString(plan, "claimBoundary") ?? "";
  const passNames = isRecord(plan) && Array.isArray(plan.passNames)
    ? plan.passNames.filter((value): value is string => typeof value === "string")
    : [];
  const readbackPassNames = isRecord(plan) && Array.isArray(plan.readbackPassNames)
    ? plan.readbackPassNames.filter((value): value is string => typeof value === "string")
    : [];
  const missingInputs = isRecord(plan) && Array.isArray(plan.missingInputs)
    ? plan.missingInputs.filter((value): value is string => typeof value === "string")
    : [];
  return getString(plan, "source") === "Renderer.postprocessPlan"
    && getNumber(plan, "passCount") === 3
    && getString(plan, "executionMode") === "renderer-owned-fused-ldr-native"
    && getBoolean(plan, "canFuseLdr") === true
    && passNames.join(",") === "tone-mapping,color-grade,fxaa"
    && readbackPassNames.length === 0
    && missingInputs.length === 0
    && /does not prove EffectComposer parity/i.test(claimBoundary);
}

function hasProductConfiguratorMaterialVariantEvidence(authored: AuthoredEvidence | undefined): boolean {
  const diagnostics = authored?.materialDiagnostics ?? [];
  const variants = authored?.materialVariants ?? [];
  const hasTextureBackedAsset = (assetId: string, minimumTexturedDrawItems: number): boolean =>
    diagnostics.some((diagnostic) =>
      diagnostic.assetId === assetId
      && (finiteOrZero(diagnostic.texturedDrawItems) >= minimumTexturedDrawItems || finiteOrZero(diagnostic.textureCount) > 0)
      && finiteOrZero(diagnostic.fallbackWhiteDrawItems) === 0
      && finiteOrZero(diagnostic.missingGeometryDrawItems) === 0
      && finiteOrZero(diagnostic.missingMaterialDrawItems) === 0
    );
  const hasSelectedVariant = (assetId: string): boolean =>
    variants.some((variant) => variant.assetId === assetId && typeof variant.selected === "string" && variant.selected.length > 0);
  const hasMetadataBackedMaterialControl = (assetId: string): boolean =>
    diagnostics.some((diagnostic) =>
      diagnostic.assetId === assetId
      && diagnostic.materialControlSource === "GLTFRenderResources.materialVariants"
      && finiteOrZero(diagnostic.materialControlTargetCount) > 0
      && finiteOrZero(diagnostic.materialControlUniqueMaterialCount) > 0
      && typeof diagnostic.materialControlSelectedVariant === "string"
      && diagnostic.materialControlSelectedVariant.length > 0
    );
  return !((authored?.assetIds ?? []) as readonly string[]).includes("product-configurator-studio-blender")
    && hasTextureBackedAsset("car-concept", 80)
    && hasTextureBackedAsset("chronograph-watch", 10)
    && hasTextureBackedAsset("materials-variants-shoe", 1)
    && hasSelectedVariant("car-concept")
    && hasSelectedVariant("chronograph-watch")
    && hasSelectedVariant("materials-variants-shoe")
    && hasMetadataBackedMaterialControl("car-concept")
    && hasMetadataBackedMaterialControl("chronograph-watch")
    && hasMetadataBackedMaterialControl("materials-variants-shoe");
}

function hasRendererFogVisualDeltaEvidence(routeId: string, report: RouteReport | undefined): boolean {
  const evidence = report?.rendererFogVisualDeltaEvidence;
  if (!evidence) return false;
  const onPath = join(reportDir, `${routeId}-renderer-fog-on.png`);
  const offPath = join(reportDir, `${routeId}-renderer-fog-off.png`);
  return evidence.source === "renderer-fog-on-off-screenshot-delta"
    && evidence.rendererSource === "Renderer.environmentFog -> ForwardPass.environmentFog"
    && evidence.passed === true
    && isFiniteNumber(evidence.changedRatio)
    && isFiniteNumber(evidence.meanDelta)
    && isFiniteNumber(evidence.minimumChangedRatio)
    && isFiniteNumber(evidence.minimumMeanDelta)
    && evidence.changedRatio > evidence.minimumChangedRatio
    && evidence.meanDelta > evidence.minimumMeanDelta
    && screenshotEvidenceMatches(evidence.fogOnScreenshot, onPath)
    && screenshotEvidenceMatches(evidence.fogOffScreenshot, offPath);
}

function screenshotEvidenceMatches(
  evidence: { readonly path?: string; readonly sha256?: string; readonly sizeBytes?: number } | undefined,
  expectedPath: string
): boolean {
  if (!evidence || evidence.path !== expectedPath || !evidence.sha256 || !screenshotHashPattern.test(evidence.sha256)) return false;
  if ((evidence.sizeBytes ?? 0) < 30_000) return false;
  if (!existsSync(expectedPath)) return false;
  const actual = createHashForFile(expectedPath);
  return actual === evidence.sha256;
}

function hasCurrentScreenshotArtifacts(routeId: string, report: RouteReport | undefined): boolean {
  const screenshots = report?.screenshots;
  const required = [
    { kind: "full", expectedPath: join(reportDir, `${routeId}.png`), topLevelHash: report?.screenshotSha256 },
    { kind: "viewport", expectedPath: join(reportDir, `${routeId}-viewport.png`), topLevelHash: report?.viewportScreenshotSha256 },
    { kind: "hero", expectedPath: join(reportDir, `${routeId}-hero.png`), topLevelHash: report?.heroScreenshotSha256 }
  ] as const;

  return required.every(({ kind, expectedPath, topLevelHash }) => {
    const evidence = screenshots?.[kind];
    if (!screenshotEvidenceMatches(evidence, expectedPath)) return false;
    return typeof topLevelHash === "string" && evidence !== undefined && topLevelHash === evidence.sha256;
  });
}

function createHashForFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readRouteReport(path: string): RouteReport | undefined {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as RouteReport;
  } catch {
    return undefined;
  }
}

function readJsonRecord(path: string): Record<string, unknown> | undefined {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return undefined;
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function getRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const next = value[key];
  return isRecord(next) ? next : undefined;
}

function getString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const next = value[key];
  return typeof next === "string" ? next : undefined;
}

function getNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const next = value[key];
  return isFiniteNumber(next) ? next : undefined;
}

function getBoolean(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined;
  const next = value[key];
  return typeof next === "boolean" ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function disclosureKeywordMatches(value: string): string[] {
  const matches = value.match(new RegExp(disclosurePattern.source, "gi")) ?? [];
  return matches.map((match) => match.toLowerCase());
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOrZero(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

function printSummary(audit: AuditReport): void {
  console.log(`V9 advanced gallery report disclosure audit: ${audit.summary.presentRouteReports}/${audit.summary.expectedRouteReports} expected route reports present`);
  if (audit.summary.missingRouteReports > 0) console.log(`Missing route reports: ${audit.summary.missingRouteReports}`);
  if (audit.summary.unexpectedRouteReports > 0) console.log(`Unexpected route reports: ${audit.summary.unexpectedRouteReports}`);
  console.log(`Reusable systems: ${audit.summary.routesWithReusableSystems}/${audit.summary.routeReports}`);
  console.log(`Unsupported disclosures: ${audit.summary.routesWithUnsupportedDisclosure}/${audit.summary.routeReports}`);
  console.log(`Measured performance evidence: ${audit.summary.routesWithMeasuredPerformanceEvidence}/${audit.summary.routeReports}`);
  console.log(`Screenshot hashes: ${audit.summary.routesWithScreenshotHashes}/${audit.summary.routeReports}`);
  console.log(`Current screenshot artifacts: ${audit.summary.routesWithCurrentScreenshotArtifacts}/${audit.summary.routeReports}`);
  console.log(`Image stats: ${audit.summary.routesWithImageStats}/${audit.summary.routeReports}`);
  if (audit.visualReview?.reportPresent) {
    console.log(`Visual review: gate=${audit.visualReview.releaseGate ?? "unknown"}, accepted=${audit.visualReview.acceptedCount ?? "unknown"}/${audit.visualReview.demoCount ?? "unknown"}, imageQuality=${audit.visualReview.imageQualityPassingCount ?? "unknown"}/${audit.visualReview.demoCount ?? "unknown"}`);
  }
  console.log(`Blockers: ${audit.summary.blockers}`);
  console.log(`Warnings: ${audit.summary.warnings}`);
  console.log(`Wrote ${outputPath}`);
}

main();
