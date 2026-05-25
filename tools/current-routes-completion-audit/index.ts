import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/current-routes-completion-audit.json";

const requiredReports = [
  { id: "assets", path: "tests/reports/current-routes-assets.json", pass: (json: any) => json.pass === true },
  { id: "route-health", path: "tests/reports/current-routes-route-health.json", pass: (json: any) => json.pass === true && json.root?.routeCount >= 13 },
  { id: "flagship", path: "tests/reports/flagship-viewer.json", pass: (json: any) => json.pass === true },
  { id: "animation", path: "tests/reports/current-routes-animation-examples.json", pass: (json: any) => Array.isArray(json.routes) && json.routes.length >= 12 },
  {
    id: "threejs-parity",
    path: "tests/reports/current-routes-threejs-parity.json",
    pass: (json: any) => json.status === "ready"
      && typeof json.diff?.meanDelta === "number"
      && json.diff.meanDelta <= 55
      && typeof json.diff?.structuralSimilarityProxy === "number"
      && json.diff.structuralSimilarityProxy >= 0.8
  },
  { id: "visual-review", path: "tests/reports/current-routes-visual-review.json", pass: (json: any) => json.pass === true },
  { id: "runtime-import-audit", path: "tests/reports/current-routes-runtime-import-audit.json", pass: (json: any) => json.pass === true && json.scannedFiles > 0 },
  { id: "legacy-prune", path: "tests/reports/current-routes-legacy-prune.json", pass: (json: any) => json.pass === true }
] as const;

const requiredScreenshots = [
  "tests/reports/current-routes/flagship/g3d-flagship-viewer.png",
  "tests/reports/current-routes/flagship/threejs-flagship-viewer.png",
  "tests/reports/current-routes/flagship/side-by-side.png",
  "tests/reports/current-routes/animation/keyframes.png",
  "tests/reports/current-routes/animation/skinning-blending.png",
  "tests/reports/current-routes/animation/additive-blending.png",
  "tests/reports/current-routes/animation/ik.png",
  "tests/reports/current-routes/animation/morph.png",
  "tests/reports/current-routes/animation/multiple.png",
  "tests/reports/current-routes/animation/walk.png",
  "tests/reports/current-routes/decals/decals.png",
  "tests/reports/current-routes/camera/camera.png",
  "tests/reports/current-routes/stereo/parallax-barrier.png",
  "tests/reports/current-routes/stereo/stereo.png",
  "tests/reports/current-routes/physics/physics-showcase.png"
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

const uncheckedChecklistItems = readFileSync(resolve("docs/project/v8-roadmap-three-js-competitor-plan.md"), "utf8")
  .split("\n")
  .map((line, index) => ({ line: index + 1, text: line.trim() }))
  .filter((entry) => entry.text.startsWith("- [ ]"));

const failures = [
  ...reportResults.filter((result) => !result.pass).map((result) => `${result.id} report failed or is missing`),
  ...screenshotResults.filter((result) => !result.pass).map((result) => `${result.path} is missing`)
];

const output = {
  schema: "g3d-current-routes-completion-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claimBoundary: "This audit means the V8 aggregate gate passes. It does not mean every strategic Three.js-replacement backlog item in docs/project/v8-roadmap-three-js-competitor-plan.md is complete.",
  reports: reportResults,
  screenshots: screenshotResults,
  openBacklogItems: uncheckedChecklistItems,
  failures
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length > 0) {
  throw new Error(`V8 completion audit failed:\n${failures.join("\n")}`);
}

console.log(`V8 completion audit passed. Report: ${REPORT_PATH}`);
