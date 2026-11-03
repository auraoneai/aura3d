import { describe, expect, it } from "vitest";
import { Vec3, triangleBarycoord, triangleClosestPoint, triangleContainsPoint, triangleNormal } from "../../../examples/strange-orbit-port/vec3";

/** Deterministic xorshift so the property cases are reproducible. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
}

type Coordinates = readonly [number, number, number];

function expectVector(actual: Vec3, expected: Coordinates, digits = 10): void {
  expect(actual.x).toBeCloseTo(expected[0], digits);
  expect(actual.y).toBeCloseTo(expected[1], digits);
  expect(actual.z).toBeCloseTo(expected[2], digits);
}

describe("strange-orbit-port Vec3", () => {
  it("performs arithmetic in place and leaves its operands unchanged", () => {
    const a = new Vec3(3, -4, 12);
    const b = new Vec3(-5, 8, 2);
    const sum = a.clone();
    expect(sum.add(b)).toBe(sum);
    expectVector(sum, [-2, 4, 14]);
    expectVector(a.clone().sub(b), [8, -12, 10]);
    expectVector(new Vec3().subVectors(a, b), [8, -12, 10]);
    expectVector(a.clone().multiplyScalar(-2), [-6, 8, -24]);
    expectVector(a.clone().divideScalar(2), [1.5, -2, 6]);
    expectVector(a.clone().addScaledVector(b, -2), [13, -20, 8]);
    expectVector(a.clone().negate(), [-3, 4, -12]);
    expectVector(new Vec3().crossVectors(a, b), [-104, -66, 4]);
    expectVector(a.clone().lerp(b, 0.25), [1, -1, 9.5]);
    expectVector(new Vec3().lerpVectors(a, b, 0.25), [1, -1, 9.5]);
    expect(a.dot(b)).toBe(-23);
    expect(a.lengthSq()).toBe(169);
    expect(a.length()).toBe(13);
    expect(a.distanceToSquared(b)).toBe(308);
    expect(a.distanceTo(b)).toBeCloseTo(Math.sqrt(308), 12);
    expectVector(a, [3, -4, 12]);
    expectVector(b, [-5, 8, 2]);
    expectVector(new Vec3().set(7, 8, 9).copy(a), [3, -4, 12]);
    const aliasedA = a.clone();
    expectVector(aliasedA.crossVectors(aliasedA, b), [-104, -66, 4]);
    const aliasedB = b.clone();
    expectVector(aliasedB.crossVectors(a, aliasedB), [-104, -66, 4]);
  });

  it("satisfies arithmetic, interpolation and cross-product identities across varied inputs", () => {
    const rand = rng(0x445566);
    for (let i = 0; i < 400; i++) {
      const a = new Vec3((rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 10);
      const b = new Vec3((rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 10);
      expectVector(a.clone().add(b).sub(b), [a.x, a.y, a.z]);
      expectVector(a.clone().lerp(b, 0), [a.x, a.y, a.z]);
      expectVector(a.clone().lerp(b, 1), [b.x, b.y, b.z]);
      const cross = new Vec3().crossVectors(a, b);
      expect(cross.dot(a)).toBeCloseTo(0, 10);
      expect(cross.dot(b)).toBeCloseTo(0, 10);
      expectVector(new Vec3().crossVectors(b, a), [-cross.x, -cross.y, -cross.z]);
    }
  });

  it("normalizes and sets lengths, including the zero vector", () => {
    expectVector(new Vec3(3, 4, 0).normalize(), [0.6, 0.8, 0]);
    expectVector(new Vec3(3, 4, 0).setLength(20), [12, 16, 0]);
    expectVector(new Vec3().normalize(), [0, 0, 0]);
    expectVector(new Vec3().setLength(20), [0, 0, 0]);

    const rand = rng(0xc0ffee);
    for (let i = 0; i < 400; i++) {
      const v = new Vec3(rand() - 0.5, rand() - 0.5, rand() - 0.5);
      const length = 1 + rand() * 70;
      expect(v.clone().normalize().length()).toBeCloseTo(1, 12);
      expect(v.clone().setLength(length).length()).toBeCloseTo(length, 11);
    }
  });

  it("rotates around unit axes using the right-hand rule", () => {
    expectVector(new Vec3(1, 0, 0).applyAxisAngle(new Vec3(0, 0, 1), Math.PI / 2), [0, 1, 0]);
    expectVector(new Vec3(0, 1, 0).applyAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2), [0, 0, -1]);
    const diagonal = 1 / Math.sqrt(3);
    expectVector(new Vec3(1, 0, 0).applyAxisAngle(new Vec3(diagonal, diagonal, diagonal), 2 * Math.PI / 3), [0, 1, 0]);

    // Rodrigues' rotation formula independently describes rotations around arbitrary unit axes.
    const rand = rng(19);
    for (let i = 0; i < 400; i++) {
      const [x, y, z] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const [rx, ry, rz] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      const magnitude = Math.hypot(rx, ry, rz);
      const [ux, uy, uz] = [rx / magnitude, ry / magnitude, rz / magnitude];
      const angle = (rand() - 0.5) * 12;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const projection = (ux * x + uy * y + uz * z) * (1 - cos);
      const expected: Coordinates = [
        x * cos + (uy * z - uz * y) * sin + ux * projection,
        y * cos + (uz * x - ux * z) * sin + uy * projection,
        z * cos + (ux * y - uy * x) * sin + uz * projection
      ];
      expectVector(new Vec3(x, y, z).applyAxisAngle(new Vec3(ux, uy, uz), angle), expected, 11);
    }
  });
});

describe("strange-orbit-port triangle helpers", () => {
  it("calculates oriented normals and barycentric coordinates on a skew triangle", () => {
    const a = new Vec3(1, 2, 3), b = new Vec3(4, 3, 3), c = new Vec3(2, 5, 7);
    const n = 1 / Math.sqrt(14);
    expectVector(triangleNormal(a, b, c), [n, -3 * n, 2 * n]);
    expectVector(triangleNormal(a, c, b), [-n, 3 * n, -2 * n]);
    const target = new Vec3();
    const point = new Vec3(2.4, 3.8, 5); // 0.2*a + 0.3*b + 0.5*c
    expect(triangleBarycoord(point, a, b, c, target)).toBe(target);
    expectVector(target, [0.2, 0.3, 0.5]);
    expect(triangleContainsPoint(point, a, b, c)).toBe(true);
    expect(triangleContainsPoint(new Vec3(7, 5, 3), a, b, c)).toBe(false);
  });

  it("handles edges, off-plane projections, and degenerate triangles", () => {
    const a = new Vec3(2, -1, 3), b = new Vec3(2, 2, 3), c = new Vec3(2, -1, 7);
    for (const [point, expected, inside] of [
      [new Vec3(2, -1, 3), [1, 0, 0], true],
      [new Vec3(7, -0.25, 5), [0.25, 0.25, 0.5], true],
      [new Vec3(2, 0.5, 5), [0, 0.5, 0.5], true],
      [new Vec3(2, 2, 7), [-1, 1, 1], false]
    ] as const) {
      const bary = triangleBarycoord(point, a, b, c);
      expect(bary).not.toBeNull();
      expectVector(bary!, expected);
      expect(triangleContainsPoint(point, a, b, c)).toBe(inside);
    }
    const collinear = new Vec3(2, 5, 3);
    const target = new Vec3(8, 8, 8);
    expectVector(triangleNormal(a, b, collinear), [0, 0, 0]);
    expect(triangleBarycoord(a, a, b, collinear, target)).toBeNull();
    expectVector(target, [0, 0, 0]);
    expect(triangleContainsPoint(a, a, b, collinear)).toBe(false);
  });

  it("finds the closest point in each vertex, edge and face region", () => {
    const a = new Vec3(0, 0, 0), b = new Vec3(4, 0, 0), c = new Vec3(0, 4, 0);
    const probes: readonly (readonly [Coordinates, Coordinates])[] = [
      [[-2, -2, 1], [0, 0, 0]], [[6, -1, 0], [4, 0, 0]], [[-1, 6, 2], [0, 4, 0]],
      [[2, -3, 0], [2, 0, 0]], [[-3, 2, 0], [0, 2, 0]], [[3, 3, 0], [2, 2, 0]],
      [[1, 1, 5], [1, 1, 0]], [[1, 1, -2], [1, 1, 0]]
    ];
    for (const [probe, expected] of probes) {
      const target = new Vec3();
      expect(triangleClosestPoint(new Vec3(...probe), a, b, c, target)).toBe(target);
      expectVector(target, expected);
    }
  });

  it("projects interior points onto translated triangles", () => {
    const rand = rng(123);
    for (let i = 0; i < 400; i++) {
      const [x, y, z] = [(rand() - 0.5) * 10, (rand() - 0.5) * 10, (rand() - 0.5) * 10];
      const width = 1 + 10 * rand(), height = 1 + 10 * rand();
      const u = rand(), v = rand() * (1 - u);
      const a = new Vec3(x, y, z), b = new Vec3(x, y + width, z), c = new Vec3(x, y, z + height);
      const point = new Vec3(x + (rand() - 0.5) * 20, y + u * width, z + v * height);
      const bary = triangleBarycoord(point, a, b, c);
      expect(bary).not.toBeNull();
      expectVector(bary!, [1 - u - v, u, v], 9);
      expectVector(triangleClosestPoint(point, a, b, c), [x, y + u * width, z + v * height], 9);
      expect(triangleContainsPoint(point, a, b, c)).toBe(true);
    }
  });
});
