import { describe, expect, test } from "vitest";
import { physics, primitives, scene, type AuraPhysicsWorldController } from "../../../packages/engine/src/agent-api/index";

/**
 * Root collision matrix (PRD beat-three.js WP-K.4): every dynamic shape the root
 * `physics` namespace builds (box, sphere, capsule) lands and comes to rest on
 * every static support it can build (plane, box) and on another dynamic body,
 * without tunnelling, jitter or an energy gain. The root namespace, not
 * `@aura3d/physics`, is the only import surface under test.
 */

type Vec3 = readonly [number, number, number];
const STEP = 1 / 60;
const SETTLE_STEPS = 360;

interface DynamicCase {
  readonly name: string;
  readonly shape: () => ReturnType<typeof physics.box>;
  /** Centre height above the support surface when the body rests flat. */
  readonly restHeight: number;
}

const DYNAMICS: readonly DynamicCase[] = [
  { name: "box", shape: () => physics.box(0.4, 0.4, 0.4), restHeight: 0.4 },
  { name: "sphere", shape: () => physics.sphere(0.35), restHeight: 0.35 },
  { name: "capsule", shape: () => physics.capsule(0.25, 0.55), restHeight: 0.25 + 0.55 }
];

function makeWorld(): AuraPhysicsWorldController {
  return physics.world({ gravity: [0, -9.81, 0], enableSleeping: false });
}

function settle(world: AuraPhysicsWorldController): readonly unknown[] {
  let last: readonly unknown[] = [];
  for (let step = 0; step < SETTLE_STEPS; step += 1) last = physics.step(world, STEP);
  return last;
}

function speed(velocity: Vec3): number {
  return Math.hypot(velocity[0], velocity[1], velocity[2]);
}

describe("root physics collision matrix", () => {
  const supports = [
    { name: "static plane", top: 0, build: (world: AuraPhysicsWorldController) => world.createBody({ type: "static", shape: physics.plane([0, 1, 0], 0) }) },
    { name: "static box", top: 0, build: (world: AuraPhysicsWorldController) => world.createBody({ type: "static", position: [0, -0.5, 0], shape: physics.box(6, 0.5, 6) }) }
  ] as const;

  for (const support of supports) {
    for (const dynamic of DYNAMICS) {
      test(`${dynamic.name} (dynamic) comes to rest on a ${support.name}`, () => {
        const world = makeWorld();
        support.build(world);
        const body = world.createBody({ type: "dynamic", mass: 1, position: [0, 3, 0], shape: dynamic.shape(), material: { friction: 0.6, restitution: 0 } });
        const startY = body.position[1];
        let minY = startY;
        let sawContact = false;
        for (let step = 0; step < SETTLE_STEPS; step += 1) {
          physics.step(world, STEP);
          minY = Math.min(minY, body.position[1]);
          if (physics.liveContactCount(world) > 0) sawContact = true;
        }
        expect(sawContact).toBe(true);
        // No tunnelling: the body never sank below its resting height by more than solver slop.
        expect(minY).toBeGreaterThan(support.top + dynamic.restHeight - 0.06);
        // Rests where the shape's extent says it should, and stays there.
        expect(body.position[1]).toBeGreaterThan(support.top + dynamic.restHeight - 0.06);
        expect(body.position[1]).toBeLessThan(support.top + dynamic.restHeight + 0.06);
        expect(speed(body.velocity as Vec3)).toBeLessThan(0.1);
        // Dropped straight down: no sideways drift beyond slop.
        expect(Math.hypot(body.position[0], body.position[2])).toBeLessThan(0.1);
      });
    }
  }

  for (const upper of DYNAMICS) {
    test(`${upper.name} (dynamic) rests on a dynamic box lying on a static box`, () => {
      const world = makeWorld();
      world.createBody({ type: "static", position: [0, -0.5, 0], shape: physics.box(6, 0.5, 6) });
      const lower = world.createBody({ type: "dynamic", mass: 2, position: [0, 0.5, 0], shape: physics.box(0.5, 0.5, 0.5), material: { friction: 0.8, restitution: 0 } });
      const top = world.createBody({ type: "dynamic", mass: 1, position: [0, 3, 0], shape: upper.shape(), material: { friction: 0.8, restitution: 0 } });
      settle(world);
      // The supporting box carries the load: it stays put, the upper body sits on top of it.
      expect(Math.abs(lower.position[1] - 0.5)).toBeLessThan(0.06);
      expect(top.position[1]).toBeGreaterThan(1 + upper.restHeight - 0.08);
      expect(top.position[1]).toBeLessThan(1 + upper.restHeight + 0.08);
      expect(speed(top.velocity as Vec3)).toBeLessThan(0.15);
    });
  }

  test("a capsule primitive with a bare physics spec collides over its visible extent", () => {
    // size is [diameter, total height, diameter]; the collider must span the same 1.6 m,
    // so the body rests with its centre 0.8 m above the ground, not 0.8 m +/- a cap radius.
    const source = scene()
      .add(primitives.plane({ name: "ground" }).physics({ type: "static", shape: "plane" }))
      .add(primitives.capsule({ name: "visible capsule", size: [0.5, 1.6, 0.5] }).position(0, 3, 0).physics({ type: "dynamic", mass: 1 }))
      .add(primitives.cylinder({ name: "visible cylinder", size: [0.6, 1.0, 0.6] }).position(3, 3, 0).physics({ type: "dynamic", mass: 1 }));
    const world = physics.worldFromScene(source, { gravity: [0, -9.81, 0], enableSleeping: false });
    settle(world);
    const bodies = world.snapshot().snapshot.bodies.filter((body) => body.type === "dynamic");
    expect(bodies).toHaveLength(2);
    const capsule = bodies[0]!;
    const cylinder = bodies[1]!;
    expect(capsule.position[1]).toBeGreaterThan(0.8 - 0.06);
    expect(capsule.position[1]).toBeLessThan(0.8 + 0.06);
    expect(cylinder.position[1]).toBeGreaterThan(0.5 - 0.06);
    expect(cylinder.position[1]).toBeLessThan(0.5 + 0.06);
  });

  test("a kinematic body pushed into a dynamic body moves it", () => {
    const world = physics.world({ gravity: [0, 0, 0], enableSleeping: false });
    const pusher = world.createBody({ type: "kinematic", position: [-2, 0, 0], shape: physics.box(0.5, 0.5, 0.5) });
    const target = world.createBody({ type: "dynamic", mass: 1, position: [0, 0, 0], shape: physics.sphere(0.5) });
    for (let step = 0; step < 120; step += 1) {
      pusher.setPosition([-2 + step * 0.03, 0, 0]);
      physics.step(world, STEP);
    }
    expect(target.position[0]).toBeGreaterThan(0.3);
  });

  test("a sensor reports overlap events without moving the body it overlaps", () => {
    const world = makeWorld();
    world.createBody({ type: "static", shape: physics.plane() });
    const ball = world.createBody({ type: "dynamic", mass: 1, position: [0, 2, 0], shape: physics.sphere(0.3), material: { friction: 0.5, restitution: 0 } });
    world.createBody({ type: "static", position: [0, 0.3, 0], shape: physics.sphere(0.6), sensor: true });
    let began = false;
    for (let step = 0; step < 240; step += 1) {
      for (const event of physics.step(world, STEP)) {
        if ((event as { type?: string }).type === "begin") began = true;
      }
    }
    expect(began).toBe(true);
    // A sensor never pushes back: the ball still reaches the floor.
    expect(ball.position[1]).toBeLessThan(0.4);
  });
});
