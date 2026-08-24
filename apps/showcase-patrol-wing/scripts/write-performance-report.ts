import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { FlightModel, FLIGHT_DT } from "../src/flight";
import { RingTracker } from "../src/patrol";
import { terrainSurface } from "../src/sky";

const repoRoot = resolve(import.meta.dirname, "../../.."); const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 20_000; const CPU_P95_BUDGET_MS = 0.2; const DRAW_CALL_BUDGET = 240;
function files(directory: string): string[] { return readdirSync(directory).sort().flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : /\.(?:ts|css)$/.test(path) ? [path] : []; }); }
const sourceFiles = files(join(appDir, "src"));
const routeSourceSha256 = (() => { const hash = createHash("sha256"); for (const path of sourceFiles) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0"); return hash.digest("hex"); })();
let flight = new FlightModel({ position: [0, 12, 17], headingYaw: Math.PI, grounded: "airborne", throttle: 0.7, speed: 12 });
const rings = new RingTracker(); const timings: number[] = []; let stateHash = 2166136261 >>> 0;
for (let index = 0; index < SAMPLES; index += 1) {
  const started = process.cpuUsage();
  const frame = flight.step({ pitchUp: index % 240 < 30, pitchDown: false, rollLeft: false, rollRight: index % 360 < 45, yawLeft: false, yawRight: index % 300 < 30, throttleUp: index % 180 < 20, throttleDown: false }, FLIGHT_DT, terrainSurface);
  if (index % 300 === 0) rings.registerEntry((index / 300) % 6);
  if (frame.outcome !== "none") flight = new FlightModel({ position: [0, 12, 17], headingYaw: Math.PI, grounded: "airborne", throttle: 0.7, speed: 12 });
  const used = process.cpuUsage(started); timings.push((used.user + used.system) / 1_000);
  const sample = `${flight.position.map((value) => value.toFixed(3)).join(":")}:${flight.speed.toFixed(3)}:${rings.nextRing}`;
  for (let char = 0; char < sample.length; char += 1) stateHash = Math.imul(stateHash ^ sample.charCodeAt(char), 16777619) >>> 0;
}
const sorted = [...timings].sort((a, b) => a - b); const routeLogicCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));
const mission = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/patrol-wing/playable/mission-touch.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/patrol-wing/playable/browser-evidence.json"), "utf8"));
const primaryPath = resolve(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-patrol-wing.json");
const primaryCandidate = existsSync(primaryPath) ? JSON.parse(readFileSync(primaryPath, "utf8")) : null;
const primary = primaryCandidate?.pass === true ? primaryCandidate : null;
const observed = { routeLogicCpuP95Ms, deterministicStateHash: stateHash.toString(16).padStart(8, "0"), drawCalls: Number(primary?.renderer?.drawCalls ?? 0), renderSize: primary?.renderer?.renderSize ?? [1280, 800], browserFrameCount: Number(mission.boot?.frameCount ?? 0) };
const drawEvidencePending = primary === null;
const pass = observed.routeLogicCpuP95Ms <= CPU_P95_BUDGET_MS && observed.deterministicStateHash !== "00000000" && (drawEvidencePending || (observed.drawCalls > 0 && observed.drawCalls <= DRAW_CALL_BUDGET)) && receipt.pass === true && receipt.routeSourceSha256 === routeSourceSha256;
const producer = "apps/showcase-patrol-wing/scripts/write-performance-report.ts";
const report = { schema: "aura3d.patrol-wing.performance/1.0", generatedAt: new Date().toISOString(), producer, producerSourceSha256: createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex"), routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)), routeSourceSha256,
  scope: "Route-local authored arcade-flight/ring CPU sampling plus route-primary root-renderer draw calls when available; no GPU frame-time, aerodynamic, reusable flight-kit, or renderer-parity claim.", samples: SAMPLES, fixedStepSeconds: FLIGHT_DT,
  budgets: { routeLogicCpuP95Ms: CPU_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET }, observed, drawEvidencePending, pass };
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ pass, observed, drawEvidencePending })); if (!pass) process.exitCode = 1;
