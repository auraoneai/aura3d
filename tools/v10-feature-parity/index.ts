import { issue, readV9Inventory, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/feature-parity.json";
const inventory = readV9Inventory();
const items = inventory.items ?? [];
const notParity = items.filter((item) => item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded");
const categories = Array.from(new Set(items.map((item) => item.category))).sort();
const decisions = categories.map((category) => {
  const categoryItems = items.filter((item) => item.category === category);
  const blockers = categoryItems
    .filter((item) => item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded")
    .map((item) => `${item.threeExampleId} is ${item.g3dStatus}`);
  const exceeded = categoryItems.length > 0 && categoryItems.every((item) => item.g3dStatus === "exceeded");
  return {
    category,
    decision: blockers.length === 0 ? (exceeded ? "exceeds" as const : "parity" as const) : "partial" as const,
    evidence: ["tests/reports/v9/threejs-inventory.json"],
    blockers
  };
});
const issues = notParity.map((item) => issue(
  `feature-parity:${item.threeExampleId}`,
  `${item.threeExampleId} remains ${item.g3dStatus}; blockers: ${(item.blockingFeatures ?? []).join(", ") || "not documented"}.`
));

writeReport(outputPath, {
  schema: "g3d-v10-feature-parity/v1",
  pass: issues.length === 0,
  decisions,
  issues,
  evidence: ["tests/reports/v9/threejs-inventory.json"]
});

