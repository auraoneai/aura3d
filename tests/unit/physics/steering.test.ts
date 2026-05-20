import assert from "node:assert/strict";
import { test } from "vitest";
import {
  SteeringAgent,
  arriveSteering,
  blendSteeringForces,
  evadeSteering,
  fleeSteering,
  flockingSteering,
  obstacleAvoidanceSteering,
  pursuitSteering,
  seekSteering,
  wallAvoidanceSteering,
  wanderSteering
} from "../../../packages/physics/src/index.js";

test("seek steering produces force toward the target at max speed", () => {
  const steering = seekSteering([0, 0], [0.25, 0], [2, 0], 1);

  assert.deepEqual(steering.desiredVelocity, [1, 0]);
  assert.deepEqual(steering.force, [0.75, 0]);
  assert.equal(steering.distance, 2);
  assert.equal(steering.arrived, false);
});

test("arrive steering slows near the target and stops inside tolerance", () => {
  const far = arriveSteering({ position: [0, 0], velocity: [0, 0], target: [2, 0], maxSpeed: 1, slowingRadius: 0.5 });
  const near = arriveSteering({ position: [0.8, 0], velocity: [0.4, 0], target: [1, 0], maxSpeed: 1, slowingRadius: 0.5 });
  const arrived = arriveSteering({ position: [0.995, 0], velocity: [0.2, 0], target: [1, 0], maxSpeed: 1, slowingRadius: 0.5, tolerance: 0.01 });

  assert.deepEqual(far.desiredVelocity, [1, 0]);
  assert.equal(near.desiredVelocity[0] < 1, true);
  assert.equal(near.force[0] < far.force[0], true);
  assert.equal(arrived.arrived, true);
  assert.deepEqual(arrived.desiredVelocity, [0, 0]);
  assert.deepEqual(arrived.force, [-0.2, -0]);
});

test("steering agent clamps force and speed while integrating deterministically", () => {
  const run = () => {
    const agent = new SteeringAgent({ position: [0, 0], maxSpeed: 0.6, maxForce: 0.4 });
    const snapshots = [];
    for (let index = 0; index < 8; index += 1) {
      const steering = arriveSteering({
        position: agent.snapshot().position,
        velocity: agent.snapshot().velocity,
        target: [1, 0],
        maxSpeed: 0.6,
        slowingRadius: 0.35
      });
      snapshots.push(agent.apply(steering.force, 0.25));
    }
    return snapshots;
  };

  const first = run();
  assert.deepEqual(run(), first);
  assert.ok(first[first.length - 1]!.position[0] > 0.3);
  assert.ok(first.every((snapshot) => snapshot.speed <= 0.6));
  assert.ok(first[first.length - 1]!.distanceTraveled > 0.3);
});

test("flee steering moves away from nearby threats and deactivates outside panic range", () => {
  const active = fleeSteering({ position: [1, 0], velocity: [0.2, 0], threat: [0, 0], maxSpeed: 1, panicDistance: 2 });
  const inactive = fleeSteering({ position: [3, 0], velocity: [0.2, 0], threat: [0, 0], maxSpeed: 1, panicDistance: 2 });

  assert.deepEqual(active.desiredVelocity, [1, 0]);
  assert.deepEqual(active.force, [0.8, 0]);
  assert.equal(active.distance, 1);
  assert.equal(active.arrived, false);
  assert.deepEqual(inactive.force, [0, 0]);
  assert.deepEqual(inactive.desiredVelocity, [0, 0]);
  assert.equal(inactive.arrived, true);
});

test("pursuit steering predicts moving targets before seeking", () => {
  const steering = pursuitSteering({
    position: [0, 0],
    velocity: [0.2, 0],
    targetPosition: [1, 0],
    targetVelocity: [0.5, 0],
    maxSpeed: 1,
    maxPredictionTime: 1
  });

  assert.equal(steering.predictionTime, 1);
  assert.deepEqual(steering.predictedTarget, [1.5, 0]);
  assert.deepEqual(steering.desiredVelocity, [1, 0]);
  assert.equal(steering.force[0] > 0, true);
});

test("evade steering predicts moving threats before fleeing", () => {
  const steering = evadeSteering({
    position: [0, 0],
    velocity: [0.1, 0],
    threatPosition: [1, 0],
    threatVelocity: [-0.4, 0],
    maxSpeed: 1,
    maxPredictionTime: 1,
    panicDistance: 2
  });

  assert.equal(steering.predictionTime, 1);
  assert.deepEqual(steering.predictedTarget, [0.6, 0]);
  assert.equal(steering.desiredVelocity[0] < 0, true);
  assert.equal(steering.force[0] < 0, true);
});

test("wander steering is deterministic by seed and produces a moving target", () => {
  const first = wanderSteering({ position: [0, 0], velocity: [0.2, 0], maxSpeed: 1, seed: 42 });
  const same = wanderSteering({ position: [0, 0], velocity: [0.2, 0], maxSpeed: 1, seed: 42 });
  const different = wanderSteering({ position: [0, 0], velocity: [0.2, 0], maxSpeed: 1, seed: 43 });

  assert.deepEqual(first, same);
  assert.notDeepEqual(first.wanderTarget, different.wanderTarget);
  assert.equal(first.seed, 42);
  assert.equal(Math.hypot(first.desiredVelocity[0], first.desiredVelocity[1]) > 0, true);
  assert.equal(Math.hypot(first.wanderTarget[0], first.wanderTarget[1]) > 0, true);
});

test("flocking steering combines separation, alignment, and cohesion components", () => {
  const steering = flockingSteering({
    position: [0, 0],
    velocity: [0.2, 0],
    neighbors: [
      { position: [0.08, 0], velocity: [0.4, 0.1] },
      { position: [0.34, 0.12], velocity: [0.3, 0.1] },
      { position: [0.52, -0.08], velocity: [0.25, 0] }
    ],
    maxSpeed: 1,
    separationRadius: 0.16,
    alignmentRadius: 0.45,
    cohesionRadius: 0.7
  });

  assert.equal(steering.neighborCount, 3);
  assert.equal(steering.separation[0] < 0, true);
  assert.equal(steering.alignment[0] > 0, true);
  assert.equal(steering.cohesion[0] > 0, true);
  assert.equal(Math.hypot(steering.force[0], steering.force[1]) > 0, true);
});

test("obstacle avoidance detects the closest obstacle in the look-ahead corridor", () => {
  const steering = obstacleAvoidanceSteering({
    position: [0, 0],
    velocity: [1, 0],
    maxSpeed: 1,
    detectionDistance: 2,
    agentRadius: 0.1,
    obstacles: [
      { id: "far", position: [1.4, 0.08], radius: 0.2 },
      { id: "near", position: [0.6, -0.04], radius: 0.2 }
    ]
  });

  assert.equal(steering.obstacleDetected, true);
  assert.equal(steering.obstacleId, "near");
  assert.equal(steering.closestDistance, 0.6);
  assert.equal(Math.hypot(steering.force[0], steering.force[1]) > 0, true);

  const clear = obstacleAvoidanceSteering({ position: [0, 0], velocity: [1, 0], maxSpeed: 1, obstacles: [{ position: [0, 1], radius: 0.1 }] });
  assert.equal(clear.obstacleDetected, false);
  assert.deepEqual(clear.force, [0, 0]);
});

test("wall avoidance uses deterministic whisker intersections", () => {
  const steering = wallAvoidanceSteering({
    position: [0, 0],
    velocity: [1, 0],
    maxSpeed: 1,
    whiskerLength: 1,
    walls: [{ id: "gate-wall", start: [0.5, -0.5], end: [0.5, 0.5], normal: [-1, 0] }]
  });

  assert.equal(steering.wallDetected, true);
  assert.equal(steering.wallId, "gate-wall");
  assert.equal(steering.hitDistance, 0.5);
  assert.equal(steering.force[0] < 0, true);

  const clear = wallAvoidanceSteering({ position: [0, 0], velocity: [1, 0], maxSpeed: 1, walls: [{ start: [2, -1], end: [2, 1], normal: [-1, 0] }] });
  assert.equal(clear.wallDetected, false);
});

test("steering force pipeline supports weighted and priority blending", () => {
  const weighted = blendSteeringForces({
    entries: [
      { id: "avoid", force: [1, 0], weight: 0.5 },
      { id: "flock", force: [0, 1], weight: 0.5 }
    ],
    maxForce: 1
  });
  const priority = blendSteeringForces({
    mode: "priority",
    entries: [
      { id: "low", force: [1, 0], priority: 1 },
      { id: "high", force: [0, 1], priority: 5 }
    ]
  });

  assert.deepEqual(weighted.force, [0.5, 0.5]);
  assert.deepEqual(weighted.selectedIds, ["avoid", "flock"]);
  assert.deepEqual(priority.force, [0, 1]);
  assert.deepEqual(priority.selectedIds, ["high"]);
});
