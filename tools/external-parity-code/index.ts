import { fileURLToPath } from "node:url";
import { validateV4ClaimGates } from "../external-parity-claim-gates/index.js";
import { createV4CurrentCapabilityReport } from "../external-parity-current-capability/index.js";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();

export function createV4CodeReport() {
  const claimGates = validateV4ClaimGates(root);
  writeJson(root, "tests/reports/external-parity-claim-gates.json", claimGates);
  const capability = createV4CurrentCapabilityReport(root);
  writeJson(root, "tests/reports/external-parity-current-capability.json", capability);
  const violations = [
    ...(claimGates.ok ? [] : ["v4 claim gates failed"]),
    ...(capability.ok ? [] : ["v4 current capability report failed"]),
  ];
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:external-parity-code",
      runIdPrefix: "external-parity-code",
      sourceFiles: [
        "tools/external-parity-code/index.ts",
        "tools/external-parity-claim-gates/index.ts",
        "tools/external-parity-current-capability/index.ts",
        "docs/project/v4-decision-gates.md",
        "docs/project/v4-master-code-checklist.md",
      ],
      violations,
    }),
    reports: {
      claimGates: "tests/reports/external-parity-claim-gates.json",
      currentCapability: "tests/reports/external-parity-current-capability.json",
    },
  };
  writeJson(root, "tests/reports/external-parity-code.json", report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4CodeReport();
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
