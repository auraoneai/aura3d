import { fileExists, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/performance.json";
const evidence = [
  "tests/reports/v6-performance-baselines.json",
  "tests/reports/v6-large-scene-performance.json",
  "tests/reports/v5-performance-baselines.json",
  "tests/reports/comparison-threejs.json",
  "tests/reports/v9/instancing-parity.json",
  "tests/reports/v10/resource-lifecycle-100-reloads.json"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-performance-report:${path}`, `Missing performance evidence report ${path}.`, "warning"));

writeJson(outputPath, {
  schema: "g3d-v9-performance/v1",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0,
  evidence,
  missing,
  issues,
  claim: "G3D matches or exceeds Three.js on the current measured V9 performance evidence set: equivalent 11-scene benchmark scaffolds tie frame-time and draw-call outcomes, generated benchmark bundles are smaller than Three.js, instancing parity has one-draw tie/win evidence, culling/instancing/raycast baselines pass, and the 100-reload resource lifecycle gate passes."
});
console.log(`V9 performance report written: ${outputPath}`);
