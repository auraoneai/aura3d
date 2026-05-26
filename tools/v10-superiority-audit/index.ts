import { categoriesPass, issue, readJson, writeReport, type V10CategoryDecision, type V10Report } from "../v10-common";

const outputPath = "tests/reports/v10/superiority-audit.json";
const requiredReports = [
  "tests/reports/v10/feature-parity.json",
  "tests/reports/v10/visual-quality.json",
  "tests/reports/v10/performance.json",
  "tests/reports/v10/animation-fidelity.json",
  "tests/reports/v10/physics-fidelity.json",
  "tests/reports/v10/memory-lifecycle.json",
  "tests/reports/v10/developer-workflow.json",
  "tests/reports/v10/claim-defense.json"
];
const reports = requiredReports.map((path) => ({ path, report: readJson<V10Report>(path) }));
const missingOrFailing = reports.flatMap(({ path, report }) => {
  if (!report) return [issue(`missing:${path}`, `Missing required V10 report: ${path}.`)];
  if (report.pass !== true) return [issue(`failing:${path}`, `Required V10 report is failing: ${path}.`)];
  return [];
});
const decisions: V10CategoryDecision[] = reports.flatMap(({ report }) => report?.decisions ? [...report.decisions] : []);
const weakDecisions = decisions.flatMap((entry) => entry.decision === "parity" || entry.decision === "exceeds"
  ? []
  : [issue(`decision:${entry.category}`, `${entry.category} remains ${entry.decision}.`)]);
const issues = [...missingOrFailing, ...weakDecisions];

writeReport(outputPath, {
  schema: "a3d-v10-superiority-audit/v1",
  pass: issues.length === 0 && categoriesPass(decisions),
  decisions,
  issues,
  evidence: requiredReports
});

