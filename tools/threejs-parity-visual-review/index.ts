import { existsSync, readFileSync } from "node:fs";
import { readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/visual-review.json";
const inventory = readInventory();
const needingReview = inventory.items.filter((item) => item.visualStatus !== "accepted");
const reviewPath = "docs/project/showcase-visual-review.json";
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")) as {
  readonly reviewer?: { readonly id?: string; readonly name?: string; readonly kind?: string };
  readonly overallVerdict?: string;
  readonly summary?: string;
} : undefined;
const namedHumanApproval = review?.reviewer?.kind === "human"
  && Boolean(review.reviewer.id)
  && !/pending/i.test(`${review.reviewer.id} ${review.reviewer.name}`)
  && review.overallVerdict === "pass";
const issues = [
  ...needingReview.map((item) => reportIssue(
  `visual-review:${item.threeExampleId}`,
  `${item.threeExampleId} visual status is ${item.visualStatus}.`,
  item.priority === "high" ? "blocker" : "warning"
  )),
  ...(!namedHumanApproval ? [reportIssue("visual-review:independent-human-approval", "No current hash-bound review by a named human approves the final visual set.", "blocker")] : [])
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-visual-review",
  generatedAt: new Date().toISOString(),
  pass: !issues.some((issue) => issue.severity === "blocker"),
  inventoryLabelsAccepted: inventory.items.length - needingReview.length,
  independentHumanApproval: namedHumanApproval,
  reviewPath,
  reviewer: review?.reviewer ?? null,
  overallVerdict: review?.overallVerdict ?? "missing",
  accepted: inventory.items.length - needingReview.length,
  needingReview: needingReview.length,
  issues
});
console.log(`Three.js parity visual review report written: ${outputPath}`);
