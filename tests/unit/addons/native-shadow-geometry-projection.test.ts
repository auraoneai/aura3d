import { describe, expect, it } from "vitest";
import { createShadowProjection } from "../../../packages/addons/src/objects/SpecializedObjects";
import type { AuraCustomGeometrySpec } from "../../../packages/engine/src/agent-api/RootGeometry";

type Vec2 = readonly [number, number];

function custom(positions: AuraCustomGeometrySpec["positions"], indices: AuraCustomGeometrySpec["indices"]): AuraCustomGeometrySpec {
  return { kind: "aura-custom-geometry", positions, indices };
}

function shadowTriangles(value: ReturnType<typeof createShadowProjection>): readonly (readonly [Vec2, Vec2, Vec2])[] {
  const positions = Array.from(value.geometry.positions as readonly number[]);
  const indices = Array.from(value.geometry.indices);
  const point = (index: number): Vec2 => [positions[index * 3]!, positions[index * 3 + 2]!];
  const result: [Vec2, Vec2, Vec2][] = [];
  for (let i = 0; i < indices.length; i += 3) result.push([point(indices[i]!), point(indices[i + 1]!), point(indices[i + 2]!)]);
  return result;
}

function signedArea([a, b, c]: readonly [Vec2, Vec2, Vec2]): number {
  return ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])) / 2;
}

function containsPoint([a, b, c]: readonly [Vec2, Vec2, Vec2], [x, y]: Vec2): boolean {
  const cross = (p: Vec2, q: Vec2) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const signs = [cross(a, b), cross(b, c), cross(c, a)];
  return signs.every((sign) => sign >= 0) || signs.every((sign) => sign <= 0);
}

const concave = () => custom([
  [0, 1, 0], [3, 1, 0], [3, 1, 1], [1, 1, 1], [1, 1, 3], [0, 1, 3]
], [0, 1, 3, 1, 2, 3, 0, 3, 5, 3, 4, 5]);

describe("geometry-aware projected shadow", () => {
  it("preserves a concave triangle footprint instead of filling its bounding hull", () => {
    const shadow = createShadowProjection({ casterGeometry: concave(), lightDirection: [0, -1, 0], offset: 0, opacity: 0.4 });
    const triangles = shadowTriangles(shadow);
    expect(triangles).toHaveLength(4);
    expect(triangles.map(signedArea).every((area) => area > 0)).toBe(true);
    expect(triangles.reduce((sum, triangle) => sum + signedArea(triangle), 0)).toBeCloseTo(5, 6);
    expect(triangles.some((triangle) => containsPoint(triangle, [0.5, 2]))).toBe(true);
    expect(triangles.some((triangle) => containsPoint(triangle, [2, 2]))).toBe(false);
    expect(shadow.bounds).toEqual({ min: [0, 0, 0], max: [3, 0, 3] });
    expect(shadow.node.toJSON().name).toBe("projected-geometry-shadow");
  });

  it("preserves a hole in a ring and permits its shared triangle edges", () => {
    const vertices = [
      [0, 1, 0], [3, 1, 0], [3, 1, 3], [0, 1, 3],
      [1, 1, 1], [2, 1, 1], [2, 1, 2], [1, 1, 2]
    ] as const;
    const faces = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const shadow = createShadowProjection({ casterGeometry: custom(vertices, faces), lightDirection: [0, -1, 0], offset: 0 });
    const triangles = shadowTriangles(shadow);
    expect(triangles).toHaveLength(8);
    expect(triangles.reduce((sum, triangle) => sum + signedArea(triangle), 0)).toBeCloseTo(8, 6);
    expect(triangles.some((triangle) => containsPoint(triangle, [1.5, 1.5]))).toBe(false);
    expect(triangles.some((triangle) => containsPoint(triangle, [0.5, 1.5]))).toBe(true);
  });

  it("applies a world transform and directional projection to a copied geometry snapshot", () => {
    const source = custom(new Float32Array([0, 1, 0, 1, 1, 0, 0, 1, 1]), new Uint16Array([0, 1, 2]));
    const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, -1, 1];
    const shadow = createShadowProjection({ casterGeometry: source, casterMatrix: transform, lightDirection: [0.5, -1, 0.25], offset: 0 });
    const triangle = shadowTriangles(shadow)[0]!;
    expect(shadow.bounds).toEqual({ min: [4, 0, 0], max: [5, 0, 1] });
    expect(signedArea(triangle)).toBeCloseTo(0.5, 6);
    (source.positions as Float32Array)[0] = 99;
    expect(shadow.bounds.min[0]).toBe(4);
  });

  it("rejects overlapping footprints instead of multiplying transparent shadow opacity", () => {
    const source = custom([
      [0, 1, 0], [2, 1, 0], [0, 1, 2],
      [0.25, 2, 0.25], [1, 2, 0.25], [0.25, 2, 1]
    ], [0, 1, 2, 3, 4, 5]);
    expect(() => createShadowProjection({ casterGeometry: source, lightDirection: [0, -1, 0] })).toThrow(/overlap/i);
    const duplicate = custom([0, 1, 0, 1, 1, 0, 0, 1, 1], [0, 1, 2, 2, 1, 0]);
    expect(() => createShadowProjection({ casterGeometry: duplicate, lightDirection: [0, -1, 0] })).toThrow(/overlap/i);
    // These triangles cross through their edges without either containing a
    // vertex of the other; containment-only tests would miss the overlap.
    const crossing = custom([
      [0, 1, 0], [2, 1, 0], [1, 1, 2],
      [0, 1, 1.5], [2, 1, 1.5], [1, 1, -0.5]
    ], [0, 1, 2, 3, 4, 5]);
    expect(() => createShadowProjection({ casterGeometry: crossing, lightDirection: [0, -1, 0] })).toThrow(/overlap/i);
  });

  it("permits a partial shared edge and ignores projected zero-area faces", () => {
    const source = custom([
      [0, 1, 0], [4, 1, 0], [0, 1, 2],
      [1, 1, 0], [3, 1, 0], [1, 1, -1],
      [6, 1, 0], [6, 2, 0], [7, 1, 0]
    ], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const shadow = createShadowProjection({ casterGeometry: source, lightDirection: [0, -1, 0], offset: 0 });
    const triangles = shadowTriangles(shadow);
    expect(triangles).toHaveLength(2);
    expect(triangles.reduce((sum, triangle) => sum + signedArea(triangle), 0)).toBeCloseTo(5, 6);
  });

  it("rejects unsupported geometry, unsafe transforms, invalid indices and work limits", () => {
    const base = concave();
    expect(() => createShadowProjection({ casterGeometry: { ...base, topology: "lines" }, lightDirection: [0, -1, 0] })).toThrow(/triangle/i);
    expect(() => createShadowProjection({ casterGeometry: { ...base, drawRange: { start: 0, count: 3 } }, lightDirection: [0, -1, 0] })).toThrow(/draw ranges/i);
    expect(() => createShadowProjection({ casterGeometry: { ...base, groups: [{ start: 0, count: 3 }] }, lightDirection: [0, -1, 0] })).toThrow(/groups/i);
    expect(() => createShadowProjection({ casterGeometry: { ...base, morphTargets: [{ positions: new Float32Array(18) }] }, lightDirection: [0, -1, 0] })).toThrow(/morph/i);
    expect(() => createShadowProjection({ casterGeometry: custom([0, 1, 0, 1, 1, 0, 0, 1, 1], [0, 1, 3]), lightDirection: [0, -1, 0] })).toThrow(/index/i);
    expect(() => createShadowProjection({ casterGeometry: base, casterMatrix: [1, 0], lightDirection: [0, -1, 0] })).toThrow(/matrix/i);
    expect(() => createShadowProjection({ casterGeometry: base, lightDirection: [0, -1, 0], maxTriangles: 2 })).toThrow(/triangle/i);
    expect(() => createShadowProjection({ casterGeometry: base, lightDirection: [0, -1, 0], maxOverlapChecks: 0 })).toThrow(/overlap/i);
    expect(() => createShadowProjection({ casterGeometry: base, lightDirection: [0, -1, 0], maxProjectionDistance: 0.5 })).toThrow(/distance/i);
    expect(() => createShadowProjection({ casterGeometry: base, lightDirection: [1, 0, 0] })).toThrow(/down/i);
    expect(() => createShadowProjection({ casterGeometry: custom([0, -1, 0, 1, 1, 0, 0, 1, 1], [0, 1, 2]), lightDirection: [0, -1, 0] })).toThrow(/receiver/i);
    expect(() => createShadowProjection({ casterGeometry: custom([1e9, 1, 0, 1e9 + 1, 1, 0, 1e9, 1, 1], [0, 1, 2]), lightDirection: [0, -1, 0] })).toThrow(/area|precision/i);
  });

  it("keeps the existing bounds projection path and rejects mixing inputs", () => {
    const bounds = { min: [0, 1, 0], max: [1, 2, 1] } as const;
    const result = createShadowProjection({ casterBounds: bounds, lightDirection: [0, -1, 0] });
    expect(result.node.toJSON().name).toBe("projected-bounds-shadow");
    expect(result.bounds).toEqual({ min: [0, 0, 0], max: [1, 0, 1] });
    expect(() => createShadowProjection({ casterBounds: bounds, casterGeometry: concave(), lightDirection: [0, -1, 0] } as never)).toThrow(/not both/i);
  });

  it("validates the receiver offset after the triangle plane is rounded to float32", () => {
    const receiverY = 16_777_217;
    const casterGeometry = custom([
      [0, 16_777_220, 0], [1, 16_777_220, 0], [0, 16_777_220, 1]
    ], [0, 1, 2]);
    expect(() => createShadowProjection({ casterGeometry, receiverY, offset: 1, lightDirection: [0, -1, 0] })).toThrow(/offset.*float32/i);

    const geometryShadow = createShadowProjection({ casterGeometry, receiverY, offset: 2, lightDirection: [0, -1, 0] });
    expect(geometryShadow.bounds.min[1]).toBe(16_777_216);
    expect(Math.fround((geometryShadow.geometry.positions as readonly number[])[1]!)).toBe(16_777_218);

    // The legacy bounds path uses its original unrounded receiver plane.
    const boundsShadow = createShadowProjection({ casterBounds: { min: [0, 16_777_220, 0], max: [1, 16_777_222, 1] }, receiverY, offset: 1, lightDirection: [0, -1, 0] });
    expect(boundsShadow.bounds.min[1]).toBe(receiverY);
    expect(Math.fround((boundsShadow.geometry.positions as readonly number[])[1]!)).toBe(16_777_218);
  });
});
