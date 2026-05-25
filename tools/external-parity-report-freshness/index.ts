import { fileURLToPath } from "node:url";
import { baseReport, v4ReportPaths, validateV4ReportFreshness, writeJson } from "../external-parity-reporting/index.js";

const reportPath = "tests/reports/external-parity-report-freshness.json";

export function createV4ReportFreshnessReport(root = process.cwd(), paths: readonly string[] = v4ReportPaths, outputPath = reportPath) {
  const issues = validateV4ReportFreshness(root, paths);
  const report = {
    ...baseReport(root, {
      ok: issues.length === 0,
      command: "pnpm verify:external-parity-report-freshness",
      runIdPrefix: "external-parity-report-freshness",
      sourceFiles: [
        "tools/external-parity-reporting/index.ts",
        ...paths,
      ],
      violations: issues.map((issue) => `${issue.path}: ${issue.message}`),
    }),
    checkedReports: paths.length,
    issues,
  };
  writeJson(root, outputPath, report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const pathsIndex = process.argv.indexOf("--paths");
  const outputIndex = process.argv.indexOf("--output");
  const paths = pathsIndex === -1 ? v4ReportPaths : process.argv[pathsIndex + 1]?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? v4ReportPaths;
  const outputPath = outputIndex === -1 ? reportPath : process.argv[outputIndex + 1] ?? reportPath;
  const report = createV4ReportFreshnessReport(process.cwd(), paths, outputPath);
  console.log(JSON.stringify({ ok: report.ok, issues: report.issues.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
