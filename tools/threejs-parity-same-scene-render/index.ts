import { readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/same-scene-render.json";
const inventory = readInventory();
const candidates = inventory.items.filter((item) => item.sameSceneAvailable);
const missing = inventory.items.filter((item) => !item.sameSceneAvailable);
const issues = missing
  .filter((item) => item.priority === "high")
  .map((item) => reportIssue(`same-scene-missing:${item.threeExampleId}`, `${item.threeExampleId} has no same-scene A3D route yet.`, "blocker"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-same-scene-render/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  sameSceneCandidateCount: candidates.length,
  missingSameSceneCount: missing.length,
  issues
});
console.log(`V9 same-scene render report written: ${outputPath}`);
