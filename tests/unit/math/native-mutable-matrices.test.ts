import { describe, expect, it } from "vitest";
import { Matrix3 } from "../../../packages/math/src/independent/mutable/Matrix3";
import { Matrix4 } from "../../../packages/math/src/independent/mutable/Matrix4";
import { Matrix3 as ImmutableMatrix3 } from "../../../packages/math/src/Matrix3";
import { Matrix4 as ImmutableMatrix4 } from "../../../packages/math/src/Matrix4";

function closeArray(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-10): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i] - expected[i]), `element ${i}: ${actual[i]} vs ${expected[i]}`).toBeLessThanOrEqual(tolerance);
  }
}

function identity(size: number): number[] {
  return Array.from({ length: size * size }, (_, i) => Number(i % (size + 1) === 0));
}

function point(m: Matrix4, x: number, y: number, z: number): number[] {
  const e = m.elements;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  return [
    (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
    (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
    (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
  ];
}

class Target3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  setFromMatrix3Column(m: Matrix3, index: number): this {
    return this.set(m.elements[3 * index], m.elements[3 * index + 1], m.elements[3 * index + 2]);
  }
  setFromMatrixColumn(m: Matrix4, index: number): this {
    return this.set(m.elements[4 * index], m.elements[4 * index + 1], m.elements[4 * index + 2]);
  }
}

class QuaternionTarget {
  x = 0; y = 0; z = 0; w = 1;
  rotation: Matrix4 | null = null;
  identity(): this { this.x = this.y = this.z = 0; this.w = 1; this.rotation = null; return this; }
  setFromRotationMatrix(m: Matrix4): this { this.rotation = m.clone(); return this; }
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000 * 2 - 1;
  };
}

describe("independent mutable matrix storage and operations", () => {
  it("stores row-form constructor inputs in column-major order, copies, and round-trips native matrices", () => {
    const m3 = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(m3.elements).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    const imm3 = m3.toImmutable();
    expect(imm3).toBeInstanceOf(ImmutableMatrix3);
    expect(new Matrix3().fromImmutable(imm3).elements).toEqual(m3.elements);
    m3.elements[0] = 100;
    expect(imm3.elements[0]).toBe(1);

    const m4 = new Matrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    expect(m4.elements).toEqual([1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]);
    const imm4 = m4.toImmutable();
    expect(imm4).toBeInstanceOf(ImmutableMatrix4);
    expect(new Matrix4().fromImmutable(imm4).elements).toEqual(m4.elements);
    m4.elements[0] = 100;
    expect(imm4.elements[0]).toBe(1);
  });

  it("supports identity, copies, equality, transpose, offsets, and shared arrays", () => {
    const m3 = new Matrix3().fromArray([9, 1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    expect(m3.clone()).not.toBe(m3);
    expect(m3.clone().equals(m3)).toBe(true);
    expect(m3.clone().transpose().elements).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    const transpose = new Array<number>(9);
    expect(m3.transposeIntoArray(transpose)).toBe(m3);
    expect(transpose).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    m3.transposeIntoArray(m3.elements);
    expect(m3.elements).toEqual(transpose);
    const source = [100, ...identity(3)];
    m3.elements = source;
    m3.fromArray(source, 1);
    expect(m3.elements.slice(0, 9)).toEqual(identity(3));
    m3.toArray(m3.elements, 1);
    expect(m3.elements.slice(1, 10)).toEqual(identity(3));
    expect(m3.identity().elements.slice(0, 9)).toEqual(identity(3));

    const m4 = new Matrix4().fromArray([9, ...identity(4)], 1);
    const clone = m4.clone();
    expect(clone).not.toBe(m4);
    expect(clone.equals(m4)).toBe(true);
    expect(new Matrix4().makeTranslation(1, 2, 3).transpose().elements).toEqual([1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
    const input = [8, ...identity(4)];
    m4.elements = input;
    m4.fromArray(input, 1);
    expect(m4.elements.slice(0, 16)).toEqual(identity(4));
    m4.toArray(m4.elements, 1);
    expect(m4.elements.slice(1, 17)).toEqual(identity(4));
    expect(m4.identity().elements.slice(0, 16)).toEqual(identity(4));
  });

  it("extracts bases from a snapshot even if an earlier target changes the receiver", () => {
    const m3 = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const x3 = new Target3(), y3 = new Target3(), z3 = new Target3();
    const original3 = x3.setFromMatrix3Column.bind(x3);
    x3.setFromMatrix3Column = (m, i) => { m3.identity(); return original3(m, i); };
    expect(m3.extractBasis(x3, y3, z3)).toBe(m3);
    expect([x3.x, x3.y, x3.z, y3.x, y3.y, y3.z, z3.x, z3.y, z3.z]).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    // unified 4.x contract: a singular linear part reports the standard basis, so use a nonsingular basis here.
    const m4 = new Matrix4().makeBasis({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, { x: 7, y: 8, z: 10 });
    const x4 = new Target3(), y4 = new Target3(), z4 = new Target3();
    const original4 = x4.setFromMatrixColumn.bind(x4);
    x4.setFromMatrixColumn = (m, i) => { m4.identity(); return original4(m, i); };
    m4.extractBasis(x4, y4, z4);
    expect([x4.x, x4.y, x4.z, y4.x, y4.y, y4.z, z4.x, z4.y, z4.z]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10]);
    // unified 4.x contract: a singular matrix reports the standard basis.
    const singular = new Matrix4().makeBasis({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, { x: 7, y: 8, z: 9 });
    const sx = new Target3(), sy = new Target3(), sz = new Target3();
    singular.extractBasis(sx, sy, sz);
    expect([sx.x, sx.y, sx.z, sy.x, sy.y, sy.z, sz.x, sz.y, sz.z]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("multiplies in column-vector order and handles aliases of either input", () => {
    const translate = new Matrix4().makeTranslation(4, 5, 6);
    const scale = new Matrix4().makeScale(2, 3, 4);
    closeArray(point(translate.clone().multiply(scale), 1, 1, 1), [6, 8, 10]);
    closeArray(point(translate.clone().premultiply(scale), 1, 1, 1), [10, 18, 28]);
    const square = translate.clone().multiply(translate);
    const alias = translate.clone();
    alias.multiplyMatrices(alias, alias);
    expect(alias.elements).toEqual(square.elements);
    const rightAlias = scale.clone();
    rightAlias.multiplyMatrices(translate, rightAlias);
    expect(rightAlias.elements).toEqual(translate.clone().multiply(scale).elements);
    const m3 = new Matrix3().makeTranslation(3, 4).scale(2, 3);
    const expected3 = m3.clone().multiply(m3.clone());
    m3.multiplyMatrices({ elements: m3.elements }, m3);
    expect(m3.elements).toEqual(expected3.elements);
  });

  it("inverts hand-derived examples and chooses zero for a singular inverse", () => {
    const m3 = new Matrix3(1, 2, 3, 0, 1, 4, 5, 6, 0);
    expect(m3.determinant()).toBe(1);
    expect(m3.clone().invert().elements).toEqual([-24, 20, -5, 18, -15, 4, 5, -4, 1]);
    expect(new Matrix3(1, 2, 3, 1, 2, 3, 4, 5, 6).invert().elements).toEqual(Array(9).fill(0));
    const m4 = new Matrix4(2, 1, 0, 3, 0, 3, 0, 4, 0, 0, -2, 5, 0, 0, 0, 1);
    expect(m4.determinant()).toBe(-12);
    expect(m4.determinantAffine()).toBe(-12);
    closeArray(m4.clone().invert().elements, [0.5, 0, 0, 0, -1 / 6, 1 / 3, 0, 0, 0, 0, -0.5, 0, -5 / 6, -4 / 3, 2.5, 1]);
    expect(new Matrix4().makeScale(1, 0, 1).invert().elements).toEqual(Array(16).fill(0));
  });

  it("inverts and constructs normal matrices at representable extreme scales", () => {
    for (const magnitude of [1e-300, 1e-150, 1e150, 1e300]) {
      const scale = new Matrix3(magnitude, 0, 0, 0, magnitude, 0, 0, 0, magnitude);
      closeArray(scale.clone().invert().elements.map(value => value * magnitude), identity(3));
      const affine = new Matrix4().makeScale(magnitude, magnitude, magnitude);
      closeArray(new Matrix3().getNormalMatrix(affine).elements.map(value => value * magnitude), identity(3));
      const permuted = new Matrix3(0, 2 * magnitude, 0, 3 * magnitude, 0, 0, 0, 0, 4 * magnitude);
      closeArray(permuted.clone().multiply(permuted.clone().invert()).elements, identity(3));
    }
    const mixed = new Matrix3(1e-200, 0, 0, 0, 1e200, 0, 0, 0, 1);
    closeArray(mixed.clone().multiply(mixed.clone().invert()).elements, identity(3));
    // Each inverse entry is finite even though an intermediate ratio is 1e600.
    const sheared = new Matrix3(1e-300, 1e300, 0, 0, 1e300, 0, 0, 0, 1);
    const inverse = sheared.clone().invert();
    closeArray([inverse.elements[0] * 1e-300, inverse.elements[3] * 1e-300, inverse.elements[4] * 1e300], [1, -1, 1]);
    closeArray(sheared.multiply(inverse).elements, identity(3));
    const singular = new Matrix3(1e-300, 1e300, 0, 2e-300, 2e300, 0, 0, 0, 1);
    expect(singular.invert().elements).toEqual(Array(9).fill(0));
    const random = generator(0x64a12);
    for (let sample = 0; sample < 40; sample++) {
      const a = 10 ** Math.round(random() * 300), d = 10 ** Math.round(random() * 300), f = 10 ** Math.round(random() * 300);
      const u = random(), v = random(), w = random();
      const upper = new Matrix3(a, u * d, v * f, 0, d, w * f, 0, 0, f);
      closeArray(upper.clone().multiply(upper.clone().invert()).elements, identity(3), 1e-9);
    }
  });

  it("satisfies seeded inverse and determinant identities for full matrices", () => {
    const random = generator(0x3981a);
    for (let sample = 0; sample < 80; sample++) {
      const a3 = Array.from({ length: 9 }, random);
      for (let i = 0; i < 3; i++) a3[i * 3 + i] += 3;
      const m3 = new Matrix3().fromArray(a3);
      closeArray(m3.clone().multiply(m3.clone().invert()).elements, identity(3), 1e-9);
      const b3 = new Matrix3().fromArray(Array.from({ length: 9 }, random));
      expect(Math.abs(m3.clone().multiply(b3).determinant() - m3.determinant() * b3.determinant())).toBeLessThan(1e-9);
      const a4 = Array.from({ length: 16 }, random);
      for (let i = 0; i < 4; i++) a4[i * 4 + i] += 4;
      const m4 = new Matrix4().fromArray(a4);
      closeArray(m4.clone().multiply(m4.clone().invert()).elements, identity(4), 1e-9);
      const b4 = new Matrix4().fromArray(Array.from({ length: 16 }, random));
      expect(Math.abs(m4.clone().multiply(b4).determinant() - m4.determinant() * b4.determinant())).toBeLessThan(1e-8);
    }
  });

  it("satisfies seeded rotation orthogonality and recovers affine factors", () => {
    const random = generator(0xc3a75);
    for (let sample = 0; sample < 80; sample++) {
      const axis = { x: random(), y: random(), z: random() };
      const length = Math.hypot(axis.x, axis.y, axis.z);
      axis.x /= length; axis.y /= length; axis.z /= length;
      const rotation = new Matrix4().makeRotationAxis(axis, Math.PI * random());
      closeArray(rotation.clone().transpose().multiply(rotation).elements, identity(4), 1e-9);
      expect(Math.abs(rotation.determinant() - 1)).toBeLessThan(1e-9);
      const sx = (sample % 2 === 0 ? -1 : 1) * (1 + Math.abs(random()));
      const sy = 1 + Math.abs(random()), sz = 1 + Math.abs(random());
      const px = random(), py = random(), pz = random();
      const transform = rotation.clone().scale({ x: sx, y: sy, z: sz }).setPosition(px, py, pz);
      const pos = new Target3(), scale = new Target3(), q = new QuaternionTarget();
      transform.decompose(pos, q, scale);
      closeArray([pos.x, pos.y, pos.z, scale.x, scale.y, scale.z], [px, py, pz, sx, sy, sz], 1e-9);
      closeArray(q.rotation!.elements, rotation.elements, 1e-9);
    }
  });

  it("maps 2D affine transforms and UV centers, and converts embedded linear transforms", () => {
    const m = new Matrix3().makeScale(2, 3).translate(4, 5);
    expect(m.elements).toEqual([2, 0, 0, 0, 3, 0, 4, 5, 1]);
    const rotated = new Matrix3().makeRotation(Math.PI / 2);
    closeArray(rotated.elements, [0, 1, 0, -1, 0, 0, 0, 0, 1]);
    // unified 4.x contract: the deprecated rotate() negates its angle.
    closeArray(new Matrix3().rotate(Math.PI / 2).elements, new Matrix3().makeRotation(-Math.PI / 2).elements);
    const uv = new Matrix3().setUvTransform(0.2, -0.1, 2, 3, Math.PI / 2, 0.5, 0.25).elements;
    closeArray([uv[0] * 0.5 + uv[3] * 0.25 + uv[6], uv[1] * 0.5 + uv[4] * 0.25 + uv[7]], [0.7, 0.15]);
    const embedded = new Matrix4().setFromMatrix3(m);
    closeArray(new Matrix3().setFromMatrix4(embedded).elements, m.elements);
    closeArray(new Matrix3().getNormalMatrix(new Matrix4().makeScale(2, 4, 5)).elements, [0.5, 0, 0, 0, 0.25, 0, 0, 0, 0.2]);
    expect(new Matrix3().multiplyScalar(3).elements).toEqual([3, 0, 0, 0, 3, 0, 0, 0, 3]);
  });

  it("composes and decomposes translation, reflection and rotation; zero scale is finite", () => {
    const half = Math.SQRT1_2;
    const matrix = new Matrix4().compose({ x: 3, y: -4, z: 5 }, { x: 0, y: 0, z: half, w: half }, { x: -2, y: 3, z: 4 });
    closeArray(point(matrix, 1, 0, 0), [3, -6, 5]);
    const pos = new Target3(), scale = new Target3(), q = new QuaternionTarget();
    expect(matrix.decompose(pos, q, scale)).toBe(matrix);
    closeArray([pos.x, pos.y, pos.z, scale.x, scale.y, scale.z], [3, -4, 5, -2, 3, 4]);
    closeArray(q.rotation!.elements, new Matrix4().makeRotationZ(Math.PI / 2).elements);
    expect(matrix.getMaxScaleOnAxis()).toBeCloseTo(4);
    closeArray(new Matrix4().extractRotation(new Matrix4().makeRotationZ(Math.PI / 2).scale({ x: 2, y: 3, z: 4 })).elements, new Matrix4().makeRotationZ(Math.PI / 2).elements);
    new Matrix4().makeScale(0, 2, 3).decompose(pos, q, scale);
    expect(q.rotation).toBeNull();
    // unified 4.x contract: a singular linear part reports unit scale and the identity rotation.
    expect([q.x, q.y, q.z, q.w, scale.x, scale.y, scale.z]).toEqual([0, 0, 0, 1, 1, 1, 1]);
    expect(new Matrix4().copyPosition(matrix).elements.slice(12, 15)).toEqual([3, -4, 5]);
    expect(new Matrix4().makeTranslation({ x: 1, y: 2, z: 3 }).setPosition({ x: 4, y: 5, z: 6 }).elements.slice(12, 15)).toEqual([4, 5, 6]);
    expect(new Matrix4().multiplyScalar(2).elements).toEqual(identity(4).map(v => v * 2));
  });

  it("snapshots decomposition before target setters can change the receiver", () => {
    const rotation = new Matrix4().makeRotationY(0.4);
    const matrix = rotation.clone().scale({ x: 2, y: 3, z: 4 }).setPosition(5, 6, 7);
    const position = new Target3(), scale = new Target3(), q = new QuaternionTarget();
    const originalSet = position.set.bind(position);
    position.set = (x, y, z) => { matrix.identity(); return originalSet(x, y, z); };
    matrix.decompose(position, q, scale);
    closeArray([position.x, position.y, position.z, scale.x, scale.y, scale.z], [5, 6, 7, 2, 3, 4]);
    closeArray(q.rotation!.elements, rotation.elements);
  });

  it("produces orthogonal rotations for every Euler order, axis angle and degenerate look-at", () => {
    const angles = { X: 0.2, Y: -0.4, Z: 0.7 };
    for (const order of ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]) {
      const euler = new Matrix4().makeRotationFromEuler({ x: angles.X, y: angles.Y, z: angles.Z, order });
      const expected = new Matrix4();
      for (const axis of order) {
        const a = angles[axis as keyof typeof angles];
        expected.multiply(axis === "X" ? new Matrix4().makeRotationX(a) : axis === "Y" ? new Matrix4().makeRotationY(a) : new Matrix4().makeRotationZ(a));
      }
      closeArray(euler.elements, expected.elements);
      closeArray(euler.clone().transpose().multiply(euler).elements, identity(4));
      expect(euler.determinant()).toBeCloseTo(1);
    }
    expect(() => new Matrix4().makeRotationFromEuler({ x: 0, y: 0, z: 0, order: "invalid" })).toThrow(RangeError);
    closeArray(new Matrix4().makeRotationAxis({ x: 0, y: 1, z: 0 }, 0.9).elements, new Matrix4().makeRotationY(0.9).elements);
    for (const [eye, target, up] of [
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
      [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
      [{ x: 2, y: 3, z: 4 }, { x: -1, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }],
    ]) {
      const look = new Matrix4().lookAt(eye, target, up);
      closeArray(look.clone().transpose().multiply(look).elements, identity(4));
      expect(look.determinant()).toBeCloseTo(1);
    }
    // unified 4.x contract: makeShear(xy, xz, yx, yz, zx, zy) shears x by y (xy) and so on, so x' = 1 + yx*2 + zx*3.
    expect(point(new Matrix4().makeShear(2, 3, 4, 5, 6, 7), 1, 2, 3)).toEqual([27, 25, 16]);
  });
});

describe("explicit projection depth ranges", () => {
  it("maps near-plane corners and both depth endpoints for standard and reversed depth", () => {
    for (const range of ["minus-one-to-one", "zero-to-one"] as const) {
      for (const reversed of [false, true]) {
        const nearDepth = reversed ? 1 : (range === "zero-to-one" ? 0 : -1);
        const farDepth = reversed ? (range === "zero-to-one" ? 0 : -1) : 1;
        const p = new Matrix4().makePerspectiveForDepthRange(-2, 4, 3, -1, 2, 20, range, reversed);
        closeArray(point(p, -2, -1, -2), [-1, -1, nearDepth]);
        closeArray(point(p, 4, 3, -2), [1, 1, nearDepth]);
        expect(point(p, 0, 0, -20)[2]).toBeCloseTo(farDepth);
        const o = new Matrix4().makeOrthographicForDepthRange(-2, 4, 3, -1, 2, 20, range, reversed);
        closeArray(point(o, -2, -1, -2), [-1, -1, nearDepth]);
        closeArray(point(o, 4, 3, -20), [1, 1, farDepth]);
        const infinite = new Matrix4().makePerspectiveForDepthRange(-2, 4, 3, -1, 2, Infinity, range, reversed);
        expect(point(infinite, 0, 0, -2)[2]).toBeCloseTo(nearDepth);
        expect(point(infinite, 0, 0, -1e14)[2]).toBeCloseTo(farDepth);
      }
    }
  });

  it("rejects degenerate or invalid explicit bounds and depth ranges", () => {
    expect(() => new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 0, 10, "zero-to-one")).toThrow(RangeError);
    expect(() => new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 1, "zero-to-one")).toThrow(RangeError);
    expect(() => new Matrix4().makeOrthographicForDepthRange(0, 0, 1, -1, 1, 10, "zero-to-one")).toThrow(RangeError);
    expect(() => new Matrix4().makeOrthographicForDepthRange(-1, 1, 1, -1, 1, 10, "invalid" as never)).toThrow(RangeError);
  });
});
