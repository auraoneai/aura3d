import { fileExists, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/external-consumer.json";
const evidence = [
  "tools/v6-external-consumer/index.ts",
  "tools/v5-external-consumer/index.ts",
  "tools/v4-external-consumer/index.ts",
  "templates/v6-product-viewer/package.json"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-external-consumer-evidence:${path}`, `Missing external consumer evidence source ${path}.`, "warning"));

writeJson(outputPath, {
  schema: "g3d-v9-external-consumer/v1",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0,
  evidence,
  missing,
  issues
});
console.log(`V9 external consumer report written: ${outputPath}`);
