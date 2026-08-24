import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { SIEGE_GOLF_HOLES } from "../src/course";
import { HoleFlow } from "../src/hole-flow";
import { SIEGE_GOLF_CANONICAL_SOLUTIONS, directionForAbsoluteAngle } from "../src/solutions";

const BODY_BUDGET = 32;
const CONSTRAINT_BUDGET = 8;
const PHYSICS_P95_MS_BUDGET = 16.7;

const holes = SIEGE_GOLF_HOLES.map((hole, holeIndex) => {
  const flow = new HoleFlow(hole);
  const initial = flow.sim.world.snapshot().snapshot.stats;
  const stepDurations: number[] = [];
  const resolutionFrames: number[] = [];

  for (const stroke of SIEGE_GOLF_CANONICAL_SOLUTIONS[holeIndex]!.strokes) {
    if (!flow.strike(directionForAbsoluteAngle(stroke.angle), stroke.power)) {
      throw new Error(`${hole.id} rejected its canonical stroke`);
    }
    let frames = 0;
    while (flow.phase === "simulating" && frames < 700) {
      const started = performance.now();
      flow.update(1);
      stepDurations.push(performance.now() - started);
      frames += 1;
    }
    resolutionFrames.push(frames);
  }

  const sorted = [...stepDurations].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const completed = flow.phase === "hole-complete" && flow.snapshot().targetsSunk === flow.snapshot().totalTargets;
  return {
    holeId: hole.id,
    trackedGameplayBodies: flow.sim.bodyCount,
    worldBodies: initial.bodies,
    colliders: initial.colliders,
    constraints: initial.constraints,
    canonicalStrokes: flow.strokes,
    resolutionFrames,
    completed,
    physicsStepMs: {
      samples: stepDurations.length,
      mean: Number((stepDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, stepDurations.length)).toFixed(4)),
      p95: Number(p95.toFixed(4)),
      max: Number(max.toFixed(4))
    }
  };
});

const maxWorldBodies = Math.max(...holes.map((hole) => hole.worldBodies));
const maxConstraints = Math.max(...holes.map((hole) => hole.constraints));
const maxPhysicsP95Ms = Math.max(...holes.map((hole) => hole.physicsStepMs.p95));
const report = {
  schema: "aura3d-siege-golf-performance/1.0",
  generatedAt: new Date().toISOString(),
  scope: "headless route-local Rapier fixed-step simulation; rendering performance is not claimed",
  budgets: {
    maxWorldBodies: BODY_BUDGET,
    maxConstraints: CONSTRAINT_BUDGET,
    physicsStepP95Ms: PHYSICS_P95_MS_BUDGET
  },
  observed: { maxWorldBodies, maxConstraints, maxPhysicsP95Ms },
  holes,
  pass: holes.every((hole) => hole.completed)
    && maxWorldBodies <= BODY_BUDGET
    && maxConstraints <= CONSTRAINT_BUDGET
    && maxPhysicsP95Ms <= PHYSICS_P95_MS_BUDGET
};

const output = resolve(import.meta.dirname, "..", "performance-report.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Wrote ${output}`);
console.log(JSON.stringify({ pass: report.pass, observed: report.observed }));
if (!report.pass) process.exitCode = 1;
