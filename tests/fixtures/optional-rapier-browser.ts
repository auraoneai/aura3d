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
  const vehicle = world.createVehicleController(chassis).addWheel([1, 0, 1], [0, -1, 0], [1, 0, 0], 0.3, 0.4);
  vehicle.update(1 / 60);
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
    pass: Boolean(rayHit) && repeatedDisposals === 20 && stepMs220Bodies < 16.7,
    loadToReadyMs: performance.now() - (window.__auraRapierLoadStart ?? 0),
    initMs,
    stepMs220Bodies,
    rayHit: Boolean(rayHit),
    nativeCharacterController: true,
    nativeVehicleController: true,
    repeatedDisposals,
    usedJSHeapSize: memory?.usedJSHeapSize ?? null
  };
}

void run().catch((error) => {
  window.__auraRapierProof = { pass: false, error: error instanceof Error ? error.message : String(error) };
});
