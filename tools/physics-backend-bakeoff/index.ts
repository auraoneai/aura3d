/**
 * Post-selection physical-runtime verifier.
 *
 * The original WS-4.2 comparison served its purpose and its dated evidence remains frozen
 * in tests/reports/physics-backend-bakeoff/report.json. Aura3D 2.0 has one physical owner,
 * so this executable no longer installs or runs a displaced solver. It verifies that the
 * selected Rapier adapter still satisfies the decision's operational requirements.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { PhysicsWorld, Shape } from "../../packages/physics/src/index.js";
import { createRapierPhysics } from "../../packages/physics-rapier/src/index.js";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "tests/reports/physics-backend-bakeoff/current-rapier-validation.json");
const FROZEN_DECISION = resolve(ROOT, "tests/reports/physics-backend-bakeoff/report.json");

function simulateDeterministicScene(): readonly number[] {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, continuousCollision: { mode: "adaptive-substeps" } });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(floor, { shape: Shape.box(8, 0.5, 8), material: { friction: 0.8 } });
  for (let index = 0; index < 25; index += 1) {
    const body = world.createRigidBody({ position: [0, 0.6 + index * 1.02, 0], mass: 1 });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.8 } });
  }
  for (let step = 0; step < 180; step += 1) world.step();
  return world.snapshot().bodies.flatMap((body) => [...body.position, ...body.rotation]);
}

function measureAuraWorldStepCost(bodyCount: number): number {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(floor, { shape: Shape.box(80, 0.5, 80) });
  for (let index = 0; index < bodyCount; index += 1) {
    const x = (index % 25) * 1.2;
    const z = (Math.floor(index / 25) % 25) * 1.2;
    const y = 1 + Math.floor(index / 625) * 1.2;
    const body = world.createRigidBody({ position: [x, y, z], mass: 1 });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  }
  for (let warmup = 0; warmup < 10; warmup += 1) world.step();
  const started = performance.now();
  for (let step = 0; step < 60; step += 1) world.step();
  return (performance.now() - started) / 60;
}

async function main(): Promise<void> {
  const initializedAt = performance.now();
  const adapter = await createRapierPhysics({ gravity: [0, -9.81, 0] });
  const initMs = performance.now() - initializedAt;
  const ground = adapter.createBody({
    type: "fixed",
    shape: { kind: "box", halfExtents: [5, 0.05, 5] },
    position: [0, -0.05, 0]
  });
  const bullet = adapter.createBody({
    shape: { kind: "sphere", radius: 0.1 },
    position: [0, 6, 0],
    linearVelocity: [0, -400, 0],
    ccd: true
  });
  for (let step = 0; step < 60; step += 1) adapter.step(1 / 60);
  const nativeCcdStopped = bullet.position()[1] > -0.2;
  const hasCharacterController = typeof adapter.createCharacterController === "function";
  const hasVehicleController = typeof adapter.createVehicleController === "function";
  ground.remove();
  bullet.remove();
  adapter.dispose();

  const firstRun = simulateDeterministicScene();
  const secondRun = simulateDeterministicScene();
  const deterministic = firstRun.length === secondRun.length && firstRun.every((value, index) => value === secondRun[index]);

  const frozen = JSON.parse(readFileSync(FROZEN_DECISION, "utf8")) as { generatedAt?: string; selectedBackend?: string };
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    harness: "tools/physics-backend-bakeoff/index.ts",
    purpose: "post-selection verification; displaced backends are intentionally not installed or executed",
    selectedBackend: "rapier",
    selectedProvider: "@dimforge/rapier3d-compat@0.20.0",
    frozenDecisionEvidence: {
      path: "tests/reports/physics-backend-bakeoff/report.json",
      generatedAt: frozen.generatedAt ?? null,
      selectedBackendAtDecisionTime: frozen.selectedBackend ?? null
    },
    measurements: {
      initMs,
      msPerStepAt250Bodies: measureAuraWorldStepCost(250),
      deterministicAcrossIdenticalRuns: deterministic,
      nativeCcdStoppedFastBody: nativeCcdStopped,
      characterControllerAvailable: hasCharacterController,
      vehicleControllerAvailable: hasVehicleController
    },
    pass: deterministic && nativeCcdStopped && hasCharacterController && hasVehicleController
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.pass) process.exitCode = 1;
}

await main();
