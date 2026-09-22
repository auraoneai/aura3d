import { createRapierPhysics } from "../../packages/physics-rapier/src/index.js";

declare global {
  interface Window {
    __auraRapierLoadStart?: number;
    __auraRapierProof?: unknown;
  }
}

async function run(): Promise<void> {
  const initStart = performance.now();
  const world = await createRapierPhysics({ gravity: [0, -9.81, 0] });
  const initMs = performance.now() - initStart;
  world.createBody({ type: "fixed", position: [0, -0.5, 0], shape: { kind: "box", halfExtents: [100, 0.5, 100] } });
  const bodies = [];
  for (let index = 0; index < 220; index += 1) {
    bodies.push(world.createBody({ position: [(index % 15) * 1.5, 2, Math.floor(index / 15) * 1.5], shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] } }));
  }
  for (let index = 0; index < 30; index += 1) world.step();
  const stepStart = performance.now();
  for (let index = 0; index < 120; index += 1) world.step();
  const stepMs220Bodies = (performance.now() - stepStart) / 120;
  const chassis = bodies[0];
  if (!chassis) throw new Error("missing chassis");
  const character = world.createCharacterController().enableAutostep(0.5, 0.2).enableSnapToGround(0.2);
  // Move a capsule clear of the 220-body grid (x/z 0..21) down into the floor slab
  // (top at y = 0, spans +/-100) so the native controller has to resolve a real contact.
  const avatar = world.createBody({ type: "kinematic-position", position: [40, 1, 40], shape: { kind: "capsule", halfHeight: 0.5, radius: 0.25 } });
  const movement = character.move(avatar, [0, -2, 0]);
  const nativeCharacterController = movement.collisions >= 1 && movement.applied[1] > -2 && movement.applied[1] < 0 && Number.isFinite(movement.nextPosition[1]);
  const vehicle = world.createVehicleController(chassis).addWheel({
    connection: [1, 0, 1], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.3, radius: 0.4,
    suspensionStiffness: 42, frictionSlip: 12,
  });
  vehicle.update(1 / 60);
  // Round-trip the per-wheel tuning through the native tyre model rather than trusting
  // that a handle was allocated.
  const nativeVehicleController = vehicle.wheelCount() === 1 && vehicle.wheelStates().length === 1
    && vehicle.wheelState(0)?.frictionSlip === 12 && Number.isFinite(vehicle.currentVehicleSpeed());
  vehicle.dispose();
  character.dispose();
  const rayHit = world.raycast([0, 20, 0], [0, -1, 0], 100);
  world.dispose();

  let repeatedDisposals = 0;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const mounted = await createRapierPhysics();
    mounted.createBody({ shape: { kind: "sphere", radius: 0.25 } });
    mounted.step();
    mounted.dispose();
    if (mounted.disposed && mounted.bodies().length === 0) repeatedDisposals += 1;
  }
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  window.__auraRapierProof = {
    pass: Boolean(rayHit) && repeatedDisposals === 20 && stepMs220Bodies < 16.7 && nativeCharacterController && nativeVehicleController,
    loadToReadyMs: performance.now() - (window.__auraRapierLoadStart ?? 0),
    initMs,
    stepMs220Bodies,
    rayHit: Boolean(rayHit),
    nativeCharacterController,
    nativeVehicleController,
    repeatedDisposals,
    usedJSHeapSize: memory?.usedJSHeapSize ?? null
  };
}

void run().catch((error) => {
  window.__auraRapierProof = { pass: false, error: error instanceof Error ? error.message : String(error) };
});
