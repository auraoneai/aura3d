import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { Constraint } from "../../../packages/physics/src/Constraint.js";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeContinuousStep, type NativeContinuousPair } from "../../../packages/physics/src/native/NativeContinuousStep.js";

function fixture(id: number, shape: PhysicsShape, descriptor: RigidBodyDescriptor = {}, sensor = false) {
  const body = new RigidBody(id, descriptor);
  return { body, collider: new Collider(id, id, { shape, sensor }) };
}

function pair(first: Collider, second: Collider, restitution = 1, friction = 0): NativeContinuousPair {
  return { first, second, restitution, friction };
}

function near(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 9));
}

describe("native continuous dynamics with exact supported combinations", () => {
  it("integrates force with exponential linear damping and leaves its input untouched", () => {
    const moving = fixture(1, Shape.sphere(0.5), { type: "dynamic", mass: 2, linearDamping: Math.LN2 });
    moving.body.applyForce([4, 0, 0]);
    const before = moving.body.snapshot();
    const result = nativeContinuousStep({ bodies: [moving.body], pairs: [], duration: 2, acceleration: [0, -10, 0], constraints: [] });
    const q = 0.75 / Math.LN2, r = (2 - q) / Math.LN2;
    near(result.bodies[0]!.position, [2 * r, -10 * r, 0]);
    near(result.bodies[0]!.velocity, [2 * q, -10 * q, 0]);
    expect(result.bodies[0]!.sleeping).toBe(false);
    expect(result.diagnostics).toEqual({ trajectory: "independent-damping", impactBatches: 0, maxImpacts: 256 });
    expect(moving.body.snapshot()).toEqual(before);
    near(moving.body.pendingForce(), [4, 0, 0]);
  });

  it("integrates a principal-axis torque through an elastic continuous impact", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], inertia: [2, 3, 4] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    ball.body.applyTorque([0, 0, 4]);
    const before = ball.body.snapshot();
    const result = nativeContinuousStep({ bodies: [ball.body, wall.body], colliders: [ball.collider, wall.collider], pairs: [pair(ball.collider, wall.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts[0]!.time).toBeCloseTo(0.375, 9);
    near(result.bodies[0]!.position, [-3, 0, 0]);
    near(result.bodies[0]!.velocity, [-4, 0, 0]);
    near(result.bodies[0]!.angularVelocity, [0, 0, 1]);
    near(result.bodies[0]!.rotation, [0, 0, Math.sin(0.25), Math.cos(0.25)]);
    expect(ball.body.snapshot()).toEqual(before);
    near(ball.body.pendingTorque(), [0, 0, 4]);
  });

  it("integrates angular damping and torque without changing the collision clock", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], angularDamping: Math.LN2, inertia: [1, 1, 2] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    ball.body.applyTorque([0, 0, 4]);
    const result = nativeContinuousStep({ bodies: [ball.body, wall.body], colliders: [ball.collider, wall.collider], pairs: [pair(ball.collider, wall.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    const q = 0.5 / Math.LN2, angle = 2 * (1 - q) / Math.LN2;
    expect(result.impacts[0]!.time).toBeCloseTo(0.375, 9);
    near(result.bodies[0]!.angularVelocity, [0, 0, 2 * q]);
    near(result.bodies[0]!.rotation, [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]);
  });

  it("maps damped impact and sensor times from a common geometric clock", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], linearDamping: Math.LN2 });
    const sensor = fixture(2, Shape.sphere(0.1), { type: "static", position: [-1, 0, 0] }, true);
    const wall = fixture(3, Shape.plane([-1, 0, 0]), { type: "static" });
    const pairs = [pair(ball.collider, wall.collider), pair(ball.collider, sensor.collider)];
    const input = { bodies: [ball.body, sensor.body, wall.body], pairs, duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] };
    const result = nativeContinuousStep(input);
    const reversed = nativeContinuousStep({ ...input, pairs: [...pairs].reverse() });
    expect(result).toEqual(reversed);
    const time = (q: number) => -Math.log1p(-Math.LN2 * q) / Math.LN2;
    expect(result.impacts).toHaveLength(1);
    expect(result.diagnostics).toEqual({ trajectory: "shared-damping-clock", impactBatches: 1, maxImpacts: 256 });
    expect(result.impacts[0]!.time).toBeCloseTo(time(0.375), 9);
    expect(result.impacts[0]!.impulse).toBeCloseTo(8 * (1 - Math.LN2 * 0.375), 9);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    expect(result.sensorEvents[0]!.time).toBeCloseTo(time(0.1), 9);
    expect(result.sensorEvents[1]!.time).toBeCloseTo(time(0.65), 9);
    near(result.bodies[0]!.position, [-0.5 - 4 * (0.5 / Math.LN2 - 0.375), 0, 0]);
    near(result.bodies[0]!.velocity, [-2, 0, 0]);
  });

  it("keeps sleepers frozen through gravity and sensor crossings", () => {
    const sleeper = fixture(1, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const sensor = fixture(2, Shape.sphere(0.5), { type: "kinematic", position: [-2, 0, 0], velocity: [4, 0, 0] }, true);
    const result = nativeContinuousStep({ bodies: [sleeper.body, sensor.body], pairs: [pair(sleeper.collider, sensor.collider)], duration: 1, acceleration: [0, -10, 0], constraints: [] });
    near(result.bodies[0]!.position, [0, 0, 0]);
    near(result.bodies[0]!.velocity, [0, 0, 0]);
    expect(result.bodies[0]!.sleeping).toBe(true);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    expect(sleeper.body.sleeping).toBe(true);
  });

  it("wakes on impact and applies a pending force only during the remaining interval", () => {
    const striker = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const sleeper = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    sleeper.body.applyForce([4, 0, 0]);
    // The public flag can be set directly; sleep() itself clears forces.
    sleeper.body.sleeping = true;
    const before = [striker.body.snapshot(), sleeper.body.snapshot()];
    const result = nativeContinuousStep({ bodies: [striker.body, sleeper.body], pairs: [pair(striker.collider, sleeper.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts[0]!.time).toBeCloseTo(0.25, 9);
    expect(result.bodies[1]!.sleeping).toBe(false);
    near(result.bodies[1]!.position, [4.125, 0, 0]);
    near(result.bodies[1]!.velocity, [7, 0, 0]);
    expect([striker.body.snapshot(), sleeper.body.snapshot()]).toEqual(before);
    near(sleeper.body.pendingForce(), [4, 0, 0]);
  });

  it("applies gravity to a sleeping body after it is struck", () => {
    const striker = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [3.5, 0, 0] });
    const sleeper = fixture(2, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const result = nativeContinuousStep({ bodies: [striker.body, sleeper.body], pairs: [pair(striker.collider, sleeper.collider)], duration: 1, acceleration: [4, 0, 0], constraints: [] });
    expect(result.impacts[0]!.time).toBeCloseTo(0.25, 9);
    expect(result.bodies[1]!.sleeping).toBe(false);
    near(result.bodies[1]!.position, [4.5, 0, 0]);
    near(result.bodies[1]!.velocity, [7.5, 0, 0]);
    expect(sleeper.body.sleeping).toBe(true);
  });

  it("propagates wake along touching dynamic bodies in collider order", () => {
    const awake = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-1, 0, 0] });
    const first = fixture(2, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const second = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [1, 0, 0], sleeping: true });
    const pairs = [pair(first.collider, second.collider), pair(awake.collider, first.collider)];
    const input = { bodies: [awake.body, first.body, second.body], pairs, duration: 0.1, acceleration: [0, -2, 0] as Vec3, constraints: [] };
    const result = nativeContinuousStep(input);
    expect(result.bodies.map((body) => body.sleeping)).toEqual([false, false, false]);
    for (const body of result.bodies) near(body.velocity, [0, -0.2, 0]);
    expect(result).toEqual(nativeContinuousStep({ ...input, pairs: [...pairs].reverse() }));
  });

  it("propagates wake at an impact exactly at the step boundary", () => {
    const striker = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [1, 0, 0] });
    const center = fixture(2, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const neighbor = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [0, 1, 0], sleeping: true });
    const result = nativeContinuousStep({ bodies: [striker.body, center.body, neighbor.body], pairs: [pair(striker.collider, center.collider), pair(center.collider, neighbor.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBe(1);
    expect(result.bodies.map((body) => body.sleeping)).toEqual([false, false, false]);
    near(result.bodies[1]!.velocity, [1, 0, 0]);
    near(result.bodies[2]!.velocity, [0, 0, 0]);
  });

  it("allows satisfied passive joints but refuses an impact requiring joint impulses", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", velocity: [1, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic", velocity: [1, 0, 0] });
    const joint = new Constraint({ type: "ball-socket", bodyA: a.body, bodyB: b.body });
    const common = { bodies: [a.body, b.body], pairs: [], duration: 1, acceleration: [0, -2, 0] as Vec3, constraints: [joint] };
    const result = nativeContinuousStep(common);
    near(result.bodies[0]!.position, [1, -1, 0]);
    near(result.bodies[1]!.position, [1, -1, 0]);
    near(result.bodies[0]!.velocity, [1, -2, 0]);

    const targetA = fixture(1, Shape.sphere(0.5), { type: "dynamic" });
    const targetB = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const shot = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const fixed = new Constraint({ type: "ball-socket", bodyA: targetA.body, bodyB: targetB.body });
    const before = [targetA.body.snapshot(), targetB.body.snapshot(), shot.body.snapshot()];
    expect(() => nativeContinuousStep({ bodies: [targetA.body, targetB.body, shot.body], pairs: [pair(targetA.collider, shot.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [fixed] })).toThrow(/constraint impact.*coupled solver/);
    expect([targetA.body.snapshot(), targetB.body.snapshot(), shot.body.snapshot()]).toEqual(before);
  });

  it("rejects a joint when only one body receives a plane support force", () => {
    const supported = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const other = fixture(2, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const floor = fixture(3, Shape.plane(), { type: "static" });
    const joint = new Constraint({ type: "ball-socket", bodyA: supported.body, bodyB: other.body });
    const before = [supported.body.snapshot(), other.body.snapshot(), floor.body.snapshot()];
    expect(() => nativeContinuousStep({ bodies: [supported.body, other.body, floor.body], pairs: [pair(supported.collider, floor.collider, 0)], duration: 1, acceleration: [0, -10, 0], constraints: [joint] })).toThrow(/constraint support.*coupled solver/);
    expect([supported.body.snapshot(), other.body.snapshot(), floor.body.snapshot()]).toEqual(before);
  });

  it("accepts an equilibrium spring and disabled constraints", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [1, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic", velocity: [1, 0, 0] });
    const spring = new Constraint({ type: "spring", bodyA: a.body, bodyB: b.body, stiffness: 0.5, damping: 0.2 });
    const disabled = new Constraint({ type: "fixed", bodyA: a.body, bodyB: b.body });
    disabled.setEnabled(false);
    const input = { bodies: [a.body, b.body], pairs: [], duration: 1, acceleration: [0, -2, 0] as Vec3, constraints: [spring, disabled] };
    const result = nativeContinuousStep(input);
    near(result.bodies[0]!.position, [-1, -1, 0]);
    near(result.bodies[1]!.position, [1, -1, 0]);
    b.body.velocity = [2, 0, 0];
    expect(() => nativeContinuousStep(input)).toThrow(/identical unforced relative motion/);
  });

  it("wakes an initially connected passive joint island independent of joint order", () => {
    const awake = fixture(1, Shape.sphere(0.5), { type: "dynamic" });
    const middle = fixture(2, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const end = fixture(3, Shape.sphere(0.5), { type: "dynamic", sleeping: true });
    const first = new Constraint({ type: "ball-socket", bodyA: awake.body, bodyB: middle.body });
    const second = new Constraint({ type: "ball-socket", bodyA: middle.body, bodyB: end.body });
    const input = { bodies: [awake.body, middle.body, end.body], pairs: [], duration: 1, acceleration: [0, -2, 0] as Vec3, constraints: [second, first] };
    const result = nativeContinuousStep(input);
    expect(result.bodies.map((body) => body.sleeping)).toEqual([false, false, false]);
    for (const body of result.bodies) {
      near(body.position, [0, -1, 0]);
      near(body.velocity, [0, -2, 0]);
    }
    expect(result).toEqual(nativeContinuousStep({ ...input, constraints: [first, second] }));
    expect(middle.body.sleeping).toBe(true);
    expect(end.body.sleeping).toBe(true);
  });

  it("rejects unsupported damping, torque axes, and inconsistent sleep transactionally", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], linearDamping: 1 });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const common = { bodies: [a.body, b.body], pairs: [pair(a.collider, b.collider)], duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] };
    const before = [a.body.snapshot(), b.body.snapshot()];
    expect(() => nativeContinuousStep(common)).toThrow(/same positive linear damping/);
    expect([a.body.snapshot(), b.body.snapshot()]).toEqual(before);
    b.body.linearDamping = 1;
    expect(() => nativeContinuousStep({ ...common, acceleration: [0, -1, 0] })).toThrow(/zero net acceleration/);
    a.body.linearDamping = 0; b.body.linearDamping = 0;
    a.body.angularVelocity = [1, 0, 0];
    a.body.applyTorque([0, 0, 1]);
    expect(() => nativeContinuousStep({ ...common, colliders: [a.collider, b.collider] })).toThrow(/principal spin axis/);
    a.body.angularVelocity = [0, 0, 0]; a.body.clearForces();
    b.body.sleeping = true; b.body.velocity = [1, 0, 0];
    expect(() => nativeContinuousStep(common)).toThrow(/sleeping bodies require zero/);
    b.body.sleeping = false;
    expect(() => nativeContinuousStep({ ...common, maxImpacts: 4097 })).toThrow(/1 to 4096/);
  });
});
