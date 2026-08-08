import { readChecklistScope, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/completion-audit.json";
const inventory = readInventory();
const finalPrdScope = {
  path: "1.6-FINAL-PRD-Finishes.md",
  startHeading: "## 7. Phase 3 — Make the public renderer a current competitor",
  endHeading: "## 10. Phase 6 — Developer experience and package architecture"
} as const;
const checklistResult = readChecklistScope(finalPrdScope);
const checklist = { checked: checklistResult.checked, unchecked: checklistResult.unchecked, total: checklistResult.total };
const unchecked = checklistResult.items.filter((item) => !item.checked).map((item) => item.text);
const openHighPriority = inventory.items.filter((item) => item.priority === "high" && item.a3dStatus !== "matched" && item.a3dStatus !== "exceeded");
const pass = checklist.unchecked === 0 && openHighPriority.length === 0;
const issues = [
  ...unchecked.slice(0, 100).map((item, index) => reportIssue(`unchecked:${index + 1}`, item, "blocker")),
  ...openHighPriority.slice(0, 100).map((item) => reportIssue(`high-priority-open:${item.threeExampleId}`, `${item.threeExampleId} remains ${item.a3dStatus}.`, "blocker"))
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-completion-audit",
  generatedAt: new Date().toISOString(),
  pass,
  scope: finalPrdScope,
  checklist,
  uncheckedPreview: unchecked.slice(0, 100),
  openHighPriority: openHighPriority.map((item) => item.threeExampleId),
  issues
});
console.log(`Three.js parity completion audit written: ${outputPath}`);
if (!pass && !process.argv.includes("--report-only")) {
  throw new Error(`Three.js parity is incomplete: ${checklist.unchecked} checklist items and ${openHighPriority.length} high-priority inventory items remain open.`);
}
