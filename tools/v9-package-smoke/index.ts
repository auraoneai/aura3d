import { readFileSync } from "node:fs";
import { fileExists, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/package-smoke.json";
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { files?: readonly string[]; exports?: Record<string, string> };
const requiredFiles = ["README.md", "templates/v6-product-viewer", "templates/v6-product-configurator", "templates/v6-asset-inspector", "templates/v6-material-studio"] as const;
const missingFiles = requiredFiles.filter((entry) => !(packageJson.files ?? []).includes(entry));
const missingDistEntrypoints = Object.values(packageJson.exports ?? {}).filter((entry) => !entry.startsWith("./dist/"));
const issues = [
  ...missingFiles.map((entry) => reportIssue(`missing-package-file:${entry}`, `package.json files does not include ${entry}.`, "blocker")),
  ...missingDistEntrypoints.map((entry) => reportIssue(`non-dist-export:${entry}`, `Export ${entry} is not a dist entrypoint.`, "blocker")),
  ...(!fileExists("templates/v6-product-viewer/README.md") ? [reportIssue("missing-template-readme", "v6-product-viewer README is missing.", "blocker")] : [])
];

writeJson(outputPath, {
  schema: "g3d-v9-package-smoke/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  requiredFiles,
  exportCount: Object.keys(packageJson.exports ?? {}).length,
  issues
});
console.log(`V9 package smoke report written: ${outputPath}`);
