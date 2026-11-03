import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { rotateVec3ByQuat, Shape } from "../../../packages/physics/src/Shape.js";
import { beginNativeBodyStep, finishNativeBodyStep, integrateNativeBodyPose, integrateNativeBodyVelocity } from "../../../packages/physics/src/native/NativeBody.js";
import { collectNativePairs } from "../../../packages/physics/src/native/NativeBroadphase.js";
import { NativeContactSolver, solveNativeContacts, type NativeContactRow } from "../../../packages/physics/src/native/NativeContacts.js";
import { nativeCenterOfMass } from "../../../packages/physics/src/native/NativeMassProperties.js";
import { NativePhysicsWorld } from "../../../packages/physics/src/native/NativePhysicsWorld.js";

describe("isolated native body integration", () => {
  it("applies an outer-step force across substeps and clears it only after success", () => {
    const body = new RigidBody(1, { mass: 2 });
    body.applyForce([4, 0, 0]);
    const forces = beginNativeBodyStep(body);
    for (let i = 0; i < 2; i++) {
      integrateNativeBodyVelocity(body, [0, 0, 0], forces, 0.5);
      integrateNativeBodyPose(body, 0.5);
    }
    expect(body.velocity[0]).toBeCloseTo(2, 10);
    expect(body.previousPosition).toEqual([0, 0, 0]);
    expect(body.pendingForce()).toEqual([4, 0, 0]);
    finishNativeBodyStep(body);
    expect(body.pendingForce()).toEqual([0, 0, 0]);
  });

  it("rotates with world-space angular velocity while preserving unit length", () => {
    const body = new RigidBody(1, { angularVelocity: [0, 0, Math.PI] });
    beginNativeBodyStep(body);
    integrateNativeBodyPose(body, 0.5);
    const rotated = rotateVec3ByQuat([1, 0, 0], body.rotation);
    expect(rotated[0]).toBeCloseTo(0, 10);
    expect(rotated[1]).toBeCloseTo(1, 10);
    expect(Math.hypot(...body.rotation)).toBeCloseTo(1, 12);
    expect(body.previousRotation).toEqual([0, 0, 0, 1]);
  });

  it("leaves static and externally driven kinematic poses untouched", () => {
    for (const type of ["static", "kinematic"] as const) {
      const body = new RigidBody(1, { type, position: [1, 2, 3], velocity: [1, 0, 0] });
      const forces = beginNativeBodyStep(body);
      integrateNativeBodyVelocity(body, [0, -9.81, 0], forces, 1);
      integrateNativeBodyPose(body, 1);
      expect(body.position).toEqual([1, 2, 3]);
    }
  });

  it("rejects invalid or overflowing state before moving a body", () => {
    const body = new RigidBody(1, { velocity: [Number.MAX_VALUE, 0, 0] });
    beginNativeBodyStep(body);
    expect(() => integrateNativeBodyPose(body, 2)).toThrow(/position/);
    expect(body.position).toEqual([0, 0, 0]);
    body.linearDamping = -1;
    expect(() => beginNativeBodyStep(body)).toThrow(/damping/);
  });
});

describe("isolated native collision candidates", () => {
  it("sorts candidate pairs, honors masks, and includes fixed sensor/kinematic overlaps", () => {
    const floor = new RigidBody(1, { type: "static" });
    const floorShape = new Collider(1, floor.id, { shape: Shape.plane(), filter: { layer: 1, mask: 2 } });
    const dynamic = new RigidBody(2, { position: [0, 0.5, 0] });
    const dynamicShape = new Collider(2, dynamic.id, { shape: Shape.sphere(1), filter: { layer: 2, mask: 1 } });
    const sensor = new RigidBody(3, { type: "static", position: [5, 0, 0] });
    const sensorShape = new Collider(3, sensor.id, { shape: Shape.sphere(1), sensor: true, filter: { layer: 4, mask: 8 } });
    const kinematic = new RigidBody(4, { type: "kinematic", position: [5, 0, 0] });
    const kinematicShape = new Collider(4, kinematic.id, { shape: Shape.sphere(1), filter: { layer: 8, mask: 4 } });
    const pairs = collectNativePairs([
      { collider: kinematicShape, body: kinematic }, { collider: floorShape, body: floor },
      { collider: dynamicShape, body: dynamic }, { collider: sensorShape, body: sensor }
    ]);
    expect(pairs.pairs.map(([a, b]) => [a.collider.id, b.collider.id])).toEqual([[1, 2], [3, 4]]);
    expect(pairs.infiniteColliders).toBe(1);
  });
});

describe("isolated native contact impulses", () => {
  const contact = (a: RigidBody, b: RigidBody, extra: Partial<NativeContactRow> = {}): NativeContactRow => ({
    bodyA: a, bodyB: b, normal: [1, 0, 0], point: [0, 0, 0], penetration: 0,
    friction: 0, restitution: 1, ...extra
  });

  it("conserves linear momentum and kinetic energy for an elastic central collision", () => {
    const a = new RigidBody(1, { position: [-1, 0, 0], velocity: [1, 0, 0] });
    const b = new RigidBody(2, { position: [1, 0, 0], velocity: [-1, 0, 0] });
    solveNativeContacts([contact(a, b)], 1 / 60, 8);
    expect(a.velocity[0]).toBeCloseTo(-1, 10);
    expect(b.velocity[0]).toBeCloseTo(1, 10);
    expect(a.velocity[0] + b.velocity[0]).toBeCloseTo(0, 10);
  });

  it("limits friction by the accumulated normal impulse without reversing tangent motion", () => {
    for (const iterations of [1, 4, 16]) {
      const wall = new RigidBody(1, { type: "static" });
      const body = new RigidBody(2, { velocity: [-1, 1, 0] });
      solveNativeContacts([contact(wall, body, { restitution: 0, friction: 0.5 })], 1 / 60, iterations);
      expect(body.velocity[0]).toBeCloseTo(0, 10);
      expect(body.velocity[1]).toBeGreaterThanOrEqual(0);
      expect(body.velocity[1]).toBeCloseTo(0.5, 10);
    }
  });

  it("retains the friction budget while other constraints change velocity between iterations", () => {
    const wall = new RigidBody(1, { type: "static" });
    const body = new RigidBody(2, { velocity: [-1, 1, 0] });
    const solver = new NativeContactSolver([contact(wall, body, { restitution: 0, friction: 0.5 })], 1 / 60);
    solver.solve();
    expect(body.velocity[1]).toBeCloseTo(0.5, 10);
    body.applyImpulse([0, 0.2, 0]);
    solver.solve();
    expect(body.velocity[1]).toBeCloseTo(0.7, 10);
  });

  it("creates angular response at an off-center impact and leaves sensors non-physical", () => {
    const wall = new RigidBody(1, { type: "static" });
    const body = new RigidBody(2, { velocity: [-1, 0, 0] });
    solveNativeContacts([contact(wall, body, { point: [0, 0.5, 0], restitution: 0 })], 1 / 60, 8);
    expect(Math.abs(body.angularVelocity[2])).toBeGreaterThan(0.1);
    const sensorBody = new RigidBody(3, { velocity: [-1, 0, 0] });
    solveNativeContacts([contact(wall, sensorBody, { sensor: true })], 1 / 60, 8);
    expect(sensorBody.velocity).toEqual([-1, 0, 0]);
  });

  it("rejects malformed rows before applying any impulse", () => {
    const wall = new RigidBody(1, { type: "static" });
    const body = new RigidBody(2, { velocity: [-1, 0, 0] });
    expect(() => solveNativeContacts([contact(wall, body), contact(wall, body, { normal: [0, 0, 0] })], 1 / 60, 4)).toThrow(/normal/);
    expect(body.velocity).toEqual([-1, 0, 0]);
    expect(() => solveNativeContacts([contact(wall, body, { normal: [Number.MAX_VALUE, Number.MAX_VALUE, 0] })], 1 / 60, 4)).toThrow(/normal/);
    expect(body.velocity).toEqual([-1, 0, 0]);
  });
});

describe("isolated native world integration", () => {
  it("continuously resolves a fast frictionless impact in its explicit linear mode", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const wall = world.createRigidBody({ type: "static" });
    world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]), material: { friction: 0, restitution: 1 } });
    const ball = world.createRigidBody({ position: [-5, 0, 0], velocity: [100, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
    const events = world.step(0.1);
    expect(ball.position[0]).toBeCloseTo(-6, 8);
    expect(ball.velocity[0]).toBeCloseTo(-100, 8);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(events[0]!.contact.normal[0]).toBeCloseTo(-1, 8);
    expect(events[0]!.contact.point?.[0]).toBeCloseTo(0, 8);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
  });

  it("retains both continuous sensor crossings with geometric contact witnesses", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const trigger = world.createRigidBody({ type: "static" });
    world.createCollider(trigger, { shape: Shape.box(0.1, 1, 1), sensor: true });
    const ball = world.createRigidBody({ position: [-3, 0, 0], velocity: [60, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.1) });
    const events = world.step(0.1);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(events[0]!.contact.normal[0]).toBeCloseTo(-1, 8);
    expect(events[1]!.contact.normal[0]).toBeCloseTo(1, 8);
    expect(events[0]!.contact.point?.[0]).toBeCloseTo(-0.1, 8);
    expect(events[1]!.contact.point?.[0]).toBeCloseTo(0.1, 8);
    expect(ball.position[0]).toBeCloseTo(3, 8);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
  });

  it("keeps continuous sensor state across steps and emits a geometric exit after moving away", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const trigger = world.createRigidBody({ type: "static" });
    world.createCollider(trigger, { shape: Shape.box(0.5, 1, 1), sensor: true });
    const ball = world.createRigidBody({ position: [-2, 0, 0], velocity: [10, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.25) });
    expect(world.step(0.15).map((event) => event.type)).toEqual(["begin"]);
    expect(world.snapshot().contacts).toHaveLength(1);
    ball.setVelocity([0, 0, 0]);
    expect(world.step(0.1).map((event) => event.type)).toEqual(["stay"]);
    ball.setVelocity([10, 0, 0]);
    const exit = world.step(0.2);
    expect(exit.map((event) => event.type)).toEqual(["end"]);
    expect(exit[0]!.contact.normal[0]).toBeCloseTo(1, 8);
    expect(exit[0]!.contact.point?.[0]).toBeCloseTo(0.5, 8);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
  });

  it("orders separate continuous sensor crossings by time", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const sensorIds: number[] = [];
    for (const x of [-2, 2]) {
      const trigger = world.createRigidBody({ type: "static", position: [x, 0, 0] });
      sensorIds.push(world.createCollider(trigger, { shape: Shape.box(0.1, 1, 1), sensor: true }).id);
    }
    const ball = world.createRigidBody({ position: [-5, 0, 0], velocity: [10, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.1) });
    const events = world.step(1);
    expect(events.map((event) => [event.type, event.contact.colliderA])).toEqual([
      ["begin", sensorIds[0]], ["end", sensorIds[0]], ["begin", sensorIds[1]], ["end", sensorIds[1]]
    ]);
    expect(ball.position[0]).toBeCloseTo(5, 8);
    world.dispose();
  });

  it("resolves a continuous impact under acceleration shared by both dynamic bodies", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const a = world.createRigidBody({ position: [-2, 0, 0], velocity: [4, 0, 0] });
    const b = world.createRigidBody({ position: [2, 0, 0], velocity: [-4, 0, 0] });
    for (const body of [a, b]) world.createCollider(body, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
    const events = world.step(1);
    expect(a.position[0]).toBeCloseTo(-3, 8);
    expect(b.position[0]).toBeCloseTo(3, 8);
    expect(a.position[1]).toBeCloseTo(-5, 8);
    expect(b.velocity[1]).toBeCloseTo(-10, 8);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(events[0]!.contact.point?.[1]).toBeCloseTo(-0.703125, 8);
    world.dispose();
  });

  it("rejects unsupported continuous box-vs-plane relative acceleration", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -9.81, 0], continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
    const ball = world.createRigidBody({ position: [0, 2, 0] });
    world.createCollider(ball, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0 } });
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/acceleration/);
    expect(world.snapshot()).toEqual(before);
    world.dispose();
  });

  it("continuously resolves an elastic sphere impact against a floor under gravity", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0, restitution: 1 } });
    const ball = world.createRigidBody({ position: [0, 2, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
    const impactTime = Math.sqrt(0.3), remaining = 1 - impactTime, launchSpeed = 10 * impactTime;
    const events = world.step(1);
    expect(ball.position[1]).toBeCloseTo(0.5 + launchSpeed * remaining - 5 * remaining * remaining, 8);
    expect(ball.velocity[1]).toBeCloseTo(launchSpeed - 10 * remaining, 8);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(events[0]!.contact.point?.[1]).toBeCloseTo(0, 8);
    world.dispose();
  });

  it("holds a resting continuous sphere on a frictionless plane under gravity", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
    const ball = world.createRigidBody({ position: [0, 0.5, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    expect(world.step(1).map((event) => event.type)).toEqual(["begin"]);
    expect(ball.position[1]).toBeCloseTo(0.5, 8);
    expect(ball.velocity[1]).toBeCloseTo(0, 8);
    expect(world.step(0.1).map((event) => event.type)).toEqual(["stay"]);
    world.dispose();
  });

  it("integrates a tangential force while continuously supported", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
    const ball = world.createRigidBody({ position: [0, 0.5, 0], mass: 2 });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    ball.applyForce([4, 0, 0]);
    expect(world.step(1).map((event) => event.type)).toEqual(["begin"]);
    expect(ball.position[0]).toBeCloseTo(1, 10);
    expect(ball.position[1]).toBeCloseTo(0.5, 10);
    expect(ball.velocity[0]).toBeCloseTo(2, 10);
    expect(ball.pendingForce()).toEqual([0, 0, 0]);
    expect(world.step(1).map((event) => event.type)).toEqual(["stay"]);
    expect(ball.position[0]).toBeCloseTo(3, 10);
    expect(ball.position[1]).toBeCloseTo(0.5, 10);
    expect(ball.velocity[0]).toBeCloseTo(2, 10);
    world.dispose();
  });

  it("holds an inelastically landed continuous sphere for the remainder of the step", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
    const ball = world.createRigidBody({ position: [0, 2, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    expect(world.step(1).map((event) => event.type)).toEqual(["begin"]);
    expect(ball.position[1]).toBeCloseTo(0.5, 8);
    expect(ball.velocity[1]).toBeCloseTo(0, 8);
    expect(world.snapshot().contacts).toHaveLength(1);
    world.dispose();
  });

  it("projects continuous gravity along a frictionless sloped support", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const normal = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const floor = world.createRigidBody({ type: "static" });
    world.createCollider(floor, { shape: Shape.plane(normal, -0.5), material: { friction: 0 } });
    const ball = world.createRigidBody();
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    world.step(1);
    expect(ball.velocity[1]).toBeCloseTo(-5, 8);
    expect(ball.velocity[2]).toBeCloseTo(5, 8);
    expect(ball.position[1]).toBeCloseTo(-2.5, 8);
    expect(ball.position[2]).toBeCloseTo(2.5, 8);
    world.dispose();
  });

  it("preserves supported slope motion across steps and a rejected step", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const floor = world.createRigidBody({ type: "static" });
    const normal = Shape.plane([0, 0.6, 0.8]).normal;
    // Account for the representable normal's length so the normalized plane
    // starts exactly one radius from the origin, rather than a tiny gap away.
    world.createCollider(floor, { shape: { kind: "plane", normal, constant: -0.5 * Math.hypot(...normal) }, material: { friction: 0 } });
    const ball = world.createRigidBody();
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    expect(world.step(0.1).map((event) => event.type)).toEqual(["begin"]);
    ball.setAngularVelocity([1, 0, 0]);
    ball.applyTorque([0, 0, 1]);
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/principal spin axis/i);
    expect(world.snapshot()).toEqual(before);
    expect(ball.pendingTorque()).toEqual([0, 0, 1]);
    ball.clearForces();
    ball.setAngularVelocity([0, 0, 0]);
    for (let i = 0; i < 9; i++) expect(world.step(0.1).map((event) => event.type)).toEqual(["stay"]);
    // Project [0, -10, 0] onto the tangent of [0, .6, .8].
    expect(ball.position[1]).toBeCloseTo(-3.2, 10);
    expect(ball.position[2]).toBeCloseTo(2.4, 10);
    expect(ball.velocity[1]).toBeCloseTo(-6.4, 10);
    expect(ball.velocity[2]).toBeCloseTo(4.8, 10);
    world.dispose();
  });

  it("discards continuous support after a teleport or removal", () => {
    for (const action of ["teleport", "remove"] as const) {
      const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
      const floor = world.createRigidBody({ type: "static" });
      const collider = world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
      const ball = world.createRigidBody({ position: [0, 0.5, 0] });
      world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
      expect(world.step(0.1).map((event) => event.type), action).toEqual(["begin"]);
      world.drainEvents();
      if (action === "teleport") {
        ball.setPosition([0, 2, 0]);
        expect(world.step(0.1).map((event) => event.type)).toEqual(["end"]);
        expect(ball.position[1]).toBeCloseTo(1.95, 10);
      } else {
        world.removeCollider(collider.id);
        expect(world.drainEvents().map((event) => event.type)).toEqual(["end"]);
        expect(world.step(0.1)).toEqual([]);
        expect(ball.position[1]).toBeCloseTo(0.45, 10);
      }
      expect(ball.velocity[1]).toBeCloseTo(-1, 10);
      expect(world.snapshot().contacts).toEqual([]);
      world.dispose();
    }
  });

  it("releases continuous support when an authored velocity or force lifts the body", () => {
    for (const action of ["velocity", "force"] as const) {
      const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
      const floor = world.createRigidBody({ type: "static" });
      world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
      const ball = world.createRigidBody({ position: [0, 0.5, 0] });
      world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
      expect(world.step(0.1).map((event) => event.type), action).toEqual(["begin"]);
      if (action === "velocity") ball.setVelocity([0, 1, 0]);
      else ball.applyForce([0, 20, 0]);
      expect(world.step(0.05).map((event) => event.type), action).toEqual(["end"]);
      expect(ball.position[1]).toBeCloseTo(action === "velocity" ? 0.5375 : 0.5125, 10);
      expect(ball.velocity[1]).toBeCloseTo(0.5, 10);
      expect(world.snapshot().contacts).toEqual([]);
      world.dispose();
    }
  });

  it("rejects multiple simultaneous continuous supports without changing the world", () => {
    const world = new NativePhysicsWorld({ gravity: [-1, -10, 0], continuousCollision: { mode: "linear" } });
    for (const normal of [[1, 0, 0], [0, 1, 0]] as const) {
      const plane = world.createRigidBody({ type: "static" });
      world.createCollider(plane, { shape: Shape.plane(normal), material: { friction: 0 } });
    }
    const ball = world.createRigidBody({ position: [0.5, 0.5, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/support|contact/i);
    expect(world.snapshot()).toEqual(before);
    world.dispose();
  });

  it("retains a resting continuous solid contact and ends it when teleported away", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const wall = world.createRigidBody({ type: "static" });
    world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]), material: { friction: 0 } });
    const ball = world.createRigidBody({ position: [-1, 0, 0], velocity: [2, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
    expect(world.step(0.5).map((event) => event.type)).toEqual(["begin"]);
    expect(ball.position[0]).toBeCloseTo(-0.5, 8);
    expect(ball.velocity[0]).toBeCloseTo(0, 8);
    expect(world.snapshot().contacts).toHaveLength(1);
    expect(world.step(0.1).map((event) => event.type)).toEqual(["stay"]);
    ball.setPosition([-2, 0, 0]);
    expect(world.step(0.1).map((event) => event.type)).toEqual(["end"]);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
  });

  it("rejects non-parallel continuous torque without consuming it or changing state", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const ball = world.createRigidBody({ position: [-5, 0, 0], velocity: [100, 0, 0], angularVelocity: [1, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5) });
    ball.applyTorque([0, 0, 1]);
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/principal spin axis/i);
    expect(world.snapshot()).toEqual(before);
    expect(ball.pendingTorque()).toEqual([0, 0, 1]);
    world.dispose();
  });

  it("applies a constant force through a continuous sphere-plane impact", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    const wall = world.createRigidBody({ type: "static" });
    world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]), material: { friction: 0, restitution: 1 } });
    const ball = world.createRigidBody({ mass: 2, position: [-2, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
    ball.applyForce([4, 0, 0]);
    const time = Math.sqrt(1.5), remaining = 2 - time, impactSpeed = 2 * time;
    expect(world.step(2).map((event) => event.type)).toEqual(["begin", "end"]);
    expect(ball.position[0]).toBeCloseTo(-0.5 - impactSpeed * remaining + remaining * remaining, 8);
    expect(ball.velocity[0]).toBeCloseTo(-impactSpeed + 2 * remaining, 8);
    expect(ball.pendingForce()).toEqual([0, 0, 0]);
    world.dispose();
  });

  it("rolls back a continuous step when its impact budget is exhausted", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear", maxImpacts: 1 } });
    for (const [position, normal] of [[-1, [1, 0, 0]], [1, [-1, 0, 0]]] as const) {
      const wall = world.createRigidBody({ type: "static", position: [position, 0, 0] });
      world.createCollider(wall, { shape: Shape.plane(normal), material: { friction: 0, restitution: 1 } });
    }
    const ball = world.createRigidBody({ velocity: [20, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.1), material: { friction: 0, restitution: 1 } });
    const before = world.snapshot();
    expect(() => world.step(0.2)).toThrow(/impact limit/);
    expect(world.snapshot()).toEqual(before);
    expect(world.drainEvents()).toEqual([]);
    world.dispose();
  });

  it("rejects unsupported rotating-box continuous motion and keeps the original pose", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    const ball = world.createRigidBody({ angularVelocity: [0, 0, 1], inertia: [1, 1, 1] });
    world.createCollider(ball, { shape: Shape.box(0.5, 0.5, 0.5) });
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/spin|angular|rotat/i);
    expect(world.snapshot()).toEqual(before);
    world.dispose();
  });

  it("advances a principal-axis spinning sphere through a frictionless continuous impact", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1, continuousCollision: { mode: "linear" } });
    const wall = world.createRigidBody({ type: "static" });
    world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]), material: { friction: 0, restitution: 1 } });
    const ball = world.createRigidBody({ position: [-2, 0, 0], velocity: [4, 0, 0], angularVelocity: [0, 0, Math.PI] });
    world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
    const events = world.step(1);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(ball.position[0]).toBeCloseTo(-3, 8);
    expect(ball.velocity[0]).toBeCloseTo(-4, 8);
    expect(ball.rotation[2]).toBeCloseTo(1, 8);
    expect(ball.rotation[3]).toBeCloseTo(0, 8);
    expect(ball.angularVelocity[2]).toBeCloseTo(Math.PI, 8);
    world.dispose();
  });

  it("rejects gyroscopic continuous spin without mutating the body", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    const ball = world.createRigidBody({ inertia: [1, 2, 4], angularVelocity: [1, 1, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5) });
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/gyroscopic|principal|angular/i);
    expect(world.snapshot()).toEqual(before);
    world.dispose();
  });

  it("rejects a spinning continuous impact that requires tangential friction", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    const wall = world.createRigidBody({ type: "static" });
    world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]) });
    const ball = world.createRigidBody({ position: [-2, 0, 0], velocity: [4, 0, 0], angularVelocity: [0, 0, 1] });
    world.createCollider(ball, { shape: Shape.sphere(0.5) });
    const before = world.snapshot();
    expect(() => world.step(1)).toThrow(/tangential friction/);
    expect(world.snapshot()).toEqual(before);
    world.dispose();
  });

  it("applies explicitly configured sleep timing and honors manual sleep when disabled", () => {
    const policy = { linearSpeedThreshold: 0.01, angularSpeedThreshold: 0.01, quietDuration: 0.05 };
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], sleeping: policy });
    const body = world.createRigidBody();
    for (let i = 0; i < 2; i += 1) world.step(1 / 60);
    expect(body.sleeping).toBe(false);
    world.step(1 / 60);
    expect(body.sleeping).toBe(true);
    body.applyForce([1, 0, 0]);
    world.step(1 / 60);
    expect(body.sleeping).toBe(false);
    world.dispose();

    const manual = new NativePhysicsWorld({ gravity: [0, 0, 0], sleeping: { ...policy, enableSleeping: false } });
    const sleeper = manual.createRigidBody();
    sleeper.setPosition([1, 0, 0]);
    sleeper.sleep();
    manual.step(1 / 60);
    expect(sleeper.sleeping).toBe(true);
    sleeper.applyForce([1, 0, 0]);
    manual.step(1 / 60);
    expect(sleeper.sleeping).toBe(false);
    manual.dispose();
  });

  it("rolls back sleep and body state when a later contact solve fails", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], sleeping: { linearSpeedThreshold: 0.01, angularSpeedThreshold: 0.01, quietDuration: 1 } });
    const sleeper = world.createRigidBody({ sleeping: true });
    world.createCollider(sleeper, { shape: Shape.sphere(0.5), material: { friction: Number.MAX_VALUE } });
    const moving = world.createRigidBody({ position: [-1.2, 0, 0], velocity: [10, 0, 0] });
    world.createCollider(moving, { shape: Shape.sphere(0.5), material: { friction: Number.MAX_VALUE } });
    moving.applyForce([1, 0, 0]);
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/friction/);
    expect(world.snapshot()).toEqual(before);
    expect(sleeper.sleeping).toBe(true);
    expect(moving.pendingForce()).toEqual([1, 0, 0]);
    world.dispose();
  });

  it("updates shape-derived angular response when colliders are added and removed", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ mass: 2 });
    body.applyTorque([0, 0, 1]);
    world.step(1 / 60);
    expect(body.angularVelocity).toEqual([0, 0, 0]);
    const collider = world.createCollider(body, { shape: Shape.sphere(0.25) });
    body.applyTorque([0, 0, 1]);
    world.step(1 / 60);
    expect(body.angularVelocity[2]).toBeCloseTo(1 / 3, 8);
    world.removeCollider(collider.id);
    body.setAngularVelocity([0, 0, 0]);
    body.applyTorque([0, 0, 1]);
    world.step(1 / 60);
    expect(body.angularVelocity).toEqual([0, 0, 0]);
    world.dispose();
  });

  it("rejects overflowing mass calculations and invalid filters without partially creating a collider", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody();
    expect(() => world.createCollider(body, { shape: Shape.box(Number.MAX_VALUE, 1, 1) })).toThrow(/overflowed/);
    expect(() => world.createCollider(body, { shape: Shape.sphere(1), filter: { layer: 0x10000 } })).toThrow(/16 bits/);
    expect(world.colliders()).toEqual([]);
    expect(world.createCollider(body, { shape: Shape.sphere(1) }).id).toBe(1);
    world.dispose();
  });

  it("rotates an off-center convex body about its center of mass", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const body = world.createRigidBody({ mass: 2, angularVelocity: [0, 0, 1] });
    world.createCollider(body, { shape: Shape.convexHull([
      [1, 2, 3], [3, 2, 3], [1, 5, 3], [1, 2, 7]
    ], [0, 1, 2]) });
    const center = nativeCenterOfMass(body);
    world.step(1 / 60);
    const after = nativeCenterOfMass(body);
    for (let i = 0; i < 3; i += 1) expect(after[i]).toBeCloseTo(center[i]!, 9);
    expect(Math.hypot(...body.position)).toBeGreaterThan(0.01);
    world.dispose();
  });

  it("returns ordered world queries with sensor, ignore, mask, and overlap rules", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const triggerBody = world.createRigidBody({ type: "static", position: [-2, 0, 0] });
    const trigger = world.createCollider(triggerBody, { shape: Shape.sphere(0.25), sensor: true });
    const nearBody = world.createRigidBody({ type: "static" });
    const near = world.createCollider(nearBody, { shape: Shape.sphere(1) });
    const farBody = world.createRigidBody({ type: "static", position: [3, 0, 0] });
    const far = world.createCollider(farBody, { shape: Shape.sphere(1), filter: { layer: 2 } });
    expect(world.raycastAll([-5, 0, 0], [4, 0, 0]).map((hit) => [hit.colliderId, hit.distance])).toEqual([[near.id, 4], [far.id, 7]]);
    expect(world.raycast([-5, 0, 0], [1, 0, 0], { includeSensors: true })?.colliderId).toBe(trigger.id);
    expect(world.raycast([-5, 0, 0], [1, 0, 0], { ignoreBodies: [nearBody.id], mask: 2 })?.colliderId).toBe(far.id);
    expect(world.sphereCastAll([-5, 0, 0], 0.5, [1, 0, 0]).map((hit) => [hit.colliderId, hit.distance])).toEqual([[near.id, 3.5], [far.id, 6.5]]);
    expect(world.overlapShape([-1.5, 0, 0], Shape.sphere(0.5)).map((hit) => hit.id)).toEqual([trigger.id, near.id]);
    expect(world.overlapShape([-1.5, 0, 0], Shape.sphere(0.5), { includeSensors: false }).map((hit) => hit.id)).toEqual([near.id]);
    world.dispose();
    expect(() => world.raycast([0, 0, 0], [1, 0, 0])).toThrow(/disposed/);
    const empty = new NativePhysicsWorld();
    expect(() => empty.raycast([0, 0, 0], [0, 0, 0])).toThrow(/direction/);
    expect(() => empty.sphereCast([0, 0, 0], 0, [1, 0, 0])).toThrow(/radius/);
    empty.dispose();
  });

  it("moves a capsule through scene queries, ignoring sensors and respecting wall clearance", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
    const trigger = world.createRigidBody({ type: "static", position: [1, 1, 0] });
    world.createCollider(trigger, { shape: Shape.box(0.2, 2, 2), sensor: true });
    const filtered = world.createRigidBody({ type: "static", position: [0.7, 1, 0] });
    world.createCollider(filtered, { shape: Shape.box(0.1, 2, 2), filter: { layer: 2 } });
    const wall = world.createRigidBody({ type: "static", position: [2, 1, 0] });
    world.createCollider(wall, { shape: Shape.box(0.2, 2, 2) });
    const player = world.createRigidBody({ type: "kinematic", position: [0, 0.81, 0] });
    const capsule = world.createCollider(player, { shape: Shape.capsule(0.3, 0.5), filter: { layer: 1, mask: 1 } });
    const character = world.createCharacterController(player, { offset: 0.01 });
    const result = character.move([3, -0.05, 0]);
    expect(result.position[0]).toBeCloseTo(1.49, 5);
    expect(result.position[1]).toBeCloseTo(0.81, 5);
    expect(result.grounded).toBe(true);
    expect(result.collisions).toBeGreaterThan(0);
    world.removeCollider(capsule.id);
    expect(() => character.move([0, 0, 0])).toThrow(/disposed/);
    world.dispose();
  });

  it("moves a capsule across a mesh floor seam until the wall in the same collider", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const terrain = world.createRigidBody({ type: "static" });
    world.createCollider(terrain, { shape: Shape.mesh([
      [-3, 0, -3], [-3, 0, 3], [3, 0, -3], [3, 0, 3],
      [2, 0, -3], [2, 3, -3], [2, 0, 3], [2, 3, 3]
    ], [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]) });
    const player = world.createRigidBody({ type: "kinematic", position: [-2, 0.85, 0] });
    world.createCollider(player, { shape: Shape.capsule(0.25, 0.5) });
    const character = world.createCharacterController(player, { offset: 0.1 });
    const movement = character.move([5, 0, 0]);
    expect(movement.position[0]).toBeCloseTo(1.65, 5);
    expect(movement.position[1]).toBeCloseTo(0.85, 5);
    expect(movement.grounded).toBe(true);
    world.dispose();
  });

  it("moves a box character against world geometry with its authored clearance", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
    const wall = world.createRigidBody({ type: "static", position: [2, 1, 0] });
    world.createCollider(wall, { shape: Shape.box(0.2, 2, 2) });
    const player = world.createRigidBody({ type: "kinematic", position: [0, 0.51, 0] });
    world.createCollider(player, { shape: Shape.box(0.3, 0.5, 0.3) });
    const character = world.createCharacterController(player, { offset: 0.01 });
    const movement = character.move([3, -0.05, 0]);
    expect(movement.position[0]).toBeCloseTo(1.49, 5);
    expect(movement.position[1]).toBeCloseTo(0.51, 5);
    expect(movement.grounded).toBe(true);
    world.dispose();
  });

  it("steps each supported character shape onto a wide ledge", () => {
    for (const [shape, bottom] of [[Shape.sphere(0.2), 0.2], [Shape.capsule(0.2, 0.4), 0.6], [Shape.box(0.2, 0.6, 0.2), 0.6]] as const) {
      const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
      const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
      world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
      const step = world.createRigidBody({ type: "static", position: [1, 0.15, 0] });
      world.createCollider(step, { shape: Shape.box(0.5, 0.15, 1) });
      const body = world.createRigidBody({ type: "kinematic", position: [0, bottom + 0.01, 0] });
      world.createCollider(body, { shape });
      const character = world.createCharacterController(body, { offset: 0.01, autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
      expect(character.move([0, 0, 0]).grounded).toBe(true);
      const result = character.move([1, 0, 0]);
      expect(result.position[0], shape.kind).toBeCloseTo(1, 5);
      expect(result.position[1], shape.kind).toBeCloseTo(bottom + 0.31, 5);
      expect(result.applied[0], shape.kind).toBeCloseTo(1, 5);
      expect(result.applied[1], shape.kind).toBeCloseTo(0.3, 5);
      expect(result.grounded, shape.kind).toBe(true);
      expect(result.collisions, shape.kind).toBeGreaterThan(0);
      world.dispose();
    }
  });

  it("allows unobstructed movement when experimental autostep is enabled", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
    const body = world.createRigidBody({ type: "kinematic", position: [0, 0.21, 0] });
    world.createCollider(body, { shape: Shape.sphere(0.2) });
    const character = world.createCharacterController(body, { offset: 0.01, autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
    const movement = character.move([0.1, 0, 0]);
    expect(movement.position[0]).toBeCloseTo(0.1, 8);
    expect(movement.position[1]).toBeCloseTo(0.21, 8);
    expect(movement.grounded).toBe(true);
    world.dispose();
  });

  it("connects vehicle wheel rays to the current world and invalidates removed contacts", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -9.81, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    const road = world.createCollider(floor, { shape: Shape.box(5, 0.5, 5), material: { friction: 1 } });
    const trigger = world.createRigidBody({ type: "static", position: [0, 0.15, 0] });
    world.createCollider(trigger, { shape: Shape.box(2, 0.05, 2), sensor: true });
    const chassis = world.createRigidBody({ position: [0, 0.65, 0] });
    world.createCollider(chassis, { shape: Shape.sphere(0.2) });
    const vehicle = world.createVehicleController(chassis);
    vehicle.addWheel({ connection: [0, -0.2, 0], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3, suspensionStiffness: 40, frictionSlip: 5 });
    vehicle.setWheelCommand(0, { engineForce: 100 });
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: true, groundColliderHandle: road.id });
    expect(vehicle.wheelState(0).suspensionForce).toBeGreaterThan(0);
    expect(chassis.velocity[2]).toBeLessThan(0);
    world.step(1 / 60);
    expect(chassis.position[2]).toBeLessThan(0);
    world.removeCollider(road.id);
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: false, groundColliderHandle: null });
    world.removeRigidBody(chassis.id);
    expect(() => vehicle.step(1 / 60)).toThrow(/disposed/);
    world.dispose();
  });

  it("settles a dynamic sphere on a fixed box and reports contact events", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 12 });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: Shape.box(3, 0.5, 3) });
    const ball = world.createRigidBody({ position: [0, 2, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.5) });
    const phases: string[] = [];
    for (let i = 0; i < 240; i++) phases.push(...world.step(1 / 60).map((event) => event.type));
    expect(phases).toContain("begin");
    expect(ball.position[1]).toBeGreaterThan(0.48);
    expect(ball.position[1]).toBeLessThan(0.52);
    expect(Math.abs(ball.velocity[1])).toBeLessThan(0.1);
    expect(world.snapshot().contacts).toHaveLength(1);
    world.dispose();
    expect(() => world.step()).toThrow(/disposed/);
  });

  it("reports both sensor transitions when a moving body crosses during one step", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 256 });
    const trigger = world.createRigidBody({ type: "static" });
    world.createCollider(trigger, { shape: Shape.box(0.1, 1, 1), sensor: true });
    const ball = world.createRigidBody({ position: [-3, 0, 0], velocity: [60, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.1) });
    const events = world.step(0.1);
    expect(events.map((event) => event.type)).toEqual(["begin", "end"]);
    expect(ball.position[0]).toBeCloseTo(3, 6);
    expect(world.snapshot().contacts).toHaveLength(0);
    world.dispose();
  });

  it("holds a fixed joint under gravity and repeats the same source simulation", () => {
    const run = () => {
      const world = new NativePhysicsWorld({ gravity: [0, -9.81, 0] });
      const anchor = world.createRigidBody({ type: "static", position: [0, 2, 0] });
      const load = world.createRigidBody({ position: [0, 1, 0] });
      world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: load });
      for (let i = 0; i < 120; i++) world.step(1 / 60);
      const snapshot = world.snapshot();
      world.dispose();
      return snapshot;
    };
    const first = run();
    expect(first.bodies[1]!.position[1]).toBeCloseTo(1, 4);
    expect(run()).toEqual(first);
  });

  it("rejects a substep budget overflow before consuming forces or moving bodies", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 2 });
    const ball = world.createRigidBody({ velocity: [60, 0, 0] });
    world.createCollider(ball, { shape: Shape.sphere(0.1) });
    ball.applyForce([3, 0, 0]);
    ball.rotation = [0, 0, 0, 2];
    const previousRotation = [...ball.previousRotation];
    expect(() => world.step(1 / 60)).toThrow(/exceeding maxSubSteps/);
    expect(ball.position).toEqual([0, 0, 0]);
    expect(ball.rotation).toEqual([0, 0, 0, 2]);
    expect(ball.previousRotation).toEqual(previousRotation);
    expect(ball.pendingForce()).toEqual([3, 0, 0]);
    world.dispose();
  });

  it("includes pending torque in the substep motion estimate", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 2 });
    const body = world.createRigidBody();
    world.createCollider(body, { shape: Shape.box(0.1, 0.1, 0.1) });
    body.applyTorque([0, 0, 10000]);
    expect(() => world.step(1 / 60)).toThrow(/exceeding maxSubSteps/);
    expect(body.rotation).toEqual([0, 0, 0, 1]);
    expect(body.pendingTorque()).toEqual([0, 0, 10000]);
    world.dispose();
  });

  it("rolls back all body state if a later body's integration overflows", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -1, 0] });
    const first = world.createRigidBody();
    first.setPosition([2, 0, 0]);
    first.applyForce([1, 0, 0]);
    const second = world.createRigidBody({ position: [Number.MAX_VALUE, 0, 0], velocity: [Number.MAX_VALUE, 0, 0] });
    const before = {
      first: first.snapshot(), previousPosition: [...first.previousPosition], previousRotation: [...first.previousRotation],
      poseOverridden: first.poseOverridden, velocityOverridden: first.velocityOverridden, force: first.pendingForce(),
      second: second.snapshot(), world: world.snapshot()
    };
    expect(() => world.step(1)).toThrow(/integrated body position/);
    expect(first.snapshot()).toEqual(before.first);
    expect(first.previousPosition).toEqual(before.previousPosition);
    expect(first.previousRotation).toEqual(before.previousRotation);
    expect(first.poseOverridden).toBe(before.poseOverridden);
    expect(first.velocityOverridden).toBe(before.velocityOverridden);
    expect(first.pendingForce()).toEqual(before.force);
    expect(second.snapshot()).toEqual(before.second);
    expect(world.snapshot()).toEqual(before.world);
    world.dispose();
  });

  it("rolls back intermediate contacts and events if a later substep fails", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const fixed = world.createRigidBody({ type: "static" });
    world.createCollider(fixed, { shape: Shape.sphere(0.5), material: { friction: Number.MAX_VALUE } });
    const moving = world.createRigidBody({ position: [-1.2, 0, 0], velocity: [10, 0, 0] });
    world.createCollider(moving, { shape: Shape.sphere(0.5), material: { friction: Number.MAX_VALUE } });
    const before = world.snapshot();
    expect(() => world.step(0.1)).toThrow(/friction/);
    expect(world.snapshot()).toEqual(before);
    expect(world.drainEvents()).toEqual([]);
    world.dispose();
  });
});
