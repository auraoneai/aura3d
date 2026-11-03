import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape } from "../../../packages/physics/src/Shape.js";
import { createNativeCharacter, type NativeCharacterHost } from "../../../packages/physics/src/native/NativeCharacter.js";
import { NativePhysicsWorld } from "../../../packages/physics/src/native/NativePhysicsWorld.js";

function level(shape: PhysicsShape, bottom: number, options: {
  height?: number;
  width?: number;
  ceiling?: number;
  boxFloor?: boolean;
  stepType?: "static" | "dynamic";
  includeDynamicBodies?: boolean;
  maxHeight?: number;
  minWidth?: number;
} = {}) {
  const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
  const ground = world.createRigidBody({ type: "static", position: options.boxFloor ? [0, -0.5, 0] : [0, 0, 0] });
  world.createCollider(ground, { shape: options.boxFloor ? Shape.box(5, 0.5, 5) : Shape.plane([0, 1, 0]) });
  const height = options.height ?? 0.3;
  const width = options.width ?? 1;
  const step = world.createRigidBody({ type: options.stepType ?? "static", position: [0.5 + width / 2, height / 2, 0] });
  world.createCollider(step, { shape: Shape.box(width / 2, height / 2, 1) });
  if (options.ceiling !== undefined) {
    const ceiling = world.createRigidBody({ type: "static", position: [0.5, options.ceiling + 0.1, 0] });
    world.createCollider(ceiling, { shape: Shape.box(2, 0.1, 1) });
  }
  const body = world.createRigidBody({ type: "kinematic", position: [0, bottom + 0.01, 0] });
  world.createCollider(body, { shape });
  const character = world.createCharacterController(body, {
    offset: 0.01, autoStepHeight: options.maxHeight ?? 0.4, autoStepMinWidth: options.minWidth ?? 0.2,
    autoStepIncludeDynamicBodies: options.includeDynamicBodies ?? false
  });
  return { world, body, step, character };
}

describe("native character autostep geometry", () => {
  it.each([
    { name: "sphere", shape: Shape.sphere(0.2), bottom: 0.2 },
    { name: "capsule", shape: Shape.capsule(0.2, 0.4), bottom: 0.6 },
    { name: "box", shape: Shape.box(0.2, 0.6, 0.2), bottom: 0.6 }
  ])("climbs a wide 0.3-unit ledge with a $name", ({ shape, bottom }) => {
    const { world, character } = level(shape, bottom);
    try {
      expect(character.move([0, 0, 0]).grounded).toBe(true);
      const result = character.move([1, 0, 0]);
      expect(result.requested).toEqual([1, 0, 0]);
      expect(result.applied[0]).toBeCloseTo(1, 6);
      expect(result.applied[1]).toBeCloseTo(0.3, 6);
      expect(result.position[0]).toBeCloseTo(1, 6);
      expect(result.position[1]).toBeCloseTo(bottom + 0.31, 6);
      expect(result.grounded).toBe(true);
      expect(result.collisions).toBeGreaterThan(0);
    } finally { world.dispose(); }
  });

  it("never advances farther than the requested horizontal displacement", () => {
    const { world, character } = level(Shape.box(0.2, 0.6, 0.2), 0.6);
    try {
      character.move([0, 0, 0]);
      character.move([0.28, 0, 0]);
      const movement = character.move([0.1, 0, 0]);
      expect(movement.applied[0]).toBeCloseTo(0.1, 6);
      expect(movement.position[0]).toBeCloseTo(0.38, 6);
      expect(movement.position[1]).toBeCloseTo(0.91, 6);
    } finally { world.dispose(); }
  });

  it("clears a low lip reached by a sphere's rounded underside on a box floor", () => {
    const { world, character } = level(Shape.sphere(0.2), 0.2, { height: 0.1, boxFloor: true });
    try {
      character.move([0, 0, 0]);
      const movement = character.move([1, 0, 0]);
      expect(movement.position[0]).toBeCloseTo(1, 5);
      expect(movement.position[1]).toBeCloseTo(0.31, 5);
      expect(movement.grounded).toBe(true);
    } finally { world.dispose(); }
  });

  it("does not climb above the configured height or through a ceiling", () => {
    for (const options of [{ height: 0.5 }, { ceiling: 1.35 }]) {
      const { world, character } = level(Shape.box(0.2, 0.6, 0.2), 0.6, options);
      try {
        character.move([0, 0, 0]);
        const movement = character.move([1, 0, 0]);
        expect(movement.position[0]).toBeCloseTo(0.29, 5);
        expect(movement.position[1]).toBeCloseTo(0.61, 5);
        expect(movement.grounded).toBe(true);
      } finally { world.dispose(); }
    }
  });

  it.each([
    { name: "sphere", shape: Shape.sphere(0.2), bottom: 0.2 },
    { name: "capsule", shape: Shape.capsule(0.2, 0.4), bottom: 0.6 },
    { name: "box", shape: Shape.box(0.2, 0.6, 0.2), bottom: 0.6 }
  ])("requires minimum landing width for a $name even when its footprint overlaps a narrow ledge", ({ shape, bottom }) => {
    const { world, character } = level(shape, bottom, { width: 0.1, minWidth: 0.2 });
    try {
      character.move([0, 0, 0]);
      const movement = character.move([1, 0, 0]);
      expect(movement.position[0]).toBeLessThan(0.4);
      expect(movement.position[1]).toBeCloseTo(bottom + 0.01, 5);
      expect(movement.grounded).toBe(true);
    } finally { world.dispose(); }
  });

  it("only uses a dynamic step as support when the option is enabled", () => {
    for (const includeDynamicBodies of [false, true]) {
      const { world, character, step } = level(Shape.box(0.2, 0.6, 0.2), 0.6, { stepType: "dynamic", includeDynamicBodies });
      try {
        character.move([0, 0, 0]);
        const obstacleBefore = step.snapshot();
        const movement = character.move([1, 0, 0]);
        expect(movement.position[0]).toBeCloseTo(includeDynamicBodies ? 1 : 0.29, 5);
        expect(movement.position[1]).toBeCloseTo(includeDynamicBodies ? 0.91 : 0.61, 5);
        expect(movement.grounded).toBe(true);
        expect(step.snapshot()).toEqual(obstacleBefore);
      } finally { world.dispose(); }
    }
  });

  it("steps onto a sloped landing only when its top is within the climb angle", () => {
    const angle = 0.2, sine = Math.sin(angle), cosine = Math.cos(angle);
    // The tilted box's front top corner is exactly (0.5, 0.3), and the
    // landing face rises by tan(angle) per unit of horizontal movement.
    const center = [0.5 + 0.5 * cosine + 0.15 * sine, 0.3 + 0.5 * sine - 0.15 * cosine, 0] as const;
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    for (const maxSlopeClimbAngle of [0.1, 0.4]) {
      const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
      try {
        const ground = world.createRigidBody({ type: "static" });
        world.createCollider(ground, { shape: Shape.plane([0, 1, 0]) });
        const ramp = world.createRigidBody({ type: "static", position: center, rotation });
        world.createCollider(ramp, { shape: Shape.box(0.5, 0.15, 1) });
        const body = world.createRigidBody({ type: "kinematic", position: [0, 0.21, 0] });
        world.createCollider(body, { shape: Shape.sphere(0.2) });
        const character = world.createCharacterController(body, { offset: 0.01, autoStepHeight: 0.5, autoStepMinWidth: 0.2, maxSlopeClimbAngle });
        expect(character.move([0, 0, 0]).grounded).toBe(true);
        const movement = character.move([1, 0, 0]);
        if (maxSlopeClimbAngle < angle) {
          expect(movement.position[0]).toBeLessThan(0.4);
          expect(movement.position[1]).toBeCloseTo(0.21, 5);
        } else {
          expect(movement.position[0]).toBeGreaterThan(0.8);
          expect(movement.position[0]).toBeLessThanOrEqual(1);
          const expectedHeight = 0.3 + Math.tan(angle) * (movement.position[0] - 0.5) + 0.21 / cosine;
          expect(movement.position[1]).toBeCloseTo(expectedHeight, 5);
        }
        expect(movement.grounded).toBe(true);
      } finally { world.dispose(); }
    }
  });

  it("walks a shallow slope and blocks a steeper-than-configured climb", () => {
    // y = 0.75x has unit normal [-0.6, 0.8, 0]. A radius-0.21
    // inflated sphere touches it at center y = 0.21 / 0.8.
    for (const [limit, expectedX, expectedRise] of [[Math.PI / 3, 0.64, 0.48], [Math.PI / 6, 0, 0]] as const) {
      const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
      try {
        const ramp = world.createRigidBody({ type: "static" });
        world.createCollider(ramp, { shape: Shape.plane([-0.6, 0.8, 0]) });
        const body = world.createRigidBody({ type: "kinematic", position: [0, 0.2625, 0] });
        world.createCollider(body, { shape: Shape.sphere(0.2) });
        const character = world.createCharacterController(body, { offset: 0.01, autoStepHeight: 0.4, maxSlopeClimbAngle: limit });
        const movement = character.move([1, 0, 0]);
        expect(movement.applied[0]).toBeCloseTo(expectedX, 6);
        expect(movement.applied[1]).toBeCloseTo(expectedRise, 6);
        expect(movement.grounded).toBe(expectedX > 0);
      } finally { world.dispose(); }
    }
  });

  it("slides along the shared edge of a floor and tilted blocking wall", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const floor = world.createRigidBody({ type: "static" });
      world.createCollider(floor, { shape: Shape.plane([0, 1, 0]) });
      const wall = world.createRigidBody({ type: "static" });
      world.createCollider(wall, { shape: Shape.plane([-0.8, -0.6, 0]) });
      // The inflated sphere touches both planes at this starting position.
      const body = world.createRigidBody({ type: "kinematic", position: [-0.42, 0.21, 0] });
      world.createCollider(body, { shape: Shape.sphere(0.2) });
      const character = world.createCharacterController(body, { offset: 0.01 });
      const movement = character.move([1, 0, 1]);
      expect(movement.position[0]).toBeCloseTo(-0.42, 6);
      expect(movement.position[1]).toBeCloseTo(0.21, 6);
      expect(movement.position[2]).toBeCloseTo(1, 6);
      expect(movement.grounded).toBe(true);
    } finally { world.dispose(); }
  });

  it("surfaces an unsupported support geometry without committing movement or impulses", () => {
    const body = new RigidBody(1, { type: "kinematic", position: [0, 0.61, 0] });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.2, 0.6, 0.2) });
    const floor = new RigidBody(2, { type: "static" });
    const floorCollider = new Collider(2, floor.id, { shape: Shape.plane([0, 1, 0]) });
    const obstacle = new RigidBody(3, { type: "static" });
    const obstacleCollider = new Collider(3, obstacle.id, { shape: Shape.box(0.5, 0.15, 1) });
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep({ position, displacement, offset }) {
        if (displacement[0] > 0 && position[1] < 0.7) {
          return { fraction: 0.29 / displacement[0], normal: [-1, 0, 0], point: [0.5, 0.2, 0], body: obstacle, collider: obstacleCollider };
        }
        if (displacement[1] < 0) {
          const top = position[0] >= 0.5 - 1e-8 ? 0.3 : 0;
          const fraction = (position[1] - 0.6 - offset - top) / -displacement[1];
          if (fraction >= -1e-8 && fraction <= 1) return { fraction: Math.max(0, fraction), normal: [0, 1, 0], point: [position[0], top, 0], body: floor, collider: floorCollider };
        }
        return undefined;
      },
      certifySupportPath: () => ({ status: "unsupported", reason: "curved landing geometry" })
    };
    const character = createNativeCharacter(body, collider, host, { autoStepHeight: 0.4, autoStepMinWidth: 0.2 });
    const before = body.snapshot();
    expect(() => character.move([1, 0, 0])).toThrow(/autostep.*unsupported.*curved/i);
    expect(body.snapshot()).toEqual(before);
    expect(character.grounded()).toBe(false);
  });

  it("recognizes a blocking oblique contact even for a very short displacement", () => {
    const body = new RigidBody(1, { type: "kinematic", position: [0, 0.61, 0] });
    const collider = new Collider(1, body.id, { shape: Shape.box(0.2, 0.6, 0.2) });
    const obstacle = new RigidBody(2, { type: "static" });
    const obstacleCollider = new Collider(2, obstacle.id, { shape: Shape.plane([-0.5, Math.sqrt(0.75), 0]) });
    const host: NativeCharacterHost = {
      fixedDelta: 1 / 60,
      sweep: ({ displacement }) => displacement[0] > 0
        ? { fraction: 0, normal: [-0.5, Math.sqrt(0.75), 0], point: [0, 0, 0], body: obstacle, collider: obstacleCollider }
        : undefined
    };
    const movement = createNativeCharacter(body, collider, host).move([1.1e-8, 0, 0]);
    expect(movement.collisions).toBe(1);
    expect(movement.position).toEqual([0, 0.61, 0]);
  });
});
