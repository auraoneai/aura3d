import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { fileExists, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/same-scene-render.json";
const inventory = readInventory();

// This is the explicitly selected public comparison target in the 2.0 PRD.
// It is deliberately not presented as the breadth of the Three.js ecosystem.
const selectedWorkloads = [
  "primitive-scene",
  "gltf-product-viewer",
  "cinematic-architecture",
  "digital-twin-data",
  "instancing-lod",
  "skinned-morph-animation",
  "custom-material-shader",
  "postprocessed-scene",
  "physical-character",
  "physical-vehicle",
  "navigation-crowd",
  "webgpu-tsl",
  "xr-interaction",
  "resource-lifecycle",
  "scaffold-to-deploy"
] as const;

const selected = selectedWorkloads.map((workload) => {
  const directory = `tests/reports/current-head-to-head/${workload}`;
  const aggregatePath = `${directory}/aggregate.json`;
  const aggregate = fileExists(aggregatePath)
    ? JSON.parse(readFileSync(aggregatePath, "utf8")) as { readonly pass?: boolean; readonly verdict?: string }
    : undefined;
  const images = fileExists(directory)
    ? readdirSync(directory)
      .filter((name) => /\.png$/i.test(name))
      .map((name) => `${directory}/${name}`)
      .filter((path) => statSync(path).size > 8_000)
    : [];
  const aura = images.filter((path) => /^aura(?:-|\.)/i.test(basename(path)));
  const threejs = images.filter((path) => /^three(?:-|\.)/i.test(basename(path)));
  const pass = aggregate?.pass === true && aura.length > 0 && threejs.length > 0;
  return { workload, pass, aggregatePath, verdict: aggregate?.verdict ?? null, aura, threejs };
});

// The broad inventory remains a separate coverage ledger. Missing pairs here
// are warnings and prevent any universal ecosystem-parity claim, but they do
// not redefine the PRD's selected 15-workload release target after the fact.
const candidates = inventory.items.filter((item) => item.sameSceneAvailable);
const broadAudited = candidates.map((item) => {
  const aura = item.screenshots.filter((path) => /(?:^|\/)a3d-|aura3d-/i.test(path));
  const threejs = item.screenshots.filter((path) => /(?:^|\/)threejs-/i.test(path));
  const pairedBrowserTest = item.tests.some((path) => /tests\/browser\/threejs-parity-/.test(path));
  const existing = [...aura, ...threejs].filter((path) => fileExists(path) && statSync(path).size > 8_000);
  const pass = aura.length > 0 && threejs.length > 0 && pairedBrowserTest && existing.length === aura.length + threejs.length;
  return { id: item.threeExampleId, priority: item.priority, pass, aura, threejs, pairedBrowserTest, existingImageCount: existing.length };
});
const broadMissing = inventory.items.filter((item) => !item.sameSceneAvailable);
const selectedFailures = selected.filter((item) => !item.pass);
const issues = [
  ...selectedFailures.map((item) => reportIssue(
    `selected-target-unproven:${item.workload}`,
    `${item.workload} lacks a passing workload aggregate or a retained non-placeholder Aura/Three image pair.`,
    "blocker"
  )),
  ...broadMissing.map((item) => reportIssue(
    `broad-coverage-missing:${item.threeExampleId}`,
    `${item.threeExampleId} has no broad-inventory same-scene Aura route; ecosystem breadth remains incomplete.`,
    "warning"
  )),
  ...broadAudited.filter((item) => !item.pass).map((item) => reportIssue(
    `broad-coverage-unproven:${item.id}`,
    `${item.id} lacks an existing non-placeholder Aura/Three image pair and named paired browser test in the broad inventory.`,
    "warning"
  ))
];

writeJson(outputPath, {
  schema: "a3d-threejs-parity-same-scene-render/2.0",
  generatedAt: new Date().toISOString(),
  pass: selectedFailures.length === 0,
  claimBoundary: "Pass covers only the 15 selected Aura3D 2.0 current-head-to-head workloads. Broad Three.js ecosystem coverage is reported separately and may not be described as universal parity.",
  selectedTarget: {
    workloadCount: selected.length,
    provenWorkloadCount: selected.filter((item) => item.pass).length,
    pass: selectedFailures.length === 0,
    workloads: selected
  },
  broadCoverage: {
    complete: broadMissing.length === 0 && broadAudited.every((item) => item.pass),
    inventoryCount: inventory.items.length,
    sameSceneCandidateCount: candidates.length,
    missingSameSceneCount: broadMissing.length,
    provenSameSceneCount: broadAudited.filter((item) => item.pass).length,
    audited: broadAudited
  },
  issues
});
console.log(`Three.js parity same-scene render report written: ${outputPath}`);
