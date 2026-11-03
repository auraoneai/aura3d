import { describe, expect, it } from "vitest";
import { buildUVAtlas, type UVAtlasGeometry, type UVAtlasOptions, type UVAtlasResult } from "../../../packages/engine/src/agent-api/geometry/UVAtlas.js";

/** A developable polygonal cylinder strip, deliberately wider than one tangent projection. */
function cylinderStrip(panels: number, angle: number): UVAtlasGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let column = 0; column <= panels; column += 1) {
    const x = Math.sin(column * angle), z = 1 - Math.cos(column * angle);
    positions.push(x, 0, z, x, 1, z);
  }
  for (let column = 0; column < panels; column += 1) {
    const a = column * 2, b = a + 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { kind: "aura-custom-geometry", positions, indices };
}

const options = (overrides: Partial<UVAtlasOptions> = {}): UVAtlasOptions => ({
  destination: "uv1s", width: 256, height: 128, gutter: 2, texelDensity: 20,
  unfoldMaxDihedralRadians: 0.6, ...overrides
});

function checkIsometry(input: UVAtlasGeometry, result: UVAtlasResult): void {
  const positions = input.positions as readonly number[], indices = input.indices as readonly number[];
  const uv = result.geometry.uv1s as Float32Array;
  for (let index = 0; index < indices.length; index += 3) {
    const source = [0, 1, 2].map((corner) => {
      const offset = indices[index + corner]! * 3;
      return [positions[offset]!, positions[offset + 1]!, positions[offset + 2]!] as const;
    });
    const pixel = [0, 1, 2].map((corner) => {
      const offset = result.indexRemap[index + corner]! * 2;
      return [uv[offset]! * result.width, uv[offset + 1]! * result.height] as const;
    });
    for (let corner = 0; corner < 3; corner += 1) {
      const next = (corner + 1) % 3;
      const p = source[corner]!, q = source[next]!;
      const a = pixel[corner]!, b = pixel[next]!;
      const expected = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * result.texelDensity;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(expected, 4);
    }
    const [a, b, c] = pixel;
    const area = (b![0] - a![0]) * (c![1] - a![1]) - (b![1] - a![1]) * (c![0] - a![0]);
    const [p, q, r] = source;
    const u = [q![0] - p![0], q![1] - p![1], q![2] - p![2]];
    const v = [r![0] - p![0], r![1] - p![1], r![2] - p![2]];
    const sourceArea = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) * result.texelDensity ** 2;
    expect(area).toBeGreaterThan(0);
    expect(area).toBeCloseTo(sourceArea, 3);
  }
}

describe("intrinsic curved UV charts", () => {
  it("unfolds a wide cylinder strip without shortening edges and preserves deterministic packing", () => {
    const input = cylinderStrip(8, Math.PI / 6);
    const projected = buildUVAtlas(input, { destination: "uv1s", width: 256, height: 128, texelDensity: 20, maxNormalDeviationRadians: 0.2, planeTolerance: 2 });
    expect(projected.charts.length).toBeGreaterThan(1);
    const result = buildUVAtlas(input, options());
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0]!.triangles).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(result.vertexRemap.length).toBe(18);
    checkIsometry(input, result);
    const repeated = buildUVAtlas(input, options());
    expect(repeated.charts).toEqual(result.charts);
    expect(repeated.geometry.uv1s).toEqual(result.geometry.uv1s);
  });

  it("honors the dihedral threshold and explicit seams", () => {
    const input = cylinderStrip(3, Math.PI / 6);
    const threshold = buildUVAtlas(input, options({ unfoldMaxDihedralRadians: 0.4 }));
    expect(threshold.charts.map((chart) => chart.triangles)).toEqual([[0, 1], [2, 3], [4, 5]]);
    checkIsometry(input, threshold);
    const seam = buildUVAtlas(input, options({ seams: [[2, 3]] }));
    expect(seam.charts).toHaveLength(2);
    expect(seam.seams).toContainEqual({ vertices: [2, 3], triangles: [1, 2], reason: "explicit" });
    checkIsometry(input, seam);
  });

  it("includes orthogonal faces only at the documented right-angle limit", () => {
    const input: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 1, 0, 3]
    };
    expect(buildUVAtlas(input, options({ unfoldMaxDihedralRadians: Math.PI / 2 - 0.001 })).charts).toHaveLength(2);
    const unfolded = buildUVAtlas(input, options({ unfoldMaxDihedralRadians: Math.PI / 2 }));
    expect(unfolded.charts).toHaveLength(1);
    checkIsometry(input, unfolded);
  });

  it("joins oblique coplanar faces at zero angle and rejects a very small positive fold", () => {
    const flat: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 1, 0, 1, 0, 1, 3, 1, 1, 4],
      indices: [0, 1, 2, 1, 3, 2]
    };
    const zero = buildUVAtlas(flat, options({ unfoldMaxDihedralRadians: 0 }));
    expect(zero.charts).toHaveLength(1);
    checkIsometry(flat, zero);
    const folded = { ...flat, positions: [0, 0, 0, 1, 0, 1, 0, 1, 3, 1, 1, 4 + 1e-12] };
    expect(buildUVAtlas(folded, options({ unfoldMaxDihedralRadians: 0 })).charts).toHaveLength(2);
    const allowed = buildUVAtlas(folded, options({ unfoldMaxDihedralRadians: 1e-10 }));
    expect(allowed.charts).toHaveLength(1);
    checkIsometry(folded, allowed);
  });

  it("splits a non-developable closed fan instead of distorting the closing faces", () => {
    const input: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0.35, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
      indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]
    };
    const result = buildUVAtlas(input, options({ unfoldMaxDihedralRadians: 1 }));
    expect(result.charts.length).toBeGreaterThan(1);
    expect(result.seams.some((seam) => seam.reason === "chart")).toBe(true);
    checkIsometry(input, result);
  });

  it("separates reversed winding, coincident faces and nonmanifold edges", () => {
    const input: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0.05, 1, -1, 0.05],
      indices: [0, 1, 2, 1, 0, 3, 0, 1, 4]
    };
    const nonmanifold = buildUVAtlas(input, options());
    expect(nonmanifold.charts).toHaveLength(3);
    expect(nonmanifold.seams).toContainEqual({ vertices: [0, 1], triangles: [0, 1, 2], reason: "nonmanifold" });
    const duplicate: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2, 0, 1, 2] };
    expect(buildUVAtlas(duplicate, options()).charts).toHaveLength(2);
    const mirrored = { ...duplicate, indices: [0, 1, 2, 1, 0, 2] };
    expect(buildUVAtlas(mirrored, options()).charts).toHaveLength(2);
  });

  it("retains attributes, morphs, groups and remaps across an unfolded seam", () => {
    const strip = cylinderStrip(2, Math.PI / 6);
    const input: UVAtlasGeometry = {
      ...strip,
      attributes: { heat: { itemSize: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]) } },
      morphTargets: [{ name: "lift", positions: new Float32Array(18).fill(0.25) }],
      groups: [{ start: 0, count: 6, materialIndex: 1 }, { start: 6, count: 6, materialIndex: 2 }]
    };
    const result = buildUVAtlas(input, options({ seams: [[2, 3]] }));
    expect(result.geometry.groups).toEqual(input.groups);
    expect(result.vertexRemap.length).toBe(8);
    for (const [output, source] of Array.from(result.vertexRemap).entries()) {
      expect((result.geometry.attributes!.heat!.data as Uint8Array)[output]).toBe(source + 1);
      expect(result.geometry.morphTargets![0]!.positions[output * 3]).toBe(0.25);
    }
    checkIsometry(input, result);
  });

  it("validates option combinations, overlap limits and cancellation", () => {
    const strip = cylinderStrip(2, Math.PI / 6);
    for (const angle of [-1, Math.PI / 2 + 0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildUVAtlas(strip, options({ unfoldMaxDihedralRadians: angle }))).toThrow(/unfoldMaxDihedralRadians/);
    }
    expect(() => buildUVAtlas(strip, options({ maxNormalDeviationRadians: 0.2 }))).toThrow(/cannot be combined/);
    expect(() => buildUVAtlas(strip, options({ planeTolerance: 1 }))).toThrow(/cannot be combined/);
    expect(() => buildUVAtlas(strip, options({ maxOverlapChecks: 0 }))).toThrow(/overlap checks/);
    const thin: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 1, 0.00001, 0], indices: [0, 1, 2] };
    expect(() => buildUVAtlas(thin, options())).toThrow(/edge precision/);
    const controller = new AbortController();
    expect(() => buildUVAtlas(strip, options({ signal: controller.signal, onProgress: () => controller.abort() }))).toThrow(/cancelled/);
  });
});
