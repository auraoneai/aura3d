import { readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/official-example-parity.json";
const inventory = readInventory();
const incomplete = inventory.items.filter((item) => item.a3dStatus !== "matched" && item.a3dStatus !== "exceeded");
const highPriorityIncomplete = incomplete.filter((item) => item.priority === "high");
const issues = highPriorityIncomplete.map((item) => reportIssue(
  `official-example-open:${item.threeExampleId}`,
  `${item.threeExampleId} is ${item.a3dStatus}; blockers: ${item.blockingFeatures.join(", ") || "not documented"}.`,
  "blocker"
));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-official-example-parity",
  generatedAt: new Date().toISOString(),
  pass: highPriorityIncomplete.length === 0,
  examples: inventory.items.length,
  incomplete: incomplete.length,
  highPriorityIncomplete: highPriorityIncomplete.length,
  issues
});
console.log(`Three.js parity official example parity report written: ${outputPath}`);
