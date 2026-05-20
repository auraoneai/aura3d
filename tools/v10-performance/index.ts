import { issue, readJson, requirePassingReport, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/performance.json";
const performance = readJson<{ readonly claim?: string; readonly evidence?: readonly string[] }>("tests/reports/v9/performance.json");
const blockers = [
  ...requirePassingReport("tests/reports/v9/performance.json", "V9 performance"),
  ...((performance?.claim ?? "").toLowerCase().includes("blocked")
    ? [issue("performance:broad-superiority-blocked", `V9 performance claim is still blocked: ${performance?.claim}`)]
    : [])
];
const evidence = ["tests/reports/v9/performance.json", ...(performance?.evidence ?? [])];

writeReport(outputPath, {
  schema: "g3d-v10-performance/v1",
  pass: blockers.length === 0,
  decisions: [{
    category: "performance",
    decision: blockers.length === 0 ? "parity" : "partial",
    evidence,
    blockers: blockers.map((entry) => entry.message)
  }],
  issues: blockers,
  evidence
});

