import { describe, expect, it } from "vitest";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat, applyMorphTargets, computeMorphTargetEnvelopeBounds, computeSkinnedGeometryBounds } from "../../../packages/rendering/src";

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

  it("creates finite wide line geometry as indexed triangle quads", () => {
    const wide = Geometry.wideLineSegments([
      { start: [-1, 0, 0], end: [1, 0, 0], width: 0.2 },
      { start: [0, -1, 0], end: [0, 1, 0], width: 0.1 }
    ]);

    expect(wide.topology).toBe("triangles");
    expect(wide.vertexBuffer.vertexCount).toBe(8);
    expect(wide.indexBuffer?.count).toBe(12);
    expect(wide.bounds.min[0]).toBeLessThanOrEqual(-1);
    expect(wide.bounds.max[0]).toBeGreaterThanOrEqual(1);
    expect(wide.bounds.min[1]).toBeLessThanOrEqual(-1);
    expect(wide.bounds.max[1]).toBeGreaterThanOrEqual(1);
    expect(() => Geometry.wideLineSegments([])).toThrow(/at least one/);
    expect(() => Geometry.wideLineSegments([{ start: [0, 0, 0], end: [0, 0, 0], width: 1 }])).toThrow(/non-zero/);
    expect(() => Geometry.wideLineSegments([{ start: [0, 0, 0], end: [1, 0, 0], width: 0 }])).toThrow(/width/);
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

  it("validates vertex attributes before GPU upload can receive invalid data", () => {
    const vertices = new VertexBuffer(VertexFormat.P3N3, 1);

    expect(() => vertices.setAttribute(0, "position", [0, 1])).toThrow(/requires 3 values/);
    expect(() => vertices.setAttribute(0, "position", [0, Number.NaN, 1])).toThrow(/finite/);
    expect(() => vertices.setAttribute(1, "position", [0, 1, 2])).toThrow(/out of range/);
    expect(() => vertices.setAttribute(0, "uv", [0, 0])).toThrow(/semantic uv/i);
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
    expect(triangleWinding(sphere)).toMatchObject({ inward: 0, outward: 48 });

    const texturedCube = Geometry.texturedCube(2);
    expect(texturedCube.vertexBuffer.vertexCount).toBe(24);
    expect(texturedCube.indexBuffer?.count).toBe(36);
    expect(texturedCube.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(texturedCube.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
    expect(texturedCube.vertexBuffer.getAttribute(0, "normal")).toEqual([0, 0, 1]);
    expect(texturedCube.vertexBuffer.getAttribute(0, "tangent")).toEqual([1, 0, 0, 1]);
    expect(texturedCube.vertexBuffer.getAttribute(0, "uv")).toEqual([0, 0]);

    const texturedSphere = Geometry.uvSphere(1, 8, 4, { textured: true });
    expect(texturedSphere.vertexBuffer.vertexCount).toBe(45);
    expect(texturedSphere.indexBuffer?.count).toBe(192);
    expect(texturedSphere.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(texturedSphere.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(texturedSphere.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
    expect(texturedSphere.vertexBuffer.getAttribute(0, "uv")).toEqual([0, 0]);
    expect(texturedSphere.vertexBuffer.getAttribute(0, "tangent").map((value) => Object.is(value, -0) ? 0 : value)).toEqual([0, 0, 1, 1]);
  });

  it("uses smooth primitive defaults for showcase-quality generated geometry", () => {
    const sphere = Geometry.uvSphere();
    const cylinder = Geometry.cylinder();
    const capsule = Geometry.capsule();

    expect(sphere.vertexBuffer.vertexCount).toBe((24 + 1) * (48 + 1));
    expect(sphere.indexBuffer?.count).toBe(48 * 24 * 6);
    expect(cylinder.vertexBuffer.vertexCount).toBeGreaterThanOrEqual(194);
    expect(cylinder.indexBuffer?.count).toBeGreaterThanOrEqual(576);
    expect(capsule.vertexBuffer.vertexCount).toBe((48 + 1) * ((12 + 1) * 2));
    expect(capsule.indexBuffer?.count).toBe(48 * (((12 + 1) * 2) - 1) * 6);
  });

  it("creates capped cylinders with lit or textured vertex contracts", () => {
    const cylinder = Geometry.cylinder({ radius: 0.4, height: 1.6, segments: 12 });
    expect(cylinder.vertexBuffer.vertexCount).toBe(54);
    expect(cylinder.indexBuffer?.count).toBe(144);
    expect(cylinder.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(cylinder.vertexBuffer.format.hasAttribute("uv")).toBe(false);
    expect(cylinder.bounds.min.map((value) => Number(value.toFixed(3)))).toEqual([-0.4, -0.8, -0.4]);
    expect(cylinder.bounds.max.map((value) => Number(value.toFixed(3)))).toEqual([0.4, 0.8, 0.4]);
    expect(cylinder.vertexBuffer.getAttribute(0, "normal").map((value) => Number(value.toFixed(3)))).toEqual([1, 0, 0]);
    expect(triangleWinding(cylinder)).toMatchObject({ inward: 0, outward: 48 });

    const textured = Geometry.cylinder({ radius: 0.5, height: 1, segments: 8, capped: false, textured: true });
    expect(textured.vertexBuffer.vertexCount).toBe(18);
    expect(textured.indexBuffer?.count).toBe(48);
    expect(textured.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(textured.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
    expect(textured.vertexBuffer.getAttribute(0, "uv")).toEqual([0, 0]);
    expect(textured.vertexBuffer.getAttribute(1, "uv")).toEqual([0, 1]);
    expect(triangleWinding(textured)).toMatchObject({ inward: 0, outward: 16 });

    expect(() => Geometry.cylinder({ radius: 0 })).toThrow(/radius/i);
    expect(() => Geometry.cylinder({ height: -1 })).toThrow(/height/i);
    expect(() => Geometry.cylinder({ segments: 2 })).toThrow(/segments/i);
  });

  it("creates capsules with stable bounds, normals, and texture attributes", () => {
    const capsule = Geometry.capsule({ radius: 0.35, height: 1.7, segments: 10, rings: 4, textured: true });
    expect(capsule.vertexBuffer.vertexCount).toBe(110);
    expect(capsule.indexBuffer?.count).toBe(540);
    expect(capsule.vertexBuffer.format.hasAttribute("normal")).toBe(true);
    expect(capsule.vertexBuffer.format.hasAttribute("uv")).toBe(true);
    expect(capsule.vertexBuffer.format.hasAttribute("tangent")).toBe(true);
    expect(capsule.bounds.min.map((value) => Number(value.toFixed(3)))).toEqual([-0.35, -0.85, -0.333]);
    expect(capsule.bounds.max.map((value) => Number(value.toFixed(3)))).toEqual([0.35, 0.85, 0.333]);
    expect(capsule.vertexBuffer.getAttribute(0, "normal").map((value) => Number(value.toFixed(3)))).toEqual([0, 1, 0]);
    expect(capsule.vertexBuffer.getAttribute(5, "uv")[0]).toBe(0.5);
    expect(triangleWinding(capsule)).toMatchObject({ inward: 0, outward: 160 });

    expect(() => Geometry.capsule({ radius: 0 })).toThrow(/radius/i);
    expect(() => Geometry.capsule({ radius: 1, height: 1 })).toThrow(/height/i);
    expect(() => Geometry.capsule({ rings: 1 })).toThrow(/rings/i);
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

  it("computes conservative morph target envelope bounds for camera framing and culling", () => {
    const base = Geometry.litTriangle();
    const bounds = computeMorphTargetEnvelopeBounds(base, [
      { positions: [[-0.25, 0, 0], [0.75, 0, 0], [0, 1.5, 0]] },
      { positions: [[0, -0.5, 0], [0, 0, 0], [0.4, -0.2, 0.8]] }
    ]);

    expect(bounds.min.map((value) => Number(value.toFixed(3)))).toEqual([-0.75, -1, 0]);
    expect(bounds.max.map((value) => Number(value.toFixed(3)))).toEqual([1.25, 2, 0.8]);
  });

  it("computes skinned geometry bounds from joint palettes for camera framing and culling", () => {
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(0, "joints", [0, 0, 0, 0]);
    vertices.setAttribute(0, "weights", [1, 0, 0, 0]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(1, "joints", [1, 0, 0, 0]);
    vertices.setAttribute(1, "weights", [1, 0, 0, 0]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    vertices.setAttribute(2, "joints", [0, 1, 0, 0]);
    vertices.setAttribute(2, "weights", [0.5, 0.5, 0, 0]);
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const bounds = computeSkinnedGeometryBounds(geometry, {
      jointCount: 2,
      matrices: new Float32Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1
      ])
    });

    expect(bounds.min.map((value) => Number(value.toFixed(3)))).toEqual([-0.5, -0.5, 0]);
    expect(bounds.max.map((value) => Number(value.toFixed(3)))).toEqual([2.5, 0.5, 0]);
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

function triangleWinding(geometry: Geometry): { readonly outward: number; readonly inward: number; readonly degenerate: number } {
  const indices = Array.from(geometry.indexBuffer?.data ?? []);
  let outward = 0;
  let inward = 0;
  let degenerate = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = geometry.vertexBuffer.getAttribute(indices[offset]!, "position");
    const b = geometry.vertexBuffer.getAttribute(indices[offset + 1]!, "position");
    const c = geometry.vertexBuffer.getAttribute(indices[offset + 2]!, "position");
    const normal = cross(subtract(b, a), subtract(c, a));
    const center = [
      ((a[0] ?? 0) + (b[0] ?? 0) + (c[0] ?? 0)) / 3,
      ((a[1] ?? 0) + (b[1] ?? 0) + (c[1] ?? 0)) / 3,
      ((a[2] ?? 0) + (b[2] ?? 0) + (c[2] ?? 0)) / 3
    ] as const;
    const direction = dot(normal, center);
    if (Math.abs(direction) < 1e-8) {
      degenerate += 1;
    } else if (direction > 0) {
      outward += 1;
    } else {
      inward += 1;
    }
  }
  return { outward, inward, degenerate };
}

function subtract(left: readonly number[], right: readonly number[]): readonly [number, number, number] {
  return [
    (left[0] ?? 0) - (right[0] ?? 0),
    (left[1] ?? 0) - (right[1] ?? 0),
    (left[2] ?? 0) - (right[2] ?? 0)
  ];
}

function cross(left: readonly number[], right: readonly number[]): readonly [number, number, number] {
  return [
    (left[1] ?? 0) * (right[2] ?? 0) - (left[2] ?? 0) * (right[1] ?? 0),
    (left[2] ?? 0) * (right[0] ?? 0) - (left[0] ?? 0) * (right[2] ?? 0),
    (left[0] ?? 0) * (right[1] ?? 0) - (left[1] ?? 0) * (right[0] ?? 0)
  ];
}

function dot(left: readonly number[], right: readonly number[]): number {
  return (left[0] ?? 0) * (right[0] ?? 0) + (left[1] ?? 0) * (right[1] ?? 0) + (left[2] ?? 0) * (right[2] ?? 0);
}
