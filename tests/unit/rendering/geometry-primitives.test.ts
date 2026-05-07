import { describe, expect, it } from "vitest";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat, applyMorphTargets } from "../../../packages/rendering/src";

describe("Geometry primitives", () => {
  it("creates finite line segment geometry for renderer line topology", () => {
    const lines = Geometry.lineSegments([
      [-0.75, -0.5, 0],
      [0.75, 0.5, 0],
      [-0.75, 0.5, 0],
      [0.75, -0.5, 0]
    ]);

    expect(lines.topology).toBe("lines");
    expect(lines.vertexBuffer.vertexCount).toBe(4);
    expect(lines.indexBuffer).toBeNull();
    expect(lines.bounds).toEqual({
      min: [-0.75, -0.5, 0],
      max: [0.75, 0.5, 0]
    });
    expect(() => Geometry.lineSegments([[0, 0, 0]])).toThrow(/pairs/);
    expect(() => Geometry.lineSegments([[0, 0, 0], [Number.NaN, 0, 0]])).toThrow(/finite vec3/);
  });

  it("creates finite point geometry for renderer point topology", () => {
    const points = Geometry.points([
      [-0.75, -0.5, 0],
      [0, 0.5, 0],
      [0.75, -0.5, 0]
    ]);

    expect(points.topology).toBe("points");
    expect(points.vertexBuffer.vertexCount).toBe(3);
    expect(points.indexBuffer).toBeNull();
    expect(points.bounds).toEqual({
      min: [-0.75, -0.5, 0],
      max: [0.75, 0.5, 0]
    });
    expect(() => Geometry.points([])).toThrow(/at least one/);
    expect(() => Geometry.points([[0, Number.NaN, 0]])).toThrow(/finite vec3/);
  });

  it("creates lit cube and UV sphere geometry with normals and stable bounds", () => {
    const cube = Geometry.litCube(2);
    expect(cube.vertexBuffer.vertexCount).toBe(24);
    expect(cube.indexBuffer?.count).toBe(36);
    expect(cube.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(cube.bounds.min).toEqual([-1, -1, -1]);
    expect(cube.bounds.max).toEqual([1, 1, 1]);

    const sphere = Geometry.uvSphere(1, 8, 4);
    expect(sphere.vertexBuffer.vertexCount).toBe(45);
    expect(sphere.indexBuffer?.count).toBe(192);
    expect(sphere.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(sphere.bounds.min[1]).toBe(-1);
    expect(sphere.bounds.max[1]).toBe(1);

    const texturedCube = Geometry.texturedCube(2);
    expect(texturedCube.vertexBuffer.vertexCount).toBe(24);
    expect(texturedCube.indexBuffer?.count).toBe(36);
    expect(texturedCube.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(texturedCube.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
    expect(texturedCube.vertexBuffer.getAttribute(0, "normal")).toEqual([0, 0, 1]);
    expect(texturedCube.vertexBuffer.getAttribute(0, "tangent")).toEqual([1, 0, 0, 1]);
    expect(texturedCube.vertexBuffer.getAttribute(0, "uv")).toEqual([0, 0]);
  });

  it("applies weighted morph target deltas to positions and normals", () => {
    const base = Geometry.litTriangle();
    const morphed = applyMorphTargets(base, [
      {
        positions: [[0, 0, 0], [0, 0, 1], [0, 0, 2]],
        normals: [[0, 0, 0], [0, 1, 0], [0, 1, 0]]
      }
    ], [0.5]);

    expect(morphed.vertexBuffer.getAttribute(1, "position")).toEqual([0.5, -0.5, 0.5]);
    expect(morphed.vertexBuffer.getAttribute(2, "position")).toEqual([0, 0.5, 1]);
    expect(morphed.vertexBuffer.getAttribute(1, "normal").map((value) => Number(value.toFixed(3)))).toEqual([0, 0.447, 0.894]);
    expect(Array.from(morphed.indexBuffer?.data ?? [])).toEqual(Array.from(base.indexBuffer?.data ?? []));
    expect(base.vertexBuffer.getAttribute(2, "position")).toEqual([0, 0.5, 0]);
  });

  it("applies tangent morph target deltas while preserving handedness", () => {
    const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(0, "normal", [0, 0, 1]);
    vertices.setAttribute(0, "tangent", [1, 0, 0, -1]);
    vertices.setAttribute(0, "uv", [0, 0]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(1, "normal", [0, 0, 1]);
    vertices.setAttribute(1, "tangent", [1, 0, 0, 1]);
    vertices.setAttribute(1, "uv", [1, 0]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    vertices.setAttribute(2, "normal", [0, 0, 1]);
    vertices.setAttribute(2, "tangent", [1, 0, 0, 1]);
    vertices.setAttribute(2, "uv", [0.5, 1]);
    const base = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));

    const morphed = applyMorphTargets(base, [
      {
        tangents: [[0, 1, 0], [0, 0, 0], [-1, 1, 0]]
      }
    ], [1]);

    expect(morphed.vertexBuffer.getAttribute(0, "tangent").map((value) => Number(value.toFixed(3)))).toEqual([0.707, 0.707, 0, -1]);
    expect(morphed.vertexBuffer.getAttribute(1, "tangent")).toEqual([1, 0, 0, 1]);
    expect(morphed.vertexBuffer.getAttribute(2, "tangent").map((value) => Number(value.toFixed(3)))).toEqual([0, 1, 0, 1]);
    expect(morphed.vertexBuffer.getAttribute(0, "uv")).toEqual([0, 0]);
  });
});
