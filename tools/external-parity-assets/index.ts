import { fileURLToPath } from "node:url";
import { baseReport, readJson, sourceFilesFromReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const existing = readJson(root, "tests/reports/external-parity-asset-corpus.json");
const browser = readJson(root, "tests/reports/external-parity-asset-viewer-browser.json");
const packageJson = readJson(root, "package.json");
const packageScripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
const verifyV4AssetsScript = typeof packageScripts["verify:external-parity-assets"] === "string"
  ? packageScripts["verify:external-parity-assets"]
  : "";
const lifecycleScript = typeof process.env.npm_lifecycle_script === "string" ? process.env.npm_lifecycle_script : "";
const browserTasks = new Set(
  Array.isArray(browser?.completedTaskEvidence)
    ? browser.completedTaskEvidence.map((entry: { readonly task?: unknown }) => typeof entry.task === "string" ? entry.task : "")
    : [],
);
const checks = [
  {
    id: "v4-asset-corpus-report-produced-by-asset-agent",
    passed: existing?.ok === true,
    evidencePaths: ["tests/reports/external-parity-asset-corpus.json"],
    blocker: "V4 asset corpus report is not yet passing.",
  },
  {
    id: "v4-asset-viewer-browser-report-passing",
    passed: browser?.ok === true,
    evidencePaths: ["tests/reports/external-parity-asset-viewer-browser.json"],
    blocker: "V4 asset viewer browser report is not yet passing.",
  },
  {
    id: "v4-asset-viewer-controls-export-dragdrop-evidence",
    passed: browserTasks.has("Allow drag/drop local glTF import in the V4 asset viewer.") &&
      browserTasks.has("Allow material/environment/postprocess controls in the V4 asset viewer.") &&
      browserTasks.has("Add same-asset comparison export data from the V4 asset viewer."),
    evidencePaths: ["examples/asset-viewer/main.ts", "tests/browser/asset-viewer-external-parity.spec.ts", "tests/reports/external-parity-asset-viewer-browser.json"],
    blocker: "V4 asset viewer report does not prove controls, comparison export, and drag/drop evidence.",
  },
  {
    id: "v4-asset-viewer-local-dependency-browser-spec-in-v4-command",
    passed: verifyV4AssetsScript.includes("tests/browser/asset-viewer-browser.spec.ts") ||
      lifecycleScript.includes("tests/browser/asset-viewer-browser.spec.ts"),
    evidencePaths: ["package.json", "tests/browser/asset-viewer-browser.spec.ts"],
    blocker: "pnpm verify:external-parity-assets does not include the browser asset-viewer dependency coverage for dropped glTF/GLB/bin/image/KTX2 paths.",
  },
] as const;
const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
const report = {
  ...baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:external-parity-assets",
    runIdPrefix: "external-parity-assets",
    sourceFiles: ["tools/external-parity-assets/index.ts", "tests/reports/external-parity-asset-corpus.json", "tests/reports/external-parity-asset-viewer-browser.json", "package.json"],
    violations,
  }),
  subsystem: "asset-pipeline-and-content",
  checks,
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (existing?.ok === true && browser?.ok === true && violations.length === 0) {
    const screenshotPaths = new Set<string>();
    for (const source of [existing, browser]) {
      for (const path of Array.isArray(source?.screenshotPaths) ? source.screenshotPaths : []) {
        if (typeof path === "string") screenshotPaths.add(path);
      }
      for (const validation of Array.isArray(source?.validations) ? source.validations : []) {
        if (typeof validation?.screenshot === "string") screenshotPaths.add(validation.screenshot);
      }
    }
    const normalized = {
      ...existing,
      ...baseReport(root, {
        ok: true,
        command: "pnpm verify:external-parity-assets",
        runIdPrefix: "external-parity-assets",
        sourceFiles: sourceFilesFromReport(existing, [
          "tools/external-parity-assets/index.ts",
          "tests/reports/external-parity-asset-corpus.json",
          "tests/reports/external-parity-asset-viewer-browser.json",
          "examples/asset-viewer/main.ts",
          "tests/browser/asset-viewer-external-parity.spec.ts",
          "tests/browser/asset-viewer-browser.spec.ts",
          "package.json",
        ], "tests/reports/external-parity-asset-corpus.json"),
        screenshotPaths: [...screenshotPaths].sort((left, right) => left.localeCompare(right)),
      }),
      normalizedBy: "tools/external-parity-assets/index.ts",
      checks,
      assetViewerBrowserEvidence: browser,
    };
    writeJson(root, "tests/reports/external-parity-asset-corpus.json", normalized);
    console.log(JSON.stringify({ ok: true, normalized: "tests/reports/external-parity-asset-corpus.json" }, null, 2));
    process.exit(0);
  }
  writeJson(root, "tests/reports/external-parity-asset-corpus.json", report);
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
