// All expected values in this file are derived from the coordinates written
// here and from geometric invariants, not from comparison fixtures. Nullable
// raw links are an intentional versioned migration from the frozen legacy
// declaration inventory, which types those same states as non-null.
import { describe, expect, expectTypeOf, it } from "vitest";
import { HullVector3 as Vector3, HullRay as Ray } from "../../../packages/math/src/independent/HullPrimitives.js";
import { ConvexHull, ConvexHullFace, HalfEdge, VertexList, VertexNode } from "../../../packages/math/src/independent/ConvexHull.js";

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const tetra = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)];
const cube = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => v(x, y, z))));

function checkTopology(hull: ConvexHull, points: Vector3[]): void {
  const vertices = new Set<VertexNode>();
  const edges = new Set<HalfEdge>();
  for (const face of hull.faces) {
    expect(face.area).toBeGreaterThan(0);
    expect(face.normal.length()).toBeCloseTo(1, 11);
    expect(face.getEdge(3)).toBe(face.edge);
    for (let i = 0; i < 3; i++) {
      const edge = face.getEdge(i);
      const next = edge.next, prev = edge.prev, twin = edge.twin;
      if (!next || !prev || !twin) throw new Error("Expected linked face edges");
      expect(edge.face).toBe(face);
      expect(next.prev).toBe(edge);
      expect(prev.next).toBe(edge);
      expect(twin.twin).toBe(edge);
      expect(edge.head()).toBe(twin.tail());
      expect(edge.tail()).toBe(twin.head());
      vertices.add(edge.head());
      edges.add(edge);
    }
    for (const point of points) expect(face.distanceToPoint(point)).toBeLessThanOrEqual(Math.max(1e-10, hull.tolerance * 8));
  }
  expect(edges.size % 2).toBe(0);
  expect(vertices.size - edges.size / 2 + hull.faces.length).toBe(2);
  for (const point of points) expect(hull.containsPoint(point)).toBe(true);
}

function expectPoint(actual: Vector3 | undefined, expected: Vector3, precision = 10): void {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, precision);
  expect(actual!.y).toBeCloseTo(expected.y, precision);
  expect(actual!.z).toBeCloseTo(expected.z, precision);
}

describe("independent convex hull geometry", () => {
  it("constructs the analytic tetrahedron and intersects its boundary", () => {
    const hull = ConvexHull.fromPoints(tetra);
    expect(hull.faces).toHaveLength(4);
    checkTopology(hull, tetra);
    for (const point of [v(0, 0, 0), v(.2, .3, .1), v(.2, .3, .5)]) expect(hull.containsPoint(point)).toBe(true);
    for (const point of [v(-.01, 0, 0), v(.2, .3, .51), v(0, 0, 2)]) expect(hull.containsPoint(point)).toBe(false);
    expectPoint(hull.intersectRay(new Ray(v(-1, .2, .2), v(1, 0, 0))), v(0, .2, .2));
    expectPoint(hull.intersectRay(new Ray(v(.2, .2, .2), v(1, 0, 0))), v(.6, .2, .2));
    expect(hull.intersectRay(new Ray(v(-1, 2, 0), v(1, 0, 0)))).toBeUndefined();
    expect(hull.intersectsRay(new Ray(v(-1, .2, .2), v(1, 0, 0)))).toBe(true);
  });

  it("agrees with independently derived simplex inequalities for seeded rays", () => {
    let state = 0x1234abcd;
    const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
    const hull = ConvexHull.fromPoints(tetra);
    for (let i = 0; i < 250; i++) {
      const origin = v(4 * random() - 1.5, 4 * random() - 1.5, 4 * random() - 1.5);
      const direction = i % 2 ? v(random() - .5, random() - .5, random() - .5) : v(.2 - origin.x, .2 - origin.y, .2 - origin.z);
      const ray = new Ray(origin, direction);
      let enter = -Infinity, exit = Infinity;
      for (const [value, slope, limit] of [
        [-origin.x, -ray.direction.x, 0], [-origin.y, -ray.direction.y, 0], [-origin.z, -ray.direction.z, 0],
        [origin.x + origin.y + origin.z, ray.direction.x + ray.direction.y + ray.direction.z, 1],
      ]) {
        const t = (limit! - value!) / slope!;
        if (slope! < 0) enter = Math.max(enter, t);
        else exit = Math.min(exit, t);
      }
      const actual = hull.intersectRay(ray);
      if (exit < 0 || enter > exit) expect(actual).toBeUndefined();
      else {
        const t = enter >= 0 ? enter : exit;
        expectPoint(actual, v(origin.x + t * ray.direction.x, origin.y + t * ray.direction.y, origin.z + t * ray.direction.z), 8);
      }
    }
  });

  it("constructs a cube with duplicate and interior inputs", () => {
    const inputs = [...cube, cube[0]!, v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)];
    const hull = ConvexHull.fromPoints(inputs);
    expect(hull.faces).toHaveLength(12);
    checkTopology(hull, inputs);
    expect(hull.containsPoint(v(.9, -.9, .9))).toBe(true);
    expect(hull.containsPoint(v(1.01, 0, 0))).toBe(false);
    expectPoint(hull.intersectRay(new Ray(v(3, .5, .5), v(-1, 0, 0))), v(1, .5, .5));
    expectPoint(hull.intersectRay(new Ray(v(0, 0, 0), v(1, 0, 0))), v(1, 0, 0));
    expectPoint(hull.intersectRay(new Ray(v(2 ** 48, .5, .5), v(-1, 0, 0))), v(1, .5, .5));
    expect(() => hull.intersectRay(new Ray(v(Number.MAX_VALUE, .5, .5), v(-1, 0, 0)))).toThrow(RangeError);
  });

  it("constructs a pyramid and handles an extended collinear edge", () => {
    const pyramid = [v(-1, -1, 0), v(1, -1, 0), v(1, 1, 0), v(-1, 1, 0), v(0, 0, 2)];
    const hull = ConvexHull.fromPoints(pyramid);
    expect(hull.faces).toHaveLength(6);
    checkTopology(hull, pyramid);
    expect(hull.containsPoint(v(0, 0, 1))).toBe(true);
    expect(hull.containsPoint(v(.8, .8, 1))).toBe(false);
    const extension = [...tetra, v(2, 0, 0)];
    checkTopology(ConvexHull.fromPoints(extension), extension);
  });

  it("is invariant under translations, scale, and many deterministic point orders", () => {
    const points = [...cube, v(0, 0, 0), v(.5, 1, -.5), v(1, 0, 0), v(.2, .7, -.4)];
    let seed = 92821;
    for (let trial = 0; trial < 30; trial++) {
      const order = [...points];
      for (let i = order.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const hull = ConvexHull.fromPoints(order);
      checkTopology(hull, order);
      for (const p of [v(0, 0, 0), v(1, 1, 1), v(-.7, .5, .1)]) expect(hull.containsPoint(p)).toBe(true);
      for (const p of [v(1.01, 0, 0), v(0, -1.01, 0), v(0, 0, 1.01)]) expect(hull.containsPoint(p)).toBe(false);
    }
    for (const scale of [1e-90, 1, 1e90]) {
      const transformed = tetra.map((p) => v(5 * scale + p.x * scale, -3 * scale + p.y * scale, 2 * scale + p.z * scale));
      const hull = ConvexHull.fromPoints(transformed);
      expect(hull.containsPoint(v(5.1 * scale, -2.9 * scale, 2.1 * scale))).toBe(true);
      expect(hull.containsPoint(v(5.8 * scale, -2.2 * scale, 2.8 * scale))).toBe(false);
    }
  });

  it("retains meaningful relative geometry at extreme scales and large translations", () => {
    for (const scale of [1e-100, 1e100, 1e200]) {
      const points = cube.map((p) => v(p.x * scale, p.y * scale, p.z * scale));
      const hull = ConvexHull.fromPoints(points);
      expect(hull.faces).toHaveLength(12);
      expect(hull.containsPoint(v(.5 * scale, 0, 0))).toBe(true);
      expect(hull.containsPoint(v(1.5 * scale, 0, 0))).toBe(false);
      for (const face of hull.faces) expect(face.normal.length()).toBeCloseTo(1, 11);
    }
    const offset = 1e15;
    const points = tetra.map((p) => v(offset + 16 * p.x, offset + 16 * p.y, offset + 16 * p.z));
    const hull = ConvexHull.fromPoints(points);
    expect(hull.containsPoint(v(offset + 2, offset + 2, offset + 2))).toBe(true);
    expect(hull.containsPoint(v(offset + 8, offset + 8, offset + 8))).toBe(false);
    expectPoint(hull.intersectRay(new Ray(v(offset - 8, offset + 2, offset + 2), v(1, 0, 0))), v(offset, offset + 2, offset + 2));
  });

  it("preserves manifold topology for seeded random clouds and convex combinations", () => {
    let state = 0xcafe1234;
    const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
    for (let run = 0; run < 16; run++) {
      const points = Array.from({ length: 40 }, () => v(2 * random() - 1, 2 * random() - 1, 2 * random() - 1));
      const hull = ConvexHull.fromPoints(points);
      checkTopology(hull, points);
      for (let i = 0; i < 20; i++) {
        const a = points[Math.floor(random() * points.length)]!, b = points[Math.floor(random() * points.length)]!, t = random();
        expect(hull.containsPoint(v(a.x * t + b.x * (1 - t), a.y * t + b.y * (1 - t), a.z * t + b.z * (1 - t)))).toBe(true);
      }
    }
  });

  it("handles boundary and interior lattice points in varied insertion orders", () => {
    const lattice = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => v(x, y, z))));
    let seed = 0x142857;
    for (let trial = 0; trial < 32; trial++) {
      const points = [...lattice];
      for (let i = points.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [points[i], points[j]] = [points[j]!, points[i]!];
      }
      const hull = ConvexHull.fromPoints(points);
      checkTopology(hull, points);
      expect(hull.containsPoint(v(0, 0, 0))).toBe(true);
      expect(hull.containsPoint(v(1.01, 0, 0))).toBe(false);
    }
  });

  it("represents planar polygons, segments, points, and empty inputs", () => {
    const square = [v(-1, -1, 0), v(1, -1, 0), v(1, 1, 0), v(-1, 1, 0), v(0, 0, 0), v(-1, -1, 0)];
    const planar = ConvexHull.fromPoints(square);
    expect(planar.faces).toHaveLength(4);
    checkTopology(planar, square);
    expect(planar.containsPoint(v(.5, .5, 0))).toBe(true);
    expect(planar.containsPoint(v(1.1, 0, 0))).toBe(false);
    expect(planar.containsPoint(v(0, 0, .01))).toBe(false);
    expectPoint(planar.intersectRay(new Ray(v(0, 0, 2), v(0, 0, -1))), v(0, 0, 0));
    expectPoint(planar.intersectRay(new Ray(v(-2, 0, 0), v(1, 0, 0))), v(-1, 0, 0));
    expect(planar.intersectRay(new Ray(v(2, 2, 1), v(0, 0, -1)))).toBeUndefined();
    expectPoint(planar.intersectRay(new Ray(v(-(2 ** 48), 0, 1), v(1, 0, -(2 ** -48)))), v(0, 0, 0), 6);
    const tilted = [v(-1, -1, 3), v(1, -1, 1), v(1, 1, -3), v(-1, 1, -1)];
    const tiltedHull = ConvexHull.fromPoints(tilted);
    checkTopology(tiltedHull, tilted);
    expect(tiltedHull.containsPoint(v(0, 0, 0))).toBe(true);
    expect(tiltedHull.containsPoint(v(2, 0, -2))).toBe(false);
    const segment = ConvexHull.fromPoints([v(-1, 0, 0), v(0, 0, 0), v(2, 0, 0)]);
    expect(segment.faces).toHaveLength(0);
    expect(segment.containsPoint(v(.5, 0, 0))).toBe(true);
    expect(segment.containsPoint(v(3, 0, 0))).toBe(false);
    expect(segment.containsPoint(v(.5, .01, 0))).toBe(false);
    expectPoint(segment.intersectRay(new Ray(v(0, 1, 0), v(0, -1, 0))), v(0, 0, 0));
    expectPoint(segment.intersectRay(new Ray(v(-2, 0, 0), v(1, 0, 0))), v(-1, 0, 0));
    expectPoint(segment.intersectRay(new Ray(v(-(2 ** 40), 1, 0), v(1, -(2 ** -40), 0))), v(0, 0, 0), 3);
    const point = ConvexHull.fromPoints([v(2, 3, 4), v(2, 3, 4)]);
    expect(point.containsPoint(v(2, 3, 4))).toBe(true);
    expect(point.containsPoint(v(2, 3, 4 + 1e-14))).toBe(false);
    expect(point.containsPoint(v(2, 3, 4.01))).toBe(false);
    expectPoint(point.intersectRay(new Ray(v(2, 3, 3), v(0, 0, 1))), v(2, 3, 4));
    const empty = ConvexHull.fromPoints([]);
    expect(empty.containsPoint(v(0, 0, 0))).toBe(false);
    expect(empty.intersectRay(new Ray(v(0, 0, 0), v(1, 0, 0)))).toBeUndefined();
  });

  it("clears and rebuilds, rejects invalid inputs atomically, and enforces limits", () => {
    const hull = ConvexHull.fromPoints(tetra);
    const oldFaces = hull.faces;
    expect(() => hull.setFromPoints([v(NaN, 0, 0)])).toThrow(RangeError);
    expect(hull.faces).toBe(oldFaces);
    expect(hull.containsPoint(v(.1, .1, .1))).toBe(true);
    expect(() => hull.setFromPoints(Array.from({ length: 8_193 }, (_, i) => v(i, 0, 0)))).toThrow(RangeError);
    expect(() => hull.setFromPoints(Array(100_001).fill(tetra[0]!))).toThrow(RangeError);
    expect(hull.faces).toBe(oldFaces);
    expect(hull.makeEmpty()).toBe(hull);
    expect(hull.faces).toEqual([]);
    expect(hull.vertices).toEqual([]);
    expect(hull.containsPoint(v(.1, .1, .1))).toBe(false);
    expect(hull.setFromPoints(cube)).toBe(hull);
    expect(hull.compute()).toBe(hull);
    checkTopology(hull, cube);
    expect(() => new Ray(v(0, 0, 0), v(0, 0, 0))).toThrow(RangeError);
    expect(hull.containsPoint(v(Infinity, 0, 0))).toBe(false);
  });

  it("uses public tolerance for queries with explicit numeric validation", () => {
    const hull = ConvexHull.fromPoints(tetra), near = v(-.01, .1, .1);
    const ray = new Ray(v(-.01, -1, .1), v(0, 1, 0));
    expect(hull.containsPoint(near)).toBe(false);
    expect(hull.intersectsRay(ray)).toBe(false);
    hull.tolerance = .02;
    expect(hull.containsPoint(near)).toBe(true);
    const hit = hull.intersectRay(ray);
    expectPoint(hit, v(-.01, -.02, .1));
    if (!hit) throw new Error("Expected a tolerant boundary hit");
    expect(hull.containsPoint(hit)).toBe(true);
    hull.tolerance = 0;
    expect(hull.containsPoint(near)).toBe(false);
    hull.tolerance = -1;
    expect(() => hull.containsPoint(near)).toThrow(RangeError);
    expect(() => hull.intersectRay(ray)).toThrow(RangeError);
    hull.tolerance = NaN;
    expect(() => hull.containsPoint(near)).toThrow(RangeError);
    const singleton = ConvexHull.fromPoints([v(0, 0, 0)]);
    expect(singleton.tolerance).toBe(0);
    expect(singleton.containsPoint(v(.01, 0, 0))).toBe(false);
    singleton.tolerance = .02;
    expect(singleton.containsPoint(v(.01, 0, 0))).toBe(true);
  });

  it("does not return a solid's boundary behind a ray directed away from it", () => {
    const hull = ConvexHull.fromPoints(cube);
    hull.tolerance = .1;
    const outward = new Ray(v(1.15, 0, 0), v(1, 0, 0));
    expect(hull.intersectRay(outward)).toBeUndefined();
    expect(hull.intersectsRay(outward)).toBe(false);
    expectPoint(hull.intersectRay(new Ray(v(1.15, 0, 0), v(-1, 0, 0))), v(1.1, 0, 0));
  });

  it("keeps singleton queries on the last built coordinates until recomputed", () => {
    const hull = ConvexHull.fromPoints([v(2, 3, 4)]);
    const node = hull.vertices[0]!;
    // readonly is a TypeScript contract; JavaScript callers can still replace
    // a property. The published hull snapshot must not change implicitly.
    Object.defineProperty(node, "point", { value: v(9, 8, 7), configurable: true });
    expect(hull.containsPoint(v(2, 3, 4))).toBe(true);
    expect(hull.containsPoint(v(9, 8, 7))).toBe(false);
    expectPoint(hull.intersectRay(new Ray(v(2, 3, 3), v(0, 0, 1))), v(2, 3, 4));
    hull.compute();
    expect(hull.containsPoint(v(2, 3, 4))).toBe(false);
    expect(hull.containsPoint(v(9, 8, 7))).toBe(true);
  });

  it("keeps both bookkeeping lists and hull state on a failed rebuild or clear", () => {
    const hull = ConvexHull.fromPoints(tetra);
    const faces = hull.faces, vertices = hull.vertices, tolerance = hull.tolerance;
    const assigned = new VertexNode(v(3, 3, 3)), damaged = new VertexNode(v(4, 4, 4));
    hull.assigned.append(assigned);
    hull.unassigned.append(damaged);
    damaged.next = damaged;
    expect(() => hull.setFromPoints(cube)).toThrow(RangeError);
    expect(() => hull.makeEmpty()).toThrow(RangeError);
    expect(hull.faces).toBe(faces);
    expect(hull.vertices).toBe(vertices);
    expect(hull.tolerance).toBe(tolerance);
    expect(hull.assigned.first()).toBe(assigned);
    expect(hull.unassigned.first()).toBe(damaged);
    expect(hull.containsPoint(v(.1, .1, .1))).toBe(true);
    damaged.next = null;
    hull.setFromPoints(cube);
    expect(hull.assigned.isEmpty()).toBe(true);
    expect(hull.unassigned.isEmpty()).toBe(true);
    expect(hull.containsPoint(v(-.5, 0, 0))).toBe(true);
  });

  it("rejects edited face snapshots and applies pending vertices only on rebuild", () => {
    const hull = ConvexHull.fromPoints(tetra), ray = new Ray(v(-1, .1, .1), v(1, 0, 0));
    hull.faces = [...hull.faces];
    hull.newFaces.push(new ConvexHullFace());
    hull.assigned.append(new VertexNode(v(20, 0, 0)));
    hull.unassigned.append(new VertexNode(v(0, 20, 0)));
    expect(hull.containsPoint(v(.1, .1, .1))).toBe(true);
    hull.faces.pop();
    expect(() => hull.containsPoint(v(.1, .1, .1))).toThrow(/faces were modified/);
    expect(() => hull.intersectRay(ray)).toThrow(/faces were modified/);
    hull.compute();
    expect(hull.newFaces).toEqual([]);
    expect(hull.assigned.isEmpty()).toBe(true);
    expect(hull.unassigned.isEmpty()).toBe(true);
    expect(hull.containsPoint(v(.1, .1, .1))).toBe(true);
    const face = hull.faces[0];
    if (!face) throw new Error("Expected a tetrahedron face");
    face.normal = v(0, 0, 0);
    expect(() => hull.containsPoint(v(.1, .1, .1))).toThrow(/faces were modified/);
    hull.compute();
    const edge = hull.faces[0]?.edge;
    if (!edge) throw new Error("Expected a linked edge");
    edge.twin = null;
    expect(() => hull.intersectsRay(ray)).toThrow(/faces were modified/);
    hull.compute();
    hull.vertices = cube.map((point) => new VertexNode(point));
    expect(hull.containsPoint(v(-.5, 0, 0))).toBe(false);
    hull.compute();
    expect(hull.containsPoint(v(-.5, 0, 0))).toBe(true);
    hull.makeEmpty();
    expect(hull.containsPoint(v(0, 0, 0))).toBe(false);
  });

  it("classifies near-flat shapes with a scale-relative threshold", () => {
    const flat = ConvexHull.fromPoints([v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(1, 1, 1e-16)]);
    expect(flat.containsPoint(v(.5, .5, 0))).toBe(true);
    expect(flat.containsPoint(v(.5, .5, 1e-5))).toBe(false);
    const thin = [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(0, 0, 1e-10)];
    const solid = ConvexHull.fromPoints(thin);
    expect(solid.faces).toHaveLength(4);
    expect(solid.containsPoint(v(.1, .1, 1e-11))).toBe(true);
    expect(solid.containsPoint(v(.1, .1, 1e-8))).toBe(false);
  });
});

describe("independent hull support types", () => {
  it("computes oriented face measurements and links twins", () => {
    const a = new VertexNode(v(0, 0, 0)), b = new VertexNode(v(2, 0, 0)), c = new VertexNode(v(0, 2, 0));
    const face = ConvexHullFace.create(a, b, c);
    expect(face.area).toBeCloseTo(2);
    expectPoint(face.normal, v(0, 0, 1));
    expectPoint(face.midpoint, v(2 / 3, 2 / 3, 0));
    expect(face.distanceToPoint(v(0, 0, 3))).toBeCloseTo(3);
    const firstEdge = face.edge;
    if (!firstEdge || !firstEdge.next) throw new Error("Expected linked face edges");
    expect(face.getEdge(-1)).toBe(firstEdge.prev);
    expect(firstEdge.next.length()).toBeCloseTo(2);
    const edge = new HalfEdge(a, face), twin = new HalfEdge(b, face);
    expect(edge.tail()).toBeNull();
    expect(edge.length()).toBe(0);
    expect(edge.setTwin(twin)).toBe(edge);
    expect(twin.twin).toBe(edge);
    const extreme = ConvexHullFace.create(new VertexNode(v(0, 0, 0)), new VertexNode(v(1e300, 0, 0)), new VertexNode(v(0, 1e-300, 0)));
    expect(extreme.area).toBeCloseTo(.5, 12);
    expectPoint(extreme.normal, v(0, 0, 1));
    const tiny = 2 ** -537;
    const subnormal = ConvexHullFace.create(new VertexNode(v(0, 0, 0)), new VertexNode(v(tiny, 0, 0)), new VertexNode(v(0, 1.25 * tiny, 0)));
    // The exact area is 0.625 times the least positive double, so it rounds
    // to that least positive double rather than to zero.
    expect(subnormal.area).toBe(Number.MIN_VALUE);
  });

  it("exposes nullable raw links throughout the unlinked and detached lifecycle", () => {
    const list = new VertexList(), node = new VertexNode(v(0, 0, 0)), face = new ConvexHullFace(), edge = new HalfEdge(node, face);
    expectTypeOf(list.head).toEqualTypeOf<VertexNode | null>();
    expectTypeOf(list.tail).toEqualTypeOf<VertexNode | null>();
    expectTypeOf(node.prev).toEqualTypeOf<VertexNode | null>();
    expectTypeOf(node.next).toEqualTypeOf<VertexNode | null>();
    expectTypeOf(node.face).toEqualTypeOf<ConvexHullFace | null>();
    expectTypeOf(edge.prev).toEqualTypeOf<HalfEdge | null>();
    expectTypeOf(edge.next).toEqualTypeOf<HalfEdge | null>();
    expectTypeOf(edge.twin).toEqualTypeOf<HalfEdge | null>();
    expectTypeOf(face.edge).toEqualTypeOf<HalfEdge | null>();
    expectTypeOf(face.outside).toEqualTypeOf<VertexNode | null>();
    expect([list.head, list.tail, node.prev, node.next, node.face, edge.prev, edge.next, edge.twin, face.edge, face.outside]).toEqual(Array(10).fill(null));
    expect(edge.tail()).toBeNull();
    list.append(node);
    expect(list.head).toBe(node);
    expect(list.tail).toBe(node);
    list.remove(node);
    expect([list.head, list.tail, node.prev, node.next]).toEqual([null, null, null, null]);
  });

  it("keeps finite face distances when large dot-product terms cancel", () => {
    const max = Number.MAX_VALUE;
    const originFace = ConvexHullFace.create(
      new VertexNode(v(0, 0, 0)),
      new VertexNode(v(1, -1, 0)),
      new VertexNode(v(1, 0, -1)),
    );
    // The normal is (1, 1, 1) / sqrt(3). The first two terms alone
    // exceed the largest double, but their sum with the third does not.
    const finiteDifferences = originFace.distanceToPoint(v(max, max, -max));
    expect(Number.isFinite(finiteDifferences)).toBe(true);
    expect(finiteDifferences / max).toBeCloseTo(1 / Math.sqrt(3), 14);

    const translated = ConvexHullFace.create(
      new VertexNode(v(-max, -max, max)),
      new VertexNode(v(-max / 2, -max, max / 2)),
      new VertexNode(v(-max, -max / 2, max / 2)),
    );
    expect(Number.isFinite(translated.constant)).toBe(true);
    expect(translated.constant / max).toBeCloseTo(-1 / Math.sqrt(3), 14);
    // Each x/y difference exceeds MAX_VALUE; the projected signed distance
    // is still representable: (1.8 + 1.8 - 2) * MAX_VALUE / sqrt(3).
    const overflowedDifferences = translated.distanceToPoint(v(.8 * max, .8 * max, -max));
    expect(Number.isFinite(overflowedDifferences)).toBe(true);
    expect(overflowedDifferences / max).toBeCloseTo(1.6 / Math.sqrt(3), 14);
    expect(translated.distanceToPoint(v(max, max, -max))).toBe(Infinity);
  });

  it("preserves reciprocal twins when either edge is reassigned", () => {
    const face = new ConvexHullFace();
    const [a, b, c, d] = [0, 1, 2, 3].map((x) => new HalfEdge(new VertexNode(v(x, 0, 0)), face)) as [HalfEdge, HalfEdge, HalfEdge, HalfEdge];
    a.setTwin(b);
    c.setTwin(d);
    a.setTwin(c);
    expect(a.twin).toBe(c);
    expect(c.twin).toBe(a);
    expect(b.twin).toBeNull();
    expect(d.twin).toBeNull();
    expect(() => a.setTwin(a)).toThrow(RangeError);
    expect(a.twin).toBe(c);
    expect(c.twin).toBe(a);
  });

  it("rejects foreign, overlapping, and reversed list operations without corruption", () => {
    const a = new VertexNode(v(0, 0, 0)), b = new VertexNode(v(1, 0, 0)), c = new VertexNode(v(2, 0, 0));
    const first = new VertexList().append(a).append(b), second = new VertexList().append(c);
    expect(() => first.remove(c)).toThrow(RangeError);
    expect(() => first.insertBefore(c, new VertexNode(v(3, 0, 0)))).toThrow(RangeError);
    expect(() => first.append(c)).toThrow(RangeError);
    expect(() => first.appendChain(a)).toThrow(RangeError);
    expect(() => first.removeSubList(b, a)).toThrow(RangeError);
    expect(first.first()).toBe(a);
    expect(first.last()).toBe(b);
    expect(a.next).toBe(b);
    expect(b.prev).toBe(a);
    expect(second.first()).toBe(c);
    expect(second.last()).toBe(c);
    first.remove(a);
    second.append(a);
    expect(second.first()).toBe(c);
    expect(second.last()).toBe(a);
    second.clear();
    const third = new VertexList().appendChain(c);
    expect(third.first()).toBe(c);
    expect(third.last()).toBe(a);
  });

  it("maintains linked vertex-list endpoints across insertion, removal, and chains", () => {
    const nodes = [0, 1, 2, 3, 4].map((x) => new VertexNode(v(x, 0, 0)));
    const [a, b, c, d, e] = nodes as [VertexNode, VertexNode, VertexNode, VertexNode, VertexNode];
    const list = new VertexList();
    expect(list.isEmpty()).toBe(true);
    expect(list.append(a).append(c).insertBefore(c, b).insertAfter(c, d)).toBe(list);
    expect(list.first()).toBe(a);
    expect(list.last()).toBe(d);
    expect(a.next).toBe(b);
    expect(b.next).toBe(c);
    expect(c.prev).toBe(b);
    expect(list.removeSubList(b, c)).toBe(list);
    expect(a.next).toBe(d);
    expect(d.prev).toBe(a);
    expect(list.appendChain(b)).toBe(list);
    expect(list.last()).toBe(c);
    expect(list.append(e).remove(a)).toBe(list);
    expect(list.first()).toBe(d);
    expect(list.last()).toBe(e);
    expect(list.clear().isEmpty()).toBe(true);
  });
});
