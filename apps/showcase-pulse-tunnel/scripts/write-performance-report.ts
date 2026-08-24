import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGateSystem } from "../src/gates";
import { buildPulseChart } from "../src/patterns";
import { createPulsePlayer } from "../src/player";
import { createPulseStyleSystem } from "../src/style";

const SAMPLES = 12_000;
const DT = 1 / 120;
const SIMULATION_P95_BUDGET_MS = 1;
const DRAW_CALL_BUDGET = 600;
const producer = "apps/showcase-pulse-tunnel/scripts/write-performance-report.ts";
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const producerPath = join(repoRoot, producer);
const sourceFiles = readdirSync(join(appDir, "src"))
  .filter((file) => /\.(?:ts|css)$/.test(file))
  .sort();
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const file of sourceFiles) {
    hash.update(file).update("\0").update(readFileSync(join(appDir, "src", file))).update("\0");
  }
  return hash.digest("hex");
})();
const producerSourceSha256 = createHash("sha256").update(readFileSync(producerPath)).digest("hex");
const chart = buildPulseChart();
const player = createPulsePlayer();
const style = createPulseStyleSystem();
let schedulerTime = 0;
const gates = createGateSystem({
  chart,
  getSchedulerTime: () => schedulerTime,
  getAudioElapsed: () => schedulerTime,
  getPlayer: () => player.snapshot()
});

const samples: number[] = [];
for (let index = 0; index < SAMPLES; index += 1) {
  const started = performance.now();
  schedulerTime += DT;
  player.step(DT, schedulerTime * 1000, { left: false, right: false, jump: false, slide: false });
  gates.update(DT);
  style.step(DT);
  if (schedulerTime >= 90) {
    schedulerTime = 0;
    player.reset();
    gates.reset();
    style.reset();
  }
  samples.push(performance.now() - started);
}
const sorted = [...samples].sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
const completion = JSON.parse(readFileSync(join(repoRoot, "tests/reports/pulse-tunnel/completion-evidence.json"), "utf8"));
const observed = {
  simulationP95Ms: Number(p95.toFixed(4)),
  chartEntries: chart.length,
  fullRunDrawCalls: Number(completion.summary?.diagnostics?.drawCalls ?? 0)
};
const report = {
  schema: "aura3d-pulse-tunnel-performance/1.0",
  generatedAt: new Date().toISOString(),
  producer,
  producerSourceSha256,
  routeSourceSha256,
  scope: "Headless fixed-step timing of chart-owned gate, player, and style simulation. GPU/frame-time or audio-device timing parity is not claimed.",
  samples: SAMPLES,
  fixedStepSeconds: DT,
  budgets: { simulationP95Ms: SIMULATION_P95_BUDGET_MS, fullRunDrawCalls: DRAW_CALL_BUDGET },
  observed,
  pass: observed.simulationP95Ms <= SIMULATION_P95_BUDGET_MS
    && observed.chartEntries > 0
    && observed.fullRunDrawCalls > 0
    && observed.fullRunDrawCalls <= DRAW_CALL_BUDGET
};
writeFileSync(join(appDir, "performance-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, observed }));
if (!report.pass) process.exitCode = 1;
