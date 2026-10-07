/**
 * PRD-01 Phase-1 C-07 conformance (lane 01): for every primitive, every
 * non-degenerate triangle's geometric normal agrees with the averaged vertex
 * normal (dot > 0); indices in range; UVs in [0,1]; tangents orthogonal to
 * normals (|dot| < 1e-4) with w = ±1; bounds match spec; Uint32 indices above
 * 65,535 vertices. Plus capsule folding (§6.3) and tier halving.
 */

import { describe, expect, it } from "vitest";

import { Geometry, createPrimitiveGeometry, clearPrimitiveGeometryCache, primitiveGeometryCacheSize, type AuraPrimitiveKind } from "@aura3d/rendering";

const FULL = { primitiveSegments: "full" as const };
const HALF = { primitiveSegments: "half" as const };

const PRIMITIVES: readonly AuraPrimitiveKind[] = ["box", "sphere", "plane", "cylinder", "capsule", "torus"];

function triangles(geometry: Geometry): readonly number[] {
  const idx = geometry.indexBuffer;
  if (!idx) throw new Error("expected indexed geometry");
  return idx.data as unknown as readonly number[];
}

interface Attrs {
  pos(i: number): readonly [number, number, number];
  nrm(i: number): readonly [number, number, number];
  uv(i: number): readonly [number, number] | undefined;
  tan(i: number): readonly [number, number, number, number] | undefined;
  count: number;
}

function attrs(geometry: Geometry): Attrs {
  const vb = geometry.vertexBuffer;
  const hasUv = vb.format.hasAttribute("uv");
  const hasTan = vb.format.hasAttribute("tangent");
  return {
    pos: (i) => vb.getAttribute(i, "position") as readonly [number, number, number],
    nrm: (i) => vb.getAttribute(i, "normal") as readonly [number, number, number],
    uv: hasUv ? (i) => vb.getAttribute(i, "uv") as readonly [number, number] : () => undefined,
    tan: hasTan ? (i) => vb.getAttribute(i, "tangent") as readonly [number, number, number, number] : () => undefined,
    count: vb.vertexCount
  };
}

describe("prd01 C-07 primitive geometry conformance", () => {
  it.each(PRIMITIVES)("%s: indices in range, non-degenerate triangles face the vertex normals", (kind) => {
    const g = createPrimitiveGeometry(kind, undefined, FULL, kind === "capsule" ? [1, 1, 1] : undefined);
    const a = attrs(g);
    const idx = triangles(g);
    let maxIndex = 0;
    for (const index of idx) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(a.count);
      maxIndex = Math.max(maxIndex, index);
    }
    let checked = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [i0, i1, i2] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      const p0 = a.pos(i0);
      const p1 = a.pos(i1);
      const p2 = a.pos(i2);
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as const;
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]] as const;
      const cross = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0]
      ] as const;
      const len = Math.hypot(cross[0], cross[1], cross[2]);
      if (len < 1e-9) continue; // degenerate (e.g. sphere pole seam)
      const avg = [0, 0, 0] as [number, number, number];
      for (const i of [i0, i1, i2]) {
        const n = a.nrm(i);
        avg[0] += n[0];
        avg[1] += n[1];
        avg[2] += n[2];
      }
      const dot = cross[0] * avg[0] + cross[1] * avg[1] + cross[2] * avg[2];
      expect(dot, `triangle ${t / 3} normal disagrees with vertex normals`).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(PRIMITIVES)("%s: UVs in [0,1], tangents orthogonal (|dot| < 1e-4, w = ±1)", (kind) => {
    const g = createPrimitiveGeometry(kind, undefined, FULL, kind === "capsule" ? [1, 1, 1] : undefined);
    const a = attrs(g);
    for (let i = 0; i < a.count; i += 1) {
      const uv = a.uv(i);
      expect(uv, `${kind} must emit uv`).toBeDefined();
      expect(uv![0]).toBeGreaterThanOrEqual(0);
      expect(uv![0]).toBeLessThanOrEqual(1);
      expect(uv![1]).toBeGreaterThanOrEqual(0);
      expect(uv![1]).toBeLessThanOrEqual(1);
      const tan = a.tan(i)!;
      expect(tan, `${kind} must emit tangent`).toBeDefined();
      const n = a.nrm(i);
      const dot = Math.abs(tan[0] * n[0] + tan[1] * n[1] + tan[2] * n[2]);
      expect(dot).toBeLessThan(1e-4);
      expect(Math.abs(tan[3])).toBe(1);
    }
  });

  it("bounds match spec for every primitive", () => {
    const eps = 1e-5;
    const cases: [AuraPrimitiveKind, readonly [number, number, number], readonly [number, number, number]][] = [
      ["sphere", [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
      ["box", [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
      ["plane", [-0.5, 0, -0.5], [0.5, 0, 0.5]],
      ["cylinder", [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
      ["torus", [-0.475, -0.475, -0.045], [0.475, 0.475, 0.045]],
      ["capsule", [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]]
    ];
    for (const [kind, min, max] of cases) {
      const g = createPrimitiveGeometry(kind, undefined, FULL, kind === "capsule" ? [1, 1, 1] : undefined);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(g.bounds.min[axis], `${kind} bounds.min[${axis}]`).toBeCloseTo(min[axis]!, 4);
        expect(g.bounds.max[axis], `${kind} bounds.max[${axis}]`).toBeCloseTo(max[axis]!, 4);
      }
      void eps;
    }
  });

  it("capsule folds size [0.2,1,0.2] into hemispherical ends r=0.1 over a 0.8 straight section", () => {
    const g = createPrimitiveGeometry("capsule", undefined, FULL, [0.2, 1, 0.2]);
    const a = attrs(g);
    // Cylinder half-height = height/2 - radius = 0.5 - 0.1 = 0.4: the straight
    // band spans |y| <= 0.4 with radius exactly 0.1; the ends are hemisphere
    // rings at |y| in [0.4, 0.5].
    let hasStraightRing = false;
    let hasPole = false;
    for (let i = 0; i < a.count; i += 1) {
      const [x, y, z] = a.pos(i);
      const r = Math.hypot(x, z);
      if (Math.abs(Math.abs(y) - 0.4) < 1e-5) {
        hasStraightRing = true;
        expect(r).toBeCloseTo(0.1, 5);
      }
      if (Math.abs(y) > 0.499) {
        hasPole = true;
        expect(r).toBeLessThan(0.02);
      }
      // Ends curve inward: |y| > 0.4 implies radius < 0.1.
      if (Math.abs(y) > 0.40001) {
        expect(r).toBeLessThan(0.1 + 1e-4);
      }
    }
    expect(hasStraightRing).toBe(true);
    expect(hasPole).toBe(true);
    expect(g.bounds.max[0]).toBeCloseTo(0.1, 5);
    expect(g.bounds.max[2]).toBeCloseTo(0.1, 5);
    expect(g.bounds.max[1]).toBeCloseTo(0.5, 5);
  });

  it("capsule ellipticity widens x relative to z (size [0.4,1,0.2])", () => {
    const g = createPrimitiveGeometry("capsule", undefined, FULL, [0.4, 1, 0.2]);
    expect(g.bounds.max[0]).toBeCloseTo(0.2, 5);
    expect(g.bounds.max[2]).toBeCloseTo(0.1, 5);
  });

  it("tier \"half\" halves segment counts", () => {
    const fullSphere = createPrimitiveGeometry("sphere", undefined, FULL);
    const halfSphere = createPrimitiveGeometry("sphere", undefined, HALF);
    expect(halfSphere.vertexBuffer.vertexCount).toBeLessThan(fullSphere.vertexBuffer.vertexCount);
    // 64x32 -> 32x16 rings+1: (33*17) vs (65*33)
    expect(halfSphere.vertexBuffer.vertexCount).toBe(33 * 17);
    expect(fullSphere.vertexBuffer.vertexCount).toBe(65 * 33);
  });

  it("shares geometry across equal (primitive, params) — cache hit", () => {
    clearPrimitiveGeometryCache();
    const before = primitiveGeometryCacheSize();
    const a = createPrimitiveGeometry("box", undefined, FULL);
    const b = createPrimitiveGeometry("box", undefined, FULL);
    expect(a).toBe(b);
    expect(primitiveGeometryCacheSize()).toBe(before + 1);
    const c = createPrimitiveGeometry("box", { widthSegments: 2 }, FULL);
    expect(c).not.toBe(a);
  });

  it("promotes to Uint32 indices above 65,535 vertices", () => {
    const g = Geometry.uvSphere(0.5, 256, 256, { textured: true });
    expect(g.vertexBuffer.vertexCount).toBe(257 * 257);
    expect(g.indexBuffer!.type).toBe("uint32");
    expect(g.indexBuffer!.data).toBeInstanceOf(Uint32Array);
    expect(createPrimitiveGeometry("sphere", { widthSegments: 256, heightSegments: 256 }, FULL).indexBuffer!.type).toBe("uint32");
  });

  it("cylinder radiusTop/radiusBottom produce a frustum with tilted normals", () => {
    const g = Geometry.cylinder({ radiusBottom: 0.5, radiusTop: 0.1, height: 1, segments: 8, openEnded: true, textured: true });
    const a = attrs(g);
    let sawTilt = false;
    for (let i = 0; i < a.count; i += 1) {
      const n = a.nrm(i);
      if (Math.abs(n[1]) > 0.01 && n[1] < 1) {
        sawTilt = true; // frustum side normals tilt upward
        expect(n[1]).toBeGreaterThan(0);
      }
    }
    expect(sawTilt).toBe(true);
    expect(g.bounds.max[1]).toBeCloseTo(0.5, 5);
    expect(g.bounds.min[1]).toBeCloseTo(-0.5, 5);
  });
});
