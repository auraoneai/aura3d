import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createTableSimulation } from "../src/table";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 12_000;
const STEP_P95_BUDGET_MS = 1;
const DRAW_CALL_BUDGET = 150;

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
const producer = "apps/showcase-vault-breakers/scripts/write-performance-report.ts";
const sim = createTableSimulation();
sim.serveBall(0.82);
const timings: number[] = [];
const poseHashes = new Set<string>();
for (let index = 0; index < SAMPLES; index += 1) {
  const started = process.cpuUsage();
  sim.stepFixed(1);
  const used = process.cpuUsage(started);
  timings.push((used.user + used.system) / 1_000);
  if (index % 120 === 119) poseHashes.add(sim.poseHash());
  if (!sim.ballInPlay()) sim.serveBall((index % 100) / 100);
}
const sorted = [...timings].sort((a, b) => a - b);
const fixedStepCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));
const visual = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/vault-breakers/visual.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/vault-breakers/browser-evidence.json"), "utf8"));
const observed = {
  fixedStepCpuP95Ms,
  deterministicPoseSamples: poseHashes.size,
  drawCalls: Number(visual.evidence?.renderer?.drawCalls ?? 0),
  renderSize: visual.evidence?.renderer?.renderSize ?? [0, 0],
  physicsBodies: sim.bodyCount,
  motorisedJoints: sim.jointCount
};
const pass = observed.fixedStepCpuP95Ms <= STEP_P95_BUDGET_MS
  && observed.deterministicPoseSamples >= 5
  && observed.drawCalls > 0 && observed.drawCalls <= DRAW_CALL_BUDGET
  && Number(observed.renderSize[0] ?? 0) > 0 && Number(observed.renderSize[1] ?? 0) > 0
  && receipt.pass === true && receipt.routeSourceSha256 === routeSourceSha256;
const report = {
  schema: "aura3d.vault-breakers.performance/1.0",
  generatedAt: new Date().toISOString(), producer,
  producerSourceSha256: createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex"),
  routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)), routeSourceSha256,
  scope: "Route-local Rapier fixed-step CPU timing plus browser-observed root createGameApp draw calls; no GPU frame-time, reusable pinball-kit, or renderer-parity claim.",
  samples: SAMPLES, fixedStepSeconds: 1 / 60,
  budgets: { fixedStepCpuP95Ms: STEP_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET }, observed, pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
