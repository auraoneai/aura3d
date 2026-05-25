import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const reportPath = resolve("tests/reports/production-runtime-threejs-parity-readiness.json");
const browserReportPath = resolve("tests/reports/production-runtime-threejs-parity/browser-report.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      sceneCount?: number;
      screenshots?: readonly string[];
      results?: {
        id: string;
        category: string;
        assetId: string;
        g3d?: { drawCalls?: number; nonBlackPixels?: number; uniqueColorBuckets?: number; pass?: boolean };
        threejs?: { drawCalls?: number; triangles?: number; nonBlackPixels?: number; uniqueColorBuckets?: number };
        diff?: { meanDelta?: number; maxDelta?: number; changedPixels?: number; structuralSimilarityProxy?: number; pass?: boolean };
      }[];
    }
  : null;
const results = browserReport?.results ?? [];
const requiredCategories = ["product", "materials", "asset", "architecture"];
const screenshotPaths = browserReport?.screenshots ?? [];
const requiredGalleryScreenshots = [
  "tests/reports/production-runtime-gallery/threejs-comparison/product-g3d.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/product-threejs.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/product-diff.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/materials-g3d.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/materials-threejs.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/materials-diff.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/asset-g3d.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/asset-threejs.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/asset-diff.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/architecture-g3d.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/architecture-threejs.png",
  "tests/reports/production-runtime-gallery/threejs-comparison/architecture-diff.png"
];
const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "scene-count", pass: (browserReport?.sceneCount ?? 0) >= 12 && results.length >= 12, detail: `${browserReport?.sceneCount ?? 0} scenes` },
  { id: "mandatory-categories", pass: requiredCategories.every((category) => results.some((result) => result.category === category)), detail: requiredCategories.join(", ") },
  { id: "g3d-real-renderer-proof", pass: results.length >= 12 && results.every((result) => result.g3d?.pass === true && (result.g3d.drawCalls ?? 0) > 0 && (result.g3d.nonBlackPixels ?? 0) > 1000 && (result.g3d.uniqueColorBuckets ?? 0) >= 50), detail: failed(results, (result) => !(result.g3d?.pass === true && (result.g3d.drawCalls ?? 0) > 0 && (result.g3d.nonBlackPixels ?? 0) > 1000 && (result.g3d.uniqueColorBuckets ?? 0) >= 50)) },
  { id: "threejs-real-renderer-proof", pass: results.length >= 12 && results.every((result) => (result.threejs?.drawCalls ?? 0) > 0 && (result.threejs?.nonBlackPixels ?? 0) > 1000 && (result.threejs?.uniqueColorBuckets ?? 0) >= 50), detail: failed(results, (result) => !((result.threejs?.drawCalls ?? 0) > 0 && (result.threejs?.nonBlackPixels ?? 0) > 1000 && (result.threejs?.uniqueColorBuckets ?? 0) >= 50)) },
  { id: "diff-metrics-pass", pass: results.length >= 12 && results.every((result) => result.diff?.pass === true && Number.isFinite(result.diff.meanDelta) && Number.isFinite(result.diff.maxDelta) && (result.diff.changedPixels ?? 0) > 1000 && (result.diff.structuralSimilarityProxy ?? 0) >= 0.75), detail: failed(results, (result) => !(result.diff?.pass === true && Number.isFinite(result.diff.meanDelta) && Number.isFinite(result.diff.maxDelta) && (result.diff.changedPixels ?? 0) > 1000 && (result.diff.structuralSimilarityProxy ?? 0) >= 0.75)) },
  { id: "screenshots-exist", pass: screenshotPaths.length >= 36 && screenshotPaths.every((path) => existsSync(resolve(path))), detail: screenshotPaths.filter((path) => !existsSync(resolve(path))).join(", ") },
  { id: "gallery-comparison-screenshots-exist", pass: requiredGalleryScreenshots.every((path) => existsSync(resolve(path))), detail: requiredGalleryScreenshots.filter((path) => !existsSync(resolve(path))).join(", ") }
];
const report = {
  schema: "g3d-production-runtime-threejs-parity-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks,
  results
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function failed<T extends { id: string }>(items: readonly T[], predicate: (item: T) => boolean): string {
  return items.filter(predicate).map((item) => item.id).join(", ");
}
