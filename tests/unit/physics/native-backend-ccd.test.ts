import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody, type RigidBodyDescriptor } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeCastPair, type NativeCCDMotion } from "../../../packages/physics/src/native/NativeCCD.js";
import { setNativeMassProperties } from "../../../packages/physics/src/native/NativeMassProperties.js";

function motion(id: number, shape: PhysicsShape, descriptor: RigidBodyDescriptor = {}, displacement: Vec3 = [0, 0, 0], angularDisplacement: Vec3 = [0, 0, 0]): NativeCCDMotion {
  const body = new RigidBody(id, descriptor);
  return { body, collider: new Collider(id, id, { shape }), displacement, angularDisplacement };
}

function contact(a: NativeCCDMotion, b: NativeCCDMotion) {
  const result = nativeCastPair(a, b);
  expect(result.kind).toBe("contact");
  if (result.kind !== "contact") throw new Error("Expected CCD contact.");
  return result;
}

function near(actual: Vec3, expected: Vec3, precision = 8) {
  for (let axis = 0; axis < 3; axis++) expect(actual[axis]).toBeCloseTo(expected[axis]!, precision);
}

describe("isolated analytic native CCD", () => {
  it("uses both translations and reports the impact point in world coordinates", () => {
    const a = motion(1, Shape.sphere(0.5), { position: [-3, 0, 0] }, [4, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), { position: [3, 0, 0] }, [-4, 0, 0]);
    const result = contact(a, b);
    expect(result.fraction).toBeCloseTo(5 / 8, 10);
    expect(result.exitFraction).toBeCloseTo(7 / 8, 10);
    expect(result.initial).toBe("separated");
    expect(result.motion).toBe("entering");
    near(result.normal, [1, 0, 0]);
    near(result.point, [0, 0, 0]);
    expect(a.body.position).toEqual([-3, 0, 0]);
    expect(b.body.position).toEqual([3, 0, 0]);
    const swapped = contact(b, a);
    expect(swapped.fraction).toBeCloseTo(result.fraction, 10);
    expect(swapped.exitFraction).toBeCloseTo(result.exitFraction!, 10);
    near(swapped.normal, [-1, 0, 0]);
    near(swapped.point, result.point);
  });

  it("accepts sphere rotation when its geometry is centered on its center of mass", () => {
    const sphere = motion(1, Shape.sphere(0.5), { type: "dynamic", position: [-2, 0, 0] }, [4, 0, 0]);
    const box = motion(2, Shape.box(0.5, 0.5, 0.5), { type: "static" });
    const ordinary = nativeCastPair(sphere, box);
    expect(nativeCastPair({ ...sphere, angularDisplacement: [1, 4, -2] }, box)).toEqual(ordinary);
    const otherSphere = motion(2, Shape.sphere(0.5), { type: "dynamic" }, [0, 0, 0], [5, 3, 1]);
    const rotated = contact({ ...sphere, angularDisplacement: [0, 2, 0] }, otherSphere);
    expect(rotated.fraction).toBeCloseTo(0.25, 10);
    expect(rotated.exitFraction).toBeCloseTo(0.75, 10);
    near(rotated.normal, [1, 0, 0]);
    setNativeMassProperties(sphere.body, { mass: sphere.body.mass, volume: 1, center: [0, 0.2, 0], inertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], inverseInertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    expect(() => nativeCastPair({ ...sphere, angularDisplacement: [0, 1, 0] }, box)).toThrow(/offset center of mass/);
  });

  it("does not confuse equal translations with an impact", () => {
    const a = motion(1, Shape.sphere(0.5), { position: [-2, 0, 0] }, [20, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), { position: [2, 0, 0] }, [20, 0, 0]);
    expect(nativeCastPair(a, b)).toEqual({ kind: "separated" });
  });

  it("distinguishes penetration, inward and outward touch, and a future graze", () => {
    const target = motion(2, Shape.sphere(0.5));
    const inside = motion(1, Shape.sphere(0.5), { position: [-0.75, 0, 0] }, [-1, 0, 0]);
    const overlap = contact(inside, target);
    expect(overlap.initial).toBe("penetrating");
    expect(overlap.fraction).toBe(0);
    expect(overlap.exitFraction).toBeCloseTo(0.25, 10);
    expect(overlap.motion).toBe("separating");
    const inward = contact(motion(1, Shape.sphere(0.5), { position: [-1, 0, 0] }, [1, 0, 0]), target);
    expect(inward.initial).toBe("touching");
    expect(inward.motion).toBe("entering");
    expect(inward.exitFraction).toBeUndefined();
    const outward = contact(motion(1, Shape.sphere(0.5), { position: [-1, 0, 0] }, [-1, 0, 0]), target);
    expect(outward.initial).toBe("touching");
    expect(outward.motion).toBe("separating");
    expect(outward.exitFraction).toBeCloseTo(0, 10);
    const graze = contact(motion(1, Shape.sphere(0.5), { position: [-2, 1, 0] }, [4, 0, 0]), target);
    expect(graze.initial).toBe("separated");
    expect(graze.motion).toBe("tangent");
    expect(graze.fraction).toBeCloseTo(0.5, 10);
    expect(graze.exitFraction).toBeCloseTo(0.5, 10);
  });

  it("finds both transitions through a thin box sensor without discrete samples", () => {
    const a = motion(1, Shape.sphere(0.5), { position: [-3, 0, 0] }, [6, 0, 0]);
    const b = motion(2, Shape.box(0.2, 1, 1));
    const sensor = { ...b, collider: new Collider(2, 2, { shape: b.collider.shape, sensor: true }) };
    const result = contact(a, sensor);
    expect(result.fraction).toBeCloseTo(2.3 / 6, 10);
    expect(result.exitFraction).toBeCloseTo(3.7 / 6, 10);
    near(result.normal, [1, 0, 0]);
    near(result.point, [-0.2, 0, 0]);
  });

  it("uses the rounded corner of a box and rejects expanded-box false positives", () => {
    const target = motion(2, Shape.box(0.5, 0.5, 0.5));
    const miss = motion(1, Shape.sphere(0.25), { position: [-2, 0.7, 0.7] }, [4, 0, 0]);
    expect(nativeCastPair(miss, target)).toEqual({ kind: "separated" });
    const hit = motion(1, Shape.sphere(0.25), { position: [-2, 0.65, 0.65] }, [4, 0, 0]);
    const x = Math.sqrt(0.25 ** 2 - 2 * 0.15 ** 2);
    const result = contact(hit, target);
    expect(result.fraction).toBeCloseTo((1.5 - x) / 4, 8);
    near(result.normal, [x / 0.25, -0.6, -0.6]);
    near(result.point, [-0.5, 0.5, 0.5]);
    const swapped = contact(target, hit);
    near(swapped.normal, result.normal.map((value) => -value) as unknown as Vec3);
    near(swapped.point, result.point);
  });

  it("honors a box's fixed rotation and a moving box's world-space witness", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const a = motion(1, Shape.sphere(0.25), { position: [-3, 0, 0] }, [5, 0, 0]);
    const b = motion(2, Shape.box(1, 0.25, 0.5), { rotation }, [1, 0, 0]);
    const result = contact(a, b);
    expect(result.fraction).toBeCloseTo(2.5 / 4, 8);
    near(result.normal, [1, 0, 0]);
    near(result.point, [0.375, 0, 0]);
  });

  it("computes box-box impact with oriented geometry and a real contact witness", () => {
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const a = motion(1, Shape.box(0.5, 0.5, 0.5), { position: [-3, 0.4, 0], rotation }, [4, 0, 0]);
    const b = motion(2, Shape.box(0.5, 0.5, 0.5));
    const result = contact(a, b);
    expect(result.fraction).toBeCloseTo((2.5 - Math.SQRT1_2) / 4, 8);
    expect(result.motion).toBe("entering");
    near(result.normal, [1, 0, 0]);
    expect(result.point[0]).toBeCloseTo(-0.5, 8);
    expect(Math.abs(result.point[1])).toBeLessThanOrEqual(0.5 + 1e-8);
    expect(Math.abs(result.point[2])).toBeLessThanOrEqual(0.5 + 1e-8);
  });

  it("distinguishes an edge moving away from a face moving inward", () => {
    const a = motion(1, Shape.box(0.5, 0.5, 0.5), { position: [-1, 1, 0] }, [1, 1, 0]);
    const b = motion(2, Shape.box(0.5, 0.5, 0.5));
    const result = contact(a, b);
    expect(result.initial).toBe("touching");
    expect(result.motion).toBe("separating");
    expect(result.exitFraction).toBe(0);
  });

  it("identifies the direction and exit time of an initially overlapping box pair", () => {
    const a = motion(1, Shape.box(0.5, 0.5, 0.5), { position: [-0.75, 0, 0] }, [-1, 0, 0]);
    const b = motion(2, Shape.box(0.5, 0.5, 0.5));
    const result = contact(a, b);
    expect(result.initial).toBe("penetrating");
    expect(result.motion).toBe("separating");
    expect(result.exitFraction).toBeCloseTo(0.25, 10);
  });

  it("reports a box grazing another box without turning it into penetration", () => {
    const a = motion(1, Shape.box(0.5, 0.5, 0.5), { position: [-2, 1, 0] }, [4, 0, 0]);
    const b = motion(2, Shape.box(0.5, 0.5, 0.5));
    const result = contact(a, b);
    expect(result.fraction).toBeCloseTo(0.25, 10);
    expect(result.exitFraction).toBeCloseTo(0.75, 10);
    expect(result.motion).toBe("tangent");
  });

  it("handles either body moving against a rotated halfspace", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const plane = motion(1, Shape.plane(), { rotation }, [-1, 0, 0]);
    const sphere = motion(2, Shape.sphere(0.25), { position: [-3, 0, 0] }, [3, 0, 0]);
    const result = contact(plane, sphere);
    expect(result.fraction).toBeCloseTo(2.75 / 4, 8);
    expect(result.exitFraction).toBeUndefined();
    near(result.normal, [-1, 0, 0]);
    near(result.point, [-2.75 / 4, 0, 0]);
    expect(result.motion).toBe("entering");
    near(contact(sphere, plane).normal, [1, 0, 0]);
  });

  it("preserves a true box-edge graze and distinguishes it from a small miss", () => {
    const b = motion(2, Shape.box(0.5, 0.5, 0.5));
    const graze = motion(1, Shape.sphere(0.5), { position: [-2, 1, 0] }, [4, 0, 0]);
    const result = contact(graze, b);
    expect(result.fraction).toBeCloseTo(0.375, 10);
    expect(result.exitFraction).toBeCloseTo(0.625, 10);
    expect(result.motion).toBe("tangent");
    const miss = motion(1, Shape.sphere(0.5), { position: [-2, 1.000001, 0] }, [4, 0, 0]);
    expect(nativeCastPair(miss, b)).toEqual({ kind: "separated" });
  });

  it("finds short contacts along very long displacements", () => {
    const a = motion(1, Shape.sphere(0.5), { position: [0, 0.9, 0] }, [1e9, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), { position: [1000, 0, 0] });
    const result = contact(a, b);
    expect(result.fraction * 1e9).toBeCloseTo(1000 - Math.sqrt(1 - 0.9 ** 2), 3);
    expect(result.exitFraction! * 1e9).toBeCloseTo(1000 + Math.sqrt(1 - 0.9 ** 2), 3);
    const c = motion(2, Shape.box(0.5, 0.5, 0.5), { position: [1000, 0, 0] });
    const boxResult = contact(a, c);
    expect(boxResult.fraction * 1e9).toBeCloseTo(999.2, 3);
    expect(boxResult.exitFraction! * 1e9).toBeCloseTo(1000.8, 3);
  });

  it("matches analytic sphere-box entry and exit over faces, edges and corners", () => {
    const target = motion(2, Shape.box(0.5, 0.5, 0.5));
    const radius = 0.25;
    for (const y of [0, 0.4, 0.55, 0.65, 0.75, 0.8]) for (const z of [0, 0.5, 0.6, 0.7]) {
      const moving = motion(1, Shape.sphere(radius), { position: [-3, y, z] }, [6, 0, 0]);
      const dy = Math.max(0, y - 0.5), dz = Math.max(0, z - 0.5), remainder = radius ** 2 - dy ** 2 - dz ** 2;
      const result = nativeCastPair(moving, target);
      if (remainder < -1e-15) { expect(result.kind).toBe("separated"); continue; }
      expect(result.kind).toBe("contact");
      if (result.kind !== "contact") throw new Error("Expected CCD contact.");
      const offset = Math.sqrt(Math.max(0, remainder));
      expect(result.fraction).toBeCloseTo((2.5 - offset) / 6, 7);
      expect(result.exitFraction).toBeCloseTo((3.5 + offset) / 6, 7);
    }
  });

  it("distinguishes an entry at the end from an exit at the end", () => {
    const box = motion(2, Shape.box(0.5, 0.5, 0.5));
    const entering = contact(motion(1, Shape.sphere(0.5), { position: [-2, 0, 0] }, [1, 0, 0]), box);
    expect(entering.fraction).toBeCloseTo(1, 10);
    expect(entering.exitFraction).toBeUndefined();
    const leaving = contact(motion(1, Shape.sphere(0.5), { position: [-0.25, 0, 0] }, [1.25, 0, 0]), box);
    expect(leaving.initial).toBe("penetrating");
    expect(leaving.exitFraction).toBeCloseTo(1, 10);
  });

  it("tracks both entry and exit when a box crosses a plane sensor", () => {
    const a = motion(1, Shape.box(0.5, 0.5, 0.5), { position: [0, -0.25, 0] }, [0, 2, 0]);
    const b = motion(2, Shape.plane());
    const result = contact(a, b);
    expect(result.initial).toBe("penetrating");
    expect(result.fraction).toBe(0);
    expect(result.exitFraction).toBeCloseTo(0.375, 10);
    expect(result.motion).toBe("separating");
  });

  it("computes sphere-capsule intervals and witnesses from both body motions", () => {
    const sphere = motion(1, Shape.sphere(0.25), { position: [-3, 0, 0] }, [4, 0, 0]);
    const capsule = motion(2, Shape.capsule(0.5, 1), { position: [3, 0, 0] }, [-4, 0, 0]);
    const hit = contact(sphere, capsule);
    expect(hit.fraction).toBeCloseTo(5.25 / 8, 10);
    expect(hit.exitFraction).toBeCloseTo(6.75 / 8, 10);
    expect(hit.motion).toBe("entering");
    expect(hit.intervals).toHaveLength(1);
    near(hit.normal, [1, 0, 0]);
    near(hit.point, [-0.125, 0, 0]);
    const reversed = contact(capsule, sphere);
    near(reversed.normal, [-1, 0, 0]);
    near(reversed.point, hit.point);
  });

  it("preserves entry, exit and an exact graze for perpendicular capsules", () => {
    const rotation = [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const;
    const target = motion(2, Shape.capsule(0.25, 1), { rotation });
    const moving = motion(1, Shape.capsule(0.25, 1), { position: [-3, 0, 0] }, [6, 0, 0]);
    const hit = contact(moving, target);
    expect(hit.fraction).toBeCloseTo(2.5 / 6, 10);
    expect(hit.exitFraction).toBeCloseTo(3.5 / 6, 10);
    near(hit.normal, [1, 0, 0]);
    const graze = contact(motion(1, Shape.capsule(0.25, 1), { position: [-3, 0, 1.5] }, [6, 0, 0]), target);
    expect(graze.fraction).toBeCloseTo(0.5, 10);
    expect(graze.exitFraction).toBeCloseTo(0.5, 10);
    expect(graze.motion).toBe("tangent");
  });

  it("uses the rounded edges of capsule-box configuration geometry", () => {
    const moving = motion(1, Shape.capsule(0.25, 0.5), { position: [-2, 1.15, 0.65] }, [4, 0, 0]);
    const target = motion(2, Shape.box(0.5, 0.5, 0.5));
    const x = Math.sqrt(0.25 ** 2 - 2 * 0.15 ** 2), hit = contact(moving, target);
    expect(hit.fraction).toBeCloseTo((1.5 - x) / 4, 8);
    expect(hit.exitFraction).toBeCloseTo((2.5 + x) / 4, 8);
    near(hit.normal, [x / 0.25, -0.6, -0.6]);
    near(hit.point, [-0.5, 0.5, 0.5]);
  });

  it("computes convex-versus-box entry and exit using both body motions", () => {
    const cube = Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
    const a = motion(1, cube, { position: [-3, 0, 0] }, [4, 0, 0]);
    const b = motion(2, Shape.box(0.5, 0.5, 0.5), { position: [3, 0, 0] }, [-4, 0, 0]);
    const hit = contact(a, b);
    expect(hit.fraction).toBeCloseTo(5 / 8, 10);
    expect(hit.exitFraction).toBeCloseTo(7 / 8, 10);
    expect(hit.motion).toBe("entering");
    near(hit.normal, [1, 0, 0]);
    expect(hit.point[0]).toBeCloseTo(0, 10);
  });

  it("respects rotated convex and capsule cores in both motion directions", () => {
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const n = [Math.SQRT1_2, Math.SQRT1_2, 0] as const;
    const cube = Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
    const a = motion(1, cube, { position: [-3 * n[0], -3 * n[1], 0], rotation }, [4 * n[0], 4 * n[1], 0]);
    const b = motion(2, cube, { position: [3 * n[0], 3 * n[1], 0], rotation }, [-4 * n[0], -4 * n[1], 0]);
    const hit = contact(a, b);
    expect(hit.fraction).toBeCloseTo(5 / 8, 9);
    expect(hit.exitFraction).toBeCloseTo(7 / 8, 9);
    near(hit.normal, n);
    const capsule = motion(1, Shape.capsule(0.25, 0.5), { position: [-3 * n[0], -3 * n[1], 0], rotation }, [4 * n[0], 4 * n[1], 0]);
    const againstHull = contact(capsule, b);
    expect(againstHull.fraction).toBeCloseTo(5.25 / 8, 9);
    expect(againstHull.exitFraction).toBeCloseTo(6.75 / 8, 9);
    near(againstHull.normal, n);
  });

  it("classifies a sliding convex face as tangent without losing its interval", () => {
    const cube = Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
    const hit = contact(motion(1, cube, { position: [-2, 1, 0] }, [4, 0, 0]), motion(2, Shape.box(0.5, 0.5, 0.5)));
    expect(hit.fraction).toBeCloseTo(0.25, 10);
    expect(hit.exitFraction).toBeCloseTo(0.75, 10);
    expect(hit.motion).toBe("tangent");
  });

  it("uses capsule end-cap curvature for both interval endpoints", () => {
    const capsule = motion(2, Shape.capsule(0.5, 1));
    const sphere = motion(1, Shape.sphere(0.25), { position: [-3, 1.4, 0] }, [6, 0, 0]);
    const x = Math.sqrt(0.75 ** 2 - 0.4 ** 2), hit = contact(sphere, capsule);
    expect(hit.fraction).toBeCloseTo((3 - x) / 6, 9);
    expect(hit.exitFraction).toBeCloseTo((3 + x) / 6, 9);
    near(hit.normal, [x / 0.75, -0.4 / 0.75, 0]);
  });

  it("does not collapse a small capsule segment into a point", () => {
    const size = 1e-15;
    const capsule = motion(2, Shape.capsule(size, size));
    const sphere = motion(1, Shape.sphere(size), { position: [-6 * size, 2 * size, 0] }, [12 * size, 0, 0]);
    const x = Math.sqrt(3) * size, hit = contact(sphere, capsule);
    expect(hit.fraction).toBeCloseTo((6 * size - x) / (12 * size), 9);
    expect(hit.exitFraction).toBeCloseTo((6 * size + x) / (12 * size), 9);
    near(hit.normal, [Math.sqrt(3) / 2, -0.5, 0]);
  });

  it("rejects a configuration hull when a real feature is below construction precision", () => {
    const hull = Shape.convexHull([
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5000000005, 0, 0]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
    expect(() => nativeCastPair(motion(1, Shape.sphere(0.25), { position: [-3, 0, 0] }, [6, 0, 0]), motion(2, hull))).toThrow(/ill-conditioned/);
  });

  it("retains separate sensor transitions through separated moving mesh surfaces", () => {
    const mesh = Shape.mesh([
      [-1, -2, -2], [-1, 2, -2], [-1, 0, 2],
      [1, -2, -2], [1, 2, -2], [1, 0, 2]
    ], [0, 1, 2, 3, 4, 5]);
    const a = motion(1, Shape.sphere(0.25), { position: [-3, 0, 0] }, [7, 0, 0]);
    const b = motion(2, mesh, {}, [1, 0, 0]);
    const sensor = { ...b, collider: new Collider(2, 2, { shape: mesh, sensor: true }) };
    const hit = contact(a, sensor);
    expect(hit.intervals).toHaveLength(2);
    expect(hit.intervals[0]!.fraction).toBeCloseTo(1.75 / 6, 10);
    expect(hit.intervals[0]!.exitFraction).toBeCloseTo(2.25 / 6, 10);
    expect(hit.intervals[1]!.fraction).toBeCloseTo(3.75 / 6, 10);
    expect(hit.intervals[1]!.exitFraction).toBeCloseTo(4.25 / 6, 10);
    expect(hit.intervals[0]!.motion).toBe("entering");
    expect(hit.intervals[1]!.motion).toBe("entering");
    near(hit.normal, [1, 0, 0]);
    near(hit.point, [-1 + 1.75 / 6, 0, 0]);
    const reversed = contact(sensor, a);
    expect(reversed.intervals).toHaveLength(2);
    near(reversed.normal, [-1, 0, 0]);
    near(reversed.point, hit.point);
  });

  it("chooses the first triangle's witness when surface entries tie", () => {
    const mesh = Shape.mesh([
      [0, -3, -3], [0, 3, -3], [0, 0, 3],
      [-3, 0, -3], [3, 0, -3], [0, 0, 3]
    ], [0, 1, 2, 3, 4, 5]);
    const moving = motion(1, Shape.sphere(0.25), { position: [-2, -2, 0] }, [4, 4, 0]);
    const hit = contact(moving, motion(2, mesh));
    expect(hit.intervals).toHaveLength(1);
    expect(hit.fraction).toBeCloseTo(1.75 / 4, 10);
    near(hit.normal, [1, 0, 0]);
    near(hit.point, [0, -0.25, 0]);
  });

  it("distinguishes finite-surface entry at the end from an immediate exit", () => {
    const mesh = motion(2, Shape.mesh([[0, -2, -2], [0, 2, -2], [0, 0, 2]], [0, 1, 2]));
    const entry = contact(motion(1, Shape.sphere(0.25), { position: [-1.25, 0, 0] }, [1, 0, 0]), mesh);
    expect(entry.fraction).toBeCloseTo(1, 10);
    expect(entry.exitFraction).toBeUndefined();
    expect(entry.motion).toBe("entering");
    const exit = contact(motion(1, Shape.sphere(0.25), { position: [-0.25, 0, 0] }, [-1, 0, 0]), mesh);
    expect(exit.initial).toBe("touching");
    expect(exit.motion).toBe("separating");
    expect(exit.exitFraction).toBeCloseTo(0, 10);
  });

  it("merges adjacent heightfield triangles and preserves both crossing times", () => {
    const terrain = motion(2, Shape.heightfield([[0, 0], [0, 0]], 4));
    const sphere = motion(1, Shape.sphere(0.25), { position: [0, 2, 0] }, [0, -4, 0]);
    const hit = contact(sphere, terrain);
    expect(hit.intervals).toHaveLength(1);
    expect(hit.fraction).toBeCloseTo(1.75 / 4, 10);
    expect(hit.exitFraction).toBeCloseTo(2.25 / 4, 10);
    near(hit.normal, [0, -1, 0]);
    near(hit.point, [0, 0, 0]);
  });

  it("keeps a real triangle-edge graze distinct from a nearby miss", () => {
    const mesh = motion(2, Shape.mesh([[0, 0, 0], [0, 0, 2], [2, 0, 0]], [0, 1, 2]));
    const moving = motion(1, Shape.sphere(0.25), { position: [-1, 0.25, 1] }, [4, 0, 0]);
    const hit = contact(moving, mesh);
    expect(hit.fraction).toBeCloseTo(0.25, 9);
    expect(hit.exitFraction).toBeCloseTo(0.5, 9);
    expect(hit.motion).toBe("tangent");
    near(hit.normal, [0, -1, 0]);
    expect(nativeCastPair(motion(1, Shape.sphere(0.25), { position: [-1, 0.25001, 1] }, [4, 0, 0]), mesh)).toEqual({ kind: "separated" });
  });

  it("computes box and convex crossing intervals through a finite mesh surface", () => {
    const mesh = motion(2, Shape.mesh([[0, -2, -2], [0, 2, -2], [0, 0, 2]], [0, 1, 2]));
    const shape = Shape.box(0.25, 0.25, 0.25);
    const box = contact(motion(1, shape, { position: [-3, 0, 0] }, [6, 0, 0]), mesh);
    expect(box.fraction).toBeCloseTo(2.75 / 6, 10);
    expect(box.exitFraction).toBeCloseTo(3.25 / 6, 10);
    expect(box.motion).toBe("entering");
    near(box.normal, [1, 0, 0]);
    expect(box.point[0]).toBeCloseTo(0, 10);
    const convex = Shape.convexHull([
      [-0.25, -0.25, -0.25], [0.25, -0.25, -0.25], [-0.25, 0.25, -0.25], [0.25, 0.25, -0.25],
      [-0.25, -0.25, 0.25], [0.25, -0.25, 0.25], [-0.25, 0.25, 0.25], [0.25, 0.25, 0.25]
    ], [0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
    const hull = contact(motion(1, convex, { position: [-3, 0, 0] }, [6, 0, 0]), mesh);
    expect(hull.fraction).toBeCloseTo(box.fraction, 10);
    expect(hull.exitFraction).toBeCloseTo(box.exitFraction!, 10);
    near(hull.normal, [1, 0, 0]);
  });

  it("handles capsule-halfspace support and an initially overlapping capsule", () => {
    const plane = motion(2, Shape.plane(), {}, [0, 1, 0]);
    const capsule = motion(1, Shape.capsule(0.25, 0.5), { position: [0, 2, 0] }, [0, -3, 0]);
    const falling = contact(capsule, plane);
    expect(falling.fraction).toBeCloseTo(1.25 / 4, 10);
    expect(falling.exitFraction).toBeUndefined();
    near(falling.normal, [0, -1, 0]);
    near(falling.point, [0, 1.25 / 4, 0]);
    const inside = motion(1, Shape.capsule(0.5, 1), { position: [-0.75, 0, 0] }, [-1, 0, 0]);
    const leaving = contact(inside, motion(2, Shape.sphere(0.5)));
    expect(leaving.initial).toBe("penetrating");
    expect(leaving.motion).toBe("separating");
    expect(leaving.exitFraction).toBeCloseTo(0.25, 10);
  });

  it("casts an asymmetric convex hull against a moving halfspace", () => {
    const hull = Shape.convexHull([[-1, 0, 0], [1, 0, 0], [0, 2, 0], [0, 0, 1]], [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3]);
    const moving = motion(1, hull, { position: [0, 2, 0] }, [0, -3, 0]);
    const plane = motion(2, Shape.plane(), {}, [0, 1, 0]);
    const hit = contact(moving, plane);
    expect(hit.fraction).toBeCloseTo(0.5, 10);
    expect(hit.exitFraction).toBeUndefined();
    near(hit.normal, [0, -1, 0]);
    expect(hit.point[1]).toBeCloseTo(0.5, 10);
    const swapped = contact(plane, moving);
    near(swapped.normal, [0, 1, 0]);
    near(swapped.point, hit.point);
  });

  it("rejects unsupported rotations, shape pairs, bad motions and mismatched owners", () => {
    const sphere = motion(1, Shape.sphere(0.5));
    const box = motion(2, Shape.box(0.5, 0.5, 0.5), { position: [5, 0, 0] });
    expect(() => nativeCastPair(sphere, { ...box, angularDisplacement: [0, 0.001, 0] })).toThrow(/angular displacement/);
    expect(() => nativeCastPair(sphere, motion(2, Shape.capsule(0.5, 1)))).toThrow(/unique contact normal/);
    const mesh = Shape.mesh([[0, 0, 0], [1, 0, 0], [0, 0, 1]], [0, 1, 2]);
    expect(() => nativeCastPair(motion(1, mesh), motion(2, mesh))).toThrow(/does not support.*mesh/);
    expect(() => nativeCastPair(sphere, { ...box, displacement: [Infinity, 0, 0] })).toThrow(/finite/);
    expect(() => nativeCastPair(sphere, { ...box, collider: new Collider(3, 99, { shape: Shape.sphere(1) }) })).toThrow(/belong/);
    expect(() => nativeCastPair(sphere, { ...box, body: sphere.body })).toThrow(/belong/);
  });
});
