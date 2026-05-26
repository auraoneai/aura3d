import { issue, publicDocs, readText, reportPasses, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/claim-defense.json";
const requiredReports = [
  "tests/reports/superiority/feature-parity.json",
  "tests/reports/superiority/visual-quality.json",
  "tests/reports/superiority/performance.json",
  "tests/reports/superiority/animation-fidelity.json",
  "tests/reports/superiority/physics-fidelity.json",
  "tests/reports/superiority/memory-lifecycle.json",
  "tests/reports/superiority/developer-workflow.json"
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
  "tests/reports/superiority/claim-defense.json",
  "docs/project/threejs-superiority-status.md"
];
const readme = readText("README.md").toLowerCase();
const readmeIssues = requiredReadmePhrases.flatMap((phrase) => readme.includes(phrase)
  ? []
  : [issue(`readme-required:${phrase}`, `README.md must include "${phrase}" after final gate.`)]);
const issues = [...reportIssues, ...languageIssues, ...readmeIssues];

writeReport(outputPath, {
  schema: "a3d-superiority-claim-defense",
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

