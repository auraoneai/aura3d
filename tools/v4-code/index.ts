import { fileURLToPath } from "node:url";
import { validateV4ClaimGates } from "../v4-claim-gates/index.js";
import { createV4CurrentCapabilityReport } from "../v4-current-capability/index.js";
import { baseReport, writeJson } from "../v4-reporting/index.js";

const root = process.cwd();

export function createV4CodeReport() {
  const claimGates = validateV4ClaimGates(root);
  writeJson(root, "tests/reports/v4-claim-gates.json", claimGates);
  const capability = createV4CurrentCapabilityReport(root);
  writeJson(root, "tests/reports/v4-current-capability.json", capability);
  const violations = [
    ...(claimGates.ok ? [] : ["v4 claim gates failed"]),
    ...(capability.ok ? [] : ["v4 current capability report failed"]),
  ];
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:v4-code",
      runIdPrefix: "v4-code",
      sourceFiles: [
        "tools/v4-code/index.ts",
        "tools/v4-claim-gates/index.ts",
        "tools/v4-current-capability/index.ts",
        "docs/project/v4-decision-gates.md",
        "docs/project/v4-master-code-checklist.md",
      ],
      violations,
    }),
    reports: {
      claimGates: "tests/reports/v4-claim-gates.json",
      currentCapability: "tests/reports/v4-current-capability.json",
    },
  };
  writeJson(root, "tests/reports/v4-code.json", report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4CodeReport();
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
