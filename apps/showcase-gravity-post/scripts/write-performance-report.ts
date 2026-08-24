import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTRACTS, WELL_BODIES, stationById, stationPosition } from "../src/contracts";
import {
  DOCK_SENSOR_RADIUS,
  createPodRuntime,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast
} from "../src/pod";
import { PREDICTION_MAX_STEPS } from "../src/prediction";
import { FIXED_DT, integratePath } from "../src/wells";

const FIXED_STEP_P95_MS_BUDGET = 1;
const PREDICTION_P95_MS_BUDGET = 3;
const MAX_ROUTE_SECONDS = 48;
const DRAW_CALL_BUDGET = 600;
const fixtures = [
  { dx: -4, dz: -79, requiredAssists: [] as string[] },
  { dx: -4, dz: 60, requiredAssists: ["verdance"] },
  { dx: -4, dz: -40, requiredAssists: ["sol", "gale"] },
  { dx: 38, dz: -24, requiredAssists: [] as string[] }
] as const;

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

const routes = CONTRACTS.map((contract, index) => {
  const fixture = fixtures[index]!;
  const length = Math.hypot(fixture.dx, fixture.dz);
  const power = Math.min(1, length / 190);
  const speed = 0.18 + power * (2.85 - 0.18);
  const direction = [fixture.dx / length, fixture.dz / length] as const;
  const pod = createPodRuntime(contract.originStationId, contract.tuning.strengthScale);
  resetPodForContract(pod, contract);
  launch(pod, direction, speed);
  const destination = stationPosition(stationById(contract.destinationStationId));
  const stepMs: number[] = [];
  let capture = false;
  let elapsed = 0;
  while (elapsed < MAX_ROUTE_SECONDS && pod.state === "coasting") {
    const started = performance.now();
    updateCoast({ pod, contract, bodies: WELL_BODIES, dt: FIXED_DT, warpActive: false });
    stepMs.push(performance.now() - started);
    elapsed += FIXED_DT;
    if (Math.hypot(destination[0] - pod.kinematic.position[0], destination[1] - pod.kinematic.position[1]) > DOCK_SENSOR_RADIUS) continue;
    capture = evaluateCapture(pod, contract, contract.destinationStationId).docked;
  }
  const predictionMs: number[] = [];
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const started = performance.now();
    integratePath({
      bodies: WELL_BODIES,
      tuning: contract.tuning,
      start: stationPosition(stationById(contract.originStationId)),
      velocity: [direction[0] * speed, direction[1] * speed],
      steps: PREDICTION_MAX_STEPS
    });
    predictionMs.push(performance.now() - started);
  }
  const assists = [...pod.assists];
  return {
    contractId: contract.id,
    capture,
    elapsedSeconds: Number(elapsed.toFixed(3)),
    arrivalSpeed: Number(Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]).toFixed(4)),
    assists,
    requiredAssists: fixture.requiredAssists,
    assistPass: fixture.requiredAssists.every((id) => assists.includes(id)),
    fixedStepMs: {
      samples: stepMs.length,
      p95: Number(percentile95(stepMs).toFixed(4)),
      max: Number(Math.max(...stepMs).toFixed(4))
    },
    predictionMs: {
      samples: predictionMs.length,
      p95: Number(percentile95(predictionMs).toFixed(4)),
      max: Number(Math.max(...predictionMs).toFixed(4))
    }
  };
});

const observed = {
  maxFixedStepP95Ms: Math.max(...routes.map((route) => route.fixedStepMs.p95)),
  maxPredictionP95Ms: Math.max(...routes.map((route) => route.predictionMs.p95)),
  campaignCompleteDrawCalls: Number(JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../../..", "tests/reports/gravity-post/full-campaign-evidence.json"),
    "utf8"
  )).final?.drawCalls ?? 0)
};
const report = {
  schema: "aura3d-gravity-post-performance/1.0",
  generatedAt: new Date().toISOString(),
  scope: "Headless route-local fixed-step and bounded-prediction timing over exact integer-drag fixtures. GPU/frame-time parity is not claimed.",
  budgets: {
    fixedStepP95Ms: FIXED_STEP_P95_MS_BUDGET,
    boundedPredictionP95Ms: PREDICTION_P95_MS_BUDGET,
    maximumRouteSeconds: MAX_ROUTE_SECONDS,
    campaignCompleteDrawCalls: DRAW_CALL_BUDGET
  },
  observed,
  routes,
  pass: routes.every((route) => route.capture && route.assistPass && route.elapsedSeconds <= MAX_ROUTE_SECONDS)
    && observed.maxFixedStepP95Ms <= FIXED_STEP_P95_MS_BUDGET
    && observed.maxPredictionP95Ms <= PREDICTION_P95_MS_BUDGET
    && observed.campaignCompleteDrawCalls > 0
    && observed.campaignCompleteDrawCalls <= DRAW_CALL_BUDGET
};
const output = resolve(import.meta.dirname, "..", "performance-report.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Wrote ${output}`);
console.log(JSON.stringify({ pass: report.pass, observed, routes: routes.map(({ contractId, capture, assists }) => ({ contractId, capture, assists })) }));
if (!report.pass) process.exitCode = 1;
