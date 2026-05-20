import { issue, readJson, reportPasses, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/developer-workflow.json";
const packageSmoke = reportPasses("tests/reports/v9/package-smoke.json");
const externalConsumer = reportPasses("tests/reports/v9/external-consumer.json");
const migrationAudit = reportPasses("tests/reports/v9/migration-audit.json");
const templateReport = reportPasses("tests/reports/v4-template-readiness.json") || reportPasses("tests/reports/v6-template-readiness.json");
const publicApi = reportPasses("tests/reports/v9/api-surface.json");
const apiDocs = readJson<{ readonly ok?: boolean }>("tests/reports/api-docs.json");
const issues = [
  ...(packageSmoke ? [] : [issue("workflow:package-smoke", "V9 package smoke is missing or failing.")]),
  ...(externalConsumer ? [] : [issue("workflow:external-consumer", "V9 external consumer is missing or failing.")]),
  ...(migrationAudit ? [] : [issue("workflow:migration-audit", "V9 migration audit is missing or failing.")]),
  ...(templateReport ? [] : [issue("workflow:templates", "Template readiness report is missing or failing.")]),
  ...(publicApi ? [] : [issue("workflow:api-surface", "V9 API surface report is missing or failing.")]),
  ...(apiDocs?.ok === true ? [] : [issue("workflow:api-docs", "API docs report is missing or not ok.")])
];
const evidence = [
  "tests/reports/v9/package-smoke.json",
  "tests/reports/v9/external-consumer.json",
  "tests/reports/v9/migration-audit.json",
  "tests/reports/v4-template-readiness.json",
  "tests/reports/v6-template-readiness.json",
  "tests/reports/v9/api-surface.json",
  "tests/reports/api-docs.json"
];

writeReport(outputPath, {
  schema: "g3d-v10-developer-workflow/v1",
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

