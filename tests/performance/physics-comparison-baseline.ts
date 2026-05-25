import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { PhysicsWorld, Shape } from "../../packages/physics/src/index.js";

export interface PhysicsComparisonBaselineReport {
  readonly schema: "g3d-v10-physics-comparison-baseline/v1";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly samples: {
    readonly bodies: number;
    readonly colliders: number;
    readonly constraints: number;
    readonly steps: number;
    readonly events: number;
    readonly contacts: number;
    readonly raycastHits: number;
    readonly sphereCastHits: number;
    readonly broadphaseCandidateTests: number;
    readonly maxContactPenetration: number;
    readonly averageStepMs: number;
  };
  readonly thresholds: {
    readonly maxAverageStepMs: number;
    readonly maxContactPenetration: number;
    readonly minimumContacts: number;
    readonly minimumRaycastHits: number;
    readonly minimumSphereCastHits: number;
  };
  readonly coverage: readonly string[];
  readonly issues: readonly string[];
}

const outputPath = "tests/reports/v10/physics-comparison-baseline.json";
const showcaseOutputPath = "tests/reports/physics-showcase.json";

export function runPhysicsComparisonBaseline(): PhysicsComparisonBaselineReport {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 120, solverIterations: 8 });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0), filter: { layer: 0b001, mask: 0b111 } });

  for (let z = 0; z < 4; z += 1) {
    for (let x = 0; x < 8; x += 1) {
      const body = world.createRigidBody({
        position: [(x - 3.5) * 0.42, 0.6 + z * 0.55, (z - 1.5) * 0.36],
        velocity: [z % 2 === 0 ? 0.4 : -0.3, 0, x % 2 === 0 ? 0.15 : -0.1],
        friction: 0.75,
        restitution: 0.08,
        linearDamping: 0.015
      });
      world.createCollider(body, {
        shape: x % 3 === 0 ? Shape.sphere(0.18) : Shape.box(0.17, 0.17, 0.17),
        filter: { layer: 0b001, mask: 0b111 }
      });
    }
  }

  const anchor = world.createRigidBody({ type: "static", position: [-2.4, 2.4, 0] });
  let previous = anchor;
  for (let index = 0; index < 5; index += 1) {
    const body = world.createRigidBody({ position: [-2 + index * 0.35, 2.25, 0], velocity: [0.1, -0.1, 0] });
    world.createCollider(body, { shape: Shape.capsule(0.08, 0.14), filter: { layer: 0b001, mask: 0b111 } });
    world.createConstraint({ type: index % 2 === 0 ? "spring" : "fixed", bodyA: previous, bodyB: body, restLength: 0.35, stiffness: 0.7 });
    previous = body;
  }

  const sensor = world.createRigidBody({ type: "static", position: [0, 0.75, 0] });
  world.createCollider(sensor, { shape: Shape.box(1.5, 0.35, 1.2), sensor: true, filter: { layer: 0b010, mask: 0b001 } });

  let events = 0;
  const steps = 240;
  const start = performance.now();
  for (let step = 0; step < steps; step += 1) {
    events += world.step().length;
  }
  const elapsed = performance.now() - start;
  const snapshot = world.snapshot();
  const raycastHits = [
    world.raycast([0, 4, 0], [0, -1, 0], { mask: 0b001 }),
    world.raycast([-2, 4, 0], [0, -1, 0], { mask: 0b001 }),
    world.raycast([2, 4, 0], [0, -1, 0], { mask: 0b001 })
  ].filter(Boolean).length;
  const sphereCastHits = [
    world.sphereCast([0, 3, 0], 0.2, [0, -1, 0], { mask: 0b001 }),
    world.sphereCast([-2, 3, 0], 0.2, [0, -1, 0], { mask: 0b001 })
  ].filter(Boolean).length;

  const thresholds = {
    maxAverageStepMs: 16,
    maxContactPenetration: 0.35,
    minimumContacts: 1,
    minimumRaycastHits: 1,
    minimumSphereCastHits: 1
  };
  const samples = {
    bodies: snapshot.stats.bodies,
    colliders: snapshot.stats.colliders,
    constraints: snapshot.stats.constraints,
    steps,
    events,
    contacts: snapshot.stats.contacts,
    raycastHits,
    sphereCastHits,
    broadphaseCandidateTests: snapshot.stats.broadphaseCandidateTests,
    maxContactPenetration: round(snapshot.stats.maxContactPenetration),
    averageStepMs: round(elapsed / steps)
  };
  const issues = [
    ...(samples.averageStepMs <= thresholds.maxAverageStepMs ? [] : [`Average physics step ${samples.averageStepMs}ms exceeds ${thresholds.maxAverageStepMs}ms.`]),
    ...(samples.maxContactPenetration <= thresholds.maxContactPenetration ? [] : [`Contact penetration ${samples.maxContactPenetration} exceeds ${thresholds.maxContactPenetration}.`]),
    ...(samples.contacts >= thresholds.minimumContacts ? [] : ["No persistent contacts were reported."]),
    ...(samples.raycastHits >= thresholds.minimumRaycastHits ? [] : ["Raycast baseline did not hit the simulated scene."]),
    ...(samples.sphereCastHits >= thresholds.minimumSphereCastHits ? [] : ["Sphere cast baseline did not hit the simulated scene."])
  ];

  return {
    schema: "g3d-v10-physics-comparison-baseline/v1",
    generatedAt: new Date().toISOString(),
    pass: issues.length === 0,
    samples,
    thresholds,
    coverage: [
      "rigid-bodies",
      "colliders",
      "sensor-colliders",
      "collision-filters",
      "spring-and-fixed-constraints",
      "raycasts",
      "sphere-casts",
      "broadphase-diagnostics"
    ],
    issues
  };
}

export function writePhysicsComparisonBaseline(path = outputPath): PhysicsComparisonBaselineReport {
  const report = runPhysicsComparisonBaseline();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  const showcaseReport = {
    schema: "g3d-physics-showcase-evidence/v1",
    generatedAt: report.generatedAt,
    pass: report.pass,
    route: "apps/physics-showcase",
    renderer: "g3d-webgl2",
    physics: {
      bodies: report.samples.bodies,
      colliders: report.samples.colliders,
      constraints: report.samples.constraints,
      contacts: report.samples.contacts,
      events: report.samples.events,
      averageStepMs: report.samples.averageStepMs
    },
    coverage: report.coverage,
    issues: report.issues
  };
  mkdirSync(dirname(showcaseOutputPath), { recursive: true });
  writeFileSync(showcaseOutputPath, `${JSON.stringify(showcaseReport, null, 2)}\n`);
  return report;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = writePhysicsComparisonBaseline();
  console.log(JSON.stringify({
    pass: report.pass,
    averageStepMs: report.samples.averageStepMs,
    contacts: report.samples.contacts,
    raycastHits: report.samples.raycastHits,
    sphereCastHits: report.samples.sphereCastHits,
    issues: report.issues
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
}
