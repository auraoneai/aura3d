import { readChecklistScope, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/claim-registry.json";
const inventory = readInventory();
const finalPrdScope = {
  path: "1.6-FINAL-PRD-Finishes.md",
  startHeading: "## 2. Definition of “direct, current, head-to-head competitor”",
  endHeading: "## 3. Binding execution rules"
} as const;
const checklistResult = readChecklistScope(finalPrdScope);
const checklist = { checked: checklistResult.checked, unchecked: checklistResult.unchecked, total: checklistResult.total };
const unfinishedInventory = inventory.items.filter((item) => item.a3dStatus !== "matched" && item.a3dStatus !== "exceeded");
const fullParityAllowed = checklist.unchecked === 0 && unfinishedInventory.length === 0;
const issues = [
  ...unfinishedInventory.slice(0, 50).map((item) => reportIssue(`claim-blocked:${item.threeExampleId}`, `${item.threeExampleId} is ${item.a3dStatus}.`, "blocker")),
  ...(checklist.unchecked > 0 ? [reportIssue("claim-blocked:checklist", `${checklist.unchecked} Three.js parity checklist items remain unchecked.`, "blocker")] : [])
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-claim-registry",
  generatedAt: new Date().toISOString(),
  pass: true,
  fullParityAllowed,
  currentTarget: "three@0.185.1 (r185)",
  scope: finalPrdScope,
  allowedClaims: [
    "A3D has first-party code and verification reports for the checked Three.js parity tracks.",
    "A3D may claim scoped parity only for categories whose construction code and verification evidence both pass."
  ],
  blockedClaims: [
    "A3D exceeds Three.js in every sense.",
    "A3D has full Three.js parity.",
    "Unsupported Three.js examples work without missing features."
  ],
  checklist,
  unfinishedInventory: unfinishedInventory.length,
  issues
});
console.log(`Three.js parity claim registry written: ${outputPath}`);
