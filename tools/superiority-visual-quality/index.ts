import { issue, readJson, readThreeJsParityInventory, requirePassingReport, writeReport } from "../superiority-common";

const outputPath = "tests/reports/superiority/visual-quality.json";
const inventory = readThreeJsParityInventory();
const visualReview = readJson<{ readonly needingReview?: number; readonly issues?: readonly unknown[] }>("tests/reports/threejs-parity/visual-review.json");
const items = inventory.items ?? [];
const visualBlockers = items
  .filter((item) => item.visualStatus !== "accepted" && item.a3dStatus !== "exceeded")
  .map((item) => issue(`visual:${item.threeExampleId}`, `${item.threeExampleId} visual status is ${item.visualStatus ?? "unknown"}.`));
const reportIssues = [
  ...requirePassingReport("tests/reports/threejs-parity/visual-review.json", "Three.js parity visual review"),
  ...requirePassingReport("tests/reports/threejs-parity/same-scene-render.json", "Three.js parity same-scene render"),
  ...visualBlockers
];

writeReport(outputPath, {
  schema: "a3d-superiority-visual-quality",
  pass: reportIssues.length === 0 && (visualReview?.needingReview ?? 0) === 0,
  decisions: [{
    category: "graphics-and-visual-quality",
    decision: reportIssues.length === 0 && (visualReview?.needingReview ?? 0) === 0 ? "parity" : "partial",
    evidence: ["tests/reports/threejs-parity/visual-review.json", "tests/reports/threejs-parity/same-scene-render.json"],
    blockers: reportIssues.map((entry) => entry.message)
  }],
  issues: reportIssues,
  evidence: ["tests/reports/threejs-parity/visual-review.json", "tests/reports/threejs-parity/same-scene-render.json"]
});

