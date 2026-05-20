import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createShadowAtlasLayout } from "../../packages/rendering/src/index.js";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

export interface V4ShadowMapReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly shadowMapParity: boolean;
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

const reportPath = "tests/reports/v4-shadow-map-readiness.json";
const sourceFiles = [
  "tools/v4-shadow-map-readiness/index.ts",
  "packages/rendering/src/ShadowMap.ts",
  "packages/rendering/src/ShadowPass.ts",
  "packages/rendering/src/ForwardPass.ts",
  "packages/rendering/src/Renderer.ts",
  "packages/rendering/src/LightUniforms.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "packages/rendering/src/CascadedShadowMaps.ts",
  "examples/shadow-lab/main.ts",
  "examples/forward-shadow-map-check/main.ts",
  "tests/browser/rendering-v4-visuals.spec.ts",
  "tests/browser/rendering-root-quality-gate.spec.ts",
  "tests/unit/rendering/shadow-pass.test.ts",
  "tests/reports/v4-root-rendering-quality.json",
  "tests/reports/v4-rendering.json",
  "tests/reports/v4-engine-comparison.json",
  "tests/reports/v4-shadow-visual-parity.json",
  "tools/v4-shadow-visual-parity/index.ts",
  "tests/reports/v4-external-engine-baselines.json",
] as const;

export function createV4ShadowMapReadinessReport(root = process.cwd()): V4ShadowMapReadinessReport {
  const rendering = readJson(root, "tests/reports/v4-rendering.json");
  const comparison = readJson(root, "tests/reports/v4-engine-comparison.json");
  const shadowVisual = readJson(root, "tests/reports/v4-shadow-visual-parity.json");
  const rootQuality = readJson(root, "tests/reports/v4-root-rendering-quality.json");
  const externalBaselines = readJson(root, "tests/reports/v4-external-engine-baselines.json");
  const validations = Array.isArray(rendering?.validations) ? rendering.validations : [];
  const shadowLab = validations.find((entry) => isRecord(entry) && entry.name === "shadow-lab-v4-preset");
  const shadowResize = validations.find((entry) => isRecord(entry) && entry.name === "shadow-lab-resize-dpr2-stability");
  const forwardShadowMap = validations.find((entry) => isRecord(entry) && entry.name === "forward-pass-shadow-map-sampling");
  const shadowChecks = isRecord(shadowLab) && isRecord(shadowLab.checks) ? shadowLab.checks : {};
  const shadowMetrics = isRecord(shadowLab) && isRecord(shadowLab.metrics) ? shadowLab.metrics : {};
  const resizeChecks = isRecord(shadowResize) && isRecord(shadowResize.checks) ? shadowResize.checks : {};
  const forwardShadowChecks = isRecord(forwardShadowMap) && isRecord(forwardShadowMap.checks) ? forwardShadowMap.checks : {};
  const forwardShadowMetrics = isRecord(forwardShadowMap) && isRecord(forwardShadowMap.metrics) ? forwardShadowMap.metrics : {};
  const shadowAtlasCascadeSelection = hasShadowAtlasCascadeSelectionEvidence();
  const boundedShadowVisualParity = shadowVisual?.ok === true &&
    isRecord(shadowVisual.boundedShadowVisualParity) &&
    shadowVisual.boundedShadowVisualParity.threejs === true &&
    shadowVisual.boundedShadowVisualParity.babylon === true;
  const pointSpotShadowPassDiagnostics = shadowChecks.pointShadowFaces === true &&
    Number(shadowMetrics.pointShadowFaces) === 6 &&
    shadowChecks.spotShadowRendered === true &&
    Number(shadowMetrics.spotPcfSamples) >= 9;
  const productionSpotForwardSampling = hasSpotForwardShadowSamplingEvidence(root);
  const productionPointLightForwardSampling = hasPointForwardShadowSamplingEvidence(root);
  const productionRootForwardSampling = hasRootForwardShadowMapSamplingEvidence(root);
  const rootShadowResizeStability = hasRootShadowResizeStability(rootQuality);
  const rootPointSpotDirectionalDiagnostics = productionRootForwardSampling && productionSpotForwardSampling && productionPointLightForwardSampling;

  const supportedEvidence = [
    ...(shadowChecks.shadowFeature === true ? ["directional-shadow-map-feature"] : []),
    ...(shadowChecks.cascadesRendered === true && Number(shadowMetrics.cascadeCount) >= 3 ? ["cascaded-shadow-map-browser-evidence"] : []),
    ...(shadowChecks.pcfPenumbra === true && Number(shadowMetrics.pcfSamples) >= 9 ? ["pcf-soft-shadow-browser-evidence"] : []),
    ...(pointSpotShadowPassDiagnostics || rootPointSpotDirectionalDiagnostics ? ["point-spot-shadow-pass-diagnostic-evidence"] : []),
    ...(shadowChecks.projectedShadowDarker === true ? ["lit-vs-shadowed-pixel-readback"] : []),
    ...(hasForwardShadowMapSamplingEvidence(forwardShadowChecks, forwardShadowMetrics) || productionRootForwardSampling ? ["production-forward-pass-shadow-map-sampling-evidence"] : []),
    ...(productionSpotForwardSampling ? ["production-spot-forward-shadow-map-sampling-evidence"] : []),
    ...(productionPointLightForwardSampling ? ["production-point-light-forward-shadow-map-sampling-evidence"] : []),
    ...(shadowAtlasCascadeSelection ? ["local-shadow-atlas-cascade-selection-evidence"] : []),
    ...(resizeChecks.dprReady === true && resizeChecks.resizedReady === true || rootShadowResizeStability ? ["resize-and-dpr-stability"] : []),
    ...(boundedShadowVisualParity ? ["bounded-threejs-babylon-shadow-visual-parity"] : []),
    ...(hasExternalBaselineSlot(externalBaselines, "shadow-visual") ? ["prepared-external-unity-unreal-shadow-visual-baseline-slot"] : []),
  ];
  const blockedEvidence = [
    "actual-Unity/Unreal-shadow-runner-evidence-sidecars-and-baseline-reports",
    "same-scene-shadow-pixel-parity-against-Unity/Unreal",
    ...(hasForwardShadowMapSamplingEvidence(forwardShadowChecks, forwardShadowMetrics) || productionRootForwardSampling ? [] : ["production-forward-pass-shadow-sampling-parity"]),
    ...(productionSpotForwardSampling ? [] : ["production-spot-forward-shadow-map-sampling"]),
    ...(productionPointLightForwardSampling ? [] : ["production-point-light-cubemap-or-atlas-forward-shadow-map-sampling"]),
    ...(shadowAtlasCascadeSelection ? [] : ["local-shadow-atlas-cascade-selection-evidence"]),
    "Unity/Unreal-shadow-atlas-cascade-selection-parity",
  ];
  const validationRows = [
    validation("directional-cascaded-pcf-browser-evidence", supportedEvidence.length >= 7, "tests/reports/v4-rendering.json:shadow-lab-v4-preset + tests/reports/v4-root-rendering-quality.json", [
      `only ${supportedEvidence.length} supported shadow evidence rows are present`,
    ]),
    validation("shadow-resize-dpr-stability", resizeChecks.dprShadowDarker === true && resizeChecks.resizedShadowDarker === true || rootShadowResizeStability, "tests/reports/v4-rendering.json:shadow-lab-resize-dpr2-stability + tests/reports/v4-root-rendering-quality.json", [
      "shadow lab resize/DPR stability is not proven",
    ]),
    validation("competitor-shadow-visual-parity", comparison?.shadowMapParity === true || boundedShadowVisualParity, "tests/reports/v4-shadow-visual-parity.json", [
      "bounded same-layout shadow visual parity against Three.js and Babylon.js is not proven",
    ]),
    validation("directional-plus-point-spot-shadow-pass-diagnostics", pointSpotShadowPassDiagnostics || rootPointSpotDirectionalDiagnostics, "tests/reports/v4-rendering.json:shadow-lab-v4-preset + packages/rendering root tests", [
      "directional shadow-map evidence plus bounded point/spot diagnostic pass evidence is not complete",
    ]),
    validation("production-spot-forward-shadow-map-sampling", productionSpotForwardSampling, "packages/rendering/src/Renderer.ts + packages/rendering/src/LightUniforms.ts + tests/unit/rendering/renderer.test.ts", [
      "renderer-owned spot projected shadow-map sampling is not proven through the forward path",
    ]),
    validation("production-point-light-forward-shadow-map-sampling", productionPointLightForwardSampling, "packages/rendering/src/Renderer.ts", [
      "point-light cubemap/atlas shadow sampling is still blocked or not verified through renderer-owned forward uniforms",
    ]),
    validation("production-forward-pass-shadow-map-sampling", hasForwardShadowMapSamplingEvidence(forwardShadowChecks, forwardShadowMetrics) || productionRootForwardSampling, "tests/browser/rendering-webgl2.spec.ts:shadowMapDiagnostics", [
      "forward PBR shader sampling of a bound shadow-map texture is not proven",
    ]),
    validation("local-shadow-atlas-cascade-selection", shadowAtlasCascadeSelection, "packages/rendering/src/ShadowMap.ts + tests/unit/rendering/shadow-pass.test.ts", [
      "deterministic local shadow atlas packing and cascade-order selection evidence is missing",
    ]),
    validation("external-shadow-baseline-prepared-slot", hasExternalBaselineSlot(externalBaselines, "shadow-visual"), "tests/reports/v4-external-engine-baselines.json", [
      "external Unity/Unreal shadow visual baseline slot is not prepared",
    ]),
  ];
  const shadowMapParity = validationRows.every((entry) => entry.passed) && blockedEvidence.length === 0;
  const violations = [
    ...validationRows.flatMap((entry) => entry.blockers.map((blocker) => `${entry.id}: ${blocker}`)),
    ...blockedEvidence.map((blocker) => `shadow-map-parity-blocked: ${blocker}`),
  ];
  return {
    ...baseReport(root, {
      ok: validationRows.slice(0, 2).every((entry) => entry.passed),
      command: "pnpm audit:v4-shadow-map-readiness",
      runIdPrefix: "v4-shadow-map-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "production shadow-map parity",
        "broad better-than-Three.js language",
        "broad better-than-Babylon.js language",
      ],
    }),
    auditComplete: true,
    shadowMapParity,
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

function hasForwardShadowMapSamplingEvidence(checks: Record<string, unknown>, metrics: Record<string, unknown>): boolean {
  return checks.ready === true &&
    checks.renderer === true &&
    checks.forwardPassShadowMapSampling === true &&
    checks.shadowTextureBound === true &&
    checks.generatedShadowMapTexture === true &&
    checks.depthPassRenderTarget === true &&
    checks.lightCastsShadow === true &&
    checks.litVsShadowedPixelReadback === true &&
    Number(metrics.generatedDepthRgb) < 750 &&
    Number(metrics.deltaRgb) > 25 &&
    Number(metrics.drawCalls) >= 2;
}

function hasShadowAtlasCascadeSelectionEvidence(): boolean {
  const layout = createShadowAtlasLayout([
    { id: "cascade-2", size: 128, cascadeIndex: 2 },
    { id: "spot-key", size: 128 },
    { id: "cascade-0", size: 256, cascadeIndex: 0 },
    { id: "cascade-1", size: 128, cascadeIndex: 1 },
    { id: "point-face-0", size: 64 }
  ], 512);
  return layout.allocations.length === 5 &&
    layout.allocations.map((allocation) => allocation.id).join(",") === "cascade-0,cascade-1,cascade-2,spot-key,point-face-0" &&
    layout.allocations[0]?.x === 0 &&
    layout.allocations[0]?.y === 0 &&
    layout.allocations[0]?.width === 256 &&
    layout.allocations[3]?.x === 0 &&
    layout.allocations[3]?.y === 256 &&
    layout.allocations[4]?.x === 128 &&
    layout.allocations[4]?.y === 256 &&
    layout.utilization === 0.453125;
}

function hasSpotForwardShadowSamplingEvidence(root: string): boolean {
  const renderer = readText(root, "packages/rendering/src/Renderer.ts");
  const lightUniforms = readText(root, "packages/rendering/src/LightUniforms.ts");
  const rendererTests = readText(root, "tests/unit/rendering/renderer.test.ts");
  return renderer.includes("light instanceof SpotLight") &&
    renderer.includes("perspectiveMat4(light.angle * 2") &&
    lightUniforms.includes("forwardShadowSupported = light.castsShadow") &&
    rendererTests.includes("renders renderer-owned spot shadow maps through the projected forward shadow path") &&
    rendererTests.includes("expect(lightData[14]).toBe(1)");
}

function hasPointForwardShadowSamplingEvidence(root: string): boolean {
  const renderer = readText(root, "packages/rendering/src/Renderer.ts");
  const forwardPass = readText(root, "packages/rendering/src/ForwardPass.ts");
  const lightUniforms = readText(root, "packages/rendering/src/LightUniforms.ts");
  const shaderLibrary = readText(root, "packages/rendering/src/ShaderLibrary.ts");
  const rendererTests = readText(root, "tests/unit/rendering/renderer.test.ts");
  return renderer.includes("executeRendererPointShadowMap") &&
    renderer.includes("createPointShadowFaceMatrices") &&
    renderer.includes("createPointShadowFaceRects") &&
    renderer.includes("u_pointShadowMapTexture") &&
    forwardPass.includes("ForwardPointShadowMapOptions") &&
    forwardPass.includes("u_pointShadowFaceMatrices") &&
    forwardPass.includes("u_pointShadowFaceRects") &&
    lightUniforms.includes("forwardShadowSupported = light.castsShadow") &&
    shaderLibrary.includes("g3dPointShadowFactor") &&
    shaderLibrary.includes("g3dTexturedPbrPointShadowFactor") &&
    rendererTests.includes("renders renderer-owned point shadow maps through a six-face atlas forward path") &&
    rendererTests.includes("expect(forwardUniforms?.get(\"u_pointShadowMapEnabled\")).toBe(1)") &&
    rendererTests.includes("expect(faceMatrices).toHaveLength(96)") &&
    rendererTests.includes("expect(faceRects).toHaveLength(24)");
}

function hasRootForwardShadowMapSamplingEvidence(root: string): boolean {
  const harness = readText(root, "tests/browser/rendering-webgl2-harness.ts");
  const browserTest = readText(root, "tests/browser/rendering-webgl2.spec.ts");
  return harness.includes("ShadowPass") &&
    harness.includes("getForwardShadowMap") &&
    harness.includes("shadowMap: forwardShadowMap") &&
    harness.includes("shadowedReceiverPixel") &&
    harness.includes("litReceiverPixel") &&
    browserTest.includes("expect(result?.shadowMapDiagnostics?.drawCalls).toBe(2)") &&
    browserTest.includes("expect(result?.shadowMapDiagnostics?.lastError).toBeNull()") &&
    browserTest.includes("expect(lir + lig + lib).toBeGreaterThan(shr + shg + shb + 80)") &&
    browserTest.includes("expect(sha).toBe(255)") &&
    browserTest.includes("expect(lia).toBe(255)");
}

function hasRootShadowResizeStability(report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true || !isRecord(report.shadowResizeStability)) return false;
  const shadowResizeStability = report.shadowResizeStability;
  const frames = Array.isArray(shadowResizeStability.frames) ? shadowResizeStability.frames : [];
  return shadowResizeStability.dprShadowDarker === true &&
    shadowResizeStability.resizedShadowDarker === true &&
    shadowResizeStability.resizedDrawCallsStable === true &&
    shadowResizeStability.scaledShadowMap === true &&
    frames.length === 2 &&
    frames.every((frame) => isRecord(frame) && Number(frame.drawCalls) === 2 && frame.lastError === null && Number(frame.shadowDeltaRgb) > 60);
}

function readText(root: string, path: string): string {
  try {
    return readFileSync(`${root}/${path}`, "utf8");
  } catch {
    return "";
  }
}

function hasExternalBaselineSlot(report: Record<string, unknown> | null, baselineKind: string): boolean {
  return report?.ok === true &&
    Array.isArray(report.sceneSlots) &&
    report.sceneSlots.some((slot) => isRecord(slot) && slot.baselineKind === baselineKind);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4ShadowMapReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    shadowMapParity: report.shadowMapParity,
    supportedEvidence: report.supportedEvidence,
    blockedEvidence: report.blockedEvidence,
    report: reportPath,
  }, null, 2));
}
