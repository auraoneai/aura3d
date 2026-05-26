import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const productExamples = ["product-configurator", "architecture-viewer", "game-slice"] as const;

type ProductExample = (typeof productExamples)[number];
type JsonRecord = Record<string, unknown>;

export interface ProductDemoValidationReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly productExamples: readonly ProductExample[];
  readonly visualExamples: readonly ProductExample[];
  readonly performanceExamples: readonly ProductExample[];
  readonly missingVisualExamples: readonly ProductExample[];
  readonly missingPerformanceExamples: readonly ProductExample[];
  readonly visualReportPassed: boolean;
  readonly performanceReportPassed: boolean;
  readonly violations: readonly string[];
}

const root = process.cwd();
const reportPath = join(root, "tests", "reports", "product-demo-validation.json");

function readJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPassedDemoIds(report: JsonRecord | null, field: "demos" | "baselines"): ProductExample[] {
  const rows = report?.[field];
  if (!Array.isArray(rows)) return [];
  return productExamples.filter((id) =>
    rows.some((row) => isRecord(row) && row.id === id && (row.passed === true || row.withinBudget === true)),
  );
}

export function validateProductDemoReports(rootDir = root): ProductDemoValidationReport {
  const visual = readJson(join(rootDir, "tests", "reports", "product-visual.json"));
  const performance = readJson(join(rootDir, "tests", "reports", "product-performance.json"));
  const visualExamples = collectPassedDemoIds(visual, "demos");
  const performanceExamples = collectPassedDemoIds(performance, "baselines");
  const missingVisualExamples = productExamples.filter((id) => !visualExamples.includes(id));
  const missingPerformanceExamples = productExamples.filter((id) => !performanceExamples.includes(id));
  const visualReportPassed =
    visual !== null &&
    visual.ok === true &&
    missingVisualExamples.length === 0 &&
    isRecord(visual.screenshotDiffPolicy) &&
    typeof visual.screenshotDiffPolicy.artifactRetention === "string";
  const performanceReportPassed =
    performance !== null &&
    performance.status === "pass" &&
    missingPerformanceExamples.length === 0;
  const violations = [
    ...(visual === null ? ["Missing tests/reports/product-visual.json"] : []),
    ...(performance === null ? ["Missing tests/reports/product-performance.json"] : []),
    ...missingVisualExamples.map((id) => `Missing passing product visual screenshot-diff evidence: ${id}`),
    ...missingPerformanceExamples.map((id) => `Missing passing product performance baseline evidence: ${id}`),
    ...(visualReportPassed ? [] : ["Product visual report is incomplete or failed"]),
    ...(performanceReportPassed ? [] : ["Product performance report is incomplete or failed"]),
  ];

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-product-demo-validation-run",
    productExamples: [...productExamples],
    visualExamples,
    performanceExamples,
    missingVisualExamples,
    missingPerformanceExamples,
    visualReportPassed,
    performanceReportPassed,
    violations,
  };
}

function writeReport(report: ProductDemoValidationReport): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateProductDemoReports();
  writeReport(report);
  console.log(JSON.stringify({
    ok: report.ok,
    visualExamples: report.visualExamples.length,
    performanceExamples: report.performanceExamples.length,
    violations: report.violations.length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
