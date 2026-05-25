import { issue, readV9Inventory, reportPasses, writeReport } from "../v10-common";

const outputPath = "tests/reports/v10/animation-fidelity.json";
const inventory = readV9Inventory();
const animationCategories = new Set(["animation", "skinning", "morph-targets"]);
const animationItems = (inventory.items ?? []).filter((item) => animationCategories.has(item.category));
const requiredReports = [
  "tests/reports/threejs-parity/animation-keyframes-parity.json",
  "tests/reports/threejs-parity/animation-multiple-parity.json",
  "tests/reports/threejs-parity/animation-walk-parity.json",
  "tests/reports/threejs-parity/skinning-additive-parity.json",
  "tests/reports/threejs-parity/skinning-blending-parity.json",
  "tests/reports/threejs-parity/skinning-ik-parity.json",
  "tests/reports/threejs-parity/morphtargets-parity.json"
];
const issues = [
  ...requiredReports.flatMap((path) => reportPasses(path) ? [] : [issue(`animation-report:${path}`, `${path} is missing or not passing.`)]),
  ...animationItems
    .filter((item) => item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded")
    .map((item) => issue(`animation-item:${item.threeExampleId}`, `${item.threeExampleId} remains ${item.g3dStatus}.`))
];

writeReport(outputPath, {
  schema: "g3d-v10-animation-fidelity/v1",
  pass: issues.length === 0,
  decisions: [{
    category: "animation",
    decision: issues.length === 0 ? "parity" : "partial",
    evidence: requiredReports,
    blockers: issues.map((entry) => entry.message)
  }],
  issues,
  evidence: requiredReports
});

