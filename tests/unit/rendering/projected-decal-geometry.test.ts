import { describe, expect, it } from "vitest";
import {
  createProjectedDecalGeometry,
  createRaycastProjectedDecalGeometry,
  raycastProjectedDecalMesh
} from "../../../packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry";

describe("createProjectedDecalGeometry", () => {
  it("clips source mesh triangles to a decal projection box and emits lit textured geometry", () => {
    const result = createProjectedDecalGeometry({
      positions: [
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [-1, 1, 0]
      ],
      normals: [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1]
      ],
      indices: [0, 1, 2, 0, 2, 3]
    }, {
      center: [0, 0, 0],
      size: [1, 1, 0.25],
      normalOffset: 0
    });

    expect(result.sourceTriangleCount).toBe(2);
    expect(result.clippedTriangleCount).toBeGreaterThanOrEqual(2);
    expect(result.vertexCount).toBeGreaterThanOrEqual(6);
    expect(result.geometry.vertexBuffer.format.hasAttribute("position")).toBe(true);
    expect(result.geometry.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(result.geometry.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(result.geometry.indexBuffer?.count ?? 0).toBe(result.clippedTriangleCount * 3);
    const uv = result.geometry.vertexBuffer.getAttribute(0, "uv");
    expect(uv[0]).toBeGreaterThanOrEqual(0);
    expect(uv[0]).toBeLessThanOrEqual(1);
    expect(uv[1]).toBeGreaterThanOrEqual(0);
    expect(uv[1]).toBeLessThanOrEqual(1);
  });

  it("rejects projection boxes that do not intersect the source mesh", () => {
    expect(() => createProjectedDecalGeometry({
      positions: [[-1, -1, 0], [1, -1, 0], [0, 1, 0]],
      normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]]
    }, {
      center: [4, 4, 4],
      size: [0.5, 0.5, 0.5]
    })).toThrow(/did not intersect/);
  });

  it("places an oriented decal projector from a mesh raycast hit", () => {
    const mesh = {
      positions: [
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [-1, 1, 0]
      ],
      normals: [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1]
      ],
      indices: [0, 1, 2, 0, 2, 3]
    } as const;

    const result = createRaycastProjectedDecalGeometry(mesh, {
      origin: [0.2, 0.1, 2],
      direction: [0, 0, -1]
    }, {
      size: [0.8, 0.8, 0.25],
      normalOffset: 0,
      maxDistance: 4
    });

    expect(result.hit.distance).toBeCloseTo(2);
    expect(result.hit.position).toEqual([0.2, 0.1, 0]);
    expect(result.hit.normal).toEqual([0, 0, 1]);
    expect(result.box.basis?.normal).toEqual([0, 0, 1]);
    expect(result.clippedTriangleCount).toBeGreaterThan(0);
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.geometry.vertexBuffer.getAttribute(0, "uv")[0]).toBeGreaterThanOrEqual(0);
  });

  it("clips projected decals to an ellipse when requested", () => {
    const result = createProjectedDecalGeometry({
      positions: [
        [-1, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
        [-1, 1, 0]
      ],
      normals: [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1]
      ],
      indices: [0, 1, 2, 0, 2, 3]
    }, {
      center: [0, 0, 0],
      size: [1, 1, 0.25],
      normalOffset: 0,
      shape: "ellipse",
      ellipseSegments: 24
    });

    expect(result.clippedTriangleCount).toBeGreaterThanOrEqual(24);
    for (let index = 0; index < result.geometry.vertexBuffer.vertexCount; index += 1) {
      const uv = result.geometry.vertexBuffer.getAttribute(index, "uv");
      const x = uv[0]! * 2 - 1;
      const y = 1 - uv[1]! * 2;
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.02);
    }
  });

  it("returns closest raycast hits and respects backface options", () => {
    const mesh = {
      positions: [
        [-1, -1, 0],
        [1, -1, 0],
        [0, 1, 0],
        [-1, -1, 2],
        [1, -1, 2],
        [0, 1, 2]
      ],
      indices: [0, 1, 2, 3, 4, 5]
    } as const;

    const hit = raycastProjectedDecalMesh(mesh, {
      origin: [0, 0, 4],
      direction: [0, 0, -1]
    }, {
      maxDistance: 5
    });
    expect(hit?.distance).toBeCloseTo(2);
    expect(hit?.triangleIndex).toBe(1);

    expect(raycastProjectedDecalMesh(mesh, {
      origin: [0, 0, -1],
      direction: [0, 0, 1]
    })).toBeUndefined();
    expect(raycastProjectedDecalMesh(mesh, {
      origin: [0, 0, -1],
      direction: [0, 0, 1]
    }, {
      includeBackfaces: true
    })?.distance).toBeCloseTo(1);
  });
});
