import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/current-routes-completion-audit.json";

const requiredReports = [
  { id: "assets", path: "tests/reports/current-routes-assets.json", pass: (json: any) => json.pass === true },
  { id: "route-health", path: "tests/reports/current-routes-route-health.json", pass: (json: any) => json.pass === true && Number(json.root?.routeCount ?? 0) > 0 },
  { id: "visual-review", path: "tests/reports/current-routes-visual-review.json", pass: (json: any) => json.pass === true },
  { id: "runtime-import-audit", path: "tests/reports/current-routes-runtime-import-audit.json", pass: (json: any) => json.pass === true && json.scannedFiles > 0 },
  { id: "legacy-prune", path: "tests/reports/current-routes-legacy-prune.json", pass: (json: any) => json.pass === true }
] as const;

const requiredScreenshots = [
  "tests/reports/current-route-health/screenshots/apps-advanced-examples-gallery.png",
  "tests/reports/current-route-health/screenshots/apps-advanced-examples-gallery-product-configurator.png",
  "tests/reports/current-route-health/screenshots/apps-wow-tokyo-keyframes.png",
  "tests/reports/current-route-health/screenshots/apps-wow-soldier-animation-viewer.png"
] as const;

const reportResults = requiredReports.map((report) => {
  if (!existsSync(resolve(report.path))) {
    return { id: report.id, path: report.path, pass: false, failure: "missing report" };
  }
  try {
    const json = JSON.parse(readFileSync(resolve(report.path), "utf8"));
    return { id: report.id, path: report.path, pass: report.pass(json) };
  } catch (error) {
    return { id: report.id, path: report.path, pass: false, failure: error instanceof Error ? error.message : String(error) };
  }
});

const screenshotResults = requiredScreenshots.map((path) => ({
  path,
  pass: existsSync(resolve(path))
}));

const uncheckedChecklistItems = readFileSync(resolve("docs/project/threejs-parity-status.md"), "utf8")
  .split("\n")
  .map((line, index) => ({ line: index + 1, text: line.trim() }))
  .filter((entry) => entry.text.startsWith("- [ ]"));

const failures = [
  ...reportResults.filter((result) => !result.pass).map((result) => `${result.id} report failed or is missing`),
  ...screenshotResults.filter((result) => !result.pass).map((result) => `${result.path} is missing`)
];

const output = {
  schema: "a3d-current-routes-completion-audit",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claimBoundary: "This audit means the CurrentRoutes aggregate gate passes. It does not mean every strategic Three.js-replacement backlog item in docs/project/threejs-parity-status.md is complete.",
  reports: reportResults,
  screenshots: screenshotResults,
  openBacklogItems: uncheckedChecklistItems,
  failures
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length > 0) {
  throw new Error(`CurrentRoutes completion audit failed:\n${failures.join("\n")}`);
}

console.log(`CurrentRoutes completion audit passed. Report: ${REPORT_PATH}`);
