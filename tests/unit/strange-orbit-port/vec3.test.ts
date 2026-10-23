import * as THREE from "three";
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

const CASES = 400;
const rand = rng(0xc0ffee);
const vec = (scale = 10): [number, number, number] => [(rand() - 0.5) * scale, (rand() - 0.5) * scale, (rand() - 0.5) * scale];
const same = (a: Vec3, b: THREE.Vector3, tol = 1e-12): void => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.z - b.z)).toBeLessThanOrEqual(tol);
};

describe("strange-orbit-port Vec3 matches three.js Vector3", () => {
  it("in-place arithmetic is identical (bitwise for add/sub/scale/dot/cross/lerp)", () => {
    for (let i = 0; i < CASES; i++) {
      const [ax, ay, az] = vec();
      const [bx, by, bz] = vec();
      const s = (rand() - 0.5) * 8;
      const alpha = rand();
      const a = new Vec3(ax, ay, az), ta = new THREE.Vector3(ax, ay, az);
      const b = new Vec3(bx, by, bz), tb = new THREE.Vector3(bx, by, bz);
      same(a.clone().add(b), ta.clone().add(tb), 0);
      same(a.clone().sub(b), ta.clone().sub(tb), 0);
      same(a.clone().multiplyScalar(s), ta.clone().multiplyScalar(s), 0);
      same(a.clone().addScaledVector(b, s), ta.clone().addScaledVector(tb, s), 0);
      same(new Vec3().crossVectors(a, b), new THREE.Vector3().crossVectors(ta, tb), 0);
      same(a.clone().lerp(b, alpha), ta.clone().lerp(tb, alpha), 0);
      same(new Vec3().lerpVectors(a, b, alpha), new THREE.Vector3().lerpVectors(ta, tb, alpha), 0);
      expect(a.dot(b)).toBe(ta.dot(tb));
      expect(a.length()).toBe(ta.length());
      expect(a.distanceTo(b)).toBe(ta.distanceTo(tb));
      expect(a.distanceToSquared(b)).toBe(ta.distanceToSquared(tb));
    }
  });

  it("normalize and setLength agree, including the zero vector", () => {
    for (let i = 0; i < CASES; i++) {
      const [x, y, z] = vec();
      const len = rand() * 70;
      same(new Vec3(x, y, z).normalize(), new THREE.Vector3(x, y, z).normalize(), 0);
      same(new Vec3(x, y, z).setLength(len), new THREE.Vector3(x, y, z).setLength(len), 0);
    }
    same(new Vec3(0, 0, 0).normalize(), new THREE.Vector3(0, 0, 0).normalize(), 0);
  });

  it("applyAxisAngle matches three (unit axes, arbitrary angles)", () => {
    for (let i = 0; i < CASES; i++) {
      const [x, y, z] = vec();
      const axis = new THREE.Vector3(...vec(2)).normalize();
      const angle = (rand() - 0.5) * 12;
      same(
        new Vec3(x, y, z).applyAxisAngle(new Vec3(axis.x, axis.y, axis.z), angle),
        new THREE.Vector3(x, y, z).applyAxisAngle(axis, angle),
        1e-12
      );
    }
  });
});

describe("strange-orbit-port triangle helpers match three.js Triangle", () => {
  it("normal, barycentric coordinates and containment agree", () => {
    for (let i = 0; i < CASES; i++) {
      const [a, b, c, p] = [vec(), vec(), vec(), vec()];
      const mine = [new Vec3(...a), new Vec3(...b), new Vec3(...c)] as const;
      const tri = new THREE.Triangle(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c));
      const point = new THREE.Vector3(...p);
      same(triangleNormal(...mine), tri.getNormal(new THREE.Vector3()), 1e-12);
      const bary = triangleBarycoord(new Vec3(...p), ...mine);
      const expected = new THREE.Vector3();
      const reference = tri.getBarycoord(point, expected);
      expect(bary === null).toBe(reference === null);
      if (bary && reference) same(bary, reference, 1e-12);
      expect(triangleContainsPoint(new Vec3(...p), ...mine)).toBe(tri.containsPoint(point));
    }
  });

  it("closest point covers all seven Voronoi regions", () => {
    const tri = new THREE.Triangle(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(0, 4, 0));
    const mine = [new Vec3(0, 0, 0), new Vec3(4, 0, 0), new Vec3(0, 4, 0)] as const;
    const probes: [number, number, number][] = [
      [-2, -2, 1], [6, -1, 0], [-1, 6, 2], [2, -3, 0], [-3, 2, 0], [3, 3, 0], [1, 1, 5], [1, 1, -2]
    ];
    for (const p of probes) {
      same(triangleClosestPoint(new Vec3(...p), ...mine), tri.closestPointToPoint(new THREE.Vector3(...p), new THREE.Vector3()), 1e-12);
    }
    for (let i = 0; i < CASES; i++) {
      const [a, b, c, p] = [vec(), vec(), vec(), vec(20)];
      const t = new THREE.Triangle(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c));
      same(
        triangleClosestPoint(new Vec3(...p), new Vec3(...a), new Vec3(...b), new Vec3(...c)),
        t.closestPointToPoint(new THREE.Vector3(...p), new THREE.Vector3()),
        1e-9
      );
    }
  });
});
