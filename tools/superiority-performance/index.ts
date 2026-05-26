import { issue, readJson, requirePassingReport, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/performance.json";
const performance = readJson<{ readonly claim?: string; readonly evidence?: readonly string[] }>("tests/reports/threejs-parity/performance.json");
const blockers = [
  ...requirePassingReport("tests/reports/threejs-parity/performance.json", "Three.js parity performance"),
  ...((performance?.claim ?? "").toLowerCase().includes("blocked")
    ? [issue("performance:broad-superiority-blocked", `Three.js parity performance claim is still blocked: ${performance?.claim}`)]
    : [])
];
const evidence = ["tests/reports/threejs-parity/performance.json", ...(performance?.evidence ?? [])];

writeReport(outputPath, {
  schema: "a3d-superiority-performance",
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

