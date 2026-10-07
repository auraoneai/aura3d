import { fileExists, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/performance.json";
const evidence = [
  "tests/reports/production-runtime-performance-baselines.json",
  "tests/reports/production-runtime-large-scene-performance.json",
  "tests/reports/three-compat-performance-baselines.json",
  "tests/reports/comparison-threejs.json",
  "tests/reports/threejs-parity/instancing-parity.json",
  "tests/reports/superiority/resource-lifecycle-100-reloads.json"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-performance-report:${path}`, `Missing performance evidence report ${path}.`, "warning"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-performance",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0,
  claimStatus: missing.length === 0 ? "bounded-evidence-ready" : "blocked-missing-comparable-inputs",
  evidence,
  missing,
  issues,
  claim: missing.length === 0
    ? "The retained reports form a complete bounded comparison set. Read the individual scene, environment, variance, lifecycle, and bundle measurements; this report does not support a blanket superiority claim."
    : `No Aura3D-versus-Three.js performance claim is available: ${missing.length} of ${evidence.length} canonical comparable inputs are missing.`
});
console.log(`Three.js parity performance report written: ${outputPath}`);
