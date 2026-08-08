import { statSync } from "node:fs";
import { fileExists, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/same-scene-render.json";
const inventory = readInventory();
const candidates = inventory.items.filter((item) => item.sameSceneAvailable);
const audited = candidates.map((item) => {
  const a3d = item.screenshots.filter((path) => /(?:^|\/)a3d-|aura3d-/i.test(path));
  const threejs = item.screenshots.filter((path) => /(?:^|\/)threejs-/i.test(path));
  const pairedBrowserTest = item.tests.some((path) => /tests\/browser\/threejs-parity-/.test(path));
  const existing = [...a3d, ...threejs].filter((path) => fileExists(path) && statSync(path).size > 8_000);
  const pass = a3d.length > 0 && threejs.length > 0 && pairedBrowserTest && existing.length === a3d.length + threejs.length;
  return { id: item.threeExampleId, priority: item.priority, pass, a3d, threejs, pairedBrowserTest, existingImageCount: existing.length };
});
const missing = inventory.items.filter((item) => !item.sameSceneAvailable);
const issues = [
  ...missing.filter((item) => item.priority === "high").map((item) => reportIssue(`same-scene-missing:${item.threeExampleId}`, `${item.threeExampleId} has no same-scene A3D route yet.`, "blocker")),
  ...audited.filter((item) => !item.pass).map((item) => reportIssue(`same-scene-unproven:${item.id}`, `${item.id} lacks an existing non-placeholder A3D/Three.js image pair and named paired browser test.`, item.priority === "high" ? "blocker" : "warning"))
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-same-scene-render",
  generatedAt: new Date().toISOString(),
  pass: !issues.some((issue) => issue.severity === "blocker"),
  sameSceneCandidateCount: candidates.length,
  missingSameSceneCount: missing.length,
  provenSameSceneCount: audited.filter((item) => item.pass).length,
  audited,
  issues
});
console.log(`Three.js parity same-scene render report written: ${outputPath}`);
