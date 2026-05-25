import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validatePngVisual } from "../three-compat-visual-quality/visualStats";

interface GenericReport {
  readonly pass?: boolean;
  readonly [key: string]: unknown;
}

interface MatrixReport {
  readonly totalEntries: number;
  readonly coverage: readonly { readonly category: string; readonly percent: number; readonly meetsThreshold: boolean }[];
}

const requiredReports = [
  "tests/reports/three-compat-truth.json",
  "tests/reports/three-compat-progress.json",
  "tests/reports/three-compat-legacy-prune-readiness.json",
  "tests/reports/three-compat-threejs-inventory.json",
  "tests/reports/three-compat-threejs-compatibility-matrix.json",
  "tests/reports/three-compat-asset-readiness.json",
  "tests/reports/three-compat-environment-readiness.json",
  "tests/reports/three-compat-material-readiness.json",
  "tests/reports/three-compat-renderer-readiness.json",
  "tests/reports/three-compat-core-compat-readiness.json",
  "tests/reports/three-compat-material-geometry-compat-readiness.json",
  "tests/reports/three-compat-loader-readiness.json",
  "tests/reports/three-compat-controls-readiness.json",
  "tests/reports/three-compat-animation-readiness.json",
  "tests/reports/three-compat-postprocess-readiness.json",
  "tests/reports/three-compat-shader-readiness.json",
  "tests/reports/three-compat-vfx-readiness.json",
  "tests/reports/three-compat-performance-readiness.json",
  "tests/reports/three-compat-migration-readiness.json",
  "tests/reports/three-compat-app-suite-readiness.json",
  "tests/reports/three-compat-template-readiness.json",
  "tests/reports/three-compat-examples-readiness.json",
  "tests/reports/three-compat-threejs-visual-parity.json",
  "tests/reports/three-compat-threejs-runtime-parity.json",
  "tests/reports/three-compat-package-surface-readiness.json",
  "tests/reports/three-compat-package-smoke.json",
  "tests/reports/three-compat-external-consumer.json",
  "tests/reports/three-compat-docs-readiness.json",
  "tests/reports/three-compat-claim-registry.json",
  "tests/reports/three-compat-release-readiness.json",
  "tests/reports/three-compat-broad-replacement-readiness.json"
];
const finalScreenshots = [
  "tests/reports/three-compat-gallery/product/premium-product-viewer.png",
  "tests/reports/three-compat-gallery/automotive/automotive-configurator.png",
  "tests/reports/three-compat-gallery/architecture-day/interior-daylight.png",
  "tests/reports/three-compat-gallery/architecture-night/interior-night.png",
  "tests/reports/three-compat-gallery/materials/material-library.png",
  "tests/reports/three-compat-gallery/assets/asset-inspector.png",
  "tests/reports/three-compat-gallery/character/character-animation.png",
  "tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png",
  "tests/reports/three-compat-gallery/vfx/particle-vfx.png",
  "tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png",
  "tests/reports/three-compat-gallery/shader-lab/shader-lab.png",
  "tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png",
  "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-g3d.png",
  "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-threejs.png",
  "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-diff.png",
  "tests/reports/three-compat-gallery/threejs-comparison/large-scene-g3d.png",
  "tests/reports/three-compat-gallery/threejs-comparison/large-scene-threejs.png",
  "tests/reports/three-compat-gallery/threejs-comparison/large-scene-diff.png",
  "tests/reports/three-compat-external-consumer/external-consumer-static.png"
];
const missingReports = requiredReports.filter((path) => !existsSync(resolve(path)));
const falseReports = requiredReports.filter((path) => {
  if (!existsSync(resolve(path))) return false;
  const report = readJson<GenericReport>(path);
  return report.pass === false;
});
const appImports = listFiles("apps")
  .filter((path) => /apps\/three-compat-/.test(path) && /\.[tj]s$/.test(path))
  .filter((path) => /test-utils|tests\/|packages\/rendering\/src/.test(readFileSync(resolve(path), "utf8")));
const templateWorkspaceFiles = listFiles("templates")
  .filter((path) => /templates\/three-compat-/.test(path) && /package\.json$/.test(path))
  .filter((path) => readFileSync(resolve(path), "utf8").includes("workspace:"));
const missingScreenshots = finalScreenshots.filter((path) => !existsSync(resolve(path)) || statSync(resolve(path)).size < 1024);
const screenshotVisualValidations = finalScreenshots.map((path) => ({
  target: path,
  ...validatePngVisual(resolve(path), path.endsWith("external-consumer-static.png")
    ? { minByteLength: 8000, minMeanLuma: 28, minColorBuckets: 36, maxDominantBucketRatio: 0.76, minEdgePixelRatio: 0.01, minLocalContrastRatio: 0.018 }
    : path.endsWith("-diff.png")
    ? { minByteLength: 22000, minMeanLuma: 17, minColorBuckets: 28, maxDominantBucketRatio: 0.76, minEdgePixelRatio: 0.007, minLocalContrastRatio: 0.014 }
    : { minByteLength: 30000, minMeanLuma: 32, minColorBuckets: 70, maxDominantBucketRatio: 0.58, minEdgePixelRatio: 0.014, minLocalContrastRatio: 0.03 })
}));
const visuallyInvalidScreenshots = screenshotVisualValidations.filter((entry) => !entry.ok);
const reviewText = existsSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md")) ? readFileSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md"), "utf8") : "";
const matrix = readJson<MatrixReport>("tests/reports/three-compat-threejs-compatibility-matrix.json");
const weakCoverage = matrix.coverage.filter((coverage) => coverage.category === "overall" ? coverage.percent < 60 : ["core", "math", "cameras", "lights", "materials", "geometries", "textures"].includes(coverage.category) && coverage.percent < 80);
const blockedClaims = existsSync(resolve("docs/project/three-compat-roadmap-blocked-claims.md")) ? readFileSync(resolve("docs/project/three-compat-roadmap-blocked-claims.md"), "utf8") : "";
const progress = readFileSync(resolve("docs/project/three-compat-roadmap-progress.md"), "utf8");
const release = readJson<GenericReport>("tests/reports/three-compat-release-readiness.json");
const checks = [
  { id: "all-required-reports-exist", pass: missingReports.length === 0, detail: missingReports.join(", ") || "all required final reports exist" },
  { id: "no-report-pass-false", pass: falseReports.length === 0, detail: falseReports.join(", ") || "no required report has pass:false" },
  { id: "no-three-compat-app-internal-renderer-test-imports", pass: appImports.length === 0, detail: appImports.join(", ") || "V5 apps use public packages" },
  { id: "no-three-compat-template-workspace-deps", pass: templateWorkspaceFiles.length === 0, detail: templateWorkspaceFiles.join(", ") || "V5 templates do not use workspace:*" },
  { id: "flagship-screenshots-present", pass: missingScreenshots.length === 0, detail: missingScreenshots.join(", ") || `${finalScreenshots.length} final screenshots exist` },
  { id: "flagship-screenshots-nonblank", pass: visuallyInvalidScreenshots.length === 0, detail: visuallyInvalidScreenshots.map((entry) => `${entry.target}: ${entry.failures.join("; ")}`).join(", ") || "final screenshots pass nonblank visual statistics" },
  { id: "human-review-not-primitive", pass: reviewText.includes("Premium browser 3D product?") && !/\|\s*No\s*\|/.test(reviewText) && !/primitive/i.test(reviewText), detail: "human visual review does not mark flagship scenes primitive or failed" },
  { id: "broad-replacement-readiness-pass", pass: readJson<GenericReport>("tests/reports/three-compat-broad-replacement-readiness.json").pass === true, detail: "broad replacement gate passed" },
  { id: "compatibility-matrix-thresholds", pass: weakCoverage.length === 0, detail: weakCoverage.map((item) => `${item.category}:${item.percent}`).join(", ") || "compatibility matrix meets V5 thresholds" },
  { id: "blocked-claims-preserved", pass: ["Full Three.js API replacement", "Unity replacement", "Unreal replacement", "Full game engine replacement"].every((claim) => blockedClaims.includes(claim)), detail: "blocked claims remain documented" },
  { id: "progress-not-premature-complete", pass: !/Status:\s*Complete/i.test(progress) || release.pass === true, detail: "progress file is not marked complete before release readiness passes" }
];
const report = {
  schema: "g3d-three-compat-completion-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  objective: "G3D V5 has concrete implementation, examples, apps, templates, docs, package smoke, screenshots, comparison evidence, and claim boundaries for a broad Three.js replacement track.",
  screenshotVisualValidations,
  checks
};
writeReport("tests/reports/three-compat-completion-audit.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("V5 completion audit passed.");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function writeReport(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

function listFiles(root: string): string[] {
  if (!existsSync(resolve(root))) return [];
  const output: string[] = [];
  for (const entry of readdirSync(resolve(root), { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(path));
    else output.push(path);
  }
  return output;
}
