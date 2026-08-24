import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createTableSimulation } from "../src/table";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 12_000;
// Reserve no more than one third of a 60 Hz frame for the route-local public
// Rapier step, leaving the majority of the frame for rendering, input, and UI.
const SIMULATION_P95_BUDGET_MS = 5.5;
const DRAW_CALL_BUDGET = 220;
const BODY_BUDGET = 40;

function files(directory: string): string[] {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}

const sourceFiles = files(join(appDir, "src"));
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const path of sourceFiles) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
})();
const producer = "apps/showcase-bank-shot/scripts/write-performance-report.ts";
const producerSourceSha256 = createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex");

const sim = createTableSimulation();
// Prime the Rapier wasm/JIT path before measuring steady-state gameplay. The
// retained samples below still include repeated full-rack collision bursts.
sim.strike(0.82, 0.08, 0.2);
for (let index = 0; index < 600; index += 1) {
  sim.stepFixed(1);
  sim.consumeSensorEvents();
  sim.consumeShotFactEvents();
  sim.consumeImpacts();
  sim.consumePotEvents();
}
sim.resetRack();
const timings: number[] = [];
const deterministicPoseSamples = new Set<string>();
for (let index = 0; index < SAMPLES; index += 1) {
  if (index % 900 === 0) {
    sim.resetRack();
    sim.strike(0.68 + (index % 4) * 0.08, ((index / 900) % 5 - 2) * 0.12, ((index / 900) % 3 - 1) * 0.35);
  }
  // CPU time isolates the route's actual simulation cost from unrelated host
  // scheduling pressure. Wall-clock samples can otherwise turn a preemption
  // by another process into a false physics regression.
  const started = process.cpuUsage();
  sim.stepFixed(1);
  const used = process.cpuUsage(started);
  timings.push((used.user + used.system) / 1_000);
  sim.consumeSensorEvents();
  sim.consumeShotFactEvents();
  sim.consumeImpacts();
  sim.consumePotEvents();
  if (index % 600 === 599) deterministicPoseSamples.add(sim.poseHash());
}
const sorted = [...timings].sort((a, b) => a - b);
const simulationCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));

const browser = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/bank-shot/visual.json"), "utf8")) as {
  evidence?: { renderer?: { drawCalls?: number; renderSize?: readonly number[] }; physicsBodyCount?: number };
};
const browserReceipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/bank-shot/browser-evidence.json"), "utf8")) as { routeSourceSha256?: string; pass?: boolean };
const observed = {
  simulationCpuP95Ms,
  deterministicPoseSamples: deterministicPoseSamples.size,
  drawCalls: Number(browser.evidence?.renderer?.drawCalls ?? 0),
  renderSize: browser.evidence?.renderer?.renderSize ?? [0, 0],
  physicsBodies: Number(browser.evidence?.physicsBodyCount ?? 0),
  liveBalls: sim.liveBallCount(),
  pocketSensors: sim.pocketIds.length
};
const pass = simulationCpuP95Ms <= SIMULATION_P95_BUDGET_MS
  && observed.deterministicPoseSamples >= 10
  && observed.drawCalls > 0
  && observed.drawCalls <= DRAW_CALL_BUDGET
  && Number(observed.renderSize[0] ?? 0) > 0
  && Number(observed.renderSize[1] ?? 0) > 0
  && observed.physicsBodies > 0
  && observed.physicsBodies <= BODY_BUDGET
  && observed.liveBalls >= 1
  && observed.pocketSensors === 6
  && browserReceipt.pass === true
  && browserReceipt.routeSourceSha256 === routeSourceSha256;

const report = {
  schema: "aura3d.bank-shot.performance/1.0",
  generatedAt: new Date().toISOString(),
  producer,
  producerSourceSha256,
  routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)),
  routeSourceSha256,
  scope: "Route-local fixed-step public Rapier billiards CPU timing plus browser-observed root createGameApp draw calls. Host scheduling wait and GPU frame-time parity are not claimed.",
  samples: SAMPLES,
  fixedStepSeconds: sim.fixedDelta,
  budgets: { simulationCpuP95Ms: SIMULATION_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET, physicsBodies: BODY_BUDGET },
  observed,
  pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
