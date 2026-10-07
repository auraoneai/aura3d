import { readFileSync } from "node:fs";
import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/package-smoke.json";
/**
 * `exports` entries are either a bare path string or a conditional-exports object
 * (`{ types, browser, import, default }`). The audit previously typed every value as a string
 * and called `entry.startsWith(...)` on it, which threw `entry.startsWith is not a function`
 * on the first conditional entry — so this gate crashed instead of running and had never
 * actually verified any entrypoint.
 */
type PackageExportEntry = string | Record<string, string>;
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { files?: readonly string[]; exports?: Record<string, PackageExportEntry> };
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
/** Flattens an export entry to every concrete path it can resolve to. */
function exportTargets(entry: PackageExportEntry): readonly string[] {
  return typeof entry === "string" ? [entry] : Object.values(entry);
}
// Every resolvable target of every export must be a dist entrypoint, including each condition
// of a conditional export. Checking only the string form would let a conditional entry ship a
// non-dist `browser` or `types` path unnoticed.
const missingDistEntrypoints = Object.entries(packageJson.exports ?? {})
  .flatMap(([specifier, entry]) => exportTargets(entry)
    .filter((target) => !target.startsWith("./dist/"))
    .map((target) => `${specifier} -> ${target}`));
const issues = [
  ...missingFiles.map((entry) => reportIssue(`missing-package-file:${entry}`, `package.json files does not include ${entry}.`, "blocker")),
  ...missingContextualExports.map((entry) => reportIssue(`missing-contextual-export:${entry}`, `package.json exports does not include contextual alias ${entry}.`, "blocker")),
  ...missingDistEntrypoints.map((entry) => reportIssue(`non-dist-export:${entry}`, `Export ${entry} is not a dist entrypoint.`, "blocker")),
  ...(!fileExists("templates/production-product-viewer/README.md") ? [reportIssue("missing-template-readme", "production-product-viewer README is missing.", "blocker")] : [])
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-package-smoke",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  requiredFiles,
  requiredContextualExports,
  exportCount: Object.keys(packageJson.exports ?? {}).length,
  issues
});
console.log(`Three.js parity package smoke report written: ${outputPath}`);
