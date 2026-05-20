import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

export interface V4PostprocessSuiteReadinessReport {
  readonly ok: boolean;
  readonly screenshotPaths: readonly string[];
  readonly auditComplete: true;
  readonly postprocessSuiteParity: boolean;
  readonly implementedEffects: readonly string[];
  readonly realSceneEffects: readonly string[];
  readonly blockedEffects: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/v4-postprocess-suite.json";
const sourceFiles = [
  "tools/v4-postprocess-suite/index.ts",
  "packages/rendering/src/PostProcessPass.ts",
  "examples/postprocess-lab/main.ts",
  "tests/browser/rendering-v4-visuals.spec.ts",
  "tests/unit/rendering/render-graph.test.ts",
  "tests/reports/v4-rendering.json",
  "tests/reports/v4-webgpu-parity.json",
  "tests/reports/v4-engine-comparison.json",
  "tests/reports/v4-hdr-render-target-browser.json",
  "tests/reports/v4-hdr-ibl-readiness.json",
  "tests/reports/v4-external-engine-baselines.json",
] as const;

export function createV4PostprocessSuiteReadinessReport(root = process.cwd()): V4PostprocessSuiteReadinessReport {
  const rendering = readJson(root, "tests/reports/v4-rendering.json");
  const webgpu = readJson(root, "tests/reports/v4-webgpu-parity.json");
  const comparison = readJson(root, "tests/reports/v4-engine-comparison.json");
  const hdrBrowser = readJson(root, "tests/reports/v4-hdr-render-target-browser.json");
  const hdrIbl = readJson(root, "tests/reports/v4-hdr-ibl-readiness.json");
  const externalBaselines = readJson(root, "tests/reports/v4-external-engine-baselines.json");
  const screenshotPaths = collectPostprocessSuiteEvidencePaths({ rendering, comparison, hdrBrowser });
  const validations = Array.isArray(rendering?.validations) ? rendering.validations : [];
  const preset = validations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-v4-preset");
  const colorManagement = validations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-runtime-color-management-controls");
  const grading = validations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-runtime-color-grading-controls");
  const presetChecks = isRecord(preset) && isRecord(preset.checks) ? preset.checks : {};
  const presetMetrics = isRecord(preset) && isRecord(preset.metrics) ? preset.metrics : {};
  const colorManagementChecks = isRecord(colorManagement) && isRecord(colorManagement.checks) ? colorManagement.checks : {};
  const gradingChecks = isRecord(grading) && isRecord(grading.checks) ? grading.checks : {};

  const implementedEffects = [
    "tone-mapping",
    "tone-mapping-presets",
    "auto-exposure",
    "bloom",
    "fxaa",
    "color-grading",
    "vignette",
    "sharpening",
    "depth-visualization",
    "chromatic-aberration",
    "film-grain",
    "depth-of-field",
    "outline",
    "motion-blur",
    "ssao",
    "ssr",
    "taa",
  ] as const;
  const realSceneEffects = [
    ...(presetChecks.postprocessFeatures === true ? ["tone-mapping", "bloom", "fxaa", "depth-visualization"] : []),
    ...(colorManagementChecks.oldBranchPresetEvidence === true ? ["tone-mapping-presets", "auto-exposure"] : []),
    ...(presetChecks.colorGrading === true && gradingChecks.vignetteAndSharpeningActive === true ? ["color-grading", "vignette", "sharpening"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.chromaticAberrationChangedPixels) > 0 ? ["chromatic-aberration"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.filmGrainChangedPixels) > 0 ? ["film-grain"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.depthOfFieldBlurredPixels) > 0 ? ["depth-of-field"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.outlineChangedPixels) > 0 ? ["outline"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.motionBlurredPixels) > 0 ? ["motion-blur"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.ssaoOccludedPixels) > 0 ? ["ssao"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.ssrReflectedPixels) > 0 ? ["ssr"] : []),
    ...(presetChecks.advancedPostprocess === true && Number(presetMetrics.taaBlendedPixels) > 0 ? ["taa"] : []),
  ];
  const blockedEffects = [
    ...(hasHdrFloatPostprocessEvidence(hdrBrowser) && hasWebGPUHdrPostprocessEvidence(webgpu) ? [] : ["production-hdr-postprocess"]),
    ...(hasBoundedHdrIblEvidence(hdrIbl) ? [] : ["bounded-hdr-image-based-lighting-resource-evidence"]),
    "actual-unity-unreal-postprocess-runner-evidence-sidecars-and-baseline-reports",
    "unity-unreal-same-scene-hdr-image-based-lighting-parity",
    "unity-unreal-same-scene-postprocess-parity",
  ] as const;
  const validationRows = [
    validation("postprocess-lab-real-scene-suite", presetChecks.realSceneInput === true && realSceneEffects.length >= 10, "tests/reports/v4-rendering.json:postprocess-lab-v4-preset", [
      ...(presetChecks.realSceneInput === true ? [] : ["postprocess lab does not prove real-scene input"]),
      ...(realSceneEffects.length >= 10 ? [] : [`only ${realSceneEffects.length} real-scene effects are proven`]),
    ]),
    validation("postprocess-color-controls", gradingChecks.gradingControlsPublished === true && gradingChecks.advancedPostprocessActive === true, "tests/reports/v4-rendering.json:postprocess-lab-runtime-color-grading-controls", [
      ...(gradingChecks.gradingControlsPublished === true ? [] : ["color grading controls are not proven"]),
      ...(gradingChecks.advancedPostprocessActive === true ? [] : ["advanced postprocess effects are not proven active under runtime controls"]),
    ]),
    validation("old-branch-tone-mapping-preset-port", colorManagementChecks.oldBranchPresetEvidence === true, "tests/reports/v4-rendering.json:postprocess-lab-runtime-color-management-controls", [
      "old-branch tone-mapping presets and auto-exposure histogram evidence are not proven in browser state",
    ]),
    validation("competitor-postprocess-visual-parity", hasBoundedPostprocessComparison(comparison), "tests/reports/v4-engine-comparison.json", [
      "same-scene bounded postprocess visual parity against Three.js and Babylon.js is not proven",
    ]),
    validation("hdr-float-postprocess-tone-mapping", hasHdrFloatPostprocessEvidence(hdrBrowser), "tests/reports/v4-hdr-render-target-browser.json", [
      "HDR float render-target readback is not proven through the postprocess tone-mapping path",
    ]),
    validation("webgpu-hdr-postprocess-tone-mapping", hasWebGPUHdrPostprocessEvidence(webgpu), "tests/reports/v4-webgpu-parity.json:real-webgpu-hdr-render-target-postprocess", [
      "real WebGPU HDR render-target readback is not proven through the postprocess tone-mapping path",
    ]),
    validation("bounded-hdr-image-based-lighting", hasBoundedHdrIblEvidence(hdrIbl), "tests/reports/v4-hdr-ibl-readiness.json", [
      "bounded linear-HDR image-based-lighting evidence is missing",
    ]),
    validation("external-postprocess-baseline-prepared-slot", hasExternalBaselineSlot(externalBaselines, "postprocess-suite"), "tests/reports/v4-external-engine-baselines.json", [
      "external Unity/Unreal postprocess-suite baseline slot is not prepared",
    ]),
    validation("full-suite-no-blocked-effects", false, "tools/v4-postprocess-suite/index.ts", [
      `blocked effects remain: ${blockedEffects.join(", ")}`,
    ]),
  ];
  const violations = validationRows.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`));
  const postprocessSuiteParity = validationRows.every((entry) => entry.passed) && blockedEffects.length === 0;
  return {
    ...baseReport(root, {
      ok: validationRows.slice(0, 2).every((entry) => entry.passed),
      command: "pnpm audit:v4-postprocess-suite",
      runIdPrefix: "v4-postprocess-suite",
      sourceFiles,
      screenshotPaths,
      violations,
      blockedClaims: [
        "full postprocess-suite parity",
        "production-ready language",
        "broad better-than-Three.js language",
        "broad better-than-Babylon.js language",
      ],
    }),
    auditComplete: true,
    postprocessSuiteParity,
    implementedEffects,
    realSceneEffects,
    blockedEffects,
    validations: validationRows,
    violations,
  };
}

export function collectPostprocessSuiteEvidencePaths(reports: {
  readonly rendering?: Record<string, unknown> | null;
  readonly comparison?: Record<string, unknown> | null;
  readonly hdrBrowser?: Record<string, unknown> | null;
}): readonly string[] {
  const renderingValidations = Array.isArray(reports.rendering?.validations) ? reports.rendering.validations : [];
  const renderingValidationPaths = renderingValidations.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.screenshotPath !== "string") return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    return name.includes("postprocess") ? [entry.screenshotPath] : [];
  });
  const comparisonDiffs = Array.isArray(reports.comparison?.screenshotDiffs) ? reports.comparison.screenshotDiffs : [];
  const comparisonDiffPaths = comparisonDiffs.flatMap((entry) => {
    if (!isRecord(entry) || entry.sceneId !== "postprocess") return [];
    return [entry.baselinePath, entry.comparedPath, entry.diffPath].filter((path): path is string => typeof path === "string" && path.length > 0);
  });
  return [...new Set([
    ...stringArray(reports.rendering?.screenshotPaths).filter((path) => path.includes("postprocess")),
    ...renderingValidationPaths,
    ...comparisonDiffPaths,
    ...comparisonArtifactPaths(reports.comparison, "renderedBenchmarkVisuals", "postprocess"),
    ...comparisonArtifactPaths(reports.comparison, "screenshotDiffs", "postprocess"),
    ...stringArray(reports.hdrBrowser?.screenshotPaths).filter((path) => path.includes("hdr") || path.includes("postprocess")),
  ])];
}

function comparisonArtifactPaths(report: Record<string, unknown> | null | undefined, artifactName: string, pattern: string): string[] {
  const artifacts = isRecord(report?.artifacts) ? report.artifacts : {};
  const artifact = isRecord(artifacts[artifactName]) ? artifacts[artifactName] : {};
  return stringArray(artifact.paths).filter((path) => path.includes(pattern));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function hasHdrFloatPostprocessEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.state)) return false;
  const state = report.state;
  const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
  const metrics = isRecord(state.metrics) ? state.metrics : {};
  return featureEvidence.hdrPostprocessToneMapping === true &&
    Number(metrics.sampleR) > 1 &&
    Number(metrics.hdrToneMappedR) > 150 &&
    Number(metrics.hdrToneMappedR) < 255 &&
    Number(metrics.hdrToneMappedOverbrightPixels) >= 1;
}

function hasWebGPUHdrPostprocessEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.featureMatrix)) return false;
  if (report.featureMatrix.realWebGPUHdrRenderTargetPostprocess !== true) return false;
  const cases = Array.isArray(report.cases) ? report.cases : [];
  return cases.some((entry) => {
    if (!isRecord(entry) || entry.name !== "real-webgpu-hdr-render-target-postprocess" || entry.status !== "pass") return false;
    const details = isRecord(entry.details) ? entry.details : {};
    const toneMapped = isRecord(details.toneMapped) ? details.toneMapped : {};
    return details.sampleOverOne === true &&
      Number(toneMapped.inputOverbrightPixels) >= 1 &&
      Number(toneMapped.maxInputValue) > 1 &&
      Array.isArray(toneMapped.firstPixel);
  });
}

function hasBoundedHdrIblEvidence(report: Record<string, unknown> | null): boolean {
  return report?.ok === true &&
    report.boundedHdrIblEvidence === true &&
    report.productionHdrIblParity === false;
}

function hasBoundedPostprocessComparison(report: Record<string, unknown> | null): boolean {
  const diffs = Array.isArray(report?.screenshotDiffs) ? report.screenshotDiffs : [];
  return ["threejs", "babylon"].every((engine) => diffs.some((diff) => {
    if (!isRecord(diff) || diff.sceneId !== "postprocess" || diff.comparedEngine !== engine || diff.pass !== true) return false;
    const thresholds = isRecord(diff.thresholds) ? diff.thresholds : {};
    const changedPixelRatio = Number(diff.changedPixelRatio);
    const meanAbsoluteError = Number(diff.meanAbsoluteError);
    const maxChangedPixelRatio = Number(thresholds.maxChangedPixelRatio);
    const maxMeanAbsoluteError = Number(thresholds.maxMeanAbsoluteError);
    return Number.isFinite(changedPixelRatio) &&
      Number.isFinite(meanAbsoluteError) &&
      Number.isFinite(maxChangedPixelRatio) &&
      Number.isFinite(maxMeanAbsoluteError) &&
      changedPixelRatio <= maxChangedPixelRatio &&
      meanAbsoluteError <= maxMeanAbsoluteError;
  }));
}

function hasExternalBaselineSlot(report: Record<string, unknown> | null, baselineKind: string): boolean {
  return report?.ok === true &&
    Array.isArray(report.sceneSlots) &&
    report.sceneSlots.some((slot) => isRecord(slot) && slot.baselineKind === baselineKind);
}

function validation(id: string, passed: boolean, evidence: string, blockers: readonly string[]) {
  return {
    id,
    passed,
    evidence,
    blockers: passed ? [] : blockers,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4PostprocessSuiteReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    postprocessSuiteParity: report.postprocessSuiteParity,
    implementedEffects: report.implementedEffects.length,
    realSceneEffects: report.realSceneEffects.length,
    blockedEffects: report.blockedEffects,
    report: reportPath,
  }, null, 2));
}
