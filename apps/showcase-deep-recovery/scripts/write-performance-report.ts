import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { initialCrateSpawns, updateTetherPhysics } from "../src/salvage";
import { initialSonarState, triggerPing, updateSonar, type SonarTarget } from "../src/sonar";
import { initialSubmarineState, updateSubmarine } from "../src/sub";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 20_000;
const CPU_P95_BUDGET_MS = 0.2;
const DRAW_CALL_BUDGET = 240;

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

let sub = initialSubmarineState();
let crates = initialCrateSpawns();
crates[0]!.tethered = true;
let sonar = initialSonarState();
const targets: SonarTarget[] = crates.map((crate) => ({ id: crate.id, kind: crate.kind, position: crate, value: crate.baseValue }));
const timings: number[] = [];
let deterministicStateHash = 2166136261 >>> 0;
for (let index = 0; index < SAMPLES; index += 1) {
  const started = process.cpuUsage();
  const tether = updateTetherPhysics(sub, crates, 1 / 60);
  sub = updateSubmarine(sub, { throttle: Math.sin(index / 90), heave: Math.cos(index / 130) * 0.35, turn: Math.sin(index / 170) * 0.45, pitch: 0, sprint: index % 300 < 40 }, tether.towDragForce, 1 / 60);
  if (index % 180 === 0) sonar = triggerPing(sonar, sub, targets, index / 60).nextState;
  sonar = updateSonar(sonar, 1 / 60);
  const used = process.cpuUsage(started);
  timings.push((used.user + used.system) / 1_000);
  const sample = `${sub.x.toFixed(3)}:${sub.y.toFixed(3)}:${sub.z.toFixed(3)}:${crates[0]!.x.toFixed(3)}:${sonar.pingCount}`;
  for (let char = 0; char < sample.length; char += 1) deterministicStateHash = Math.imul(deterministicStateHash ^ sample.charCodeAt(char), 16777619) >>> 0;
}
const sorted = [...timings].sort((a, b) => a - b);
const routeLogicCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));
const mission = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/deep-recovery/playable/mission-touch.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/deep-recovery/playable/browser-evidence.json"), "utf8"));
const diagnostics = mission.boot?.renderer ?? {};
const observed = {
  routeLogicCpuP95Ms,
  deterministicStateHash: deterministicStateHash.toString(16).padStart(8, "0"),
  drawCalls: Number(diagnostics.drawCalls ?? 0),
  renderSize: diagnostics.renderSize ?? [0, 0]
};
const pass = observed.routeLogicCpuP95Ms <= CPU_P95_BUDGET_MS
  && observed.deterministicStateHash !== "00000000"
  && observed.drawCalls > 0 && observed.drawCalls <= DRAW_CALL_BUDGET
  && Number(observed.renderSize[0] ?? 0) > 0 && Number(observed.renderSize[1] ?? 0) > 0
  && receipt.pass === true && receipt.routeSourceSha256 === routeSourceSha256;
const producer = "apps/showcase-deep-recovery/scripts/write-performance-report.ts";
const report = {
  schema: "aura3d.deep-recovery.performance/1.0", generatedAt: new Date().toISOString(), producer,
  producerSourceSha256: createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex"),
  routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)), routeSourceSha256,
  scope: "Route-local authored submarine/tether/sonar CPU sampling plus browser-observed root createAuraApp draw calls; no GPU frame-time, fluid-simulation, reusable submarine-kit, physics-engine, or renderer-parity claim.",
  samples: SAMPLES, fixedStepSeconds: 1 / 60,
  budgets: { routeLogicCpuP95Ms: CPU_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET }, observed, pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
