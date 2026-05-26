import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/external-consumer.json";
const evidence = [
  "tools/production-runtime-external-consumer/index.ts",
  "tools/three-compat-external-consumer/index.ts",
  "tools/external-parity-external-consumer/index.ts",
  "templates/production-product-viewer/package.json"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-external-consumer-evidence:${path}`, `Missing external consumer evidence source ${path}.`, "warning"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-external-consumer/v1",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0,
  evidence,
  missing,
  issues
});
console.log(`V9 external consumer report written: ${outputPath}`);
