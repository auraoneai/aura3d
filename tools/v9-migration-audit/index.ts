import { fileExists, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/migration-audit.json";
const evidence = [
  "packages/three-compat/src/ThreeApiInventory.ts",
  "packages/three-compat/src/ThreeCompatibilityMatrix.ts",
  "tools/v5-threejs-example-migrator/index.ts",
  "tests/integration/v5-threejs-migration.test.ts"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-migration-evidence:${path}`, `Missing migration evidence source ${path}.`, "blocker"));

writeJson(outputPath, {
  schema: "g3d-v9-migration-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  evidence,
  issues,
  claim: "Migration support is adapter-backed for covered APIs only; unsupported Three.js APIs must remain warnings, not silent success."
});
console.log(`V9 migration audit written: ${outputPath}`);
