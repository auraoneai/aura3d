import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../v4-reporting/index.js";

const root = process.cwd();
const reportPath = "tests/reports/v4-engine-comparison.json";
const expectedScenes = [
  "product-configurator",
  "architecture-viewer",
  "asset-render",
  "pbr-materials",
  "postprocess",
  "large-scene",
  "instancing",
  "skinned-characters",
  "morph-characters",
  "particles",
  "editor-authored-startup",
] as const;

const sourceFiles = [
  "docs/project/v4-benchmarks-validation-plan.md",
  "docs/project/v4-decision-gates.md",
  "docs/project/v4-master-code-checklist.md",
  "tools/compare-engines/index.ts",
  "tools/v4-benchmarks/index.ts",
  "benchmarks/fixtures/assets/manifest.json",
  "benchmarks/shared/scenes/descriptor.ts",
  "tests/reports/v3-rendering.json",
  "tests/reports/v4-comparison-threejs.json",
  "tests/reports/v4-comparison-babylon.json",
  "examples/editor-authored-v3-app/project.json",
  "examples/editor-authored-v3-app/runtime.js",
  "tests/reports/v3-editor-authoring.json",
  ...expectedScenes.flatMap((scene) => [
    `benchmarks/shared/scenes/${scene}.ts`,
    `benchmarks/galileo/src/scenes/${scene}.ts`,
    `benchmarks/threejs/src/scenes/${scene}.ts`,
    `benchmarks/babylon/src/scenes/${scene}.ts`,
  ]),
];

const screenshotPaths = [
  ...expectedScenes.flatMap((scene) => [
    `tests/reports/comparison-screenshots/galileo-${scene}.png`,
    `tests/reports/comparison-screenshots/threejs-${scene}.png`,
    `tests/reports/comparison-screenshots/babylon-${scene}.png`,
  ]),
  ...expectedScenes.flatMap((scene) => [
    `tests/reports/comparison-rendered-screenshots/galileo-${scene}.png`,
    `tests/reports/comparison-rendered-screenshots/threejs-${scene}.png`,
    `tests/reports/comparison-rendered-screenshots/babylon-${scene}.png`,
  ]),
  ...expectedScenes.flatMap((scene) => [
    `tests/reports/comparison-diffs/threejs-${scene}.png`,
    `tests/reports/comparison-diffs/babylon-${scene}.png`,
  ]),
];

export function createV4BenchmarkReport() {
  const comparisonReport = readJson(root, reportPath);
  const summary = inspectComparisonReport(comparisonReport);
  const checks = [
    {
      id: "shared-v4-scene-descriptors",
      description: "Every required V4 benchmark scene uses a shared descriptor with material, postprocess, animation, and unsupported-feature metadata.",
      passed: summary.sharedDescriptors,
      evidencePaths: expectedScenes.map((scene) => `benchmarks/shared/scenes/${scene}.ts`),
      blocker: "One or more V4 shared benchmark descriptors are missing required metadata.",
    },
    {
      id: "same-scene-v4-engine-measurements",
      description: "Galileo3D, Three.js, and Babylon use equivalent scene descriptors and browser measurements for every V4 comparison scene.",
      passed: summary.sameSceneMeasurements,
      evidencePaths: [reportPath],
      blocker: "V4 engine comparison report is missing same-scene measurements for one or more engines.",
    },
    {
      id: "v4-metric-coverage",
      description: "V4 benchmark report includes startup, asset load, first frame, steady frame time, resource counts, memory estimate, and bundle size.",
      passed: summary.metricCoverage,
      evidencePaths: [reportPath],
      blocker: "V4 benchmark report is missing required metrics.",
    },
    {
      id: "v4-screenshot-diffs",
      description: "V4 benchmark report includes screenshots and Galileo-vs-competitor diff artifacts for every scene.",
      passed: summary.screenshotDiffCoverage,
      evidencePaths: ["tests/reports/comparison-screenshots", "tests/reports/comparison-diffs", reportPath],
      blocker: "V4 benchmark screenshots or diff artifacts are missing.",
    },
    {
      id: "v4-postprocess-bounded-scene",
      description: "Postprocess comparison is present only as bounded LDR tone-mapping/bloom/FXAA evidence linked to renderer reports.",
      passed: summary.postprocessBounded,
      evidencePaths: ["benchmarks/shared/scenes/postprocess.ts", "tests/reports/v3-rendering.json", reportPath],
      blocker: "V4 postprocess scene is missing bounded effect metadata or renderer evidence linkage.",
    },
    {
      id: "v4-morph-workload-blocks-real-parity",
      description: "Morph character workload is compared while real morph glTF parity remains explicitly unsupported.",
      passed: summary.morphWorkloadBlocked,
      evidencePaths: ["benchmarks/shared/scenes/morph-characters.ts", reportPath],
      blocker: "V4 morph character workload is missing or does not block real morph glTF parity.",
    },
    {
      id: "v4-editor-authored-startup",
      description: "Editor-authored exported startup workflow is measured across the three benchmark wrappers with external workflow parity blocked.",
      passed: summary.editorAuthoredStartup,
      evidencePaths: ["benchmarks/shared/scenes/editor-authored-startup.ts", "tests/reports/v3-editor-authoring.json", reportPath],
      blocker: "V4 editor-authored startup workflow evidence is missing.",
    },
    {
      id: "v4-honest-outcomes",
      description: "Report includes win/tie/loss/unavailable outcomes and keeps broad competitive claims blocked.",
      passed: summary.honestOutcomes,
      evidencePaths: [reportPath],
      blocker: "V4 comparison report is missing honest outcomes or broad-claim caveats.",
    },
    {
      id: "v4-broad-superiority-evidence-matrix",
      description: "Report includes a machine-readable broad-superiority evidence matrix for Three.js and Babylon.js instead of relying on narrow benchmark wins.",
      passed: summary.broadSuperiorityEvidenceMatrix,
      evidencePaths: [reportPath, "tests/reports/v4-comparison-threejs.json", "tests/reports/v4-comparison-babylon.json"],
      blocker: "V4 comparison report is missing broad-superiority evidence dimensions for Three.js and Babylon.js.",
    },
  ];
  const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
  const base = baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:v4-benchmarks",
    runIdPrefix: "v4-benchmarks",
    sourceFiles,
    screenshotPaths,
    violations,
  });
  const report = {
    ...(comparisonReport ?? {}),
    ...base,
    suite: "v4-engine-comparison",
    subsystem: "same-scene-engine-comparison",
    expectedScenes,
    checks,
    benchmarkSummary: summary,
    broadClaimsBlocked: true,
  };
  writeJson(root, reportPath, report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4BenchmarkReport();
  console.log(JSON.stringify({ ok: report.ok, subsystem: report.subsystem, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function inspectComparisonReport(report: Record<string, unknown> | null) {
  const scenes = Array.isArray(report?.scenes) ? report.scenes : [];
  const sceneIds = scenes.map((scene) => isRecord(scene) ? scene.id : undefined);
  const expected = new Set(expectedScenes);
  const sameSceneMeasurements =
    report?.ok === true &&
    report.suite === "v4-engine-comparison" &&
    scenes.length === expected.size &&
    sceneIds.every((id) => typeof id === "string" && expected.has(id as typeof expectedScenes[number])) &&
    scenes.every((scene) => isRecord(scene) && scene.equivalent === true && ["galileo", "threejs", "babylon"].every((engine) => isRecord(estimateFor(scene, engine))));
  const sharedDescriptors =
    sameSceneMeasurements &&
    scenes.every((scene) => isRecord(scene) && ["galileo", "threejs", "babylon"].every((engine) => {
      const estimate = estimateFor(scene, engine);
      return isRecord(estimate) &&
        typeof estimate.assetClass === "string" &&
        Array.isArray(estimate.materialFeatures) &&
        isRecord(estimate.postprocessState) &&
        isRecord(estimate.animationState) &&
        Array.isArray(estimate.unsupportedFeatures) &&
        estimate.unsupportedFeatures.length > 0;
    }));
  const metricCoverage =
    sameSceneMeasurements &&
    scenes.every((scene) => isRecord(scene) && ["galileo", "threejs", "babylon"].every((engine) => hasMetrics(estimateFor(scene, engine))));
  const diffs = Array.isArray(report?.screenshotDiffs) ? report.screenshotDiffs : [];
  const screenshotDiffCoverage =
    metricCoverage &&
    diffs.length === expectedScenes.length * 2 &&
    diffs.every((diff) => isRecord(diff) && typeof diff.pass === "boolean" && typeof diff.diffPath === "string");
  const postprocessScene = scenes.find((scene) => isRecord(scene) && scene.id === "postprocess");
  const postprocessBounded =
    isRecord(postprocessScene) &&
    isRecord(postprocessScene.estimates) &&
    ["galileo", "threejs", "babylon"].every((engine) => {
      const estimate = estimateFor(postprocessScene, engine);
      return isRecord(estimate) &&
        isRecord(estimate.postprocessState) &&
        estimate.postprocessState.enabled === true &&
        Array.isArray(estimate.postprocessState.effects) &&
        estimate.postprocessState.effects.includes("tone-mapping") &&
        estimate.postprocessState.effects.includes("bloom") &&
        Array.isArray(estimate.unsupportedFeatures) &&
        estimate.unsupportedFeatures.some((feature) => typeof feature === "string" && feature.includes("HDR"));
    });
  const morphScene = scenes.find((scene) => isRecord(scene) && scene.id === "morph-characters");
  const morphWorkloadBlocked =
    isRecord(morphScene) &&
    isRecord(morphScene.estimates) &&
    ["galileo", "threejs", "babylon"].every((engine) => {
      const estimate = estimateFor(morphScene, engine);
      return isRecord(estimate) &&
        isRecord(estimate.animationState) &&
        estimate.animationState.morphTargets === true &&
        Array.isArray(estimate.unsupportedFeatures) &&
        estimate.unsupportedFeatures.some((feature) => typeof feature === "string" && feature.includes("real morph glTF visual parity"));
    });
  const editorScene = scenes.find((scene) => isRecord(scene) && scene.id === "editor-authored-startup");
  const editorAuthoredStartup =
    isRecord(editorScene) &&
    isRecord(editorScene.workflow) &&
    editorScene.workflow.kind === "editor-authored-exported-app-startup" &&
    isRecord(editorScene.estimates) &&
    ["galileo", "threejs", "babylon"].every((engine) => {
      const estimate = estimateFor(editorScene, engine);
      return isRecord(estimate) && isRecord(estimate.editorWorkflow);
    });
  const outcomes = isRecord(report?.comparisonOutcomes) && isRecord(report.comparisonOutcomes.byCompetitor)
    ? report.comparisonOutcomes.byCompetitor
    : {};
  const honestOutcomes =
    report?.claimUsable === false &&
    typeof report.claimCaveat === "string" &&
    report.claimCaveat.includes("Broad competitive claims remain unsupported") &&
    ["threejs", "babylon"].every((competitor) => {
      const outcome = outcomes[competitor];
      return isRecord(outcome) && isRecord(outcome.summary) && Array.isArray(outcome.scenes) && outcome.scenes.length === expectedScenes.length;
    });
  const broadSuperiorityEvidence = Array.isArray(report?.broadSuperiorityEvidence) ? report.broadSuperiorityEvidence : [];
  const expectedDimensionIds = [
    "equivalent-benchmark-scenes",
    "browser-measurement-coverage",
    "benchmark-screenshot-diffs",
    "product-visual-parity",
    "gltf-loader-visual-parity",
    "pbr-gltf-full-parity",
    "shadow-hdr-postprocess-parity",
    "webgpu-real-hardware-parity",
    "unity-unreal-workflow-parity",
    "production-and-independent-reproduction",
    "ecosystem-docs-accessibility-device-matrix",
  ];
  const broadSuperiorityEvidenceMatrix =
    ["threejs", "babylon"].every((competitor) => {
      const entry = broadSuperiorityEvidence.find((candidate) => isRecord(candidate) && candidate.competitor === competitor);
      const dimensions = isRecord(entry) && Array.isArray(entry.dimensions) ? entry.dimensions : [];
      const screenshotDiffDimension = dimensions.find((dimension) => isRecord(dimension) && dimension.id === "benchmark-screenshot-diffs");
      return dimensions.length === expectedDimensionIds.length &&
        expectedDimensionIds.every((id) => dimensions.some((dimension) => isRecord(dimension) && dimension.id === id && typeof dimension.passed === "boolean" && Array.isArray(dimension.evidencePaths) && Array.isArray(dimension.blockers))) &&
        isRecord(screenshotDiffDimension) &&
        typeof screenshotDiffDimension.passed === "boolean" &&
        Array.isArray(screenshotDiffDimension.blockers) &&
        entry.ready === false &&
        Number(entry.passedDimensions) < Number(entry.totalDimensions);
    }) &&
    isRecord(report?.broadSuperiority) &&
    Array.isArray(report.broadSuperiority.blockers) &&
    report.broadSuperiority.blockers.some((blocker) => typeof blocker === "string" && blocker.includes("broad-superiority evidence matrix is incomplete"));
  return { sharedDescriptors, sameSceneMeasurements, metricCoverage, screenshotDiffCoverage, postprocessBounded, morphWorkloadBlocked, editorAuthoredStartup, honestOutcomes, broadSuperiorityEvidenceMatrix };
}

function estimateFor(scene: Record<string, unknown>, engine: string): unknown {
  return isRecord(scene.estimates) ? scene.estimates[engine] : null;
}

function hasMetrics(value: unknown): boolean {
  return isRecord(value) &&
    isRecord(value.startupMs) &&
    isRecord(value.assetLoadMs) &&
    isRecord(value.firstFrameMs) &&
    isRecord(value.frameTimeMs) &&
    isRecord(value.memoryMb) &&
    typeof value.drawCalls === "number" &&
    typeof value.triangles === "number" &&
    typeof value.shaderCount === "number" &&
    typeof value.textureBytes === "number" &&
    typeof value.geometryBytesEstimate === "number" &&
    typeof value.bundleBytes === "number" &&
    typeof value.screenshotPath === "string";
}
