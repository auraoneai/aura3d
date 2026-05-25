import { issue, fileExists, reportPasses, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/physics-fidelity.json";
const requiredFiles = [
  "packages/physics/src/PhysicsWorld.ts",
  "packages/physics/src/RigidBody.ts",
  "packages/physics/src/Collider.ts",
  "packages/physics/src/Constraints.ts",
  "packages/physics/src/CharacterController.ts",
  "packages/physics/src/Raycast.ts",
  "apps/physics-showcase/src/main.ts",
  "tests/performance/physics-comparison-baseline.ts"
];
const requiredReports = [
  "tests/reports/physics-showcase.json",
  "tests/reports/v10/physics-comparison-baseline.json"
];
const issues = [
  ...requiredFiles.flatMap((path) => fileExists(path) ? [] : [issue(`missing-physics-file:${path}`, `Missing physics implementation artifact: ${path}.`)]),
  ...requiredReports.flatMap((path) => reportPasses(path) ? [] : [issue(`missing-physics-report:${path}`, `${path} is missing or not passing.`)])
];

writeReport(outputPath, {
  schema: "g3d-v10-physics-fidelity/v1",
  pass: issues.length === 0,
  decisions: [{
    category: "physics-and-interaction",
    decision: issues.length === 0 ? "parity" : "partial",
    evidence: [...requiredFiles, ...requiredReports],
    blockers: issues.map((entry) => entry.message)
  }],
  issues,
  evidence: [...requiredFiles, ...requiredReports]
});

