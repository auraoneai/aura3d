import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { baseReport, readJson, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const manifest = readJson(root, "tests/reports/external-parity-example-screenshots/manifest.json");
const racingScreenshotPath = "tests/reports/external-parity-example-screenshots/racing-showcase.png";
const screenshotPaths = [...getScreenshotPaths(manifest), ...(existsSync(`${root}/${racingScreenshotPath}`) ? [racingScreenshotPath] : [])];
const sourceFiles = [
  "tools/external-parity-examples/index.ts",
  "tests/browser/example-screenshot-audit-external-parity.spec.ts",
  "tests/browser/large-world-streaming-external-parity.spec.ts",
  "tests/browser/racing-showcase-external-parity.spec.ts",
  "examples/portfolio/main.ts",
  "examples/portfolio/README.md",
  "examples/product-configurator/main.ts",
  "examples/architecture-viewer/main.ts",
  "examples/game-slice/main.ts",
  "examples/large-world-streaming/main.ts",
  "examples/racing-showcase/main.ts",
  "packages/rendering/src/ArchitecturalMaterialCatalog.ts",
  "packages/rendering/src/ProceduralTextureFixtures.ts",
  "tests/reports/external-parity-example-screenshots/manifest.json",
  ...screenshotPaths,
] as const;
const checks = [
  {
    id: "v4-example-screenshot-manifest-produced-by-example-agent",
    passed: manifest?.pass === true && screenshotPaths.length >= 4,
    evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
    blocker: "V4 example screenshot manifest is not yet passing.",
  },
  {
    id: "v4-racing-showcase-screenshot-produced-by-example-agent",
    passed: existsSync(`${root}/${racingScreenshotPath}`),
    evidencePaths: [racingScreenshotPath, "tests/browser/racing-showcase-external-parity.spec.ts"],
    blocker: "V4 racing showcase screenshot is missing; run the racing showcase browser test.",
  },
] as const;
const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
const report = {
  ...baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:external-parity-examples",
    runIdPrefix: "external-parity-examples",
    sourceFiles,
    screenshotPaths,
    violations,
  }),
  subsystem: "flagship-examples",
  checks,
  entries: Array.isArray(manifest?.entries) ? manifest.entries.length : 0,
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  writeJson(root, "tests/reports/external-parity-examples.json", report);
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function getScreenshotPaths(value: Record<string, unknown> | null): readonly string[] {
  if (!Array.isArray(value?.entries)) return [];
  return value.entries
    .filter((entry): entry is { screenshotPath: string } =>
      typeof entry === "object" && entry !== null && typeof (entry as { screenshotPath?: unknown }).screenshotPath === "string")
    .map((entry) => entry.screenshotPath);
}
