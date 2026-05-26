import { issue, readJson, reportPasses, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/developer-workflow.json";
const packageSmoke = reportPasses("tests/reports/threejs-parity/package-smoke.json");
const externalConsumer = reportPasses("tests/reports/threejs-parity/external-consumer.json");
const migrationAudit = reportPasses("tests/reports/threejs-parity/migration-audit.json");
const templateReport = reportPasses("tests/reports/external-parity-template-readiness.json") || reportPasses("tests/reports/production-runtime-template-readiness.json");
const publicApi = reportPasses("tests/reports/threejs-parity/api-surface.json");
const apiDocs = readJson<{ readonly ok?: boolean }>("tests/reports/api-docs.json");
const issues = [
  ...(packageSmoke ? [] : [issue("workflow:package-smoke", "Three.js parity package smoke is missing or failing.")]),
  ...(externalConsumer ? [] : [issue("workflow:external-consumer", "Three.js parity external consumer is missing or failing.")]),
  ...(migrationAudit ? [] : [issue("workflow:migration-audit", "Three.js parity migration audit is missing or failing.")]),
  ...(templateReport ? [] : [issue("workflow:templates", "Template readiness report is missing or failing.")]),
  ...(publicApi ? [] : [issue("workflow:api-surface", "Three.js parity API surface report is missing or failing.")]),
  ...(apiDocs?.ok === true ? [] : [issue("workflow:api-docs", "API docs report is missing or not ok.")])
];
const evidence = [
  "tests/reports/threejs-parity/package-smoke.json",
  "tests/reports/threejs-parity/external-consumer.json",
  "tests/reports/threejs-parity/migration-audit.json",
  "tests/reports/external-parity-template-readiness.json",
  "tests/reports/production-runtime-template-readiness.json",
  "tests/reports/threejs-parity/api-surface.json",
  "tests/reports/api-docs.json"
];

writeReport(outputPath, {
  schema: "a3d-superiority-developer-workflow",
  pass: issues.length === 0,
  decisions: [{
    category: "developer-workflow",
    decision: issues.length === 0 ? "exceeds" : "partial",
    evidence,
    blockers: issues.map((entry) => entry.message)
  }],
  issues,
  evidence
});

