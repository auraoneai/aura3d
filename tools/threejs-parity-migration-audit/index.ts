import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/migration-audit.json";
const evidence = [
  "packages/three-compat/src/ThreeApiInventory.ts",
  "packages/three-compat/src/ThreeCompatibilityMatrix.ts",
  "tools/three-compat-threejs-example-migrator/index.ts",
  "tests/integration/three-compat-threejs-migration.test.ts"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-migration-evidence:${path}`, `Missing migration evidence source ${path}.`, "blocker"));

writeJson(outputPath, {
  schema: "g3d-threejs-parity-migration-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  evidence,
  issues,
  claim: "Migration support is adapter-backed for covered APIs only; unsupported Three.js APIs must remain warnings, not silent success."
});
console.log(`V9 migration audit written: ${outputPath}`);
