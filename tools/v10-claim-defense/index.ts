import { issue, publicDocs, readText, reportPasses, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/claim-defense.json";
const requiredReports = [
  "tests/reports/v10/feature-parity.json",
  "tests/reports/v10/visual-quality.json",
  "tests/reports/v10/performance.json",
  "tests/reports/v10/animation-fidelity.json",
  "tests/reports/v10/physics-fidelity.json",
  "tests/reports/v10/memory-lifecycle.json",
  "tests/reports/v10/developer-workflow.json"
];
const forbiddenCurrentLanguage = [
  "experimental",
  "alpha",
  "not production-ready",
  "not full three.js parity",
  "building toward parity",
  "building toward superiority",
  "partial parity",
  "inferior"
];
const reportIssues = requiredReports.flatMap((path) => reportPasses(path) ? [] : [issue(`claim-report:${path}`, `${path} is missing or not passing.`)]);
const languageIssues = publicDocs().flatMap((path) => {
  const text = readText(path).toLowerCase();
  if (!text) return [issue(`claim-doc-missing:${path}`, `${path} is missing or empty.`)];
  return forbiddenCurrentLanguage.flatMap((phrase) => text.includes(phrase)
    ? [issue(`forbidden-language:${path}:${phrase}`, `${path} still contains post-completion forbidden phrase "${phrase}".`)]
    : []);
});
const requiredReadmePhrases = [
  "matches or exceeds three.js",
  "why a3d beats three.js",
  "tests/reports/v10/claim-defense.json",
  "docs/project/v10-superiority-status.md"
];
const readme = readText("README.md").toLowerCase();
const readmeIssues = requiredReadmePhrases.flatMap((phrase) => readme.includes(phrase)
  ? []
  : [issue(`readme-required:${phrase}`, `README.md must include "${phrase}" after final gate.`)]);
const issues = [...reportIssues, ...languageIssues, ...readmeIssues];

writeReport(outputPath, {
  schema: "a3d-v10-claim-defense/v1",
  pass: issues.length === 0,
  decisions: [{
    category: "documentation-and-gtm",
    decision: issues.length === 0 ? "exceeds" : "partial",
    evidence: [...requiredReports, ...publicDocs()],
    blockers: issues.map((entry) => entry.message)
  }],
  issues,
  evidence: [...requiredReports, ...publicDocs()]
});

