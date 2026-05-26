import { fileURLToPath } from "node:url";
import { baseReport, foundationReportPaths, validateFoundationReportFreshness, writeJson } from "../foundation-reporting/index.js";

const reportPath = "tests/reports/foundation-report-freshness.json";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export function createFoundationReportFreshnessReport(root = process.cwd()) {
  const issues = validateFoundationReportFreshness(root);
  const report = {
    ...baseReport(root, {
      ok: issues.length === 0,
      command: "pnpm verify:foundation-report-freshness",
      runIdPrefix: "foundation-report-freshness",
      sourceFiles: [
        "tools/foundation-reporting/index.ts",
        ...foundationReportPaths,
      ],
      violations: issues.map((issue) => `${issue.path}: ${issue.message}`),
    }),
    checkedReports: foundationReportPaths.length,
    issues,
  };
  writeJson(root, reportPath, report);
  return report;
}

if (isMain) {
  const report = createFoundationReportFreshnessReport();
  console.log(JSON.stringify({ ok: report.ok, issues: report.issues.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
