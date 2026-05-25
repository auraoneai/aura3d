import { readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/official-example-parity.json";
const inventory = readInventory();
const incomplete = inventory.items.filter((item) => item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded");
const highPriorityIncomplete = incomplete.filter((item) => item.priority === "high");
const issues = highPriorityIncomplete.map((item) => reportIssue(
  `official-example-open:${item.threeExampleId}`,
  `${item.threeExampleId} is ${item.g3dStatus}; blockers: ${item.blockingFeatures.join(", ") || "not documented"}.`,
  "blocker"
));

writeJson(outputPath, {
  schema: "g3d-threejs-parity-official-example-parity/v1",
  generatedAt: new Date().toISOString(),
  pass: highPriorityIncomplete.length === 0,
  examples: inventory.items.length,
  incomplete: incomplete.length,
  highPriorityIncomplete: highPriorityIncomplete.length,
  issues
});
console.log(`V9 official example parity report written: ${outputPath}`);
