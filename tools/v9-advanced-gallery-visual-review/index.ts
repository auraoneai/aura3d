import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { chromium } from "@playwright/test";
import { DEMOS } from "../../apps/v9-advanced-examples-gallery/src/metadata";
import { acceptedMetadataBlockers, acceptedRuntimeEvidenceBlockers } from "./gateRules";

type IssueSeverity = "blocker" | "warning";

interface VisualReviewIssue {
  readonly demoId: string;
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly message: string;
}

interface DemoVisualReviewEvidence {
  readonly id: string;
  readonly title: string;
  readonly visualReviewStatus: "failed" | "candidate" | "accepted";
  readonly evidenceState: "failed" | "candidate" | "accepted" | "blocked";
  readonly threeCategory: string;
  readonly acceptanceCriteria: readonly string[];
  readonly knownGaps: readonly string[];
  readonly knownVisualArtifactRisks: readonly string[];
  readonly capturedAt?: string;
  readonly screenshotPath: string;
  readonly screenshotExists: boolean;
  readonly screenshotSha256?: string;
  readonly screenshotSizeBytes?: number;
  readonly screenshotMtimeMs?: number;
  readonly screenshotMtimeIso?: string;
  readonly viewportScreenshotPath: string;
  readonly viewportScreenshotExists: boolean;
  readonly viewportScreenshotSha256?: string;
  readonly viewportScreenshotSizeBytes?: number;
  readonly viewportScreenshotMtimeMs?: number;
  readonly viewportScreenshotMtimeIso?: string;
  readonly heroScreenshotPath: string;
  readonly heroScreenshotExists: boolean;
  readonly heroScreenshotSha256?: string;
  readonly heroScreenshotSizeBytes?: number;
  readonly heroScreenshotMtimeMs?: number;
  readonly heroScreenshotMtimeIso?: string;
  readonly runtimeReportPath: string;
  readonly runtimeReportExists: boolean;
  readonly runtimeReportMtimeMs?: number;
  readonly runtimeReportMtimeIso?: string;
  readonly screenshots?: ScreenshotEvidenceSet;
  readonly captureReadiness?: CaptureReadinessSet;
  readonly performanceEvidence?: PerformanceEvidence;
  readonly imageQualityEvidence?: ImageQualityEvidence;
  readonly runtime?: {
    readonly status?: string;
    readonly frameCount?: number;
    readonly fps?: number;
    readonly frameMs?: number;
    readonly renderMs?: number;
    readonly totalLoopMs?: number;
    readonly drawCalls?: number;
    readonly objectCount?: number;
    readonly instanceCount?: number;
    readonly systems?: readonly string[];
    readonly approximations?: readonly string[];
  };
  readonly authored?: {
    readonly status?: string;
    readonly assetIds?: readonly string[];
    readonly assets?: readonly string[];
    readonly drawItems?: number;
    readonly animations?: number;
    readonly animatedAssets?: number;
    readonly clips?: readonly string[];
    readonly loadMs?: number;
    readonly errors?: readonly string[];
    readonly animationDiagnostics?: readonly AuthoredAnimationDiagnosticEvidence[];
    readonly materialDiagnostics?: readonly AuthoredMaterialDiagnosticEvidence[];
  };
  readonly motion?: {
    readonly changedRatio?: number;
    readonly meanDelta?: number;
  };
  readonly pngStats?: {
    readonly width?: number;
    readonly height?: number;
    readonly uniqueColorBuckets?: number;
    readonly averageLuma?: number;
    readonly foregroundCoverage?: number;
    readonly largestForegroundComponentCoverage?: number;
    readonly centerForegroundCoverage?: number;
    readonly foregroundBoundsCoverage?: number;
    readonly detailEdgeDensity?: number;
    readonly localContrast?: number;
  };
  readonly visualReviewNotes: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

interface ScreenshotEvidence {
  readonly path?: string;
  readonly sha256?: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly mtimeIso?: string;
}

interface ScreenshotEvidenceSet {
  readonly full?: ScreenshotEvidence;
  readonly viewport?: ScreenshotEvidence;
  readonly hero?: ScreenshotEvidence;
}

interface FileEvidence {
  readonly path: string;
  readonly exists: boolean;
  readonly sha256?: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly mtimeIso?: string;
}

interface ContactSheetSourceEvidence extends FileEvidence {
  readonly demoId: string;
  readonly title: string;
  readonly screenshotKind: "viewport";
  readonly runtimeEvidenceSha256?: string;
  readonly runtimeEvidenceMtimeMs?: number;
  readonly runtimeEvidenceMtimeIso?: string;
}

interface ContactSheetEvidence extends FileEvidence {
  readonly generated: boolean;
  readonly generatedAt?: string;
  readonly generationError?: string;
  readonly sourceScreenshotKind: "viewport";
  readonly sourceSetSha256?: string;
  readonly latestSourceMtimeMs?: number;
  readonly latestSourceMtimeIso?: string;
  readonly sources: readonly ContactSheetSourceEvidence[];
  readonly blockers: readonly string[];
}

interface CaptureReadinessEvidence {
  readonly label?: string;
  readonly demoId?: string;
  readonly frameCount?: number;
  readonly runtimeStatus?: string;
  readonly drawCalls?: number;
  readonly loadingHiddenAttribute?: boolean;
  readonly loadingComputedDisplay?: string;
  readonly loadingVisible?: boolean;
  readonly reviewCapture?: string;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly canvasCssWidth?: number;
  readonly canvasCssHeight?: number;
  readonly canvasVisible?: boolean;
}

interface CaptureReadinessSet {
  readonly full?: CaptureReadinessEvidence;
  readonly viewport?: CaptureReadinessEvidence;
  readonly hero?: CaptureReadinessEvidence;
}

interface PerformanceEvidence {
  readonly source: "app-runtime-timings";
  readonly measuredFields: readonly ["runtime.timings.totalLoopMs", "runtime.timings.renderMs"];
  readonly acceptanceUsesRafFrameMs: false;
  readonly budgetMs: number;
  readonly loopMs?: number;
  readonly renderMs?: number;
  readonly rafFrameMs?: number;
  readonly measuredLoopAndRenderWorkPresent: boolean;
  readonly loopWithinBudget?: boolean;
  readonly renderWithinBudget?: boolean;
}

interface ImageQualityEvidence {
  readonly source: "runtime-report-pngStats";
  readonly target: "accepted-advanced-gallery-screenshot";
  readonly thresholds: {
    readonly uniqueColorBuckets: number;
    readonly foregroundCoverage: number;
    readonly centerForegroundCoverage: number;
    readonly detailEdgeDensity: number;
    readonly localContrast: number;
  };
  readonly values: {
    readonly uniqueColorBuckets?: number;
    readonly foregroundCoverage?: number;
    readonly centerForegroundCoverage?: number;
    readonly detailEdgeDensity?: number;
    readonly localContrast?: number;
    readonly clarityScore?: number;
  };
  readonly pass: boolean;
  readonly blockers: readonly string[];
}

interface AuthoredAnimationDiagnosticEvidence {
  readonly assetId?: string;
  readonly clip?: string;
  readonly time?: number;
  readonly paused?: boolean;
  readonly tracksApplied?: number;
  readonly morphWeightTracksApplied?: number;
  readonly skinningPalettesUpdated?: number;
}

interface AuthoredMaterialDiagnosticEvidence {
  readonly assetId?: string;
  readonly assetTitle?: string;
  readonly label?: string;
  readonly drawItems?: number;
  readonly skinnedDrawItems?: number;
  readonly texturedDrawItems?: number;
  readonly texturedSkinnedDrawItems?: number;
  readonly untexturedSkinnedDrawItems?: number;
  readonly fallbackWhiteDrawItems?: number;
  readonly missingGeometryDrawItems?: number;
  readonly missingMaterialDrawItems?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly fallbackWhiteLabels?: readonly string[];
  readonly textureBackedMaterialNames?: readonly string[];
  readonly untexturedSkinnedLabels?: readonly string[];
  readonly missingGeometryLabels?: readonly string[];
  readonly missingMaterialLabels?: readonly string[];
}

const reportDir = "tests/reports/v9/advanced-examples-gallery";
const outputPath = join(reportDir, "visual-review-report.json");
const contactSheetPath = join(reportDir, "current-contact-sheet.png");
const visualRegressionInventoryPath = join(reportDir, "visual-regression-inventory.json");
const contactSheetSourceKind = "viewport" as const;
const visualRegressionDemoIds = new Set(["product-configurator", "data-galaxy", "reactor-post"]);

await main();

async function main(): Promise<void> {
  mkdirSync(reportDir, { recursive: true });

  const demos = DEMOS.map((demo): DemoVisualReviewEvidence => {
  const screenshotPath = demo.visualReview.screenshot;
  const runtimeReportPath = join(reportDir, `${demo.id}.json`);
  const viewportScreenshotPath = join(reportDir, `${demo.id}-viewport.png`);
  const heroScreenshotPath = join(reportDir, `${demo.id}-hero.png`);
  const screenshotFile = fileEvidence(screenshotPath);
  const viewportScreenshotFile = fileEvidence(viewportScreenshotPath);
  const heroScreenshotFile = fileEvidence(heroScreenshotPath);
  const runtimeReportFile = fileEvidence(runtimeReportPath);
  const runtimeReport = readJson(runtimeReportPath);
  const runtime = getRecord(runtimeReport, "runtime");
  const timings = getRecord(runtime, "timings");
  const authored = getRecord(runtimeReport, "authored") ?? getRecord(runtime, "authoredAsset");
  const motion = getRecord(runtimeReport, "motion");
  const rendererEnvironmentBackgroundVisualDelta = getRecord(runtimeReport, "rendererEnvironmentBackgroundVisualDeltaEvidence");
  const rendererFogVisualDelta = getRecord(runtimeReport, "rendererFogVisualDeltaEvidence");
  const pngStats = getRecord(runtimeReport, "pngStats");
  const screenshots = readScreenshotEvidence(runtimeReport);
  const captureReadiness = readCaptureReadiness(runtimeReport);
  const performance = buildPerformanceEvidence(demo.id, runtime);
  const imageQuality = buildImageQualityEvidence(demo.id, pngStats);
  const artifactRisks = knownVisualArtifactRisks(demo);
  const blockers = [
    ...visualReviewBlockers(demo),
    ...knownVisualArtifactBlockers(demo, artifactRisks),
    ...imageQualityBlockers(demo, imageQuality),
    ...artifactBlockers(demo, screenshotPath, viewportScreenshotPath, heroScreenshotPath, runtimeReportPath, runtimeReport, screenshots, captureReadiness),
    ...acceptedRuntimeEvidenceBlockers({
      status: demo.visualReview.status,
      screenshot: demo.visualReview.screenshot,
      screenshotSha256: demo.visualReview.screenshotSha256,
      reviewedBy: demo.visualReview.reviewedBy,
      reviewedAt: demo.visualReview.reviewedAt,
      notes: demo.visualReview.notes,
      knownGaps: demo.knownGaps,
      demoId: demo.id,
      runtime: runtime ? {
        fps: getNumber(runtime, "fps"),
        frameMs: getNumber(runtime, "frameMs"),
        approximations: getStringArray(runtime, "approximations"),
        dataGalaxyEvidence: readDataGalaxyRuntimeGateEvidence(getRecord(runtime, "dataGalaxyEvidence"))
      } : undefined,
      authored: authored ? {
        drawItems: getNumber(authored, "drawItems"),
        assetIds: getStringArray(authored, "assetIds"),
        materialDiagnostics: readGateMaterialDiagnostics(authored)
      } : undefined,
      pngStats: pngStats ? {
        foregroundBoundsCoverage: getNumber(pngStats, "foregroundBoundsCoverage")
      } : undefined,
      dataGalaxyEvidence: readDataGalaxyRuntimeGateEvidence(getRecord(runtimeReport, "dataGalaxyEvidence"))
    }),
    ...runtimeBlockers(demo.id, runtime, authored, motion, pngStats, performance),
    ...rendererEnvironmentBackgroundVisualDeltaBlockers(demo.id, rendererEnvironmentBackgroundVisualDelta),
    ...rendererFogVisualDeltaBlockers(demo.id, rendererFogVisualDelta)
  ];
  const evidenceState = blockers.length > 0
    ? "blocked"
    : demo.visualReview.status;
  const warnings = [
    ...imageQualityWarnings(demo, imageQuality),
    ...automatedVisualQualityWarnings(demo.id, runtime, authored, pngStats)
  ];

  return {
    id: demo.id,
    title: demo.title,
    visualReviewStatus: demo.visualReview.status,
    evidenceState,
    threeCategory: demo.threeCategory,
    acceptanceCriteria: demo.acceptance,
    knownGaps: demo.knownGaps,
    knownVisualArtifactRisks: artifactRisks,
    capturedAt: getString(runtimeReport, "capturedAt"),
    screenshotPath,
    screenshotExists: screenshotFile.exists,
    screenshotSha256: screenshotFile.sha256,
    screenshotSizeBytes: screenshotFile.sizeBytes,
    screenshotMtimeMs: screenshotFile.mtimeMs,
    screenshotMtimeIso: screenshotFile.mtimeIso,
    viewportScreenshotPath,
    viewportScreenshotExists: viewportScreenshotFile.exists,
    viewportScreenshotSha256: viewportScreenshotFile.sha256,
    viewportScreenshotSizeBytes: viewportScreenshotFile.sizeBytes,
    viewportScreenshotMtimeMs: viewportScreenshotFile.mtimeMs,
    viewportScreenshotMtimeIso: viewportScreenshotFile.mtimeIso,
    heroScreenshotPath,
    heroScreenshotExists: heroScreenshotFile.exists,
    heroScreenshotSha256: heroScreenshotFile.sha256,
    heroScreenshotSizeBytes: heroScreenshotFile.sizeBytes,
    heroScreenshotMtimeMs: heroScreenshotFile.mtimeMs,
    heroScreenshotMtimeIso: heroScreenshotFile.mtimeIso,
    runtimeReportPath,
    runtimeReportExists: runtimeReport !== undefined,
    runtimeReportMtimeMs: runtimeReportFile.mtimeMs,
    runtimeReportMtimeIso: runtimeReportFile.mtimeIso,
    screenshots,
    captureReadiness,
    performanceEvidence: performance,
    imageQualityEvidence: imageQuality,
    runtime: runtime ? {
      status: getString(runtime, "status"),
      frameCount: getNumber(runtime, "frameCount"),
      fps: getNumber(runtime, "fps"),
      frameMs: getNumber(runtime, "frameMs"),
      renderMs: getNumber(timings, "renderMs"),
      totalLoopMs: getNumber(timings, "totalLoopMs"),
      drawCalls: getNumber(runtime, "drawCalls"),
      objectCount: getNumber(runtime, "objectCount"),
      instanceCount: getNumber(runtime, "instanceCount"),
      systems: getStringArray(runtime, "systems"),
      approximations: getStringArray(runtime, "approximations")
    } : undefined,
    authored: authored ? {
      status: getString(authored, "status"),
      assetIds: getStringArray(authored, "assetIds"),
      assets: getStringArray(authored, "assets"),
      drawItems: getNumber(authored, "drawItems"),
      animations: getNumber(authored, "animations"),
      animatedAssets: getNumber(authored, "animatedAssets"),
      clips: getStringArray(authored, "clips"),
      loadMs: getNumber(authored, "loadMs"),
      errors: getStringArray(authored, "errors"),
      animationDiagnostics: readAnimationDiagnostics(authored),
      materialDiagnostics: readMaterialDiagnostics(authored)
    } : undefined,
    motion: motion ? {
      changedRatio: getNumber(motion, "changedRatio"),
      meanDelta: getNumber(motion, "meanDelta")
    } : undefined,
    pngStats: pngStats ? {
      width: getNumber(pngStats, "width"),
      height: getNumber(pngStats, "height"),
      uniqueColorBuckets: getNumber(pngStats, "uniqueColorBuckets"),
      averageLuma: getNumber(pngStats, "averageLuma"),
      foregroundCoverage: getNumber(pngStats, "foregroundCoverage"),
      largestForegroundComponentCoverage: getNumber(pngStats, "largestForegroundComponentCoverage"),
      centerForegroundCoverage: getNumber(pngStats, "centerForegroundCoverage"),
      foregroundBoundsCoverage: getNumber(pngStats, "foregroundBoundsCoverage"),
      detailEdgeDensity: getNumber(pngStats, "detailEdgeDensity"),
      localContrast: getNumber(pngStats, "localContrast")
    } : undefined,
    visualReviewNotes: demo.visualReview.notes,
    blockers,
    warnings
  };
});

  const contactSheet = await buildContactSheetEvidence(demos);
  const issues: VisualReviewIssue[] = [
    ...demos.flatMap((demo) => demo.blockers.map((message) => ({
  demoId: demo.id,
  severity: "blocker" as const,
  code: "visual_acceptance_blocked",
  message
    }))),
    ...contactSheet.blockers.map((message) => ({
      demoId: "contact-sheet",
      severity: "blocker" as const,
      code: "contact_sheet_blocked",
      message
    })),
    ...demos.flatMap((demo) => demo.warnings.map((message) => ({
      demoId: demo.id,
      severity: "warning" as const,
      code: "visual_quality_warning",
      message
    })))
  ];

  const acceptedCount = demos.filter((demo) => demo.visualReviewStatus === "accepted" && demo.blockers.length === 0).length;
  const candidateCount = demos.filter((demo) => demo.visualReviewStatus === "candidate").length;
  const failedCount = demos.filter((demo) => demo.visualReviewStatus === "failed").length;
  const evidenceAcceptedCount = demos.filter((demo) => demo.evidenceState === "accepted").length;
  const evidenceCandidateCount = demos.filter((demo) => demo.evidenceState === "candidate").length;
  const evidenceFailedCount = demos.filter((demo) => demo.evidenceState === "failed").length;
  const evidenceBlockedCount = demos.filter((demo) => demo.evidenceState === "blocked").length;
  const blockerIssueCount = issues.filter((issue) => issue.severity === "blocker").length;
  const warningIssueCount = issues.filter((issue) => issue.severity === "warning").length;
  const pass = acceptedCount === DEMOS.length && blockerIssueCount === 0;
  const visualReviewReport = {
    schema: "g3d-v9-advanced-gallery-visual-review/v1",
    generatedAt: new Date().toISOString(),
    pass,
    releaseGate: pass ? "accepted" : "blocked",
    gate: {
      requiresHumanAcceptedMetadata: true,
      requiresFreshFullViewportHeroScreenshots: true,
      requiresCaptureReadinessEvidence: true,
      requiresScreenshotHashesAndMtimes: true,
      requiresCurrentContactSheet: true,
      contactSheetSourceKind,
      performanceEvidenceSource: "app-runtime-timings",
      performanceFields: ["runtime.timings.totalLoopMs", "runtime.timings.renderMs"],
      acceptanceUsesRafFrameMs: false,
      requiresAcceptedImageQualityThresholds: true,
      imageQualityFields: ["pngStats.uniqueColorBuckets", "pngStats.foregroundCoverage", "pngStats.centerForegroundCoverage", "pngStats.detailEdgeDensity", "pngStats.localContrast"],
      blocksAcceptedKnownVisualArtifactRisks: true
    },
    summary: {
      demoCount: DEMOS.length,
      acceptedCount,
      candidateCount,
      failedCount,
      blockedCount: evidenceBlockedCount,
      evidenceAcceptedCount,
      evidenceCandidateCount,
      evidenceFailedCount,
      blockerIssueCount,
      warningIssueCount,
      contactSheetPath,
      contactSheetExists: contactSheet.exists,
      contactSheetSha256: contactSheet.sha256,
      contactSheetSizeBytes: contactSheet.sizeBytes,
      contactSheetMtimeMs: contactSheet.mtimeMs,
      contactSheetMtimeIso: contactSheet.mtimeIso,
      contactSheetSourceSetSha256: contactSheet.sourceSetSha256,
      contactSheetLatestSourceMtimeMs: contactSheet.latestSourceMtimeMs,
      contactSheetLatestSourceMtimeIso: contactSheet.latestSourceMtimeIso,
      imageQualityPassingCount: demos.filter((demo) => demo.imageQualityEvidence?.pass === true).length,
      knownVisualArtifactRiskCount: demos.reduce((total, demo) => total + demo.knownVisualArtifactRisks.length, 0)
    },
    contactSheet,
    demos,
    issues
  };
  writeFileSync(outputPath, `${JSON.stringify(visualReviewReport, null, 2)}\n`);
  const visualRegressionInventory = buildVisualRegressionInventory(demos, contactSheet);
  writeFileSync(visualRegressionInventoryPath, `${JSON.stringify(visualRegressionInventory, null, 2)}\n`);

  console.log(`V9 advanced gallery contact sheet ${contactSheet.generated ? "generated" : "validated"}: ${contactSheetPath}`);
  console.log(`V9 advanced gallery visual regression inventory written: ${visualRegressionInventoryPath}`);
  console.log(`V9 advanced gallery visual review report written: ${outputPath}`);
  console.log(`Release gate: ${pass ? "accepted" : "blocked"} (${acceptedCount}/${DEMOS.length} accepted)`);
  if (!pass) {
    for (const issue of issues.slice(0, 20)) {
      console.error(`- ${issue.demoId}: ${issue.message}`);
    }
    if (issues.length > 20) console.error(`- ${issues.length - 20} additional blockers omitted; see ${outputPath}.`);
    process.exitCode = 1;
  }
}

function visualReviewBlockers(demo: typeof DEMOS[number]): string[] {
  const blockers = acceptedMetadataBlockers({
    status: demo.visualReview.status,
    screenshot: demo.visualReview.screenshot,
    screenshotSha256: demo.visualReview.screenshotSha256,
    reviewedBy: demo.visualReview.reviewedBy,
    reviewedAt: demo.visualReview.reviewedAt,
    notes: demo.visualReview.notes,
    knownGaps: demo.knownGaps
  });
  if (demo.visualReview.screenshotSha256 && existsSync(demo.visualReview.screenshot)) {
    const actual = sha256File(demo.visualReview.screenshot);
    if (actual !== demo.visualReview.screenshotSha256) blockers.push("Accepted review screenshotSha256 does not match the current screenshot artifact.");
  }
  return blockers;
}

function knownVisualArtifactRisks(demo: typeof DEMOS[number]): readonly string[] {
  const text = [
    demo.visualReview.notes,
    ...demo.knownGaps
  ].join("\n");
  const risks = [
    { label: "white edge artifacts", pattern: /\bwhite edge artifacts?\b/i },
    { label: "broken cockpit or voided model regions", pattern: /\b(?:cockpit|model|mesh)\s+voids?\b|\bbroken cockpit\b/i },
    { label: "crop-edge or boundary artifacts", pattern: /\bcrop (?:edges|boundaries)\b/i },
    { label: "debug/noisy overlay artifacts", pattern: /\bdebug-like\b|\bdebug noise\b|\bforeground debug noise\b|\bnoisy overlay\b|\bnoisiest .* overlay\b/i },
    { label: "fallback/default white materials", pattern: /\bfallback(?:\/default)? white\b|\bdefault white\b/i },
    { label: "visually stylized approximation called out by review", pattern: /\breads? (?:as )?stylized\b|\bstylized WebGL geometry\b/i }
  ];
  return risks
    .filter((risk) => risk.pattern.test(text))
    .map((risk) => risk.label);
}

function knownVisualArtifactBlockers(demo: typeof DEMOS[number], risks: readonly string[]): string[] {
  if (demo.visualReview.status !== "accepted") return [];
  return risks.map((risk) => `Accepted review still carries unresolved known visual artifact risk in metadata/review notes: ${risk}.`);
}

function buildVisualRegressionInventory(
  demos: readonly DemoVisualReviewEvidence[],
  contactSheet: ContactSheetEvidence
): JsonRecord {
  const targetedDemos = demos.filter((demo) => visualRegressionDemoIds.has(demo.id));
  const generatedAt = new Date().toISOString();
  const artifacts = targetedDemos.map((demo) => {
    const runtime = readJson(demo.runtimeReportPath);
    const currentFiles = [
      artifactInventoryEntry("full", demo.screenshotPath, "current-route-artifact", getRecord(getRecord(runtime, "screenshots"), "full")),
      artifactInventoryEntry("viewport", demo.viewportScreenshotPath, "current-route-artifact", getRecord(getRecord(runtime, "screenshots"), "viewport")),
      artifactInventoryEntry("hero", demo.heroScreenshotPath, "current-route-artifact", getRecord(getRecord(runtime, "screenshots"), "hero")),
      artifactInventoryEntry("runtime-json", demo.runtimeReportPath, "current-route-artifact"),
      artifactInventoryEntry("background-on", join(reportDir, `${demo.id}-renderer-environment-background-on.png`), "current-delta-artifact"),
      artifactInventoryEntry("background-off", join(reportDir, `${demo.id}-renderer-environment-background-off.png`), "current-delta-artifact"),
      artifactInventoryEntry("fog-on", join(reportDir, `${demo.id}-renderer-fog-on.png`), "current-delta-artifact"),
      artifactInventoryEntry("fog-off", join(reportDir, `${demo.id}-renderer-fog-off.png`), "current-delta-artifact")
    ].filter((entry) => entry.exists || entry.requiredForDemo);
    const historicalCandidates = historicalArtifactCandidates(demo.id, currentFiles.map((entry) => entry.path));
    const latestCurrentMtimeMs = Math.max(...currentFiles.map((entry) => entry.mtimeMs ?? 0));
    return {
      demoId: demo.id,
      title: demo.title,
      visualReviewStatus: demo.visualReviewStatus,
      evidenceState: demo.evidenceState,
      capturedAt: demo.capturedAt,
      runtimeReportPath: demo.runtimeReportPath,
      runtimeReportExists: demo.runtimeReportExists,
      runtimeReportMtimeIso: demo.runtimeReportMtimeIso,
      artifacts: currentFiles,
      latestCurrentArtifactMtimeMs: Number.isFinite(latestCurrentMtimeMs) ? latestCurrentMtimeMs : undefined,
      latestCurrentArtifactMtimeIso: latestCurrentMtimeMs > 0 ? new Date(latestCurrentMtimeMs).toISOString() : undefined,
      historicalCandidates,
      olderPristineBaselinesFound: historicalCandidates.length > 0,
      olderPristineBaselinesAreHumanVerified: false,
      baselineNote: historicalCandidates.length > 0
        ? "Older same-route artifacts exist outside the current gallery report directory, but this tool does not visually certify them as pristine baselines."
        : "No older same-route artifacts were found outside the current gallery report directory during inventory generation.",
      currentKnownDefects: currentDefectNotes(demo)
    };
  });
  const latestCurrentMtimeMs = Math.max(
    ...artifacts.flatMap((demo) => Array.isArray(demo.artifacts)
      ? demo.artifacts.map((artifact) => typeof artifact.mtimeMs === "number" ? artifact.mtimeMs : 0)
      : [0]
    )
  );
  const visualReviewReport = fileEvidence(outputPath);
  return {
    schema: "g3d-v9-advanced-gallery-visual-regression-inventory/v1",
    generatedAt,
    source: "tools/v9-advanced-gallery-visual-review",
    reportDir,
    inventoryPath: visualRegressionInventoryPath,
    purpose: "Track current and historical Product/Data/Reactor visual artifacts before source-owned recovery work; this inventory is evidence, not acceptance.",
    targetDemoIds: Array.from(visualRegressionDemoIds).sort(),
    screenshotPolicy: {
      screenshotsAreVerificationOnlyAfterSourceOwnedFixes: true,
      repeatedScreenshotLoopsAreBlockedByProcess: true,
      olderCandidatesRequireHumanReviewBeforeUseAsPristineBaseline: true
    },
    currentContactSheet: {
      path: contactSheet.path,
      exists: contactSheet.exists,
      sha256: contactSheet.sha256,
      sourceSetSha256: contactSheet.sourceSetSha256,
      mtimeIso: contactSheet.mtimeIso
    },
    currentVisualReviewReport: {
      path: outputPath,
      exists: visualReviewReport.exists,
      sha256: visualReviewReport.sha256,
      mtimeIso: visualReviewReport.mtimeIso,
      staleRelativeToTargetArtifacts: Boolean(visualReviewReport.mtimeMs && latestCurrentMtimeMs > visualReviewReport.mtimeMs)
    },
    demos: artifacts
  };
}

function artifactInventoryEntry(
  kind: string,
  path: string,
  classification: string,
  runtimeEvidence?: JsonRecord
): JsonRecord & { readonly path: string; readonly exists: boolean; readonly requiredForDemo: boolean; readonly mtimeMs?: number } {
  const evidence = fileEvidence(path);
  const dimensions = /\.png$/i.test(path) ? pngDimensions(path) : undefined;
  const requiredForDemo = kind === "full" || kind === "viewport" || kind === "hero" || kind === "runtime-json";
  return {
    kind,
    classification,
    requiredForDemo,
    path,
    exists: evidence.exists,
    sha256: evidence.sha256,
    sizeBytes: evidence.sizeBytes,
    width: dimensions?.width,
    height: dimensions?.height,
    mtimeMs: evidence.mtimeMs,
    mtimeIso: evidence.mtimeIso,
    runtimeEvidenceSha256: getString(runtimeEvidence, "sha256"),
    runtimeEvidenceMtimeMs: getNumber(runtimeEvidence, "mtimeMs"),
    runtimeEvidenceMtimeIso: getString(runtimeEvidence, "mtimeIso"),
    hashMatchesRuntimeEvidence: evidence.exists && getString(runtimeEvidence, "sha256")
      ? evidence.sha256 === getString(runtimeEvidence, "sha256")
      : undefined
  };
}

function historicalArtifactCandidates(demoId: string, currentPaths: readonly string[]): readonly JsonRecord[] {
  const currentPathSet = new Set(currentPaths.map((path) => normalize(path)));
  const candidates: JsonRecord[] = [];
  for (const path of walkFiles("tests/reports")) {
    const normalized = normalize(path);
    if (currentPathSet.has(normalized)) continue;
    if (!path.includes(demoId)) continue;
    if (!/\.(png|json)$/i.test(path)) continue;
    const evidence = fileEvidence(path);
    const dimensions = /\.png$/i.test(path) ? pngDimensions(path) : undefined;
    candidates.push({
      path,
      exists: evidence.exists,
      sha256: evidence.sha256,
      sizeBytes: evidence.sizeBytes,
      width: dimensions?.width,
      height: dimensions?.height,
      mtimeMs: evidence.mtimeMs,
      mtimeIso: evidence.mtimeIso,
      candidateOnly: true
    });
  }
  return candidates.sort((left, right) => String(left.path).localeCompare(String(right.path)));
}

function walkFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const entries: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkFiles(path));
    } else if (entry.isFile()) {
      entries.push(path);
    }
  }
  return entries;
}

function currentDefectNotes(demo: DemoVisualReviewEvidence): readonly string[] {
  if (demo.id === "product-configurator") {
    return [
      "Current screenshot is visually failed until human review accepts exact hashes.",
      "Known risk: studio/stage quality, Product material clarity, grounding, crop/stage artifact, and RAF cadence.",
      "Original texture-backed Product GLBs must remain the subject; generated/support fixtures must not replace them."
    ];
  }
  if (demo.id === "data-galaxy") {
    return [
      "Current screenshot is visually failed until human review accepts exact hashes.",
      "Known risk: generated support authored GLB scaffold, weak focal subject, low contrast, CPU/static particles, and RAF cadence.",
      "No GPU compute or accepted premium authored hero claim is allowed from current evidence."
    ];
  }
  if (demo.id === "reactor-post") {
    return [
      "Current screenshot remains candidate until direct review confirms base scene clarity.",
      "Postprocess must improve a strong base scene and cannot hide weak geometry, noisy composition, or material problems."
    ];
  }
  return [];
}

function artifactBlockers(
  demo: typeof DEMOS[number],
  screenshotPath: string,
  viewportScreenshotPath: string,
  heroScreenshotPath: string,
  runtimeReportPath: string,
  runtimeReport: JsonRecord | undefined,
  screenshots: ScreenshotEvidenceSet | undefined,
  captureReadiness: CaptureReadinessSet | undefined
): string[] {
  const blockers: string[] = [];
  const demoId = demo.id;
  if (!existsSync(screenshotPath)) blockers.push(`${demoId} is missing full screenshot artifact: ${screenshotPath}`);
  if (!existsSync(viewportScreenshotPath)) blockers.push(`${demoId} is missing viewport screenshot artifact: ${viewportScreenshotPath}`);
  if (!existsSync(heroScreenshotPath)) blockers.push(`${demoId} is missing hero visual-review screenshot artifact: ${heroScreenshotPath}`);
  if (!runtimeReport) {
    blockers.push(`${demoId} is missing runtime screenshot report: ${runtimeReportPath}`);
    return blockers;
  }
  const capturedAt = getString(runtimeReport, "capturedAt");
  if (!capturedAt || !isValidIsoTimestamp(capturedAt)) blockers.push(`${demoId} runtime report is missing a valid capturedAt timestamp.`);
  const evidenceScope = getRecord(runtimeReport, "evidenceScope");
  if (getString(runtimeReport, "evidenceMode") !== "full-gallery"
    || getBoolean(evidenceScope, "fullGalleryRun") !== true
    || getBoolean(evidenceScope, "focusedRouteOnly") !== false) {
    blockers.push(`${demoId} runtime report is focused/partial evidence, not a full-gallery capture report; run pnpm v9:advanced-gallery before release review claims.`);
  }
  if (getString(runtimeReport, "visualReviewStatus") !== demo.visualReview.status) {
    blockers.push(`${demoId} runtime report visualReviewStatus does not match metadata status ${demo.visualReview.status}.`);
  }
  if (!screenshots?.full || !screenshots.viewport || !screenshots.hero) {
    blockers.push(`${demoId} runtime report is missing full/viewport/hero screenshot evidence hashes.`);
  }
  blockers.push(...captureReadinessBlockers(demoId, captureReadiness));
  blockers.push(...screenshotFreshnessBlockers(demoId, "full", screenshots?.full, screenshotPath, 30_000));
  blockers.push(...screenshotFreshnessBlockers(demoId, "viewport", screenshots?.viewport, viewportScreenshotPath, 30_000));
  blockers.push(...screenshotFreshnessBlockers(demoId, "hero", screenshots?.hero, heroScreenshotPath, 30_000));
  if (screenshots?.full?.sha256 && demo.visualReview.status === "accepted" && screenshots.full.sha256 !== demo.visualReview.screenshotSha256) {
    blockers.push(`${demoId} accepted metadata screenshotSha256 does not match the latest full screenshot evidence hash.`);
  }
  return blockers;
}

function buildPerformanceEvidence(demoId: string, runtime: JsonRecord | undefined): PerformanceEvidence | undefined {
  if (!runtime) return undefined;
  const timings = getRecord(runtime, "timings");
  const loopMs = getNumber(timings, "totalLoopMs");
  const renderMs = getNumber(timings, "renderMs");
  const budgetMs = maximumFrameMs(demoId);
  return {
    source: "app-runtime-timings",
    measuredFields: ["runtime.timings.totalLoopMs", "runtime.timings.renderMs"],
    acceptanceUsesRafFrameMs: false,
    budgetMs,
    loopMs,
    renderMs,
    rafFrameMs: getNumber(runtime, "frameMs"),
    measuredLoopAndRenderWorkPresent: loopMs !== undefined && renderMs !== undefined,
    loopWithinBudget: loopMs !== undefined ? loopMs <= budgetMs : undefined,
    renderWithinBudget: renderMs !== undefined ? renderMs <= budgetMs : undefined
  };
}

function performanceBlockers(demoId: string, evidence: PerformanceEvidence | undefined): string[] {
  if (!evidence) return [`${demoId} is missing app-runtime performance evidence.`];
  const blockers: string[] = [];
  if (!evidence.measuredLoopAndRenderWorkPresent) {
    blockers.push(`${demoId} is missing runtime.timings.totalLoopMs/renderMs; RAF frameMs is not accepted as release performance evidence.`);
    return blockers;
  }
  if ((evidence.loopMs ?? 0) < 0) blockers.push(`${demoId} measured loop work is negative.`);
  if ((evidence.renderMs ?? 0) < 0) blockers.push(`${demoId} measured render work is negative.`);
  if (evidence.loopWithinBudget === false) blockers.push(`${demoId} measured loop work ${evidence.loopMs}ms exceeds the ${evidence.budgetMs}ms route acceptance budget.`);
  if (evidence.renderWithinBudget === false) blockers.push(`${demoId} measured render work ${evidence.renderMs}ms exceeds the ${evidence.budgetMs}ms route acceptance budget.`);
  return blockers;
}

function buildImageQualityEvidence(demoId: string, pngStats: JsonRecord | undefined): ImageQualityEvidence {
  const thresholds = {
    uniqueColorBuckets: 400,
    foregroundCoverage: 0.14,
    centerForegroundCoverage: demoId === "data-galaxy" ? 0.12 : 0.16,
    detailEdgeDensity: minimumDetailEdgeDensity(demoId),
    localContrast: 35
  };
  const values = {
    uniqueColorBuckets: getNumber(pngStats, "uniqueColorBuckets"),
    foregroundCoverage: getNumber(pngStats, "foregroundCoverage"),
    centerForegroundCoverage: getNumber(pngStats, "centerForegroundCoverage"),
    detailEdgeDensity: getNumber(pngStats, "detailEdgeDensity"),
    localContrast: getNumber(pngStats, "localContrast")
  };
  const clarityScore = values.localContrast !== undefined
    && values.detailEdgeDensity !== undefined
    && values.centerForegroundCoverage !== undefined
    ? values.localContrast * values.detailEdgeDensity * values.centerForegroundCoverage
    : undefined;
  const blockers = imageQualityMetricBlockers(demoId, values, thresholds);
  return {
    source: "runtime-report-pngStats",
    target: "accepted-advanced-gallery-screenshot",
    thresholds,
    values: {
      ...values,
      clarityScore
    },
    pass: blockers.length === 0,
    blockers
  };
}

function imageQualityMetricBlockers(
  demoId: string,
  values: ImageQualityEvidence["values"],
  thresholds: ImageQualityEvidence["thresholds"]
): string[] {
  const blockers: string[] = [];
  if ((values.uniqueColorBuckets ?? 0) < thresholds.uniqueColorBuckets) {
    blockers.push(`${demoId} accepted image-quality uniqueColorBuckets ${values.uniqueColorBuckets ?? "missing"} is below ${thresholds.uniqueColorBuckets}.`);
  }
  if ((values.foregroundCoverage ?? 0) < thresholds.foregroundCoverage) {
    blockers.push(`${demoId} accepted image-quality foregroundCoverage ${values.foregroundCoverage ?? "missing"} is below ${thresholds.foregroundCoverage}.`);
  }
  if ((values.centerForegroundCoverage ?? 0) < thresholds.centerForegroundCoverage) {
    blockers.push(`${demoId} accepted image-quality centerForegroundCoverage ${values.centerForegroundCoverage ?? "missing"} is below ${thresholds.centerForegroundCoverage}.`);
  }
  if ((values.detailEdgeDensity ?? 0) < thresholds.detailEdgeDensity) {
    blockers.push(`${demoId} accepted image-quality detailEdgeDensity ${values.detailEdgeDensity ?? "missing"} is below ${thresholds.detailEdgeDensity}.`);
  }
  if ((values.localContrast ?? 0) < thresholds.localContrast) {
    blockers.push(`${demoId} accepted image-quality localContrast ${values.localContrast ?? "missing"} is below ${thresholds.localContrast}.`);
  }
  if (demoId === "data-galaxy" && (values.foregroundCoverage ?? 0) > 0.86 && (values.detailEdgeDensity ?? 0) > 0.05) {
    blockers.push(`${demoId} accepted image-quality foregroundCoverage ${values.foregroundCoverage} with detailEdgeDensity ${values.detailEdgeDensity} indicates noisy full-frame particle/line clutter rather than a curated hero composition.`);
  }
  return blockers;
}

function imageQualityBlockers(demo: typeof DEMOS[number], evidence: ImageQualityEvidence): string[] {
  if (demo.visualReview.status !== "accepted") return [];
  return [...evidence.blockers];
}

function imageQualityWarnings(demo: typeof DEMOS[number], evidence: ImageQualityEvidence): string[] {
  if (demo.visualReview.status === "accepted" || evidence.pass) return [];
  return evidence.blockers.map((blocker) =>
    blocker.replace("accepted image-quality", "candidate image-quality")
  );
}

function automatedVisualQualityWarnings(
  demoId: string,
  runtime: JsonRecord | undefined,
  authored: JsonRecord | undefined,
  pngStats: JsonRecord | undefined
): string[] {
  const warnings: string[] = [];
  const environmentBackground = getRecord(runtime, "environmentBackground");
  if (
    getString(environmentBackground, "visibleBackgroundUsage") === "diagnostic-proof-only"
    && getBoolean(environmentBackground, "activeInCurrentFrame") === true
  ) {
    warnings.push(`${demoId} is rendering a diagnostic-only HDRI as the live showcase background; default captures should use the art-directed route backdrop while keeping HDRI lighting evidence.`);
  }
  if (demoId === "data-galaxy" && (getNumber(pngStats, "foregroundCoverage") ?? 0) > 0.86 && (getNumber(pngStats, "detailEdgeDensity") ?? 0) > 0.05) {
    warnings.push("data-galaxy has excessive full-frame particle/connection coverage; current numeric metrics reward noisy clutter, so human review must reject it until the hero mode reduces diagnostic overlays.");
  }
  if ((demoId === "product-configurator" || demoId === "data-galaxy") && (getNumber(runtime, "fps") ?? 60) < 12) {
    warnings.push(`${demoId} RAF cadence is below 12 FPS during capture; loop/render work may pass, but the screenshot run is not healthy enough to present as a polished interactive showcase.`);
  }
  if (demoId === "product-configurator" || demoId === "data-galaxy") {
    const materialDiagnostics = getRecordArray(authored, "materialDiagnostics");
    const textureCount = getNumber(authored, "textureCount")
      ?? materialDiagnostics.reduce((total, diagnostic) => total + (getStringArray(diagnostic, "textureBackedMaterialNames")?.length ?? 0), 0);
    const drawItems = getNumber(authored, "drawItems") ?? materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "drawItems") ?? 0), 0);
    if ((drawItems ?? 0) > 0 && (textureCount ?? 0) <= 0) {
      warnings.push(`${demoId} authored GLB reports ${drawItems} draw items but no texture-backed material evidence; this is scaffold/content evidence, not premium Three.js-class material quality.`);
    }
  }
  return warnings;
}

function runtimeBlockers(
  demoId: string,
  runtime: JsonRecord | undefined,
  authored: JsonRecord | undefined,
  motion: JsonRecord | undefined,
  pngStats: JsonRecord | undefined,
  performance: PerformanceEvidence | undefined
): string[] {
  if (!runtime) return [`${demoId} runtime evidence is missing from report.`];
  const blockers: string[] = [];
  const status = getString(runtime, "status");
  if (status !== "running" && status !== "ready") blockers.push(`${demoId} runtime status is ${status ?? "missing"}.`);
  if ((getNumber(runtime, "frameCount") ?? 0) < 4) blockers.push(`${demoId} did not advance enough frames for screenshot evidence.`);
  if ((getNumber(runtime, "drawCalls") ?? 0) <= 0) blockers.push(`${demoId} reported zero draw calls.`);
  if ((getNumber(runtime, "width") ?? 0) < 1280 || (getNumber(runtime, "height") ?? 0) < 720) blockers.push(`${demoId} render target is below 1280x720.`);
  if ((getStringArray(runtime, "systems")?.length ?? 0) < 5) blockers.push(`${demoId} reports fewer than five visual systems.`);
  const authoredErrors = getStringArray(authored, "errors") ?? [];
  if (authoredErrors.length > 0) blockers.push(`${demoId} authored asset errors: ${authoredErrors.join("; ")}`);
  const motionRatio = getNumber(motion, "changedRatio") ?? 0;
  if (motionRatio <= 0) blockers.push(`${demoId} screenshot motion sample did not change.`);
  if (motionRatio > 0 && motionRatio < minimumMotionRatio(demoId)) blockers.push(`${demoId} screenshot motion changedRatio ${motionRatio} is below the route evidence floor.`);
  blockers.push(...performanceBlockers(demoId, performance));
  if ((getNumber(pngStats, "uniqueColorBuckets") ?? 0) < 80) blockers.push(`${demoId} screenshot color/detail bucket count is too low for even smoke evidence.`);
  if ((getNumber(pngStats, "foregroundCoverage") ?? 0) < 0.06) blockers.push(`${demoId} foreground coverage is too low for visual evidence.`);
  if ((getNumber(pngStats, "centerForegroundCoverage") ?? 0) < 0.04) blockers.push(`${demoId} centered hero coverage is too low for visual evidence.`);
  if ((getNumber(pngStats, "detailEdgeDensity") ?? 0) < 0.006) blockers.push(`${demoId} detail edge density is too low for visual evidence.`);
  if ((getNumber(pngStats, "localContrast") ?? 0) < 8) blockers.push(`${demoId} local contrast is too low for visual evidence.`);
  if (demoId === "data-galaxy" && (getNumber(pngStats, "detailEdgeDensity") ?? 0) > 0.075 && (getNumber(pngStats, "foregroundBoundsCoverage") ?? 0) > 0.94) {
    blockers.push("data-galaxy screenshot is dominated by full-frame particle/line detail; this is noisy diagnostic coverage, not accepted showcase composition.");
  }
  blockers.push(...authoredRuntimeBlockers(demoId, authored));
  return blockers;
}

function rendererEnvironmentBackgroundVisualDeltaBlockers(demoId: string, evidence: JsonRecord | undefined): string[] {
  if (demoId !== "product-configurator" && demoId !== "data-galaxy") return [];
  const blockers: string[] = [];
  const minimumChangedRatio = getNumber(evidence, "minimumChangedRatio") ?? 0;
  const minimumMeanDelta = getNumber(evidence, "minimumMeanDelta") ?? 0;
  const changedRatio = getNumber(evidence, "changedRatio") ?? 0;
  const meanDelta = getNumber(evidence, "meanDelta") ?? 0;
  const backgroundOnPath = join(reportDir, `${demoId}-renderer-environment-background-on.png`);
  const backgroundOffPath = join(reportDir, `${demoId}-renderer-environment-background-off.png`);
  if (!evidence) return [`${demoId} is missing rendererEnvironmentBackgroundVisualDeltaEvidence for Renderer.environmentBackground proof.`];
  if (getString(evidence, "source") !== "renderer-environment-background-on-off-screenshot-delta") {
    blockers.push(`${demoId} renderer environment background visual-delta evidence has an invalid source.`);
  }
  if (getString(evidence, "rendererSource") !== "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass") {
    blockers.push(`${demoId} renderer environment background visual-delta evidence does not cite loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass.`);
  }
  if (evidence.passed !== true) blockers.push(`${demoId} renderer environment background visual-delta evidence is not marked passed.`);
  if (changedRatio <= minimumChangedRatio) {
    blockers.push(`${demoId} renderer environment background visual-delta changedRatio ${changedRatio} is not greater than ${minimumChangedRatio}.`);
  }
  if (meanDelta <= minimumMeanDelta) {
    blockers.push(`${demoId} renderer environment background visual-delta meanDelta ${meanDelta} is not greater than ${minimumMeanDelta}.`);
  }
  blockers.push(...screenshotFreshnessBlockers(demoId, "renderer-environment-background-on", readScreenshotEntry(getRecord(evidence, "backgroundOnScreenshot")), backgroundOnPath, 30_000));
  blockers.push(...screenshotFreshnessBlockers(demoId, "renderer-environment-background-off", readScreenshotEntry(getRecord(evidence, "backgroundOffScreenshot")), backgroundOffPath, 30_000));
  return blockers;
}

function rendererFogVisualDeltaBlockers(demoId: string, evidence: JsonRecord | undefined): string[] {
  if (demoId !== "fog-cathedral" && demoId !== "robotics-lab") return [];
  const blockers: string[] = [];
  const minimumChangedRatio = getNumber(evidence, "minimumChangedRatio") ?? 0;
  const minimumMeanDelta = getNumber(evidence, "minimumMeanDelta") ?? 0;
  const changedRatio = getNumber(evidence, "changedRatio") ?? 0;
  const meanDelta = getNumber(evidence, "meanDelta") ?? 0;
  const fogOnPath = join(reportDir, `${demoId}-renderer-fog-on.png`);
  const fogOffPath = join(reportDir, `${demoId}-renderer-fog-off.png`);
  if (!evidence) return [`${demoId} is missing rendererFogVisualDeltaEvidence for Renderer.environmentFog proof.`];
  if (getString(evidence, "source") !== "renderer-fog-on-off-screenshot-delta") {
    blockers.push(`${demoId} renderer fog visual-delta evidence has an invalid source.`);
  }
  if (getString(evidence, "rendererSource") !== "Renderer.environmentFog -> ForwardPass.environmentFog") {
    blockers.push(`${demoId} renderer fog visual-delta evidence does not cite Renderer.environmentFog -> ForwardPass.environmentFog.`);
  }
  if (evidence.passed !== true) blockers.push(`${demoId} renderer fog visual-delta evidence is not marked passed.`);
  if (changedRatio <= minimumChangedRatio) {
    blockers.push(`${demoId} renderer fog visual-delta changedRatio ${changedRatio} is not greater than ${minimumChangedRatio}.`);
  }
  if (meanDelta <= minimumMeanDelta) {
    blockers.push(`${demoId} renderer fog visual-delta meanDelta ${meanDelta} is not greater than ${minimumMeanDelta}.`);
  }
  blockers.push(...screenshotFreshnessBlockers(demoId, "renderer-fog-on", readScreenshotEntry(getRecord(evidence, "fogOnScreenshot")), fogOnPath, 30_000));
  blockers.push(...screenshotFreshnessBlockers(demoId, "renderer-fog-off", readScreenshotEntry(getRecord(evidence, "fogOffScreenshot")), fogOffPath, 30_000));
  return blockers;
}

function authoredRuntimeBlockers(demoId: string, authored: JsonRecord | undefined): string[] {
  const blockers: string[] = [];
  const animationDiagnostics = getRecordArray(authored, "animationDiagnostics");
  const materialDiagnostics = getRecordArray(authored, "materialDiagnostics");
  const fallbackWhiteDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "fallbackWhiteDrawItems") ?? 0), 0);
  if (fallbackWhiteDrawItems > 0) blockers.push(`${demoId} has ${fallbackWhiteDrawItems} fallback/default white authored material draw items.`);
  const missingGeometryDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "missingGeometryDrawItems") ?? 0), 0);
  if (missingGeometryDrawItems > 0) blockers.push(`${demoId} has ${missingGeometryDrawItems} authored draw items with missing geometry resources.`);
  const missingMaterialDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "missingMaterialDrawItems") ?? 0), 0);
  if (missingMaterialDrawItems > 0) blockers.push(`${demoId} has ${missingMaterialDrawItems} authored draw items with missing material resources.`);
  if (demoId === "robotics-lab" || demoId === "digital-twin") {
    const skinnedAnimation = animationDiagnostics.some((diagnostic) =>
      (getNumber(diagnostic, "tracksApplied") ?? 0) > 0
      && (getNumber(diagnostic, "skinningPalettesUpdated") ?? 0) > 0
    );
    if (!skinnedAnimation) blockers.push(`${demoId} has no authored animation diagnostic with both tracksApplied and skinningPalettesUpdated.`);
  }
  if (demoId === "robotics-lab") {
    const skinnedDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "skinnedDrawItems") ?? 0), 0);
    const texturedSkinnedDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "texturedSkinnedDrawItems") ?? 0), 0);
    if (skinnedDrawItems <= 0) blockers.push("robotics-lab has no skinned authored draw-item diagnostics.");
    if (texturedSkinnedDrawItems <= 0) blockers.push("robotics-lab has no texture-backed skinned draw-item diagnostics.");
  }
  if (demoId === "product-configurator") {
    const authoredDrawItems = getNumber(authored, "drawItems") ?? materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "drawItems") ?? 0), 0);
    const texturedDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "texturedDrawItems") ?? 0), 0);
    const nonStudioTexturedDrawItems = materialDiagnostics.reduce((total, diagnostic) => {
      if (getString(diagnostic, "assetId") === "product-configurator-studio-blender") return total;
      return total + (getNumber(diagnostic, "texturedDrawItems") ?? 0);
    }, 0);
    if (authoredDrawItems > 0 && texturedDrawItems <= 0) {
      blockers.push("product-configurator has authored product geometry but zero texture-backed material draw items; this cannot be promoted as a premium PBR configurator screenshot.");
    }
    if (authoredDrawItems > 0 && nonStudioTexturedDrawItems <= 0) {
      blockers.push("product-configurator has no texture-backed non-studio hero GLB evidence; support/scaffold GLBs cannot carry premium product-configurator acceptance.");
    }
  }
  if (demoId === "data-galaxy") {
    const authoredDrawItems = getNumber(authored, "drawItems") ?? materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "drawItems") ?? 0), 0);
    const texturedDrawItems = materialDiagnostics.reduce((total, diagnostic) => total + (getNumber(diagnostic, "texturedDrawItems") ?? 0), 0);
    if (authoredDrawItems > 0 && texturedDrawItems <= 0) {
      blockers.push("data-galaxy active authored GLBs have zero texture-backed material draw items; this route cannot be accepted as premium showcase content until the focal subject is high-fidelity or the claim is strictly procedural-particle only.");
    }
  }
  return blockers;
}

function captureReadinessBlockers(demoId: string, readiness: CaptureReadinessSet | undefined): string[] {
  const blockers: string[] = [];
  if (!readiness?.full || !readiness.viewport || !readiness.hero) {
    blockers.push(`${demoId} runtime report is missing full/viewport/hero capture-readiness evidence.`);
  }
  const entries: Array<[keyof CaptureReadinessSet, CaptureReadinessEvidence | undefined, "none" | "hero"]> = [
    ["full", readiness?.full, "none"],
    ["viewport", readiness?.viewport, "none"],
    ["hero", readiness?.hero, "hero"]
  ];
  for (const [label, entry, expectedCapture] of entries) {
    if (!entry) continue;
    const prefix = `${demoId} ${label} capture-readiness`;
    if (entry.label !== label) blockers.push(`${prefix} label is ${entry.label ?? "missing"}.`);
    if (entry.demoId !== demoId) blockers.push(`${prefix} demoId is ${entry.demoId ?? "missing"}.`);
    if (entry.runtimeStatus !== "ready" && entry.runtimeStatus !== "running") blockers.push(`${prefix} runtime status is ${entry.runtimeStatus ?? "missing"}.`);
    if ((entry.frameCount ?? 0) < 4) blockers.push(`${prefix} frameCount is below the screenshot evidence floor.`);
    if ((entry.drawCalls ?? 0) <= 0) blockers.push(`${prefix} reported zero draw calls.`);
    if (entry.loadingHiddenAttribute !== true) blockers.push(`${prefix} did not prove #loading had the hidden attribute before screenshot capture.`);
    if (entry.loadingComputedDisplay !== "none") blockers.push(`${prefix} did not prove #loading computed display was none before screenshot capture.`);
    if (entry.loadingVisible !== false) blockers.push(`${prefix} reported the loading overlay visible before screenshot capture.`);
    if (entry.reviewCapture !== expectedCapture) blockers.push(`${prefix} reviewCapture mode is ${entry.reviewCapture ?? "missing"}, expected ${expectedCapture}.`);
    if ((entry.canvasWidth ?? 0) < 1000 || (entry.canvasHeight ?? 0) < 700) blockers.push(`${prefix} canvas backing size is below the capture floor.`);
    if ((entry.canvasCssWidth ?? 0) <= 0 || (entry.canvasCssHeight ?? 0) <= 0) blockers.push(`${prefix} canvas CSS size was not visible.`);
    if (entry.canvasVisible !== true) blockers.push(`${prefix} did not prove the canvas was visible.`);
  }
  return blockers;
}

function screenshotFreshnessBlockers(demoId: string, label: string, evidence: ScreenshotEvidence | undefined, expectedPath: string, minimumBytes: number): string[] {
  const blockers: string[] = [];
  if (!evidence) return blockers;
  const actual = fileEvidence(expectedPath);
  if (evidence.path !== expectedPath) blockers.push(`${demoId} ${label} screenshot evidence path ${evidence.path ?? "missing"} does not match expected ${expectedPath}.`);
  if (!evidence.sha256 || !/^[a-f0-9]{64}$/.test(evidence.sha256)) blockers.push(`${demoId} ${label} screenshot evidence is missing a lowercase SHA-256 hash.`);
  if ((evidence.sizeBytes ?? 0) < minimumBytes) blockers.push(`${demoId} ${label} screenshot evidence is below ${minimumBytes} bytes.`);
  if (evidence.mtimeMs === undefined || evidence.mtimeIso === undefined) blockers.push(`${demoId} ${label} screenshot evidence is missing artifact mtimeMs/mtimeIso.`);
  if (actual.exists && evidence.sha256 && actual.sha256 !== evidence.sha256) {
    blockers.push(`${demoId} ${label} screenshot hash is stale versus the current artifact.`);
  }
  if (actual.exists && evidence.sizeBytes !== undefined && actual.sizeBytes !== evidence.sizeBytes) {
    blockers.push(`${demoId} ${label} screenshot sizeBytes is stale versus the current artifact.`);
  }
  if (actual.mtimeMs !== undefined && evidence.mtimeMs !== undefined && !mtimesMatch(actual.mtimeMs, evidence.mtimeMs)) {
    blockers.push(`${demoId} ${label} screenshot mtimeMs is stale versus the current artifact.`);
  }
  if (actual.exists && evidence.mtimeIso !== undefined && actual.mtimeIso !== evidence.mtimeIso) {
    blockers.push(`${demoId} ${label} screenshot mtimeIso is stale versus the current artifact.`);
  }
  return blockers;
}

type JsonRecord = Record<string, unknown>;

async function buildContactSheetEvidence(demos: readonly DemoVisualReviewEvidence[]): Promise<ContactSheetEvidence> {
  const sources = demos.map((demo): ContactSheetSourceEvidence => {
    const actual = fileEvidence(demo.viewportScreenshotPath);
    return {
      ...actual,
      demoId: demo.id,
      title: demo.title,
      screenshotKind: contactSheetSourceKind,
      runtimeEvidenceSha256: demo.screenshots?.viewport?.sha256,
      runtimeEvidenceMtimeMs: demo.screenshots?.viewport?.mtimeMs,
      runtimeEvidenceMtimeIso: demo.screenshots?.viewport?.mtimeIso
    };
  });

  let generated = false;
  let generatedAt: string | undefined;
  let generationError: string | undefined;
  if (sources.every((source) => source.exists)) {
    try {
      await generateContactSheet(sources);
      generated = true;
      generatedAt = new Date().toISOString();
    } catch (error) {
      generationError = error instanceof Error ? error.message : String(error);
    }
  }

  const contactSheet = fileEvidence(contactSheetPath);
  const sourceSetSha256 = sources.every((source) => source.sha256 && source.mtimeMs !== undefined)
    ? createHash("sha256").update(JSON.stringify(sources.map((source) => ({
      demoId: source.demoId,
      path: source.path,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      mtimeMs: source.mtimeMs,
      mtimeIso: source.mtimeIso
    })))).digest("hex")
    : undefined;
  const sourceMtimes = sources.map((source) => source.mtimeMs).filter((mtime): mtime is number => mtime !== undefined);
  const latestSourceMtimeMs = sourceMtimes.length > 0 ? Math.max(...sourceMtimes) : undefined;
  const latestSourceMtimeIso = latestSourceMtimeMs !== undefined ? new Date(latestSourceMtimeMs).toISOString() : undefined;
  const blockers = contactSheetBlockers(contactSheet, sources, generationError, latestSourceMtimeMs);

  return {
    ...contactSheet,
    generated,
    generatedAt,
    generationError,
    sourceScreenshotKind: contactSheetSourceKind,
    sourceSetSha256,
    latestSourceMtimeMs,
    latestSourceMtimeIso,
    sources,
    blockers
  };
}

function contactSheetBlockers(
  contactSheet: FileEvidence,
  sources: readonly ContactSheetSourceEvidence[],
  generationError: string | undefined,
  latestSourceMtimeMs: number | undefined
): string[] {
  const blockers: string[] = [];
  const missingSources = sources.filter((source) => !source.exists);
  if (missingSources.length > 0) {
    blockers.push(`Contact sheet cannot be generated because viewport screenshot sources are missing: ${missingSources.map((source) => source.path).join(", ")}`);
  }
  if (generationError) blockers.push(`Contact sheet generation failed: ${generationError}`);
  if (!contactSheet.exists) {
    blockers.push(`Contact sheet is missing: ${contactSheet.path}`);
  } else {
    if ((contactSheet.sizeBytes ?? 0) < 30_000) blockers.push("Contact sheet artifact is too small to be credible screenshot evidence.");
    if (latestSourceMtimeMs !== undefined && contactSheet.mtimeMs !== undefined && contactSheet.mtimeMs + 1 < latestSourceMtimeMs) {
      blockers.push("Contact sheet is stale; it is older than at least one source viewport screenshot.");
    }
  }

  for (const source of sources) {
    const prefix = `${source.demoId} contact sheet source`;
    if (!source.exists) continue;
    if (!source.sha256 || !/^[a-f0-9]{64}$/.test(source.sha256)) blockers.push(`${prefix} is missing a current SHA-256 hash.`);
    if (source.mtimeMs === undefined || source.mtimeIso === undefined) blockers.push(`${prefix} is missing current mtime evidence.`);
    if (source.runtimeEvidenceSha256 !== source.sha256) {
      blockers.push(`${prefix} hash is not tied to the latest viewport screenshot evidence in the runtime report.`);
    }
    if (source.runtimeEvidenceMtimeMs === undefined || source.runtimeEvidenceMtimeIso === undefined) {
      blockers.push(`${prefix} runtime report evidence is missing mtimeMs/mtimeIso.`);
    } else if (source.mtimeMs !== undefined && !mtimesMatch(source.mtimeMs, source.runtimeEvidenceMtimeMs)) {
      blockers.push(`${prefix} mtime is not tied to the latest viewport screenshot evidence in the runtime report.`);
    }
    if (source.mtimeIso !== undefined && source.runtimeEvidenceMtimeIso !== undefined && source.mtimeIso !== source.runtimeEvidenceMtimeIso) {
      blockers.push(`${prefix} mtimeIso is not tied to the latest viewport screenshot evidence in the runtime report.`);
    }
  }

  return blockers;
}

async function generateContactSheet(sources: readonly ContactSheetSourceEvidence[]): Promise<void> {
  const columns = 2;
  const imageWidth = 1325;
  const imageHeight = 1150;
  const labelHeight = 34;
  const rows = Math.ceil(sources.length / columns);
  const width = columns * imageWidth;
  const height = rows * (labelHeight + imageHeight);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html, body {
  margin: 0;
  width: ${width}px;
  min-height: ${height}px;
  background: #0b0f14;
}
.sheet {
  display: grid;
  grid-template-columns: repeat(${columns}, ${imageWidth}px);
  width: ${width}px;
}
.tile {
  width: ${imageWidth}px;
  height: ${labelHeight + imageHeight}px;
  overflow: hidden;
  background: #0b0f14;
}
.label {
  box-sizing: border-box;
  height: ${labelHeight}px;
  padding: 7px 12px 0;
  color: #f5f7fb;
  background: #111827;
  font: 600 16px/20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
img {
  display: block;
  width: ${imageWidth}px;
  height: ${imageHeight}px;
  object-fit: cover;
}
</style>
</head>
<body>
<main class="sheet">
${sources.map((source) => `<section class="tile"><div class="label">${escapeHtml(source.title)} (${escapeHtml(source.demoId)})</div><img alt="${escapeHtml(source.demoId)} viewport screenshot" src="${pngDataUri(source.path)}"></section>`).join("\n")}
</main>
</body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: contactSheetPath, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

function readJson(path: string): JsonRecord | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : undefined;
}

function getRecord(record: JsonRecord | undefined, key: string): JsonRecord | undefined {
  if (!record) return undefined;
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function getRecordArray(record: JsonRecord | undefined, key: string): readonly JsonRecord[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function getString(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(record: JsonRecord | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringArray(record: JsonRecord | undefined, key: string): readonly string[] | undefined {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readScreenshotEvidence(report: JsonRecord | undefined): ScreenshotEvidenceSet | undefined {
  const screenshots = getRecord(report, "screenshots");
  if (!screenshots) {
    const fullPath = getString(report, "screenshotPath");
    const viewportPath = getString(report, "viewportScreenshotPath");
    const heroPath = getString(report, "heroScreenshotPath");
    if (!fullPath && !viewportPath && !heroPath) return undefined;
    return {
      full: fullPath ? {
        path: fullPath,
        sha256: getString(report, "screenshotSha256"),
        mtimeMs: getNumber(report, "screenshotMtimeMs"),
        mtimeIso: getString(report, "screenshotMtimeIso")
      } : undefined,
      viewport: viewportPath ? {
        path: viewportPath,
        sha256: getString(report, "viewportScreenshotSha256"),
        mtimeMs: getNumber(report, "viewportScreenshotMtimeMs"),
        mtimeIso: getString(report, "viewportScreenshotMtimeIso")
      } : undefined,
      hero: heroPath ? {
        path: heroPath,
        sha256: getString(report, "heroScreenshotSha256"),
        mtimeMs: getNumber(report, "heroScreenshotMtimeMs"),
        mtimeIso: getString(report, "heroScreenshotMtimeIso")
      } : undefined
    };
  }
  return {
    full: readScreenshotEntry(getRecord(screenshots, "full")),
    viewport: readScreenshotEntry(getRecord(screenshots, "viewport")),
    hero: readScreenshotEntry(getRecord(screenshots, "hero"))
  };
}

function readScreenshotEntry(record: JsonRecord | undefined): ScreenshotEvidence | undefined {
  if (!record) return undefined;
  return {
    path: getString(record, "path"),
    sha256: getString(record, "sha256"),
    sizeBytes: getNumber(record, "sizeBytes"),
    mtimeMs: getNumber(record, "mtimeMs"),
    mtimeIso: getString(record, "mtimeIso")
  };
}

function readCaptureReadiness(report: JsonRecord | undefined): CaptureReadinessSet | undefined {
  const captureReadiness = getRecord(report, "captureReadiness");
  if (!captureReadiness) return undefined;
  return {
    full: readCaptureReadinessEntry(getRecord(captureReadiness, "full")),
    viewport: readCaptureReadinessEntry(getRecord(captureReadiness, "viewport")),
    hero: readCaptureReadinessEntry(getRecord(captureReadiness, "hero"))
  };
}

function readCaptureReadinessEntry(record: JsonRecord | undefined): CaptureReadinessEvidence | undefined {
  if (!record) return undefined;
  return {
    label: getString(record, "label"),
    demoId: getString(record, "demoId"),
    frameCount: getNumber(record, "frameCount"),
    runtimeStatus: getString(record, "runtimeStatus"),
    drawCalls: getNumber(record, "drawCalls"),
    loadingHiddenAttribute: getBoolean(record, "loadingHiddenAttribute"),
    loadingComputedDisplay: getString(record, "loadingComputedDisplay"),
    loadingVisible: getBoolean(record, "loadingVisible"),
    reviewCapture: getString(record, "reviewCapture"),
    canvasWidth: getNumber(record, "canvasWidth"),
    canvasHeight: getNumber(record, "canvasHeight"),
    canvasCssWidth: getNumber(record, "canvasCssWidth"),
    canvasCssHeight: getNumber(record, "canvasCssHeight"),
    canvasVisible: getBoolean(record, "canvasVisible")
  };
}

function readAnimationDiagnostics(authored: JsonRecord): readonly AuthoredAnimationDiagnosticEvidence[] {
  return getRecordArray(authored, "animationDiagnostics").map((diagnostic) => ({
    assetId: getString(diagnostic, "assetId"),
    clip: getString(diagnostic, "clip"),
    time: getNumber(diagnostic, "time"),
    paused: getBoolean(diagnostic, "paused"),
    tracksApplied: getNumber(diagnostic, "tracksApplied"),
    morphWeightTracksApplied: getNumber(diagnostic, "morphWeightTracksApplied"),
    skinningPalettesUpdated: getNumber(diagnostic, "skinningPalettesUpdated")
  }));
}

function readMaterialDiagnostics(authored: JsonRecord): readonly AuthoredMaterialDiagnosticEvidence[] {
  return getRecordArray(authored, "materialDiagnostics").map((diagnostic) => ({
    assetId: getString(diagnostic, "assetId"),
    assetTitle: getString(diagnostic, "assetTitle"),
    label: getString(diagnostic, "label"),
    drawItems: getNumber(diagnostic, "drawItems"),
    skinnedDrawItems: getNumber(diagnostic, "skinnedDrawItems"),
    texturedDrawItems: getNumber(diagnostic, "texturedDrawItems"),
    texturedSkinnedDrawItems: getNumber(diagnostic, "texturedSkinnedDrawItems"),
    untexturedSkinnedDrawItems: getNumber(diagnostic, "untexturedSkinnedDrawItems"),
    fallbackWhiteDrawItems: getNumber(diagnostic, "fallbackWhiteDrawItems"),
    missingGeometryDrawItems: getNumber(diagnostic, "missingGeometryDrawItems"),
    missingMaterialDrawItems: getNumber(diagnostic, "missingMaterialDrawItems"),
    materialCount: getNumber(diagnostic, "materialCount"),
    textureCount: getNumber(diagnostic, "textureCount"),
    fallbackWhiteLabels: getStringArray(diagnostic, "fallbackWhiteLabels"),
    textureBackedMaterialNames: getStringArray(diagnostic, "textureBackedMaterialNames"),
    untexturedSkinnedLabels: getStringArray(diagnostic, "untexturedSkinnedLabels"),
    missingGeometryLabels: getStringArray(diagnostic, "missingGeometryLabels"),
    missingMaterialLabels: getStringArray(diagnostic, "missingMaterialLabels")
  }));
}

function readGateMaterialDiagnostics(authored: JsonRecord): readonly {
  readonly assetId?: string;
  readonly drawItems?: number;
  readonly texturedDrawItems?: number;
  readonly fallbackWhiteDrawItems?: number;
  readonly missingGeometryDrawItems?: number;
  readonly missingMaterialDrawItems?: number;
}[] {
  return getRecordArray(authored, "materialDiagnostics").map((diagnostic) => ({
    assetId: getString(diagnostic, "assetId"),
    drawItems: getNumber(diagnostic, "drawItems"),
    texturedDrawItems: getNumber(diagnostic, "texturedDrawItems"),
    fallbackWhiteDrawItems: getNumber(diagnostic, "fallbackWhiteDrawItems"),
    missingGeometryDrawItems: getNumber(diagnostic, "missingGeometryDrawItems"),
    missingMaterialDrawItems: getNumber(diagnostic, "missingMaterialDrawItems")
  }));
}

function readDataGalaxyRuntimeGateEvidence(evidence: JsonRecord | undefined): {
  readonly updateMode?: string;
  readonly gpuBackend?: {
    readonly supported?: boolean;
    readonly backend?: string;
    readonly nativeGpuComputeDispatches?: number;
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
} | undefined {
  if (!evidence) return undefined;
  const gpuBackend = getRecord(evidence, "gpuBackend");
  const focalHierarchy = getRecord(evidence, "focalHierarchy");
  const authoredAssetDisclosure = getRecord(evidence, "authoredAssetDisclosure");
  return {
    updateMode: getString(evidence, "updateMode"),
    gpuBackend: gpuBackend ? {
      supported: getBoolean(gpuBackend, "supported"),
      backend: getString(gpuBackend, "backend"),
      nativeGpuComputeDispatches: getNumber(gpuBackend, "nativeGpuComputeDispatches")
    } : undefined,
    focalHierarchy: focalHierarchy ? {
      centralSubject: getString(focalHierarchy, "centralSubject"),
      primaryLayerRole: getString(focalHierarchy, "primaryLayerRole"),
      supportLayerRole: getString(focalHierarchy, "supportLayerRole"),
      authoredGlbRole: getString(focalHierarchy, "authoredGlbRole")
    } : undefined,
    authoredAssetDisclosure: authoredAssetDisclosure ? {
      activeGeneratedAssetIds: getStringArray(authoredAssetDisclosure, "activeGeneratedAssetIds"),
      generatedNoTextureAuthoredGlb: getBoolean(authoredAssetDisclosure, "generatedNoTextureAuthoredGlb"),
      premiumTextureBackedAuthoredHero: getBoolean(authoredAssetDisclosure, "premiumTextureBackedAuthoredHero"),
      supportOnlyUntilVisualReview: getBoolean(authoredAssetDisclosure, "supportOnlyUntilVisualReview")
    } : undefined
  };
}

function getBoolean(record: JsonRecord | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileEvidence(path: string): FileEvidence {
  if (!existsSync(path)) return { path, exists: false };
  const stat = statSync(path);
  return {
    path,
    exists: true,
    sha256: sha256File(path),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    mtimeIso: stat.mtime.toISOString()
  };
}

function pngDimensions(path: string): { readonly width: number; readonly height: number } | undefined {
  if (!existsSync(path)) return undefined;
  const bytes = readFileSync(path);
  const isPng =
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng) return undefined;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function mtimesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pngDataUri(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function isValidIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && value.includes("T");
}

function minimumMotionRatio(demoId: string): number {
  if (demoId === "product-configurator") return 0.0002;
  if (demoId === "fog-cathedral") return 0.0004;
  if (demoId === "smart-city" || demoId === "data-galaxy" || demoId === "digital-twin") return 0.001;
  return 0.0006;
}

function minimumDetailEdgeDensity(demoId: string): number {
  if (demoId === "water-lab" || demoId === "ocean-observatory") return 0.028;
  if (demoId === "product-configurator" || demoId === "robotics-lab" || demoId === "fog-cathedral") return 0.028;
  return 0.035;
}

function maximumFrameMs(demoId: string): number {
  if (demoId === "reactor-post") return 80;
  if (demoId === "smart-city" || demoId === "digital-twin") return 55;
  if (demoId === "water-lab" || demoId === "ocean-observatory" || demoId === "fog-cathedral") return 45;
  return 34;
}
