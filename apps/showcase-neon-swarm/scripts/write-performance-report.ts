import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createArenaLayout, playRect } from "../src/arena";
import { createSwarmSimulation } from "../src/swarm";
import { arenaInsetForWave } from "../src/run";

const appDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(appDir, "../..");
const telemetryPath = resolve(repoRoot, "tests/reports/neon-swarm/instancing-telemetry.json");
const telemetry = JSON.parse(readFileSync(telemetryPath, "utf8")) as {
  instanceCount?: number;
  drawCalls?: number;
  nativeInstancedSubmissions?: number;
  nonBlackPixels?: number;
  consoleErrors?: string[];
};

const arena = createArenaLayout();
const rect = playRect(arena.bounds);
const sim = createSwarmSimulation();
const total = 320;
const columns = 20;
const rows = Math.ceil(total / columns);
for (let i = 0; i < total; i += 1) {
  const column = i % columns;
  const row = Math.floor(i / columns);
  const x = rect.minX + 2 + column * ((rect.maxX - rect.minX - 4) / (columns - 1));
  const z = rect.minZ + 2 + row * ((rect.maxZ - rect.minZ - 4) / (rows - 1));
  const spawned = sim.spawn({
    x,
    z,
    archetype: i % 8 === 0 ? "elite" : "grunt",
    speedMultiplier: 1.22
  });
  if (!spawned) throw new Error(`Failed to stage performance drone ${i}`);
}

const samples: number[] = [];
for (let frame = 0; frame < 360; frame += 1) {
  const player = {
    x: Math.sin(frame / 75) * 4,
    z: Math.cos(frame / 63) * 3
  };
  const start = performance.now();
  sim.step(1 / 60, player, arena.obstacles, undefined, arenaInsetForWave(5));
  const elapsed = performance.now() - start;
  if (frame >= 60) samples.push(elapsed);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? Number.POSITIVE_INFINITY;
}

const budgets = {
  simulationStepP95Ms: 8,
  drawCalls: 64,
  minimumLiveInstances: 300,
  minimumNonBlackPixels: 1500
};
const observed = {
  stagedInstances: sim.aliveCount(),
  simulationStepP95Ms: Number(percentile(samples, 0.95).toFixed(4)),
  simulationStepMaxMs: Number(Math.max(...samples).toFixed(4)),
  browserInstances: Number(telemetry.instanceCount ?? 0),
  browserDrawCalls: Number(telemetry.drawCalls ?? Number.POSITIVE_INFINITY),
  browserNativeInstancedSubmissions: Number(telemetry.nativeInstancedSubmissions ?? 0),
  browserNonBlackPixels: Number(telemetry.nonBlackPixels ?? 0)
};
const pass = observed.stagedInstances >= budgets.minimumLiveInstances
  && observed.simulationStepP95Ms <= budgets.simulationStepP95Ms
  && observed.browserInstances >= budgets.minimumLiveInstances
  && observed.browserDrawCalls <= budgets.drawCalls
  && observed.browserNativeInstancedSubmissions > 0
  && observed.browserNonBlackPixels >= budgets.minimumNonBlackPixels
  && (telemetry.consoleErrors?.length ?? 0) === 0;

const report = {
  schema: "aura3d-neon-swarm-performance/1.0",
  generatedAt: new Date().toISOString(),
  scope: "Route-local 320-drone typed-array steering timing plus current browser native-instancing/draw/pixel telemetry; GPU frame-time parity is not claimed.",
  budgets,
  observed,
  samples: samples.length,
  browserEvidence: "tests/reports/neon-swarm/instancing-telemetry.json",
  pass
};
writeFileSync(resolve(appDir, "performance-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
