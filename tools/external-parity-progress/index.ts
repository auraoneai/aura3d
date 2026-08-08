import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readChecklistScope } from "../threejs-parity-common/index.js";

const progressPath = "1.6-FINAL-PRD-Finishes.md";
const scope = {
  path: progressPath,
  startHeading: "## 7. Phase 3 — Make the public renderer a current competitor",
  endHeading: "## 8. Phase 4 — Current head-to-head comparison program"
} as const;
const result = readChecklistScope(scope);
const completedMilestones = result.items.filter((item) => item.checked);
const incompleteMilestones = result.items.filter((item) => !item.checked);
const activeMilestone = incompleteMilestones[0]?.text ?? "complete";
const currentStatus = incompleteMilestones.length === 0 ? "complete" : "in-progress";

const report = {
  schema: "a3d-external-parity-progress",
  generatedAt: new Date().toISOString(),
  pass: existsSync(progressPath)
    && result.total > 0,
  progressPath,
  scope,
  currentStatus,
  activeMilestone,
  completedMilestoneCount: completedMilestones.length,
  incompleteMilestoneCount: incompleteMilestones.length,
  totalMilestoneCount: result.total,
  activeItems: incompleteMilestones.slice(0, 10),
  knownGaps: incompleteMilestones.map((item) => item.text),
  knownIncompleteMilestones: incompleteMilestones.map((item) => item.text)
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-progress.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
