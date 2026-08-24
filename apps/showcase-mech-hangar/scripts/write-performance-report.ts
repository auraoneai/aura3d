import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMechBout, STEP } from "../src/arena/mech-fight";
import type { BuildSelection } from "../src/parts-catalog";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 20_000;
const SIM_P95_BUDGET_MS = 0.3;
const DRAW_CALL_BUDGET = 300;
const builds: readonly BuildSelection[] = [
  { chassis: 0, arms: 0, legs: 0, weapon: 0 },
  { chassis: 1, arms: 1, legs: 1, weapon: 1 },
  { chassis: 2, arms: 2, legs: 2, weapon: 2 },
  { chassis: 3, arms: 3, legs: 3, weapon: 3 }
];

function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

const sourceFiles = [
  "src/arena/mech-fight.ts", "src/arena/rival.ts", "src/assembly.ts", "src/main.ts",
  "src/parts-catalog.ts", "src/parts-generated.ts", "src/stats.ts"
];
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const file of sourceFiles) hash.update(file).update("\0").update(readFileSync(resolve(appDir, file))).update("\0");
  return hash.digest("hex");
})();
const producer = "apps/showcase-mech-hangar/scripts/write-performance-report.ts";
const producerSourceSha256 = createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex");

let boutIndex = 0;
let bout = createMechBout({ playerSelection: builds[0]!, rivalSelection: builds[1]!, presetIndex: 0, seed: 0x2a3d });
const samples: number[] = [];
const outcomeHashes = new Set<string>();
for (let index = 0; index < SAMPLES; index += 1) {
  bout.pushInputs({
    moveX: index % 180 < 110 ? 1 : -1,
    jump: index % 601 === 0,
    light: index % 47 === 0,
    heavy: index % 89 === 0,
    special: index % 211 === 0,
    guard: index % 240 >= 190
  });
  const started = performance.now();
  const snapshot = bout.step(STEP);
  samples.push(performance.now() - started);
  if (snapshot.phase === "ko" || snapshot.phase === "lost" || snapshot.frame > 2_400) {
    outcomeHashes.add(bout.outcomeHash());
    boutIndex += 1;
    bout = createMechBout({
      playerSelection: builds[boutIndex % builds.length]!,
      rivalSelection: builds[(boutIndex + 1) % builds.length]!,
      presetIndex: boutIndex % 3,
      seed: 0x2a3d + boutIndex * 7919
    });
  }
}
outcomeHashes.add(bout.outcomeHash());

const matrix = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/mech-hangar/part-matrix.json"), "utf8"));
const curation = JSON.parse(readFileSync(resolve(appDir, "parts-curation-report.json"), "utf8"));
const observed = {
  simulationP95Ms: Number(p95(samples).toFixed(4)),
  matrixSelections: Number(matrix.matrixSize ?? 0),
  hangarDrawCalls: Number(matrix.diagnostics?.drawCalls ?? 0),
  renderedWidth: Number(matrix.diagnostics?.renderSize?.[0] ?? 0),
  renderedHeight: Number(matrix.diagnostics?.renderSize?.[1] ?? 0),
  compatibilityAccepted: Number(curation.gate?.compatibilityAccepted ?? 0),
  releaseAccepted: Number(curation.gate?.releaseAccepted ?? 0),
  deterministicOutcomeSamples: outcomeHashes.size
};
const pass = observed.simulationP95Ms <= SIM_P95_BUDGET_MS
  && observed.matrixSelections === 16
  && observed.hangarDrawCalls > 0
  && observed.hangarDrawCalls <= DRAW_CALL_BUDGET
  && observed.renderedWidth > 0
  && observed.renderedHeight > 0
  && observed.compatibilityAccepted === 16
  && observed.releaseAccepted === 16
  && observed.deterministicOutcomeSamples > 0;
const report = {
  schema: "aura3d-mech-hangar-performance/1.0",
  generatedAt: new Date().toISOString(),
  producer,
  producerSourceSha256,
  routeSourceFiles: sourceFiles.map((file) => `apps/showcase-mech-hangar/${file}`),
  routeSourceSha256,
  scope: "Headless fixed-step route-local combat timing plus browser-observed root createAuraApp hangar draw calls. GPU frame-time parity is not claimed.",
  samples: SAMPLES,
  fixedStepSeconds: STEP,
  budgets: { simulationP95Ms: SIM_P95_BUDGET_MS, hangarDrawCalls: DRAW_CALL_BUDGET },
  observed,
  pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
