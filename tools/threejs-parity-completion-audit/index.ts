import { countChecklist, listUncheckedChecklist, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/completion-audit.json";
const inventory = readInventory();
const checklist = countChecklist();
const unchecked = listUncheckedChecklist();
const openHighPriority = inventory.items.filter((item) => item.priority === "high" && item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded");
const pass = checklist.unchecked === 0 && openHighPriority.length === 0;
const issues = [
  ...unchecked.slice(0, 100).map((item, index) => reportIssue(`unchecked:${index + 1}`, item, "blocker")),
  ...openHighPriority.slice(0, 100).map((item) => reportIssue(`high-priority-open:${item.threeExampleId}`, `${item.threeExampleId} remains ${item.g3dStatus}.`, "blocker"))
];

writeJson(outputPath, {
  schema: "g3d-threejs-parity-completion-audit/v1",
  generatedAt: new Date().toISOString(),
  pass,
  checklist,
  uncheckedPreview: unchecked.slice(0, 100),
  openHighPriority: openHighPriority.map((item) => item.threeExampleId),
  issues
});
console.log(`V9 completion audit written: ${outputPath}`);
if (!pass && !process.argv.includes("--report-only")) {
  throw new Error(`V9 is incomplete: ${checklist.unchecked} checklist items and ${openHighPriority.length} high-priority inventory items remain open.`);
}
