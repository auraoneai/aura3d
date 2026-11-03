import { describe, expect, it } from "vitest";
import { buildUVAtlas, type UVAtlasGeometry, type UVAtlasOptions, type UVAtlasResult } from "../../../packages/engine/src/agent-api/geometry/UVAtlas.js";
import { geometry as rootGeometry } from "../../../packages/engine/src/public/index.js";
import { geometry as v5Geometry } from "../../../packages/engine/src/public/v5.js";

const bent = (): UVAtlasGeometry => ({
  kind: "aura-custom-geometry",
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0.1],
  indices: [0, 1, 2, 1, 3, 2],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  uvs: [0, 0, 1, 0, 0, 1, 1, 1],
  attributes: { heat: { itemSize: 1, data: new Uint8Array([3, 5, 7, 11]), normalized: true } },
  morphTargets: [{
    name: "bend",
    positions: [0, 0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4],
    normals: [0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4, 0, 0],
    tangents: [0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4, 0]
  }],
  groups: [{ start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 4 }],
  drawRange: { start: 0, count: 6 }
});

const options = (overrides: Partial<UVAtlasOptions> = {}): UVAtlasOptions => ({
  destination: "uv1s", width: 128, height: 128, gutter: 2, texelDensity: 20,
  planeTolerance: 0.11, maxNormalDeviationRadians: 0.2, ...overrides
});

function vertex(data: ArrayLike<number>, index: number): [number, number, number] {
  return [data[index * 3]!, data[index * 3 + 1]!, data[index * 3 + 2]!];
}

function distance3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

function doubleArea3(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  return Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!);
}

function outputPixel(result: UVAtlasResult, index: number): [number, number] {
  const uv = result.geometry.uv1s as Float32Array;
  return [uv[index * 2]! * result.width, uv[index * 2 + 1]! * result.height];
}

function verifyBoundedFaceMetrics(input: UVAtlasGeometry, result: UVAtlasResult, angle: number): void {
  const positions = input.positions as readonly number[];
  const indices = input.indices as readonly number[];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const source = [0, 1, 2].map((corner) => vertex(positions, indices[offset + corner]!));
    const pixels = [0, 1, 2].map((corner) => outputPixel(result, result.indexRemap[offset + corner]!));
    for (let edge = 0; edge < 3; edge += 1) {
      const next = (edge + 1) % 3;
      const expected = distance3(source[edge]!, source[next]!) * result.texelDensity;
      const actual = Math.hypot(pixels[edge]![0] - pixels[next]![0], pixels[edge]![1] - pixels[next]![1]);
      expect(actual).toBeGreaterThanOrEqual(expected * Math.cos(angle) - 0.0001);
      expect(actual).toBeLessThanOrEqual(expected + 0.0001);
    }
    const [a, b, c] = pixels as [[number, number], [number, number], [number, number]];
    const actualArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const expectedArea = doubleArea3(source[0]!, source[1]!, source[2]!) * result.texelDensity ** 2;
    expect(actualArea).toBeGreaterThan(0);
    expect(actualArea).toBeGreaterThanOrEqual(expectedArea * Math.cos(angle) - 0.001);
    expect(actualArea).toBeLessThanOrEqual(expectedArea + 0.001);
  }
}

function foldedStrip(step: number): UVAtlasGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let column = 0; column <= 3; column += 1) {
    const x = Math.sin(column * step), z = 1 - Math.cos(column * step);
    positions.push(x, 0, z, x, 1, z);
  }
  for (let column = 0; column < 3; column += 1) {
    const a = column * 2, b = a + 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { kind: "aura-custom-geometry", positions, indices };
}

describe("bounded projected UV charts", () => {
  it("keeps the default planar result unchanged and joins a gently bent pair only when opted in", () => {
    const input = bent();
    const planarOptions: UVAtlasOptions = { destination: "uv1s", width: 128, height: 128, gutter: 2, texelDensity: 20, planeTolerance: 0.11 };
    const implicit = buildUVAtlas(input, planarOptions);
    const explicitUndefined = buildUVAtlas(input, { ...planarOptions, maxNormalDeviationRadians: undefined });
    expect(implicit).toEqual(explicitUndefined);
    expect(implicit.charts).toHaveLength(2);

    const projected = buildUVAtlas(input, options());
    expect(projected.charts).toHaveLength(1);
    expect(projected.charts[0]!.triangles).toEqual([0, 1]);
    expect(buildUVAtlas(input, options()).geometry.uv1s).toEqual(projected.geometry.uv1s);
    verifyBoundedFaceMetrics(input, projected, 0.2);
  });

  it("enforces both the seed-normal limit and the existing plane-deviation limit", () => {
    expect(buildUVAtlas(bent(), options({ maxNormalDeviationRadians: 0.1 })).charts).toHaveLength(2);
    expect(buildUVAtlas(bent(), options({ planeTolerance: 0.01 })).charts).toHaveLength(2);

    // Each neighboring panel bends by 0.12 rad, while the final panel is
    // 0.24 rad from the seed; it must not grow through successive small turns.
    const strip = foldedStrip(0.12);
    const result = buildUVAtlas(strip, options({ width: 256, planeTolerance: 2 }));
    expect(result.charts.map((chart) => chart.triangles)).toEqual([[0, 1, 2, 3], [4, 5]]);
    verifyBoundedFaceMetrics(strip, result, 0.2);
  });

  it("retains caller seams, nonmanifold cuts, overlap protection and winding", () => {
    const split = buildUVAtlas(bent(), options({ seams: [[1, 2]] }));
    expect(split.charts).toHaveLength(2);
    expect(split.seams).toContainEqual({ vertices: [1, 2], triangles: [0, 1], reason: "explicit" });

    const nonmanifold: UVAtlasGeometry = {
      kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0.05, 1, -1, 0.05],
      indices: [0, 1, 2, 1, 0, 3, 0, 1, 4]
    };
    const separated = buildUVAtlas(nonmanifold, options());
    expect(separated.charts).toHaveLength(3);
    expect(separated.seams).toContainEqual({ vertices: [0, 1], triangles: [0, 1, 2], reason: "nonmanifold" });

    const duplicate: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2, 0, 1, 2] };
    expect(buildUVAtlas(duplicate, options()).charts).toHaveLength(2);
    expect(buildUVAtlas({ ...bent(), indices: [0, 1, 2, 1, 2, 3] }, options()).charts).toHaveLength(2);
  });

  it("rejects an interior overlap introduced only by float32 UV quantization", () => {
    // This planar strip connects the two large triangles around the left side.
    // Their source interiors are disjoint: C lies 0.1 ulp above y = 1.3x.
    // Atlas quantization rounds C.x upward and C.y downward, putting C on the
    // opposite side of that line while both triangles remain nondegenerate.
    const worldUlp = (128 / 20) * 2 ** -25;
    const input: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [
        0, 0, 0, 1, 0, 0, 1, 1.3, 0, -1, -1, 0,
        -1, 0, 0, 0, 1, 0, 0, 2, 0,
        1 - 0.49 * worldUlp, 1.3 - 0.537 * worldUlp, 0
      ],
      indices: [0, 1, 2, 1, 0, 3, 3, 0, 4, 4, 0, 5, 4, 5, 6, 7, 6, 5]
    };
    expect(() => buildUVAtlas(input, options())).toThrow(/overlaps another bounded chart face after float32 conversion/);
  });

  it("preserves attributes, all morph channels, material ranges, gutters and source ownership", () => {
    const input = bent();
    const result = buildUVAtlas(input, options({ seams: [[1, 2]] }));
    expect(result.geometry.groups).toEqual(input.groups);
    expect(result.geometry.drawRange).toEqual(input.drawRange);
    for (const chart of result.charts) {
      expect(chart.contentBounds.x - chart.pixelBounds.x).toBeGreaterThanOrEqual(2);
      expect(chart.contentBounds.y - chart.pixelBounds.y).toBeGreaterThanOrEqual(2);
      expect(chart.pixelBounds.x).toBeGreaterThanOrEqual(0);
      expect(chart.pixelBounds.y).toBeGreaterThanOrEqual(0);
      expect(chart.pixelBounds.x + chart.pixelBounds.width).toBeLessThanOrEqual(result.width);
      expect(chart.pixelBounds.y + chart.pixelBounds.height).toBeLessThanOrEqual(result.height);
    }
    const before = input.morphTargets![0]!;
    const after = result.geometry.morphTargets![0]!;
    for (const [output, original] of Array.from(result.vertexRemap).entries()) {
      for (const channel of ["positions", "normals", "tangents"] as const) {
        for (let component = 0; component < 3; component += 1) {
          expect(after[channel]![output * 3 + component]).toBe(before[channel]![original * 3 + component]);
        }
      }
      expect((result.geometry.attributes!.heat!.data as Uint8Array)[output]).toBe((input.attributes!.heat!.data as Uint8Array)[original]);
    }
    expect(result.geometry.positions).not.toBe(input.positions);
    expect(after.positions).not.toBe(before.positions);
    expect(after.normals).not.toBe(before.normals);
    expect(after.tangents).not.toBe(before.tangents);
    expect((input.positions as readonly number[])[0]).toBe(0);
    verifyBoundedFaceMetrics(input, result, 0.2);
  });

  it("bounds candidate and final overlap work, validates options, and honors cancellation", () => {
    expect(buildUVAtlas(bent(), options({ maxOverlapChecks: 2 })).charts).toHaveLength(1);
    expect(() => buildUVAtlas(bent(), options({ maxOverlapChecks: 1 }))).toThrow(/overlap checks/);
    for (const angle of [-0.01, Math.acos(0.95) + 0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildUVAtlas(bent(), options({ maxNormalDeviationRadians: angle }))).toThrow(/maxNormalDeviationRadians/);
    }
    for (const limit of [-1, 0.5, 4_000_001]) {
      expect(() => buildUVAtlas(bent(), options({ maxOverlapChecks: limit }))).toThrow(/maxOverlapChecks/);
    }
    expect(() => buildUVAtlas(bent(), { destination: "uv1s", maxOverlapChecks: 1 })).toThrow(/requires maxNormalDeviationRadians/);
    const controller = new AbortController();
    expect(() => buildUVAtlas(bent(), options({ signal: controller.signal, onProgress: () => controller.abort() }))).toThrow(/cancelled/);
  });

  it("rejects a short edge whose float32 uncertainty exceeds the bounded edge tolerance", () => {
    const a = [0, 0, 0] as const, b = [1, 0, 0] as const, c = [1, 0.00001, 0] as const;
    const triangle: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [...a, ...b, ...c], indices: [0, 1, 2] };
    expect(distance3(b, c) * 20).toBeCloseTo(0.0002, 10);
    expect(buildUVAtlas(triangle, { destination: "uv1s", width: 128, height: 128, gutter: 2, texelDensity: 20 }).charts).toHaveLength(1);
    // This fixture also has poor area precision; the short-edge check runs first.
    expect(() => buildUVAtlas(triangle, options())).toThrow(/edge precision/);
  });

  it("rejects insufficient area precision even when every edge is long enough", () => {
    const a = [0, 0, 0] as const, b = [1, 0, 0] as const, c = [0.5, 0.00001, 0] as const;
    const triangle: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [...a, ...b, ...c], indices: [0, 1, 2] };
    expect(Math.min(distance3(a, b), distance3(b, c), distance3(c, a)) * 20).toBeGreaterThan(9.9);
    expect(doubleArea3(a, b, c) * 20 ** 2).toBeCloseTo(0.004, 10);
    expect(buildUVAtlas(triangle, { destination: "uv1s", width: 128, height: 128, gutter: 2, texelDensity: 20 }).charts).toHaveLength(1);
    expect(() => buildUVAtlas(triangle, options())).toThrow(/area precision/);
  });

  it("rejects float32 UV winding collapse", () => {
    expect(() => buildUVAtlas(bent(), options({ texelDensity: 1e-100 }))).toThrow(/cannot be represented at the requested UV precision/);
  });

  it("exposes the option through both public source entries", () => {
    const root = rootGeometry.buildUVAtlas(bent(), options());
    const v5 = v5Geometry.buildUVAtlas(bent(), options());
    expect(root.charts).toHaveLength(1);
    expect(v5.geometry.uv1s).toEqual(root.geometry.uv1s);
    if (false) {
      // @ts-expect-error normal deviation is measured in radians, not text.
      rootGeometry.buildUVAtlas(bent(), { ...options(), maxNormalDeviationRadians: "0.2" });
    }
  });
});
