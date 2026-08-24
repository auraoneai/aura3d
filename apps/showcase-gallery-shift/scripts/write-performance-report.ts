import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { FLOOR_LAYOUTS } from "../src/floor";
import { GuardAgent } from "../src/guard";
import { advanceDetection, insideCone } from "../src/vision";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 20_000;
const CPU_P95_BUDGET_MS = 0.2;
const DRAW_CALL_BUDGET = 190;

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
const guard = new GuardAgent(FLOOR_LAYOUTS[0]!.guards[0]!);
let detection = { value: 0, secondsSinceSeen: 0 };
const timings: number[] = [];
let deterministicStateHash = 2166136261 >>> 0;
for (let index = 0; index < SAMPLES; index += 1) {
  const started = process.cpuUsage();
  const targetX = Math.sin(index / 180) * 8;
  const targetZ = Math.cos(index / 220) * 5;
  const seen = insideCone(guard.x, guard.z, guard.yaw, targetX, targetZ, Math.PI / 4, 12);
  detection = advanceDetection(detection, seen ? 0.25 : 0, 1 / 60);
  guard.update({ dt: 1 / 60, detection: detection.value, suspiciousThreshold: 0.35, alertThreshold: 0.7, lastSeen: seen ? { x: targetX, z: targetZ } : null, laserAlertPoint: null });
  const used = process.cpuUsage(started);
  timings.push((used.user + used.system) / 1_000);
  const sample = `${guard.x.toFixed(3)}:${guard.z.toFixed(3)}:${guard.state}:${detection.value.toFixed(4)}`;
  for (let char = 0; char < sample.length; char += 1) deterministicStateHash = Math.imul(deterministicStateHash ^ sample.charCodeAt(char), 16777619) >>> 0;
}
const sorted = [...timings].sort((a, b) => a - b);
const routeLogicCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));
const visual = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/gallery-shift/visual.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/gallery-shift/browser-evidence.json"), "utf8"));
const diagnostics = visual.evidence?.renderer ?? visual.evidence?.diagnostics ?? {};
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
const producer = "apps/showcase-gallery-shift/scripts/write-performance-report.ts";
const report = {
  schema: "aura3d.gallery-shift.performance/1.0", generatedAt: new Date().toISOString(), producer,
  producerSourceSha256: createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex"),
  routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)), routeSourceSha256,
  scope: "Route-local authored patrol/detection CPU sampling plus browser-observed root createGameApp draw calls; no GPU frame-time, reusable stealth-kit, navigation-kit, or renderer-parity claim.",
  samples: SAMPLES, fixedStepSeconds: 1 / 60,
  budgets: { routeLogicCpuP95Ms: CPU_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET }, observed, pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
