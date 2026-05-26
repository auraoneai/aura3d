import { issue, readThreeJsParityInventory, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/feature-parity.json";
const inventory = readThreeJsParityInventory();
const items = inventory.items ?? [];
const notParity = items.filter((item) => item.a3dStatus !== "matched" && item.a3dStatus !== "exceeded");
const categories = Array.from(new Set(items.map((item) => item.category))).sort();
const decisions = categories.map((category) => {
  const categoryItems = items.filter((item) => item.category === category);
  const blockers = categoryItems
    .filter((item) => item.a3dStatus !== "matched" && item.a3dStatus !== "exceeded")
    .map((item) => `${item.threeExampleId} is ${item.a3dStatus}`);
  const exceeded = categoryItems.length > 0 && categoryItems.every((item) => item.a3dStatus === "exceeded");
  return {
    category,
    decision: blockers.length === 0 ? (exceeded ? "exceeds" as const : "parity" as const) : "partial" as const,
    evidence: ["tests/reports/threejs-parity/threejs-inventory.json"],
    blockers
  };
});
const issues = notParity.map((item) => issue(
  `feature-parity:${item.threeExampleId}`,
  `${item.threeExampleId} remains ${item.a3dStatus}; blockers: ${(item.blockingFeatures ?? []).join(", ") || "not documented"}.`
));

writeReport(outputPath, {
  schema: "a3d-superiority-feature-parity",
  pass: issues.length === 0,
  decisions,
  issues,
  evidence: ["tests/reports/threejs-parity/threejs-inventory.json"]
});

