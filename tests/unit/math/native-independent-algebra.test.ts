import { describe, expect, it } from "vitest";
import { Box3 } from "../../../packages/math/src/independent/mutable/Box3.js";
import { Euler } from "../../../packages/math/src/independent/mutable/Euler.js";
import { Frustum } from "../../../packages/math/src/independent/mutable/Frustum.js";
import { Matrix3 } from "../../../packages/math/src/independent/mutable/Matrix3.js";
import { Matrix4 } from "../../../packages/math/src/independent/mutable/Matrix4.js";
import { Plane } from "../../../packages/math/src/independent/mutable/Plane.js";
import { Quaternion, type EulerOrder } from "../../../packages/math/src/independent/mutable/Quaternion.js";
import { Ray } from "../../../packages/math/src/independent/mutable/Ray.js";
import { Sphere } from "../../../packages/math/src/independent/mutable/Sphere.js";
import { Triangle } from "../../../packages/math/src/independent/mutable/Triangle.js";
import { Vector2 } from "../../../packages/math/src/independent/mutable/Vector2.js";
import { Vector3 } from "../../../packages/math/src/independent/mutable/Vector3.js";
import { Vector4 } from "../../../packages/math/src/independent/mutable/Vector4.js";

type Triple = [number, number, number];
const orders: EulerOrder[] = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];
const vector = (v: Triple): Vector3 => new Vector3(...v);

function near(actual: number, expected: number, tolerance = 1e-10): void {
  expect(Number.isFinite(actual), `Expected a finite value, received ${actual}`).toBe(true);
  expect(Math.abs(actual - expected), `Expected ${actual} to be close to ${expected}`)
    .toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
}

function nearVector(actual: { x: number; y: number; z: number }, expected: Triple, tolerance = 1e-10): void {
  near(actual.x, expected[0], tolerance);
  near(actual.y, expected[1], tolerance);
  near(actual.z, expected[2], tolerance);
}

function nearElements(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-10): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) near(actual[i]!, expected[i]!, tolerance);
}

// A fixed 32-bit generator keeps this test reproducible without shared global RNG state.
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// Right-handed axis equations; intrinsic R(a)R(b)R(c) acts on a vector from c to a.
function rotateByEuler(input: Triple, angles: Triple, order: EulerOrder): Triple {
  let [x, y, z] = input;
  for (const axis of [...order].reverse()) {
    const angle = angles[axis === "X" ? 0 : axis === "Y" ? 1 : 2]!;
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === "X") [y, z] = [c * y - s * z, s * y + c * z];
    else if (axis === "Y") [x, z] = [c * x + s * z, -s * x + c * z];
    else [x, y] = [c * x - s * y, s * x + c * y];
  }
  return [x, y, z];
}

const identity4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function repeatedHalfSpace(magnitude: number): Frustum {
  const plane = new Plane(new Vector3(magnitude, magnitude, 0), 0);
  return new Frustum(plane, plane.clone(), plane.clone(), plane.clone(), plane.clone(), plane.clone());
}

describe("independent mutable math: cross-type algebra", () => {
  it("distinguishes rotation order with quarter turns, then agrees with axis equations for all six orders", () => {
    const quarterTurns: Triple = [Math.PI / 2, Math.PI / 2, 0];
    nearVector(new Vector3(0, 0, 1).applyEuler(new Euler(...quarterTurns, "XYZ")), [1, 0, 0]);
    nearVector(new Vector3(0, 0, 1).applyEuler(new Euler(...quarterTurns, "ZYX")), [0, -1, 0]);

    const random = generator(0x3d29a617);
    for (const order of orders) {
      for (let i = 0; i < 40; i++) {
        const angles: Triple = [(random() - 0.5) * 5, (random() - 0.5) * 5, (random() - 0.5) * 5];
        const input: Triple = [(random() - 0.5) * 10, (random() - 0.5) * 10, (random() - 0.5) * 10];
        const expected = rotateByEuler(input, angles, order);
        const euler = new Euler(...angles, order);
        const quaternion = new Quaternion().setFromEuler(euler);
        const matrix = new Matrix4().makeRotationFromEuler(euler);
        near(quaternion.length(), 1);
        near(matrix.determinant(), 1);
        nearVector(vector(input).applyEuler(euler), expected);
        nearVector(vector(input).applyQuaternion(quaternion), expected);
        nearVector(vector(input).applyMatrix4(matrix), expected);
        nearElements(new Matrix4().makeRotationFromQuaternion(quaternion).elements, matrix.elements);
        nearVector(vector(input).applyQuaternion(quaternion).applyQuaternion(quaternion.clone().invert()), input);
        const negative = new Quaternion(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        nearVector(vector(input).applyQuaternion(negative), expected);
      }
    }
  });

  it("preserves represented orientations across Euler extraction and reordering, including gimbal lock", () => {
    const input: Triple = [0.7, -2.1, 1.3];
    for (const sourceOrder of orders) {
      const middle = "XYZ".indexOf(sourceOrder[1]!);
      for (const middleAngle of [-Math.PI / 2, -Math.PI / 2 + 1e-8, 0.37, Math.PI / 2 - 1e-8, Math.PI / 2]) {
        const angles: Triple = [0.43, -0.72, 1.13];
        angles[middle] = middleAngle;
        const original = new Euler(...angles, sourceOrder);
        const matrix = new Matrix4().makeRotationFromEuler(original);
        const quaternion = new Quaternion().setFromEuler(original);
        const expected = rotateByEuler(input, angles, sourceOrder);
        for (const targetOrder of orders) {
          const fromMatrix = new Euler().setFromRotationMatrix(matrix, targetOrder);
          const fromQuaternion = new Euler().setFromQuaternion(quaternion, targetOrder);
          const reordered = original.clone();
          expect(reordered.reorder(targetOrder)).toBe(reordered);
          nearVector(vector(input).applyEuler(fromMatrix), expected, 2e-8);
          nearVector(vector(input).applyEuler(fromQuaternion), expected, 2e-8);
          nearVector(vector(input).applyEuler(reordered), expected, 2e-8);
        }
      }
    }
  });

  it("composes quaternions in the same order as matrices and handles aliased operands", () => {
    const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const expected: Triple = [1, 0, 0]; // Ry maps +Z to +X; Rx leaves +X unchanged.
    const product = qx.clone();
    expect(product.multiply(qy)).toBe(product);
    nearVector(new Vector3(0, 0, 1).applyQuaternion(product), expected);
    nearVector(new Vector3(0, 0, 1).applyMatrix4(new Matrix4().makeRotationFromQuaternion(qx)
      .multiply(new Matrix4().makeRotationFromQuaternion(qy))), expected);
    const aliasRight = qy.clone();
    expect(aliasRight.multiplyQuaternions(qx, aliasRight)).toBe(aliasRight);
    nearVector(new Vector3(0, 0, 1).applyQuaternion(aliasRight), expected);
    const identity = product.clone().multiply(product.clone().invert());
    nearElements(identity.toArray(), [0, 0, 0, 1]);
  });

  it("inverts non-unit quaternions at extreme finite magnitudes and rotates nearly opposite directions", () => {
    for (const magnitude of [1e-200, 1, 1e200]) {
      const q = new Quaternion(magnitude, -2 * magnitude, 3 * magnitude, -4 * magnitude);
      const inverse = q.clone();
      expect(inverse.invert()).toBe(inverse);
      nearElements(q.clone().multiply(inverse).toArray(), [0, 0, 0, 1]);
      nearElements(inverse.clone().multiply(q).toArray(), [0, 0, 0, 1]);
    }
    for (const dy of [0, 1e-9, -1e-9]) {
      const from = new Vector3(1, 0, 0);
      const to = new Vector3(-1, dy, 0).normalize();
      const rotation = new Quaternion().setFromUnitVectors(from, to);
      near(rotation.length(), 1);
      nearVector(from.applyQuaternion(rotation), [to.x, to.y, to.z], 1e-13);
    }
    const tinyAngle = 1e-12;
    const smallTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), tinyAngle);
    near(new Quaternion().angleTo(smallTurn) / tinyAngle, 1);
  });

  it("composes, inverts and decomposes affine transforms with seeded rotations and reflections", () => {
    const random = generator(0x4a2b19ce);
    for (let i = 0; i < 36; i++) {
      const order = orders[i % orders.length]!;
      const angles: Triple = [(random() - 0.5) * 5, (random() - 0.5) * 5, (random() - 0.5) * 5];
      const point: Triple = [(random() - 0.5) * 8, (random() - 0.5) * 8, (random() - 0.5) * 8];
      const translation: Triple = [(random() - 0.5) * 10, (random() - 0.5) * 10, (random() - 0.5) * 10];
      const scale: Triple = [(0.3 + random() * 3) * (i % 2 ? -1 : 1), 0.3 + random() * 3, 0.3 + random() * 3];
      const q = new Quaternion().setFromEuler(new Euler(...angles, order));
      const transform = new Matrix4();
      expect(transform.compose(vector(translation), q, vector(scale))).toBe(transform);
      const rotated = rotateByEuler([point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]], angles, order);
      const expected: Triple = [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]];
      const changed = vector(point);
      expect(changed.applyMatrix4(transform)).toBe(changed);
      nearVector(changed, expected);
      near(transform.determinantAffine(), scale[0] * scale[1] * scale[2]);
      const inverse = transform.clone();
      expect(inverse.invert()).toBe(inverse);
      nearVector(changed.applyMatrix4(inverse), point);
      nearElements(transform.clone().multiply(inverse).elements, identity4);
      nearElements(inverse.clone().multiply(transform).elements, identity4);

      const outputPosition = new Vector3(), outputRotation = new Quaternion(), outputScale = new Vector3();
      expect(transform.decompose(outputPosition, outputRotation, outputScale)).toBe(transform);
      nearVector(outputPosition, translation);
      nearVector(outputScale, scale);
      nearElements(new Matrix4().compose(outputPosition, outputRotation, outputScale).elements, transform.elements);

      const rightAlias = inverse.clone();
      expect(rightAlias.multiplyMatrices(transform, rightAlias)).toBe(rightAlias);
      nearElements(rightAlias.elements, identity4);
    }
  });

  it("agrees on homogeneous 3D and 2D affine transforms and their inverses", () => {
    const m = new Matrix4().set(2, 1, 0, 5, 0, 3, 1, -2, -1, 0, 2, 4, 0, 0, 0, 1);
    const p = new Vector3(2, -1, 3);
    const h = new Vector4(2, -1, 3, 1);
    expect(h.applyMatrix4(m)).toBe(h);
    nearElements(h.toArray(), [8, -2, 8, 1]);
    nearVector(p.applyMatrix4(m), [8, -2, 8]);
    nearElements(h.applyMatrix4(m.clone().invert()).toArray(), [2, -1, 3, 1]);

    // The 2D chain is scale, then a quarter turn, then translation.
    const m2 = new Matrix3().makeScale(2, 3).rotate(Math.PI / 2).translate(4, -1);
    const uv = new Vector2(2, -1);
    expect(uv.applyMatrix3(m2)).toBe(uv);
    near(uv.x, 7); near(uv.y, 3);
    uv.applyMatrix3(m2.clone().invert());
    near(uv.x, 2); near(uv.y, -1);
  });

  it("uses the normal matrix to keep transformed tangents perpendicular to a transformed plane", () => {
    const m = new Matrix4().set(2, 1, 0, 5, 0, 3, 1, -2, -1, 0, 2, 4, 0, 0, 0, 1);
    const normalMatrix = new Matrix3().getNormalMatrix(m);
    const normal = new Vector3(0, 0, 1).applyNormalMatrix(normalMatrix);
    const tangentX = new Vector3(1, 0, 0).transformDirection(m);
    const tangentY = new Vector3(0, 1, 0).transformDirection(m);
    near(normal.dot(tangentX), 0);
    near(normal.dot(tangentY), 0);
    const plane = new Plane(new Vector3(0, 0, 1), -1);
    const viaNormalMatrix = plane.clone().applyMatrix4(m, normalMatrix);
    const viaInverse = plane.clone().applyMatrix4(m);
    nearVector(viaInverse.normal, [normal.x, normal.y, normal.z]);
    nearVector(viaNormalMatrix.normal, [normal.x, normal.y, normal.z]);
    near(viaInverse.constant, viaNormalMatrix.constant);
    for (const point of [[0, 0, 1], [4, 0, 1], [0, 4, 1]] as Triple[]) {
      near(viaInverse.distanceToPoint(vector(point).applyMatrix4(m)), 0);
    }
  });

  it("preserves ray, plane and barycentric intersections under an invertible affine transform", () => {
    const m = new Matrix4().set(2, 1, 0, 5, 0, 3, 1, -2, -1, 0, 2, 4, 0, 0, 0, 1);
    const a = new Vector3(0, 0, 1), b = new Vector3(4, 0, 1), c = new Vector3(0, 4, 1);
    const triangle = new Triangle(a, b, c);
    const plane = triangle.getPlane(new Plane());
    const ray = new Ray(new Vector3(1, 1, 5), new Vector3(0, 0, -2));
    const target = new Vector3();
    expect(ray.intersectTriangle(a, b, c, false, target)).toBe(target);
    nearVector(target, [1, 1, 1]);
    expect(ray.intersectPlane(plane, target)).toBe(target);
    nearVector(target, [1, 1, 1]);
    near(ray.distanceToPlane(plane)!, 2);
    expect(triangle.getBarycoord(target, target)).toBe(target);
    nearVector(target, [0.5, 0.25, 0.25]);

    const transformedTriangle = new Triangle(a.clone().applyMatrix4(m), b.clone().applyMatrix4(m), c.clone().applyMatrix4(m));
    const transformedPlane = plane.clone().applyMatrix4(m);
    const transformedRay = ray.clone();
    expect(transformedRay.applyMatrix4(m)).toBe(transformedRay);
    const transformedHit = new Vector3();
    expect(transformedRay.intersectTriangle(transformedTriangle.a, transformedTriangle.b, transformedTriangle.c, false, transformedHit)).toBe(transformedHit);
    nearVector(transformedHit, [8, 2, 5]);
    near(transformedPlane.distanceToPoint(transformedHit), 0);
    const weights = new Vector3();
    expect(transformedTriangle.getBarycoord(transformedHit, weights)).toBe(weights);
    nearVector(weights, [0.5, 0.25, 0.25]);
    expect(transformedRay.intersectPlane(transformedPlane, transformedRay.origin)).toBe(transformedRay.origin);
    nearVector(transformedRay.origin, [8, 2, 5]);
  });

  it("preserves interior triangle hits through seeded rotated, scaled and sheared frames", () => {
    const random = generator(0x5c4d210e);
    const a = new Vector3(0, 0, 0), b = new Vector3(2, 0, 0), c = new Vector3(0, 3, 0);
    for (let i = 0; i < 40; i++) {
      const u = 0.2 + random() * 0.2, v = 0.2 + random() * 0.2;
      const localHit = new Vector3(2 * u, 3 * v, 0);
      const ray = new Ray(new Vector3(localHit.x, localHit.y, 2), new Vector3(0, 0, -1));
      const rotation = new Quaternion().setFromEuler(new Euler(random(), random(), random(), orders[i % 6]!));
      const m = new Matrix4().compose(new Vector3(random(), -random(), random()), rotation,
        new Vector3(0.5 + random(), 0.5 + random(), 0.5 + random()))
        .multiply(new Matrix4().makeShear(0.2, -0.1, 0.15, 0.1, -0.2, 0.1));
      const transformedRay = ray.clone().applyMatrix4(m);
      const triangle = new Triangle(a.clone().applyMatrix4(m), b.clone().applyMatrix4(m), c.clone().applyMatrix4(m));
      const expected = localHit.clone().applyMatrix4(m);
      const hit = new Vector3();
      expect(transformedRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)).toBe(hit);
      nearVector(hit, [expected.x, expected.y, expected.z]);
      const weights = new Vector3();
      expect(triangle.getBarycoord(hit, weights)).toBe(weights);
      nearVector(weights, [1 - u - v, u, v]);
      expect(new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]).containsPoint(hit)).toBe(true);
      const plane = triangle.getPlane(new Plane());
      expect(transformedRay.intersectPlane(plane, hit)).toBe(hit);
      nearVector(hit, [expected.x, expected.y, expected.z]);
    }
  });

  it("retains target identity and source values during aliased geometric operations", () => {
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 0, -1));
    const origin = ray.origin, direction = ray.direction;
    expect(ray.set(direction, origin)).toBe(ray);
    expect(ray.origin).toBe(origin);
    expect(ray.direction).toBe(direction);
    nearVector(origin, [0, 0, -1]);
    nearVector(direction, [1, 2, 3]);

    const a = new Vector3(0, 0, 0), b = new Vector3(4, 0, 0), c = new Vector3(0, 4, 0);
    const target = new Vector3(4, 8, 12), other = new Vector3(8, 4, 0);
    // Barycentric weights are 1/2, 1/4, 1/4; target is also the first and third source.
    expect(Triangle.getInterpolation(new Vector3(1, 1, 0), a, b, c, target, other, target, target)).toBe(target);
    nearVector(target, [5, 7, 9]);
    nearVector(other, [8, 4, 0]);
    const geometricRay = new Ray(new Vector3(-5, 0, 0), new Vector3(2, 0, 0));
    const sphere = new Sphere(new Vector3(), 2);
    expect(geometricRay.intersectSphere(sphere, sphere.center)).toBe(sphere.center);
    nearVector(sphere.center, [-2, 0, 0]);
  });

  it("computes affine box extrema and a conservative transformed sphere", () => {
    const m = new Matrix4().set(2, 1, 0, 5, 0, 3, 1, -2, -1, 0, 2, 4, 0, 0, 0, 1);
    const box = new Box3(new Vector3(-2, -1, 0), new Vector3(1, 3, 2));
    const transformed = box.clone();
    expect(transformed.applyMatrix4(m)).toBe(transformed);
    // Minima and maxima follow directly from choosing the signed extrema in each row of M.
    nearVector(transformed.min, [0, -5, 3]);
    nearVector(transformed.max, [10, 9, 10]);
    const bound = new Sphere();
    expect(transformed.getBoundingSphere(bound)).toBe(bound);
    nearVector(bound.center, [5, 2, 6.5]);
    near(bound.radius, Math.sqrt(86.25));
    for (const x of [-2, 1]) for (const y of [-1, 3]) for (const z of [0, 2]) {
      const corner = new Vector3(x, y, z).applyMatrix4(m);
      expect(transformed.containsPoint(corner)).toBe(true);
      expect(corner.distanceTo(bound.center)).toBeLessThanOrEqual(bound.radius + 1e-10);
    }

    // For x' = x + 2y, y' = y, the largest singular value is 1 + sqrt(2).
    const shear = new Matrix4().makeShear(2, 0, 0, 0, 0, 0);
    const ball = new Sphere(new Vector3(), 1);
    expect(ball.applyMatrix4(shear)).toBe(ball);
    near(ball.radius, 1 + Math.SQRT2);
    const ratio = 1 + Math.SQRT2, norm = Math.hypot(1, ratio);
    const farthest = new Vector3(1 / norm, ratio / norm, 0).applyMatrix4(shear);
    near(farthest.length(), 1 + Math.SQRT2);
    expect(farthest.distanceTo(ball.center)).toBeLessThanOrEqual(ball.radius + 1e-10);
  });

  it("keeps sphere and ray hit points under rigid motion and uniform scale", () => {
    const sphere = new Sphere(new Vector3(0, 0, 0), 2);
    const ray = new Ray(new Vector3(-5, 0, 0), new Vector3(3, 0, 0));
    const hit = new Vector3();
    expect(ray.intersectSphere(sphere, hit)).toBe(hit);
    nearVector(hit, [-2, 0, 0]);
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    const m = new Matrix4().compose(new Vector3(7, -3, 4), q, new Vector3(3, 3, 3));
    const worldSphere = sphere.clone().applyMatrix4(m);
    const worldRay = ray.clone().applyMatrix4(m);
    nearVector(worldSphere.center, [7, -3, 4]);
    near(worldSphere.radius, 6);
    expect(worldRay.intersectSphere(worldSphere, hit)).toBe(hit);
    nearVector(hit, [7, -9, 4]);
    expect(worldRay.intersectsSphere(worldSphere)).toBe(true);
    near(hit.distanceTo(worldSphere.center), worldSphere.radius);
  });

  it("intersects an equivalent plane when its finite equation coefficients are very large", () => {
    // 1e308 * x - 1e308 = 0 and x - 1 = 0 describe the same plane. The
    // intermediate product at x = 2 overflows unless the equation is scaled.
    const plane = new Plane(new Vector3(1e308, 0, 0), -1e308);
    const ray = new Ray(new Vector3(2, 0, 0), new Vector3(-1, 0, 0));
    near(plane.distanceToPoint(ray.origin), 1);
    near(ray.distanceToPlane(plane)!, 1);
  });

  it("writes a finite intersection for a plane represented by large finite coefficients", () => {
    const plane = new Plane(new Vector3(1e308, 0, 0), -1e308);
    const ray = new Ray(new Vector3(2, 0, 0), new Vector3(-1, 0, 0));
    const hit = new Vector3();
    expect(ray.intersectPlane(plane, hit)).toBe(hit);
    nearVector(hit, [1, 0, 0]);
  });

  it("keeps box-plane and sphere-plane intersections invariant under plane equation rescaling", () => {
    const box = new Box3(new Vector3(2, -3, -1), new Vector3(3, -2, 1));
    const sphere = new Sphere(new Vector3(2.5, -2.5, 0), 0.1);
    for (const magnitude of [Number.MIN_VALUE, 1, 1e308]) {
      // x + y = 0 cuts both shapes, including the segment from (2, -2) to (3, -3).
      const plane = new Plane(new Vector3(magnitude, magnitude, 0), 0);
      expect(sphere.intersectsPlane(plane)).toBe(true);
      expect(box.intersectsPlane(plane)).toBe(true);
      expect(plane.intersectsBox(box)).toBe(true);
    }
  });

  it("keeps frustum point classification invariant under half-space equation rescaling", () => {
    const point = new Vector3(2.5, -2.4, 0); // x + y > 0, safely inside the half-space.
    for (const magnitude of [Number.MIN_VALUE, 1, 1e308]) {
      const frustum = repeatedHalfSpace(magnitude);
      expect(frustum.containsPoint(point)).toBe(true);
      expect(frustum.containsPoint(new Vector3(-2.5, 2.4, 0))).toBe(false);
    }
  });

  it("classifies a disjoint sphere consistently after half-space rescaling", () => {
    // The sphere is strictly on the negative side of x + y = 0.
    const sphere = new Sphere(new Vector3(-2.5, 2.4, 0), 0.01);
    for (const magnitude of [Number.MIN_VALUE, 1, 1e308]) {
      const frustum = repeatedHalfSpace(magnitude);
      expect(frustum.intersectsSphere(sphere)).toBe(false);
    }
  });

  it("classifies a disjoint box consistently after half-space rescaling", () => {
    const box = new Box3(new Vector3(2, -4, -0.1), new Vector3(2.5, -3, 0.1));
    for (const magnitude of [Number.MIN_VALUE, 1, 1e308]) {
      const frustum = repeatedHalfSpace(magnitude);
      expect(frustum.intersectsBox(box)).toBe(false);
    }
  });

  it("matches frustum classification to explicit camera-space inequalities", () => {
    const cameraPosition = new Vector3(3, -2, 1);
    const view = new Matrix4().makeTranslation(-3, 2, -1);
    const random = generator(0x721f4e33);
    const points: Triple[] = [[3, -2, -4], [3, -2, 0.5], [3, -2, -10], [9, -2, -4]];
    for (let i = 0; i < 150; i++) points.push([(random() - 0.5) * 30, (random() - 0.5) * 30, (random() - 0.5) * 30]);
    for (const depthRange of ["minus-one-to-one", "zero-to-one"] as const) {
      for (const reversed of [false, true]) {
        const projection = new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, 10, depthRange, reversed);
        const frustum = new Frustum().setFromProjectionMatrixDepthRange(projection.clone().multiply(view), depthRange, reversed);
        for (const [x, y, z] of points) {
          const cx = x - cameraPosition.x, cy = y - cameraPosition.y, cz = z - cameraPosition.z;
          const expected = cz <= -1 && cz >= -10 && Math.abs(cx) <= -cz && Math.abs(cy) <= -cz;
          expect(frustum.containsPoint(new Vector3(x, y, z))).toBe(expected);
        }
        const camera = {
          matrixWorldInverse: view, projectionMatrix: projection,
          matrixWorld: view.clone().invert(), projectionMatrixInverse: projection.clone().invert(),
        };
        const point = new Vector3(4, -1, -4);
        expect(point.project(camera)).toBe(point);
        nearVector(point, [0.2, 0.2, depthRange === "minus-one-to-one" ? (reversed ? -7 / 9 : 7 / 9) : (reversed ? 1 / 9 : 8 / 9)]);
        expect(point.unproject(camera)).toBe(point);
        nearVector(point, [4, -1, -4]);
      }
    }
  });

  it("retains the near plane and an infinite far distance in both depth ranges", () => {
    for (const depthRange of ["minus-one-to-one", "zero-to-one"] as const) {
      for (const reversed of [false, true]) {
        const projection = new Matrix4().makePerspectiveForDepthRange(-1, 1, 1, -1, 1, Infinity, depthRange, reversed);
        for (const homogeneousScale of [1, 1e-200, 1e200]) {
          const frustum = new Frustum().setFromProjectionMatrixDepthRange(projection.clone().multiplyScalar(homogeneousScale), depthRange, reversed);
          expect(frustum.containsPoint(new Vector3(0, 0, -0.5))).toBe(false);
          expect(frustum.containsPoint(new Vector3(0.2, 0.2, -2))).toBe(true);
          expect(frustum.containsPoint(new Vector3(0, 0, -1e12))).toBe(true);
          expect(frustum.containsPoint(new Vector3(3, 0, -2))).toBe(false);
        }
      }
    }
  });

  it("transforms projective plane equations and handles a box crossing the projective pole", () => {
    // x' = x/(z+1), y' = y/(z+1), z' = z/(z+1).
    const m = new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    const plane = new Plane(new Vector3(0, 0, 1), -1);
    const transformedPlane = plane.clone();
    expect(transformedPlane.applyMatrix4(m)).toBe(transformedPlane);
    nearVector(transformedPlane.normal, [0, 0, 1]);
    near(transformedPlane.constant, -0.5);
    for (const point of [[0, 0, 1], [4, -2, 1], [-3, 5, 1]] as Triple[]) {
      near(transformedPlane.distanceToPoint(vector(point).applyMatrix4(m)), 0);
    }
    transformedPlane.applyMatrix4(m.clone().invert());
    nearVector(transformedPlane.normal, [0, 0, 1]);
    near(transformedPlane.constant, -1);

    const box = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    expect(box.applyMatrix4(m)).toBe(box);
    expect(box.min.toArray()).toEqual([-Infinity, -Infinity, -Infinity]);
    expect(box.max.toArray()).toEqual([Infinity, Infinity, Infinity]);
    const sphere = new Sphere(new Vector3(1, 2, 3), 4);
    expect(() => sphere.applyMatrix4(m)).toThrow(RangeError);
    nearVector(sphere.center, [1, 2, 3]);
    near(sphere.radius, 4);
  });

  it("inverts very small and very large nonsingular 3D scales into a usable normal matrix", () => {
    // The inverse entries are representable even though the cubic determinant is not.
    for (const magnitude of [1e-150, 1e150]) {
      const affine = new Matrix4().makeScale(magnitude, magnitude, magnitude);
      const inverse4 = affine.clone().invert();
      near(inverse4.elements[0]! * magnitude, 1);
      const inverse3 = new Matrix3().setFromMatrix4(affine).invert();
      near(inverse3.elements[0]! * magnitude, 1);
      near(inverse3.elements[4]! * magnitude, 1);
      near(inverse3.elements[8]! * magnitude, 1);
      const normal = new Vector3(1, 2, -2).applyNormalMatrix(new Matrix3().getNormalMatrix(affine));
      nearVector(normal, [1 / 3, 2 / 3, -2 / 3]);
    }
  });

  it("returns finite, defined results for zero scales, singular matrices and empty bounds", () => {
    const zeroVector = new Vector3();
    expect(zeroVector.normalize()).toBe(zeroVector);
    nearVector(zeroVector, [0, 0, 0]);
    for (const magnitude of [1e-300, 1e300]) {
      const direction = new Vector3(magnitude, -2 * magnitude, 2 * magnitude).normalize();
      nearVector(direction, [1 / 3, -2 / 3, 2 / 3]);
    }
    const singular = new Matrix4().makeScale(1, 0, 2);
    expect(singular.invert()).toBe(singular);
    nearElements(singular.elements, new Array(16).fill(0));
    const transform = new Matrix4().compose(new Vector3(1, 2, 3), new Quaternion(), new Vector3(2, 0, 4));
    const position = new Vector3(), rotation = new Quaternion(1, 2, 3, 4), scale = new Vector3();
    expect(transform.decompose(position, rotation, scale)).toBe(transform);
    nearVector(position, [1, 2, 3]);
    nearVector(scale, [2, 0, 4]);
    nearElements(rotation.toArray(), [0, 0, 0, 1]);
    const emptyBox = new Box3();
    const emptySphere = new Sphere();
    expect(emptyBox.applyMatrix4(transform).isEmpty()).toBe(true);
    expect(emptySphere.applyMatrix4(transform).isEmpty()).toBe(true);
    expect(emptyBox.intersectsSphere(emptySphere)).toBe(false);
    expect(new Ray().intersectBox(emptyBox, new Vector3())).toBeNull();
    expect(new Ray().intersectSphere(emptySphere, new Vector3())).toBeNull();
  });
});
