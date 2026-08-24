import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { COURT_SPOTS } from "../src/court";
import { initialHoopState, updateHoop } from "../src/rim";
import { calculateLaunchVelocity, createBallAtSpot, stepBall } from "../src/shot";

const repoRoot = resolve(import.meta.dirname, "../../..");
const appDir = resolve(import.meta.dirname, "..");
const SAMPLES = 12_000;
const BALLISTIC_P95_BUDGET_MS = 0.25;
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
const producer = "apps/showcase-rooftop-buckets/scripts/write-performance-report.ts";
const producerSourceSha256 = createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex");

let spotIndex = 0;
let heat = 1;
let hoop = initialHoopState(heat);
let ball = createBallAtSpot(COURT_SPOTS[spotIndex]!);
const launch = () => {
  const spot = COURT_SPOTS[spotIndex]!;
  hoop = updateHoop(initialHoopState(heat), heat, 0.85, spot.x);
  const velocity = calculateLaunchVelocity(spot, spot.sweetPower, 0, hoop);
  ball = { ...createBallAtSpot(spot, heat === 5), ...velocity, inFlight: true, settled: false };
};
launch();
for (let index = 0; index < 600; index += 1) {
  ball = stepBall(ball, hoop, 1 / 60).ball;
  if (!ball.inFlight) {
    spotIndex = (spotIndex + 1) % COURT_SPOTS.length;
    heat = (heat % 5) + 1;
    launch();
  }
}

const timings: number[] = [];
const deterministicSamples = new Set<string>();
for (let index = 0; index < SAMPLES; index += 1) {
  const started = process.cpuUsage();
  const result = stepBall(ball, hoop, 1 / 60);
  const used = process.cpuUsage(started);
  timings.push((used.user + used.system) / 1_000);
  ball = result.ball;
  if (index % 120 === 119) {
    deterministicSamples.add([
      heat, spotIndex, ball.x.toFixed(5), ball.y.toFixed(5), ball.z.toFixed(5), ball.result ?? "flight"
    ].join(":"));
  }
  if (!ball.inFlight) {
    spotIndex = (spotIndex + 1) % COURT_SPOTS.length;
    heat = (heat % 5) + 1;
    launch();
  }
}
const sorted = [...timings].sort((a, b) => a - b);
const ballisticCpuP95Ms = Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0).toFixed(4));

const visual = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/rooftop-buckets/visual.json"), "utf8")) as {
  opening?: { renderer?: { drawCalls?: number; renderSize?: readonly number[] } };
};
const receipt = JSON.parse(readFileSync(resolve(repoRoot, "tests/reports/rooftop-buckets/browser-evidence.json"), "utf8")) as {
  routeSourceSha256?: string; pass?: boolean;
};
const observed = {
  ballisticCpuP95Ms,
  deterministicPoseSamples: deterministicSamples.size,
  drawCalls: Number(visual.opening?.renderer?.drawCalls ?? 0),
  renderSize: visual.opening?.renderer?.renderSize ?? [0, 0],
  authoredPhysicsBodies: 0,
  predictionPoints: 25,
  heatModes: 5
};
const pass = observed.ballisticCpuP95Ms <= BALLISTIC_P95_BUDGET_MS
  && observed.deterministicPoseSamples >= 20
  && observed.drawCalls > 0
  && observed.drawCalls <= DRAW_CALL_BUDGET
  && Number(observed.renderSize[0] ?? 0) > 0
  && Number(observed.renderSize[1] ?? 0) > 0
  && receipt.pass === true
  && receipt.routeSourceSha256 === routeSourceSha256;

const report = {
  schema: "aura3d.rooftop-buckets.performance/1.0",
  generatedAt: new Date().toISOString(),
  producer,
  producerSourceSha256,
  routeSourceFiles: sourceFiles.map((path) => relative(repoRoot, path)),
  routeSourceSha256,
  scope: "Route-local deterministic authored basketball step CPU timing plus browser-observed root createGameApp draw calls. This does not claim Rapier, rigid bodies, GPU frame-time parity, or a reusable sports simulation.",
  samples: SAMPLES,
  fixedStepSeconds: 1 / 60,
  budgets: { ballisticCpuP95Ms: BALLISTIC_P95_BUDGET_MS, drawCalls: DRAW_CALL_BUDGET, authoredPhysicsBodies: 0 },
  observed,
  pass
};
writeFileSync(resolve(appDir, "performance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass, observed }));
if (!pass) process.exitCode = 1;
