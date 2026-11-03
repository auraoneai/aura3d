import { describe, expect, it, vi } from "vitest";
import { Euler } from "../../../packages/math/src/independent/mutable/Euler.js";
import { Quaternion, type EulerOrder } from "../../../packages/math/src/independent/mutable/Quaternion.js";

type V3 = [number, number, number];
type M3 = number[][];
const orders: EulerOrder[] = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];
const basis: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function matrixProduct(a: M3, b: M3): M3 {
  return a.map((row) => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

// Explicit axis rotations and ordinary matrix multiplication provide an independent oracle.
function expectedMatrix(angles: { x: number; y: number; z: number; order: EulerOrder }): M3 {
  const turns = {
    X: [[1, 0, 0], [0, Math.cos(angles.x), -Math.sin(angles.x)], [0, Math.sin(angles.x), Math.cos(angles.x)]],
    Y: [[Math.cos(angles.y), 0, Math.sin(angles.y)], [0, 1, 0], [-Math.sin(angles.y), 0, Math.cos(angles.y)]],
    Z: [[Math.cos(angles.z), -Math.sin(angles.z), 0], [Math.sin(angles.z), Math.cos(angles.z), 0], [0, 0, 1]]
  };
  return [...angles.order].reduce((matrix, axis) => matrixProduct(matrix, turns[axis as keyof typeof turns]), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
}

function elements(matrix: M3): number[] {
  return [matrix[0][0], matrix[1][0], matrix[2][0], 0,
    matrix[0][1], matrix[1][1], matrix[2][1], 0,
    matrix[0][2], matrix[1][2], matrix[2][2], 0, 0, 0, 0, 1];
}

function rotated(q: { x: number; y: number; z: number; w: number }, vector: V3): V3 {
  const [vx, vy, vz] = vector;
  const tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + q.y * tz - q.z * ty,
    vy + q.w * ty + q.z * tx - q.x * tz,
    vz + q.w * tz + q.x * ty - q.y * tx];
}

function expectVector(actual: readonly number[], expected: readonly number[], tolerance = 1e-10): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
}

function expectRotation(q: Quaternion, matrix: M3, tolerance = 1e-10): void {
  for (let col = 0; col < 3; col++) {
    expectVector(rotated(q, basis[col]), [matrix[0][col], matrix[1][col], matrix[2][col]], tolerance);
  }
}

function randomGenerator(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

describe("independent mutable rotations", () => {
  it("constructs expected axis and composed rotations for all intrinsic orders", () => {
    const random = randomGenerator(0x1badb002);
    for (const order of orders) {
      for (let sample = 0; sample < 80; sample++) {
        const angles = { x: (random() * 2 - 1) * Math.PI, y: (random() * 2 - 1) * Math.PI,
          z: (random() * 2 - 1) * Math.PI, order };
        const matrix = expectedMatrix(angles);
        const q = new Quaternion().setFromEuler(angles);
        expect(q.length()).toBeCloseTo(1, 13);
        expectRotation(q, matrix);
        expectRotation(new Quaternion().setFromRotationMatrix({ elements: elements(matrix) }), matrix);
        for (const result of [new Euler().setFromRotationMatrix({ elements: elements(matrix) }, order),
          new Euler().setFromQuaternion(q, order)]) {
          expectRotation(new Quaternion().setFromEuler(result), matrix);
          expect(result.order).toBe(order);
        }
      }
    }
  });

  it("preserves orientation at and close to every order's two gimbal locks", () => {
    const random = randomGenerator(0x5871);
    for (const order of orders) {
      for (const side of [-1, 1]) {
        for (const delta of [0, 1e-13, 1e-10, 1e-8, 1e-6]) {
          for (let sample = 0; sample < 8; sample++) {
            const angles = { x: (2 * random() - 1) * Math.PI, y: (2 * random() - 1) * Math.PI,
              z: (2 * random() - 1) * Math.PI, order };
            const middle = order[1].toLowerCase() as "x" | "y" | "z";
            angles[middle] = side * (Math.PI / 2 - delta);
            const matrix = expectedMatrix(angles);
            const q = new Quaternion().setFromEuler(angles);
            const fromQuaternion = new Euler().setFromQuaternion(q, order);
            const fromMatrix = new Euler().setFromRotationMatrix({ elements: elements(matrix) }, order);
            expectRotation(new Quaternion().setFromEuler(fromQuaternion), matrix, 2e-10);
            expectRotation(new Quaternion().setFromEuler(fromMatrix), matrix, 2e-10);
          }
        }
      }
    }
  });

  it("reorders without changing the represented rotation", () => {
    const random = randomGenerator(0xdecafbad);
    for (const sourceOrder of orders) for (const targetOrder of orders) {
      for (let sample = 0; sample < 10; sample++) {
        const angles = { x: (2 * random() - 1) * Math.PI, y: (2 * random() - 1) * Math.PI,
          z: (2 * random() - 1) * Math.PI, order: sourceOrder };
        const original = expectedMatrix(angles);
        const euler = new Euler(angles.x, angles.y, angles.z, sourceOrder).reorder(targetOrder);
        expect(euler.order).toBe(targetOrder);
        expectRotation(new Quaternion().setFromEuler(euler), original);
      }
    }
  });

  it("handles pi rotations, parallel and nearly antiparallel unit vectors", () => {
    for (const axis of basis) {
      for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI]) {
        const q = new Quaternion().setFromAxisAngle({ x: axis[0], y: axis[1], z: axis[2] }, angle);
        const matrix = basis.map((_, row) => basis.map((v) => rotated(q, v)[row]));
        expectRotation(new Quaternion().setFromRotationMatrix({ elements: elements(matrix) }), matrix);
      }
    }
    const from = { x: 1, y: 0, z: 0 };
    for (const to of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: -Math.cos(1e-9), y: Math.sin(1e-9), z: 0 }, { x: 0, y: 1, z: 0 }]) {
      const q = new Quaternion().setFromUnitVectors(from, to);
      expect(q.length()).toBeCloseTo(1, 14);
      expectVector(rotated(q, [1, 0, 0]), [to.x, to.y, to.z], 1e-12);
    }
  });

  it("uses the shortest interpolation arc and treats antipodal quaternions as the same orientation", () => {
    const start = new Quaternion();
    const end = new Quaternion().setFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI);
    const opposite = new Quaternion(-end.x, -end.y, -end.z, -end.w);
    expect(end.angleTo(opposite)).toBe(0);
    // Component equality remains distinct even when the rotations coincide.
    expect(end.equals(opposite)).toBe(false);
    expect(start.angleTo(end)).toBeCloseTo(Math.PI, 14);
    const halfway = start.clone().slerp(end, 0.5);
    expectVector(rotated(halfway, [1, 0, 0]), [0, 1, 0]);
    expectRotation(start.clone().slerp(opposite, 0.5), expectedMatrix({ x: 0, y: 0, z: Math.PI / 2, order: "XYZ" }));
    expect(start.clone().rotateTowards(end, 0.3).angleTo(start)).toBeCloseTo(0.3, 12);
    expect(start.clone().rotateTowards(end, 4).angleTo(end)).toBeCloseTo(0, 12);
    expectVector(end.clone().slerp(opposite, 0.5).toArray(), end.toArray());
    const tiny = new Quaternion().setFromAxisAngle({ x: 0, y: 0, z: 1 }, 1e-12);
    expect(start.angleTo(tiny)).toBeCloseTo(1e-12, 20);
    expect(tiny.angleTo(tiny)).toBe(0);
    expectVector(new Quaternion().slerpQuaternions(start, end, 0).toArray(), start.toArray());
    expectVector(new Quaternion().slerpQuaternions(start, end, 1).toArray(), end.toArray());
  });

  it("preserves aliases in quaternion products, interpolation, and flat array operations", () => {
    const a = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.7);
    const b = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, -0.9);
    const result = new Quaternion().multiplyQuaternions(a, b);
    expectVector(a.clone().multiply(b).toArray(), result.toArray());
    expectVector(b.clone().premultiply(a).toArray(), result.toArray());
    const squared = a.clone().multiplyQuaternions(a, a);
    const same = a.clone();
    same.multiplyQuaternions(same, same);
    expectVector(same.toArray(), squared.toArray());
    const buffer = [...a, ...b, 42, 42, 42, 42];
    expect(Quaternion.multiplyQuaternionsFlat(buffer, 2, buffer, 0, buffer, 4)).toBe(buffer);
    expectVector(buffer.slice(2, 6), result.toArray());
    const interpolation = new Quaternion().slerpQuaternions(a, b, 0.3);
    const aAlias = a.clone();
    aAlias.slerpQuaternions(aAlias, b, 0.3);
    const bAlias = b.clone();
    bAlias.slerpQuaternions(a, bAlias, 0.3);
    expectVector(aAlias.toArray(), interpolation.toArray());
    expectVector(bAlias.toArray(), interpolation.toArray());
    const interpolationBuffer = [...a, ...b, 42, 42, 42, 42];
    Quaternion.slerpFlat(interpolationBuffer, 2, interpolationBuffer, 0, interpolationBuffer, 4, 0.3);
    expectVector(interpolationBuffer.slice(2, 6), interpolation.toArray());
  });

  it("calls observers once after compound mutations and honors conversion suppression", () => {
    const q = new Quaternion();
    const qCalls: number[][] = [];
    q._onChange(() => qCalls.push(q.toArray()));
    q.x = 0.25;
    q.set(0, 0, 0, 1);
    q.setFromEuler({ x: 1, y: 2, z: 3, order: "XYZ" }, false);
    expect(qCalls).toHaveLength(2);
    q.setFromEuler({ x: 0.1, y: 0.2, z: 0.3, order: "XYZ" });
    q.multiply(q);
    q.slerp(new Quaternion(), 0.5);
    expect(qCalls).toHaveLength(5);
    expectVector(qCalls[4], q.toArray());
    const e = new Euler();
    const eCalls: Array<Array<number | string>> = [];
    e._onChange(() => eCalls.push(e.toArray()));
    e.order = "ZXY";
    e.setFromQuaternion(q, "XYZ", false);
    e.setFromRotationMatrix({ elements: elements(expectedMatrix({ x: 0, y: 0, z: 0, order: "XYZ" })) }, "XYZ", false);
    expect(eCalls).toHaveLength(1);
    e.setFromQuaternion(q);
    e.reorder("YZX");
    e.x = 3;
    expect(eCalls).toHaveLength(4);
    expect(eCalls[3]).toEqual(e.toArray());
  });

  it("round trips arrays, iterators, immutable values and buffer attributes", () => {
    const q = new Quaternion().fromArray([9, 1, 2, 3, 4, 9], 1);
    expect([...q]).toEqual([1, 2, 3, 4]);
    expect(q.toArray([8, 8, 8, 8, 8, 8], 1)).toEqual([8, 1, 2, 3, 4, 8]);
    expect(q.toJSON()).toEqual([1, 2, 3, 4]);
    expect(q.clone()).not.toBe(q);
    expect(q.clone().equals(q)).toBe(true);
    expect(q.isQuaternion).toBe(true);
    expect(q.lengthSq()).toBe(30);
    expect(q.dot(q)).toBe(30);
    expect(q.clone().conjugate().toArray()).toEqual([-1, -2, -3, 4]);
    expect(q.clone().identity().toArray()).toEqual([0, 0, 0, 1]);
    const immutableQ = q.toImmutable();
    expect(new Quaternion().fromImmutable(immutableQ).equals(q)).toBe(true);
    const attr = { getX: (i: number) => i, getY: (i: number) => i + 1,
      getZ: (i: number) => i + 2, getW: (i: number) => i + 3 };
    expect(new Quaternion().fromBufferAttribute(attr, 3).toArray()).toEqual([3, 4, 5, 6]);
    const e = new Euler().fromArray([1, 2, 3, "ZXY"]);
    expect([...e]).toEqual([1, 2, 3, "ZXY"]);
    expect(e.toArray([8, 8, 8, 8, 8, 8], 1)).toEqual([8, 1, 2, 3, "ZXY", 8]);
    expect(e.clone()).not.toBe(e);
    expect(e.clone().equals(e)).toBe(true);
    expect(e.isEuler).toBe(true);
    expect(new Euler().setFromVector3({ x: 1, y: 2, z: 3 }, "ZXY").equals(e)).toBe(true);
    expect(new Euler().fromImmutable(e.toImmutable()).equals(e)).toBe(true);
    expect(new Euler(0, 0, 0, "YZX").fromArray([4, 5, 6]).order).toBe("YZX");
  });

  it("normalizes and inverts, including zero values, and samples unit random quaternions", () => {
    expect(new Quaternion(0, 0, 0, 0).normalize().toArray()).toEqual([0, 0, 0, 1]);
    expect(new Quaternion(0, 0, 0, 0).invert().toArray()).toEqual([0, 0, 0, 1]);
    const q = new Quaternion(2, -3, 4, -5);
    expectVector(q.clone().multiply(q.clone().invert()).toArray(), [0, 0, 0, 1]);
    expect(q.clone().normalize().length()).toBeCloseTo(1, 14);
    for (const scale of [1e-300, 1e300]) {
      const scaled = new Quaternion(q.x * scale, q.y * scale, q.z * scale, q.w * scale);
      expectVector(scaled.clone().multiply(scaled.clone().invert()).toArray(), [0, 0, 0, 1]);
      expect(scaled.clone().normalize().length()).toBeCloseTo(1, 14);
      expect(scaled.angleTo(q)).toBeCloseTo(0, 14);
      const rotation = new Quaternion().setFromEuler(new Euler().setFromQuaternion(scaled));
      expect(rotation.angleTo(q)).toBeCloseTo(0, 14);
    }
    const rng = randomGenerator(314159);
    const spy = vi.spyOn(Math, "random").mockImplementation(rng);
    try {
      for (let i = 0; i < 100; i++) expect(new Quaternion().random().length()).toBeCloseTo(1, 14);
    } finally { spy.mockRestore(); }
  });

  it("rejects unsupported orders before changing the receiver", () => {
    const q = new Quaternion(1, 2, 3, 4);
    const e = new Euler(1, 2, 3);
    expect(() => q.setFromEuler({ x: 0, y: 0, z: 0, order: "bad" })).toThrow(RangeError);
    expect(q.toArray()).toEqual([1, 2, 3, 4]);
    expect(() => e.setFromRotationMatrix({ elements: elements([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) }, "bad" as EulerOrder)).toThrow(RangeError);
    expect([...e]).toEqual([1, 2, 3, "XYZ"]);
  });
});
