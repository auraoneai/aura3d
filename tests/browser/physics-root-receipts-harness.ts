// Root-only harness for the physics collision receipt: box, sphere and capsule bodies fall onto
// a static box, onto each other and onto a dynamic crate, through `@aura3d/engine` alone.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";
import { captureCanvas, changedBetween, messageOf, newStageCanvas, type CapabilityResult } from "./motion-receipts-page";

type Vec3 = readonly [number, number, number];

declare global {
  interface Window {
    __AURA3D_PHYSICS_ROOT_RECEIPTS__?: {
      status: "running" | "done";
      imports: readonly string[];
      capabilities: Record<string, CapabilityResult>;
    };
  }
}

const W = 480;
const H = 270;
const DT = 1 / 60;

/** name, rest-centre height above the ground top, what supports it. */
const EXPECTED_REST: Readonly<Record<string, number>> = {
  box: 0.4,
  sphere: 0.35,
  capsule: 0.25 + 0.55,
  capsuleFromSize: 0.8,
  lowerCrate: 0.5,
  upperBall: 1.3
};

function dynamic(shape: "box" | "sphere" | "capsule" | undefined, extra: Record<string, unknown>) {
  return { type: "dynamic" as const, mass: 1, friction: 0.6, restitution: 0, ...(shape ? { shape } : {}), ...extra };
}

function buildScene() {
  const paint = (color: string) => material.pbr({ color, roughness: 0.55 });
  return scene()
    .background("#9db4c8")
    .camera(camera.perspective({ fov: 40, near: 0.1, far: 60, position: [0, 3.2, 11], target: [0, 1.1, 0] }))
    .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.3 }))
    .add(lights.directional({ color: "#fff4e0", intensity: 2.2, position: [4, 9, 6] }))
    .add(primitives.box({ name: "ground", size: [14, 0.5, 8], material: paint("#6f8a5a") }).position(0, -0.25, 0)
      .physics({ type: "static", shape: "box", halfExtents: [7, 0.25, 4], friction: 0.8 }))
    .add(primitives.box({ name: "box", size: [0.8, 0.8, 0.8], material: paint("#e4572e") }).position(-4, 3, 0)
      .physics(dynamic("box", { halfExtents: [0.4, 0.4, 0.4] })))
    .add(primitives.sphere({ name: "sphere", size: 0.7, material: paint("#29b6f6") }).position(-2.6, 3.6, 0)
      .physics(dynamic("sphere", { radius: 0.35 })))
    .add(primitives.capsule({ name: "capsule", size: [0.5, 1.6, 0.5], material: paint("#ffca28") }).position(-1.1, 4.2, 0)
      .physics(dynamic("capsule", { radius: 0.25, halfHeight: 0.55 })))
    .add(primitives.capsule({ name: "capsuleFromSize", size: [0.5, 1.6, 0.5], material: paint("#ab47bc") }).position(0.5, 4.8, 0)
      .physics(dynamic(undefined, {})))
    .add(primitives.box({ name: "lowerCrate", size: [1, 1, 1], material: paint("#8d6e63") }).position(2.6, 0.5, 0)
      .physics(dynamic("box", { mass: 2, halfExtents: [0.5, 0.5, 0.5] })))
    .add(primitives.sphere({ name: "upperBall", size: 0.6, material: paint("#66bb6a") }).position(2.6, 3.2, 0)
      .physics(dynamic("sphere", { radius: 0.3 })));
}

function step(app: AuraApp, count: number): void {
  for (let i = 0; i < count; i += 1) app.step(DT);
}

async function collisions(): Promise<CapabilityResult> {
  const result: CapabilityResult = { status: "ok", measurements: {}, frames: [] };
  const canvas = newStageCanvas(W, H);
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    physics: { gravity: [0, -9.81, 0], seed: 1 },
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: buildScene()
  });
  try {
    await app.ready();
    const groundHits = new Set<string>();
    const pairHits = new Set<string>();
    app.physics.onCollision((event) => {
      const names = [event.nodeA, event.nodeB].filter((name): name is string => typeof name === "string").sort();
      if (names.length === 2) pairHits.add(names.join("|"));
      if (names.includes("ground")) for (const name of names) if (name !== "ground") groundHits.add(name);
    });

    step(app, 1);
    const frameStart = captureCanvas(canvas, "start", "Six dynamic bodies released above a static ground");
    step(app, 40);
    const frameFalling = captureCanvas(canvas, "falling", "Mid-fall");
    step(app, 360);
    const frameRest = captureCanvas(canvas, "rest", "At rest: box, sphere, capsules on the ground; ball on the crate");

    const bodies: Record<string, unknown> = {};
    let worstRestError = 0;
    let worstNodeDrift = 0;
    let fastest = 0;
    for (const [name, rest] of Object.entries(EXPECTED_REST)) {
      const body = app.physics.bodies.require(name);
      const position = body.position();
      const velocity = body.velocity();
      const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
      const nodeY = app.nodes.require(name).position[1];
      const restError = Math.abs(position[1] - rest);
      worstRestError = Math.max(worstRestError, restError);
      worstNodeDrift = Math.max(worstNodeDrift, Math.abs(nodeY - position[1]));
      fastest = Math.max(fastest, speed);
      bodies[name] = { y: Number(position[1].toFixed(4)), expectedY: rest, restError: Number(restError.toFixed(4)), speed: Number(speed.toFixed(4)), nodeY: Number(nodeY.toFixed(4)), x: Number(position[0].toFixed(3)) };
    }
    const lateral = Object.fromEntries(Object.keys(EXPECTED_REST).map((name) => {
      const p: Vec3 = app.physics.bodies.require(name).position();
      return [name, Number(Math.hypot(p[2]).toFixed(3))];
    }));

    result.measurements = {
      bodies,
      worstRestError: Number(worstRestError.toFixed(4)),
      worstNodeDrift: Number(worstNodeDrift.toFixed(4)),
      fastestBodySpeed: Number(fastest.toFixed(4)),
      depthDrift: lateral,
      collidedWithGround: [...groundHits].sort(),
      collidingPairs: [...pairHits].sort(),
      backend: app.physics.backend().active,
      changedPixelsStartVsFalling: changedBetween(frameStart, frameFalling),
      changedPixelsStartVsRest: changedBetween(frameStart, frameRest)
    };
    result.frames.push(frameStart.frame, frameFalling.frame, frameRest.frame);
  } finally {
    app.dispose();
    canvas.remove();
  }
  return result;
}

async function main(): Promise<void> {
  const state: NonNullable<Window["__AURA3D_PHYSICS_ROOT_RECEIPTS__"]> = { status: "running", imports: ["@aura3d/engine"], capabilities: {} };
  window.__AURA3D_PHYSICS_ROOT_RECEIPTS__ = state;
  try {
    state.capabilities["physics-root-collision"] = await collisions();
  } catch (error) {
    state.capabilities["physics-root-collision"] = { status: "error", error: messageOf(error), measurements: {}, frames: [] };
  }
  state.status = "done";
}

void main();
