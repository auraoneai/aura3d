import { describe, expect, it } from "vitest";
import { teapotGeometry } from "../../../packages/rendering/src/geometry/TeapotGeometry.js";
import { computeParityTangents, parityMeshToGeometry } from "../../../packages/rendering/src/geometry/Support.js";

function cross(a: readonly number[], b: readonly number[]): readonly number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

describe("patch geometry float32 integration", () => {
  it.each([1e-100, 1e-46, 1e39, 1e100])("rejects size %s before a render buffer can overflow or collapse", (size) => {
    expect(() => teapotGeometry({ size, segments: 2 })).toThrow(/positive finite float32/);
  });

  it("rejects a representable scale when selected components overflow float32", () => {
    expect(Number.isFinite(Math.fround(3.4e38))).toBe(true);
    expect(() => teapotGeometry({ size: 3.4e38, segments: 2 })).toThrow(/position exceeds the finite float32 range/);
  });

  it("rejects subnormal coordinates that collapse an otherwise finite triangle", () => {
    expect(Math.fround(1e-43)).toBeGreaterThan(0);
    expect(() => teapotGeometry({ size: 1e-43, segments: 8 })).toThrow(/float32 positions cannot preserve triangle/);
  });

  it.each([1e-35, 1, 1e35])("keeps every retained triangle drawable through the public geometry adapter at scale %s", (size) => {
    const mesh = teapotGeometry({ size, segments: 8 });
    const geometry = parityMeshToGeometry(mesh);
    const position = (index: number) => geometry.vertexBuffer.getAttribute(index, "position");
    expect(mesh.indices!.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.indices!.length; i += 3) {
      const a = position(mesh.indices![i]!);
      const b = position(mesh.indices![i + 1]!);
      const c = position(mesh.indices![i + 2]!);
      expect([...a, ...b, ...c].every(Number.isFinite)).toBe(true);
      const ab = b.map((value, k) => value - a[k]!);
      const ac = c.map((value, k) => value - a[k]!);
      expect(Math.hypot(...cross(ab, ac))).toBeGreaterThan(0);
    }
  });

  it("keeps tessellation, component selection and limiting normals stable at ordinary scale", () => {
    const full = teapotGeometry({ segments: 64 });
    const handle = teapotGeometry({ segments: 2, body: false, lid: false, spout: false });
    expect(full.indices!.length).toBeGreaterThan(0);
    expect(full.normals!.every(Number.isFinite)).toBe(true);
    expect(handle.groups?.map((group) => group.materialIndex)).toEqual([3]);
    expect(teapotGeometry({ body: false, lid: false, spout: false, handle: false }).positions).toEqual([]);
  });

  it.each([1e-35, 1, 1e35])("preserves public mesh tangent direction and handedness at scale %s", (size) => {
    const base = parityMeshToGeometry(teapotGeometry({ size: 1, segments: 2 }));
    const scaled = parityMeshToGeometry(teapotGeometry({ size, segments: 2 }));
    let nonFallback = false;
    for (let i = 0; i < base.vertexBuffer.vertexCount; i += 1) {
      const reference = base.vertexBuffer.getAttribute(i, "tangent");
      const actual = scaled.vertexBuffer.getAttribute(i, "tangent");
      if (Math.abs(reference[1]!) > 0.01 || Math.abs(reference[2]!) > 0.01) nonFallback = true;
      for (let axis = 0; axis < 4; axis += 1) expect(actual[axis]).toBeCloseTo(reference[axis]!, 5);
      expect(actual[3]).toBe(1);
    }
    expect(nonFallback).toBe(true);
  });

  it("retains the fallback for degenerate UVs and cancelling tangent contributions", () => {
    expect(Array.from(computeParityTangents([0, 0, 0, 0, 1, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0], [0, 1, 2])))
      .toEqual([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
    const positions = [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -1, 0, -1, 0, 0];
    const uvs = [0, 0, 1, 0, 0, 1, 1, 0, 0, 1];
    const tangent = computeParityTangents(positions, uvs, [0, 1, 2, 0, 3, 4]);
    expect(Array.from(tangent.slice(0, 4))).toEqual([1, 0, 0, 1]);
    expect(Array.from(tangent.slice(4, 8))).toEqual([0, 1, 0, 1]);
  });
});
