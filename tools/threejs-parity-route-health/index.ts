import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/route-health.json";
const routeSpecs = [
  "tests/browser/current-routes-route-health.spec.ts",
  "tests/browser/current-routes-animation-examples.spec.ts",
  "tests/browser/current-routes-flagship-viewer.spec.ts",
  "tests/browser/production-runtime-templates.spec.ts"
] as const;
const missing = routeSpecs.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-route-health-spec:${path}`, `Missing route health spec ${path}.`, "blocker"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-route-health/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  routeSpecs,
  issues
});
console.log(`V9 route health report written: ${outputPath}`);
