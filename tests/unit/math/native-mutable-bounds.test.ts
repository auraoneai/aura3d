import { describe, expect, it } from "vitest";
import { Box3 } from "../../../packages/math/src/independent/mutable/Box3.js";
import { Plane } from "../../../packages/math/src/independent/mutable/Plane.js";
import { Sphere } from "../../../packages/math/src/independent/mutable/Sphere.js";
import { Vector3 } from "../../../packages/math/src/independent/mutable/Vector3.js";
import { Matrix3 } from "../../../packages/math/src/independent/mutable/Matrix3.js";
import { Matrix4 } from "../../../packages/math/src/independent/mutable/Matrix4.js";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

function expectPoint(point: { x: number; y: number; z: number }, x: number, y: number, z: number) {
  expect(point.x).toBeCloseTo(x, 10);
  expect(point.y).toBeCloseTo(y, 10);
  expect(point.z).toBeCloseTo(z, 10);
}

function line(start: Vector3, end: Vector3) {
  return { start, end, delta: (target: Vector3) => target.subVectors(end, start) };
}

describe("independent mutable bounds", () => {
  it("treats an empty sphere differently from a zero-radius point", () => {
    // unified 4.x contract: queries compare squared distances with the squared radius and do not special-case an
    // empty (negative-radius) sphere; isEmpty() is the way to test for emptiness.
    const sphere = new Sphere();
    const point = v(2, -1, 3);
    expect(sphere.isEmpty()).toBe(true);
    expect(sphere.containsPoint(point)).toBe(false);
    expect(sphere.distanceToPoint(point)).toBeCloseTo(Math.hypot(2, 1, 3) + 1, 12);
    expect(sphere.intersectsSphere(new Sphere(point, 10))).toBe(true);
    expect(sphere.getBoundingBox(new Box3()).isEmpty()).toBe(true);
    const center = sphere.center;
    expect(sphere.expandByPoint(point)).toBe(sphere);
    expect(sphere.center).toBe(center);
    expect(sphere.radius).toBe(0);
    expect(sphere.containsPoint(point)).toBe(true);
    expect(sphere.intersectsSphere(new Sphere(point.clone(), 0))).toBe(true);
    sphere.makeEmpty();
    expect(sphere.center).toBe(center);
    expectPoint(center, 0, 0, 0);
  });

  it("fits points, honors an explicit center, and snapshots aliased center inputs", () => {
    const sphere = new Sphere(v(10, 0, 0), 2);
    const center = sphere.center;
    sphere.setFromPoints([center, v(-2, 4, 6), v(2, -4, -6)]);
    expect(sphere.center).toBe(center);
    expectPoint(center, 4, 0, 0);
    expect(sphere.radius).toBeCloseTo(Math.sqrt(88), 10);
    sphere.setFromPoints([v(2, 0, 0), v(5, 0, 0)], center);
    expectPoint(center, 4, 0, 0);
    expect(sphere.radius).toBe(2);
    sphere.setFromPoints([]);
    // unified 4.x contract: no points give a zero-radius sphere at the origin (the box center of nothing), not an empty one.
    expect(sphere.isEmpty()).toBe(false);
    expect(sphere.radius).toBe(0);
    expectPoint(center, 0, 0, 0);
    expect(sphere.set(v(1, 2, 3), 4).copy({ center: v(-1, 0, 1), radius: 2 })).toBe(sphere);
    expect(sphere.equals({ center: v(-1, 0, 1), radius: 2 })).toBe(true);
    const clone = sphere.clone();
    expect(clone).not.toBe(sphere);
    expect(clone.center).not.toBe(sphere.center);
    expect(clone.equals(sphere)).toBe(true);
    const roundTrip = new Sphere().fromImmutable(sphere.toImmutable());
    expect(roundTrip.equals(sphere)).toBe(true);
    expect(new Sphere().fromJSON(sphere.toJSON()).equals(sphere)).toBe(true);
  });

  it("grows and joins balls using the extremal points along their centers", () => {
    const sphere = new Sphere(v(0, 0, 0), 1);
    sphere.expandByPoint(v(5, 0, 0));
    expectPoint(sphere.center, 2, 0, 0);
    expect(sphere.radius).toBe(3);
    expect(sphere.containsPoint(v(-1, 0, 0))).toBe(true);
    expect(sphere.containsPoint(v(5, 0, 0))).toBe(true);
    sphere.union(new Sphere(v(9, 0, 0), 1));
    expectPoint(sphere.center, 4.5, 0, 0);
    expect(sphere.radius).toBe(5.5);
    expect(sphere.containsPoint(v(-1, 0, 0))).toBe(true);
    expect(sphere.containsPoint(v(10, 0, 0))).toBe(true);
    const snapshot = sphere.clone();
    sphere.union(new Sphere(v(4.5, 0, 0), 1)).union(sphere).union(new Sphere());
    expect(sphere.equals(snapshot)).toBe(true);
    const larger = new Sphere(v(4.5, 0, 0), 10);
    sphere.union(larger);
    expect(sphere.equals(larger)).toBe(true);
    expect(new Sphere().union(larger).equals(larger)).toBe(true);
  });

  it("includes tangencies, projects into the ball, and safely aliases its target", () => {
    const sphere = new Sphere(v(1, 2, 3), 2);
    const box = new Box3(v(3, 1, 2), v(4, 3, 4));
    // unified 4.x contract: the plane distance is read as written, so the tangent plane z = 5 has a unit normal.
    const tangentPlane = new Plane(v(0, 0, 1), -5);
    expect(sphere.intersectsBox(box)).toBe(true);
    expect(box.intersectsSphere(sphere)).toBe(true);
    expect(sphere.intersectsPlane(tangentPlane)).toBe(true);
    expect(tangentPlane.intersectsSphere(sphere)).toBe(true);
    expect(sphere.intersectsSphere(new Sphere(v(5, 2, 3), 2))).toBe(true);
    expect(sphere.intersectsSphere(new Sphere(v(5.01, 2, 3), 2))).toBe(false);
    expect(sphere.distanceToPoint(v(1, 2, 3))).toBe(-2);
    const point = v(5, 2, 3);
    expect(sphere.clampPoint(point, point)).toBe(point);
    expectPoint(point, 3, 2, 3);
    const center = sphere.center;
    sphere.clampPoint(v(1, 7, 3), center);
    expectPoint(center, 1, 4, 3);
    const shared = v(1, 2, 3);
    const aliasSphere = new Sphere(shared, 2);
    const aliasBox = new Box3(shared, v(0, 0, 0));
    expect(aliasSphere.getBoundingBox(aliasBox)).toBe(aliasBox);
    expectPoint(aliasBox.min, -1, 0, 1);
    expectPoint(aliasBox.max, 3, 4, 5);
    const commonCorner = v(0, 0, 0);
    const collapsed = new Box3(commonCorner, commonCorner);
    new Sphere(v(1, 2, 3), 2).getBoundingBox(collapsed);
    expect(collapsed.min).toBe(commonCorner);
    expect(collapsed.max).not.toBe(commonCorner);
    expectPoint(collapsed.min, -1, 0, 1);
    expectPoint(collapsed.max, 3, 4, 5);
  });

  it("transforms center and radius and retains emptiness under collapsed scale", () => {
    const matrix = {
      elements: [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, -2, 1, 1],
      getMaxScaleOnAxis: () => 4
    };
    const sphere = new Sphere(v(1, 2, 3), 2);
    const center = sphere.center;
    expect(sphere.applyMatrix4(matrix)).toBe(sphere);
    expect(sphere.center).toBe(center);
    expectPoint(center, -1, 0, 13);
    expect(sphere.radius).toBe(8);
    sphere.translate(center);
    expectPoint(center, -2, 0, 26);
    const empty = new Sphere();
    empty.applyMatrix4(matrix);
    expect(empty.isEmpty()).toBe(true);
    // unified 4.x contract: the radius is multiplied by the axis scale, so a zero scale turns -1 into -0, which is not empty.
    empty.makeEmpty().applyMatrix4({ elements: matrix.elements, getMaxScaleOnAxis: () => 0 });
    expect(empty.isEmpty()).toBe(false);
  });

  it("scales the radius by the matrix's largest axis scale and applies the homogeneous divide to the center only", () => {
    // unified 4.x contract: radius *= matrix.getMaxScaleOnAxis(); the center is transformed as a point. The radius is
    // therefore neither a singular-value enclosure of shear nor affected by a projective or homogeneous scale.
    const sphere = new Sphere(v(0, 0, 0), 1);
    // x' = x + y and y' = y.
    const shear = { elements: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], getMaxScaleOnAxis: () => Math.SQRT2 };
    sphere.applyMatrix4(shear);
    expect(sphere.radius).toBeCloseTo(Math.SQRT2, 12);
    const projective = new Sphere(v(1, 2, 3), 2);
    projective.applyMatrix4({
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
      getMaxScaleOnAxis: () => 1
    });
    expectPoint(projective.center, 0.25, 0.5, 0.75);
    expect(projective.radius).toBe(2);
    const homogeneous = new Sphere(v(0, 0, 0), 1);
    homogeneous.applyMatrix4({
      elements: [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 6, 0, 0, 0, 0, 2],
      getMaxScaleOnAxis: () => 6
    });
    expect(homogeneous.radius).toBe(6);
    for (const [inputRadius, scale, homogeneousScale, expected] of [
      [1e100, 1e100, 1e200, 1e200],
      [1e300, 1e-300, 1e300, 1],
      [1e-300, 1e300, 1e-300, 1]
    ]) {
      const extreme = new Sphere(v(0, 0, 0), inputRadius).applyMatrix4({
        elements: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, homogeneousScale],
        getMaxScaleOnAxis: () => scale
      });
      expect(extreme.radius / expected).toBeCloseTo(1, 12);
    }
    const homogeneousCenter = new Sphere(v(1, 2, 3), 1).applyMatrix4({
      elements: [1e-3, 0, 0, 0, 0, 1e-3, 0, 0, 0, 0, 1e-3, 0, 1e-3, 0, 0, 1e-3],
      getMaxScaleOnAxis: () => 1e-3
    });
    expectPoint(homogeneousCenter.center, 2, 2, 3);
    expect(homogeneousCenter.radius).toBe(1e-3);
    const allPoints = new Sphere(v(0, 0, 0), Infinity).applyMatrix4({
      elements: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 1],
      getMaxScaleOnAxis: () => 0
    });
    expectPoint(allPoints.center, 3, 4, 5);
    expect(allPoints.radius).toBeNaN(); // Infinity * 0
  });

  it("constructs boxes from points, arrays and attributes and preserves output references", () => {
    const box = new Box3();
    const min = box.min, max = box.max;
    expect(box.isEmpty()).toBe(true);
    box.setFromArray([3, -1, 4, -2, 5, 0, 1, 2, 7]);
    expect(box.min).toBe(min);
    expect(box.max).toBe(max);
    expectPoint(min, -2, -1, 0);
    expectPoint(max, 3, 5, 7);
    const p = [v(-3, 0, 1), v(4, 2, -2)];
    box.setFromBufferAttribute({ count: p.length, getX: i => p[i].x, getY: i => p[i].y, getZ: i => p[i].z });
    expectPoint(min, -3, 0, -2);
    expectPoint(max, 4, 2, 1);
    box.setFromPoints([max, v(-4, -1, -2)]);
    expectPoint(min, -4, -1, -2);
    expectPoint(max, 4, 2, 1);
    const target = v(0, 0, 0);
    expect(box.getCenter(target)).toBe(target);
    expectPoint(target, 0, 0.5, -0.5);
    expect(box.getSize(target)).toBe(target);
    expectPoint(target, 8, 3, 3);
    expect(box.getParameter(v(0, 0.5, -0.5), target)).toBe(target);
    expectPoint(target, 0.5, 0.5, 0.5);
    box.setFromCenterAndSize(v(1, 2, 3), v(4, 6, 8));
    expectPoint(min, -1, -1, -1);
    expectPoint(max, 3, 5, 7);
    expect(box.containsPoint(v(3, 5, 7))).toBe(true);
    expect(box.containsBox(new Box3(v(0, 0, 0), v(2, 4, 6)))).toBe(true);
    expect(box.containsPoint(v(3.01, 5, 7))).toBe(false);
    expect(box.clone().equals(box)).toBe(true);
    expect(new Box3().fromImmutable(box.toImmutable()).equals(box)).toBe(true);
    expect(new Box3().fromJSON(box.toJSON()).equals(box)).toBe(true);
  });

  it("uses closed boundaries for box, sphere, plane and triangle intersections", () => {
    const box = new Box3(v(-1, -1, -1), v(1, 1, 1));
    expect(box.intersectsBox(new Box3(v(1, -2, -2), v(3, 2, 2)))).toBe(true);
    expect(box.intersectsBox(new Box3(v(1.01, -2, -2), v(3, 2, 2)))).toBe(false);
    expect(box.intersectsSphere(new Sphere(v(2, 0, 0), 1))).toBe(true);
    expect(box.intersectsSphere(new Sphere(v(2.01, 0, 0), 1))).toBe(false);
    // unified 4.x contract: a negative radius is not special-cased (the squared radius is compared).
    expect(box.intersectsSphere(new Sphere(v(0, 0, 0), -1))).toBe(true);
    expect(box.intersectsPlane(new Plane(v(3, 0, 0), -3))).toBe(true);
    expect(box.intersectsPlane(new Plane(v(3, 0, 0), -3.1))).toBe(false);
    const tri = (a: Vector3, b: Vector3, c: Vector3) => ({ a, b, c });
    expect(box.intersectsTriangle(tri(v(2, 0, 0), v(0, 2, 0), v(2, 2, 0)))).toBe(true);
    expect(box.intersectsTriangle(tri(v(3, 0, 0), v(0, 3, 0), v(3, 3, 0)))).toBe(false);
    expect(box.intersectsTriangle(tri(v(0, 0, 0), v(0, 0, 0), v(0, 0, 0)))).toBe(true);
    expect(box.intersectsTriangle(tri(v(2, 2, 2), v(2, 2, 2), v(2, 2, 2)))).toBe(false);
    box.makeEmpty();
    expect(box.intersectsTriangle(tri(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)))).toBe(false);
    expect(box.intersectsBox(new Box3(v(-1, -1, -1), v(1, 1, 1)))).toBe(false);
  });

  it("classifies plane contacts independently of equation magnitude and overflow", () => {
    const crossing = new Box3(v(2, -3, -1), v(3, -2, 1));
    const separated = new Box3(v(4, -3, -1), v(5, -2, 1));
    for (const scale of [Number.MIN_VALUE, 1e-308, 1, 1e308]) {
      const plane = { normal: v(scale, scale, 0), constant: 0 };
      expect(crossing.intersectsPlane(plane)).toBe(true);
      expect(separated.intersectsPlane(plane)).toBe(false);
    }
    const tangent = new Box3(v(-2, 0, -1), v(-1, 1, 1));
    for (const scale of [1e-300, 1, 1e308]) {
      expect(tangent.intersectsPlane({ normal: v(scale, 0, 0), constant: scale })).toBe(true);
      expect(tangent.intersectsPlane({ normal: v(scale, 0, 0), constant: -scale })).toBe(false);
    }
    // A dominant normal component on a fixed zero coordinate must not erase
    // the much smaller component that actually intersects this box.
    const disparate = new Box3(v(0, 5e307, 0), v(0, 1.5e308, 0));
    expect(disparate.intersectsPlane({ normal: v(1e308, 1e-308, 0), constant: -1 })).toBe(true);
    expect(disparate.intersectsPlane({ normal: v(1e308, 1e-308, 0), constant: -2 })).toBe(false);
    const cancellation = new Box3(v(1e308, -1e308, 1), v(1e308, -1e308, 1));
    expect(cancellation.intersectsPlane({ normal: v(1e308, 1e308, 1), constant: -1 })).toBe(true);
    expect(cancellation.intersectsPlane({ normal: v(1e308, 1e308, 1), constant: -2 })).toBe(false);
    const unbounded = new Box3(v(0, -Infinity, 0), v(0, Infinity, 0));
    expect(unbounded.intersectsPlane({ normal: v(1e308, Number.MIN_VALUE, 0), constant: 1e308 })).toBe(true);
    expect(crossing.intersectsPlane({ normal: v(0, 0, 0), constant: 0 })).toBe(true);
    expect(crossing.intersectsPlane({ normal: v(0, 0, 0), constant: 1 })).toBe(false);
  });

  it("clamps and combines boxes with alias-safe output and translation", () => {
    const box = new Box3(v(-1, -2, -3), v(3, 4, 5));
    const point = v(9, 0, -8);
    expect(box.clampPoint(point, point)).toBe(point);
    expectPoint(point, 3, 0, -3);
    expect(box.distanceToPoint(v(6, 8, 5))).toBe(5);
    const sphere = new Sphere();
    expect(box.getBoundingSphere(sphere)).toBe(sphere);
    expectPoint(sphere.center, 1, 1, 1);
    expect(sphere.radius).toBeCloseTo(Math.sqrt(29), 10);
    const other = new Box3(v(2, 3, 4), v(9, 10, 11));
    expect(box.clone().intersect(other).equals(new Box3(v(2, 3, 4), v(3, 4, 5)))).toBe(true);
    expect(box.clone().union(other).equals(new Box3(v(-1, -2, -3), v(9, 10, 11)))).toBe(true);
    expect(box.clone().intersect(new Box3(v(20, 20, 20), v(30, 30, 30))).isEmpty()).toBe(true);
    box.expandByPoint(v(-2, -3, -4)).expandByVector(v(1, 2, 3)).expandByScalar(1);
    expectPoint(box.min, -4, -6, -8);
    expectPoint(box.max, 5, 7, 9);
    const offset = box.min;
    box.translate(offset);
    expectPoint(box.min, -8, -12, -16);
    expectPoint(box.max, 1, 1, 1);
  });

  it("transforms all box corners when axes rotate and reflect", () => {
    const box = new Box3(v(-1, -2, -3), v(2, 3, 4));
    // x' = -2y + 10, y' = 3x - 4, z' = -z + 2.
    box.applyMatrix4({ elements: [0, 3, 0, 0, -2, 0, 0, 0, 0, 0, -1, 0, 10, -4, 2, 1] });
    expectPoint(box.min, 4, -7, -2);
    expectPoint(box.max, 14, 2, 5);
    expect(new Box3().applyMatrix4({ elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }).isEmpty()).toBe(true);
  });

  it("projects box corners as given and keeps unbounded boxes for queries", () => {
    // unified 4.x contract: applyMatrix4 projects the eight corners and bounds them; a projective pole is not detected.
    // w = z, so z' = 1 and x' = x / z, y' = y / z.
    const projective = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0] };
    const crossing = new Box3(v(-1, -1, -1), v(1, 1, 1));
    const min = crossing.min, max = crossing.max;
    crossing.applyMatrix4(projective);
    expect(crossing.min).toBe(min);
    expect(crossing.max).toBe(max);
    expect([min.x, min.y, min.z]).toEqual([-1, -1, 1]);
    expect([max.x, max.y, max.z]).toEqual([1, 1, 1]);
    const touching = new Box3(v(-1, -1, 0), v(1, 1, 1));
    touching.applyMatrix4(projective); // the z = 0 corners divide by zero
    expect([touching.min.x, touching.min.y, touching.min.z, touching.max.x, touching.max.y, touching.max.z]
      .some(value => !Number.isFinite(value))).toBe(true);
    // Unbounded boxes are still handled by the query methods.
    for (const box of [new Box3(v(-Infinity, -Infinity, -Infinity), v(Infinity, Infinity, Infinity))]) {
      const center = box.getCenter(v(1, 1, 1));
      expectPoint(center, 0, 0, 0);
      const enclosingSphere = box.getBoundingSphere(new Sphere());
      expectPoint(enclosingSphere.center, 0, 0, 0);
      expect(enclosingSphere.radius).toBe(Infinity);
      expect(enclosingSphere.getBoundingBox(new Box3()).equals(box)).toBe(true);
      expect(box.intersectsTriangle({ a: v(10, 10, 10), b: v(11, 10, 10), c: v(10, 11, 10) })).toBe(true);
    }
    const halfSpace = new Box3(v(0, -Infinity, -Infinity), v(Infinity, Infinity, Infinity));
    expect(halfSpace.intersectsTriangle({ a: v(-2, 0, 0), b: v(-1, 1, 0), c: v(-1, 0, 1) })).toBe(false);
    expect(halfSpace.intersectsTriangle({ a: v(0, 0, 0), b: v(-1, 1, 0), c: v(-1, 0, 1) })).toBe(true);
  });

  it("collects object bounds recursively and can inspect deformed positions", () => {
    const positions = [v(0, 0, 0), v(2, 1, 0)];
    const attribute = { count: positions.length, getX: (i: number) => positions[i].x,
      getY: (i: number) => positions[i].y, getZ: (i: number) => positions[i].z };
    let updates = 0, computes = 0;
    const geometry = {
      boundingBox: null as Box3 | null,
      getAttribute: (name: string) => name === "position" ? attribute : undefined,
      computeBoundingBox() { computes++; this.boundingBox = new Box3(v(0, 0, 0), v(2, 1, 0)); }
    };
    const child = {
      updateWorldMatrix: () => { updates++; }, matrixWorld: new Matrix4().makeTranslation(0, 3, 0),
      children: [], geometry
    };
    const root = {
      updateWorldMatrix: () => { updates++; }, matrixWorld: new Matrix4().makeTranslation(10, 0, 0),
      children: [child], geometry, isMesh: true,
      getVertexPosition: (index: number, target: Vector3) => target.set(positions[index].x, positions[index].y, 2)
    };
    const coarse = new Box3().setFromObject(root);
    expect(computes).toBe(1);
    expect(updates).toBe(2);
    expectPoint(coarse.min, 0, 0, 0);
    expectPoint(coarse.max, 12, 4, 0);
    const precise = new Box3().setFromObject(root, true);
    expectPoint(precise.min, 0, 0, 0);
    expectPoint(precise.max, 12, 4, 2);
    precise.expandByObject(root, true);
    expectPoint(precise.max, 12, 4, 2);
  });

  it("preserves containment under seeded sphere unions and affine box maps", () => {
    let state = 0x14d392ab;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    const coordinate = () => random() * 20 - 10;
    for (let sample = 0; sample < 100; sample++) {
      const a = new Sphere(v(coordinate(), coordinate(), coordinate()), random() * 3);
      const b = new Sphere(v(coordinate(), coordinate(), coordinate()), random() * 3);
      const union = a.clone().union(b);
      for (const source of [a, b]) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, -1]]) {
        const x = source.center.x + dx * source.radius, y = source.center.y + dy * source.radius, z = source.center.z + dz * source.radius;
        expect(Math.hypot(x - union.center.x, y - union.center.y, z - union.center.z)).toBeLessThanOrEqual(union.radius + 1e-12);
      }
      const minimum = v(coordinate(), coordinate(), coordinate());
      const maximum = v(minimum.x + random() * 3, minimum.y + random() * 3, minimum.z + random() * 3);
      const box = new Box3(minimum.clone(), maximum.clone());
      const e = [1, 0.3, 0, 0, -0.4, 2, 0.2, 0, 0, 0.5, -1, 0, 2, -3, 4, 1];
      box.applyMatrix4({ elements: e });
      for (const x of [minimum.x, maximum.x]) for (const y of [minimum.y, maximum.y]) for (const z of [minimum.z, maximum.z]) {
        const px = x - 0.4 * y + 2, py = 0.3 * x + 2 * y + 0.5 * z - 3, pz = 0.2 * y - z + 4;
        expect(px).toBeGreaterThanOrEqual(box.min.x - 1e-12); expect(px).toBeLessThanOrEqual(box.max.x + 1e-12);
        expect(py).toBeGreaterThanOrEqual(box.min.y - 1e-12); expect(py).toBeLessThanOrEqual(box.max.y + 1e-12);
        expect(pz).toBeGreaterThanOrEqual(box.min.z - 1e-12); expect(pz).toBeLessThanOrEqual(box.max.z + 1e-12);
      }
    }
  });

  it("bounds mapped sphere surface samples by the largest column length across varied affine shears", () => {
    // unified 4.x contract: radius *= getMaxScaleOnAxis(), the largest column length. Under shear that is not an
    // enclosure, but the Frobenius norm bounds every image by sqrt(3) times it.
    let state = 0xc871af42;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let sample = 0; sample < 80; sample++) {
      const linear = Array.from({ length: 9 }, () => random() * 8 - 4);
      const elements = [linear[0], linear[1], linear[2], 0, linear[3], linear[4], linear[5], 0,
        linear[6], linear[7], linear[8], 0, 0, 0, 0, 1];
      const matrix = new Matrix4().fromArray(elements);
      const sphere = new Sphere(v(0, 0, 0), 1).applyMatrix4(matrix);
      expect(sphere.radius).toBe(matrix.getMaxScaleOnAxis());
      for (let direction = 0; direction < 24; direction++) {
        let x = random() * 2 - 1, y = random() * 2 - 1, z = random() * 2 - 1;
        const length = Math.hypot(x, y, z);
        x /= length; y /= length; z /= length;
        const tx = linear[0] * x + linear[3] * y + linear[6] * z;
        const ty = linear[1] * x + linear[4] * y + linear[7] * z;
        const tz = linear[2] * x + linear[5] * y + linear[8] * z;
        expect(Math.hypot(tx, ty, tz)).toBeLessThanOrEqual(Math.sqrt(3) * sphere.radius + 1e-12);
      }
    }
  });
});

describe("independent mutable planes", () => {
  it("measures and projects for a non-unit normal and supports aliased targets", () => {
    const normal = v(0, 0, 5);
    const plane = new Plane(normal, -10);
    expect(plane.normal).toBe(normal);
    // unified 4.x contract: normal . p + constant is read as written, so a non-unit normal scales the result.
    expect(plane.distanceToPoint(v(3, 4, 7))).toBeCloseTo(25, 10);
    expect(plane.coplanarPoint(v(0, 0, 0)).z).toBeCloseTo(50, 10);
    expect(plane.distanceToSphere(new Sphere(v(0, 0, 5), 1))).toBeCloseTo(14, 10);
    plane.normalize();
    expect(plane.distanceToPoint(v(3, 4, 7))).toBeCloseTo(5, 10);
    const point = v(3, 4, 7);
    expect(plane.projectPoint(point, point)).toBe(point);
    expectPoint(point, 3, 4, 2);
    const target = v(0, 0, 0);
    expect(plane.coplanarPoint(target)).toBe(target);
    expectPoint(target, 0, 0, 2);
    expect(plane.distanceToSphere(new Sphere(v(0, 0, 5), 1))).toBeCloseTo(2, 10);
    expect(plane.normal).toBe(normal);
    expectPoint(normal, 0, 0, 1);
    expect(plane.constant).toBe(-2);
    const copy = new Plane().fromImmutable(plane.toImmutable());
    expect(copy.equals(plane)).toBe(true);
    expect(plane.clone().equals(plane)).toBe(true);
    expect(plane.negate().distanceToPoint(v(0, 0, 3))).toBe(-1);
  });

  it("intersects crossing, coplanar and endpoint-touching segments", () => {
    const plane = new Plane(v(2, 0, 0), -4);
    const target = v(0, 0, 0);
    const crossing = line(v(0, 1, 0), v(4, 3, 0));
    expect(plane.intersectsLine(crossing)).toBe(true);
    expect(plane.intersectLine(crossing, target)).toBe(target);
    expectPoint(target, 2, 2, 0);
    const endpoint = line(v(2, 0, 0), v(5, 0, 0));
    expect(plane.intersectsLine(endpoint)).toBe(false); // unified 4.x contract: only a strict sign change counts
    expect(plane.intersectLine(endpoint, target)).toBe(target);
    expectPoint(target, 2, 0, 0);
    const parallel = line(v(0, 0, 0), v(0, 1, 0));
    expect(plane.intersectsLine(parallel)).toBe(false);
    expect(plane.intersectLine(parallel, target)).toBeNull();
    const coplanar = line(v(2, 1, 1), v(2, 2, 2));
    expect(plane.intersectsLine(coplanar)).toBe(false); // unified 4.x contract: touching is not crossing
    expect(plane.intersectLine(coplanar, target)).toBe(target);
    expectPoint(target, 2, 1, 1);
    const short = line(v(0, 0, 0), v(1, 0, 0));
    expect(plane.intersectLine(short, target, true)).toBeNull();
    expect(plane.intersectLine(short, target, false)).toBe(target);
    expectPoint(target, 2, 0, 0);
    expect(plane.intersectLine(crossing, crossing.start)).toBe(crossing.start);
    expectPoint(crossing.start, 2, 2, 0);
  });

  it("derives oriented planes, including collinear input, with no source alias loss", () => {
    const first = v(1, 0, 0);
    const plane = new Plane(first, 0);
    plane.setFromCoplanarPoints(first, v(1, 2, 0), v(1, 0, 3));
    expectPoint(plane.normal, 1, 0, 0);
    expect(plane.constant).toBe(-1);
    plane.setFromNormalAndCoplanarPoint(v(0, 3, 0), v(1, 4, 5));
    expect(plane.distanceToPoint(v(7, 4, 9))).toBe(0);
    plane.translate(v(0, 2, 0));
    expect(plane.distanceToPoint(v(7, 6, 9))).toBe(0);
    plane.setFromCoplanarPoints(v(0, 0, 0), v(1, 1, 1), v(2, 2, 2));
    expectPoint(plane.normal, 0, 0, 0);
    expect(plane.constant).toBe(0);
    expect(plane.intersectsLine(line(v(1, 2, 3), v(2, 3, 4)))).toBe(false); // unified 4.x contract: no strict sign change
  });

  it("maps plane geometry through affine and projective transforms", () => {
    // unified 4.x contract: plane transforms read the equation as written, so the plane x + y = 1 is given a unit normal.
    const plane = new Plane(v(1, 1, 0), -1).normalize();
    const normal = plane.normal;
    plane.applyMatrix4({ elements: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 10, -2, 4, 1] });
    expect(plane.normal).toBe(normal);
    expect(plane.distanceToPoint(v(12, -2, 4))).toBeCloseTo(0, 10);
    expect(plane.distanceToPoint(v(10, 1, 4))).toBeCloseTo(0, 10);
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 10);
    const projective = new Plane(v(1, 0, 0), -1);
    // unified 4.x contract: only the linear part maps the normal and one transformed point fixes the offset; the
    // projective row is not inverted, so the plane x = 1 through (1, 0, 0) is unchanged by x' = x / (1 + z).
    projective.applyMatrix4({ elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1] });
    expectPoint(projective.normal, 1, 0, 0);
    expect(projective.distanceToPoint(v(1, 0, 0))).toBeCloseTo(0, 10);
    // A singular matrix is not rejected: its normal matrix is zero, so the plane becomes non-finite.
    expect(() => plane.applyMatrix4({ elements: Array(16).fill(0) })).not.toThrow();
    expect(Number.isFinite(plane.normal.x + plane.constant)).toBe(false);
  });

  it("accepts a supplied normal matrix and treats degenerate plane equations explicitly", () => {
    const transform = { elements: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 10, -2, 4, 1] };
    const normalMatrix = new Matrix3().set(0.5, 0, 0, 0, 1 / 3, 0, 0, 0, 1);
    const automatic = new Plane(v(1, 1, 0), -1).applyMatrix4(transform);
    const supplied = new Plane(v(1, 1, 0), -1).applyMatrix4(transform, normalMatrix);
    expectPoint(supplied.normal, automatic.normal.x, automatic.normal.y, automatic.normal.z);
    expect(supplied.constant).toBeCloseTo(automatic.constant, 10);
    const all = new Plane(v(0, 0, 0), 0);
    const empty = new Plane(v(0, 0, 0), 1);
    const target = v(0, 0, 0);
    expect(all.distanceToPoint(v(2, 4, 6))).toBe(0);
    // unified 4.x contract: a zero normal is not special-cased; the distance is just the constant.
    expect(empty.distanceToPoint(v(2, 4, 6))).toBe(1);
    expect(new Sphere(v(0, 0, 0), Infinity).intersectsPlane(all)).toBe(true);
    expect(new Sphere(v(0, 0, 0), Infinity).intersectsPlane(empty)).toBe(true);
    expectPoint(all.projectPoint(v(2, 4, 6), target), 2, 4, 6);
    expectPoint(empty.projectPoint(v(2, 4, 6), target), 2, 4, 6);
    expect(() => all.toImmutable()).toThrow();
  });
});
