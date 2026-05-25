import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface V4HdrRenderTargetReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly hdrRenderTargetParity: boolean;
  readonly supportedEvidence: readonly string[];
  readonly blockedEvidence: readonly string[];
  readonly validations: readonly {
    readonly id: string;
    readonly passed: boolean;
    readonly evidence: string;
    readonly blockers: readonly string[];
  }[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/external-parity-hdr-render-target-readiness.json";
const sourceFiles = [
  "tools/external-parity-hdr-render-target-readiness/index.ts",
  "packages/rendering/src/PostProcessPass.ts",
  "packages/rendering/src/EnvironmentMapResources.ts",
  "packages/rendering/src/RendererFeatureGates.ts",
  "examples/hdr-render-target-check/main.ts",
  "examples/postprocess-lab/main.ts",
  "tests/browser/hdr-render-target-external-parity.spec.ts",
  "tests/browser/rendering-root-quality-gate.spec.ts",
  "tests/browser/rendering-external-parity-visuals.spec.ts",
  "tests/reports/external-parity-root-rendering-quality.json",
  "tests/unit/rendering/environment-map-resources.test.ts",
  "tests/unit/rendering/render-resources.test.ts",
  "tests/reports/external-parity-hdr-render-target-browser.json",
  "tests/reports/external-parity-hdr-visual-parity.json",
  "tests/reports/external-parity-hdr-ibl-readiness.json",
  "tools/external-parity-hdr-visual-parity/index.ts",
  "tools/external-parity-hdr-ibl-readiness/index.ts",
  "tests/reports/external-parity-rendering.json",
  "tests/reports/external-parity-webgpu-parity.json",
  "tests/reports/external-parity-engine-comparison.json",
  "tests/reports/external-parity-external-engine-baselines.json",
] as const;

export function createV4HdrRenderTargetReadinessReport(root = process.cwd()): V4HdrRenderTargetReadinessReport {
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const webgpu = readJson(root, "tests/reports/external-parity-webgpu-parity.json");
  const comparison = readJson(root, "tests/reports/external-parity-engine-comparison.json");
  const hdrBrowser = readJson(root, "tests/reports/external-parity-hdr-render-target-browser.json");
  const hdrVisual = readJson(root, "tests/reports/external-parity-hdr-visual-parity.json");
  const hdrIbl = readJson(root, "tests/reports/external-parity-hdr-ibl-readiness.json");
  const rootQuality = readJson(root, "tests/reports/external-parity-root-rendering-quality.json");
  const externalBaselines = readJson(root, "tests/reports/external-parity-external-engine-baselines.json");
  const validations = Array.isArray(rendering?.validations) ? rendering.validations : [];
  const postprocess = validations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-runtime-color-management-controls");
  const postprocessPreset = validations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-v4-preset");
  const postprocessChecks = isRecord(postprocess) && isRecord(postprocess.checks) ? postprocess.checks : {};
  const presetChecks = isRecord(postprocessPreset) && isRecord(postprocessPreset.checks) ? postprocessPreset.checks : {};
  const boundedHdrVisualParity = hasBoundedHdrVisualParity(hdrVisual);
  const boundedHdrIblEvidence = hasBoundedHdrIblEvidence(hdrIbl);
  const rootColorManagementControls = hasRootColorManagementControls(rootQuality);
  const rootToneMappingPresetEvidence = hasRootToneMappingPresetEvidence(rootQuality);
  const supportedEvidence = [
    ...(postprocessChecks.colorManagementStateMatchesControls === true || rootColorManagementControls ? ["runtime-tone-mapper-exposure-white-point-controls"] : []),
    ...(postprocessChecks.linearSrgbCalibrationProof === true || rootColorManagementControls ? ["linear-srgb-calibration-browser-evidence"] : []),
    ...(postprocessChecks.oldBranchPresetEvidence === true || rootToneMappingPresetEvidence ? ["tone-mapping-preset-and-auto-exposure-histogram-evidence"] : []),
    ...(presetChecks.realSceneInput === true ? ["real-scene-ldr-postprocess-readback"] : []),
    ...(presetChecks.advancedPostprocess === true ? ["postprocess-suite-real-scene-readback"] : []),
    ...(hasHdrBrowserFloatEvidence(hdrBrowser) ? ["rgba32f-webgl2-render-target-browser-evidence", "browser-readback-from-float-hdr-targets"] : []),
    ...(hasHdrPostprocessToneMappingEvidence(hdrBrowser) ? ["hdr-float-postprocess-tone-mapping-evidence"] : []),
    ...(hasWebGPUHdrRenderTargetPostprocessEvidence(webgpu) ? ["real-webgpu-hdr-render-target-postprocess-evidence"] : []),
    ...(boundedHdrVisualParity ? ["bounded-threejs-babylon-hdr-render-target-visual-parity"] : []),
    ...(boundedHdrIblEvidence ? ["bounded-linear-hdr-ibl-resource-and-material-evidence"] : []),
    ...(hasExternalBaselineSlot(externalBaselines, "hdr-render-target") ? ["prepared-external-unity-unreal-hdr-render-target-baseline-slot"] : []),
    "environment-map-resource-generation-and-brdf-lut-validation",
  ];
  const blockedEvidence = [
    ...(hasHdrBrowserFloatEvidence(hdrBrowser) ? [] : ["floating-point-color-render-targets", "browser-readback-from-float-hdr-targets"]),
    ...(hasWebGPUHdrRenderTargetPostprocessEvidence(webgpu) ? [] : ["real-WebGPU-HDR-render-target-postprocess-evidence"]),
    ...(boundedHdrIblEvidence ? [] : ["HDR-image-based-lighting-resource-and-material-evidence"]),
    "actual-Unity/Unreal-HDR-runner-evidence-sidecars-and-baseline-reports",
    "same-scene-HDR-IBL-comparison-against-Unity/Unreal",
    ...(boundedHdrVisualParity ? ["same-scene-HDR-render-target-comparison-against-Unity/Unreal"] : ["same-scene-HDR-render-target-comparison-against-Three.js/Babylon/Unity/Unreal"]),
  ];
  const validationRows = [
    validation("real-scene-tone-mapping-controls", supportedEvidence.includes("runtime-tone-mapper-exposure-white-point-controls") && supportedEvidence.includes("linear-srgb-calibration-browser-evidence"), "tests/reports/external-parity-rendering.json:postprocess-lab-runtime-color-management-controls", [
      "runtime tone mapper/color-space controls are not proven",
    ]),
    validation("auto-exposure-histogram-controls", supportedEvidence.includes("tone-mapping-preset-and-auto-exposure-histogram-evidence"), "tests/reports/external-parity-rendering.json:postprocess-lab-runtime-color-management-controls", [
      "tone-mapping preset and auto-exposure histogram evidence are not proven",
    ]),
    validation("environment-resource-evidence", supportedEvidence.includes("environment-map-resource-generation-and-brdf-lut-validation"), "packages/rendering/src/EnvironmentMapResources.ts", []),
    validation("bounded-hdr-ibl-evidence", boundedHdrIblEvidence, "tests/reports/external-parity-hdr-ibl-readiness.json", [
      "bounded linear-HDR IBL material and flagship screenshot evidence is missing",
    ]),
    validation("floating-point-hdr-render-targets", hasHdrBrowserFloatEvidence(hdrBrowser), "tests/reports/external-parity-hdr-render-target-browser.json", [
      "floating-point HDR render target browser evidence is missing",
    ]),
    validation("real-webgpu-hdr-render-target-postprocess", hasWebGPUHdrRenderTargetPostprocessEvidence(webgpu), "tests/reports/external-parity-webgpu-parity.json:real-webgpu-hdr-render-target-postprocess", [
      "real WebGPU HDR render-target float readback and tone-mapping postprocess evidence is missing",
    ]),
    validation("competitor-hdr-parity", comparison?.hdrRenderTargetParity === true || boundedHdrVisualParity, "tests/reports/external-parity-hdr-visual-parity.json", [
      "same-scene HDR/render-target parity against competitors is not proven",
    ]),
    validation("external-hdr-baseline-prepared-slot", hasExternalBaselineSlot(externalBaselines, "hdr-render-target"), "tests/reports/external-parity-external-engine-baselines.json", [
      "external Unity/Unreal HDR render-target baseline slot is not prepared",
    ]),
  ];
  const hdrRenderTargetParity = validationRows.every((entry) => entry.passed) && blockedEvidence.length === 0;
  const violations = [
    ...validationRows.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`)),
    ...blockedEvidence.map((blocker) => `hdr-render-target-parity-blocked: ${blocker}`),
  ];
  return {
    ...baseReport(root, {
      ok: validationRows.slice(0, 2).every((entry) => entry.passed),
      command: "pnpm audit:external-parity-hdr-render-target-readiness",
      runIdPrefix: "external-parity-hdr-render-target-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "production HDR/render-target parity",
        "full postprocess-suite parity",
        "production-ready language",
      ],
    }),
    auditComplete: true,
    hdrRenderTargetParity,
    supportedEvidence,
    blockedEvidence,
    validations: validationRows,
    violations,
  };
}

function validation(id: string, passed: boolean, evidence: string, blockers: readonly string[]) {
  return {
    id,
    passed,
    evidence,
    blockers: passed ? [] : blockers,
  };
}

function hasHdrBrowserFloatEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.state)) return false;
  const state = report.state;
  const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
  const metrics = isRecord(state.metrics) ? state.metrics : {};
  return state.status === "ready" &&
    state.format === "rgba32f" &&
    featureEvidence.hdrRenderTargets === true &&
    featureEvidence.floatReadback === true &&
    featureEvidence.browserFloatFramebuffer === true &&
    featureEvidence.sampleOverOne === true &&
    featureEvidence.hdrPostprocessToneMapping === true &&
    Number(metrics.sampleR) > 1;
}

function hasBoundedHdrVisualParity(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.boundedHdrRenderTargetParity)) return false;
  return report.boundedHdrRenderTargetParity.threejs === true &&
    report.boundedHdrRenderTargetParity.babylon === true &&
    report.productionHdrRenderTargetParity === false;
}

function hasBoundedHdrIblEvidence(report: Record<string, unknown> | null): boolean {
  return report?.ok === true &&
    report.boundedHdrIblEvidence === true &&
    report.productionHdrIblParity === false;
}

function hasHdrPostprocessToneMappingEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.state)) return false;
  const state = report.state;
  const featureEvidence = isRecord(state.featureEvidence) ? state.featureEvidence : {};
  const metrics = isRecord(state.metrics) ? state.metrics : {};
  return featureEvidence.hdrPostprocessToneMapping === true &&
    Number(metrics.hdrToneMappedR) > 150 &&
    Number(metrics.hdrToneMappedR) < 255 &&
    Number(metrics.hdrToneMappedOverbrightPixels) >= 1;
}

function hasRootColorManagementControls(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.postprocessSuite)) return false;
  const postprocessSuite = report.postprocessSuite;
  const colorManagement = isRecord(postprocessSuite.colorManagement) ? postprocessSuite.colorManagement : {};
  const controls = isRecord(colorManagement.controls) ? colorManagement.controls : {};
  const calibration = isRecord(colorManagement.calibration) ? colorManagement.calibration : {};
  return controls.toneMapper === "filmic" &&
    Number(controls.exposure) === 1.25 &&
    controls.inputColorSpace === "linear" &&
    controls.outputColorSpace === "srgb" &&
    calibration.operator === "aces" &&
    calibration.monotonic === true &&
    calibration.inputColorSpace === "srgb" &&
    calibration.outputColorSpace === "srgb";
}

function hasRootToneMappingPresetEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.postprocessSuite)) return false;
  const postprocessSuite = report.postprocessSuite;
  const effects = isRecord(postprocessSuite.effects) ? postprocessSuite.effects : {};
  const colorManagement = isRecord(postprocessSuite.colorManagement) ? postprocessSuite.colorManagement : {};
  const preset = isRecord(colorManagement.preset) ? colorManagement.preset : {};
  return effects.toneMappingPresets === true &&
    effects.autoExposure === true &&
    preset.name === "cinematic" &&
    Number(preset.histogramPixelCount) > 0 &&
    Number(preset.histogramBinCount) >= 32 &&
    Number(preset.averageLuminance) > 0 &&
    Number(preset.autoExposure) > 0;
}

function hasWebGPUHdrRenderTargetPostprocessEvidence(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.featureMatrix)) return false;
  if (report.featureMatrix.realWebGPUHdrRenderTargetPostprocess !== true) return false;
  const cases = Array.isArray(report.cases) ? report.cases : [];
  return cases.some((entry) => {
    if (!isRecord(entry) || entry.name !== "real-webgpu-hdr-render-target-postprocess" || entry.status !== "pass") return false;
    const details = isRecord(entry.details) ? entry.details : {};
    const diagnostics = isRecord(details.diagnostics) ? details.diagnostics : {};
    const toneMapped = isRecord(details.toneMapped) ? details.toneMapped : {};
    return details.format === "rgba16f" &&
      details.sampleOverOne === true &&
      Number(diagnostics.drawCalls) >= 1 &&
      Number(diagnostics.nativeSubmissions) >= 1 &&
      Number(toneMapped.inputOverbrightPixels) >= 1 &&
      Number(toneMapped.maxInputValue) > 1 &&
      Array.isArray(toneMapped.firstPixel);
  });
}

function hasExternalBaselineSlot(report: Record<string, unknown> | null, baselineKind: string): boolean {
  return report?.ok === true &&
    Array.isArray(report.sceneSlots) &&
    report.sceneSlots.some((slot) => isRecord(slot) && slot.baselineKind === baselineKind);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4HdrRenderTargetReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    hdrRenderTargetParity: report.hdrRenderTargetParity,
    supportedEvidence: report.supportedEvidence,
    blockedEvidence: report.blockedEvidence,
    report: reportPath,
  }, null, 2));
}
