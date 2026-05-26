import assert from "node:assert/strict";
import { test } from "vitest";
import {
  Constraint,
  ECSPhysicsBridge,
  PhysicsDebugDraw,
  PhysicsStepper,
  PhysicsWorld,
  ScenePhysicsBridge,
  Shape,
  sampleArcadeVehicleDynamics,
  samplePacejkaTireForces,
  sampleVehicleDamage,
  sampleVehicleEffectEmitters,
  samplePlatformerControllerFixture,
  sampleClothSimulationFixture,
  sampleSoftBodyFixture,
  sampleFractureFixture,
  sampleFluidFixture,
  sampleFireSmokeFixture,
  samplePhysicsSandboxFixture,
  sampleRacingAiDriver,
  sampleVehicleDrivetrain
} from "../../packages/physics/src/index.js";
import {
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationStateMachine,
  AnimationTrack,
  BlendTree1D,
  BlendTree2D,
  Bone,
  ECSAnimationBridge,
  SceneAnimationBridge,
  Skeleton,
  applyRootMotion,
  extractRootMotion,
  buildSkinningPalette,
  solveTwoBoneIk,
  sampleMotionMatchingFixture,
  sampleSecondaryAnimationFixture
} from "../../packages/animation/src/index.js";
import { AnimationInspector } from "../../packages/debug/src/AnimationInspector.js";
import { PhysicsDebugAdapter } from "../../packages/debug/src/PhysicsDebugAdapter.js";

test("physics replay is deterministic for repeated fixed input runs", () => {
  const run = () => {
    const world = new PhysicsWorld({ gravity: [0, -10, 0], fixedDelta: 1 / 60 });
    const body = world.createRigidBody({ position: [0, 4, 0], velocity: [1, 0, 0] });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
    const ground = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(ground, { shape: Shape.box(10, 0.5, 10) });
    const eventTrace: string[] = [];
    for (let i = 0; i < 120; i += 1) {
      if (i === 10) {
        body.applyImpulse([0.25, 0, 0]);
      }
      eventTrace.push(...world.step(1 / 60).map((event) => `${i}:${event.type}:${event.pairKey}`));
    }
    return {
      bodies: world.snapshot().bodies.map((snapshot) => ({
        id: snapshot.id,
        position: snapshot.position.map((value) => Number(value.toFixed(6))),
        velocity: snapshot.velocity.map((value) => Number(value.toFixed(6)))
      })),
      eventTrace
    };
  };
  const baseline = run();
  for (let index = 0; index < 5; index += 1) {
    assert.deepEqual(run(), baseline);
  }
});

test("physics broadphase prunes distant collider pairs deterministically", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const first = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(first, { shape: Shape.box(1, 1, 1) });
  const second = world.createRigidBody({ position: [0.5, 0, 0] });
  world.createCollider(second, { shape: Shape.box(1, 1, 1) });
  for (let index = 0; index < 40; index += 1) {
    const body = world.createRigidBody({ position: [100 + index * 4, 0, 0] });
    world.createCollider(body, { shape: Shape.box(1, 1, 1) });
  }

  world.step(1 / 60);
  const stats = world.snapshot().stats;
  assert.equal(stats.broadphasePairs, 1);
  assert.equal(stats.contacts, 1);
});

test("rigid bodies integrate angular velocity, torque, damping, and off-center impulses deterministically", () => {
  const run = () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const body = world.createRigidBody({
      position: [0, 0, 0],
      mass: 2,
      inertia: [2, 4, 8],
      angularVelocity: [0, 0, 1],
      angularDamping: 0.25
    });
    body.applyTorque([0, 4, 0]);
    body.applyImpulseAtPoint([0, 2, 0], [1, 0, 0]);

    world.step(0.5);
    const snapshot = body.snapshot();

    return {
      position: snapshot.position.map((value) => Number(value.toFixed(6))),
      rotation: snapshot.rotation.map((value) => Number(value.toFixed(6))),
      velocity: snapshot.velocity.map((value) => Number(value.toFixed(6))),
      angularVelocity: snapshot.angularVelocity.map((value) => Number(value.toFixed(6))),
      inverseInertia: snapshot.inverseInertia.map((value) => Number(value.toFixed(6)))
    };
  };

  const first = run();
  assert.deepEqual(run(), first);
  assert.deepEqual(first.position, [0, 0.5, 0]);
  assert.deepEqual(first.velocity, [0, 1, 0]);
  assert.deepEqual(first.angularVelocity, [0, 0.4375, 1.09375]);
  assert.deepEqual(first.inverseInertia, [0.5, 0.25, 0.125]);
  assert.ok(first.rotation[1]! > 0);
  assert.ok(first.rotation[2]! > 0);
  assert.ok(Math.abs(first.rotation.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-5);
});

test("dynamic body falls, collides with static ground, and emits begin then stay", () => {
  const world = new PhysicsWorld({ gravity: [0, -10, 0] });
  const body = world.createRigidBody({ position: [0, 2, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  const ground = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(ground, { shape: Shape.box(10, 0.5, 10) });
  const eventTypes: string[] = [];
  for (let i = 0; i < 90; i += 1) {
    eventTypes.push(...world.step(1 / 60).map((event) => event.type));
  }
  assert.ok(body.position[1] >= 0.49);
  assert.ok(eventTypes.includes("begin"));
  assert.ok(eventTypes.includes("stay"));
});

test("physics emits contact end when overlapping bodies separate", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const bodyA = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(bodyA, { shape: Shape.box(1, 1, 1) });
  const bodyB = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(bodyB, { shape: Shape.box(1, 1, 1) });
  assert.equal(world.step(1 / 60)[0]?.type, "begin");
  bodyA.setPosition([5, 0, 0]);
  assert.equal(world.step(1 / 60).some((event) => event.type === "end"), true);
});

test("settled dynamic bodies sleep deterministically and wake on impulse", () => {
  const world = new PhysicsWorld({
    gravity: [0, -10, 0],
    sleepVelocityThreshold: 0.2,
    sleepDelay: 1 / 30
  });
  const body = world.createRigidBody({ position: [0, 1, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  const ground = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(ground, { shape: Shape.box(10, 0.5, 10) });

  for (let index = 0; index < 90; index += 1) {
    world.step(1 / 60);
  }

  assert.equal(body.sleeping, true);
  assert.equal(world.snapshot().stats.sleepingBodies, 1);
  const sleepingPosition = [...body.position];
  world.step(1 / 60);
  assert.deepEqual(body.position, sleepingPosition);

  body.applyImpulse([2, 0, 0]);
  assert.equal(body.sleeping, false);
  world.step(1 / 60);
  assert.ok(body.position[0] > sleepingPosition[0]);
});

test("physics snapshot reports conservation sanity and stable stacking metrics", () => {
  const energyWorld = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
  const moving = energyWorld.createRigidBody({
    mass: 2,
    inertia: [2, 4, 8],
    velocity: [3, 4, 0],
    angularVelocity: [0, 2, 0]
  });
  energyWorld.createCollider(moving, { shape: Shape.sphere(0.5) });
  const initialEnergy = energyWorld.snapshot().stats.kineticEnergy;
  for (let index = 0; index < 30; index += 1) {
    energyWorld.step(1 / 60);
  }
  assert.equal(Number(initialEnergy.toFixed(6)), 33);
  assert.equal(Number(energyWorld.snapshot().stats.kineticEnergy.toFixed(6)), 33);
  assert.equal(energyWorld.snapshot().stats.maxContactPenetration, 0);

  const stackWorld = new PhysicsWorld({
    gravity: [0, -10, 0],
    solverIterations: 10,
    sleepVelocityThreshold: 0.12,
    sleepDelay: 0.25
  });
  const ground = stackWorld.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  stackWorld.createCollider(ground, { shape: Shape.box(10, 0.5, 10), material: { friction: 0.8 } });
  const boxes = [0, 1, 2].map((index) => {
    const box = stackWorld.createRigidBody({ position: [0, 0.5 + index * 1.05, 0], linearDamping: 0.05, friction: 0.8 });
    stackWorld.createCollider(box, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.8 } });
    return box;
  });
  for (let index = 0; index < 240; index += 1) {
    stackWorld.step(1 / 60);
  }
  const stats = stackWorld.snapshot().stats;
  assert.equal(stats.sleepingBodies, 3);
  assert.ok(stats.maxContactPenetration < 0.02);
  assert.ok(stats.kineticEnergy < 0.001);
  assert.deepEqual(boxes.map((box) => Number(box.position[0].toFixed(4))), [0, 0, 0]);
  assert.ok(boxes[0]!.position[1] >= 0.49);
  assert.ok(boxes[1]!.position[1] > boxes[0]!.position[1] + 0.95);
  assert.ok(boxes[2]!.position[1] > boxes[1]!.position[1] + 0.95);
});

test("collision filters and sensors emit bridgeable events without physical resolution", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const sensorBody = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(sensorBody, { shape: Shape.box(1, 1, 1), sensor: true, filter: { layer: 0b001, mask: 0b010 } });
  const dynamicBody = world.createRigidBody({ position: [0, 0, 0], velocity: [1, 0, 0] });
  world.createCollider(dynamicBody, { shape: Shape.box(1, 1, 1), filter: { layer: 0b010, mask: 0b001 } });
  const events = world.step(1 / 60);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "begin");
  assert.equal(events[0]?.contact.sensor, true);
  assert.ok(dynamicBody.position[0] > 0);

  const ignoredBody = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(ignoredBody, { shape: Shape.box(1, 1, 1), filter: { layer: 0b100, mask: 0b100 } });
  assert.equal(world.step(1 / 60).some((event) => event.contact.bodyA === ignoredBody.id || event.contact.bodyB === ignoredBody.id), false);
});

test("contact friction damps tangential sliding while preserving deterministic support", () => {
  const run = () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 6, enableSleeping: false });
    const box = world.createRigidBody({ position: [0, 0, 0], velocity: [4, 0, 0], friction: 0.8 });
    world.createCollider(box, { shape: Shape.box(0.5, 0.5, 0.5) });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.75, 0], friction: 0.8 });
    world.createCollider(floor, { shape: Shape.box(10, 0.5, 10) });

    for (let index = 0; index < 12; index += 1) {
      world.step(1 / 60);
    }

    return {
      xVelocity: Number(box.velocity[0].toFixed(6)),
      yPosition: Number(box.position[1].toFixed(6))
    };
  };

  const first = run();
  const second = run();
  assert.deepEqual(second, first);
  assert.ok(first.xVelocity < 4);
  assert.ok(first.xVelocity >= 0);
  assert.ok(first.yPosition >= -0.000001);
});

test("collider materials drive restitution and friction during contact resolution", () => {
  const bounceWorld = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
  const ball = bounceWorld.createRigidBody({ position: [0, 0, 0], velocity: [0, -2, 0], friction: 0, restitution: 0 });
  bounceWorld.createCollider(ball, { shape: Shape.box(0.5, 0.5, 0.5), material: { restitution: 1, friction: 0 } });
  const floor = bounceWorld.createRigidBody({ type: "static", position: [0, -0.75, 0], friction: 0, restitution: 0 });
  bounceWorld.createCollider(floor, { shape: Shape.box(10, 0.5, 10), material: { restitution: 1, friction: 0 } });

  bounceWorld.step(1 / 60);
  assert.equal(Number(ball.velocity[1].toFixed(6)), 2);

  const slide = (friction: number) => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 6, enableSleeping: false });
    const box = world.createRigidBody({ position: [0, 0, 0], velocity: [4, 0, 0], friction: 0 });
    world.createCollider(box, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction } });
    const ground = world.createRigidBody({ type: "static", position: [0, -0.75, 0], friction: 0 });
    world.createCollider(ground, { shape: Shape.box(10, 0.5, 10), material: { friction } });
    for (let index = 0; index < 6; index += 1) world.step(1 / 60);
    return Number(box.velocity[0].toFixed(6));
  };

  assert.equal(slide(0), 4);
  assert.ok(slide(1) < 4);
  assert.throws(() => bounceWorld.createCollider(ball, { shape: Shape.sphere(1), material: { friction: Number.NaN } }), /finite/);
});

test("sphere contacts use radial normals and deterministic impulse response", () => {
  const run = () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
    const left = world.createRigidBody({ position: [-0.75, 0, 0], velocity: [1, 0, 0] });
    const right = world.createRigidBody({ position: [0.75, 0, 0], velocity: [-1, 0, 0] });
    world.createCollider(left, { shape: Shape.sphere(1) });
    world.createCollider(right, { shape: Shape.sphere(1) });

    const events = world.step(1 / 60);

    return {
      event: events[0]?.type,
      normal: events[0]?.contact.normal.map((value) => Number(value.toFixed(6))),
      penetration: Number((events[0]?.contact.penetration ?? 0).toFixed(6)),
      positions: [Number(left.position[0].toFixed(6)), Number(right.position[0].toFixed(6))],
      velocities: [Number(left.velocity[0].toFixed(6)), Number(right.velocity[0].toFixed(6))]
    };
  };

  const first = run();
  assert.deepEqual(run(), first);
  assert.equal(first.event, "begin");
  assert.deepEqual(first.normal, [1, 0, 0]);
  assert.equal(first.penetration, 0.533333);
  assert.deepEqual(first.velocities, [0, 0]);
  assert.ok(first.positions[0] < -0.75);
  assert.ok(first.positions[1] > 0.75);
});

test("sphere-box contacts use closest point normals instead of AABB fallback", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
  const box = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(box, { shape: Shape.box(1, 1, 1) });
  const sphere = world.createRigidBody({ position: [1.75, 0, 0], velocity: [-1, 0, 0] });
  world.createCollider(sphere, { shape: Shape.sphere(1) });

  const events = world.step(1 / 60);

  assert.equal(events[0]?.type, "begin");
  assert.deepEqual(events[0]?.contact.normal, [1, 0, 0]);
  assert.equal(Number((events[0]?.contact.penetration ?? 0).toFixed(6)), 0.266667);
  assert.ok(sphere.position[0] > 1.75);
  assert.equal(Number(sphere.velocity[0].toFixed(6)), 0);
});

test("capsule contacts use segment distance for spheres, boxes, and other capsules", () => {
  const runCapsuleSphere = () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
    const capsule = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(capsule, { shape: Shape.capsule(0.5, 1) });
    const sphere = world.createRigidBody({ position: [1.25, 0.5, 0], velocity: [-1, 0, 0] });
    world.createCollider(sphere, { shape: Shape.sphere(1) });
    const events = world.step(1 / 60);
    return {
      type: events[0]?.type,
      normal: events[0]?.contact.normal.map((value) => Number(value.toFixed(6))),
      penetration: Number((events[0]?.contact.penetration ?? 0).toFixed(6)),
      x: Number(sphere.position[0].toFixed(6)),
      velocity: Number(sphere.velocity[0].toFixed(6))
    };
  };
  const capsuleSphere = runCapsuleSphere();
  assert.deepEqual(runCapsuleSphere(), capsuleSphere);
  assert.equal(capsuleSphere.type, "begin");
  assert.deepEqual(capsuleSphere.normal, [1, 0, 0]);
  assert.equal(capsuleSphere.penetration, 0.266667);
  assert.ok(capsuleSphere.x > 1.25);
  assert.equal(capsuleSphere.velocity, 0);

  const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
  const box = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(box, { shape: Shape.box(1, 1, 1) });
  const capsule = world.createRigidBody({ position: [1.4, 0, 0], velocity: [-1, 0, 0] });
  world.createCollider(capsule, { shape: Shape.capsule(0.5, 1) });
  const boxEvents = world.step(1 / 60);
  assert.equal(boxEvents[0]?.type, "begin");
  assert.deepEqual(boxEvents[0]?.contact.normal.map((value) => Number(value.toFixed(6))), [1, 0, 0]);
  assert.equal(Number((boxEvents[0]?.contact.penetration ?? 0).toFixed(6)), 0.116667);
  assert.ok(capsule.position[0] > 1.4);
  assert.ok(Math.abs(capsule.velocity[0]) < 1e-9);

  const capsuleWorld = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 1, enableSleeping: false });
  const left = capsuleWorld.createRigidBody({ position: [-0.45, 0, 0], velocity: [1, 0, 0] });
  const right = capsuleWorld.createRigidBody({ position: [0.45, 0.25, 0], velocity: [-1, 0, 0] });
  capsuleWorld.createCollider(left, { shape: Shape.capsule(0.5, 1) });
  capsuleWorld.createCollider(right, { shape: Shape.capsule(0.5, 1) });
  const capsuleEvents = capsuleWorld.step(1 / 60);
  assert.equal(capsuleEvents[0]?.type, "begin");
  assert.deepEqual(capsuleEvents[0]?.contact.normal.map((value) => Number(value.toFixed(6))), [1, 0, 0]);
  assert.equal(Number((capsuleEvents[0]?.contact.penetration ?? 0).toFixed(6)), 0.133333);
  assert.deepEqual([Number(left.velocity[0].toFixed(6)), Number(right.velocity[0].toFixed(6))], [0, 0]);
});

test("physics emits contact end when a body is removed during contact", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const bodyA = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(bodyA, { shape: Shape.box(1, 1, 1) });
  const bodyB = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(bodyB, { shape: Shape.box(1, 1, 1) });
  assert.equal(world.step(1 / 60)[0].type, "begin");
  world.removeRigidBody(bodyA.id);
  assert.equal(world.drainEvents().some((event) => event.type === "end"), true);
});

test("raycast returns real closest hit and misses filtered rays", () => {
  const world = new PhysicsWorld();
  const body = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const collider = world.createCollider(body, { shape: Shape.sphere(1), filter: { layer: 0b10 } });
  const hit = world.raycast([0, 0, -5], [0, 0, 1], { mask: 0b10 });
  assert.equal(hit?.colliderId, collider.id);
  assert.equal(Number(hit?.distance.toFixed(3)), 4);
  assert.equal(world.raycast([0, 0, -5], [0, 1, 0], { mask: 0b10 }), undefined);
  assert.equal(world.raycast([0, 0, -5], [0, 0, 1], { mask: 0b01 }), undefined);

  const boxBody = world.createRigidBody({ type: "static", position: [5, 0, 0] });
  world.createCollider(boxBody, { shape: Shape.box(1, 1, 1), filter: { layer: 0b100 } });
  const insideBoxHit = world.raycast([5, 0, 0], [0, 1, 0], { mask: 0b100 });
  assert.equal(insideBoxHit?.distance, 0);
  assert.deepEqual(insideBoxHit?.normal, [0, -1, 0]);
});

test("sphere casts sweep moving volumes against colliders without raycast stubs", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const boxBody = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const sphereBody = world.createRigidBody({ type: "static", position: [0, 0, 3] });
  const planeBody = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const boxCollider = world.createCollider(boxBody, { shape: Shape.box(1, 1, 1), filter: { layer: 0b001 } });
  const sphereCollider = world.createCollider(sphereBody, { shape: Shape.sphere(1), filter: { layer: 0b010 } });
  const planeCollider = world.createCollider(planeBody, { shape: Shape.plane([0, 1, 0]), filter: { layer: 0b100 } });

  const boxHit = world.sphereCast([0, 0, -5], 0.5, [0, 0, 1], { mask: 0b001 });
  assert.equal(boxHit?.colliderId, boxCollider.id);
  assert.equal(Number(boxHit?.distance.toFixed(3)), 3.5);
  assert.deepEqual(boxHit?.normal, [0, 0, -1]);
  assert.deepEqual(boxHit?.castCenter.map((value) => Number(value.toFixed(3))), [0, 0, -1.5]);
  assert.deepEqual(boxHit?.point.map((value) => Number(value.toFixed(3))), [0, 0, -1]);

  const sphereHit = world.sphereCast([0, 0, -5], 0.5, [0, 0, 1], { mask: 0b010 });
  assert.equal(sphereHit?.colliderId, sphereCollider.id);
  assert.equal(Number(sphereHit?.distance.toFixed(3)), 6.5);
  assert.deepEqual(sphereHit?.point.map((value) => Number(value.toFixed(3))), [0, 0, 2]);

  const planeHit = world.sphereCast([0, 5, 0], 0.5, [0, -1, 0], { mask: 0b100 });
  assert.equal(planeHit?.colliderId, planeCollider.id);
  assert.equal(Number(planeHit?.distance.toFixed(3)), 4.5);
  assert.deepEqual(planeHit?.point.map((value) => Number(value.toFixed(3))), [0, 0, 0]);

  const initialOverlapBoxHit = world.sphereCast([0, 0, 0], 0.5, [1, 0, 0], { mask: 0b001 });
  assert.equal(initialOverlapBoxHit?.distance, 0);
  assert.deepEqual(initialOverlapBoxHit?.normal, [-1, 0, 0]);
  assert.deepEqual(initialOverlapBoxHit?.castCenter, [0, 0, 0]);

  assert.deepEqual(world.sphereCastAll([0, 0, -5], 0.5, [0, 0, 1], { mask: 0b011 }).map((hit) => hit.colliderId), [boxCollider.id, sphereCollider.id]);
  assert.equal(world.sphereCast([0, 5, 0], 0.5, [0, 1, 0], { mask: 0b100 }), undefined);
  assert.throws(() => world.sphereCast([0, 0, -5], 0, [0, 0, 1]), /finite positive/);
});

test("physics shapes validate capsules, planes, and triangle meshes with finite bounds", () => {
  assert.throws(() => Shape.box(0, 1, 1), /positive/);
  assert.throws(() => Shape.sphere(Number.NaN), /positive/);
  assert.throws(() => Shape.capsule(0.5, 0), /positive/);
  assert.throws(() => Shape.plane([0, 0, 0]), /zero-length/);
  assert.throws(() => Shape.mesh([[0, 0, 0], [1, 0, 0]], [0, 1, 2]), /at least three/);
  assert.throws(() => Shape.mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [0, 1]), /complete triangles/);
  assert.throws(() => Shape.mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [0, 1, 3]), /out of range/);

  const mesh = Shape.mesh([[-1, 0, -2], [2, 1, 0], [0, -1, 3]], [0, 1, 2]);
  assert.deepEqual(Shape.bounds(mesh, [10, 0, 1]), {
    min: [9, -1, -1],
    max: [12, 1, 4]
  });
});

test("mesh raycasts support front faces, optional backfaces, max distance, and closest hit ordering", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const nearBody = world.createRigidBody({ type: "static", position: [0, 0, 2] });
  const farBody = world.createRigidBody({ type: "static", position: [0, 0, 4] });
  const mesh = Shape.mesh([[-1, -1, 0], [1, -1, 0], [0, 1, 0]], [0, 1, 2]);
  const nearCollider = world.createCollider(nearBody, { shape: mesh, filter: { layer: 0b01 } });
  world.createCollider(farBody, { shape: mesh, filter: { layer: 0b01 } });

  const frontHit = world.raycast([0, 0, 3], [0, 0, -1], { mask: 0b01 });
  assert.equal(frontHit?.colliderId, nearCollider.id);
  assert.equal(Number(frontHit?.distance.toFixed(3)), 1);
  assert.deepEqual(frontHit?.normal, [0, 0, 1]);

  assert.equal(world.raycast([0, 0, 0], [0, 0, 1], { mask: 0b01 }), undefined);
  const backfaceHit = world.raycast([0, 0, 0], [0, 0, 1], { mask: 0b01, includeBackfaces: true });
  assert.equal(backfaceHit?.colliderId, nearCollider.id);
  assert.deepEqual(backfaceHit?.normal, [0, 0, -1]);

  assert.equal(world.raycast([0, 0, 3], [0, 0, -1], { mask: 0b01, maxDistance: 0.5 }), undefined);
  assert.deepEqual(world.raycastAll([0, 0, 0], [0, 0, 1], { mask: 0b01, includeBackfaces: true }).map((hit) => Number(hit.distance.toFixed(3))), [2, 4]);
});

test("physics stepper accumulates fixed steps deterministically", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: 0.1 });
  const body = world.createRigidBody({ position: [0, 0, 0], velocity: [1, 0, 0] });
  const stepper = new PhysicsStepper(0.1, 4);
  assert.deepEqual(stepper.advance(0.05, world), { steps: 0, alpha: 0.5, droppedTime: 0 });
  assert.deepEqual(stepper.advance(0.15, world), { steps: 2, alpha: 0, droppedTime: 0 });
  assert.equal(Number(body.position[0].toFixed(3)), 0.2);
});

test("fixed and hinge constraints solve deterministically in world steps", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const anchor = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const follower = world.createRigidBody({ position: [2, 0, 0] });
  const fixed = world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: follower });
  follower.setPosition([5, 0, 0]);
  follower.setVelocity([4, -2, 1]);
  fixed.solve();
  assert.deepEqual(follower.position, [2, 0, 0]);
  assert.deepEqual(follower.velocity.map((value) => Number(value.toFixed(6))), [0, 0, 0]);

  const hingeA = world.createRigidBody({ type: "static", position: [10, 0, 0] });
  const hingeB = world.createRigidBody({ position: [12, 0, 0] });
  const hinge = new Constraint({ type: "hinge", bodyA: hingeA, bodyB: hingeB, localAnchorA: [1, 0, 0], localAnchorB: [-1, 0, 0] });
  hingeB.setPosition([13, 0, 0]);
  hingeB.setVelocity([0, 3, 0]);
  hinge.solve();
  assert.deepEqual(hingeB.position, [12, 0, 0]);
  assert.deepEqual(hingeB.velocity.map((value) => Number(value.toFixed(6))), [0, 0, 0]);

  follower.setPosition([8, 0, 0]);
  world.step(1 / 60);
  assert.equal(Number(follower.position[0].toFixed(6)), 2);
  assert.equal(world.constraints().length, 1);
});

test("slider and spring constraints solve along their configured axes without teleporting static anchors", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 4 });
  const rail = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const sliderBody = world.createRigidBody({ position: [3, 2, -1], velocity: [5, 4, -3] });
  world.createConstraint({ type: "slider", bodyA: rail, bodyB: sliderBody, axis: [1, 0, 0] });
  world.step(1 / 60);
  assert.equal(Number(sliderBody.position[0].toFixed(3)), 3.083);
  assert.equal(Number(sliderBody.position[1].toFixed(6)), 0);
  assert.equal(Number(sliderBody.position[2].toFixed(6)), 0);
  assert.deepEqual(sliderBody.velocity.map((value) => Number(value.toFixed(6))), [5, 0, 0]);
  assert.deepEqual(rail.position, [0, 0, 0]);

  const springBody = world.createRigidBody({ position: [10, 0, 0] });
  const spring = world.createConstraint({ type: "spring", bodyA: rail, bodyB: springBody, restLength: 2, stiffness: 0.5 });
  spring.solve();
  assert.equal(Number(springBody.position[0].toFixed(3)), 6);
});

test("scene and ECS physics bridges sync dynamic and kinematic transforms", () => {
  const world = new PhysicsWorld({ gravity: [0, -10, 0] });
  const dynamicBody = world.createRigidBody({ position: [0, 1, 0] });
  const kinematicBody = world.createRigidBody({ type: "kinematic", position: [0, 0, 0] });
  const sceneNode = { position: [0, 0, 0] as [number, number, number] };
  const platformNode = { position: [3, 4, 5] as [number, number, number] };
  const sceneBridge = new ScenePhysicsBridge();
  sceneBridge.bind({ bodyId: dynamicBody.id, node: sceneNode });
  sceneBridge.bind({ bodyId: kinematicBody.id, node: platformNode, mode: "kinematic" });
  world.step(1 / 60);
  sceneBridge.update(world);
  assert.equal(sceneNode.position[1], dynamicBody.position[1]);
  assert.deepEqual(kinematicBody.position, [3, 4, 5]);

  const ecsTransform = { position: [0, 0, 0] as [number, number, number] };
  const ecsBridge = new ECSPhysicsBridge();
  ecsBridge.bind({ bodyId: dynamicBody.id, transform: ecsTransform });
  ecsBridge.pullDynamic(world);
  assert.deepEqual(ecsTransform.position, dynamicBody.position);
});

test("scene and ECS physics bridges can pull interpolated dynamic transforms", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const body = world.createRigidBody({ position: [0, 0, 0], velocity: [10, 0, 0] });
  world.step(0.1);

  const sceneNode = { position: [0, 0, 0] as [number, number, number] };
  const sceneBridge = new ScenePhysicsBridge();
  sceneBridge.bind({ bodyId: body.id, node: sceneNode });
  sceneBridge.pullDynamic(world, 0.25);
  assert.deepEqual(sceneNode.position, [0.25, 0, 0]);

  const ecsTransform = { position: [0, 0, 0] as [number, number, number] };
  const ecsBridge = new ECSPhysicsBridge();
  ecsBridge.bind({ bodyId: body.id, transform: ecsTransform });
  ecsBridge.pullDynamic(world, 0.75);
  assert.deepEqual(ecsTransform.position, [0.75, 0, 0]);
});

test("physics bridge ordering pushes kinematic transforms before stepping and pulls dynamics after stepping", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const dynamicBody = world.createRigidBody({ position: [0, 0, 0], velocity: [2, 0, 0] });
  const platformBody = world.createRigidBody({ type: "kinematic", position: [0, 0, 0] });
  const dynamicNode = { position: [0, 0, 0] as [number, number, number] };
  const platformNode = { position: [4, 0, 0] as [number, number, number] };
  const bridge = new ScenePhysicsBridge();
  bridge.bind({ bodyId: dynamicBody.id, node: dynamicNode });
  bridge.bind({ bodyId: platformBody.id, node: platformNode, mode: "kinematic" });

  bridge.pushKinematic(world);
  assert.deepEqual(platformBody.position, [4, 0, 0]);
  world.step(0.5);
  assert.deepEqual(dynamicNode.position, [0, 0, 0]);
  bridge.pullDynamic(world);
  assert.deepEqual(dynamicNode.position, [1, 0, 0]);
});

test("physics debug draw and adapter expose stable line counts", () => {
  const world = new PhysicsWorld();
  const body = world.createRigidBody({ type: "static" });
  world.createCollider(body, { shape: Shape.box(1, 1, 1) });
  assert.equal(new PhysicsDebugDraw().buildLines(world).length, 12);
  const snapshot = new PhysicsDebugAdapter().snapshot(world);
  assert.equal(snapshot.bodyCount, 1);
  assert.equal(snapshot.colliderCount, 1);
  assert.equal(snapshot.lines.length, 12);
  const evidence = new PhysicsDebugAdapter().stackEvidence(world);
  assert.equal(evidence.bodyCount, 1);
  assert.equal(evidence.lineCount, 12);
  assert.match(evidence.stableHash, /^[0-9a-f]{8}$/);
});

test("animation track interpolation and mixer update target values", () => {
  const track = new AnimationTrack({
    target: "cube.position",
    valueType: "vector3",
    keyframes: [
      { time: 0, value: [0, 0, 0] },
      { time: 1, value: [2, 0, 0] }
    ]
  });
  assert.deepEqual(track.sample(0.25), [0.5, 0, 0]);
  const clip = new AnimationClip({ name: "move", tracks: [track], events: [{ name: "half", time: 0.5 }] });
  const bridge = new SceneAnimationBridge();
  const node = { position: [0, 0, 0] as [number, number, number] };
  bridge.register("cube", node);
  const mixer = new AnimationMixer(bridge);
  mixer.play(clip);
  const events = mixer.update(0.5);
  assert.deepEqual(node.position, [1, 0, 0]);
  assert.equal(events[0].name, "half");
});

test("animation bridges report missing targets and component removal without losing sampled values", () => {
  const clip = new AnimationClip({
    name: "bridge-missing-targets",
    tracks: [
      new AnimationTrack({
        target: "cube.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [2, 0, 0] }]
      })
    ],
    events: [{ name: "sampled", time: 0.5 }]
  });
  const sceneBridge = new SceneAnimationBridge();
  const sceneMixer = new AnimationMixer(sceneBridge);
  sceneMixer.play(clip);
  const sceneEvents = sceneMixer.update(0.5);
  assert.equal(sceneEvents[0]?.name, "sampled");
  assert.deepEqual(sceneMixer.getValue("cube.position"), [1, 0, 0]);
  assert.deepEqual(sceneMixer.snapshot().applyErrors, [
    { target: "cube.position", message: "Missing scene animation target cube." }
  ]);

  const ecsBridge = new ECSAnimationBridge();
  const component: Record<string, [number, number, number] | undefined> = {};
  ecsBridge.register("cube", component);
  const ecsMixer = new AnimationMixer(ecsBridge);
  ecsMixer.play(clip);
  ecsMixer.update(0.5);
  assert.deepEqual(component.position, [1, 0, 0]);
  assert.deepEqual(ecsMixer.snapshot().applyErrors, []);

  ecsBridge.unregister("cube");
  ecsMixer.update(0.25);
  assert.deepEqual(ecsMixer.getValue("cube.position"), [1.5, 0, 0]);
  assert.deepEqual(component.position, [1, 0, 0]);
  assert.deepEqual(ecsMixer.snapshot().applyErrors, [
    { target: "cube.position", message: "Missing ECS animation target cube." }
  ]);
});

test("animation clip and track serialization round-trip deterministically", () => {
  const clip = new AnimationClip({
    name: "serialize",
    tracks: [
      new AnimationTrack({
        target: "cube.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 0.5, value: [1, 2, 3], interpolation: "linear" }]
      })
    ],
    events: [{ name: "mark", time: 0.25, payload: { frame: 15 } }]
  });
  const serialized = clip.toJSON();
  const restored = AnimationClip.fromJSON(serialized);
  assert.deepEqual(restored.toJSON(), serialized);
  assert.deepEqual(restored.tracks[0]?.sample(0.25), [0.5, 1, 1.5]);
  assert.throws(() => new AnimationTrack({ target: "bad", valueType: "scalar", keyframes: [{ time: 0, value: 0 }, { time: 0, value: 1 }] }), /strictly increasing/);
});

test("animation events fire once when looping across clip end", () => {
  const clip = new AnimationClip({
    name: "loop",
    duration: 1,
    tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] })],
    events: [{ name: "late", time: 0.9 }, { name: "early", time: 0.1 }]
  });
  const mixer = new AnimationMixer();
  const action = mixer.play(clip);
  action.time = 0.85;
  const events = mixer.update(0.3).map((event) => event.name);
  assert.deepEqual(events, ["late", "early"]);
});

test("animation mixer supports ping-pong playback and disposal guards", () => {
  const clip = new AnimationClip({
    name: "pingpong",
    tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] })]
  });
  const values: Record<string, unknown> = {};
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => { values[target] = value; } });
  const action = mixer.play(clip);
  action.loopMode = "pingpong";
  mixer.update(1.25);
  assert.equal(action.time, 0.75);
  assert.equal(values["node.x"], 0.75);
  mixer.update(0.5);
  assert.equal(action.time, 0.25);
  assert.equal(values["node.x"], 0.25);
  mixer.dispose();
  assert.throws(() => mixer.update(0.1), /disposed/);
});

test("animation crossfade blends weighted scalar values", () => {
  const a = new AnimationClip({
    name: "a",
    tracks: [new AnimationTrack({ target: "value.x", valueType: "scalar", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 0 }] })]
  });
  const b = new AnimationClip({
    name: "b",
    tracks: [new AnimationTrack({ target: "value.x", valueType: "scalar", keyframes: [{ time: 0, value: 10 }, { time: 1, value: 10 }] })]
  });
  const values: Record<string, unknown> = {};
  const mixer = new AnimationMixer({ setAnimationValue: (target, value) => { values[target] = value; } });
  const actionA = mixer.play(a);
  const actionB = mixer.play(b).setWeight(0);
  mixer.crossFade(actionA, actionB, 1);
  mixer.update(0.5);
  assert.equal(values["value.x"], 5);
});

test("animation mixer blends numeric-array tracks for morph weights", () => {
  const mixer = new AnimationMixer();
  const low = mixer.play(new AnimationClip({
    name: "low-weights",
    tracks: [new AnimationTrack({ target: "mesh.weights", valueType: "number-array", keyframes: [{ time: 0, value: [0, 1] }] })]
  }));
  const high = mixer.play(new AnimationClip({
    name: "high-weights",
    tracks: [new AnimationTrack({ target: "mesh.weights", valueType: "number-array", keyframes: [{ time: 0, value: [1, 0] }] })]
  }));
  low.setWeight(0.25);
  high.setWeight(0.75);

  mixer.update(0);

  assert.deepEqual(mixer.getValue("mesh.weights"), [0.75, 0.25]);
});

test("scene animation bridge applies morph weight tracks to render targets", () => {
  const bridge = new SceneAnimationBridge();
  const target = {
    weights: [0, 0],
    applied: [] as readonly number[][],
    setWeights(value: readonly number[]) {
      this.weights = [...value];
      this.applied = [...this.applied, [...value]];
    }
  };
  bridge.register("face", target);
  const mixer = new AnimationMixer(bridge);
  mixer.play(new AnimationClip({
    name: "face-morph",
    tracks: [new AnimationTrack({
      target: "face.weights",
      valueType: "number-array",
      keyframes: [
        { time: 0, value: [0, 1] },
        { time: 1, value: [1.2, -0.25] }
      ]
    })]
  }));

  mixer.update(0.5);

  assert.deepEqual(target.weights, [0.6, 0.375]);
  assert.deepEqual(target.applied, [[0.6, 0.375]]);
  assert.deepEqual(mixer.snapshot().applyErrors, []);
});

test("secondary animation fixture exposes bounded foot IK and spring-bone telemetry", () => {
  const fixture = sampleSecondaryAnimationFixture({
    stridePhase: 0.25,
    rootHeight: 1.08,
    velocity: [0.9, 0, 0.22],
    terrainSlope: 0.18,
    deltaSeconds: 1 / 60,
    seed: 0x3d2025
  });
  const repeated = sampleSecondaryAnimationFixture({
    stridePhase: 0.25,
    rootHeight: 1.08,
    velocity: [0.9, 0, 0.22],
    terrainSlope: 0.18,
    deltaSeconds: 1 / 60,
    seed: 0x3d2025
  });

  assert.equal(fixture.source, "origin-master-foot-ik-spring-bone-adapted");
  assert.deepEqual(fixture, repeated);
  assert.equal(fixture.footIk.feet.length, 2);
  assert.equal(fixture.footIk.groundedFeet, 2);
  assert.ok(fixture.footIk.hipOffset < 0);
  assert.ok(fixture.footIk.averageTargetError <= 0.015);
  assert.equal(fixture.springBone.chainName, "ponytail");
  assert.ok(fixture.springBone.boneCount >= 4);
  assert.ok(fixture.springBone.maxDisplacement > 0);
  assert.ok(fixture.springBone.collisionContacts > 0);
  assert.ok(fixture.productionReadiness.footPlacementTelemetry);
  assert.ok(fixture.productionReadiness.hipAdjustmentTelemetry);
  assert.ok(fixture.productionReadiness.springChainTelemetry);
  assert.ok(fixture.productionReadiness.collisionTelemetry);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.ok(fixture.blockedClaims.includes("Unity Animation Rigging parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Control Rig parity"));
  assert.throws(() => sampleSecondaryAnimationFixture({ seed: 1.25 }), /seed/);
});

test("arcade vehicle dynamics exposes bounded speed, nitro, drift, and suspension state", () => {
  const cruise = sampleArcadeVehicleDynamics({
    elapsedSeconds: 2.4,
    throttle: 1,
    steer: 0.35,
    nitro: true,
    maxSpeedKph: 240
  });
  const drifting = sampleArcadeVehicleDynamics({
    elapsedSeconds: 2.4,
    throttle: 1,
    steer: 0.75,
    handbrake: true,
    nitro: false,
    maxSpeedKph: 240
  });

  assert.ok(cruise.speedKph > 70);
  assert.ok(cruise.rpm > 1000);
  assert.ok(cruise.nitro < 100);
  assert.ok(cruise.wheelSpin > 0);
  assert.equal(cruise.suspensionCompression.length, 4);
  assert.ok(drifting.driftSlip > cruise.driftSlip);
  assert.ok(drifting.grip < cruise.grip);
  assert.ok(drifting.suspensionCompression[1] > drifting.suspensionCompression[0]);
  assert.throws(() => sampleArcadeVehicleDynamics({ elapsedSeconds: -1 }), /elapsedSeconds/);
});

test("pacejka tire model exposes combined slip forces and aligning torque", () => {
  const straight = samplePacejkaTireForces({
    longitudinalVelocity: 34,
    lateralVelocity: 0,
    angularVelocity: 112,
    normalForce: 4200,
    longitudinal: "sport",
    lateral: "sport"
  });
  const cornering = samplePacejkaTireForces({
    longitudinalVelocity: 34,
    lateralVelocity: 5.2,
    angularVelocity: 122,
    normalForce: 4200,
    steeringAngle: 0.14,
    camberAngle: -0.03,
    longitudinal: "racing",
    lateral: "racing"
  });

  assert.equal(straight.preset.longitudinal, "sport");
  assert.equal(cornering.preset.lateral, "racing");
  assert.ok(straight.combinedForce > 0);
  assert.ok(cornering.combinedForce > straight.combinedForce);
  assert.ok(Math.abs(cornering.slipAngle) > Math.abs(straight.slipAngle));
  assert.ok(Math.abs(cornering.aligningTorque) > 0);
  assert.ok(cornering.optimalSlipRatio > 0);
  assert.ok(cornering.optimalSlipAngle > 0);
  assert.deepEqual(samplePacejkaTireForces({ longitudinalVelocity: 10, angularVelocity: 30, normalForce: 0 }).combinedForce, 0);
  assert.throws(() => samplePacejkaTireForces({ longitudinalVelocity: 10, angularVelocity: 30, normalForce: -1 }), /normalForce/);
});

test("vehicle drivetrain samples engine torque, gear selection, differential split, and aero loads", () => {
  const launch = sampleVehicleDrivetrain({
    speedKph: 72,
    throttle: 0.92,
    clutch: 1,
    differential: "limited-slip",
    frontRearSplit: 0.42,
    lockingFactor: 0.48,
    peakTorque: 460,
    peakTorqueRpm: 4200,
    maxRpm: 7600,
    finalDriveRatio: 3.73,
    dragCoefficient: 0.31,
    frontalArea: 2.05,
    downforceCoefficient: 0.82
  });
  const fast = sampleVehicleDrivetrain({
    speedKph: 192,
    throttle: 0.86,
    differential: "electronic",
    frontRearSplit: 0.45,
    lockingFactor: 0.7,
    peakTorque: 460,
    peakTorqueRpm: 4200,
    maxRpm: 7600,
    finalDriveRatio: 3.73,
    dragCoefficient: 0.31,
    frontalArea: 2.05,
    downforceCoefficient: 0.82
  });

  assert.equal(launch.differential, "limited-slip");
  assert.ok(launch.gear >= 1);
  assert.ok(launch.engineRpm >= 950);
  assert.ok(launch.engineTorque > 0);
  assert.ok(launch.wheelTorque > launch.engineTorque);
  assert.ok(launch.frontTorque > 0);
  assert.ok(launch.rearTorque > launch.frontTorque);
  assert.equal(Number((launch.frontTorque + launch.rearTorque).toFixed(3)), launch.wheelTorque);
  assert.ok(launch.dragForce > 0);
  assert.ok(launch.downforce > launch.dragForce);
  assert.ok(["hold", "upshift", "downshift"].includes(launch.shiftState));
  assert.ok(fast.gear >= launch.gear);
  assert.ok(fast.dragForce > launch.dragForce);
  assert.ok(fast.downforce > launch.downforce);
  assert.throws(() => sampleVehicleDrivetrain({ speedKph: -1 }), /speedKph/);
  assert.throws(() => sampleVehicleDrivetrain({ speedKph: 10, gearRatios: [] }), /gearRatios/);
});

test("vehicle effect emitters expose bounded smoke and nitro flame rates", () => {
  const drift = sampleVehicleEffectEmitters({
    speedKph: 88,
    throttle: 0.72,
    steer: 0.84,
    handbrake: false,
    nitroActive: true,
    wheelOnGround: [true, true, true, false]
  });
  const idle = sampleVehicleEffectEmitters({
    speedKph: 44,
    throttle: 0.2,
    steer: 0.1,
    nitroActive: false
  });

  assert.equal(drift.smokeReason, "high-speed-steer");
  assert.equal(drift.tireSmokeRates.length, 4);
  assert.ok(drift.tireSmokeRates[0] > 0);
  assert.ok(drift.tireSmokeRates[2] > drift.tireSmokeRates[0]);
  assert.equal(drift.tireSmokeRates[3], 0);
  assert.ok(drift.totalTireSmokeRate > 0);
  assert.ok(drift.nitroFlameRate > 0);
  assert.equal(drift.visibleEffectEmitters, 4);
  assert.equal(idle.totalTireSmokeRate, 0);
  assert.equal(idle.nitroFlameRate, 0);
  assert.equal(idle.visibleEffectEmitters, 0);
  assert.throws(() => sampleVehicleEffectEmitters({ speedKph: -1 }), /speedKph/);
});

test("vehicle damage samples bounded impact health and visual damage levels", () => {
  const scratched = sampleVehicleDamage({
    health: 100,
    impactSpeedKph: 44,
    collisionSeverity: 0.42
  });
  const critical = sampleVehicleDamage({
    health: 26,
    impactSpeedKph: 138,
    collisionSeverity: 0.95
  });
  const repaired = sampleVehicleDamage({
    health: 52,
    repair: 24
  });

  assert.ok(scratched.health < 100);
  assert.ok(scratched.damage > 0);
  assert.ok(scratched.impactDamage > 0);
  assert.equal(scratched.visualDamageLevel, "scratched");
  assert.equal(critical.visualDamageLevel, "critical");
  assert.equal(critical.disabled, true);
  assert.equal(repaired.health, 76);
  assert.equal(repaired.damage, 24);
  assert.equal(repaired.impactDamage, 0);
  assert.throws(() => sampleVehicleDamage({ health: -1 }), /health/);
});

test("racing ai driver samples path following, overtaking, and rubberband controls", () => {
  const medium = sampleRacingAiDriver({
    difficulty: "medium",
    elapsedSeconds: 1.2,
    progress: 0.42,
    speedKph: 132,
    targetSpeedKph: 220,
    trackCurvature: 0.28,
    opponentAhead: true,
    opponentDistance: 12,
    playerGapSeconds: -1.4
  });
  const hard = sampleRacingAiDriver({
    difficulty: "hard",
    elapsedSeconds: 1.2,
    progress: 0.42,
    speedKph: 132,
    targetSpeedKph: 220,
    trackCurvature: 0.28,
    opponentAhead: true,
    opponentDistance: 12,
    playerGapSeconds: -1.4
  });

  assert.equal(medium.difficulty, "medium");
  assert.equal(medium.overtaking, true);
  assert.ok(medium.throttle > 0);
  assert.ok(medium.lookaheadDistance > 0);
  assert.ok(medium.rubberbandBoost > 0);
  assert.ok(Math.abs(medium.steer) > 0);
  assert.ok(hard.targetSpeedKph > medium.targetSpeedKph);
  assert.ok(hard.aggressiveness > medium.aggressiveness);
  assert.throws(() => sampleRacingAiDriver({ elapsedSeconds: -1, progress: 0, speedKph: 0 }), /elapsedSeconds/);
});

test("two-bone IK reaches reachable targets while preserving segment lengths", () => {
  const result = solveTwoBoneIk({
    root: [0, 0, 0],
    mid: [0, 1, 0],
    end: [0, 2, 0],
    target: [1.2, 0.8, 0],
    pole: [0, 0, 1]
  });

  assert.equal(result.reached, true);
  assert.equal(result.stretched, false);
  assert.ok(result.endDistanceToTarget < 1e-3);
  assert.equal(Number(distance3(result.root, result.mid).toFixed(6)), 1);
  assert.equal(Number(distance3(result.mid, result.end).toFixed(6)), 1);
  assert.ok(result.mid[2] > 0);
  assert.ok(result.poleInfluence > 0);
});

test("two-bone IK clamps unreachable targets unless stretching is enabled", () => {
  const clamped = solveTwoBoneIk({
    root: [0, 0, 0],
    mid: [0, 1, 0],
    end: [0, 2, 0],
    target: [4, 0, 0],
    pole: [0, 0, 1]
  });
  const stretched = solveTwoBoneIk({
    root: [0, 0, 0],
    mid: [0, 1, 0],
    end: [0, 2, 0],
    target: [4, 0, 0],
    pole: [0, 0, 1],
    allowStretch: true
  });

  assert.equal(clamped.reached, false);
  assert.equal(clamped.stretched, false);
  assert.ok(clamped.endDistanceToTarget > 1.9);
  assert.equal(stretched.reached, true);
  assert.equal(stretched.stretched, true);
  assert.ok(stretched.endDistanceToTarget < 1e-3);
});

test("two-bone IK respects blend weight", () => {
  const result = solveTwoBoneIk({
    root: [0, 0, 0],
    mid: [0, 1, 0],
    end: [0, 2, 0],
    target: [1, 1, 0],
    pole: [0, 0, 1],
    weight: 0.5
  });

  assert.equal(result.end[0], 0.5);
  assert.equal(result.end[1], 1.5);
  assert.equal(result.reached, false);
});

test("animation layers apply stable weights and expose target masks", () => {
  const clip = new AnimationClip({
    name: "upper-body",
    tracks: [new AnimationTrack({ target: "spine.rotation", valueType: "quaternion", keyframes: [{ time: 0, value: [0, 0, 0, 1] }] })]
  });
  const action = new AnimationMixer().play(clip).setWeight(0.8);
  const layer = new AnimationLayer("upper", { weight: 0.5, additive: true, mask: ["spine", "arm.left"] });
  layer.add(action);

  layer.applyWeight();
  layer.applyWeight();

  assert.equal(action.weight, 0.4);
  assert.equal(layer.capturesTarget("spine.rotation"), true);
  assert.equal(layer.capturesTarget("arm.right.rotation"), false);
  assert.deepEqual(layer.snapshot(), {
    name: "upper",
    weight: 0.5,
    additive: true,
    mask: ["spine", "arm.left"],
    actions: ["upper-body"]
  });
});

test("animation mixer applies layer masks and weights during sampling", () => {
  const mixer = new AnimationMixer();
  const base = mixer.play(new AnimationClip({
    name: "base",
    tracks: [
      new AnimationTrack({ target: "spine.x", valueType: "scalar", keyframes: [{ time: 0, value: 10 }] }),
      new AnimationTrack({ target: "leg.x", valueType: "scalar", keyframes: [{ time: 0, value: 10 }] })
    ]
  }));
  const override = mixer.play(new AnimationClip({
    name: "override",
    tracks: [
      new AnimationTrack({ target: "spine.x", valueType: "scalar", keyframes: [{ time: 0, value: 20 }] }),
      new AnimationTrack({ target: "leg.x", valueType: "scalar", keyframes: [{ time: 0, value: 20 }] })
    ]
  }));
  const upper = new AnimationLayer("upper", { weight: 1, mask: ["spine"] });
  upper.add(override);
  mixer.addLayer(upper);
  base.setWeight(1);
  override.setWeight(1);

  mixer.update(0);

  assert.equal(mixer.getValue("spine.x"), 15);
  assert.equal(mixer.getValue("leg.x"), 10);
  assert.equal(mixer.snapshot().layers[0]?.name, "upper");
});

test("animation mixer composes additive layer offsets over the blended base pose", () => {
  const mixer = new AnimationMixer();
  const base = mixer.play(new AnimationClip({
    name: "base-pose",
    tracks: [
      new AnimationTrack({ target: "spine.x", valueType: "scalar", keyframes: [{ time: 0, value: 10 }] }),
      new AnimationTrack({ target: "spine.position", valueType: "vector3", keyframes: [{ time: 0, value: [1, 2, 3] }] }),
      new AnimationTrack({ target: "face.weights", valueType: "number-array", keyframes: [{ time: 0, value: [0.2, 0.3] }] }),
      new AnimationTrack({ target: "spine.rotation", valueType: "quaternion", keyframes: [{ time: 0, value: [0, 0, 0, 1] }] })
    ]
  }));
  const additive = mixer.play(new AnimationClip({
    name: "upper-additive",
    tracks: [
      new AnimationTrack({ target: "spine.x", valueType: "scalar", keyframes: [{ time: 0, value: 2 }] }),
      new AnimationTrack({ target: "spine.position", valueType: "vector3", keyframes: [{ time: 0, value: [0, 2, -2] }] }),
      new AnimationTrack({ target: "face.weights", valueType: "number-array", keyframes: [{ time: 0, value: [0.2, -0.1] }] }),
      new AnimationTrack({ target: "spine.rotation", valueType: "quaternion", keyframes: [{ time: 0, value: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }] })
    ]
  }));
  const layer = new AnimationLayer("upper-add", { additive: true, weight: 0.5, mask: ["spine", "face"] });
  layer.add(additive);
  mixer.addLayer(layer);
  base.setWeight(1);
  additive.setWeight(1);

  mixer.update(0);

  assert.equal(mixer.getValue("spine.x"), 11);
  assert.deepEqual(mixer.getValue("spine.position"), [1, 3, 2]);
  assert.deepEqual(mixer.getValue("face.weights"), [0.30000000000000004, 0.25]);
  assert.deepEqual((mixer.getValue("spine.rotation") as readonly number[]).map((value) => Number(value.toFixed(6))), [0, 0, 0.382683, 0.92388]);
});

test("animation root motion extracts deterministic vector deltas and applies them to runtime targets", () => {
  const clip = new AnimationClip({
    name: "rootMove",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 2] }]
      })
    ]
  });

  const sample = extractRootMotion(clip, { fromTime: 0.25, toTime: 0.75 });
  assert.deepEqual(sample.delta, [2, 0, 1]);

  const target = { position: [10, 0, -2] as [number, number, number] };
  applyRootMotion(target, sample);
  assert.deepEqual(target.position, [12, 0, -1]);
});

test("animation root motion preserves loop-wrap displacement across clip boundaries", () => {
  const clip = new AnimationClip({
    name: "loopRootMove",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 0] }]
      })
    ]
  });

  assert.deepEqual(extractRootMotion(clip, { fromTime: 0.75, toTime: 0.25, loop: true }).delta, [2, 0, 0]);
  assert.deepEqual(extractRootMotion(clip, { fromTime: 0.75, toTime: 2.25, loop: true }).delta, [6, 0, 0]);

  const scalarClip = new AnimationClip({
    name: "badRootMove",
    tracks: [new AnimationTrack({ target: "root.position", valueType: "scalar", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] })]
  });
  assert.throws(() => extractRootMotion(scalarClip, { fromTime: 0, toTime: 1 }), /must be a vector3/);
  assert.throws(() => extractRootMotion(clip, { target: "hips.position", fromTime: 0, toTime: 1 }), /was not found/);
});

test("animation mixer applies root motion during normal action advancement", () => {
  const clip = new AnimationClip({
    name: "runtimeRootMove",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 0] }]
      })
    ]
  });
  const samples: unknown[] = [];
  const target = {
    position: [10, 0, 0] as [number, number, number],
    applyRootMotion(sample: unknown) {
      samples.push(sample);
    }
  };
  const mixer = new AnimationMixer(target, { applyRootMotion: true });
  const action = mixer.play(clip);

  mixer.update(0.25);
  assert.deepEqual(target.position, [11, 0, 0]);
  assert.equal(samples.length, 1);

  action.time = 0.75;
  mixer.update(0.5);
  assert.deepEqual(target.position, [13, 0, 0]);
});

test("skeleton palette handles a simple two-bone hierarchy", () => {
  const skeleton = new Skeleton([
    new Bone({ name: "root", parentIndex: -1, translation: [1, 0, 0] }),
    new Bone({ name: "child", parentIndex: 0, translation: [0, 2, 0] })
  ]);
  const worlds = skeleton.worldMatrices();
  assert.equal(worlds[1][12], 1);
  assert.equal(worlds[1][13], 2);
  const palette = buildSkinningPalette(skeleton);
  assert.equal(palette.jointCount, 2);
  assert.equal(palette.matrices.length, 32);
  assert.throws(() => new Skeleton([{ name: "bad", parentIndex: 1 }]), /invalid parent/);
  assert.throws(() => buildSkinningPalette(skeleton, 1), /exceeding max/);
});

test("state machine and blend tree are deterministic", () => {
  const machine = new AnimationStateMachine([
    { name: "idle", transitions: [{ to: "run", priority: 1, condition: (params) => params.speed === 1 }] },
    { name: "run" }
  ], "idle");
  machine.setParameter("speed", 1);
  assert.equal(machine.update(), "run");
  const tree = new BlendTree1D([{ value: "walk", threshold: 0 }, { value: "run", threshold: 1 }]);
  assert.deepEqual(tree.weights(0.25), [{ value: "walk", weight: 0.75 }, { value: "run", weight: 0.25 }]);
});

test("state machine respects exit time and resets state time after transitions", () => {
  const machine = new AnimationStateMachine([
    { name: "idle", transitions: [{ to: "turn", priority: 1, exitTime: 0.5, condition: (params) => params.turn === true }] },
    { name: "turn", transitions: [{ to: "idle", priority: 1, exitTime: 0.25, condition: (params) => params.turn === false }] }
  ], "idle");

  machine.setParameter("turn", true);
  assert.equal(machine.update(0.25), "idle");
  assert.equal(machine.stateTime, 0.25);
  assert.equal(machine.update(0.25), "turn");
  assert.equal(machine.stateTime, 0);

  machine.setParameter("turn", false);
  assert.equal(machine.update(0.1), "turn");
  assert.equal(machine.update(0.15), "idle");
  assert.equal(machine.stateTime, 0);
});

test("state machine exposes deterministic graph debug output without evaluating transitions", () => {
  let evaluated = 0;
  const machine = new AnimationStateMachine([
    {
      name: "idle",
      transitions: [
        { to: "walk", label: "speed > 0", priority: 2, condition: () => { evaluated += 1; return false; } },
        { to: "jump", label: "jump pressed", priority: 1, exitTime: 0.25, condition: () => { evaluated += 1; return false; } }
      ]
    },
    { name: "walk", transitions: [{ to: "idle", label: "speed = 0", condition: () => { evaluated += 1; return false; } }] },
    { name: "jump" }
  ], "idle");
  machine.setParameter("speed", 0);
  machine.update(0.125);

  const snapshot = machine.graphSnapshot();
  assert.equal(evaluated, 2);
  assert.deepEqual(snapshot.states, [
    { name: "idle", current: true, transitionCount: 2 },
    { name: "walk", current: false, transitionCount: 1 },
    { name: "jump", current: false, transitionCount: 0 }
  ]);
  assert.deepEqual(snapshot.transitions, [
    { from: "idle", to: "walk", index: 0, priority: 2, label: "speed > 0" },
    { from: "idle", to: "jump", index: 1, priority: 1, label: "jump pressed", exitTime: 0.25 },
    { from: "walk", to: "idle", index: 0, priority: 0, label: "speed = 0" }
  ]);
  assert.equal(snapshot.parameters.speed, 0);
  assert.equal(machine.debugGraph(), [
    "AnimationStateMachine current=idle time=0.125",
    "state idle * transitions=2",
    "  -> walk priority=2 label=speed > 0",
    "  -> jump priority=1 exit=0.25 label=jump pressed",
    "state walk transitions=1",
    "  -> idle priority=0 label=speed = 0",
    "state jump transitions=0"
  ].join("\n"));
  assert.equal(evaluated, 2);
});

test("platformer fixture ports old controller camera and level telemetry with bounded claims", () => {
  const fixture = samplePlatformerControllerFixture({ seed: 0x3d2025, elapsedSeconds: 0.32 });
  const repeat = samplePlatformerControllerFixture({ seed: 0x3d2025, elapsedSeconds: 0.32 });
  const shifted = samplePlatformerControllerFixture({ seed: 0x3d2026, elapsedSeconds: 0.32 });

  assert.equal(fixture.id, "external-parity-old-branch-platformer-controller-fixture");
  assert.equal(fixture.source, "origin-master-platformer-controller-adapted");
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.deepEqual(fixture.config, {
    walkSpeed: 5,
    runSpeed: 8,
    jumpForce: 12,
    doubleJumpForce: 10,
    wallJumpForce: 14,
    airControl: 0.3,
    coyoteTimeSeconds: 0.15,
    jumpBufferSeconds: 0.1,
    maxFallSpeed: 30
  });
  assert.equal(fixture.controller.coyoteJumpAccepted, true);
  assert.equal(fixture.controller.bufferedJumpAccepted, true);
  assert.equal(fixture.controller.doubleJumpAccepted, true);
  assert.equal(fixture.controller.wallJumpAccepted, true);
  assert.equal(fixture.controller.stateSequence[0], "idle");
  assert.ok(fixture.controller.stateSequence.includes("walk") || fixture.controller.stateSequence.includes("run"));
  assert.ok(fixture.controller.stateSequence.includes("jump"));
  assert.ok(fixture.controller.stateSequence.includes("doubleJump"));
  assert.ok(fixture.controller.stateSequence.includes("wallSlide"));
  assert.equal(fixture.controller.stateSequence.at(-1), "land");
  assert.equal(fixture.controller.finalState, "land");
  assert.equal(fixture.camera.distance, 8);
  assert.equal(fixture.camera.minDistance, 3);
  assert.equal(fixture.camera.maxDistance, 15);
  assert.equal(fixture.camera.lockOnSupported, true);
  assert.ok(fixture.camera.collisionAdjustedDistance < fixture.camera.distance);
  assert.deepEqual(fixture.level.platformSummaries.map((entry) => entry.kind), ["static", "moving", "rotating", "falling", "bouncy", "disappearing"]);
  assert.equal(fixture.level.totalPlatforms, 14);
  assert.equal(fixture.level.totalCollectibles, 8);
  assert.equal(fixture.level.totalScoreValue, 2500);
  assert.equal(fixture.level.checkpointCount, 2);
  assert.equal(fixture.level.movingPlatformPathCount, 2);
  assert.ok(fixture.level.goalDistance > 56);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /not a full character controller replacement/);
  assert.throws(() => samplePlatformerControllerFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => samplePlatformerControllerFixture({ elapsedSeconds: Number.NaN }), /elapsedSeconds/);
});

test("cloth fixture ports old PBD collision tearing and material telemetry with bounded claims", () => {
  const fixture = sampleClothSimulationFixture({ seed: 0x3d2025, elapsedSeconds: 0.4, segmentsX: 12, segmentsY: 8 });
  const repeat = sampleClothSimulationFixture({ seed: 0x3d2025, elapsedSeconds: 0.4, segmentsX: 12, segmentsY: 8 });
  const shifted = sampleClothSimulationFixture({ seed: 0x3d2026, elapsedSeconds: 0.4, segmentsX: 12, segmentsY: 8 });

  assert.equal(fixture.id, "external-parity-old-branch-cloth-simulation-fixture");
  assert.equal(fixture.source, "origin-master-cloth-pbd-material-adapted");
  assert.deepEqual(fixture.sourceFiles, [
    "origin/master:src/simulation/cloth/ClothSimulation.ts",
    "origin/master:src/simulation/cloth/ClothCollisionSystem.ts",
    "origin/master:src/simulation/cloth/ClothTearingSystem.ts",
    "origin/master:src/materials/ClothMaterial.ts"
  ]);
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.equal(fixture.config.width, 2.4);
  assert.equal(fixture.config.height, 1.5);
  assert.equal(fixture.mesh.particleCount, 117);
  assert.equal(fixture.mesh.triangleCount, 192);
  assert.equal(fixture.mesh.indexCount, 576);
  assert.equal(fixture.mesh.pinnedCount, 13);
  assert.equal(fixture.mesh.pinnedPattern, "top-edge");
  assert.equal(fixture.mesh.sampleParticles.length, 9);
  assert.equal(fixture.mesh.sampleParticles.filter((particle) => particle.pinned).length, 3);
  assert.equal(fixture.constraints.structural, 212);
  assert.equal(fixture.constraints.shear, 192);
  assert.equal(fixture.constraints.bending, 190);
  assert.equal(fixture.constraints.total, 594);
  assert.ok(fixture.constraints.maxStrain > 1);
  assert.ok(fixture.constraints.tearCandidates > 0);
  assert.ok(fixture.constraints.cutPlaneConstraintCandidates > 0);
  assert.ok(fixture.wind.maxOffset > 0);
  assert.ok(fixture.wind.affectedParticles > fixture.mesh.pinnedCount);
  assert.equal(fixture.collision.shape, "sphere");
  assert.ok(fixture.collision.penetrationCount > 0);
  assert.equal(fixture.collision.resolvedParticles, fixture.collision.penetrationCount);
  assert.ok(fixture.collision.maxPenetration > 0);
  assert.equal(fixture.material.preset, "coarse-wool-flag");
  assert.ok(fixture.material.sheenIntensity > 0);
  assert.ok(fixture.material.anisotropyStrength > 0);
  assert.ok(fixture.material.fuzzIntensity > 0);
  assert.ok(fixture.blockedClaims.includes("Unity Cloth parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Chaos Cloth parity"));
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim GPU cloth/);
  assert.throws(() => sampleClothSimulationFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => sampleClothSimulationFixture({ elapsedSeconds: Number.NaN }), /elapsedSeconds/);
  assert.throws(() => sampleClothSimulationFixture({ segmentsX: 1 }), /segmentsX/);
});

test("soft-body fixture ports old tetrahedral PBD telemetry with bounded claims", () => {
  const fixture = sampleSoftBodyFixture({ seed: 0x50fb0d, elapsedSeconds: 0.36, divisions: 2 });
  const repeat = sampleSoftBodyFixture({ seed: 0x50fb0d, elapsedSeconds: 0.36, divisions: 2 });
  const shifted = sampleSoftBodyFixture({ seed: 0x50fb0e, elapsedSeconds: 0.36, divisions: 2 });

  assert.equal(fixture.id, "external-parity-old-branch-soft-body-fixture");
  assert.equal(fixture.source, "origin-master-softbody-tet-pbd-adapted");
  assert.deepEqual(fixture.sourceFiles, [
    "origin/master:src/simulation/softbody/SoftBody.ts",
    "origin/master:src/simulation/softbody/SoftBodySolver.ts",
    "origin/master:src/simulation/softbody/TetMeshGenerator.ts"
  ]);
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.equal(fixture.config.method, "bounded-pbd-telemetry");
  assert.equal(fixture.config.materialModel, "bounded-corotated-reference");
  assert.equal(fixture.config.divisions, 2);
  assert.equal(fixture.config.solverIterations, 5);
  assert.equal(fixture.mesh.vertexCount, 27);
  assert.equal(fixture.mesh.tetrahedronCount, 40);
  assert.equal(fixture.mesh.surfaceTriangleEstimate, 48);
  assert.ok(fixture.mesh.distanceConstraintCount > 40);
  assert.equal(fixture.mesh.attachmentCount, 4);
  assert.ok(fixture.mesh.sampleVertices.length >= 8);
  assert.ok(fixture.mesh.sampleVertices.some((vertex) => vertex.attached));
  assert.ok(fixture.deformation.maxDisplacement > 0);
  assert.ok(fixture.deformation.averageDisplacement > 0);
  assert.ok(fixture.deformation.restVolume > 0);
  assert.ok(fixture.deformation.currentVolume > 0);
  assert.ok(fixture.deformation.volumeRatio > 0.65);
  assert.ok(fixture.deformation.volumeRatio < 1.15);
  assert.ok(fixture.deformation.shapeMatchingError > 0);
  assert.equal(fixture.collision.groundPlaneY, -0.42);
  assert.ok(fixture.collision.contactVertices > 0);
  assert.equal(fixture.collision.resolvedVertices, fixture.collision.contactVertices);
  assert.ok(fixture.collision.maxPenetrationBeforeResolve > 0);
  assert.equal(fixture.attachments.rigidAttachmentCount, 4);
  assert.equal(fixture.attachments.maxAttachmentError, 0);
  assert.equal(fixture.attachments.averageAttachmentError, 0);
  assert.ok(fixture.blockedClaims.includes("production tetrahedral FEM solver parity"));
  assert.ok(fixture.blockedClaims.includes("Unity soft-body asset parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Chaos soft-body parity"));
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim a production FEM solver/);
  assert.throws(() => sampleSoftBodyFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => sampleSoftBodyFixture({ elapsedSeconds: Number.NaN }), /elapsedSeconds/);
  assert.throws(() => sampleSoftBodyFixture({ divisions: 0 }), /divisions/);
});

test("fracture fixture ports old Voronoi and hierarchical destruction telemetry with bounded claims", () => {
  const fixture = sampleFractureFixture({ seed: 0xf24c7, fragmentCount: 18, impactStrength: 82 });
  const repeat = sampleFractureFixture({ seed: 0xf24c7, fragmentCount: 18, impactStrength: 82 });
  const shifted = sampleFractureFixture({ seed: 0xf24c8, fragmentCount: 18, impactStrength: 82 });

  assert.equal(fixture.id, "external-parity-old-branch-fracture-fixture");
  assert.equal(fixture.source, "origin-master-voronoi-hierarchical-fracture-adapted");
  assert.deepEqual(fixture.sourceFiles, [
    "origin/master:src/simulation/fracture/VoronoiFractureSystem.ts",
    "origin/master:src/simulation/fracture/HierarchicalFractureSystem.ts",
    "origin/master:src/simulation/fracture/GeometryClipper.ts",
    "origin/master:src/simulation/fracture/VoronoiMath.ts"
  ]);
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.equal(fixture.config.requestedFragments, 18);
  assert.equal(fixture.config.density, 2350);
  assert.equal(fixture.config.interiorFaces, true);
  assert.equal(fixture.config.progressiveDamage, true);
  assert.equal(fixture.voronoi.siteCount, 18);
  assert.equal(fixture.voronoi.radialSiteCount, 18);
  assert.ok(fixture.voronoi.averageSiteDistance > 0);
  assert.ok(fixture.voronoi.maxSiteDistance >= fixture.voronoi.averageSiteDistance);
  assert.ok(fixture.voronoi.neighborPairs > 0);
  assert.ok(fixture.voronoi.crackGraphEdges >= fixture.voronoi.neighborPairs);
  assert.equal(fixture.fragments.fragmentCount, 18);
  assert.ok(fixture.fragments.totalMass > 0);
  assert.ok(fixture.fragments.totalVolume > 0);
  assert.ok(fixture.fragments.maxMass > fixture.fragments.minMass);
  assert.ok(fixture.fragments.interiorFaceEstimate > fixture.fragments.fragmentCount);
  assert.ok(fixture.fragments.activeAfterImpact > 0);
  assert.equal(fixture.fragments.samples.length, 6);
  assert.ok(fixture.fragments.samples.every((fragment) => fragment.mass > 0 && fragment.volume > 0));
  assert.ok(fixture.fragments.samples.some((fragment) => fragment.neighborCount > 0));
  assert.equal(fixture.hierarchy.maxDepth, 3);
  assert.ok(fixture.hierarchy.nodeCount > fixture.fragments.fragmentCount);
  assert.ok(fixture.hierarchy.rootDamage > 0);
  assert.ok(fixture.hierarchy.activatedChildren > 0);
  assert.ok(fixture.hierarchy.residualInactiveChildren >= 0);
  assert.ok(fixture.blockedClaims.includes("runtime convex mesh clipping"));
  assert.ok(fixture.blockedClaims.includes("Unity destruction workflow parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Chaos destruction parity"));
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim runtime convex mesh clipping/);
  assert.throws(() => sampleFractureFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => sampleFractureFixture({ fragmentCount: 3 }), /fragmentCount/);
  assert.throws(() => sampleFractureFixture({ impactStrength: 0 }), /impactStrength/);
});

test("fluid fixture ports old SPH MPM and screen-space telemetry with bounded claims", () => {
  const fixture = sampleFluidFixture({ seed: 0xf10d, particleGrid: [4, 3, 3], elapsedSeconds: 0.42 });
  const repeat = sampleFluidFixture({ seed: 0xf10d, particleGrid: [4, 3, 3], elapsedSeconds: 0.42 });
  const shifted = sampleFluidFixture({ seed: 0xf10e, particleGrid: [4, 3, 3], elapsedSeconds: 0.42 });

  assert.equal(fixture.id, "external-parity-old-branch-fluid-fixture");
  assert.equal(fixture.source, "origin-master-sph-mpm-fluid-adapted");
  assert.deepEqual(fixture.sourceFiles, [
    "origin/master:src/simulation/sph/SPHFluidFramework.ts",
    "origin/master:src/simulation/sph/FluidRenderer.ts",
    "origin/master:src/simulation/mpm/MPMFluidSimulation.ts",
    "origin/master:src/simulation/mpm/ParticleBuffer.ts"
  ]);
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.equal(fixture.config.solver, "bounded-sph-pcisph-dfsph-telemetry");
  assert.equal(fixture.config.restDensity, 1000);
  assert.equal(fixture.config.pcisphIterations, 3);
  assert.equal(fixture.config.dfsphIterations, 5);
  assert.equal(fixture.sph.particleCount, 36);
  assert.equal(fixture.sph.capacity, 128);
  assert.ok(fixture.sph.averageDensity >= fixture.config.restDensity);
  assert.ok(fixture.sph.maxDensity >= fixture.sph.averageDensity);
  assert.ok(fixture.sph.maxPressure >= fixture.sph.averagePressure);
  assert.ok(fixture.sph.neighborPairs > 0);
  assert.ok(fixture.sph.maxNeighborCount > 0);
  assert.ok(fixture.sph.viscosityForceEstimate > 0);
  assert.ok(fixture.sph.sampleParticles.length === 6);
  assert.ok(fixture.sph.sampleParticles.every((particle) => particle.neighborCount > 0));
  assert.deepEqual(fixture.mpm.gridResolution, [12, 8, 12]);
  assert.ok(fixture.mpm.activeCells > 0);
  assert.equal(fixture.mpm.particleToGridTransfers, fixture.sph.particleCount * 8);
  assert.equal(fixture.mpm.gridToParticleTransfers, fixture.sph.particleCount * 8);
  assert.equal(fixture.mpm.flipRatio, 0.96);
  assert.equal(fixture.mpm.deformationGradientSamples, fixture.sph.particleCount);
  assert.ok(fixture.mpm.plasticityEvents > 0);
  assert.equal(fixture.rendering.screenWidth, 320);
  assert.equal(fixture.rendering.screenHeight, 180);
  assert.ok(fixture.rendering.depthPixels > 0);
  assert.ok(fixture.rendering.thicknessPixels >= fixture.rendering.depthPixels);
  assert.ok(fixture.rendering.maxThickness > 0);
  assert.equal(fixture.rendering.refractionClaimed, false);
  assert.equal(fixture.rendering.subsurfaceScatteringClaimed, false);
  assert.ok(fixture.blockedClaims.includes("production SPH pressure solve parity"));
  assert.ok(fixture.blockedClaims.includes("Unity fluid tooling parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Niagara/fluid parity"));
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim production pressure-solve convergence/);
  assert.throws(() => sampleFluidFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => sampleFluidFixture({ elapsedSeconds: Number.NaN }), /elapsedSeconds/);
  assert.throws(() => sampleFluidFixture({ particleGrid: [1, 3, 3] }), /particleGrid\[0\]/);
});

test("fire smoke fixture ports old combustion particle and volume telemetry with bounded claims", () => {
  const fixture = sampleFireSmokeFixture({ seed: 0xf17e, gridResolution: [8, 6, 8], elapsedSeconds: 0.5, sourceCount: 3 });
  const repeat = sampleFireSmokeFixture({ seed: 0xf17e, gridResolution: [8, 6, 8], elapsedSeconds: 0.5, sourceCount: 3 });
  const shifted = sampleFireSmokeFixture({ seed: 0xf17f, gridResolution: [8, 6, 8], elapsedSeconds: 0.5, sourceCount: 3 });

  assert.equal(fixture.id, "external-parity-old-branch-fire-smoke-fixture");
  assert.equal(fixture.source, "origin-master-fire-smoke-volume-adapted");
  assert.deepEqual(fixture.sourceFiles, [
    "origin/master:src/simulation/fire/FireSimulation.ts",
    "origin/master:src/simulation/fire/FireParticleSystem.ts",
    "origin/master:src/simulation/fire/TemperatureField.ts",
    "origin/master:src/simulation/fire/TurbulenceSimulation.ts",
    "origin/master:src/simulation/smoke/SmokeSimulation.ts",
    "origin/master:src/simulation/smoke/SmokeGrid.ts",
    "origin/master:src/simulation/smoke/SmokeRenderer.ts"
  ]);
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.equal(fixture.config.solver, "bounded-fire-smoke-telemetry");
  assert.equal(fixture.config.ambientTemperature, 293);
  assert.equal(fixture.config.combustionTemperature, 1200);
  assert.equal(fixture.config.ignitionTemperature, 500);
  assert.equal(fixture.config.smokePressureIterations, 40);
  assert.equal(fixture.config.rayMarchMaxSteps, 128);
  assert.deepEqual(fixture.grid.resolution, [8, 6, 8]);
  assert.equal(fixture.grid.cellCount, 384);
  assert.equal(fixture.grid.sourceCount, 3);
  assert.ok(fixture.grid.hotCellSamples.length > 0);
  assert.ok(fixture.grid.hotCellSamples.every((sample) => sample.temperature >= fixture.config.ignitionTemperature));
  assert.ok(fixture.fire.activeFuelCells > 0);
  assert.ok(fixture.fire.burningCells > 0);
  assert.ok(fixture.fire.averageTemperature > fixture.config.ambientTemperature);
  assert.ok(fixture.fire.maxTemperature >= fixture.fire.averageTemperature);
  assert.ok(fixture.fire.fuelConsumed > 0);
  assert.ok(fixture.fire.smokeGenerated > 0);
  assert.ok(fixture.fire.buoyancyImpulse > 0);
  assert.ok(fixture.fire.turbulenceEnergy > 0);
  assert.ok(fixture.fire.coolingLoss > 0);
  assert.ok(fixture.fire.diffusionEstimate > 0);
  assert.ok(fixture.particles.emittedParticles > 0);
  assert.ok(fixture.particles.activeParticles >= fixture.particles.emittedParticles);
  assert.ok(fixture.particles.emberParticles > 0);
  assert.ok(fixture.particles.averageLifetime > 0);
  assert.ok(fixture.particles.averageSize > 0);
  assert.equal(fixture.particles.uploadBytes, fixture.particles.activeParticles * 32);
  assert.ok(fixture.smoke.densityCells > 0);
  assert.ok(fixture.smoke.totalDensity > 0);
  assert.ok(fixture.smoke.maxDensity > 0);
  assert.ok(fixture.smoke.averageVelocityMagnitude > 0);
  assert.ok(fixture.smoke.divergenceAfterProjection < fixture.smoke.divergenceBeforeProjection);
  assert.equal(fixture.smoke.pressureIterations, 40);
  assert.ok(fixture.smoke.vorticityCells > 0);
  assert.ok(fixture.volumeRendering.sampledDensity > 0);
  assert.equal(fixture.volumeRendering.rayMarchSteps, 128);
  assert.equal(fixture.volumeRendering.shadowSamples, 8);
  assert.ok(fixture.volumeRendering.transmittance >= 0);
  assert.ok(fixture.volumeRendering.transmittance < 1);
  assert.ok(fixture.volumeRendering.alpha > 0);
  assert.equal(fixture.volumeRendering.volumetricRendererClaimed, false);
  assert.equal(fixture.volumeRendering.productionLightingClaimed, false);
  assert.ok(fixture.blockedClaims.includes("production combustion solver parity"));
  assert.ok(fixture.blockedClaims.includes("Unity VFX Graph fire/smoke parity"));
  assert.ok(fixture.blockedClaims.includes("Unreal Niagara fire/smoke parity"));
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim production combustion solver parity/);
  assert.throws(() => sampleFireSmokeFixture({ seed: 1.5 }), /seed/);
  assert.throws(() => sampleFireSmokeFixture({ elapsedSeconds: Number.NaN }), /elapsedSeconds/);
  assert.throws(() => sampleFireSmokeFixture({ gridResolution: [3, 6, 8] }), /gridResolution\[0\]/);
  assert.throws(() => sampleFireSmokeFixture({ sourceCount: 0 }), /sourceCount/);
});

test("2D blend tree returns deterministic normalized weights", () => {
  const tree = new BlendTree2D([
    { value: "idle", position: [0, 0] },
    { value: "strafe", position: [1, 0] },
    { value: "forward", position: [0, 1] }
  ]);

  assert.deepEqual(tree.weights([0, 0]), [{ value: "idle", weight: 1 }]);
  const weights = tree.weights([0.75, 0.25]);
  assert.deepEqual(weights.map((entry) => entry.value), ["idle", "strafe", "forward"]);
  assert.equal(Number(weights.reduce((sum, entry) => sum + entry.weight, 0).toFixed(6)), 1);
  assert.deepEqual(weights.map((entry) => Number(entry.weight.toFixed(6))), [0.251166, 0.561625, 0.187208]);
  assert.throws(() => new BlendTree2D([]), /requires/);
  assert.throws(() => tree.weights([Number.NaN, 0]), /finite/);
});

test("motion matching fixture scores trajectory poses with bounded old-system evidence", () => {
  const fixture = sampleMotionMatchingFixture({
    currentPosition: [0.25, 0, 0.1],
    moveDirection: [1, 0, 0.12],
    facingDirection: [1, 0, 0],
    speed: 0.9,
    elapsedSeconds: 0.09,
    previousPoseId: "walk-1",
    seed: 0x3d2025
  });
  const repeat = sampleMotionMatchingFixture({
    currentPosition: [0.25, 0, 0.1],
    moveDirection: [1, 0, 0.12],
    facingDirection: [1, 0, 0],
    speed: 0.9,
    elapsedSeconds: 0.09,
    previousPoseId: "walk-1",
    seed: 0x3d2025
  });
  const slower = sampleMotionMatchingFixture({ speed: 0.18, previousPoseId: "idle-0", seed: 0x3d2025 });

  assert.equal(fixture.id, "external-parity-old-branch-motion-matching-fixture");
  assert.equal(fixture.source, "origin-master-motion-matching-system-adapted");
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, slower.hash);
  assert.equal(fixture.databasePoseCount, 18);
  assert.equal(fixture.queryTrajectory.length, 3);
  assert.ok(fixture.querySpeed > 0);
  assert.ok(fixture.queryFacingAlignment > 0.9);
  assert.ok(fixture.candidateScores.length >= 6);
  assert.ok(fixture.bestCost <= fixture.secondBestCost);
  assert.ok(fixture.costMargin >= 0);
  assert.match(fixture.selectedClip, /walk|run|strafe|turn|jump|idle/);
  assert.ok(fixture.selectedTags.length > 0);
  assert.ok(fixture.blendWeight >= 0 && fixture.blendWeight <= 1);
  assert.equal(fixture.transitionDurationSeconds, 0.18);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /not a full animation database/);
  assert.throws(() => sampleMotionMatchingFixture({ seed: 1.25 }), /seed/);
  assert.throws(() => sampleMotionMatchingFixture({ speed: Number.NaN }), /speed/);
});

test("physics sandbox fixture adapts old spawners and tools as bounded rigid-body evidence", () => {
  const fixture = samplePhysicsSandboxFixture({ seed: 0x3d2025, steps: 24 });
  const repeat = samplePhysicsSandboxFixture({ seed: 0x3d2025, steps: 24 });
  const shifted = samplePhysicsSandboxFixture({ seed: 0x3d2026, steps: 24 });

  assert.equal(fixture.id, "external-parity-old-branch-physics-sandbox-fixture");
  assert.equal(fixture.source, "origin-master-physics-sandbox-tools-spawners-adapted");
  assert.equal(fixture.hash, repeat.hash);
  assert.notEqual(fixture.hash, shifted.hash);
  assert.ok(fixture.spawners.length >= 12);
  assert.ok(fixture.spawners.some((spawner) => spawner.preset === "chain" && spawner.constraints >= 5));
  assert.ok(fixture.spawners.some((spawner) => spawner.preset === "vehicle" && spawner.visualKinds.includes("wheel")));
  assert.ok(fixture.spawners.some((spawner) => spawner.preset === "ragdoll" && spawner.constraints >= 5));
  assert.ok(fixture.spawners.some((spawner) => spawner.preset === "cylinder-proxy" && spawner.colliderKinds.includes("cylinder-proxy")));
  assert.ok(fixture.metrics.totalSpawnedBodies > 40);
  assert.ok(fixture.metrics.totalSpawnerConstraints > 10);
  assert.ok(fixture.metrics.bodyCountAfterTools < fixture.metrics.bodyCountBeforeTools);
  assert.ok(fixture.metrics.colliderCountAfterTools > 0);
  assert.ok(fixture.metrics.supportedToolCount >= 5);
  assert.equal(fixture.metrics.blockedToolCount, 1);
  assert.equal(fixture.tools.find((tool) => tool.tool === "slice")?.supported, false);
  assert.ok(fixture.tools.find((tool) => tool.tool === "push")?.affectedBodies ?? 0);
  assert.deepEqual(fixture.unsupportedAdvancedSimulations, ["cloth", "soft-body", "fluid", "fracture"]);
  assert.match(fixture.hash, /^[0-9a-f]{8}$/);
  assert.match(fixture.claimBoundary, /does not claim soft body/);
  assert.throws(() => samplePhysicsSandboxFixture({ seed: 1.25 }), /seed/);
  assert.throws(() => samplePhysicsSandboxFixture({ steps: -1 }), /steps/);
});

test("animation inspector snapshots mixer and skeleton without mutation", () => {
  const clip = new AnimationClip({
    name: "idle",
    tracks: [new AnimationTrack({ target: "node.position", valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }] })]
  });
  const mixer = new AnimationMixer();
  mixer.play(clip);
  mixer.update(0);
  const skeleton = new Skeleton([{ name: "root", parentIndex: -1 }]);
  const snapshot = new AnimationInspector().snapshot(mixer, skeleton);
  assert.equal(snapshot.mixer.actionCount, 1);
  assert.equal(snapshot.skeleton?.boneCount, 1);
  const evidence = new AnimationInspector().visualEvidence(mixer, skeleton);
  assert.equal(evidence.actionCount, 1);
  assert.equal(evidence.sampledTargetCount, 1);
  assert.equal(evidence.paletteMatrixCount, 1);
  assert.match(evidence.stableHash, /^[0-9a-f]{8}$/);
});

function distance3(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
