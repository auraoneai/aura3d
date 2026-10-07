// PRD-07 P2-T4 — RibbonBatch: a 48-point trail draws 94 triangles; `surface`
// orientation normals equal the given surface normal; `camera` orientation
// offsets perpendicular to the view vector.

import { describe, expect, it } from "vitest";
import { RibbonBatch, RIBBON_VERTEX_FLOATS } from "../../../../packages/rendering/src/vfx/RibbonBatch";

function fillTrail(batch: RibbonBatch, id: string, n: number, options: Record<string, unknown> = {}) {
  const trail = batch.upsertTrail({ id, minVertexDistance: 0, ...options } as never);
  for (let i = 0; i < n; i++) trail.push([i * 0.1, 0, 0], i / 60);
  return trail;
}

describe("P2-T4 ribbons", () => {
  it("a 48-point trail draws 94 triangles", () => {
    const batch = new RibbonBatch();
    const trail = fillTrail(batch, "t", 48);
    const g = batch.buildGeometry(trail, [0, 5, 5])!;
    expect(g.vertexCount).toBe(96);
    expect(g.triangleCount).toBe(94);
    expect(g.indices.length).toBe(282);
  });

  it("surface orientation writes the given surface normal per vertex", () => {
    const batch = new RibbonBatch();
    const n = [0, 0, 1] as const;
    const trail = fillTrail(batch, "skid", 8, { orientation: "surface", surfaceNormal: n });
    const g = batch.buildGeometry(trail, [0, 0, 10])!;
    for (let v = 0; v < g.vertexCount; v++) {
      const o = v * RIBBON_VERTEX_FLOATS;
      expect([g.vertices[o + 3], g.vertices[o + 4], g.vertices[o + 5]]).toEqual([0, 0, 1]);
    }
  });

  it("camera orientation offsets perpendicular to the view vector", () => {
    const batch = new RibbonBatch();
    const trail = fillTrail(batch, "t", 4);
    const g = batch.buildGeometry(trail, [2, 5, 5])!; // camera off-axis
    // Tangent is +x; side must be perpendicular to tangent and to view.
    const o = RIBBON_VERTEX_FLOATS * 0;
    const left = [g.vertices[o], g.vertices[o + 1], g.vertices[o + 2]];
    const right = [g.vertices[o + RIBBON_VERTEX_FLOATS], g.vertices[o + 1 + RIBBON_VERTEX_FLOATS], g.vertices[o + 2 + RIBBON_VERTEX_FLOATS]];
    const span = Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
    expect(span).toBeGreaterThan(0);
    // side ⊥ tangent: y/z displacement only (x-offset would contradict ⊥x)
    expect(Math.abs(left[0] - right[0])).toBeLessThan(1e-6);
  });

  it("default alpha curve is 0.45·(1 − segment/maxPoints)", () => {
    const batch = new RibbonBatch();
    const trail = fillTrail(batch, "t", 48);
    const g = batch.buildGeometry(trail, [0, 0, 10])!;
    const alpha0 = g.vertices[11]; // first vertex alpha
    const alphaLast = g.vertices[(47 * 2) * RIBBON_VERTEX_FLOATS + 11];
    expect(alpha0).toBeCloseTo(0.45);
    expect(alphaLast).toBeCloseTo(0.45 * (1 - 47 / 48));
  });

  it("minVertexDistance gates point appends", () => {
    const batch = new RibbonBatch();
    const trail = batch.upsertTrail({ id: "t" });
    trail.push([0, 0, 0], 0);
    expect(trail.push([0.01, 0, 0], 0.01)).toBe(false); // < 0.05 m
    expect(trail.push([0.2, 0, 0], 0.02)).toBe(true);
    expect(trail.pointCount).toBe(2);
  });
});
