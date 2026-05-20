import { fileURLToPath } from "node:url";
import { baseReport, v3ReportPaths, validateV3ReportFreshness, writeJson } from "../v3-reporting/index.js";

const reportPath = "tests/reports/v3-report-freshness.json";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export function createV3ReportFreshnessReport(root = process.cwd()) {
  const issues = validateV3ReportFreshness(root);
  const report = {
    ...baseReport(root, {
      ok: issues.length === 0,
      command: "pnpm verify:v3-report-freshness",
      runIdPrefix: "v3-report-freshness",
      sourceFiles: [
        "tools/v3-reporting/index.ts",
        ...v3ReportPaths,
      ],
      violations: issues.map((issue) => `${issue.path}: ${issue.message}`),
    }),
    checkedReports: v3ReportPaths.length,
    issues,
  };
  writeJson(root, reportPath, report);
  return report;
}

if (isMain) {
  const report = createV3ReportFreshnessReport();
  console.log(JSON.stringify({ ok: report.ok, issues: report.issues.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
