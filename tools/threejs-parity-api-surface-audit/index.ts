import { readFileSync } from "node:fs";
import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/api-surface.json";
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { exports?: Record<string, string> };
const expectedExports = [
  ".",
  "./math",
  "./scene",
  "./rendering",
  "./controls",
  "./assets",
  "./assets/browser",
  "./animation",
  "./input",
  "./workflows",
  "./workflows/production-runtime",
  "./three-compat",
  "./debug"
] as const;

const missingExports = expectedExports.filter((entry) => !(entry in (packageJson.exports ?? {})));
const sourceEntrypoints = [
  "packages/math/src/index.ts",
  "packages/scene/src/index.ts",
  "packages/rendering/src/index.ts",
  "packages/controls/src/index.ts",
  "packages/assets/src/index.ts",
  "packages/assets/src/browser-index.ts",
  "packages/animation/src/index.ts",
  "packages/input/src/index.ts",
  "packages/workflows/src/index.ts",
  "packages/workflows/src/production-runtime/index.ts",
  "packages/three-compat/src/index.ts",
  "packages/debug/src/index.ts"
] as const;
const missingSources = sourceEntrypoints.filter((entry) => !fileExists(entry));
const issues = [
  ...missingExports.map((entry) => reportIssue(`missing-export:${entry}`, `package.json does not export ${entry}.`, "blocker")),
  ...missingSources.map((entry) => reportIssue(`missing-source:${entry}`, `Missing source entrypoint ${entry}.`, "blocker"))
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-api-surface-audit",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  expectedExports,
  missingExports,
  sourceEntrypoints,
  missingSources,
  issues
});
console.log(`Three.js parity API surface audit written: ${outputPath}`);
