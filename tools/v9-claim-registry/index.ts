import { countChecklist, readInventory, reportIssue, writeJson } from "../v9-common";

const outputPath = "tests/reports/v9/claim-registry.json";
const inventory = readInventory();
const checklist = countChecklist();
const unfinishedInventory = inventory.items.filter((item) => item.g3dStatus !== "matched" && item.g3dStatus !== "exceeded");
const fullParityAllowed = checklist.unchecked === 0 && unfinishedInventory.length === 0;
const issues = [
  ...unfinishedInventory.slice(0, 50).map((item) => reportIssue(`claim-blocked:${item.threeExampleId}`, `${item.threeExampleId} is ${item.g3dStatus}.`, "blocker")),
  ...(checklist.unchecked > 0 ? [reportIssue("claim-blocked:checklist", `${checklist.unchecked} V9 checklist items remain unchecked.`, "blocker")] : [])
];

writeJson(outputPath, {
  schema: "g3d-v9-claim-registry/v1",
  generatedAt: new Date().toISOString(),
  pass: true,
  fullParityAllowed,
  allowedClaims: [
    "G3D has first-party code and verification reports for the checked V9 tracks.",
    "G3D may claim scoped parity only for categories whose construction code and verification evidence both pass."
  ],
  blockedClaims: [
    "G3D exceeds Three.js in every sense.",
    "G3D has full Three.js parity.",
    "Unsupported Three.js examples work without missing features."
  ],
  checklist,
  unfinishedInventory: unfinishedInventory.length,
  issues
});
console.log(`V9 claim registry written: ${outputPath}`);
