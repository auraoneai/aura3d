import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const progress = readFileSync(resolve("docs/project/completion-audit.md"), "utf8");
const completed = Array.from(progress.matchAll(/- \[x\] Milestone (\d+) -/g)).map((match) => Number(match[1]));
const incomplete = Array.from(progress.matchAll(/- \[ \] Milestone (\d+) -/g)).map((match) => Number(match[1]));
const active = /Current milestone: (Milestone \d+)/.exec(progress)?.[1] ?? "unknown";
const currentStatus = /^Current status:\s*(.+)$/m.exec(progress)?.[1]?.trim() ?? "unknown";
const productDecisionPasses = reportPasses("tests/reports/production-runtime-product-decision-record.json");
const literalCompletionPasses = reportPasses("tests/reports/production-runtime-literal-completion.json");
const pass =
  ((completed.includes(15) && active === "Milestone 16" && incomplete.includes(17) && incomplete.includes(18))
  || (completed.includes(16) && active === "Milestone 17" && incomplete.includes(18))
  || (completed.includes(17) && active === "Milestone 18" && incomplete.includes(18) && productDecisionPasses)
  || (currentStatus === "complete" && completed.includes(18) && productDecisionPasses && literalCompletionPasses));
const report = {
  schema: "a3d-production-runtime-completion-audit",
  generatedAt: new Date().toISOString(),
  pass,
  completionState: currentStatus === "complete" && completed.includes(18) && productDecisionPasses && literalCompletionPasses ? "complete" : "not-complete-yet",
  completedMilestones: completed,
  incompleteMilestones: incomplete,
  activeMilestone: active,
  currentStatus,
  productDecisionPasses,
  literalCompletionPasses,
  remainingReleaseWork: ["Milestone 16 - Release Readiness", "Milestone 17 - Full Release Command", "Milestone 18 - Product Decision Record"],
  decision: "Do not mark Production runtime complete until release command and product decision record pass."
};
mkdirSync(dirname(resolve("tests/reports/production-runtime-completion-audit.json")), { recursive: true });
writeFileSync(resolve("tests/reports/production-runtime-completion-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function reportPasses(path: string): boolean {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"))?.pass === true;
  } catch {
    return false;
  }
}
