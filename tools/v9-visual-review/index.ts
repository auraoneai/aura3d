import { readInventory, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/visual-review.json";
const inventory = readInventory();
const needingReview = inventory.items.filter((item) => item.visualStatus !== "accepted");
const issues = needingReview.map((item) => reportIssue(
  `visual-review:${item.threeExampleId}`,
  `${item.threeExampleId} visual status is ${item.visualStatus}.`,
  item.priority === "high" ? "blocker" : "warning"
));

writeJson(outputPath, {
  schema: "g3d-v9-visual-review/v1",
  generatedAt: new Date().toISOString(),
  pass: !issues.some((issue) => issue.severity === "blocker"),
  accepted: inventory.items.length - needingReview.length,
  needingReview: needingReview.length,
  issues
});
console.log(`V9 visual review report written: ${outputPath}`);
