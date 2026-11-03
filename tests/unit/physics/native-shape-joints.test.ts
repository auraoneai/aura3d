import { describe, expect, it } from "vitest";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { Constraint, type ConstraintDescriptor } from "../../../packages/physics/src/Constraint.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";

describe("physics shape contracts", () => {
  it("keeps every transformed heightfield sample inside conservative rotated bounds", () => {
    const terrain = Shape.heightfield([[-2, 3], [3, -2]], 1);
    const s = Math.sin(Math.PI / 8);
    const c = Math.cos(Math.PI / 8);
    const bounds = Shape.bounds(terrain, [10, 2, -4], [s, 0, 0, c]);
    const root2 = Math.sqrt(2);
    expect(bounds.min[1]).toBeCloseTo(2 - 2.5 / root2, 12);
    expect(bounds.max[1]).toBeCloseTo(2 + 3.5 / root2, 12);
    expect(bounds.min[2]).toBeCloseTo(-4 - 2.5 / root2, 12);
    expect(bounds.max[2]).toBeCloseTo(-4 + 3.5 / root2, 12);
    // Scaling a valid quaternion must not distort the bound.
    const scaled = Shape.bounds(terrain, [10, 2, -4], [s * 7, 0, 0, c * 7]);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(scaled.min[axis]).toBeCloseTo(bounds.min[axis]!, 12);
      expect(scaled.max[axis]).toBeCloseTo(bounds.max[axis]!, 12);
    }
    for (let row = 0; row < 2; row += 1) for (let column = 0; column < 2; column += 1) {
      const x = 10 + column - 0.5;
      const y = terrain.heights[row * 2 + column]!;
      const z = row - 0.5;
      const world: Vec3 = [x, 2 + (y - z) / root2, -4 + (y + z) / root2];
      for (let axis = 0; axis < 3; axis += 1) {
        expect(world[axis]!).toBeGreaterThanOrEqual(bounds.min[axis]! - 1e-12);
        expect(world[axis]!).toBeLessThanOrEqual(bounds.max[axis]! + 1e-12);
      }
    }
  });

  it("bounds a large heightfield without passing every sample as function arguments", () => {
    const rows = Array.from({ length: 400 }, () => Array<number>(400).fill(0));
    rows[0]![0] = -2;
    rows[399]![399] = 5;
    const bounds = Shape.bounds(Shape.heightfield(rows), [0, 0, 0]);
    expect(bounds.min).toEqual([-199.5, -2, -199.5]);
    expect(bounds.max).toEqual([199.5, 5, 199.5]);
  });

  it("validates externally authored shapes and does not change their contents", () => {
    const terrain = { kind: "heightfield", rows: 2, columns: 2, heights: [1, 2, 3, 4], cellSize: 2 } as const;
    const before = JSON.stringify(terrain);
    Shape.validate(terrain);
    expect(JSON.stringify(terrain)).toBe(before);
    const hull = Shape.convexHull(
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
    );
    for (const shape of [Shape.box(1, 2, 3), Shape.sphere(1), Shape.capsule(1, 2), Shape.plane(),
      Shape.mesh([[0, 0, 0], [1, 0, 0], [0, 0, 1]], [0, 1, 2]), hull, terrain]) {
      expect(() => Shape.validate(shape)).not.toThrow();
    }
    expect(() => Shape.validate({ kind: "box", halfExtents: [1, 0, 1] })).toThrow(/positive/);
    expect(() => Shape.validate({ kind: "plane", normal: [0, 2, 0], constant: 0 })).toThrow(/unit vector/);
    expect(() => Shape.validate({ kind: "heightfield", rows: 2, columns: 2, heights: [0, 0], cellSize: 1 })).toThrow(/rows\*columns/);
    expect(() => Shape.validate({ kind: "heightfield", rows: 2, columns: 2, heights: [0, NaN, 0, 0], cellSize: 1 })).toThrow(/finite/);
    expect(() => Shape.validate({ kind: "unknown" } as unknown as PhysicsShape)).toThrow(/Unknown physics shape/);
    expect(() => Shape.mesh([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [0, 1, 2])).toThrow(/non-degenerate triangle/);
    expect(() => Shape.convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], [0, 1, 2])).toThrow(/3D volume/);
    expect(() => Shape.bounds(terrain, [0, 0, 0], [0, 0, 0, 0])).toThrow(/quaternion cannot be zero/);
  });

  it("copies and freezes collider geometry so later edits cannot change the live shape", () => {
    const heights = [0, 1, 2, 3];
    const terrain = { kind: "heightfield", rows: 2, columns: 2, heights, cellSize: 1 } as const;
    const copy = Shape.clone(terrain);
    heights[0] = 100;
    expect(copy.kind).toBe("heightfield");
    if (copy.kind !== "heightfield") throw new Error("Expected a heightfield clone.");
    expect(copy.heights[0]).toBe(0);
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy.heights)).toBe(true);

    const vertices: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    const indices = [0, 1, 2];
    const mesh = Shape.clone({ kind: "mesh", vertices, indices });
    vertices[0]![0] = 5;
    indices[0] = 2;
    if (mesh.kind !== "mesh") throw new Error("Expected a mesh clone.");
    expect(mesh.vertices[0]).toEqual([0, 0, 0]);
    expect(mesh.indices).toEqual([0, 1, 2]);
    expect(Object.isFrozen(mesh.vertices[0])).toBe(true);
    expect(Object.isFrozen(mesh.indices)).toBe(true);
  });
});

describe("physics constraint contracts", () => {
  const bodyA = new RigidBody(1, { type: "static" });
  const bodyB = new RigidBody(2, { position: [0, 1, 0] });
  const descriptor = (overrides: Partial<ConstraintDescriptor> = {}): ConstraintDescriptor => ({
    type: "hinge", bodyA, bodyB, ...overrides
  });

  it("rejects unknown joint kinds, ignored options and invalid numerical inputs", () => {
    expect(() => new Constraint(descriptor({ type: "unknown" as ConstraintDescriptor["type"] }))).toThrow(/Unknown constraint type/);
    expect(() => new Constraint(descriptor({ axis: [NaN, 0, 0] }))).toThrow(/constraint axis/);
    expect(() => new Constraint(descriptor({ axis: [0, 0, 0] }))).toThrow(/zero-length/);
    expect(() => new Constraint(descriptor({ type: "fixed", restLength: 1 }))).toThrow(/only supported on spring/);
    expect(() => new Constraint(descriptor({ type: "spring", motorSpeed: 2 }))).toThrow(/only supported on motorised-hinge/);
    expect(() => new Constraint(descriptor({ type: "spring", limits: [-1, 1] }))).toThrow(/only supported on hinge/);
    expect(() => new Constraint(descriptor({ limits: [-Infinity, 1] }))).toThrow(/finite and ordered/);
    expect(() => new Constraint(descriptor({ type: "motorised-hinge", motorSpeed: NaN }))).toThrow(/motorSpeed must be finite/);
    expect(() => new Constraint(descriptor({ type: "motorised-hinge", motorSpeed: null as unknown as number }))).toThrow(/motorSpeed must be a number/);
    expect(() => new Constraint(descriptor({ type: "motorised-hinge", motorSpeed: 1, maxMotorTorque: -1 }))).toThrow(/maxMotorTorque/);
  });

  it("owns its anchor and limit data and restricts runtime motor operations", () => {
    const anchor: [number, number, number] = [1, 2, 3];
    const limits: [number, number] = [-1, 1];
    const hinge = new Constraint(descriptor({ localAnchorA: anchor, limits }));
    anchor[0] = 100;
    limits[0] = -100;
    expect(hinge.localAnchorA).toEqual([1, 2, 3]);
    expect(hinge.limits).toEqual([-1, 1]);
    expect(() => hinge.setMotorSpeed(1)).toThrow(/only valid on a motorised-hinge/);
    const motor = new Constraint(descriptor({ type: "motorised-hinge", motorSpeed: 1, maxMotorTorque: 0 }));
    motor.setMotorSpeed(-2);
    expect(motor.motorSpeed()).toBe(-2);
    expect(() => motor.setMotorSpeed(Infinity)).toThrow(/finite/);
    motor.setEnabled(false);
    expect(motor.isEnabled()).toBe(false);
  });
});
