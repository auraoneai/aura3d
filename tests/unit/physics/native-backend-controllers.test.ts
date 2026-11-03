import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { createNativeCharacter, type NativeCharacterHost, type NativeCharacterSweepHit } from "../../../packages/physics/src/native/NativeCharacter.js";
import { createNativeVehicle, type NativeVehicleHost } from "../../../packages/physics/src/native/NativeVehicle.js";
import { setNativeMassProperties } from "../../../packages/physics/src/native/NativeMassProperties.js";

const floor = new RigidBody(10, { type: "static" });
const floorCollider = new Collider(10, floor.id, { shape: Shape.box(20, 0.5, 20) });
const wall = new RigidBody(11, { type: "static" });
const wallCollider = new Collider(11, wall.id, { shape: Shape.box(0.1, 10, 10) });

function registerOffsetMass(body: RigidBody): void {
  // Positive-definite inverse tensor with a coupled local X/Z response.
  setNativeMassProperties(body, {
    mass: body.mass, volume: 1, center: [0.5, 0, 0],
    inertia: [[2 / 3, 0, -1 / 3], [0, 1, 0], [-1 / 3, 0, 2 / 3]],
    inverseInertia: [[2, 0, 1], [0, 1, 0], [1, 0, 2]]
  });
}

function capsuleBody(position: Vec3 = [0, 0.81, 0]) {
  const body = new RigidBody(1, { type: "kinematic", position });
  const collider = new Collider(1, body.id, { shape: Shape.capsule(0.3, 0.5) });
  return { body, collider };
}

/** Independent plane intersections for a vertical capsule, floor and one wall/step. */
function terrainHost(stepHeight: number, obstacleBody = wall, ceiling = Infinity): NativeCharacterHost {
  const obstacle = obstacleBody === wall ? wallCollider : new Collider(12, obstacleBody.id, { shape: Shape.box(0.1, 1, 10) });
  return {
    fixedDelta: 1 / 60,
    sweep({ position, displacement, offset }) {
      const candidates: NativeCharacterSweepHit[] = [];
      const radius = 0.3 + offset;
      const halfTotal = 0.8 + offset;
      if (displacement[0] > 0) {
        const t = (0.8 - radius - position[0]) / displacement[0];
        if (t >= -1e-10 && t <= 1 && position[1] + displacement[1] * t - halfTotal < stepHeight - 1e-9) {
          candidates.push({ fraction: Math.max(0, t), normal: [-1, 0, 0], point: [0.8, position[1] + displacement[1] * t, position[2] + displacement[2] * t], collider: obstacle, body: obstacleBody });
        }
      }
      if (displacement[1] < 0) {
        const surface = position[0] >= 0.8 && Number.isFinite(stepHeight) ? stepHeight : 0;
        const t = (position[1] - halfTotal - surface) / -displacement[1];
        if (t >= -1e-10 && t <= 1) candidates.push({ fraction: Math.max(0, t), normal: [0, 1, 0], point: [position[0] + displacement[0] * t, surface, position[2] + displacement[2] * t], collider: floorCollider, body: floor });
      }
      if (displacement[1] > 0 && Number.isFinite(ceiling)) {
        const t = (ceiling - halfTotal - position[1]) / displacement[1];
        if (t >= -1e-10 && t <= 1) candidates.push({ fraction: Math.max(0, t), normal: [0, -1, 0], point: [position[0], ceiling, position[2]], collider: floorCollider, body: floor });
      }
      return candidates.sort((a, b) => a.fraction - b.fraction)[0];
    },
    certifySupportPath({ origin, displacement, offset }) {
      const endX = origin[0] + displacement[0];
      if (Number.isFinite(stepHeight) && Math.min(origin[0], endX) >= 0.8 && Math.abs(origin[1] - (0.8 + offset + stepHeight)) < 1e-8) {
        return { status: "certified" };
      }
      return { status: "unsupported", reason: "Fixture cannot certify that path." };
    }
  };
}

/** Infinite slope y=x, evaluated from the capsule support distance to its plane. */
function slopeHost(): NativeCharacterHost {
  const normal: Vec3 = [-Math.SQRT1_2, Math.SQRT1_2, 0];
  return {
    fixedDelta: 1 / 60,
    sweep({ position, displacement, offset }) {
      const support = 0.3 + offset + 0.5 * Math.SQRT1_2;
      const distance = position[0] * normal[0] + position[1] * normal[1] - support;
      const approach = -(displacement[0] * normal[0] + displacement[1] * normal[1]);
      if (approach <= 1e-10) return undefined;
      const fraction = distance / approach;
      if (fraction < -1e-10 || fraction > 1) return undefined;
      return { fraction: Math.max(0, fraction), normal, point: [position[0], position[1] - support, position[2]], collider: floorCollider, body: floor };
    }
  };
}

function vehicleFixture(groundBody = floor) {
  const chassis = new RigidBody(2, { type: "dynamic", position: [0, 0.65, 0], mass: 10, inertia: [3, 3, 3] });
  const groundCollider = groundBody === floor ? floorCollider : new Collider(20, groundBody.id, { shape: Shape.box(20, 0.5, 20) });
  let active = true;
  let groundActive = true;
  const host: NativeVehicleHost = {
    raycast({ origin, direction, maxDistance }) {
      if (!groundActive || direction[1] >= 0) return undefined;
      const distance = origin[1] / -direction[1];
      if (distance < 0 || distance > maxDistance) return undefined;
      return { distance, point: [origin[0] + direction[0] * distance, 0, origin[2] + direction[2] * distance], normal: [0, 1, 0], collider: groundCollider, body: groundBody };
    },
    isActive(body) { return body === chassis ? active : groundActive; }
  };
  const vehicle = createNativeVehicle(chassis, host);
  vehicle.addWheel({ connection: [0, -0.2, 0], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3, suspensionStiffness: 40, frictionSlip: 5 });
  return { chassis, vehicle, host, groundCollider, removeGround: () => { groundActive = false; }, removeChassis: () => { active = false; } };
}

describe("native character controller", () => {
  it("resolves multiple contacts and preserves movement along their tangents", () => {
    const { body, collider } = capsuleBody([0, 1.31, 0]);
    const character = createNativeCharacter(body, collider, terrainHost(Infinity));
    const result = character.move([1, -1, 0.4]);
    expect(result.collisions).toBe(2);
    expect(result.position[0]).toBeCloseTo(0.49, 8);
    expect(result.position[1]).toBeCloseTo(0.81, 8);
    expect(result.position[2]).toBeCloseTo(0.4, 8);
    expect(result.grounded).toBe(true);
    expect(character.position()).toEqual(body.position);
  });

  it("observes ground at zero movement and snaps a descending character to a nearby floor", () => {
    const { body, collider } = capsuleBody();
    const character = createNativeCharacter(body, collider, terrainHost(Infinity), { snapToGroundDistance: 0.2 });
    expect(character.move([0, 0, 0])).toMatchObject({ grounded: true, applied: [0, 0, 0] });
    body.setPosition([0, 0.91, 0]);
    const result = character.move([0.1, -0.01, 0]);
    expect(result.grounded).toBe(true);
    expect(result.position[1]).toBeCloseTo(0.81, 8);
  });

  it("does not claim to be grounded while stationary above an unsnapped floor", () => {
    const { body, collider } = capsuleBody([0, 0.91, 0]);
    const character = createNativeCharacter(body, collider, terrainHost(Infinity), { snapToGroundDistance: 0.2 });
    expect(character.move([0, 0, 0])).toMatchObject({ grounded: false, position: [0, 0.91, 0] });
    expect(character.move([0, -0.01, 0]).position[1]).toBeCloseTo(0.81, 8);
  });

  it("reports airborne after moving beyond a floor encountered earlier in the same move", () => {
    const { body, collider } = capsuleBody([0, 1.31, 0]);
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep({ position, displacement, offset }) {
        if (displacement[1] >= 0) return undefined;
        const fraction = (position[1] - 0.8 - offset) / -displacement[1];
        if (fraction < 0 || fraction > 1 || position[0] + displacement[0] * fraction >= 0.6) return undefined;
        return { fraction, normal: [0, 1, 0], point: [position[0] + displacement[0] * fraction, 0, 0], collider: floorCollider, body: floor };
      }
    };
    const result = createNativeCharacter(body, collider, host).move([1, -1, 0]);
    expect(result.position[0]).toBeCloseTo(1, 8);
    expect(result.position[1]).toBeCloseTo(0.81, 8);
    expect(result.grounded).toBe(false);
  });

  it("steps on its first grounded move after proving support", () => {
    const { body, collider } = capsuleBody();
    const host = terrainHost(0.3);
    let supportQueried = false;
    host.certifySupportPath = () => { supportQueried = true; return { status: "certified" }; };
    const character = createNativeCharacter(body, collider, host, { autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
    const result = character.move([1.2, 0, 0]);
    expect(result.position[0]).toBeCloseTo(1.2, 8);
    expect(result.position[1]).toBeCloseTo(1.11, 8);
    expect(result.grounded).toBe(true);
    expect(supportQueried).toBe(true);
  });

  it("does not attempt a disabled dynamic-body step, and climbs an enabled one", () => {
    const obstacle = new RigidBody(12, { type: "dynamic", mass: 10 });
    const first = capsuleBody();
    const blocked = createNativeCharacter(first.body, first.collider, terrainHost(0.3, obstacle), { autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
    blocked.move([0, 0, 0]);
    expect(blocked.move([1.2, 0, 0]).position[0]).toBeCloseTo(0.49, 8);

    const second = capsuleBody();
    const allowed = createNativeCharacter(second.body, second.collider, terrainHost(0.3, obstacle), { autoStepHeight: 0.4, autoStepMinWidth: 0.2, autoStepIncludeDynamicBodies: true });
    allowed.move([0, 0, 0]);
    const beforeObstacle = obstacle.snapshot();
    const result = allowed.move([1.2, 0, 0]);
    expect(result.position[0]).toBeCloseTo(1.2, 8);
    expect(result.position[1]).toBeCloseTo(1.11, 8);
    expect(result.grounded).toBe(true);
    expect(obstacle.snapshot()).toEqual(beforeObstacle);
  });

  it("discards a queued dynamic-body push when a later autostep is unsupported", () => {
    const run = (blockLater: boolean) => {
      const { body, collider } = capsuleBody();
      const obstacle = new RigidBody(12, { type: "dynamic", mass: 10 });
      const obstacleCollider = new Collider(12, obstacle.id, { shape: Shape.box(1, 1, 1) });
      const host: NativeCharacterHost = {
        fixedDelta: 1 / 60,
        sweep({ position, displacement }) {
          if (displacement[1] < 0) return { fraction: 0, normal: [0, 1, 0], point: [position[0], 0, position[2]], collider: floorCollider, body: floor };
          if (displacement[2] > 0) return { fraction: 0.25, normal: [0, 0, -1], point: [position[0] + 0.25, position[1], position[2] + 0.25], collider: obstacleCollider, body: obstacle };
          if (blockLater && displacement[0] > 0 && position[1] < 1) return { fraction: 0.2, normal: [-1, 0, 0], point: [position[0] + 0.15, position[1], position[2]], collider: wallCollider, body: wall };
          return undefined;
        }
      };
      const character = createNativeCharacter(body, collider, host, { autoStepHeight: 0.4, applyImpulsesToDynamicBodies: true });
      return { body, obstacle, character };
    };
    const control = run(false);
    control.character.move([1, 0, 1]);
    expect(control.obstacle.velocity[2]).toBeGreaterThan(0);

    const blocked = run(true);
    const beforeBody = blocked.body.snapshot();
    const beforeObstacle = blocked.obstacle.snapshot();
    expect(() => blocked.character.move([1, 0, 1])).toThrow(/autostep.*selection.*unsupported/i);
    expect(blocked.body.snapshot()).toEqual(beforeBody);
    expect(blocked.obstacle.snapshot()).toEqual(beforeObstacle);
    expect(blocked.character.grounded()).toBe(false);
  });

  it("still moves without an autostep attempt and can disable autostep", () => {
    const { body, collider } = capsuleBody();
    const character = createNativeCharacter(body, collider, terrainHost(0.3), { autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
    expect(character.move([0.1, 0, 0]).position[0]).toBeCloseTo(0.1, 8);
    character.setAutoStep(0, 0.2);
    expect(character.move([1.1, 0, 0]).position[0]).toBeCloseTo(0.49, 8);
  });

  it("does not slide along an obstruction when sliding is disabled", () => {
    const { body, collider } = capsuleBody();
    const character = createNativeCharacter(body, collider, terrainHost(Infinity), { slideEnabled: false });
    const result = character.move([1, 0, 1]);
    expect(result.position[0]).toBeCloseTo(0.49, 8);
    expect(result.position[2]).toBeCloseTo(0.49, 8);
  });

  it("limits steep climbing and applies the configured slope-slide rule", () => {
    const support = (0.31 + 0.5 * Math.SQRT1_2) / Math.SQRT1_2;
    const steep = capsuleBody([0, support, 0]);
    const walker = createNativeCharacter(steep.body, steep.collider, slopeHost(), { maxSlopeClimbAngle: Math.PI / 6 });
    const climb = walker.move([1, 0, 0]);
    expect(climb.position[0]).toBeCloseTo(0, 8);
    expect(climb.position[1]).toBeCloseTo(support, 8);

    const sliding = capsuleBody([0, support, 0]);
    const slider = createNativeCharacter(sliding.body, sliding.collider, slopeHost(), { maxSlopeClimbAngle: Math.PI / 2, minSlopeSlideAngle: 0, slideEnabled: true });
    expect(slider.move([0, -1, 0]).position[0]).toBeLessThan(-0.4);
    const sticking = capsuleBody([0, support, 0]);
    const fixed = createNativeCharacter(sticking.body, sticking.collider, slopeHost(), { maxSlopeClimbAngle: Math.PI / 2, minSlopeSlideAngle: 0, slideEnabled: false });
    expect(fixed.move([0, -1, 0]).position[0]).toBeCloseTo(0, 8);
  });

  it("pushes dynamic obstacles when enabled and validates reset and ownership", () => {
    const obstacle = new RigidBody(12, { type: "dynamic", mass: 2 });
    const { body, collider } = capsuleBody();
    let active = true;
    const host = terrainHost(Infinity, obstacle);
    host.isActive = () => active;
    const character = createNativeCharacter(body, collider, host, { applyImpulsesToDynamicBodies: true, characterMass: 2 });
    character.move([1, 0, 0]);
    expect(obstacle.velocity[0]).toBeGreaterThan(0);
    const before = character.position();
    expect(() => character.resetTo([0, NaN, 0])).toThrow(/finite/);
    expect(character.position()).toEqual(before);
    expect(character.resetTo([2, 3, 4])).toEqual([2, 3, 4]);
    expect(body.previousPosition).toEqual([2, 3, 4]);
    expect(character.grounded()).toBe(false);
    active = false;
    expect(() => character.move([0, 0, 0])).toThrow(/disposed/);
    character.dispose(); character.dispose();
  });

  it("uses relative contact velocity when applying an optional dynamic push", () => {
    const obstacle = new RigidBody(12, { type: "dynamic", mass: 2, velocity: [60, 0, 0] });
    const obstacleCollider = new Collider(12, obstacle.id, { shape: Shape.sphere(0.2) });
    const { body, collider } = capsuleBody();
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep({ displacement }) {
        return displacement[0] > 0 ? { fraction: 0.5, normal: [-1, 0, 0], point: [0, 0, 0], collider: obstacleCollider, body: obstacle } : undefined;
      }
    };
    const character = createNativeCharacter(body, collider, host, { applyImpulsesToDynamicBodies: true, characterMass: 2 });
    character.move([1, 0, 0]);
    expect(obstacle.velocity).toEqual([60, 0, 0]);
  });

  it("pushes using a rotated obstacle's offset center and coupled inertia tensor", () => {
    const obstacle = new RigidBody(12, { type: "dynamic", mass: 2, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] });
    registerOffsetMass(obstacle);
    const obstacleCollider = new Collider(12, obstacle.id, { shape: Shape.sphere(0.2) });
    const { body, collider } = capsuleBody();
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep({ displacement }) {
        return displacement[0] > 0
          ? { fraction: 0.5, normal: [-1, 0, 0], point: [0, 1, -0.5], collider: obstacleCollider, body: obstacle }
          : undefined;
      }
    };
    createNativeCharacter(body, collider, host, { applyImpulsesToDynamicBodies: true, characterMass: 2 }).move([1, 0, 0]);
    expect(obstacle.velocity[0]).toBeCloseTo(10, 8);
    expect(obstacle.angularVelocity[0]).toBeCloseTo(20, 8);
    expect(obstacle.angularVelocity[1]).toBeCloseTo(0, 8);
    expect(obstacle.angularVelocity[2]).toBeCloseTo(-40, 8);
  });

  it("rejects a host's nonblocking zero-time result without moving the body", () => {
    const { body, collider } = capsuleBody();
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep: () => ({ fraction: 0, normal: [0, 1, 0], point: [0, 0, 0], collider: floorCollider, body: floor })
    };
    const character = createNativeCharacter(body, collider, host);
    expect(() => character.move([1, 0, 0])).toThrow(/non-blocking/);
    expect(body.position).toEqual([0, 0.81, 0]);
  });

  it("fails atomically if too many blocking contacts prevent completing a move", () => {
    const { body, collider } = capsuleBody();
    const obstacle = new RigidBody(12, { type: "dynamic", mass: 2 });
    const obstacleCollider = new Collider(12, obstacle.id, { shape: Shape.sphere(0.2) });
    let calls = 0;
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep({ displacement }) {
        calls += 1;
        const length = Math.hypot(displacement[0], displacement[2]);
        const x = displacement[0] / length, z = displacement[2] / length;
        const normal: Vec3 = [-0.2 * x - Math.sqrt(0.96) * z, 0, -0.2 * z + Math.sqrt(0.96) * x];
        return { fraction: 0.1, normal, point: [0, 0, 0], collider: obstacleCollider, body: obstacle };
      }
    };
    const character = createNativeCharacter(body, collider, host, { applyImpulsesToDynamicBodies: true });
    expect(() => character.move([1, 0, 0])).toThrow(/collision-iteration limit/);
    expect(calls).toBe(8);
    expect(body.position).toEqual([0, 0.81, 0]);
    expect(obstacle.velocity).toEqual([0, 0, 0]);
  });
});

describe("native autostep selection compared with the public controller", () => {
  it.each([
    { name: "sphere on a wide single ledge", shape: "sphere", surfaces: [[0.5, 1.5]], desired: [1, 0, 0], expected: [0.2899, 0.2125], nativeStep: true },
    { name: "capsule on a wide single ledge", shape: "capsule", surfaces: [[0.5, 1.3]], desired: [1, 0, 0], expected: [0.2899, 0.61], nativeStep: true },
    { name: "box on a wide single ledge", shape: "box", surfaces: [[0.5, 1.7]], desired: [0.8, -0.01, 0], expected: [0.2899, 0.6101], nativeStep: true },
    { name: "capsule crossing adjacent ledges", shape: "capsule", surfaces: [[0.5, 0.9], [0.9, 2]], desired: [1.2, -0.01, 0], expected: [0.2899, 0.6077], nativeStep: true },
    { name: "box crossing adjacent ledges", shape: "box", surfaces: [[0.5, 0.9], [0.9, 2]], desired: [1.1, 0, 0], expected: [0.2899, 0.6101], nativeStep: true },
    { name: "box landing with only part of its footprint supported", shape: "box", surfaces: [[0.5, 0.7]], desired: [0.8, 0, 0], expected: [0.8, 0.9101], nativeStep: true },
    { name: "box footprint spanning a gap", shape: "box", surfaces: [[0.5, 1.1], [1.3, 2]], desired: [1, 0, 0], expected: [1, 0.9101], nativeStep: true },
    { name: "capsule moving beyond a narrow ledge", shape: "capsule", surfaces: [[0.5, 0.6]], desired: [1, 0, 0], expected: [1, 0.9101], nativeStep: false },
    { name: "box moving beyond a narrow ledge", shape: "box", surfaces: [[0.5, 0.6]], desired: [1, 0, 0], expected: [1, 0.9101], nativeStep: false }
  ] as const)("checks the public and native behavior for $name", async ({ shape, surfaces, desired, expected, nativeStep }) => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const fixtures = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(5, 0.5, 5) });
        for (const [start, end] of surfaces) {
          const step = world.createRigidBody({ type: "static", position: [(start + end) / 2, 0.15, 0] });
          world.createCollider(step, { shape: Shape.box((end - start) / 2, 0.15, 1) });
        }
        const bottom = shape === "sphere" ? 0.2 : 0.6;
        const body = world.createRigidBody({ type: "kinematic", position: [0, bottom + 0.01, 0] });
        world.createCollider(body, { shape: shape === "sphere" ? Shape.sphere(0.2) : shape === "capsule" ? Shape.capsule(0.2, 0.4) : Shape.box(0.2, 0.6, 0.2) });
        const character = world.createCharacterController(body, { offset: 0.01, autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
        character.move([0, 0, 0]);
        return { body, character };
      });
      const publicMovement = fixtures[0]!.character.move(desired);
      expect(publicMovement.position[0]).toBeCloseTo(expected[0], 2);
      expect(publicMovement.position[1]).toBeCloseTo(expected[1], 2);
      const nativeMovement = fixtures[1]!.character.move(desired);
      const bottom = shape === "sphere" ? 0.2 : 0.6;
      if (nativeStep) {
        expect(nativeMovement.position[0]).toBeCloseTo(desired[0], 2);
        expect(nativeMovement.position[1]).toBeCloseTo(bottom + 0.31, 2);
      } else {
        expect(nativeMovement.position[0]).toBeLessThan(0.4);
        expect(nativeMovement.position[1]).toBeCloseTo(bottom + 0.01, 2);
      }
    } finally {
      for (const world of worlds) world.dispose();
    }
  });
});

describe("native physical vehicle", () => {
  const fourWheels = () => {
    const { chassis, host } = vehicleFixture();
    const vehicle = createNativeVehicle(chassis, host);
    for (const x of [-0.5, 0.5]) for (const z of [-0.6, 0.6]) {
      vehicle.addWheel({ connection: [x, -0.2, z], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3, suspensionStiffness: 40, frictionSlip: 5 });
    }
    return { chassis, vehicle };
  };

  it("sums four symmetric suspension forces without adding a spurious chassis torque", () => {
    const { chassis, vehicle } = fourWheels();
    vehicle.step(1 / 60);
    expect(vehicle.groundedWheelCount()).toBe(4);
    for (const state of vehicle.wheelStates()) expect(state.suspensionForce).toBeCloseTo(100, 8);
    expect(chassis.velocity[1]).toBeCloseTo(2 / 3, 8);
    expect(Math.hypot(...chassis.angularVelocity)).toBeLessThan(1e-8);
    expect(chassis.position).toEqual([0, 0.65, 0]);
  });

  it("uses the rotated center of mass and coupled tensor for a suspension impulse", () => {
    const { chassis, vehicle, host } = vehicleFixture();
    chassis.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    registerOffsetMass(chassis);
    const frictionless = new Collider(30, floor.id, { shape: Shape.box(10, 0.5, 10), material: { friction: 0 } });
    const realRaycast = host.raycast;
    host.raycast = (request) => {
      const hit = realRaycast(request);
      return hit ? { ...hit, collider: frictionless } : undefined;
    };
    vehicle.setWheelTuning(0, { sideFrictionStiffness: 0 });
    vehicle.step(1 / 60);
    const impulse = 100 / 60;
    expect(chassis.velocity[1]).toBeCloseTo(impulse / 10, 8);
    expect(chassis.angularVelocity[0]).toBeCloseTo(-impulse, 8);
    expect(chassis.angularVelocity[1]).toBeCloseTo(0, 8);
    expect(chassis.angularVelocity[2]).toBeCloseTo(impulse / 2, 8);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(-(impulse / 2 * 0.2) / 0.3 / 60, 8);
  });

  it("does not let several wheel brakes each cancel the entire forward velocity", () => {
    const { chassis, vehicle } = fourWheels();
    chassis.setVelocity([0, 0, 1]);
    vehicle.setBrakes(100);
    vehicle.step(1 / 60);
    expect(chassis.velocity[2]).toBeGreaterThanOrEqual(-1e-8);
    expect(chassis.velocity[2]).toBeLessThan(1);
  });

  it("samples signed total speed at the beginning of a vehicle update", () => {
    const { chassis, vehicle, removeGround } = vehicleFixture();
    removeGround();
    chassis.setVelocity([-3, 4, 1]);
    expect(vehicle.currentSpeed()).toBe(0);
    vehicle.step(1 / 60);
    expect(vehicle.currentSpeed()).toBeCloseTo(-Math.sqrt(26), 8);
    vehicle.setAxes(1, 2);
    vehicle.resetToPose({ position: [0, 5, 0], linearVelocity: [3, 4, -1] });
    expect(vehicle.currentSpeed()).toBeCloseTo(-Math.sqrt(26), 8);
    vehicle.step(1 / 60);
    expect(vehicle.currentSpeed()).toBeCloseTo(-Math.sqrt(26), 8);
    vehicle.resetToPose({ position: [0, 5, 0], linearVelocity: [3, 4, 1] });
    expect(vehicle.currentSpeed()).toBeCloseTo(-Math.sqrt(26), 8);
    vehicle.step(1 / 60);
    expect(vehicle.currentSpeed()).toBeCloseTo(Math.sqrt(26), 8);
  });

  it("casts each wheel from its rotated chassis-local mount and direction", () => {
    const chassis = new RigidBody(2, { type: "dynamic", position: [2, 3, 4] });
    chassis.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    let request: Parameters<NativeVehicleHost["raycast"]>[0] | undefined;
    const vehicle = createNativeVehicle(chassis, { raycast(value) { request = value; return undefined; } });
    vehicle.addWheel({ connection: [1, 0, 0], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3, maxSuspensionTravel: 0.2 });
    vehicle.step(1 / 60);
    expect(request?.origin[0]).toBeCloseTo(2, 8);
    expect(request?.origin[1]).toBeCloseTo(3, 8);
    expect(request?.origin[2]).toBeCloseTo(3, 8);
    expect(request?.direction).toEqual([0, -1, 0]);
    expect(request?.maxDistance).toBeCloseTo(0.7, 8);
    expect(vehicle.isGrounded()).toBe(false);
  });

  it("applies suspension and driven tyre impulses without directly integrating the chassis pose", () => {
    const { chassis, vehicle } = vehicleFixture();
    vehicle.setWheelCommand(0, { engineForce: 100 });
    vehicle.step(1 / 60);
    const wheel = vehicle.wheelState(0);
    expect(wheel.grounded).toBe(true);
    expect(wheel.groundColliderHandle).toBe(floorCollider.id);
    expect(wheel.suspensionLength).toBeCloseTo(0.15, 8);
    expect(wheel.suspensionForce).toBeCloseTo(100, 8);
    expect(wheel.forwardImpulse).toBeCloseTo(100 / 60, 8);
    expect(chassis.position).toEqual([0, 0.65, 0]);
    expect(chassis.velocity[1]).toBeCloseTo(1 / 6, 8);
    expect(chassis.velocity[2]).toBeCloseTo(-1 / 6, 8);
  });

  it("uses dynamic road motion for grip while preserving the road's velocity", () => {
    const road = new RigidBody(20, { type: "dynamic", mass: 20, velocity: [2, 0, 0] });
    const { chassis, vehicle } = vehicleFixture(road);
    vehicle.setWheelCommand(0, { engineForce: 100 });
    vehicle.step(1 / 60);
    expect(chassis.velocity[0]).toBeGreaterThan(0);
    expect(chassis.velocity[2]).toBeLessThan(0);
    expect(road.velocity).toEqual([2, 0, 0]);
    expect(road.angularVelocity).toEqual([0, 0, 0]);
  });

  it("brakes without reversing and limits tyre impulse by friction", () => {
    const { chassis, vehicle } = vehicleFixture();
    chassis.setVelocity([2, 0, 1]);
    vehicle.setWheelCommand(0, { brake: 100 });
    vehicle.step(1 / 60);
    const wheel = vehicle.wheelState(0);
    expect(chassis.velocity[2]).toBeGreaterThanOrEqual(0);
    expect(chassis.velocity[2]).toBeLessThan(1);
    expect(Math.hypot(wheel.forwardImpulse * 0.5, wheel.sideImpulse)).toBeLessThanOrEqual(wheel.suspensionForce / 60 * wheel.frictionSlip + 1e-8);
  });

  it("turns the wheel's traction direction with steering", () => {
    const { chassis, vehicle } = vehicleFixture();
    vehicle.setWheelCommand(0, { engineForce: 100, steering: Math.PI / 2 });
    vehicle.step(1 / 60);
    expect(chassis.velocity[0]).toBeLessThan(-0.1);
    expect(Math.abs(chassis.velocity[2])).toBeLessThan(1e-8);
  });

  it("retains authored wheel traction on a zero-friction ground collider", () => {
    const { chassis, vehicle, host } = vehicleFixture();
    const slippery = new Collider(30, floor.id, { shape: Shape.box(10, 0.5, 10), material: { friction: 0 } });
    const realRaycast = host.raycast;
    host.raycast = (request) => {
      const hit = realRaycast(request);
      return hit ? { ...hit, collider: slippery } : undefined;
    };
    vehicle.setWheelCommand(0, { engineForce: 100 });
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0).suspensionForce).toBeGreaterThan(0);
    expect(vehicle.wheelState(0).forwardImpulse).toBeCloseTo(100 / 60, 8);
    expect(chassis.velocity[2]).toBeCloseTo(-1 / 6, 8);
  });

  it("keeps a back-facing inside-origin contact and bounds its spring response", () => {
    const { chassis, vehicle, host } = vehicleFixture();
    host.raycast = ({ origin }) => ({ distance: 0, point: origin, normal: [0, -1, 0], collider: floorCollider, body: floor });
    chassis.setVelocity([0, 1, 0]);
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0).grounded).toBe(true);
    expect(vehicle.wheelState(0).suspensionLength).toBeCloseTo(-0.3, 8);
    expect(vehicle.wheelState(0).suspensionForce).toBeCloseTo(2800, 8);
    expect(chassis.velocity[1]).toBeCloseTo(1 - 2800 / 60 / 10, 8);
  });

  it("rotates a grounded wheel from the post-impulse chassis speed at its mount", () => {
    const { chassis, vehicle } = vehicleFixture();
    vehicle.setWheelCommand(0, { engineForce: 100 });
    vehicle.step(1 / 60);
    const mountSpeed = chassis.velocity[2] - 0.2 * chassis.angularVelocity[0];
    expect(chassis.velocity[2]).toBeLessThan(0);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(-mountSpeed / 0.3 / 60, 8);
    expect(vehicle.wheelState(0).rotation).toBeGreaterThan(0);
  });

  it("reverses the rolling sign when the wheel axle points the opposite way", () => {
    const { chassis, host } = vehicleFixture();
    const vehicle = createNativeVehicle(chassis, host);
    vehicle.addWheel({ connection: [0, -0.2, 0], direction: [0, -1, 0], axle: [-1, 0, 0], restLength: 0.4, radius: 0.3, suspensionStiffness: 40, frictionSlip: 5 });
    chassis.setVelocity([0, 0, 5]);
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(5 / 0.3 / 60, 8);
  });

  it("does not invent throttle or brake forces or spin for a wheel initially in the air", () => {
    const { chassis, vehicle, removeGround } = vehicleFixture();
    removeGround();
    chassis.setVelocity([0, 0, 5]);
    vehicle.setWheelCommand(0, { engineForce: 100, brake: 20 });
    for (let i = 0; i < 5; i += 1) vehicle.step(1 / 60);
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: false, rotation: 0, forwardImpulse: 0 });
    expect(chassis.velocity).toEqual([0, 0, 5]);
  });

  it("continues a rolling wheel's decaying per-update rotation in the air and rebases its angle on reset", () => {
    const { chassis, vehicle, removeGround } = vehicleFixture();
    chassis.setVelocity([0, 0, 5]);
    vehicle.step(1 / 60);
    const groundedRotation = vehicle.wheelState(0).rotation;
    expect(groundedRotation).toBeCloseTo(-5 / 0.3 / 60, 8);
    removeGround();
    vehicle.setWheelCommand(0, { engineForce: 100, brake: 20 });
    const velocity = [...chassis.velocity];
    vehicle.step(1 / 120);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(groundedRotation * 1.99, 8);
    vehicle.step(1 / 30);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(groundedRotation * (1 + 0.99 + 0.99 ** 2), 8);
    expect(chassis.velocity).toEqual(velocity);
    vehicle.resetToPose({ position: [0, 5, 0] });
    expect(vehicle.wheelState(0).rotation).toBe(0);
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(groundedRotation * 0.99 ** 3, 8);
  });

  it("reports wheel rotation from chassis motion when the supporting body also moves", () => {
    const road = new RigidBody(20, { type: "dynamic", mass: 20, velocity: [0, 0, 2] });
    const { chassis, vehicle } = vehicleFixture(road);
    chassis.setVelocity([0, 0, 5]);
    vehicle.step(1 / 60);
    expect(vehicle.wheelState(0).rotation).toBeCloseTo(-5 / 0.3 / 60, 8);
  });

  it("validates commands atomically and resets full pose, contact state and commands", () => {
    const { chassis, vehicle } = vehicleFixture();
    vehicle.setWheelCommand(0, { engineForce: 20, steering: 0.2 });
    expect(() => vehicle.setWheelCommand(0, { engineForce: 30, brake: -1 })).toThrow(/brake/);
    expect(vehicle.wheelState(0)).toMatchObject({ engineForce: 20, steering: 0.2, brake: 0 });
    vehicle.setWheelCommand(0, { engineForce: undefined });
    vehicle.setWheelTuning(0, { frictionSlip: undefined });
    expect(vehicle.wheelState(0)).toMatchObject({ engineForce: 20, frictionSlip: 5 });
    expect(() => vehicle.setWheelTuning(0, { frictionSlip: 1, maxSuspensionTravel: -1 })).toThrow(/maxSuspensionTravel/);
    expect(vehicle.wheelState(0).frictionSlip).toBe(5);
    vehicle.step(1 / 60);
    expect(() => vehicle.resetToPose({ position: [3, 2, 1], angularVelocity: [0, NaN, 0] })).toThrow(/angular velocity/);
    expect(vehicle.position()).toEqual([0, 0.65, 0]);
    chassis.applyForce([10, 20, 30]);
    chassis.applyTorque([3, 2, 1]);
    vehicle.resetToPose({ position: [1, 4, 2] });
    expect(chassis.position).toEqual([1, 4, 2]);
    expect(chassis.previousPosition).toEqual([1, 4, 2]);
    expect(vehicle.rotation()).toEqual([0, 0, 0, 1]);
    expect(vehicle.linearVelocity()).toEqual([0, 0, 0]);
    expect(vehicle.angularVelocity()).toEqual([0, 0, 0]);
    expect(chassis.pendingForce()).toEqual([0, 0, 0]);
    expect(chassis.pendingTorque()).toEqual([0, 0, 0]);
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: false, engineForce: 0, brake: 0, steering: 0, rotation: 0, groundColliderHandle: null });
  });

  it("invalidates old wheel contacts when the axes or wheel geometry change", () => {
    const { vehicle } = vehicleFixture();
    vehicle.step(1 / 60);
    expect(vehicle.groundedWheelCount()).toBe(1);
    expect(() => vehicle.setAxes(1, 1)).toThrow();
    expect(vehicle.groundedWheelCount()).toBe(1);
    vehicle.setAxes(1, 2);
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: false, groundColliderHandle: null });
    vehicle.step(1 / 60);
    expect(vehicle.groundedWheelCount()).toBe(1);
    vehicle.addWheel({ connection: [1, -0.2, 0], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3 });
    expect(vehicle.groundedWheelCount()).toBe(0);
    expect(vehicle.wheelState(0).contactPoint).toBeNull();
  });

  it("invalidates removed ground and rejects access after chassis removal or disposal", () => {
    const { vehicle, removeGround, removeChassis } = vehicleFixture();
    vehicle.step(1 / 60);
    expect(vehicle.isGrounded()).toBe(true);
    removeGround();
    expect(vehicle.wheelState(0)).toMatchObject({ grounded: false, groundColliderHandle: null });
    removeChassis();
    expect(() => vehicle.step(1 / 60)).toThrow(/disposed/);
    vehicle.dispose(); vehicle.dispose();
    expect(() => vehicle.position()).toThrow(/disposed/);
  });

  it("does not partially apply impulses if a later wheel query is invalid", () => {
    const { chassis, vehicle, host } = vehicleFixture();
    vehicle.addWheel({ connection: [1, -0.2, 0], direction: [0, -1, 0], axle: [1, 0, 0], restLength: 0.4, radius: 0.3 });
    const realRaycast = host.raycast;
    let count = 0;
    host.raycast = (request) => {
      const hit = realRaycast(request);
      count += 1;
      return count === 2 && hit ? { ...hit, normal: [NaN, 1, 0] } : hit;
    };
    const before = [...chassis.velocity];
    expect(() => vehicle.step(1 / 60)).toThrow(/finite/);
    expect(chassis.velocity).toEqual(before);
    expect(vehicle.wheelState(0).grounded).toBe(false);
  });
});

describe("native vehicle comparisons with the current public controller", () => {
  type Scenario = {
    name: string;
    y?: number;
    velocity?: Vec3;
    roadVelocity?: Vec3;
    friction?: number;
    engineForce?: number;
    brake?: number;
    steering?: number;
    count?: number;
    axle?: Vec3;
    rotation?: readonly [number, number, number, number];
    roadRotation?: readonly [number, number, number, number];
    mass?: number;
    inertia?: number | Vec3;
    travel?: number;
    maxForce?: number;
    airborneWheels?: number;
  };
  const cases: Scenario[] = [
    { name: "suspension compression" },
    { name: "suspension compression while falling", velocity: [0, -2, 0] },
    { name: "road beyond wheel ray", y: 1 },
    { name: "wheel drive on a zero-friction collider", friction: 0, engineForce: 100 },
    { name: "braking at the tyre grip limit", velocity: [0, 0, 5], brake: 20 },
    { name: "engine and brake together", velocity: [0, 0, 5], engineForce: 100, brake: 10 },
    { name: "steered drive", engineForce: 100, steering: 0.5 },
    { name: "lateral slip", velocity: [3, 0, 0] },
    { name: "moving supporting body", roadVelocity: [3, 2, 0] },
    { name: "moving ground under braking", velocity: [0, 0, 5], roadVelocity: [0, 0, 2], brake: 20 },
    { name: "four driven wheels", count: 4, engineForce: 100 },
    { name: "four braking wheels", count: 4, velocity: [0, 0, 5], brake: 20 },
    { name: "combined steering and braking", velocity: [2, 0, 5], brake: 20, steering: 0.25 },
    { name: "combined steering and throttle", velocity: [2, 0, 5], engineForce: 100, steering: 0.25 },
    { name: "inverted axle", axle: [-1, 0, 0], engineForce: 100 },
    { name: "tilted chassis", rotation: [Math.sin(0.075), 0, 0, Math.cos(0.075)], velocity: [0, -1, 3] },
    { name: "inclined road", roadRotation: [0, 0, Math.sin(0.05), Math.cos(0.05)], velocity: [1, -1, 0] },
    { name: "suspension travel limit", y: 0.5, travel: 0.1 },
    { name: "suspension force limit", maxForce: 1 },
    { name: "suspension force limit under throttle", maxForce: 1, engineForce: 100 },
    { name: "suspension force limit during lateral slip", maxForce: 1, velocity: [3, 0, 0] },
    { name: "zero suspension force limit under throttle", maxForce: 0, engineForce: 100 },
    { name: "wheel at ray boundary", y: 0.9 },
    { name: "lateral slip with high inertia", mass: 5, inertia: 10, velocity: [1, 0, 0] },
    { name: "lateral slip with low inertia", mass: 20, inertia: 1, velocity: [1, 0, 0] },
    { name: "braking one grounded wheel of four", count: 4, airborneWheels: 3, velocity: [0, 0, 5], brake: 100 },
    { name: "rotated anisotropic inertia with lateral slip", inertia: [1, 3, 10], rotation: [0, Math.sin(0.2), 0, Math.cos(0.2)], velocity: [2, -1, 3], steering: 0.2 }
  ];
  it.each(cases)("matches $name", async (scenario) => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const samples = worlds.map((world) => {
        const road = world.createRigidBody({
          type: scenario.roadVelocity ? "dynamic" : "static", position: [0, -0.5, 0],
          mass: 1000, inertia: [1000, 1000, 1000], velocity: scenario.roadVelocity ?? [0, 0, 0],
          rotation: scenario.roadRotation ?? [0, 0, 0, 1]
        });
        world.createCollider(road, { shape: Shape.box(20, 0.5, 20), material: { friction: scenario.friction ?? 1 } });
        const y = scenario.y ?? 0.65;
        const moments = scenario.inertia ?? 3;
        const inertia: Vec3 = typeof moments === "number" ? [moments, moments, moments] : moments;
        const chassis = world.createRigidBody({ type: "dynamic", position: [0, y, 0], mass: scenario.mass ?? 10, inertia });
        world.createCollider(chassis, { shape: Shape.box(0.4, 0.2, 0.5) });
        const vehicle = world.createVehicleController(chassis);
        const mounts: Vec3[] = scenario.count === 4
          ? [[-0.5, -0.2, -0.6], [0.5, -0.2, -0.6], [-0.5, -0.2, 0.6], [0.5, -0.2, 0.6]]
          : [[0, -0.2, 0]];
        for (let index = 0; index < mounts.length; index += 1) {
          const mount = mounts[index]!;
          const connection: Vec3 = [mount[0], mount[1] + (index >= mounts.length - (scenario.airborneWheels ?? 0) ? 2 : 0), mount[2]];
          vehicle.addWheel({ connection, direction: [0, -1, 0], axle: scenario.axle ?? [1, 0, 0], radius: 0.3, restLength: 0.4, suspensionStiffness: 40, suspensionCompression: 2.3, suspensionRelaxation: 4.4, maxSuspensionTravel: scenario.travel ?? 0.5, frictionSlip: 5, ...(scenario.maxForce === undefined ? {} : { maxSuspensionForce: scenario.maxForce }) });
        }
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, y, 0], rotation: scenario.rotation ?? [0, 0, 0, 1], linearVelocity: scenario.velocity ?? [0, 0, 0] });
        for (let index = 0; index < mounts.length; index += 1) {
          vehicle.setWheelCommand(index, { engineForce: scenario.engineForce ?? 0, brake: scenario.brake ?? 0, steering: scenario.steering ?? 0 });
        }
        vehicle.step(1 / 60);
        const wheels = vehicle.wheelStates();
        const speed = vehicle.currentSpeed();
        const velocity = vehicle.linearVelocity();
        const angular = vehicle.angularVelocity();
        world.step(1 / 60);
        return { wheels, speed, velocity, angular, roadVelocity: [...road.velocity] };
      });
      const [existing, native] = samples;
      expect(native!.speed).toBeCloseTo(existing!.speed, 4);
      for (const key of ["velocity", "angular", "roadVelocity"] as const) {
        for (let axis = 0; axis < 3; axis += 1) expect(native![key][axis]).toBeCloseTo(existing![key][axis]!, 4);
      }
      for (let index = 0; index < existing!.wheels.length; index += 1) {
        const expected = existing!.wheels[index]!;
        const actual = native!.wheels[index]!;
        expect(actual.grounded).toBe(expected.grounded);
        for (const key of ["suspensionLength", "rotation", "suspensionForce", "forwardImpulse", "sideImpulse"] as const) {
          expect(actual[key]).toBeCloseTo(expected[key], 4);
        }
        if (expected.grounded) {
          expect(actual.groundColliderHandle).toBe(expected.groundColliderHandle);
          for (let axis = 0; axis < 3; axis += 1) {
            expect(actual.contactPoint![axis]).toBeCloseTo(expected.contactPoint![axis]!, 4);
            expect(actual.contactNormal![axis]).toBeCloseTo(expected.contactNormal![axis]!, 4);
          }
        }
      }
    } finally {
      for (const world of worlds) world.dispose();
    }
  });

  it("matches reset pose, wheel fields and retained airborne wheel rotation", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const snapshots = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(20, 0.5, 20) });
        const body = world.createRigidBody({ type: "dynamic", position: [0, 0.65, 0], mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.4, 0.2, 0.5) });
        const vehicle = world.createVehicleController(body);
        vehicle.addWheel({ connection: [0, -0.2, 0], direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.4 });
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, 0.65, 0], linearVelocity: [0, 0, 5] });
        vehicle.setWheelCommand(0, { brake: 0, steering: 0.1 });
        vehicle.step(1 / 60);
        vehicle.resetToPose({ position: [1, 5, 2], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], linearVelocity: [2, 3, 4], angularVelocity: [0.1, 0.2, 0.3] });
        const reset = { position: vehicle.position(), orientation: vehicle.rotation(), velocity: vehicle.linearVelocity(), angular: vehicle.angularVelocity(), speed: vehicle.currentSpeed(), wheel: vehicle.wheelState(0) };
        vehicle.step(1 / 60);
        return { reset, wheelAfterAirStep: vehicle.wheelState(0) };
      });
      const [existing, native] = snapshots;
      for (const key of ["position", "orientation", "velocity", "angular"] as const) {
        for (let index = 0; index < existing!.reset[key].length; index += 1) {
          expect(native!.reset[key][index]).toBeCloseTo(existing!.reset[key][index]!, 5);
        }
      }
      expect(native!.reset.speed).toBeCloseTo(existing!.reset.speed, 5);
      for (const key of ["engineForce", "brake", "steering", "suspensionLength", "rotation", "suspensionForce", "forwardImpulse", "sideImpulse"] as const) {
        expect(native!.reset.wheel[key]).toBeCloseTo(existing!.reset.wheel[key], 5);
      }
      expect(native!.reset.wheel).toMatchObject({ grounded: false, contactPoint: null, contactNormal: null, groundColliderHandle: null });
      expect(native!.wheelAfterAirStep.rotation).toBeCloseTo(existing!.wheelAfterAirStep.rotation, 5);
      expect(native!.wheelAfterAirStep.grounded).toBe(existing!.wheelAfterAirStep.grounded);
    } finally {
      for (const world of worlds) world.dispose();
    }
  });

  it("preserves suspension contact when the wheel axle aligns with a wall normal", async () => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const samples = worlds.map((world) => {
        const wall = world.createRigidBody({ type: "static", position: [0.9, 0, 0] });
        world.createCollider(wall, { shape: Shape.box(0.5, 10, 10) });
        const body = world.createRigidBody({ type: "dynamic", position: [0, 0.65, 0], mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.2, 0.2, 0.2) });
        const vehicle = world.createVehicleController(body);
        vehicle.addWheel({ connection: [0, -0.2, 0], direction: [1, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.4, suspensionStiffness: 40, frictionSlip: 5 });
        vehicle.setAxes(1, 2).setWheelCommand(0, { engineForce: 100 });
        vehicle.step(1 / 60);
        return { wheel: vehicle.wheelState(0), velocity: vehicle.linearVelocity(), angular: vehicle.angularVelocity() };
      });
      const [existing, native] = samples;
      expect(native!.wheel.grounded).toBe(true);
      for (const key of ["suspensionLength", "suspensionForce", "rotation", "forwardImpulse", "sideImpulse"] as const) {
        expect(native!.wheel[key]).toBeCloseTo(existing!.wheel[key], 4);
      }
      for (const key of ["velocity", "angular"] as const) {
        for (let axis = 0; axis < 3; axis += 1) expect(native![key][axis]).toBeCloseTo(existing![key][axis]!, 4);
      }
    } finally {
      for (const world of worlds) world.dispose();
    }
  });

  it.each([
    { name: "downward ray with default travel", theta: 0 },
    { name: "inclined ray with default travel", theta: 0.3 },
    { name: "downward ray with limited travel", theta: 0, travel: 0.5 },
    { name: "default travel with a large wheel", theta: 0, radius: 10 },
    { name: "upward ray", theta: 1.75 }
  ])("matches a wheel starting inside a box: $name", async ({ theta, travel, radius }) => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const samples = worlds.map((world) => {
        const road = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(road, { shape: Shape.box(20, 0.5, 20) });
        const rotation = [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)] as const;
        const body = world.createRigidBody({ type: "dynamic", position: [0, 0.7, 0], rotation, mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.2, 0.2, 0.2) });
        const vehicle = world.createVehicleController(body);
        vehicle.addWheel({ connection: [0, -0.71 * Math.cos(theta), 0.71 * Math.sin(theta)], direction: [0, -1, 0], axle: [1, 0, 0], radius: radius ?? 0.3, restLength: 0.4, suspensionStiffness: 40, frictionSlip: 5, ...(travel === undefined ? {} : { maxSuspensionTravel: travel }) });
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, 0.7, 0], rotation });
        vehicle.step(1 / 60);
        return { wheel: vehicle.wheelState(0), velocity: vehicle.linearVelocity(), angular: vehicle.angularVelocity() };
      });
      const [existing, native] = samples;
      expect(native!.wheel.grounded).toBe(existing!.wheel.grounded);
      for (const key of ["suspensionLength", "suspensionForce", "rotation", "forwardImpulse", "sideImpulse"] as const) {
        expect(Math.abs(native!.wheel[key] - existing!.wheel[key])).toBeLessThanOrEqual(2e-6 * Math.max(1, Math.abs(existing!.wheel[key])));
      }
      for (const key of ["velocity", "angular"] as const) {
        for (let axis = 0; axis < 3; axis += 1) expect(native![key][axis]).toBeCloseTo(existing![key][axis]!, 4);
      }
      for (let axis = 0; axis < 3; axis += 1) expect(native!.wheel.contactNormal![axis]).toBeCloseTo(existing!.wheel.contactNormal![axis]!, 4);
    } finally {
      for (const world of worlds) world.dispose();
    }
  });

  it.each([
    { name: "sphere, no exit within the ray", shape: "sphere", theta: 0, rotation: 0 },
    { name: "sphere, exit within the ray", shape: "sphere", theta: 1.75, rotation: 0 },
    { name: "plane, no exit within the ray", shape: "plane", theta: 0.3, rotation: 0 },
    { name: "rotated plane, exit within the ray", shape: "plane", theta: 1.75, rotation: 0.3 }
  ])("matches a wheel starting inside a $name", async ({ shape, theta, rotation: angle }) => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, 0, 0] }), new NativePhysicsWorld({ gravity: [0, 0, 0] })];
    try {
      const samples = worlds.map((world) => {
        const road = world.createRigidBody({ type: "static", rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] });
        world.createCollider(road, { shape: shape === "sphere" ? Shape.sphere(1) : Shape.plane() });
        const rotation = [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)] as const;
        const y = shape === "sphere" ? 1.7 : 0.7;
        const offset = shape === "sphere" ? 0.8 : 0.71;
        const body = world.createRigidBody({ type: "dynamic", position: [0, y, 0], rotation, mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.2, 0.2, 0.2) });
        const vehicle = world.createVehicleController(body);
        vehicle.addWheel({ connection: [0, -offset * Math.cos(theta), offset * Math.sin(theta)], direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.4, suspensionStiffness: 40, frictionSlip: 5 });
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, y, 0], rotation });
        vehicle.step(1 / 60);
        return { wheel: vehicle.wheelState(0), velocity: vehicle.linearVelocity(), angular: vehicle.angularVelocity() };
      });
      const [existing, native] = samples;
      expect(native!.wheel.grounded).toBe(existing!.wheel.grounded);
      for (const key of ["suspensionLength", "suspensionForce", "rotation", "forwardImpulse", "sideImpulse"] as const) {
        expect(Math.abs(native!.wheel[key] - existing!.wheel[key])).toBeLessThanOrEqual(2e-6 * Math.max(1, Math.abs(existing!.wheel[key])));
      }
      for (const key of ["velocity", "angular"] as const) {
        for (let axis = 0; axis < 3; axis += 1) expect(native![key][axis]).toBeCloseTo(existing![key][axis]!, 4);
      }
      for (let axis = 0; axis < 3; axis += 1) expect(native!.wheel.contactNormal![axis]).toBeCloseTo(existing!.wheel.contactNormal![axis]!, 4);
    } finally {
      for (const world of worlds) world.dispose();
    }
  });

  it.each([
    { name: "suspension settling", steering: 0, engineForce: 0, brake: 0, speed: 0 },
    { name: "four-wheel drive", steering: 0, engineForce: 30, brake: 0, speed: 0 },
    { name: "four-wheel steering", steering: 0.25, engineForce: 30, brake: 0, speed: 0 },
    { name: "four-wheel braking", steering: 0, engineForce: 0, brake: 4, speed: 5 }
  ])("tracks $name over 30 steps before chassis impact", async (scenario) => {
    const [{ PhysicsWorld }, { NativePhysicsWorld }] = await Promise.all([
      import("../../../packages/physics/src/PhysicsWorld.js"),
      import("../../../packages/physics/src/native/NativePhysicsWorld.js")
    ]);
    const worlds = [new PhysicsWorld({ gravity: [0, -9.81, 0] }), new NativePhysicsWorld({ gravity: [0, -9.81, 0] })];
    try {
      const snapshots = worlds.map((world) => {
        const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
        world.createCollider(floor, { shape: Shape.box(50, 0.5, 50) });
        const body = world.createRigidBody({ type: "dynamic", position: [0, 0.75, 0], mass: 10, inertia: [3, 3, 3] });
        world.createCollider(body, { shape: Shape.box(0.4, 0.2, 0.5) });
        const vehicle = world.createVehicleController(body);
        for (const connection of [[-0.5, -0.2, -0.6], [0.5, -0.2, -0.6], [-0.5, -0.2, 0.6], [0.5, -0.2, 0.6]] as const) {
          vehicle.addWheel({ connection, direction: [0, -1, 0], axle: [1, 0, 0], radius: 0.3, restLength: 0.4, suspensionStiffness: 40, suspensionCompression: 2.3, suspensionRelaxation: 4.4, frictionSlip: 5 });
        }
        vehicle.setAxes(1, 2);
        vehicle.resetToPose({ position: [0, 0.75, 0], linearVelocity: [0, 0, scenario.speed] });
        for (let index = 0; index < 4; index += 1) vehicle.setWheelCommand(index, { engineForce: scenario.engineForce, brake: scenario.brake, steering: scenario.steering });
        for (let index = 0; index < 30; index += 1) { vehicle.step(1 / 60); world.step(1 / 60); }
        return { position: [...body.position], velocity: [...body.velocity], rotation: [...body.rotation], grounded: vehicle.groundedWheelCount() };
      });
      const [existing, native] = snapshots;
      expect(native!.grounded).toBe(existing!.grounded);
      for (const key of ["position", "velocity", "rotation"] as const) {
        for (let index = 0; index < existing![key].length; index += 1) {
          expect(Math.abs(native![key][index]! - existing![key][index]!)).toBeLessThan(0.005);
        }
      }
    } finally {
      for (const world of worlds) world.dispose();
    }
  });
});
