import { readFileSync } from "node:fs";
import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/package-smoke.json";
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { files?: readonly string[]; exports?: Record<string, string> };
const requiredFiles = ["README.md", "templates/production-product-viewer", "templates/production-product-configurator", "templates/production-asset-inspector", "templates/production-material-studio"] as const;
const requiredContextualExports = [
  "./advanced-runtime",
  "./rendering/advanced-runtime",
  "./assets/advanced-gallery",
  "./production-runtime",
  "./rendering/production-runtime",
  "./assets/asset-corpus",
  "./workflows/production"
] as const;
const missingFiles = requiredFiles.filter((entry) => !(packageJson.files ?? []).includes(entry));
const missingContextualExports = requiredContextualExports.filter((entry) => !(entry in (packageJson.exports ?? {})));
const missingDistEntrypoints = Object.values(packageJson.exports ?? {}).filter((entry) => !entry.startsWith("./dist/"));
const issues = [
  ...missingFiles.map((entry) => reportIssue(`missing-package-file:${entry}`, `package.json files does not include ${entry}.`, "blocker")),
  ...missingContextualExports.map((entry) => reportIssue(`missing-contextual-export:${entry}`, `package.json exports does not include contextual alias ${entry}.`, "blocker")),
  ...missingDistEntrypoints.map((entry) => reportIssue(`non-dist-export:${entry}`, `Export ${entry} is not a dist entrypoint.`, "blocker")),
  ...(!fileExists("templates/production-product-viewer/README.md") ? [reportIssue("missing-template-readme", "production-product-viewer README is missing.", "blocker")] : [])
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-package-smoke/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  requiredFiles,
  requiredContextualExports,
  exportCount: Object.keys(packageJson.exports ?? {}).length,
  issues
});
console.log(`V9 package smoke report written: ${outputPath}`);
