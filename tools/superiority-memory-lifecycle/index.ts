import { issue, reportPasses, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/memory-lifecycle.json";
const requiredReports = [
  "tests/reports/threejs-parity/route-health.json",
  "tests/reports/superiority/resource-lifecycle-100-reloads.json"
];
const issues = requiredReports.flatMap((path) => reportPasses(path) ? [] : [issue(`memory-report:${path}`, `${path} is missing or not passing.`)]);

writeReport(outputPath, {
  schema: "a3d-superiority-memory-lifecycle",
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

