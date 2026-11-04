import { describe, expect, it } from "vitest";
import {
  ConvexHull, ConvexHullFace, HalfEdge, Ray, Vector3, VertexList, VertexNode
} from "../../../packages/math/src/index.js";
import * as independent from "../../../packages/math/src/independent/ConvexHull.js";
import { HullVector3 } from "../../../packages/math/src/independent/HullPrimitives.js";

// 5.0 decision (docs/migration/4-to-5.md B17): the public `@aura3d/math` hull is the independently written
// hull, re-exported from packages/math/src/ConvexHull.ts. Its full behavior contract (orientation, degeneracy,
// topology, bounds, list ownership) is tested against the independent module in native-convex-hull.test.ts and
// native-independent-hull-entry.test.ts. This file pins the public surface: the root classes ARE those classes,
// and root `Vector3`/`Ray` values remain valid inputs.

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const cube = (): Vector3[] => [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => v(x, y, z))));

describe("Aura3D root convex hull: independent implementation", () => {
  it("re-exports exactly the independent hull classes", () => {
    expect(ConvexHull).toBe(independent.ConvexHull);
    expect(ConvexHullFace).toBe(independent.ConvexHullFace);
    expect(HalfEdge).toBe(independent.HalfEdge);
    expect(VertexNode).toBe(independent.VertexNode);
    expect(VertexList).toBe(independent.VertexList);
  });

  it("accepts root Vector3 points and Ray values and answers with frozen HullVector3 results", () => {
    const points = cube();
    const hull = ConvexHull.fromPoints(points);
    expect(hull.faces).toHaveLength(12);
    expect(hull.vertices.map((node) => node.point)).toEqual(points);
    expect(hull.containsPoint(v(0.5, -0.5, 0.25))).toBe(true);
    expect(hull.containsPoint(v(1.5, 0, 0))).toBe(false);

    const hit = hull.intersectRay(new Ray(v(-3, 0.25, 0.5), v(1, 0, 0)));
    expect(hit).toBeInstanceOf(HullVector3);
    expect(hit).not.toBeInstanceOf(Vector3);
    expect(Object.isFrozen(hit)).toBe(true);
    expect(hit!.x).toBeCloseTo(-1, 12);
    expect(hit!.y).toBeCloseTo(0.25, 12);
    expect(hit!.z).toBeCloseTo(0.5, 12);
    expect(hull.intersectRay(new Ray(v(-3, 4, 0), v(1, 0, 0)))).toBeUndefined();

    for (const face of hull.faces) {
      expect(face.normal).toBeInstanceOf(HullVector3);
      expect(face.normal.length()).toBeCloseTo(1, 12);
      expect(face.edge).not.toBeNull();
    }
  });

  it("is bounded and rejects non-finite input with RangeError", () => {
    expect(() => new ConvexHull().setFromPoints([v(NaN, 0, 0)])).toThrow(RangeError);
    expect(() => new ConvexHull().setFromPoints(Array.from({ length: 8_193 }, (_, i) => v(i, 0, 0)))).toThrow(RangeError);
  });
});
