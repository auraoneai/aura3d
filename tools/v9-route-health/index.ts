import { fileExists, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/route-health.json";
const routeSpecs = [
  "tests/browser/v8-route-health.spec.ts",
  "tests/browser/v8-animation-examples.spec.ts",
  "tests/browser/v8-flagship-viewer.spec.ts",
  "tests/browser/v6-templates.spec.ts"
] as const;
const missing = routeSpecs.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-route-health-spec:${path}`, `Missing route health spec ${path}.`, "blocker"));

writeJson(outputPath, {
  schema: "g3d-v9-route-health/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  routeSpecs,
  issues
});
console.log(`V9 route health report written: ${outputPath}`);
