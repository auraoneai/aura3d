import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDispatchState, stepDispatch } from "../src/dispatch";
import { createTrafficSimulation, TRAFFIC_CAR_COUNT } from "../src/traffic";

const STEP_SAMPLES = 12_000;
const STEP_SECONDS = 1 / 120;
const DISPATCH_P95_BUDGET_MS = 0.25;
const TRAFFIC_P95_BUDGET_MS = 1;
const DRAW_CALL_BUDGET = 600;

function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

const traffic = createTrafficSimulation({ seed: 0xc0a13e });
let dispatch = createDispatchState();
const dispatchSamples: number[] = [];
const trafficSamples: number[] = [];
for (let index = 0; index < STEP_SAMPLES; index += 1) {
  let started = performance.now();
  const result = stepDispatch(dispatch, STEP_SECONDS * 1000, { vanX: 31, vanZ: 25 });
  dispatch = result.state.phase === "shiftOver" ? createDispatchState() : result.state;
  dispatchSamples.push(performance.now() - started);
  started = performance.now();
  traffic.step(STEP_SECONDS, 31, 25);
  trafficSamples.push(performance.now() - started);
}

const browser = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../..", "tests/reports/showcase-courier-rush/full-shift-evidence.json"), "utf8"));
const observed = {
  dispatchP95Ms: Number(p95(dispatchSamples).toFixed(4)),
  trafficP95Ms: Number(p95(trafficSamples).toFixed(4)),
  trafficCars: traffic.cars().length,
  fullShiftDrawCalls: Number(browser.final?.diagnostics?.drawCalls ?? 0)
};
const report = {
  schema: "aura3d-courier-rush-performance/1.0",
  generatedAt: new Date().toISOString(),
  scope: "Headless timing of route-local dispatch and seeded eight-car authored lane-loop simulation. GPU/frame-time parity is not claimed.",
  samples: STEP_SAMPLES,
  fixedStepSeconds: STEP_SECONDS,
  budgets: { dispatchP95Ms: DISPATCH_P95_BUDGET_MS, trafficP95Ms: TRAFFIC_P95_BUDGET_MS, trafficCars: TRAFFIC_CAR_COUNT, fullShiftDrawCalls: DRAW_CALL_BUDGET },
  observed,
  pass: observed.dispatchP95Ms <= DISPATCH_P95_BUDGET_MS
    && observed.trafficP95Ms <= TRAFFIC_P95_BUDGET_MS
    && observed.trafficCars === TRAFFIC_CAR_COUNT
    && observed.fullShiftDrawCalls > 0
    && observed.fullShiftDrawCalls <= DRAW_CALL_BUDGET
};
writeFileSync(resolve(import.meta.dirname, "..", "performance-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ pass: report.pass, observed }));
if (!report.pass) process.exitCode = 1;
