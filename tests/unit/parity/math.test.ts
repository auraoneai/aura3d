/**
 * Independent numerical fixtures for the public math API. Expected values
 * come from elementary coordinate equations, known closed-form examples,
 * and geometry invariants, rather than another runtime implementation.
 */
import { describe, expect, it } from "vitest";
import {
  Box3, Capsule, Color, ConvexHull, Cylindrical, Euler, Frustum, Line3,
  Matrix3, Matrix4, MathUtils, OBB, Octree, Plane, Quaternion, Ray, Sphere,
  Spherical, SphericalHarmonics3, Triangle, Vector2, Vector3, type EulerOrder
} from "@aura3d/math";

const CASES = 1000;
const TOLERANCE = 1e-8;
const ORDERS: EulerOrder[] = ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"];

// A local LCG provides deterministic inputs; it is not a reference for the
// production random generator.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function scalar(rand: () => number, scale = 10): number { return (2 * rand() - 1) * scale; }
function vector(rand: () => number, scale = 10): Vector3 {
  return new Vector3(scalar(rand, scale), scalar(rand, scale), scalar(rand, scale));
}
function close(actual: number, expected: number, tolerance = TOLERANCE): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}
function vec(actual: Vector3, x: number, y: number, z: number, tolerance = TOLERANCE): void {
  close(actual.x, x, tolerance); close(actual.y, y, tolerance); close(actual.z, z, tolerance);
}
function vecLike(actual: Vector3, expected: Vector3, tolerance = TOLERANCE): void {
  vec(actual, expected.x, expected.y, expected.z, tolerance);
}
function arrayClose(actual: readonly number[], expected: readonly number[], tolerance = TOLERANCE): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => close(actual[index]!, value, tolerance));
}

// Apply each elementary axis rotation directly, independently of quaternion
// and matrix construction. Euler XYZ applies the Z rotation first.
function rotateByAxes(v: Vector3, x: number, y: number, z: number, order: EulerOrder): Vector3 {
  let [a, b, c] = [v.x, v.y, v.z];
  const angles = { X: x, Y: y, Z: z };
  for (const axis of [...order].reverse() as ("X" | "Y" | "Z")[]) {
    const sin = Math.sin(angles[axis]);
    const cos = Math.cos(angles[axis]);
    if (axis === "X") [b, c] = [b * cos - c * sin, b * sin + c * cos];
    else if (axis === "Y") [a, c] = [a * cos + c * sin, -a * sin + c * cos];
    else [a, b] = [a * cos - b * sin, a * sin + b * cos];
  }
  return new Vector3(a, b, c);
}

describe("vectors and transforms: analytical fixtures", () => {
  it("performs vector arithmetic, interpolation and component access", () => {
    const rand = random(0xa11ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = vector(rand); const b = vector(rand); const s = scalar(rand, 2); const t = rand();
      close(a.distanceToSquared(b), (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
      vec(a.addScaled(b, s), a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
      vec(a.negate(), -a.x, -a.y, -a.z);
      vec(a.lerp(b, t), a.x * (1 - t) + b.x * t, a.y * (1 - t) + b.y * t, a.z * (1 - t) + b.z * t);
      const lo = new Vector3(-2, -3, -4); const hi = new Vector3(2, 3, 4);
      vec(a.clampTo(lo, hi), Math.min(2, Math.max(-2, a.x)), Math.min(3, Math.max(-3, a.y)), Math.min(4, Math.max(-4, a.z)));
      expect([a.getComponent(0), a.getComponent(1), a.getComponent(2)]).toEqual([a.x, a.y, a.z]);
      vec(Vector3.fromArray([99, a.x, a.y, a.z, 99], 1), a.x, a.y, a.z);
      const u = new Vector2(a.x, a.y); const v = new Vector2(b.x, b.y);
      close(u.distanceToSquared(v), (a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      const result = u.lerp(v, t);
      close(result.x, a.x + (b.x - a.x) * t); close(result.y, a.y + (b.y - a.y) * t);
    }
  }, 30_000);

  it("distinguishes point, direction and normal transforms", () => {
    const transform = Matrix4.translation(new Vector3(10, -2, 4)).multiply(Matrix4.scaling(new Vector3(2, 3, 4)));
    const a = new Vector3(1, 2, -1);
    vec(a.transformMatrix4(transform), 12, 4, 0);
    vec(a.applyMatrix3(Matrix3.fromMatrix4(transform)), 2, 6, -4);
    vec(a.transformDirection(transform), 2 / Math.sqrt(56), 6 / Math.sqrt(56), -4 / Math.sqrt(56));
    const normalMatrix = new Matrix3().getNormalMatrix(transform);
    arrayClose(normalMatrix.elements, Matrix3.normalFromMatrix4(transform).elements);
    const normal = a.applyMatrix3(normalMatrix);
    vec(normal, 0.5, 2 / 3, -0.25);
    close(normal.dot(new Vector3(2, 3, 4)), 2);
  }, 30_000);
});

describe("rotation and matrices: analytical fixtures", () => {
  it("matches elementary rotations for all Euler orders and preserves them on conversion", () => {
    const rand = random(0xe55ce);
    for (let i = 0; i < CASES; i += 1) {
      const x = scalar(rand, Math.PI); const y = scalar(rand, Math.PI); const z = scalar(rand, Math.PI);
      const order = ORDERS[i % ORDERS.length]!; const other = ORDERS[(i + 3) % ORDERS.length]!;
      const input = vector(rand, 2); const expected = rotateByAxes(input, x, y, z, order);
      const q = Quaternion.fromEuler(x, y, z, order);
      close(q.length(), 1);
      vecLike(q.rotateVector(input), expected, 1e-7);
      vecLike(Matrix4.rotation(q).transformPoint(input), expected, 1e-7);
      const e = new Euler().setFromQuaternion(q, other);
      vecLike(e.toQuaternion().rotateVector(input), expected, 1e-6);
      const matrixEuler = new Euler().setFromRotationMatrix(Matrix4.rotation(q), other);
      vecLike(matrixEuler.toQuaternion().rotateVector(input), expected, 1e-6);
      const reordered = new Euler(x, y, z, order).reorder(other);
      vecLike(reordered.toQuaternion().rotateVector(input), expected, 1e-6);
    }
  }, 30_000);

  it("uses column-major multiplication, inverse, transpose, determinant and basis", () => {
    const a = new Matrix3().set(1, 2, 3, 0, 1, 4, 5, 6, 0);
    const b = new Matrix3().set(2, 0, 0, 0, 3, 0, 0, 0, 4);
    close(a.determinant(), 1);
    arrayClose(a.invert().elements, [-24, 20, -5, 18, -15, 4, 5, -4, 1]);
    arrayClose(a.multiply(a.invert()).elements, Matrix3.identity().elements);
    arrayClose(a.multiply(b).elements, [2, 0, 10, 6, 3, 18, 12, 16, 0]);
    arrayClose(a.premultiply(b).elements, b.multiply(a).elements);
    arrayClose(a.transpose().elements, [1, 2, 3, 0, 1, 4, 5, 6, 0]);
    arrayClose(a.multiplyScalar(2).elements, a.elements.map((n) => n * 2));
    const [x, y, z] = a.extractBasis();
    vec(x, 1, 0, 5); vec(y, 2, 1, 6); vec(z, 3, 4, 0);
    const singular = new Matrix3().set(1, 0, 0, 0, 0, 0, 0, 0, 1);
    expect(() => singular.inverse()).toThrow(RangeError);
    arrayClose(singular.invert().elements, Matrix3.identity().elements);
  }, 30_000);

  it("checks inverse transforms and nonuniform scales across seeded cases", () => {
    const rand = random(0x188ce);
    for (let i = 0; i < CASES; i += 1) {
      const scale = new Vector3(0.5 + rand() * 3, 0.5 + rand() * 3, 0.5 + rand() * 3);
      const q = Quaternion.fromEuler(scalar(rand, 2), scalar(rand, 2), scalar(rand, 2));
      const m = Matrix4.compose(vector(rand), q, scale); const point = vector(rand);
      vecLike(m.inverse().transformPoint(m.transformPoint(point)), point, 1e-7);
      close(m.determinant(), scale.x * scale.y * scale.z, 1e-7);
      close(m.maxScaleOnAxis(), Math.max(scale.x, scale.y, scale.z), 1e-7);
      arrayClose(Matrix3.fromMatrix4(m).transpose().transpose().elements, Matrix3.fromMatrix4(m).elements);
    }
  }, 30_000);
});

describe("scalars, color and coordinates: independent values", () => {
  it("evaluates bounded interpolation, angle conversion and periodic functions", () => {
    const rand = random(0x4bbce);
    for (let i = 0; i < CASES; i += 1) {
      const a = scalar(rand); const b = a + 0.5 + rand() * 8; const x = scalar(rand); const t = rand();
      const fraction = (x - a) / (b - a); const unit = Math.max(0, Math.min(1, fraction));
      close(MathUtils.clamp(x, a, b), Math.max(a, Math.min(b, x)));
      close(MathUtils.mapLinear(x, a, b, -2, 3), -2 + 5 * fraction);
      close(MathUtils.inverseLerp(a, b, x), fraction);
      close(MathUtils.lerp(a, b, t), a + (b - a) * t);
      close(MathUtils.smoothstep(x, a, b), unit * unit * (3 - 2 * unit));
      close(MathUtils.smootherstep(x, a, b), unit ** 3 * (unit * (unit * 6 - 15) + 10));
      close(MathUtils.radToDeg(MathUtils.degToRad(x)), x);
      const m = 0.5 + rand() * 9; const remainder = x - Math.floor(x / m) * m;
      close(MathUtils.euclideanModulo(x, m), remainder);
      const cycle = x - Math.floor(x / (2 * m)) * 2 * m;
      close(MathUtils.pingpong(x, m), cycle <= m ? cycle : 2 * m - cycle);
      close(MathUtils.damp(a, b, 2, t), b + (a - b) * Math.exp(-2 * t));
    }
    expect([0, 1, 2, 3, 4, 8, 12].map(MathUtils.isPowerOfTwo)).toEqual([false, true, true, false, true, true, false]);
    const first = [MathUtils.seededRandom(4242), ...Array.from({ length: 15 }, () => MathUtils.seededRandom())];
    const second = [MathUtils.seededRandom(4242), ...Array.from({ length: 15 }, () => MathUtils.seededRandom())];
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  }, 30_000);

  it("round-trips HSL and exercises hue offset and HSL interpolation", () => {
    const primary = [[0, 1, 0, 0], [1 / 3, 0, 1, 0], [2 / 3, 0, 0, 1], [1, 1, 0, 0]];
    for (const [h, r, g, b] of primary) {
      const c = Color.fromHSL(h!, 1, 0.5);
      close(c.r, r!); close(c.g, g!); close(c.b, b!);
    }
    const rand = random(0x6ddce);
    for (let i = 0; i < CASES; i += 1) {
      const h = rand(); const s = 0.01 + rand() * 0.99; const l = 0.01 + rand() * 0.98;
      const c = Color.fromHSL(h, s, l); const recovered = c.getHSL();
      close(recovered.h, h, 1e-7); close(recovered.s, s, 1e-7); close(recovered.l, l, 1e-7);
      const shifted = c.offsetHSL(0.1, 0, 0).getHSL();
      close(shifted.h, (h + 0.1) % 1, 1e-7);
      const halfway = c.lerpHSL(Color.fromHSL(0.5, 0.5, 0.5), 0.5).getHSL();
      close(halfway.h, (h + 0.5) / 2, 1e-7); close(halfway.s, (s + 0.5) / 2, 1e-7); close(halfway.l, (l + 0.5) / 2, 1e-7);
    }
  }, 30_000);

  it("evaluates spherical harmonics by independent basis and Lambert-band coefficients", () => {
    const rand = random(0x7eece);
    for (let i = 0; i < CASES; i += 1) {
      const n = vector(rand).normalize();
      const { x, y, z } = n;
      const basis = [1 / Math.sqrt(4 * Math.PI), Math.sqrt(3 / (4 * Math.PI)) * y,
        Math.sqrt(3 / (4 * Math.PI)) * z, Math.sqrt(3 / (4 * Math.PI)) * x,
        Math.sqrt(15 / (4 * Math.PI)) * x * y, Math.sqrt(15 / (4 * Math.PI)) * y * z,
        Math.sqrt(5 / (16 * Math.PI)) * (3 * z * z - 1), Math.sqrt(15 / (4 * Math.PI)) * x * z,
        Math.sqrt(15 / (16 * Math.PI)) * (x * x - y * y)];
      arrayClose(SphericalHarmonics3.getBasisAt(n), basis, 1e-6);
      const coefficients = Array.from({ length: 9 }, () => vector(rand, 0.2));
      const sh = new SphericalHarmonics3(coefficients);
      const evaluate = (factors: readonly number[]) => new Vector3(
        coefficients.reduce((sum, c, j) => sum + c.x * factors[j]!, 0),
        coefficients.reduce((sum, c, j) => sum + c.y * factors[j]!, 0),
        coefficients.reduce((sum, c, j) => sum + c.z * factors[j]!, 0)
      );
      vecLike(sh.getAt(n), evaluate(basis), 1e-6);
      vecLike(sh.getIrradianceAt(n), evaluate(basis.map((v, j) => v * (j === 0 ? Math.PI : j < 4 ? 2 * Math.PI / 3 : Math.PI / 4))), 2e-6);
    }
  }, 30_000);

  it("round-trips spherical and cylindrical coordinates, including poles", () => {
    const rand = random(0x8ffce);
    for (let i = 0; i < CASES; i += 1) {
      const p = vector(rand); const spherical = new Spherical().setFromCartesianCoords(p.x, p.y, p.z);
      const cylindrical = new Cylindrical().setFromCartesianCoords(p.x, p.y, p.z);
      close(spherical.radius, Math.hypot(p.x, p.y, p.z));
      close(cylindrical.radius, Math.hypot(p.x, p.z)); close(cylindrical.y, p.y);
      vecLike(spherical.toVector3(), p, 1e-7); vecLike(cylindrical.toVector3(), p, 1e-7);
    }
    expect(new Spherical(2, 0, 0).makeSafe().phi).toBeGreaterThan(0);
    expect(new Spherical(2, Math.PI, 0).makeSafe().phi).toBeLessThan(Math.PI);
  }, 30_000);
});

describe("line, triangle and plane: geometric fixtures", () => {
  it("projects onto finite and infinite segments and transforms their endpoints", () => {
    const rand = random(0x9a0ce);
    for (let i = 0; i < CASES; i += 1) {
      const start = vector(rand); const length = 0.1 + 10 * rand();
      const line = new Line3(start, start.add(new Vector3(length, 0, 0)));
      const t = scalar(rand, 2); const p = start.add(new Vector3(t * length, 3, 4));
      close(line.distanceSq(), length * length); close(line.distance(), length);
      vecLike(line.getCenter(), start.add(new Vector3(length / 2, 0, 0)));
      vec(line.delta(), length, 0, 0);
      close(line.closestPointToPointParameter(p), t);
      close(line.closestPointToPointParameter(p, true), Math.max(0, Math.min(1, t)));
      vecLike(line.closestPointToPoint(p, true), start.add(new Vector3(Math.max(0, Math.min(1, t)) * length, 0, 0)));
      vecLike(line.at(t), start.add(new Vector3(t * length, 0, 0)));
      const offset = vector(rand); const moved = line.applyMatrix4(Matrix4.translation(offset));
      vecLike(moved.start, start.add(offset)); vecLike(moved.end, line.end.add(offset));
    }
  }, 30_000);

  it("finds nearest points between crossing, skew, parallel and point segments", () => {
    const a = new Line3(new Vector3(0, 0, 0), new Vector3(4, 0, 0));
    const fixtures = [
      { line: new Line3(new Vector3(2, -1, 0), new Vector3(2, 1, 0)), distance: 0, p: [2, 0, 0], q: [2, 0, 0] },
      { line: new Line3(new Vector3(2, -1, 3), new Vector3(2, 1, 3)), distance: 9, p: [2, 0, 0], q: [2, 0, 3] },
      { line: new Line3(new Vector3(5, 2, 0), new Vector3(7, 2, 0)), distance: 5, p: [4, 0, 0], q: [5, 2, 0] },
      { line: new Line3(new Vector3(2, 3, 0), new Vector3(2, 3, 0)), distance: 9, p: [2, 0, 0], q: [2, 3, 0] }
    ];
    for (const f of fixtures) {
      const result = a.distanceSqToLine3(f.line);
      close(result.distanceSq, f.distance);
      vec(result.point1, f.p[0]!, f.p[1]!, f.p[2]!);
      vec(result.point2, f.q[0]!, f.q[1]!, f.q[2]!);
      close(f.line.distanceSqToLine3(a).distanceSq, f.distance);
    }
  }, 30_000);

  it("computes triangle area, barycentrics, closest points and facing", () => {
    const tri = new Triangle(new Vector3(0, 0, 0), new Vector3(4, 0, 0), new Vector3(0, 3, 0));
    close(tri.getArea(), 6); vec(tri.getMidpoint(), 4 / 3, 1, 0); vec(tri.getNormal(), 0, 0, 1);
    const bary = tri.getBarycoord(new Vector3(1, 1.5, 0))!;
    vec(bary, 0.25, 0.25, 0.5);
    expect(tri.containsPoint(new Vector3(1, 1.5, 0))).toBe(true);
    expect(tri.containsPoint(new Vector3(4, 3, 0))).toBe(false);
    vec(tri.closestPointToPoint(new Vector3(1, 1, 2)), 1, 1, 0);
    vec(tri.closestPointToPoint(new Vector3(-1, -2, 0)), 0, 0, 0);
    vec(tri.closestPointToPoint(new Vector3(3, -2, 0)), 3, 0, 0);
    close(tri.getPlane().distanceToPoint(new Vector3(1, 1, 2)), 2);
    expect(tri.isFrontFacing(new Vector3(0, 0, -1))).toBe(true);
    expect(tri.isFrontFacing(new Vector3(0, 0, 1))).toBe(false);
    const touchingBox = new Box3(new Vector3(0.5, 0.5, -1), new Vector3(1.5, 1.5, 1));
    expect(tri.intersectsBox(touchingBox)).toBe(true);
    expect(touchingBox.intersectsTriangle(tri)).toBe(true);
    expect(tri.intersectsBox(new Box3(new Vector3(10, 10, -1), new Vector3(11, 11, 1)))).toBe(false);
    expect(new Triangle().getBarycoord(new Vector3(1, 2, 3))).toBeNull();
  }, 30_000);

  it("reconstructs seeded rotated triangle points and their closest projections", () => {
    const rand = random(0xa12ce);
    for (let i = 0; i < CASES; i += 1) {
      const origin = vector(rand), x = scalar(rand, 3), y = scalar(rand, 3), z = scalar(rand, 3);
      const axisX = rotateByAxes(new Vector3(1, 0, 0), x, y, z, "XYZ");
      const axisY = rotateByAxes(new Vector3(0, 1, 0), x, y, z, "XYZ");
      const normal = rotateByAxes(new Vector3(0, 0, 1), x, y, z, "XYZ");
      const width = 0.1 + rand() * 5, height = 0.1 + rand() * 5;
      const tri = new Triangle(origin, origin.add(axisX.multiplyScalar(width)), origin.add(axisY.multiplyScalar(height)));
      const u = rand(), v = rand() * (1 - u);
      const point = origin.add(axisX.multiplyScalar(width * u)).add(axisY.multiplyScalar(height * v));
      const elevated = point.add(normal.multiplyScalar(0.1 + rand() * 5));
      vecLike(tri.getNormal(), normal, 1e-7); close(tri.getArea(), width * height / 2, 1e-7);
      vec(tri.getBarycoord(point)!, 1 - u - v, u, v, 1e-7);
      expect(tri.containsPoint(point)).toBe(true);
      vecLike(tri.closestPointToPoint(elevated), point, 1e-7);
      close(tri.getPlane().distanceToPoint(point), 0, 1e-7);
    }
  }, 30_000);

  it("handles signed distances, projections, line, sphere and box intersections", () => {
    const plane = new Plane(new Vector3(0, 1, 0), -2); // y = 2
    const p = new Vector3(3, 7, -4);
    close(plane.distanceToPoint(p), 5); vec(plane.projectPoint(p), 3, 2, -4);
    vec(plane.coplanarPoint(), 0, 2, 0);
    const crossing = new Line3(new Vector3(1, 0, 1), new Vector3(1, 4, 1));
    expect(plane.intersectsLine(crossing)).toBe(true);
    vec(plane.intersectLine(crossing)!, 1, 2, 1);
    expect(plane.intersectsLine(new Line3(new Vector3(0, 3, 0), new Vector3(1, 3, 0)))).toBe(false);
    const sphere = new Sphere(new Vector3(0, 3, 0), 1.5);
    close(plane.distanceToSphere(sphere), -0.5); expect(plane.intersectsSphere(sphere)).toBe(true);
    expect(plane.intersectsBox(new Box3(new Vector3(-1, 1, -1), new Vector3(1, 3, 1)))).toBe(true);
    expect(plane.intersectsBox(new Box3(new Vector3(-1, 3, -1), new Vector3(1, 4, 1)))).toBe(false);
    close(plane.translate(new Vector3(0, 4, 0)).distanceToPoint(new Vector3(0, 6, 0)), 0);
  }, 30_000);
});

describe("ray, bounds and frustum: analytical fixtures", () => {
  it("queries closest points, sphere, plane, segment, triangle and box", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
    vec(ray.at(3), 3, 0, 0); vec(ray.closestPointToPoint(new Vector3(2, 3, 4)), 2, 0, 0);
    vec(ray.closestPointToPoint(new Vector3(-2, 3, 0)), 0, 0, 0);
    close(ray.distanceToPoint(new Vector3(2, 3, 4)), 5); close(ray.distanceSqToPoint(new Vector3(2, 3, 4)), 25);
    const sphere = new Sphere(new Vector3(5, 0, 0), 2);
    vec(ray.intersectSphere(sphere)!, 3, 0, 0); expect(ray.intersectsSphere(sphere)).toBe(true);
    expect(ray.intersectSphere(new Sphere(new Vector3(-5, 0, 0), 1))).toBeUndefined();
    const plane = new Plane(new Vector3(1, 0, 0), -4);
    close(ray.distanceToPlane(plane)!, 4); vec(ray.intersectPlane(plane)!, 4, 0, 0); expect(ray.intersectsPlane(plane)).toBe(true);
    const closest = ray.distanceSqToSegment(new Vector3(2, 1, 3), new Vector3(2, -1, 3));
    close(closest.distanceSq, 9); vec(closest.pointOnRay, 2, 0, 0); vec(closest.pointOnSegment, 2, 0, 3);
    const box = new Box3(new Vector3(3, -1, -1), new Vector3(5, 1, 1));
    vec(ray.intersectBox(box)!, 3, 0, 0); expect(ray.intersectsBox(box)).toBe(true);
    expect(ray.intersectBox(new Box3(new Vector3(-5, -1, -1), new Vector3(-3, 1, 1)))).toBeUndefined();
    const a = new Vector3(4, -1, -1), b = new Vector3(4, 1, -1), c = new Vector3(4, 0, 1);
    vec(ray.intersectTriangle(a, b, c)!, 4, 0, 0);
    expect(ray.intersectTriangle(a, b, c, true)).toBeUndefined();
    vec(ray.intersectTriangle(a, c, b, true)!, 4, 0, 0);
    vec(ray.recast(2).origin, 2, 0, 0); vec(ray.lookAt(new Vector3(0, 2, 0)).direction, 0, 1, 0);
    vec(ray.applyMatrix4(Matrix4.translation(new Vector3(1, 2, 3))).origin, 1, 2, 3);
    vec(ray.applyMatrix4(Matrix4.rotation(Quaternion.fromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2))).direction, 0, 1, 0);
  }, 30_000);

  it("finds analytical ray hits over translated spheres, boxes and planes", () => {
    const rand = random(0xbf5ce);
    for (let i = 0; i < CASES; i += 1) {
      const origin = vector(rand), travel = 2 + rand() * 8, radius = 0.1 + rand();
      const ray = new Ray(origin, new Vector3(1, 0, 0));
      const center = origin.add(new Vector3(travel + radius, 0, 0));
      const sphere = new Sphere(center, radius);
      vecLike(ray.intersectSphere(sphere)!, origin.add(new Vector3(travel, 0, 0)), 1e-7);
      expect(ray.intersectsSphere(sphere)).toBe(true);
      const box = new Box3(origin.add(new Vector3(travel, -radius, -radius)), origin.add(new Vector3(travel + radius, radius, radius)));
      vecLike(ray.intersectBox(box)!, origin.add(new Vector3(travel, 0, 0)), 1e-7);
      const plane = new Plane(new Vector3(1, 0, 0), -(origin.x + travel));
      close(ray.distanceToPlane(plane)!, travel, 1e-7);
      vecLike(ray.intersectPlane(plane)!, origin.add(new Vector3(travel, 0, 0)), 1e-7);
      const segment = ray.distanceSqToSegment(origin.add(new Vector3(travel, -1, 2)), origin.add(new Vector3(travel, 1, 2)));
      close(segment.distanceSq, 4, 1e-7);
      vecLike(segment.pointOnRay, origin.add(new Vector3(travel, 0, 0)), 1e-7);
      vecLike(segment.pointOnSegment, origin.add(new Vector3(travel, 0, 2)), 1e-7);
    }
  }, 30_000);

  it("checks AABBs against coordinate extrema and clamp distances", () => {
    const rand = random(0xc06ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = vector(rand), b = vector(rand), point = vector(rand);
      const lo = new Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
      const hi = new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
      const box = new Box3(lo, hi);
      const x = Math.max(lo.x, Math.min(hi.x, point.x)); const y = Math.max(lo.y, Math.min(hi.y, point.y)); const z = Math.max(lo.z, Math.min(hi.z, point.z));
      vec(box.clampPoint(point), x, y, z);
      close(box.distanceToPoint(point), Math.hypot(point.x - x, point.y - y, point.z - z));
      expect(box.containsPoint(point)).toBe(point.x >= lo.x && point.x <= hi.x && point.y >= lo.y && point.y <= hi.y && point.z >= lo.z && point.z <= hi.z);
      vec(box.getCenter(), (lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
      vec(box.getSize(), hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
      const expanded = box.expandByPoint(point);
      expect(expanded.containsPoint(point)).toBe(true); expect(expanded.containsPoint(lo)).toBe(true); expect(expanded.containsPoint(hi)).toBe(true);
      const offset = vector(rand); const moved = box.translate(offset);
      vecLike(moved.min, lo.add(offset)); vecLike(moved.max, hi.add(offset));
      const asSphere = box.getBoundingSphere();
      vecLike(asSphere.center, box.getCenter()); close(asSphere.radius, box.getSize().length() / 2);
    }
    const a = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const b = new Box3(new Vector3(0, 0, 0), new Vector3(2, 2, 2));
    expect(a.intersectsBox(b)).toBe(true);
    vec(a.intersect(b).min, 0, 0, 0); vec(a.intersect(b).max, 1, 1, 1);
    vec(a.union(b).min, -1, -1, -1); vec(a.union(b).max, 2, 2, 2);
    vec(a.expandByScalar(1).min, -2, -2, -2); vec(a.expandByScalar(1).max, 2, 2, 2);
    vec(a.transform(Matrix4.translation(new Vector3(2, 0, 0))).min, 1, -1, -1);
    expect(a.intersectsSphere(new Sphere(new Vector3(2, 0, 0), 1))).toBe(true);
    expect(a.intersectsPlane(new Plane(new Vector3(0, 1, 0), 0))).toBe(true);
  }, 30_000);

  it("checks box overlap, union, clipping and rotated corner bounds", () => {
    const rand = random(0xc07ce);
    for (let i = 0; i < CASES; i += 1) {
      const center = vector(rand), extent = new Vector3(0.1 + rand() * 3, 0.1 + rand() * 3, 0.1 + rand() * 3);
      const otherCenter = vector(rand), otherExtent = new Vector3(0.1 + rand() * 3, 0.1 + rand() * 3, 0.1 + rand() * 3);
      const a = new Box3(center.subtract(extent), center.add(extent));
      const b = new Box3(otherCenter.subtract(otherExtent), otherCenter.add(otherExtent));
      const overlap = Math.abs(center.x - otherCenter.x) <= extent.x + otherExtent.x &&
        Math.abs(center.y - otherCenter.y) <= extent.y + otherExtent.y && Math.abs(center.z - otherCenter.z) <= extent.z + otherExtent.z;
      expect(a.intersectsBox(b)).toBe(overlap);
      expect(a.intersect(b).isEmpty()).toBe(!overlap);
      const union = a.union(b);
      expect(union.containsPoint(a.min) && union.containsPoint(a.max) && union.containsPoint(b.min) && union.containsPoint(b.max)).toBe(true);
      const angle = scalar(rand, Math.PI), co = Math.cos(angle), si = Math.sin(angle);
      const q = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), angle);
      const transformed = a.transform(Matrix4.rotation(q));
      const rotatedCenter = new Vector3(co * center.x - si * center.y, si * center.x + co * center.y, center.z);
      const rx = Math.abs(co) * extent.x + Math.abs(si) * extent.y;
      const ry = Math.abs(si) * extent.x + Math.abs(co) * extent.y;
      vec(transformed.min, rotatedCenter.x - rx, rotatedCenter.y - ry, center.z - extent.z, 1e-7);
      vec(transformed.max, rotatedCenter.x + rx, rotatedCenter.y + ry, center.z + extent.z, 1e-7);
    }
  }, 30_000);

  it("checks sphere containment, distance, extent, union and expansion", () => {
    const rand = random(0xc17ce);
    for (let i = 0; i < CASES; i += 1) {
      const center = vector(rand), point = vector(rand); const radius = 0.1 + rand() * 5;
      const sphere = new Sphere(center, radius); const distance = Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z);
      expect(sphere.containsPoint(point)).toBe(distance <= radius);
      close(sphere.distanceToPoint(point), distance - radius);
      const clamp = sphere.clampPoint(point);
      if (distance > radius) close(clamp.distanceTo(center), radius);
      else vecLike(clamp, point);
      const expanded = sphere.expandByPoint(point);
      expect(expanded.center.distanceTo(point)).toBeLessThanOrEqual(expanded.radius + 1e-8);
      expect(expanded.center.distanceTo(center) + radius).toBeLessThanOrEqual(expanded.radius + 1e-8);
      const other = new Sphere(vector(rand), rand() * 3);
      expect(sphere.intersectsSphere(other)).toBe(center.distanceTo(other.center) <= radius + other.radius);
      const union = sphere.union(other);
      expect(union.center.distanceTo(center) + radius).toBeLessThanOrEqual(union.radius + 1e-8);
      expect(union.center.distanceTo(other.center) + other.radius).toBeLessThanOrEqual(union.radius + 1e-8);
      const bounds = sphere.getBoundingBox();
      vec(bounds.min, center.x - radius, center.y - radius, center.z - radius);
      vec(bounds.max, center.x + radius, center.y + radius, center.z + radius);
    }
    const points = [new Vector3(-2, 0, 0), new Vector3(2, 0, 0), new Vector3(0, 1, 0)];
    const bound = Sphere.setFromPoints(points); vec(bound.center, 0, 0.5, 0); close(bound.radius, Math.sqrt(4.25));
    vec(new Sphere(new Vector3(1, 2, 3), 4).translate(new Vector3(2, 3, 4)).center, 3, 5, 7);
    expect(new Sphere(new Vector3(), 1).intersectsBox(new Box3(new Vector3(0.5, -1, -1), new Vector3(2, 1, 1)))).toBe(true);
    expect(new Sphere(new Vector3(), 1).intersectsPlane(new Plane(new Vector3(0, 1, 0), -2))).toBe(false);
  }, 30_000);

  it("clips points, spheres and boxes against the known identity clip cube", () => {
    const frustum = Frustum.setFromProjectionMatrix(Matrix4.identity());
    const rand = random(0xc28ce);
    for (let i = 0; i < CASES; i += 1) {
      const p = vector(rand, 2);
      expect(frustum.containsPoint(p)).toBe(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1);
      const radius = rand();
      expect(frustum.intersectsSphere(new Sphere(p, radius))).toBe(Math.abs(p.x) <= 1 + radius && Math.abs(p.y) <= 1 + radius && Math.abs(p.z) <= 1 + radius);
      const box = new Box3(p.subtract(new Vector3(0.2, 0.2, 0.2)), p.add(new Vector3(0.2, 0.2, 0.2)));
      expect(frustum.intersectsBox(box)).toBe(Math.abs(p.x) <= 1.2 && Math.abs(p.y) <= 1.2 && Math.abs(p.z) <= 1.2);
    }
    const perspective = Frustum.setFromProjectionMatrix(Matrix4.perspective(Math.PI / 2, 1, 1, 10));
    expect(perspective.containsPoint(new Vector3(0, 0, -5))).toBe(true);
    expect(perspective.containsPoint(new Vector3(6, 0, -5))).toBe(false);
    expect(perspective.containsPoint(new Vector3(0, 0, -0.5))).toBe(false);
    expect(perspective.containsPoint(new Vector3(0, 0, -11))).toBe(false);
  }, 30_000);
});

describe("oriented bounds and capsules", () => {
  it("checks a rotated box in its analytically known local frame", () => {
    const center = new Vector3(2, 3, 4);
    const rotation = Matrix3.fromMatrix4(Matrix4.rotation(Quaternion.fromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)));
    const obb = new OBB(center, new Vector3(2, 1, 0.5), rotation);
    vec(obb.getSize(), 4, 2, 1);
    const rand = random(0xd39ce);
    for (let i = 0; i < CASES; i += 1) {
      const local = vector(rand, 4);
      const world = new Vector3(center.x - local.y, center.y + local.x, center.z + local.z);
      expect(obb.containsPoint(world)).toBe(Math.abs(local.x) <= 2 && Math.abs(local.y) <= 1 && Math.abs(local.z) <= 0.5);
      const x = Math.max(-2, Math.min(2, local.x));
      const y = Math.max(-1, Math.min(1, local.y));
      const z = Math.max(-0.5, Math.min(0.5, local.z));
      vec(obb.clampPoint(world), center.x - y, center.y + x, center.z + z, 1e-7);
      const radius = rand();
      expect(obb.intersectsSphere(new Sphere(world, radius))).toBe(Math.hypot(local.x - x, local.y - y, local.z - z) <= radius);
    }
    expect(obb.intersectsPlane(new Plane(new Vector3(0, 0, 1), -4))).toBe(true);
    expect(obb.intersectsPlane(new Plane(new Vector3(0, 0, 1), -6))).toBe(false);
    vec(obb.intersectRay(new Ray(new Vector3(2, 3, 10), new Vector3(0, 0, -1)))!, 2, 3, 4.5);
    expect(obb.intersectsOBB(new OBB(new Vector3(2, 3, 4), new Vector3(0.5, 0.5, 0.5)))).toBe(true);
    expect(obb.intersectsOBB(new OBB(new Vector3(10, 10, 10), new Vector3(0.5, 0.5, 0.5)))).toBe(false);
  }, 30_000);

  it("checks capsule center, translation and box broad-phase", () => {
    const cap = new Capsule(new Vector3(0, 0, 0), new Vector3(0, 4, 0), 0.5);
    vec(cap.getCenter(), 0, 2, 0);
    const moved = cap.translate(new Vector3(2, 3, 4));
    vec(moved.start, 2, 3, 4); vec(moved.end, 2, 7, 4); close(moved.radius, 0.5);
    expect(cap.intersectsBox(new Box3(new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 2, 0.2)))).toBe(true);
    expect(cap.intersectsBox(new Box3(new Vector3(2, 1, -0.2), new Vector3(3, 2, 0.2)))).toBe(false);
  }, 30_000);
});

describe("convex hull: topology and independent solids", () => {
  it("builds a cube with outward faces, closed edges and expected ray hits", () => {
    const points: Vector3[] = [];
    for (const x of [-3, 3]) for (const y of [-3, 3]) for (const z of [-3, 3]) points.push(new Vector3(x, y, z));
    const rand = random(0xc0a7e);
    for (let i = 0; i < 200; i += 1) points.push(vector(rand, 2.5));
    const hull = new ConvexHull().setFromPoints(points);
    expect(hull.faces.length).toBe(12);
    close(hull.faces.reduce((sum, face) => sum + face.area, 0), 216, 1e-6);
    let edgeCount = 0;
    for (const face of hull.faces) {
      const start = face.edge!; let edge = start; let count = 0;
      do {
        expect(edge.twin).not.toBeNull(); expect(edge.twin!.twin).toBe(edge);
        expect(edge.face).toBe(face); expect(edge.next!.prev).toBe(edge);
        expect(Math.abs(face.distanceToPoint(edge.head().point))).toBeLessThanOrEqual(1e-7);
        edge = edge.next!; count += 1; edgeCount += 1;
        expect(count).toBeLessThanOrEqual(3);
      } while (edge !== start);
      expect(count).toBe(3);
    }
    expect(edgeCount / 2).toBe(18); // Euler: 8 vertices - 18 edges + 12 faces = 2
    for (let i = 0; i < CASES; i += 1) {
      const p = vector(rand, 5);
      expect(hull.containsPoint(p)).toBe(Math.abs(p.x) <= 3 && Math.abs(p.y) <= 3 && Math.abs(p.z) <= 3);
      const y = scalar(rand, 2.9); const z = scalar(rand, 2.9);
      const ray = new Ray(new Vector3(-8, y, z), new Vector3(1, 0, 0));
      vec(hull.intersectRay(ray)!, -3, y, z, 1e-7); expect(hull.intersectsRay(ray)).toBe(true);
    }
    expect(hull.intersectsRay(new Ray(new Vector3(-8, 4, 0), new Vector3(1, 0, 0)))).toBe(false);
    expect(new ConvexHull().setFromPoints(points.slice(0, 3)).faces).toHaveLength(0);
  }, 30_000);

  it("encloses seeded irregular, spherical and thin point clouds with outward supporting planes", () => {
    const rand = random(0x9ea1f);
    const clouds = [
      Array.from({ length: 250 }, () => vector(rand)),
      Array.from({ length: 250 }, () => vector(rand).normalize().multiplyScalar(7)),
      Array.from({ length: 250 }, () => new Vector3(scalar(rand, 10), scalar(rand, 10), scalar(rand, 0.02)))
    ];
    for (const points of clouds) {
      const hull = new ConvexHull().setFromPoints(points);
      expect(hull.faces.length).toBeGreaterThan(3);
      let furthestOutside = -Infinity;
      for (const point of points) {
        for (const face of hull.faces) furthestOutside = Math.max(furthestOutside, face.distanceToPoint(point));
      }
      expect(furthestOutside).toBeLessThanOrEqual(1e-7);
      for (const face of hull.faces) expect(face.edge!.twin!.twin).toBe(face.edge);
      expect(hull.containsPoint(new Vector3())).toBe(true);
    }
  }, 30_000);
});

// Flat, +Y-facing triangles are an analytical collision surface: for a ray
// above the plane the nearest hit is y=0; for a sphere/capsule above it the
// penetration is radius minus height. No engine-generated fixture is used.
function floorMesh(): { positions: number[]; indices: number[] } {
  const positions: number[] = []; const indices: number[] = []; const side = 12;
  for (let z = 0; z <= side; z += 1) for (let x = 0; x <= side; x += 1) positions.push(x - side / 2, 0, z - side / 2);
  for (let z = 0; z < side; z += 1) for (let x = 0; x < side; x += 1) {
    const a = z * (side + 1) + x, b = a + 1, c = a + side + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { positions, indices };
}

describe("octree: planar collision fixtures", () => {
  const mesh = floorMesh();
  const tree = new Octree().fromPositions(new Float32Array(mesh.positions), mesh.indices);

  it("builds a nonempty hierarchy, gathers triangles once and clears owned state", () => {
    expect(tree.subTrees.length).toBeGreaterThan(0);
    const ray = new Ray(new Vector3(0.1, 3, 0.2), new Vector3(0, -1, 0));
    const triangles: Triangle[] = []; tree.getRayTriangles(ray, triangles);
    expect(triangles.length).toBeGreaterThan(0); expect(new Set(triangles).size).toBe(triangles.length);
    const clone = new Octree().fromPositions(new Float32Array(mesh.positions), mesh.indices);
    clone.clear(); expect(clone.subTrees).toHaveLength(0); expect(clone.triangles).toHaveLength(0);
  }, 30_000);

  it("returns the nearest floor hit for seeded downward rays and misses outside or back-facing rays", () => {
    const rand = random(0x4a7e);
    for (let i = 0; i < CASES; i += 1) {
      const x = scalar(rand, 5); const z = scalar(rand, 5); const y = 1 + rand() * 8;
      const hit = tree.rayIntersect(new Ray(new Vector3(x, y, z), new Vector3(0, -1, 0)));
      expect(hit).not.toBe(false);
      if (hit) { close(hit.distance, y, 1e-6); vec(hit.position, x, 0, z, 1e-6); }
    }
    expect(tree.rayIntersect(new Ray(new Vector3(20, 3, 0), new Vector3(0, -1, 0)))).toBe(false);
    expect(tree.rayIntersect(new Ray(new Vector3(0, -3, 0), new Vector3(0, 1, 0)))).toBe(false);
  }, 30_000);

  it("resolves sphere penetrations against the flat floor", () => {
    const rand = random(0xca95);
    for (let i = 0; i < 250; i += 1) {
      const x = scalar(rand, 4), z = scalar(rand, 4), height = 0.1 + rand() * 0.2, radius = 0.5;
      const hit = tree.sphereIntersect(new Sphere(new Vector3(x, height, z), radius));
      expect(hit).not.toBe(false);
      if (hit) { close(hit.depth, radius - height, 1e-6); vec(hit.normal, 0, 1, 0, 1e-6); }
      expect(tree.sphereIntersect(new Sphere(new Vector3(x, 2, z), radius))).toBe(false);
    }
  }, 30_000);

  it("resolves capsule penetrations against the flat floor", () => {
    const rand = random(0xca95);
    for (let i = 0; i < 250; i += 1) {
      const x = scalar(rand, 4), z = scalar(rand, 4), height = 0.1 + rand() * 0.2, radius = 0.5;
      const hit = tree.capsuleIntersect(new Capsule(new Vector3(x, height, z), new Vector3(x, height + 1, z), radius));
      expect(hit).not.toBe(false);
      if (hit) { close(hit.depth, radius - height, 1e-6); vec(hit.normal, 0, 1, 0, 1e-6); }
      expect(tree.capsuleIntersect(new Capsule(new Vector3(x, 2, z), new Vector3(x, 3, z), radius))).toBe(false);
    }
  }, 30_000);

  it("keeps true triangle edge, vertex and zero-length capsule contacts", () => {
    const triangle = new Triangle(new Vector3(0, 0, 0), new Vector3(0, 0, 2), new Vector3(2, 0, 0));
    const edge = new Vector3(-0.3, 0.2, 0.75), vertex = new Vector3(-0.3, 0.2, -0.4);
    const edgeDistance = Math.sqrt(0.3 ** 2 + 0.2 ** 2);
    const edgeHit = tree.triangleSphereIntersect(new Sphere(edge, 0.5), triangle);
    expect(edgeHit).not.toBe(false);
    if (edgeHit) {
      close(edgeHit.depth, 0.5 - edgeDistance);
      vec(edgeHit.normal, -0.3 / edgeDistance, 0.2 / edgeDistance, 0);
      vec(edgeHit.point, 0, 0, 0.75);
    }
    const vertexDistance = Math.sqrt(0.3 ** 2 + 0.2 ** 2 + 0.4 ** 2);
    const vertexHit = tree.triangleSphereIntersect(new Sphere(vertex, 0.7), triangle);
    expect(vertexHit).not.toBe(false);
    if (vertexHit) {
      close(vertexHit.depth, 0.7 - vertexDistance);
      vec(vertexHit.normal, -0.3 / vertexDistance, 0.2 / vertexDistance, -0.4 / vertexDistance);
      vec(vertexHit.point, 0, 0, 0);
    }
    const capsuleHit = tree.triangleCapsuleIntersect(new Capsule(edge, edge, 0.5), triangle);
    expect(capsuleHit).not.toBe(false);
    if (capsuleHit) {
      close(capsuleHit.depth, 0.5 - edgeDistance);
      vec(capsuleHit.normal, -0.3 / edgeDistance, 0.2 / edgeDistance, 0);
    }
    const crossing = tree.triangleCapsuleIntersect(new Capsule(new Vector3(-0.2, 0.2, 0.8), new Vector3(0.2, 0.2, 0.8), 0.5), triangle);
    expect(crossing).not.toBe(false);
    if (crossing) { close(crossing.depth, 0.3); vec(crossing.normal, 0, 1, 0); }
    const segment = new Triangle(new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, 1));
    const degenerate = tree.triangleSphereIntersect(new Sphere(new Vector3(0.3, 0.2, 0.5), 0.5), segment);
    expect(degenerate).not.toBe(false);
    if (degenerate) {
      close(degenerate.depth, 0.5 - edgeDistance);
      vec(degenerate.normal, 0.3 / edgeDistance, 0.2 / edgeDistance, 0);
    }
    const coincident = tree.triangleSphereIntersect(new Sphere(new Vector3(0, 0, 0.5), 0.5), segment);
    expect(coincident).not.toBe(false);
    if (coincident) {
      close(coincident.depth, 0.5);
      close(coincident.normal.length(), 1);
      close(coincident.normal.z, 0);
    }
  });

  it("resolves perpendicular walls independently of triangle order", () => {
    const floor = [new Triangle(new Vector3(-4, 0, -4), new Vector3(-4, 0, 4), new Vector3(4, 0, -4)),
      new Triangle(new Vector3(4, 0, 4), new Vector3(4, 0, -4), new Vector3(-4, 0, 4))];
    const wall = [new Triangle(new Vector3(0, -4, -4), new Vector3(0, 4, -4), new Vector3(0, -4, 4)),
      new Triangle(new Vector3(0, 4, 4), new Vector3(0, -4, 4), new Vector3(0, 4, -4))];
    const position = new Vector3(0.2, 0.3, 0.5);
    const expected = new Vector3(0.3, 0.2, 0);
    for (const triangles of [[...floor, ...wall], [...wall, ...floor].reverse()]) {
      const corner = new Octree().fromTriangles(triangles);
      const result = corner.sphereIntersect(new Sphere(position, 0.5));
      expect(result).not.toBe(false);
      if (result) {
        close(result.depth, expected.length(), 1e-8);
        vec(result.normal, expected.x / expected.length(), expected.y / expected.length(), 0, 1e-8);
      }
      const box = new Box3(position.subtract(new Vector3(0.5, 0.5, 0.5)), position.add(new Vector3(0.5, 0.5, 0.5)));
      const boxHit = corner.boxIntersect(box);
      expect(boxHit).not.toBe(false);
      if (boxHit) {
        close(boxHit.depth, expected.length(), 1e-8);
        vec(boxHit.normal, expected.x / expected.length(), expected.y / expected.length(), 0, 1e-8);
      }
    }
  });

  it("resolves contacts when geometry is much smaller than one unit", () => {
    const triangle = new Triangle(new Vector3(0, 0, 0), new Vector3(0, 0, 1e-6), new Vector3(1e-6, 0, 0));
    const smallTree = new Octree().fromTriangles([triangle]);
    const center = new Vector3(2e-7, 3e-13, 3e-7);
    const sphere = smallTree.sphereIntersect(new Sphere(center, 1e-12));
    expect(sphere).not.toBe(false);
    if (sphere) { close(sphere.depth, 7e-13, 1e-24); vec(sphere.normal, 0, 1, 0, 1e-8); }
    const capsule = smallTree.capsuleIntersect(new Capsule(center, center.add(new Vector3(0, 1e-7, 0)), 1e-12));
    expect(capsule).not.toBe(false);
    if (capsule) { close(capsule.depth, 7e-13, 1e-24); vec(capsule.normal, 0, 1, 0, 1e-8); }
  });

  it("resolves box penetrations against the flat floor", () => {
    const rand = random(0xca95);
    for (let i = 0; i < 250; i += 1) {
      const x = scalar(rand, 4), z = scalar(rand, 4);
      const hit = tree.boxIntersect(new Box3(new Vector3(x - 0.1, -0.2, z - 0.1), new Vector3(x + 0.1, 0.4, z + 0.1)));
      expect(hit).not.toBe(false);
      if (hit) { close(hit.depth, 0.2, 1e-6); vec(hit.normal, 0, 1, 0, 1e-6); }
      expect(tree.boxIntersect(new Box3(new Vector3(x - 0.1, 1, z - 0.1), new Vector3(x + 0.1, 2, z + 0.1)))).toBe(false);
    }
  }, 30_000);

  it("reports box contact points on the triangle plane and tolerates degenerate faces", () => {
    const triangle = new Triangle(new Vector3(-2, 0, -2), new Vector3(-2, 0, 2), new Vector3(2, 0, -2));
    const box = new Box3(new Vector3(-0.5, -0.25, -0.5), new Vector3(0.5, 0.5, 0.5));
    const hit = tree.triangleBoxIntersect(box, triangle);
    expect(hit).not.toBe(false);
    if (hit) {
      close(hit.depth, 0.25);
      vec(hit.normal, 0, 1, 0);
      close(triangle.getPlane().distanceToPoint(hit.point), 0);
    }

    const tilted = new Triangle(new Vector3(-2, 2, -2), new Vector3(-2, 2, 2), new Vector3(2, -2, -2));
    const tiltedHit = tree.triangleBoxIntersect(box, tilted);
    expect(tiltedHit).not.toBe(false);
    if (tiltedHit) {
      close(tiltedHit.depth, 0.75 / Math.SQRT2);
      vec(tiltedHit.normal, Math.SQRT1_2, Math.SQRT1_2, 0);
      close(tilted.getPlane().distanceToPoint(tiltedHit.point), 0);
    }

    const collapsed = new Triangle(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0));
    expect(() => tree.triangleBoxIntersect(box, collapsed)).not.toThrow();
    expect(tree.triangleBoxIntersect(box, collapsed)).toBe(false);
  });

  it("retains a unit contact normal for a box touching the plane without penetration", () => {
    const box = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 0.5, 0.5));
    const hit = tree.boxIntersect(box);
    expect(hit).not.toBe(false);
    if (hit) { close(hit.depth, 0); vec(hit.normal, 0, 1, 0); }
  });
});
