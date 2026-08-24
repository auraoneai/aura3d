import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { createLanderState, hspeedOf, stepLander } from "../src/lander";
import { predictLanding } from "../src/prediction";
import { SITES } from "../src/sites";
import { createTerrainField, sampleGridHeight } from "../src/terrain";
import { gradeTouchdown } from "../src/touchdown";

const FIXED_STEP_P95_MS_BUDGET = 1;
const PREDICTION_P95_MS_BUDGET = 3;
const TERRAIN_BUILD_P95_MS_BUDGET = 50;
const DRAW_CALL_BUDGET = 60;
const FOOT_DROP = 0.72;
const repoRoot = resolve(import.meta.dirname, "../../..");

const percentile95 = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
};

const terrainBuildMs: number[] = [];
for (let iteration = 0; iteration < 30; iteration += 1) {
  const started = performance.now();
  createTerrainField({ site: SITES[iteration % SITES.length]! });
  terrainBuildMs.push(performance.now() - started);
}

const sites = SITES.map((site) => {
  const field = createTerrainField({ site });
  const pad = site.pads[0]!;
  const padHeight = field.padHeights[0] ?? 0;
  let state = createLanderState({ x: pad.x, y: padHeight + 30, z: pad.z }, site.fuelBudget);
  const fixedStepMs: number[] = [];
  const predictionMs: number[] = [];
  let frames = 0;

  while (frames < 60 * 120) {
    const agl = state.y - FOOT_DROP - sampleGridHeight(field, state.x, state.z);
    let thrust = 0;
    if (agl < 18) {
      const desiredVy = -Math.max(1.1, Math.min(4, agl * 0.28));
      thrust = Math.min(1, Math.max(0, 0.52 + (desiredVy - state.vy) * 0.32));
    }
    const controls = { thrust, rotate: 0 };
    const stepStarted = performance.now();
    state = stepLander(state, controls, 1 / 60, site.gust);
    fixedStepMs.push(performance.now() - stepStarted);
    if (frames % 6 === 0) {
      const predictionStarted = performance.now();
      predictLanding(
        state,
        controls,
        (x, z) => sampleGridHeight(field, x, z),
        FOOT_DROP,
        site.gust
      );
      predictionMs.push(performance.now() - predictionStarted);
    }
    frames += 1;

    const localGround = sampleGridHeight(field, state.x, state.z);
    if (state.y - FOOT_DROP - localGround > 0.05) continue;
    const grade = gradeTouchdown({
      vspeed: Math.abs(state.vy),
      hspeed: hspeedOf(state),
      attitudeDeg: Math.abs(state.tiltDeg),
      insidePadZone: Math.hypot(state.x - pad.x, state.z - pad.z) <= pad.radius,
      slopeDeg: 0
    }).grade;
    return {
      siteId: site.id,
      grade,
      completed: grade === "soft" || grade === "hard",
      frames,
      fuelFraction: Number((state.fuel / site.fuelBudget).toFixed(4)),
      fixedStepMs: {
        samples: fixedStepMs.length,
        p95: Number(percentile95(fixedStepMs).toFixed(4)),
        max: Number(Math.max(...fixedStepMs).toFixed(4))
      },
      boundedPredictionMs: {
        samples: predictionMs.length,
        p95: Number(percentile95(predictionMs).toFixed(4)),
        max: Number(Math.max(...predictionMs).toFixed(4))
      }
    };
  }
  throw new Error(`Aurora Lander site ${site.id} did not resolve inside 120 seconds.`);
});

const campaignArtifactPath = resolve(repoRoot, "tests/reports/aurora-lander-campaign/03-strongest-whiteout.json");
const campaignArtifact = JSON.parse(readFileSync(campaignArtifactPath, "utf8"));
const maxObservedDrawCalls = Number(campaignArtifact?.evidence?.renderer?.drawCalls ?? 0);
const observed = {
  maxFixedStepP95Ms: Math.max(...sites.map((site) => site.fixedStepMs.p95)),
  maxPredictionP95Ms: Math.max(...sites.map((site) => site.boundedPredictionMs.p95)),
  terrainBuildP95Ms: Number(percentile95(terrainBuildMs).toFixed(4)),
  strongestWhiteoutDrawCalls: maxObservedDrawCalls,
  strongestWhiteoutVisibleNodes: Number(campaignArtifact?.evidence?.whiteoutVisibleNodes ?? 0)
};
const report = {
  schema: "aura3d-aurora-lander-performance/1.0",
  generatedAt: new Date().toISOString(),
  scope: "Headless route-local authored fixed-step/prediction/terrain timing plus current browser draw-call evidence; GPU frame-time parity is not claimed.",
  budgets: {
    fixedStepP95Ms: FIXED_STEP_P95_MS_BUDGET,
    boundedPredictionP95Ms: PREDICTION_P95_MS_BUDGET,
    terrainBuildP95Ms: TERRAIN_BUILD_P95_MS_BUDGET,
    strongestWhiteoutDrawCalls: DRAW_CALL_BUDGET
  },
  observed,
  sites,
  browserEvidence: "tests/reports/aurora-lander-campaign/03-strongest-whiteout.json",
  pass: sites.every((site) => site.completed)
    && observed.maxFixedStepP95Ms <= FIXED_STEP_P95_MS_BUDGET
    && observed.maxPredictionP95Ms <= PREDICTION_P95_MS_BUDGET
    && observed.terrainBuildP95Ms <= TERRAIN_BUILD_P95_MS_BUDGET
    && observed.strongestWhiteoutDrawCalls > 0
    && observed.strongestWhiteoutDrawCalls <= DRAW_CALL_BUDGET
    && observed.strongestWhiteoutVisibleNodes >= 40
};

const output = resolve(import.meta.dirname, "..", "performance-report.json");
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${output}`);
console.log(JSON.stringify({ pass: report.pass, observed: report.observed }));
if (!report.pass) process.exitCode = 1;
