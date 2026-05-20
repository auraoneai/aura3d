import { fileURLToPath } from "node:url";
import { baseReport, v4ReportPaths, validateV4ReportFreshness, writeJson } from "../v4-reporting/index.js";

const reportPath = "tests/reports/v4-report-freshness.json";

export function createV4ReportFreshnessReport(root = process.cwd()) {
  const issues = validateV4ReportFreshness(root);
  const report = {
    ...baseReport(root, {
      ok: issues.length === 0,
      command: "pnpm verify:v4-report-freshness",
      runIdPrefix: "v4-report-freshness",
      sourceFiles: [
        "tools/v4-reporting/index.ts",
        ...v4ReportPaths,
      ],
      violations: issues.map((issue) => `${issue.path}: ${issue.message}`),
    }),
    checkedReports: v4ReportPaths.length,
    issues,
  };
  writeJson(root, reportPath, report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4ReportFreshnessReport();
  console.log(JSON.stringify({ ok: report.ok, issues: report.issues.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
