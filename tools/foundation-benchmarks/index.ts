import { fileURLToPath } from "node:url";
import { pathExists, reportOk, type V3EvidenceCheck } from "../foundation-subsystem-report/index.js";
import { baseReport, isRecord, readJson, writeJson } from "../foundation-reporting/index.js";

const root = process.cwd();
const comparisonReport = readJson(root, "tests/reports/foundation-engine-comparison.json");
const supportedNicheClaims = Array.isArray(comparisonReport?.supportedNicheClaims) ? comparisonReport.supportedNicheClaims : [];
const benchmarkSummary = inspectComparisonReport(comparisonReport);
const sourceFiles = [
  "docs/project/v3-examples-and-benchmarks-plan.md",
  "tools/compare-engines/index.ts",
  "tests/browser/engine-comparison.spec.ts",
  "tests/reports/foundation-comparison-threejs.json",
  "tests/reports/foundation-comparison-babylon.json",
  "benchmarks/fixtures/assets/manifest.json",
  "benchmarks/shared/scenes/descriptor.ts",
  "examples/foundation-editor-authored-app/project.json",
  "examples/foundation-editor-authored-app/runtime.js",
  "tests/reports/foundation-editor-authoring.json",
  ...[
    "product-configurator",
    "architecture-viewer",
    "asset-render",
    "pbr-materials",
    "large-scene",
    "instancing",
    "skinned-characters",
    "particles",
    "editor-authored-startup",
  ].flatMap((scene) => [
    `benchmarks/shared/scenes/${scene}.ts`,
    `benchmarks/aura3d/src/scenes/${scene}.ts`,
    `benchmarks/threejs/src/scenes/${scene}.ts`,
    `benchmarks/babylon/src/scenes/${scene}.ts`,
  ]),
];
const screenshotPaths = [
  "tests/reports/comparison-threejs-audit.png",
  "tests/reports/comparison-babylon-audit.png",
];
const checks: readonly V3EvidenceCheck[] = [
  {
    id: "threejs-comparison-report",
    description: "Three.js comparison report exists and passes.",
    passed: reportOk(root, "tests/reports/foundation-comparison-threejs.json"),
    evidencePaths: ["tests/reports/foundation-comparison-threejs.json"],
    blocker: "Three.js comparison report is missing or failing.",
  },
  {
    id: "babylon-comparison-report",
    description: "Babylon.js comparison report exists and passes.",
    passed: reportOk(root, "tests/reports/foundation-comparison-babylon.json"),
    evidencePaths: ["tests/reports/foundation-comparison-babylon.json"],
    blocker: "Babylon.js comparison report is missing or failing.",
  },
  {
    id: "shared-v3-scene-descriptors",
    description: "Shared v3 benchmark scene descriptors exist.",
    passed: pathExists(root, "benchmarks/shared/scenes"),
    evidencePaths: ["benchmarks/shared/scenes"],
    blocker: "benchmarks/shared/scenes is not implemented yet.",
  },
  {
    id: "defined-niche-advantage",
    description: "A generated report defines exact narrow Aura3D advantage with explicit caveats.",
    passed: supportedNicheClaims.length > 0,
    evidencePaths: ["tests/reports/foundation-engine-comparison.json"],
    blocker: "No v3 benchmark report currently proves a defined niche advantage.",
  },
  {
    id: "same-scene-measurements",
    description: "Every benchmark scene records Aura3D, Three.js, and Babylon.js estimates from equivalent scene descriptors.",
    passed: benchmarkSummary.sameSceneMeasurements,
    evidencePaths: ["tests/reports/foundation-engine-comparison.json", "tests/browser/engine-comparison.spec.ts"],
    blocker: "Benchmark report is missing same-scene measurements for one or more engines.",
  },
  {
    id: "editor-authored-exported-app-startup",
    description: "Editor-authored exported app startup is compared as a same exported-project workflow across Aura3D, Three.js, and Babylon.js benchmark wrappers.",
    passed: benchmarkSummary.editorAuthoredStartupWorkflow,
    evidencePaths: ["benchmarks/shared/scenes/editor-authored-startup.ts", "examples/foundation-editor-authored-app/project.json", "tests/reports/foundation-editor-authoring.json", "tests/reports/foundation-engine-comparison.json"],
    blocker: "Editor-authored exported app startup workflow is missing or is not compared across all three benchmark engines.",
  },
  {
    id: "metric-coverage",
    description: "Benchmark report includes startup, load, first-frame, frame, memory/resource, bundle, and screenshot data.",
    passed: benchmarkSummary.metricCoverage,
    evidencePaths: ["tests/reports/foundation-engine-comparison.json", "tests/reports/comparison-screenshots"],
    blocker: "Benchmark report is missing required startup/load/frame/memory/resource/screenshot metrics.",
  },
  {
    id: "unsupported-feature-comparison",
    description: "Benchmark outcomes list unsupported features and do not hide missing behavior.",
    passed: benchmarkSummary.unsupportedFeatureComparison,
    evidencePaths: ["tests/reports/foundation-engine-comparison.json"],
    blocker: "Benchmark report is missing unsupported-feature comparison data.",
  },
  {
    id: "honest-outcome-caveats",
    description: "Benchmark report keeps broad win claims blocked and lists weaker or unmeasured areas.",
    passed: benchmarkSummary.honestOutcomeCaveats,
    evidencePaths: ["tests/reports/foundation-engine-comparison.json"],
    blocker: "Benchmark report does not clearly block broad claims or list weaker/unmeasured areas.",
  },
];
const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
const base = baseReport(root, {
  ok: violations.length === 0,
  command: "pnpm verify:foundation-benchmarks",
  runIdPrefix: "foundation-benchmarks",
  sourceFiles,
  screenshotPaths,
  violations,
});
const report = {
  ...comparisonReport,
  ...base,
  suite: comparisonReport?.suite ?? "v3-engine-comparison",
  subsystem: "same-scene-engine-comparison",
  checks,
  comparisonReportPreserved: true,
};
writeJson(root, "tests/reports/foundation-engine-comparison.json", report);

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function inspectComparisonReport(report: Record<string, unknown> | null): {
  readonly sameSceneMeasurements: boolean;
  readonly metricCoverage: boolean;
  readonly unsupportedFeatureComparison: boolean;
  readonly honestOutcomeCaveats: boolean;
  readonly editorAuthoredStartupWorkflow: boolean;
} {
  const scenes = Array.isArray(report?.scenes) ? report.scenes : [];
  const expectedScenes = new Set([
    "product-configurator",
    "architecture-viewer",
    "asset-render",
    "pbr-materials",
    "large-scene",
    "instancing",
    "skinned-characters",
    "particles",
    "editor-authored-startup",
  ]);
  const sameSceneMeasurements =
    scenes.length === expectedScenes.size &&
    scenes.every((scene) => {
      if (!isRecord(scene) || scene.equivalent !== true || typeof scene.id !== "string" || !expectedScenes.has(scene.id)) return false;
      const estimates = isRecord(scene.estimates) ? scene.estimates : {};
      return ["aura3d", "threejs", "babylon"].every((engine) => isRecord(estimates[engine]));
    });
  const metricCoverage =
    sameSceneMeasurements &&
    scenes.every((scene) => {
      if (!isRecord(scene) || !isRecord(scene.estimates)) return false;
      const estimates = scene.estimates;
      return ["aura3d", "threejs", "babylon"].every((engine) => hasRequiredMetrics(estimates[engine]));
    });
  const outcomes = isRecord(report?.comparisonOutcomes) && isRecord(report.comparisonOutcomes.byCompetitor)
    ? report.comparisonOutcomes.byCompetitor
    : {};
  const unsupportedFeatureComparison =
    metricCoverage &&
    ["threejs", "babylon"].every((competitor) => {
      const outcome = outcomes[competitor];
      if (!isRecord(outcome) || !Array.isArray(outcome.scenes) || outcome.scenes.length !== expectedScenes.size) return false;
      return outcome.scenes.every((scene) => isRecord(scene) && Array.isArray(scene.unsupportedFeatures) && scene.unsupportedFeatures.length > 0);
    });
  const honestOutcomeCaveats =
    report?.claimUsable === false &&
    typeof report.claimCaveat === "string" &&
    report.claimCaveat.includes("Broad competitive claims remain unsupported") &&
    Array.isArray(report.featureComparison) &&
    report.featureComparison.length > 0;
  const editorStartupScene = scenes.find((scene) => isRecord(scene) && scene.id === "editor-authored-startup");
  const editorAuthoredStartupWorkflow =
    sameSceneMeasurements &&
    isRecord(editorStartupScene) &&
    isRecord(editorStartupScene.workflow) &&
    editorStartupScene.workflow.kind === "editor-authored-exported-app-startup" &&
    ["aura3d", "threejs", "babylon"].every((engine) => {
      const estimates = isRecord(editorStartupScene.estimates) ? editorStartupScene.estimates : {};
      const estimate = estimates[engine];
      return isRecord(estimate) &&
        isRecord(estimate.editorWorkflow) &&
        estimate.editorWorkflow.kind === "editor-authored-exported-app-startup" &&
        typeof estimate.editorWorkflow.projectBytes === "number" &&
        estimate.editorWorkflow.projectBytes > 0 &&
        typeof estimate.editorWorkflow.runtimeBytes === "number" &&
        estimate.editorWorkflow.runtimeBytes > 0 &&
        typeof estimate.editorWorkflow.operationCount === "number" &&
        estimate.editorWorkflow.operationCount >= 2;
    });
  return { sameSceneMeasurements, metricCoverage, unsupportedFeatureComparison, honestOutcomeCaveats, editorAuthoredStartupWorkflow };
}

function hasRequiredMetrics(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.startupMs) &&
    isRecord(value.assetLoadMs) &&
    isRecord(value.firstFrameMs) &&
    isRecord(value.frameTimeMs) &&
    isRecord(value.memoryMb) &&
    typeof value.drawCalls === "number" &&
    typeof value.shaderCount === "number" &&
    typeof value.textureCount === "number" &&
    typeof value.textureBytes === "number" &&
    typeof value.geometryBytesEstimate === "number" &&
    typeof value.bundleBytes === "number" &&
    typeof value.screenshotPath === "string" &&
    pathExists(root, value.screenshotPath) &&
    Array.isArray(value.unsupportedFeatures)
  );
}
