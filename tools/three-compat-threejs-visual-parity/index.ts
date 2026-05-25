import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { V5_COMPARISON_SCENES } from "../../benchmarks/three-compat/shared/scenes";
import { validatePngVisual } from "../three-compat-visual-quality/visualStats";

const screenshotDir = "tests/reports/three-compat-threejs-visual-parity";
const comparisons = V5_COMPARISON_SCENES.map((scene) => ({
  ...scene,
  g3dScreenshot: `${screenshotDir}/${scene.id}-g3d.png`,
  threejsScreenshot: `${screenshotDir}/${scene.id}-threejs.png`,
  diffScreenshot: `${screenshotDir}/${scene.id}-diff.png`
}));
const missingScreenshots = comparisons.flatMap((comparison) => [comparison.g3dScreenshot, comparison.threejsScreenshot, comparison.diffScreenshot].filter((file) => !existsSync(resolve(file))));
const visualValidations = comparisons.flatMap((comparison) => [
  { id: `${comparison.id}:g3d`, ...validatePngVisual(resolve(comparison.g3dScreenshot), { minByteLength: 30000, minMeanLuma: 32, minColorBuckets: 70, maxDominantBucketRatio: 0.58, minEdgePixelRatio: 0.014, minLocalContrastRatio: 0.03 }) },
  { id: `${comparison.id}:threejs`, ...validatePngVisual(resolve(comparison.threejsScreenshot), { minByteLength: 30000, minMeanLuma: 32, minColorBuckets: 70, maxDominantBucketRatio: 0.58, minEdgePixelRatio: 0.014, minLocalContrastRatio: 0.03 }) },
  { id: `${comparison.id}:diff`, ...validatePngVisual(resolve(comparison.diffScreenshot), { minByteLength: 22000, minMeanLuma: 17, minColorBuckets: 28, maxDominantBucketRatio: 0.76, minEdgePixelRatio: 0.007, minLocalContrastRatio: 0.014 }) }
]);
const invalidVisuals = visualValidations.filter((validation) => !validation.ok);
const thresholdPassCount = comparisons.filter((comparison) => comparison.visualScore >= 0.85).length;
const lowerSetupCount = comparisons.filter((comparison) => comparison.g3dSetupLines < comparison.threeSetupLines).length;
const checks = [
  { name: "scene-count", pass: comparisons.length >= 13, detail: `${comparisons.length}/13 comparisons` },
  { name: "screenshots", pass: missingScreenshots.length === 0, detail: missingScreenshots.join(", ") || "G3D, Three.js, and diff screenshots exist for every comparison" },
  { name: "nonblank-visual-stats", pass: invalidVisuals.length === 0, detail: invalidVisuals.map((entry) => `${entry.id}: ${entry.failures.join("; ")}`).join(", ") || "every screenshot passes nonblank visual statistics" },
  { name: "visual-threshold", pass: thresholdPassCount >= 10, detail: `${thresholdPassCount}/10 comparisons meet visual score threshold` },
  { name: "setup-complexity", pass: lowerSetupCount >= 8, detail: `${lowerSetupCount}/8 comparisons have lower G3D setup complexity` },
  { name: "large-scene-metrics", pass: Boolean(comparisons.find((comparison) => comparison.id === "large-scene-instancing")?.largeScene), detail: "large-scene metrics present" },
  { name: "gap-boundary", pass: comparisons.some((comparison) => comparison.warnings.some((warning) => /blocked/i.test(warning))), detail: "unsupported/broad superiority gap warning preserved" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "g3d-three-compat-threejs-visual-parity/v2", generatedAt: new Date().toISOString(), pass, comparisons, visualValidations, checks };
const reportPath = resolve("tests/reports/three-compat-threejs-visual-parity.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 Three.js visual parity passed: ${comparisons.length} comparisons, ${thresholdPassCount} visual passes.`);
