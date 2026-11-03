import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeContinuousStep, type NativeContinuousPair } from "../../../packages/physics/src/native/NativeContinuousStep.js";
import { setNativeMassProperties } from "../../../packages/physics/src/native/NativeMassProperties.js";

function fixture(id: number, shape: PhysicsShape, descriptor: RigidBodyDescriptor = {}, sensor = false) {
  const body = new RigidBody(id, descriptor);
  return { body, collider: new Collider(id, id, { shape, sensor }) };
}
function pair(first: Collider, second: Collider, restitution = 1, friction = 0): NativeContinuousPair {
  return { first, second, restitution, friction };
}
function run(bodies: readonly RigidBody[], pairs: readonly NativeContinuousPair[], duration = 1, activeSensors: readonly (readonly [number, number])[] = []) {
  return nativeContinuousStep({ bodies, pairs, duration, acceleration: [0, 0, 0], constraints: [], activeSensors });
}
function bodyState(result: ReturnType<typeof run>, id: number) {
  const state = result.bodies.find((body) => body.id === id);
  if (!state) throw new Error("Missing body result.");
  return state;
}
function near(actual: readonly number[], expected: Vec3) { actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 9)); }

describe("isolated event-driven native continuous step", () => {
  it("advances every body through a central elastic impact without mutating inputs", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const before = [a.body.snapshot(), b.body.snapshot()];
    const result = run([a.body, b.body], [pair(a.collider, b.collider)]);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(0.25, 10);
    near(bodyState(result, 1).position, [-1, 0, 0]);
    near(bodyState(result, 1).velocity, [0, 0, 0]);
    near(bodyState(result, 2).position, [3, 0, 0]);
    near(bodyState(result, 2).velocity, [4, 0, 0]);
    expect(result.contactTransitions.map((event) => event.type)).toEqual(["begin", "end"]);
    for (const event of result.contactTransitions) {
      expect(event.time).toBeCloseTo(0.25, 9);
      near(event.normal, [1, 0, 0]);
      near(event.point, [-0.5, 0, 0]);
      expect(event.sensor).toBe(false);
    }
    expect(result.activeContacts).toEqual([]);
    expect([a.body.snapshot(), b.body.snapshot()]).toEqual(before);
  });

  it("uses relative velocity for contacts between bodies moving quickly together", () => {
    const speed = 1e14;
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [speed, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic", velocity: [speed - 1, 0, 0] });
    const result = run([a.body, b.body], [pair(a.collider, b.collider)], 2);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(1, 9);
    expect(bodyState(result, 1).velocity[0]).toBe(speed - 1);
    expect(bodyState(result, 2).velocity[0]).toBe(speed);
  });

  it("advances unpaired dynamic bodies under constant acceleration without moving static bodies", () => {
    const moving = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [1, 10, 0], velocity: [2, 3, 0] });
    const fixed = fixture(2, Shape.sphere(0.5), { type: "static", position: [0, 7, 0] });
    const kinematic = fixture(3, Shape.sphere(0.5), { type: "kinematic", position: [0, 5, 0], velocity: [1, 0, 0] });
    const result = nativeContinuousStep({ bodies: [moving.body, fixed.body, kinematic.body], pairs: [], duration: 2, acceleration: [0, -9.8, 0], constraints: [] });
    near(bodyState(result, 1).position, [5, -3.6, 0]);
    near(bodyState(result, 1).velocity, [2, -16.6, 0]);
    near(bodyState(result, 2).position, [0, 7, 0]);
    near(bodyState(result, 3).position, [2, 5, 0]);
  });

  it("integrates constant pending force without consuming it", () => {
    const moving = fixture(1, Shape.sphere(0.5), { type: "dynamic", mass: 2 });
    moving.body.applyForce([4, 0, 0]);
    const before = moving.body.snapshot();
    const result = nativeContinuousStep({ bodies: [moving.body], pairs: [], duration: 2, acceleration: [0, -10, 0], constraints: [] });
    near(bodyState(result, 1).position, [4, -20, 0]);
    near(bodyState(result, 1).velocity, [4, -20, 0]);
    expect(moving.body.snapshot()).toEqual(before);
    near(moving.body.pendingForce(), [4, 0, 0]);
  });

  it("keeps constant force through a sphere-plane impact without consuming it", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 2, 0], mass: 2 });
    ball.body.applyForce([0, -20, 0]);
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const before = ball.body.snapshot(), t = Math.sqrt(0.3), remaining = 1 - t, speed = 10 * t;
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(t, 9);
    near(result.impacts[0]!.point, [0, 0, 0]);
    expect(bodyState(result, 1).position[1]).toBeCloseTo(0.5 + speed * remaining - 5 * remaining ** 2, 9);
    expect(bodyState(result, 1).velocity[1]).toBeCloseTo(speed - 10 * remaining, 9);
    expect(ball.body.snapshot()).toEqual(before);
    near(ball.body.pendingForce(), [0, -20, 0]);
  });

  it("retains constant force across multiple accelerated impacts", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 1.5, 0] });
    ball.body.applyForce([0, -8, 0]);
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider)], duration: 2, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts).toHaveLength(2);
    expect(result.impacts[0]!.time).toBeCloseTo(0.5, 9);
    expect(result.impacts[1]!.time).toBeCloseTo(1.5, 9);
    near(bodyState(result, 1).position, [0, 1.5, 0]);
    near(bodyState(result, 1).velocity, [0, 0, 0]);
    near(ball.body.pendingForce(), [0, -8, 0]);
  });

  it("retains two accelerated sphere-sensor windows with distinct exit witnesses", () => {
    const ball = fixture(1, Shape.sphere(0.1), { type: "dynamic", velocity: [0, 4, 0] });
    const sensor = fixture(2, Shape.sphere(0.1), { type: "static", position: [0, 0.6, 0] }, true);
    const result = nativeContinuousStep({ bodies: [ball.body, sensor.body], pairs: [pair(ball.collider, sensor.collider)], duration: 1, acceleration: [0, -8, 0], constraints: [] });
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit", "enter", "exit"]);
    const expected = [(1 - Math.sqrt(0.6)) / 2, (1 - Math.sqrt(0.2)) / 2, (1 + Math.sqrt(0.2)) / 2, (1 + Math.sqrt(0.6)) / 2];
    for (let i = 0; i < expected.length; i++) expect(result.sensorEvents[i]!.time).toBeCloseTo(expected[i]!, 9);
    for (const [i, event] of result.sensorEvents.entries()) {
      near(event.point, [0, i === 0 || i === 3 ? 0.5 : 0.7, 0]);
      near(event.normal, [0, i === 0 || i === 3 ? 1 : -1, 0]);
    }
  });

  it("holds a centered sphere resting on a static plane under gravity", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const before = ball.body.snapshot();
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider)], duration: 1, acceleration: [0, -10, 0], constraints: [] });
    near(bodyState(result, 1).position, [0, 0.5, 0]);
    near(bodyState(result, 1).velocity, [0, 0, 0]);
    expect(result.impacts).toEqual([]);
    expect(result.contactTransitions.map((event) => event.type)).toEqual(["begin", "persist"]);
    near(result.activeContacts[0]!.normal, [0, -1, 0]);
    near(result.activeContacts[0]!.point, [0, 0, 0]);
    expect(ball.body.snapshot()).toEqual(before);
  });

  it("holds an inelastic landing on a plane and retains force", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 1.5, 0] });
    ball.body.applyForce([0, -8, 0]);
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const before = ball.body.snapshot();
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(0.5, 9);
    near(bodyState(result, 1).position, [0, 0.5, 0]);
    near(bodyState(result, 1).velocity, [0, 0, 0]);
    expect(result.contactTransitions.map((event) => event.type)).toEqual(["begin", "persist"]);
    expect(ball.body.snapshot()).toEqual(before);
    near(ball.body.pendingForce(), [0, -8, 0]);
  });

  it("projects gravity onto a frictionless slope and retains its world witness", () => {
    const normal = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic" });
    const plane = fixture(2, Shape.plane(normal, -0.5), { type: "static" });
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 1, acceleration: [0, -10, 0], constraints: [] });
    near(bodyState(result, 1).position, [0, -2.5, 2.5]);
    near(bodyState(result, 1).velocity, [0, -5, 5]);
    near(result.activeContacts[0]!.normal, [0, -Math.SQRT1_2, -Math.SQRT1_2]);
    near(result.activeContacts[0]!.point, [0, -2.5 - 0.5 * Math.SQRT1_2, 2.5 - 0.5 * Math.SQRT1_2]);
  });

  it("rejects a rounded-zero but exactly penetrating sloped contact without mutation", () => {
    const normal = [0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, Math.SQRT1_2 / 2, Math.SQRT1_2 / 2] });
    const plane = fixture(2, Shape.plane(normal), { type: "static" });
    const before = ball.body.snapshot();
    expect(() => nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 1, acceleration: [0, -10, 0], constraints: [] })).toThrow(/penetrating/);
    expect(ball.body.snapshot()).toEqual(before);
  });

  it("keeps a sloped support across successive steps", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic" });
    const slopedShape = Shape.plane([0, 0.6, 0.8]);
    const plane = fixture(2, { ...slopedShape, constant: -0.5 * Math.hypot(...slopedShape.normal) }, { type: "static" });
    const common = { bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 1, acceleration: [0, -10, 0] as Vec3, constraints: [] };
    const first = nativeContinuousStep(common), firstState = bodyState(first, 1);
    expect(first.activeContacts[0]!.supportState).toMatchObject({ sphereBodyId: 1, planeBodyId: 2, spherePosition: firstState.position, sphereVelocity: firstState.velocity });
    ball.body.position = [...firstState.position];
    ball.body.velocity = [...firstState.velocity];
    const second = nativeContinuousStep({ ...common, activeContacts: first.activeContacts });
    near(bodyState(second, 1).position, [0, -12.8, 9.6]);
    near(bodyState(second, 1).velocity, [0, -12.8, 9.6]);
    expect(second.contactTransitions.map((event) => event.type)).toEqual(["persist"]);
  });

  it.each([[1, 2], [2, 1]])("lands from a representable near-gap onto a sloped plane (sphere %i, plane %i)", (sphereId, planeId) => {
    const ball = fixture(sphereId!, Shape.sphere(0.5), { type: "dynamic" });
    const plane = fixture(planeId!, Shape.plane([0, 0.6, 0.8], -0.5), { type: "static" });
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 0.1, acceleration: [0, -10, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeGreaterThan(0);
    near(bodyState(result, sphereId!).position, [0, -0.032, 0.024]);
    near(bodyState(result, sphereId!).velocity, [0, -0.64, 0.48]);
    expect(result.activeContacts[0]!.supportState).toBeDefined();
  });

  it("does not reuse a plane support witness after a body or geometry changes", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const common = { bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 0.1, acceleration: [0, -10, 0] as Vec3, constraints: [] };
    const first = nativeContinuousStep(common);
    const prior = { ...common, activeContacts: first.activeContacts };

    ball.body.velocity = [0, 1, 0];
    const released = nativeContinuousStep(prior);
    expect(bodyState(released, 1).position[1]).toBeGreaterThan(0.5);
    expect(released.contactTransitions.some((event) => event.type === "end")).toBe(true);
    ball.body.velocity = [0, 0, 0];

    ball.body.position = [0, 0.5 + 2 ** -45, 0];
    const gapped = nativeContinuousStep({ ...prior, acceleration: [0, 0, 0] });
    expect(gapped.activeContacts).toHaveLength(0);
    expect(gapped.contactTransitions.map((event) => event.type)).toEqual(["end"]);
    ball.body.position = [0, 0.5 - 2 ** -45, 0];
    const penetrated = ball.body.snapshot();
    expect(() => nativeContinuousStep(prior)).toThrow(/penetrating/);
    expect(ball.body.snapshot()).toEqual(penetrated);
    ball.body.position = [0, 0.5, 0];

    plane.body.position = [0, -1, 0];
    expect(nativeContinuousStep({ ...prior, acceleration: [0, 0, 0] }).activeContacts).toHaveLength(0);
    plane.body.position = [0, 0, 0];
    plane.body.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    expect(() => nativeContinuousStep(prior)).toThrow(/penetrating/);
    plane.body.rotation = [0, 0, 0, 1];
    const larger = fixture(1, Shape.sphere(0.6), { type: "dynamic" });
    expect(() => nativeContinuousStep({ ...prior, pairs: [pair(larger.collider, plane.collider, 0)] })).toThrow(/penetrating/);
    const shiftedPlane = fixture(2, Shape.plane([0, 1, 0], -0.25), { type: "static" });
    expect(nativeContinuousStep({ ...prior, pairs: [pair(ball.collider, shiftedPlane.collider, 0)], acceleration: [0, 0, 0] }).activeContacts).toHaveLength(0);
  });

  it("rejects an unmatched prior state with an ambiguous tiny normal velocity", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0], velocity: [1, 0, 0] });
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const common = { bodies: [ball.body, plane.body], pairs: [pair(ball.collider, plane.collider, 0)], duration: 1, acceleration: [0, -10, 0] as Vec3, constraints: [] };
    const first = nativeContinuousStep(common), state = bodyState(first, 1);
    ball.body.position = [...state.position];
    ball.body.velocity = [state.velocity[0], 2 ** -50, state.velocity[2]];
    const changed = ball.body.snapshot();
    expect(() => nativeContinuousStep({ ...common, activeContacts: first.activeContacts })).toThrow(/ambiguous unmatched prior velocity/);
    expect(ball.body.snapshot()).toEqual(changed);
  });

  it("releases support when a subsequent central impact sends the sphere away", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const plane = fixture(2, Shape.plane(), { type: "static" });
    // A 3-4-5 impact triangle has an exactly representable initial contact.
    const striker = fixture(3, Shape.sphere(0.125), { type: "kinematic", position: [-2, 0.125, 0], velocity: [8, 0, 0] });
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body, striker.body], pairs: [pair(ball.collider, plane.collider, 0), pair(ball.collider, striker.collider, 1), pair(plane.collider, striker.collider, 0)], duration: 0.25, acceleration: [0, -10, 0], constraints: [] });
    expect(result.impacts.some((impact) => impact.pair[0] === 1 && impact.pair[1] === 3)).toBe(true);
    expect(bodyState(result, 1).position[1]).toBeGreaterThan(0.5);
    expect(result.activeContacts.some((contact) => contact.pair[0] === 1 && contact.pair[1] === 2)).toBe(false);
    expect(result.contactTransitions.some((event) => event.type === "end" && event.pair[0] === 1 && event.pair[1] === 2)).toBe(true);
  });

  it("includes an existing support in a simultaneous central impact solve", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5, 0] });
    const plane = fixture(2, Shape.plane(), { type: "static" });
    const striker = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [0, 2.5, 0] });
    const result = nativeContinuousStep({ bodies: [ball.body, plane.body, striker.body], pairs: [pair(ball.collider, plane.collider, 0), pair(ball.collider, striker.collider, 1), pair(plane.collider, striker.collider, 0)], duration: 1, acceleration: [0, -8, 0], constraints: [] });
    near(bodyState(result, 1).position, [0, 0.5, 0]);
    near(bodyState(result, 1).velocity, [0, 0, 0]);
    near(bodyState(result, 3).position, [0, 2.5, 0]);
    near(bodyState(result, 3).velocity, [0, 0, 0]);
    expect(result.impacts.map((impact) => impact.pair)).toEqual([[1, 2], [1, 3]]);
    expect(result.activeContacts.some((contact) => contact.pair[0] === 1 && contact.pair[1] === 2)).toBe(true);
  });

  it("rejects multiple supports, tangential friction, and offset COM without mutation", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0.5, 0.5, 0] });
    const floor = fixture(2, Shape.plane(), { type: "static" });
    const wall = fixture(3, Shape.plane([1, 0, 0]), { type: "static" });
    const base = { bodies: [ball.body, floor.body, wall.body], pairs: [pair(ball.collider, floor.collider, 0), pair(ball.collider, wall.collider, 0)], duration: 1, acceleration: [-1, -10, 0] as Vec3, constraints: [] };
    const before = ball.body.snapshot();
    expect(() => nativeContinuousStep(base)).toThrow(/multiple.*support/);
    expect(ball.body.snapshot()).toEqual(before);
    expect(() => nativeContinuousStep({ ...base, pairs: [pair(ball.collider, floor.collider, 0, 0.5)] })).toThrow(/tangential friction/);
    setNativeMassProperties(ball.body, { mass: 1, volume: 1, center: [0, 0.2, 0], inertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], inverseInertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    expect(() => nativeContinuousStep({ ...base, pairs: [pair(ball.collider, floor.collider, 0)], acceleration: [0, -10, 0] })).toThrow(/centered sphere center of mass/);
    expect(ball.body.snapshot()).toEqual(before);
  });

  it("uses equal acceleration for exact relative impacts and world-space witnesses", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 10, 0], velocity: [4, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic", position: [0, 10, 0] });
    const result = nativeContinuousStep({ bodies: [a.body, b.body], pairs: [pair(a.collider, b.collider, 1, 0.5)], duration: 1, acceleration: [0, -10, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(0.25, 9);
    near(result.impacts[0]!.point, [-0.5, 9.6875, 0]);
    near(result.contactTransitions[0]!.point, [-0.5, 9.6875, 0]);
    near(bodyState(result, 1).position, [-1, 5, 0]);
    near(bodyState(result, 2).position, [3, 5, 0]);
    near(bodyState(result, 1).velocity, [0, -10, 0]);
    near(bodyState(result, 2).velocity, [4, -10, 0]);
  });

  it("applies common acceleration to entry and exit witnesses, including reversed casts", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 10, 0], velocity: [4, 0, 0] });
    const sensor = fixture(2, Shape.box(0.5, 0.5, 0.5), { type: "dynamic", position: [0, 10, 0] }, true);
    const result = nativeContinuousStep({ bodies: [ball.body, sensor.body], pairs: [pair(ball.collider, sensor.collider)], duration: 1, acceleration: [0, -10, 0], constraints: [] });
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    expect(result.sensorEvents[0]!.time).toBeCloseTo(0.25, 9);
    expect(result.sensorEvents[1]!.time).toBeCloseTo(0.75, 9);
    near(result.sensorEvents[0]!.point, [-0.5, 9.6875, 0]);
    near(result.sensorEvents[1]!.point, [0.5, 7.1875, 0]);
  });

  it("advances principal-axis sphere spin exactly through a frictionless reflection", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], angularVelocity: [0, 0, 2], inertia: [2, 3, 4] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    const before = ball.body.snapshot();
    const result = nativeContinuousStep({ bodies: [ball.body, wall.body], colliders: [ball.collider, wall.collider], pairs: [pair(ball.collider, wall.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeCloseTo(0.375, 9);
    near(bodyState(result, 1).position, [-3, 0, 0]);
    near(bodyState(result, 1).velocity, [-4, 0, 0]);
    near(bodyState(result, 1).angularVelocity, [0, 0, 2]);
    expect(bodyState(result, 1).rotation[2]).toBeCloseTo(Math.sin(1), 10);
    expect(bodyState(result, 1).rotation[3]).toBeCloseTo(Math.cos(1), 10);
    expect(ball.body.snapshot()).toEqual(before);
  });

  it("applies world-space spin on the left of an existing body orientation", () => {
    const q = [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", rotation: q, angularVelocity: [0, 0, 2] });
    const result = nativeContinuousStep({ bodies: [ball.body], colliders: [ball.collider], pairs: [], duration: 1, acceleration: [0, 0, 0], constraints: [] });
    const rotation = bodyState(result, 1).rotation;
    expect(rotation[0]).toBeCloseTo(Math.SQRT1_2 * Math.cos(1), 10);
    expect(rotation[1]).toBeCloseTo(Math.SQRT1_2 * Math.sin(1), 10);
    expect(rotation[2]).toBeCloseTo(Math.SQRT1_2 * Math.sin(1), 10);
    expect(rotation[3]).toBeCloseTo(Math.SQRT1_2 * Math.cos(1), 10);
  });

  it("uses angular contact velocity to reject slipping friction and permits pure rolling", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0], angularVelocity: [0, 0, 2] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    const input = { bodies: [ball.body, wall.body], colliders: [ball.collider, wall.collider], pairs: [pair(ball.collider, wall.collider, 1, 0.5)], duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] };
    const before = ball.body.snapshot();
    expect(() => nativeContinuousStep(input)).toThrow(/tangential friction/);
    expect(ball.body.snapshot()).toEqual(before);
    const rolling = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, -1, 0], angularVelocity: [0, 0, 2] });
    const result = nativeContinuousStep({ ...input, bodies: [rolling.body, wall.body], colliders: [rolling.collider, wall.collider], pairs: [pair(rolling.collider, wall.collider, 1, 0.5)] });
    expect(result.impacts).toHaveLength(1);
    near(bodyState(result, 1).velocity, [-4, -1, 0]);
    near(bodyState(result, 1).angularVelocity, [0, 0, 2]);
  });

  it("requires a complete sphere inventory and rejects gyroscopic or off-center spin", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", angularVelocity: [1, 1, 0], inertia: [1, 2, 3] });
    const base = { bodies: [ball.body], pairs: [], duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] };
    expect(() => nativeContinuousStep(base)).toThrow(/collider inventory/);
    expect(() => nativeContinuousStep({ ...base, colliders: [ball.collider] })).toThrow(/gyroscopic/);
    ball.body.angularVelocity = [1e-200, 1e-200, 0];
    expect(() => nativeContinuousStep({ ...base, colliders: [ball.collider] })).toThrow(/gyroscopic/);
    ball.body.angularVelocity = [1, 0, 0];
    const extra = new Collider(3, 1, { shape: Shape.box(0.5, 0.5, 0.5) });
    expect(() => nativeContinuousStep({ ...base, colliders: [ball.collider, extra] })).toThrow(/only bodies with centered sphere/);
    setNativeMassProperties(ball.body, { mass: 1, volume: 1, center: [0, 0.2, 0], inertia: [[1, 0, 0], [0, 2, 0], [0, 0, 3]], inverseInertia: [[1, 0, 0], [0, 0.5, 0], [0, 0, 1 / 3]] });
    expect(() => nativeContinuousStep({ ...base, colliders: [ball.collider] })).toThrow(/centered center of mass/);
  });

  it("allows positive friction when a central impact has no tangential motion", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const frictionless = run([a.body, b.body], [pair(a.collider, b.collider, 1, 0)]);
    const frictional = run([a.body, b.body], [pair(a.collider, b.collider, 1, 0.7)]);
    expect(frictional).toEqual(frictionless);
  });

  it("rejects tangential friction and cross-coupled simultaneous slip transactionally", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0.5, 0], velocity: [4, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "static" });
    const before = a.body.snapshot();
    expect(() => run([a.body, b.body], [pair(a.collider, b.collider, 1, 0.5)])).toThrow(/tangential friction/);
    expect(a.body.snapshot()).toEqual(before);
    const left = fixture(1, Shape.sphere(0.5), { type: "kinematic", position: [-2, 0, 0], velocity: [1, 0, 0] });
    const center = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const down = fixture(3, Shape.sphere(0.5), { type: "kinematic", position: [0, -2, 0], velocity: [0, 1, 0] });
    const centerBefore = center.body.snapshot();
    expect(() => run([left.body, center.body, down.body], [pair(left.collider, center.collider, 1, 0.5), pair(center.collider, down.collider, 1, 0.5)], 2)).toThrow(/tangential friction/);
    expect(center.body.snapshot()).toEqual(centerBefore);
  });

  it("does not discard a CCD-confirmed shallow entering impact", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [0, 0.5 + 1.5e-14, 0], velocity: [1, 0, 0] });
    const plane = fixture(2, Shape.plane([-3e-14, 1, 0]), { type: "static" });
    const result = run([ball.body, plane.body], [pair(ball.collider, plane.collider)]);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeGreaterThan(0.4);
    expect(result.impacts[0]!.time).toBeLessThan(0.6);
    expect(bodyState(result, 1).velocity[1]).toBeGreaterThan(0);
  });

  it("recasts after each reflection so later impacts use the new trajectory", () => {
    const ball = fixture(1, Shape.sphere(0.25), { type: "dynamic", velocity: [10, 0, 0] });
    const right = fixture(2, Shape.plane([-1, 0, 0]), { type: "static", position: [2, 0, 0] });
    const left = fixture(3, Shape.plane([1, 0, 0]), { type: "static", position: [-2, 0, 0] });
    const result = run([ball.body, right.body, left.body], [pair(ball.collider, right.collider), pair(ball.collider, left.collider)]);
    expect(result.impacts.map((impact) => impact.time)).toHaveLength(3);
    for (const [actual, expected] of result.impacts.map((impact, i) => [impact.time, [0.175, 0.525, 0.875][i]!] as const)) expect(actual).toBeCloseTo(expected, 9);
    near(bodyState(result, 1).position, [0.5, 0, 0]);
    near(bodyState(result, 1).velocity, [-10, 0, 0]);
  });

  it("solves simultaneous central impacts independently of pair input order", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [1, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const c = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [2, 0, 0], velocity: [-1, 0, 0] });
    const pairs = [pair(a.collider, b.collider), pair(b.collider, c.collider)];
    const result = run([a.body, b.body, c.body], pairs, 2);
    const reversed = run([a.body, b.body, c.body], [...pairs].reverse(), 2);
    expect(result).toEqual(reversed);
    expect(result.impacts.map((hit) => hit.pair)).toEqual([[1, 2], [2, 3]]);
    near(bodyState(result, 1).velocity, [-1, 0, 0]);
    near(bodyState(result, 2).velocity, [0, 0, 0]);
    near(bodyState(result, 3).velocity, [1, 0, 0]);
    near(bodyState(result, 1).position, [-2, 0, 0]);
    near(bodyState(result, 3).position, [2, 0, 0]);
  });

  it("includes an already touching stationary pair in a simultaneous impact", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [2, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic" });
    const c = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [1, 0, 0] });
    const result = run([a.body, b.body, c.body], [pair(a.collider, b.collider), pair(b.collider, c.collider)]);
    expect(result.impacts.map((hit) => hit.pair)).toEqual([[1, 2], [2, 3]]);
    near(bodyState(result, 1).velocity, [-2 / 3, 0, 0]);
    near(bodyState(result, 2).velocity, [4 / 3, 0, 0]);
    near(bodyState(result, 3).velocity, [4 / 3, 0, 0]);
  });

  it("includes an initially separating contact when another simultaneous impulse would close it", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-1, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "dynamic", velocity: [1, 0, 0] });
    const c = fixture(3, Shape.sphere(0.5), { type: "dynamic", position: [1, 0, 0], velocity: [-1, 0, 0] });
    const result = run([a.body, b.body, c.body], [pair(a.collider, b.collider), pair(b.collider, c.collider)]);
    expect(result.impacts.map((hit) => hit.pair)).toEqual([[1, 2], [2, 3]]);
    near(bodyState(result, 1).velocity, [-2 / 3, 0, 0]);
    near(bodyState(result, 2).velocity, [-2 / 3, 0, 0]);
    near(bodyState(result, 3).velocity, [4 / 3, 0, 0]);
  });

  it("advances the remaining distance even when an impact occurs just before the end", () => {
    const speed = 1e14;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", velocity: [speed, 0, 0] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static", position: [speed - 0.5, 0, 0] });
    const result = run([ball.body, wall.body], [pair(ball.collider, wall.collider)]);
    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]!.time).toBeLessThan(1);
    expect(bodyState(result, 1).position[0]).toBeLessThan(speed - 1.5);
    expect(bodyState(result, 1).velocity[0]).toBe(-speed);
  });

  it("does not invent a sensor crossing just beyond a near-end wall impact", () => {
    const speed = 1e14;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", velocity: [speed, 0, 0] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static", position: [speed - 0.5, 0, 0] });
    const sensor = fixture(3, Shape.sphere(0.1), { type: "static", position: [speed + 0.5, 0, 0] }, true);
    const result = run([ball.body, wall.body, sensor.body], [pair(ball.collider, wall.collider), pair(ball.collider, sensor.collider)]);
    expect(result.impacts).toHaveLength(1);
    expect(result.sensorEvents).toEqual([]);
    expect(result.activeSensors).toEqual([]);
  });

  it("does not combine a nearby later wall with the first impact", () => {
    const speed = 1e14;
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", velocity: [speed, 0, 0] });
    const first = fixture(2, Shape.plane([-1, 0, 0]), { type: "static", position: [speed - 0.5, 0, 0] });
    const later = fixture(3, Shape.plane([-1, 0, 0]), { type: "static", position: [speed + 0.5, 0, 0] });
    const result = run([ball.body, first.body, later.body], [pair(ball.collider, first.collider, 0), pair(ball.collider, later.collider, 1)]);
    expect(result.impacts.map((impact) => impact.pair)).toEqual([[1, 2]]);
    expect(bodyState(result, 1).velocity[0]).toBe(0);
  });

  it("records sensor crossings before and after an impulse changes the trajectory", () => {
    const ball = fixture(1, Shape.sphere(0.2), { type: "dynamic", position: [-3, 0, 0], velocity: [6, 0, 0] });
    const sensor = fixture(2, Shape.sphere(0.1), { type: "static", position: [-1, 0, 0] }, true);
    const wall = fixture(3, Shape.plane([-1, 0, 0]), { type: "static" });
    const result = run([ball.body, sensor.body, wall.body], [pair(ball.collider, sensor.collider), pair(ball.collider, wall.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit", "enter", "exit"]);
    for (const [actual, expected] of result.sensorEvents.map((event, i) => [event.time, [1.7 / 6, 2.3 / 6, 3.3 / 6, 3.9 / 6][i]!] as const)) expect(actual).toBeCloseTo(expected, 9);
    expect(result.impacts[0]!.time).toBeCloseTo(2.8 / 6, 9);
    expect(result.activeSensors).toEqual([]);
  });

  it("keeps a zero-duration sensor touch at the instant of reflection", () => {
    const ball = fixture(1, Shape.sphere(0.2), { type: "dynamic", position: [-1, 0, 0], velocity: [2, 0, 0] });
    const sensor = fixture(2, Shape.sphere(0.1), { type: "static", position: [0.1, 0, 0] }, true);
    const wall = fixture(3, Shape.plane([-1, 0, 0]), { type: "static" });
    const result = run([ball.body, sensor.body, wall.body], [pair(ball.collider, sensor.collider), pair(ball.collider, wall.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    expect(result.sensorEvents[0]!.time).toBeCloseTo(0.4, 9);
    expect(result.sensorEvents[1]!.time).toBeCloseTo(0.4, 9);
    expect(result.activeSensors).toEqual([]);
  });

  it("settles sensor boundaries at the end of a step after the impact response", () => {
    const ball = fixture(1, Shape.sphere(0.2), { type: "dynamic", position: [-1, 0, 0], velocity: [2, 0, 0] });
    const sensor = fixture(2, Shape.sphere(0.1), { type: "static", position: [0.1, 0, 0] }, true);
    const wall = fixture(3, Shape.plane([-1, 0, 0]), { type: "static" });
    const result = run([ball.body, sensor.body, wall.body], [pair(ball.collider, sensor.collider), pair(ball.collider, wall.collider)], 0.4);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    for (const event of result.sensorEvents) expect(event.time).toBeCloseTo(0.4, 9);
    expect(result.activeSensors).toEqual([]);
  });

  it("keeps a sensor active through a bounce inside its volume", () => {
    const ball = fixture(1, Shape.sphere(0.2), { type: "dynamic", position: [-1.5, 0, 0], velocity: [2, 0, 0] });
    const sensor = fixture(2, Shape.sphere(0.5), { type: "static", position: [-0.5, 0, 0] }, true);
    const wall = fixture(3, Shape.plane([-1, 0, 0]), { type: "static" });
    const result = run([ball.body, sensor.body, wall.body], [pair(ball.collider, sensor.collider), pair(ball.collider, wall.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter"]);
    expect(result.sensorEvents[0]!.time).toBeCloseTo(0.15, 9);
    expect(result.activeSensors).toEqual([[1, 2]]);
  });

  it("preserves disjoint sensor windows and carries initial active state", () => {
    const ball = fixture(1, Shape.sphere(0.25), { type: "dynamic", position: [-3, 0, 0], velocity: [6, 0, 0] });
    const mesh = fixture(2, Shape.mesh([
      [-1, -2, -2], [-1, 2, -2], [-1, 0, 2], [1, -2, -2], [1, 2, -2], [1, 0, 2]
    ], [0, 1, 2, 3, 4, 5]), { type: "static" }, true);
    const result = run([ball.body, mesh.body], [pair(ball.collider, mesh.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit", "enter", "exit"]);
    for (const [actual, expected] of result.sensorEvents.map((event, i) => [event.time, [1.75 / 6, 2.25 / 6, 3.75 / 6, 4.25 / 6][i]!] as const)) expect(actual).toBeCloseTo(expected, 9);
    for (const [index, event] of result.sensorEvents.entries()) {
      near(event.normal, [index % 2 === 0 ? 1 : -1, 0, 0]);
      near(event.point, [index < 2 ? -1 : 1, 0, 0]);
    }
    const overlap = fixture(1, Shape.sphere(0.25), { type: "dynamic", position: [-1.1, 0, 0], velocity: [1, 0, 0] });
    const continued = run([overlap.body, mesh.body], [pair(overlap.collider, mesh.collider)], 0.5, [[1, 2]]);
    expect(continued.sensorEvents.map((event) => event.type)).toEqual(["exit"]);
    expect(continued.sensorEvents[0]!.time).toBeCloseTo(0.35, 9);
  });

  it("matches each exit witness to its own nearby sensor interval", () => {
    const ball = fixture(1, Shape.sphere(0.25), { type: "dynamic", position: [-3, 0, 0], velocity: [1e13, 0, 0] });
    const mesh = fixture(2, Shape.mesh([
      [-1, -2, -2], [-1, 2, -2], [-1, 0, 2], [1, -2, -2], [1, 2, -2], [1, 0, 2]
    ], [0, 1, 2, 3, 4, 5]), { type: "static" }, true);
    const result = run([ball.body, mesh.body], [pair(ball.collider, mesh.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit", "enter", "exit"]);
    expect(result.sensorEvents[1]!.point[0]).toBeCloseTo(-1, 2);
    expect(result.sensorEvents[3]!.point[0]).toBeCloseTo(1, 2);
    expect(result.sensorEvents[1]!.time).toBeLessThan(result.sensorEvents[2]!.time);
  });

  it("uses the last surface's witness when overlapping mesh windows merge", () => {
    const ball = fixture(1, Shape.sphere(0.25), { type: "dynamic", position: [-3, 0, 0], velocity: [6, 0, 0] });
    const mesh = fixture(2, Shape.mesh([
      [-0.2, -2, -2], [-0.2, 2, -2], [-0.2, 0, 2], [0.2, -2, -2], [0.2, 2, -2], [0.2, 0, 2]
    ], [0, 1, 2, 3, 4, 5]), { type: "static" }, true);
    const result = run([ball.body, mesh.body], [pair(ball.collider, mesh.collider)]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    near(result.sensorEvents[0]!.point, [-0.2, 0, 0]);
    near(result.sensorEvents[1]!.point, [0.2, 0, 0]);
  });

  it("retains a tangential sensor touch without generating a solid impulse", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 1, 0], velocity: [4, 0, 0] });
    const solid = fixture(2, Shape.sphere(0.5), { type: "static" });
    const sensor = fixture(3, Shape.sphere(0.5), { type: "static" }, true);
    const result = run([ball.body, solid.body, sensor.body], [pair(ball.collider, solid.collider), pair(ball.collider, sensor.collider)]);
    expect(result.impacts).toEqual([]);
    expect(result.sensorEvents.map((event) => event.type)).toEqual(["enter", "exit"]);
    expect(result.sensorEvents[0]!.time).toBeCloseTo(0.5, 9);
    expect(result.sensorEvents[1]!.time).toBeCloseTo(0.5, 9);
    near(bodyState(result, 1).position, [2, 1, 0]);
  });

  it("returns a final witness for a persistent contact and carries it across steps", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [2, 0, 0] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    const first = run([ball.body, wall.body], [pair(ball.collider, wall.collider, 0)]);
    expect(first.contactTransitions.map((event) => event.type)).toEqual(["begin", "persist"]);
    expect(first.contactTransitions[0]!.time).toBeCloseTo(0.75, 9);
    expect(first.contactTransitions[1]!.time).toBe(1);
    near(first.activeContacts[0]!.normal, [1, 0, 0]);
    near(first.activeContacts[0]!.point, [0, 0, 0]);
    const state = bodyState(first, 1);
    const continuedBall = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: state.position, velocity: state.velocity });
    const second = nativeContinuousStep({ bodies: [continuedBall.body, wall.body], pairs: [pair(continuedBall.collider, wall.collider, 0)], duration: 1, acceleration: [0, 0, 0], constraints: [], activeContacts: first.activeContacts });
    expect(second.contactTransitions.map((event) => event.type)).toEqual(["persist"]);
    near(second.activeContacts[0]!.point, [0, 0, 0]);
  });

  it("uses the supplied previous witness for an active pair already separated at the start", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-3, 0, 0] });
    const sensor = fixture(2, Shape.sphere(0.5), { type: "static" }, true);
    const input = { bodies: [ball.body, sensor.body], pairs: [pair(ball.collider, sensor.collider)], duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] as unknown[] };
    expect(() => nativeContinuousStep({ ...input, activeSensors: [[1, 2]] })).toThrow(/prior witness/);
    const result = nativeContinuousStep({ ...input, activeContacts: [{ pair: [1, 2], sensor: true, normal: [1, 0, 0], point: [-0.5, 0, 0] }] });
    expect(result.contactTransitions.map((event) => event.type)).toEqual(["end"]);
    expect(result.contactTransitions[0]!.time).toBe(0);
    near(result.contactTransitions[0]!.point, [-0.5, 0, 0]);
    near(result.sensorEvents[0]!.point, [-0.5, 0, 0]);
  });

  it("rejects an ambiguous coincident sensor witness without modifying bodies", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic" });
    const sensor = fixture(2, Shape.sphere(0.5), { type: "static" }, true);
    const before = [ball.body.snapshot(), sensor.body.snapshot()];
    expect(() => run([ball.body, sensor.body], [pair(ball.collider, sensor.collider)])).toThrow(/sphere contact normal/);
    expect([ball.body.snapshot(), sensor.body.snapshot()]).toEqual(before);
  });

  it("rejects an off-center impact transactionally after an earlier valid impact", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const box = fixture(2, Shape.box(0.5, 0.5, 0.5), { type: "dynamic" });
    const obstacle = fixture(3, Shape.sphere(0.5), { type: "static", position: [2, 0.3, 0] });
    const before = [ball.body.snapshot(), box.body.snapshot(), obstacle.body.snapshot()];
    expect(() => run([ball.body, box.body, obstacle.body], [pair(ball.collider, box.collider, 0), pair(box.collider, obstacle.collider, 0)])).toThrow(/off-center/);
    expect([ball.body.snapshot(), box.body.snapshot(), obstacle.body.snapshot()]).toEqual(before);
  });

  it("tests the registered center of mass instead of assuming the body origin", () => {
    const ball = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    setNativeMassProperties(ball.body, { mass: 1, volume: 1, center: [0, 0.2, 0], inertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], inverseInertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    const wall = fixture(2, Shape.plane([-1, 0, 0]), { type: "static" });
    const before = ball.body.snapshot();
    expect(() => run([ball.body, wall.body], [pair(ball.collider, wall.collider)])).toThrow(/off-center/);
    expect(ball.body.snapshot()).toEqual(before);
  });

  it("rejects unresolved kinematic impacts and impact-limit exhaustion without mutation", () => {
    const moving = fixture(1, Shape.sphere(0.5), { type: "kinematic", position: [-2, 0, 0], velocity: [4, 0, 0] });
    const stationary = fixture(2, Shape.sphere(0.5), { type: "static" });
    const before = moving.body.snapshot();
    expect(() => run([moving.body, stationary.body], [pair(moving.collider, stationary.collider)])).toThrow(/without dynamic mass/);
    expect(moving.body.snapshot()).toEqual(before);
    const ball = fixture(1, Shape.sphere(0.25), { type: "dynamic", velocity: [10, 0, 0] });
    const right = fixture(2, Shape.plane([-1, 0, 0]), { type: "static", position: [2, 0, 0] });
    const left = fixture(3, Shape.plane([1, 0, 0]), { type: "static", position: [-2, 0, 0] });
    const snapshot = ball.body.snapshot();
    expect(() => nativeContinuousStep({ bodies: [ball.body, right.body, left.body], pairs: [pair(ball.collider, right.collider), pair(ball.collider, left.collider)], duration: 1, acceleration: [0, 0, 0], constraints: [], maxImpacts: 1 })).toThrow(/impact limit/);
    expect(ball.body.snapshot()).toEqual(snapshot);
  });

  it("rejects unsupported relative acceleration, angular motion and constraints explicitly", () => {
    const a = fixture(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0], velocity: [1, 0, 0] });
    const b = fixture(2, Shape.sphere(0.5), { type: "static" });
    const base = { bodies: [a.body, b.body], pairs: [pair(a.collider, b.collider)], duration: 1, acceleration: [0, 0, 0] as Vec3, constraints: [] as unknown[] };
    const box = fixture(3, Shape.box(0.5, 0.5, 0.5), { type: "static" });
    expect(() => nativeContinuousStep({ ...base, bodies: [a.body, box.body], pairs: [pair(a.collider, box.collider)], acceleration: [0, -1, 0] })).toThrow(/unequal-acceleration/);
    expect(() => nativeContinuousStep({ ...base, constraints: [{}] })).toThrow(/constraints/);
    a.body.angularVelocity = [0, 1, 0];
    expect(() => nativeContinuousStep(base)).toThrow(/collider inventory/);
    a.body.angularVelocity = [0, 0, 0];
    a.body.applyForce([-1, 0, 0]);
    expect(() => nativeContinuousStep(base)).not.toThrow();
    near(a.body.pendingForce(), [-1, 0, 0]);
    a.body.clearForces();
    a.body.applyTorque([0, 0, 1]);
    expect(() => nativeContinuousStep(base)).toThrow(/collider inventory/);
  });
});
