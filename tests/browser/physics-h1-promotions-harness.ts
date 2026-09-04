import { createPhysicsRuntime } from "@aura3d/engine";
import { PhysicsWorld } from "@aura3d/physics";

/**
 * H1 root-promotion browser proof: stacking, joint, tunnel-guard (CCD),
 * sleep/wake and sensor callbacks — every one driven from the `@aura3d/engine`
 * root (`createPhysicsRuntime`) over the real Rapier-owned simulation. No
 * force or contact here is scripted: the canvas draws where the solver put
 * the bodies, and the JSON reports what the solver returned.
 */
interface H1PromotionsResult {
  readonly status: "ready" | "error";
  readonly stacking?: {
    readonly finalHeights: readonly number[];
    readonly ordered: boolean;
    readonly settled: boolean;
    readonly contacts: number;
  };
  readonly joint?: { readonly initialGap: number; readonly finalGap: number; readonly held: boolean };
  readonly tunnelGuard?: {
    readonly subSteps: number;
    readonly ccdEngaged: boolean;
    readonly finalX: number;
    readonly stoppedByWall: boolean;
    readonly contacts: number;
  };
  readonly sleepWake?: { readonly slept: boolean; readonly wokeOnImpulse: boolean };
  readonly sensor?: { readonly enters: number; readonly fired: boolean };
  readonly backend?: { readonly active: string; readonly provider: string; readonly seed: number | null };
  readonly stackPixel?: readonly number[];
  readonly jointPixel?: readonly number[];
  readonly wallPixel?: readonly number[];
  readonly sleepPixel?: readonly number[];
  readonly sensorPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_H1_PROMOTIONS__?: H1PromotionsResult;
  }
}

function dist3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#h1-surface");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("H1 promotions canvas is unavailable.");
  context.fillStyle = "rgb(9, 13, 19)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // --- Stacking: three crates fall onto a plane and settle in order. ---
  const stackWorld = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, seed: 20260904 });
  const stackPhysics = createPhysicsRuntime(stackWorld);
  stackPhysics.createBody({ name: "floor", type: "static", shape: "plane", position: [0, 0, 0] });
  const crates = [0, 1, 2].map((index) =>
    stackPhysics.createBody({
      name: `crate-${index}`,
      shape: "box",
      halfExtents: [0.4, 0.4, 0.4],
      mass: 1,
      position: [0, 2 + index * 1.2, 0]
    })
  );
  let stackContacts = 0;
  for (let step = 0; step < 180; step += 1) {
    stackPhysics.step(1 / 60);
    stackContacts = Math.max(stackContacts, stackPhysics.contacts().length);
  }
  const finalHeights = crates.map((crate) => Number(crate.position()[1].toFixed(3)));
  const ordered = finalHeights[0]! < finalHeights[1]! && finalHeights[1]! < finalHeights[2]!;
  // A settled stack rests near half-height multiples: crate size 0.8, so gaps ~0.8.
  const gap01 = finalHeights[1]! - finalHeights[0]!;
  const gap12 = finalHeights[2]! - finalHeights[1]!;
  const settled =
    finalHeights[0]! > 0.2 && finalHeights[0]! < 0.7 && Math.abs(gap01 - 0.8) < 0.25 && Math.abs(gap12 - 0.8) < 0.25;

  // --- Joint: a fixed joint holds two bodies at their initial separation. ---
  const jointWorld = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, enableSleeping: false });
  const jointPhysics = createPhysicsRuntime(jointWorld);
  const jointA = jointPhysics.createBody({ name: "joint-a", shape: "box", mass: 1, position: [-1, 3, 0] });
  const jointB = jointPhysics.createBody({ name: "joint-b", shape: "box", mass: 1, position: [1, 3, 0] });
  const initialGap = dist3(jointA.position(), jointB.position());
  jointPhysics.createJoint({ kind: "fixed", bodyA: jointA.id, bodyB: jointB.id });
  for (let step = 0; step < 120; step += 1) jointPhysics.step(1 / 60);
  const finalGap = dist3(jointA.position(), jointB.position());
  const held = Math.abs(finalGap - initialGap) < 0.3;

  // --- Tunnel guard: a fast small body against a thin wall with adaptive-substep CCD. ---
  const tunnelWorld = new PhysicsWorld({
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    enableSleeping: false,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 128 }
  });
  const tunnelPhysics = createPhysicsRuntime(tunnelWorld);
  tunnelPhysics.createBody({
    name: "wall",
    type: "static",
    shape: "box",
    halfExtents: [0.05, 2, 2],
    position: [2, 1, 0]
  });
  const bullet = tunnelPhysics.createBody({ name: "bullet", shape: "sphere", radius: 0.05, mass: 1, position: [0, 1, 0] });
  bullet.setVelocity([120, 0, 0]);
  let tunnelContacts = 0;
  let maxSubSteps = 1;
  for (let step = 0; step < 10; step += 1) {
    tunnelPhysics.step(1 / 60);
    tunnelContacts = Math.max(tunnelContacts, tunnelPhysics.contacts().length);
    maxSubSteps = Math.max(maxSubSteps, tunnelPhysics.backend().continuousCollision.lastSubSteps);
  }
  const tunnelBackend = tunnelPhysics.backend();
  const subSteps = maxSubSteps;
  const finalX = bullet.position()[0];
  const stoppedByWall = finalX < 3 && tunnelContacts > 0;

  // --- Sleep/wake from root. ---
  const sleepWorld = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
  const sleepPhysics = createPhysicsRuntime(sleepWorld);
  const sleeper = sleepPhysics.createBody({ name: "sleeper", shape: "box", mass: 1, position: [0, 1, 0] });
  sleeper.sleep();
  const slept = sleeper.sleeping();
  sleeper.applyImpulse([1, 0, 0]);
  const wokeOnImpulse = !sleeper.sleeping();

  // --- Sensor trigger callback from root. ---
  const sensorWorld = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, enableSleeping: false });
  const sensorPhysics = createPhysicsRuntime(sensorWorld);
  sensorPhysics.createBody({
    name: "trigger",
    type: "static",
    shape: "box",
    halfExtents: [2, 2, 2],
    sensor: true,
    position: [0, 2, 0]
  });
  sensorPhysics.createBody({ name: "ball", shape: "sphere", radius: 0.4, mass: 1, position: [0, 2.5, 0] });
  let enters = 0;
  sensorPhysics.onTriggerEnter((event) => {
    if (event.sensor) enters += 1;
  });
  for (let step = 0; step < 60; step += 1) sensorPhysics.step(1 / 60);

  // --- Visible proof: draw the solver's final state, one band per scenario. ---
  const probe = (x: number, y: number): readonly number[] => [...context.getImageData(x, y, 1, 1).data];
  const drawBox = (x: number, y: number, color: string) => {
    context.fillStyle = color;
    context.fillRect(x - 9, y - 9, 18, 18);
  };
  // Stacking band (y ~40): the three settled crates in green.
  const stackPixelSpots: Array<readonly number[]> = [];
  crates.forEach((crate, index) => {
    const x = 60 + index * 40;
    const y = Math.max(10, Math.min(70, 60 - crate.position()[1] * 12));
    drawBox(x, y, "rgb(82, 184, 129)");
    if (index === 0) stackPixelSpots.push(probe(x, y));
  });
  // Joint band (y ~120): two bodies + magenta link.
  const jax = 60;
  const jay = 120;
  const jbx = Math.max(100, Math.min(220, 60 + finalGap * 30));
  drawBox(jax, jay, "rgb(96, 165, 250)");
  drawBox(jbx, jay, "rgb(96, 165, 250)");
  context.strokeStyle = "rgb(230, 102, 255)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(jax, jay);
  context.lineTo(jbx, jay);
  context.stroke();
  const jointPixel = probe(Math.round((jax + jbx) / 2), jay);
  // Tunnel band (y ~180): gray wall + red bullet at its solved position.
  const wallX = 200;
  context.fillStyle = "rgb(148, 163, 184)";
  context.fillRect(wallX - 3, 150, 6, 60);
  const bulletX = Math.max(8, Math.min(252, 40 + finalX * 60));
  context.fillStyle = "rgb(239, 68, 68)";
  context.beginPath();
  context.arc(bulletX, 180, 7, 0, Math.PI * 2);
  context.fill();
  // Sleep band (y ~240): blue sleeper at its (unmoved) position.
  const sleepX = 60;
  drawBox(sleepX, 240, "rgb(56, 189, 248)");
  // Sensor band (y ~300): amber zone + ball where the solver left it.
  context.strokeStyle = "rgb(251, 191, 36)";
  context.lineWidth = 2;
  context.strokeRect(40, 280, 120, 44);
  const ballHandle = sensorPhysics.bodies.require("ball");
  const ballX = Math.max(46, Math.min(154, 40 + (ballHandle.position()[0] + 2) * 30));
  const ballY = Math.max(286, Math.min(318, 302 - ballHandle.position()[1] * 4));
  context.fillStyle = "rgb(251, 146, 60)";
  context.beginPath();
  context.arc(ballX, ballY, 7, 0, Math.PI * 2);
  context.fill();

  window.__AURA3D_H1_PROMOTIONS__ = {
    status: "ready",
    stacking: { finalHeights, ordered, settled, contacts: stackContacts },
    joint: { initialGap, finalGap, held },
    tunnelGuard: {
      subSteps,
      ccdEngaged: subSteps > 1,
      finalX: Number(finalX.toFixed(3)),
      stoppedByWall,
      contacts: tunnelContacts
    },
    sleepWake: { slept, wokeOnImpulse },
    sensor: { enters, fired: enters > 0 },
    backend: {
      active: tunnelBackend.active,
      provider: tunnelBackend.continuousCollision.provider,
      seed: stackWorld.snapshot().backend.seed ?? null
    },
    stackPixel: stackPixelSpots[0],
    jointPixel,
    wallPixel: probe(wallX, 180),
    sleepPixel: probe(sleepX, 240),
    sensorPixel: probe(Math.round(ballX), Math.round(ballY))
  };
} catch (error) {
  window.__AURA3D_H1_PROMOTIONS__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error)
  };
}
