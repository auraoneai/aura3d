import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { CrowdSimulation, NavigationGrid } from "../../packages/physics/src/index.js";
import { createRecastNavigation } from "../../packages/navigation-recast/src/index.js";

const outputPath = resolve("tests/reports/navigation-backend-bakeoff/report.json");
const externalAudit = JSON.parse(readFileSync("tests/reports/external-candidate-package-audit.json", "utf8"));
const browser = JSON.parse(readFileSync("tests/reports/optional-recast-navigation/report.json", "utf8"));
const plane = { positions: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10], indices: [0, 2, 1, 0, 3, 2] } as const;

function elapsed(run: () => void, iterations = 1): number {
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) run();
  return (performance.now() - start) / iterations;
}
function round(value: number): number { return Number(value.toFixed(4)); }
function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

const grid = new NavigationGrid({ width: 128, height: 128, allowDiagonal: true, blocked: Array.from({ length: 96 }, (_, y) => [64, y + 16] as const) });
const auraQueryMs = elapsed(() => { grid.findPath([2, 2], [125, 125]); }, 100);
const auraCrowd = new CrowdSimulation();
for (let index = 0; index < 32; index += 1) auraCrowd.addAgent({ id: String(index), position: [(index % 8) * 0.2, Math.floor(index / 8) * 0.2] });
auraCrowd.setFormation({ type: "wedge", center: [8, 8] });
const auraCrowdStepMs32Agents = elapsed(() => { auraCrowd.update(1 / 60); }, 120);

const initStart = performance.now();
const navigation = await createRecastNavigation();
const initMs = performance.now() - initStart;
const generateStart = performance.now();
const mesh = navigation.generateSolo(plane, {});
const runtimeGenerationMs = performance.now() - generateStart;
const recastQueryMs = elapsed(() => { mesh.computePath([-8, 0, -8], [8, 0, 8]); }, 1_000);
const serialized = mesh.serialize();
const importMs = elapsed(() => { const imported = navigation.import(serialized); imported.dispose(); }, 100);
const repeat = navigation.generateSolo(plane, {});
const deterministicSerializedBytes = sha(serialized) === sha(repeat.serialize());
repeat.dispose();
const crowd = mesh.createCrowd(64, 0.5);
for (let index = 0; index < 32; index += 1) {
  const agent = crowd.addAgent([-8 + (index % 8) * 0.25, 0, -8 + Math.floor(index / 8) * 0.25], { radius: 0.1, height: 1, maxSpeed: 2, maxAcceleration: 8 });
  crowd.requestMoveTarget(agent, [8, 0, 8]);
}
const recastCrowdStepMs32Agents = elapsed(() => { crowd.update(1 / 60); }, 120);
crowd.dispose();
mesh.dispose();
const tileCache = navigation.generateTileCache(plane, { maxObstacles: 8 });
const obstacle = tileCache.addCylinderObstacle([0, 0, 0], 0.5, 1.5);
const addObstacleUpdates = tileCache.update();
tileCache.removeObstacle(obstacle);
const removeObstacleUpdates = tileCache.update();
const tileCacheSerializedBytes = tileCache.serialize().byteLength;
tileCache.dispose();

const recastAudit = externalAudit.packages.find((entry: { name: string }) => entry.name === "recast-navigation");
const yukaAudit = externalAudit.packages.find((entry: { name: string }) => entry.name === "yuka");
const memory = process.memoryUsage();
const report = {
  schema: "aura3d.navigation-backend-bakeoff/1.0",
  generatedAt: new Date().toISOString(),
  pass: browser.pass && deterministicSerializedBytes && serialized.byteLength > 0 && addObstacleUpdates > 0 && removeObstacleUpdates > 0,
  decision: "Select exact recast-navigation@0.43.1 behind optional @aura3d/navigation-recast; retain Aura grid/crowd/steering only as compatibility until the major migration gate; reject Yuka as a second overlapping owner.",
  claimBoundary: "Small synthetic workload and Chromium evidence; results do not claim universal scale or quality.",
  candidates: {
    auraLegacy: {
      status: "compatibility-only",
      queryMs128Grid: round(auraQueryMs),
      crowdStepMs32Agents: round(auraCrowdStepMs32Agents),
      runtimeNavmeshGeneration: false,
      offlineNavmeshGeneration: false,
      serializedNavmesh: false,
      temporaryObstacles: false,
      workerContract: false,
      note: "Grid A*, O(n²) neighbor crowd, and steering utilities are not a 3D navmesh/Detour stack."
    },
    recast: {
      version: "0.43.1",
      status: "selected-optional",
      initMs: round(initMs),
      runtimeGenerationMs: round(runtimeGenerationMs),
      queryMs: round(recastQueryMs),
      importMs: round(importMs),
      serializedBytes: serialized.byteLength,
      deterministicSerializedBytes,
      crowdStepMs32Agents: round(recastCrowdStepMs32Agents),
      addObstacleUpdates,
      removeObstacleUpdates,
      tileCacheSerializedBytes,
      browser,
      packageAudit: recastAudit
    },
    yuka: {
      version: "0.7.8",
      status: "rejected-overlap",
      packageAudit: yukaAudit,
      strengths: ["JavaScript steering, graphs, navmesh-region queries, and game-AI utilities"],
      gapsForThisWorkload: ["no Recast geometry-to-navmesh generator", "no Detour tile-cache temporary-obstacle owner", "would duplicate retained steering and crowd semantics"],
      maintenanceDecision: "Dormant-risk package age and incomplete workload replacement do not justify a second navigation owner."
    }
  },
  workloadCoverage: {
    runtimeGeneration: true,
    offlineGenerationContract: true,
    pathQueries: true,
    crowdSimulation: true,
    temporaryObstacles: true,
    workerGenerationAndTransfer: browser.cold?.transferredBytes > 0,
    serializedNavmeshes: true,
    dynamicObstacleUpdates: true,
    memorySample: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, browserUsedJSHeapSize: browser.cold?.usedJSHeapSize ?? null },
    determinism: deterministicSerializedBytes,
    browserBundles: true,
    disposal: browser.cold?.repeatedDisposals === 10
  }
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, decision: report.decision, workloadCoverage: report.workloadCoverage }, null, 2));
if (!report.pass) process.exitCode = 1;
