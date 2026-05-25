import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface MatrixReport {
  readonly totalEntries: number;
  readonly coverage: readonly { readonly category: string; readonly percent: number; readonly meetsThreshold: boolean }[];
}

interface GenericReport {
  readonly pass?: boolean;
  readonly [key: string]: unknown;
}

const matrix = readJson<MatrixReport>("tests/reports/three-compat-threejs-compatibility-matrix.json");
const inventory = readJson<GenericReport>("tests/reports/three-compat-threejs-inventory.json");
const examples = readJson<{ readonly pass: boolean; readonly examples: readonly { readonly browserTested: boolean }[] }>("tests/reports/three-compat-examples-readiness.json");
const visualParity = readJson<{ readonly pass: boolean; readonly comparisons: readonly { readonly id: string; readonly visualScore: number }[] }>("tests/reports/three-compat-threejs-visual-parity.json");
const migration = readJson<GenericReport>("tests/reports/three-compat-migration-readiness.json");
const packageSmoke = readJson<GenericReport>("tests/reports/three-compat-package-smoke.json");
const externalConsumer = readJson<GenericReport>("tests/reports/three-compat-external-consumer.json");
const docs = readJson<GenericReport>("tests/reports/three-compat-docs-readiness.json");
const release = readJson<GenericReport>("tests/reports/three-compat-release-readiness.json");
const claims = readJson<{ readonly pass: boolean; readonly claims: readonly { readonly id: string; readonly status: string }[] }>("tests/reports/three-compat-claim-registry.json");
const reviewText = existsSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md")) ? readFileSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md"), "utf8") : "";
const flagshipScreenshots = [
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
  "tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png"
];
const coreCategories = ["core", "math", "cameras", "lights", "materials", "geometries", "textures"];
const overallCoverage = matrix.coverage.find((item) => item.category === "overall");
const weakCoreCategories = coreCategories.filter((category) => Number(matrix.coverage.find((item) => item.category === category)?.percent ?? 0) < 80);
const missingFlagshipScreenshots = flagshipScreenshots.filter((path) => !existsSync(resolve(path)) || statSync(resolve(path)).size < 1024);
const visualThresholdPasses = visualParity.comparisons.filter((comparison) => comparison.visualScore >= 0.85).length;
const checks = [
  { id: "compatibility-matrix-present-and-thresholded", pass: matrix.totalEntries >= 250 && Number(overallCoverage?.percent ?? 0) >= 60 && weakCoreCategories.length === 0, detail: `${matrix.totalEntries} entries, overall ${overallCoverage?.percent ?? 0}%, weak core categories: ${weakCoreCategories.join(", ") || "none"}` },
  { id: "inventory-entry-count", pass: Number((inventory.inventory as { entries?: unknown[] } | undefined)?.entries?.length ?? 0) >= 250, detail: "Three.js inventory tracks at least 250 API/example entries" },
  { id: "examples-depth", pass: examples.pass && examples.examples.length >= 50 && examples.examples.filter((example) => example.browserTested).length >= 30, detail: `${examples.examples.length} examples, ${examples.examples.filter((example) => example.browserTested).length} browser-tested` },
  { id: "same-scene-comparisons", pass: visualParity.pass && visualParity.comparisons.length >= 13 && visualThresholdPasses >= 10, detail: `${visualParity.comparisons.length} comparisons, ${visualThresholdPasses} visual threshold passes` },
  { id: "human-visual-review", pass: reviewText.includes("Acceptable public product page?") && !/\|\s*No\s*\|/.test(reviewText) && missingFlagshipScreenshots.length === 0, detail: missingFlagshipScreenshots.join(", ") || "human review approves all flagship screenshots" },
  { id: "migration-tooling", pass: migration.pass === true, detail: "migration readiness report passes" },
  { id: "package-and-external-consumer", pass: packageSmoke.pass === true && externalConsumer.pass === true, detail: "package smoke and external consumer reports pass" },
  { id: "docs-readiness", pass: docs.pass === true, detail: "docs readiness report passes" },
  { id: "release-readiness", pass: release.pass === true, detail: "release readiness report passes" },
  { id: "blocked-claims-visible", pass: claims.pass === true && claims.claims.some((claim) => claim.status === "blocked"), detail: "blocked claims remain visible and machine-checked" }
];
const report = {
  schema: "g3d-three-compat-broad-replacement-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  position: "G3D V5 is ready to be presented as a broad Three.js replacement track for documented mainstream browser 3D workflows, not as full Three.js API/ecosystem parity.",
  thresholds: {
    minimumInventoryEntries: 250,
    minimumOverallCoveragePercent: 60,
    minimumCoreCoveragePercent: 80,
    minimumExamples: 50,
    minimumBrowserTestedExamples: 30,
    minimumSameSceneComparisons: 13
  },
  checks
};
writeReport("tests/reports/three-compat-broad-replacement-readiness.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("V5 broad replacement readiness passed.");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function writeReport(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
