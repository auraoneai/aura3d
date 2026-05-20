import { issue, reportPasses, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/memory-lifecycle.json";
const requiredReports = [
  "tests/reports/v9/route-health.json",
  "tests/reports/v10/resource-lifecycle-100-reloads.json"
];
const issues = requiredReports.flatMap((path) => reportPasses(path) ? [] : [issue(`memory-report:${path}`, `${path} is missing or not passing.`)]);

writeReport(outputPath, {
  schema: "g3d-v10-memory-lifecycle/v1",
  pass: issues.length === 0,
  decisions: [{
    category: "stability-and-memory",
    decision: issues.length === 0 ? "exceeds" : "partial",
    evidence: requiredReports,
    blockers: issues.map((entry) => entry.message)
  }],
  issues,
  evidence: requiredReports
});

