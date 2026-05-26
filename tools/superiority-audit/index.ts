import { categoriesPass, issue, readJson, writeReport, type SuperiorityCategoryDecision, type SuperiorityReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/superiority-audit.json";
const requiredReports = [
  "tests/reports/superiority/feature-parity.json",
  "tests/reports/superiority/visual-quality.json",
  "tests/reports/superiority/performance.json",
  "tests/reports/superiority/animation-fidelity.json",
  "tests/reports/superiority/physics-fidelity.json",
  "tests/reports/superiority/memory-lifecycle.json",
  "tests/reports/superiority/developer-workflow.json",
  "tests/reports/superiority/claim-defense.json"
];
const reports = requiredReports.map((path) => ({ path, report: readJson<SuperiorityReport>(path) }));
const missingOrFailing = reports.flatMap(({ path, report }) => {
  if (!report) return [issue(`missing:${path}`, `Missing required Superiority report: ${path}.`)];
  if (report.pass !== true) return [issue(`failing:${path}`, `Required Superiority report is failing: ${path}.`)];
  return [];
});
const decisions: SuperiorityCategoryDecision[] = reports.flatMap(({ report }) => report?.decisions ? [...report.decisions] : []);
const weakDecisions = decisions.flatMap((entry) => entry.decision === "parity" || entry.decision === "exceeds"
  ? []
  : [issue(`decision:${entry.category}`, `${entry.category} remains ${entry.decision}.`)]);
const issues = [...missingOrFailing, ...weakDecisions];

writeReport(outputPath, {
  schema: "a3d-threejs-superiority-audit",
  pass: issues.length === 0 && categoriesPass(decisions),
  decisions,
  issues,
  evidence: requiredReports
});
