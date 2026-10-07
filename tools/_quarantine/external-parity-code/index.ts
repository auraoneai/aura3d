import { fileURLToPath } from "node:url";
import { validateExternalParityClaimGates } from "../external-parity-claim-gates/index.js";
import { createExternalParityCurrentCapabilityReport } from "../external-parity-current-capability/index.js";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();

export function createExternalParityCodeReport() {
  const claimGates = validateExternalParityClaimGates(root);
  writeJson(root, "tests/reports/external-parity-claim-gates.json", claimGates);
  const capability = createExternalParityCurrentCapabilityReport(root);
  writeJson(root, "tests/reports/external-parity-current-capability.json", capability);
  const violations = [
    ...(claimGates.ok ? [] : ["external-parity claim gates failed"]),
    ...(capability.ok ? [] : ["external-parity current capability report failed"]),
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
        "docs/project/product-studio-decision-gates.md",
        "docs/project/implementation-plan.md",
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
  const report = createExternalParityCodeReport();
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
