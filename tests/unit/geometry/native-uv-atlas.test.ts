import { describe, expect, it } from "vitest";
import { buildUVAtlas, UVAtlasError, type UVAtlasGeometry, type UVAtlasResult } from "../../../packages/engine/src/agent-api/geometry/UVAtlas";
import { normalizeGeometryAttributes } from "../../../packages/engine/src/agent-api/RootGeometry";

const plane = (): UVAtlasGeometry => ({
  kind: "aura-custom-geometry",
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  colors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]),
  indices: [0, 1, 2, 0, 2, 3],
  attributes: { heat: { itemSize: 1, data: new Float32Array([2, 3, 4, 5]) } },
  morphTargets: [{ name: "lift", positions: new Float32Array([0, 0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4]) }],
  groups: [{ start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 4 }],
  drawRange: { start: 0, count: 6 }
});

function options(extra: Record<string, unknown> = {}) {
  return { destination: "uv1s" as const, width: 128, height: 128, gutter: 3, texelDensity: 24, ...extra };
}
function hasPositiveOverlap(a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function checkGutters(result: UVAtlasResult): void {
  for (const [i, chart] of result.charts.entries()) {
    const outer = chart.pixelBounds;
    const inner = chart.contentBounds;
    expect(inner.x - outer.x).toBeGreaterThanOrEqual(result.gutter);
    expect(inner.y - outer.y).toBeGreaterThanOrEqual(result.gutter);
    expect(outer.x + outer.width - inner.x - inner.width).toBeGreaterThanOrEqual(result.gutter - 1e-7);
    expect(outer.y + outer.height - inner.y - inner.height).toBeGreaterThanOrEqual(result.gutter - 1e-7);
    expect(outer.x).toBeGreaterThanOrEqual(0);
    expect(outer.y).toBeGreaterThanOrEqual(0);
    expect(outer.x + outer.width).toBeLessThanOrEqual(result.width);
    expect(outer.y + outer.height).toBeLessThanOrEqual(result.height);
    for (const other of result.charts.slice(i + 1)) expect(hasPositiveOverlap(outer, other.pixelBounds)).toBe(false);
  }
}
function outputNumber(input: ArrayLike<number>, vertex: number, width: number, component: number): number {
  return input[vertex * width + component]!;
}

describe("native UV atlas", () => {
  it("keeps a planar connected square in one chart and preserves world texel density", () => {
    const input = plane();
    const result = buildUVAtlas(input, options());
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0]!.triangles).toEqual([0, 1]);
    expect(result.vertexRemap).toEqual(Uint32Array.from([0, 1, 2, 3]));
    expect(result.geometry.uvs).toEqual(input.uvs);
    expect(result.geometry.uvs).not.toBe(input.uvs);
    expect(result.geometry.groups).toEqual(input.groups);
    expect(result.geometry.drawRange).toEqual(input.drawRange);
    const generated = result.geometry.uv1s as Float32Array;
    const dx = (generated[2]! - generated[0]!) * result.width;
    const dy = (generated[3]! - generated[1]!) * result.height;
    expect(Math.hypot(dx, dy)).toBeCloseTo(24, 5);
    expect(Array.from(generated).every((uv) => uv >= 0 && uv <= 1)).toBe(true);
    checkGutters(result);
  });

  it("cuts requested seams and remaps every vertex stream, morph and material range", () => {
    const input = plane();
    const result = buildUVAtlas(input, options({ seams: [[0, 2]] }));
    expect(result.charts).toHaveLength(2);
    expect(result.vertexRemap).toEqual(Uint32Array.from([0, 1, 2, 0, 2, 3]));
    expect(result.indexRemap).toEqual(Uint32Array.from([0, 1, 2, 3, 4, 5]));
    expect(Array.from(result.geometry.indices)).toEqual(Array.from(result.indexRemap));
    expect(result.seams.find((seam) => seam.reason === "explicit")).toEqual({ vertices: [0, 2], triangles: [0, 1], reason: "explicit" });
    expect(result.geometry.groups).toEqual(input.groups);
    expect(result.geometry.morphTargets![0]!.name).toBe("lift");
    for (let i = 0; i < result.vertexRemap.length; i += 1) {
      const original = result.vertexRemap[i]!;
      for (const [field, width] of [["positions", 3], ["normals", 3], ["uvs", 2], ["colors", 4]] as const) {
        for (let component = 0; component < width; component += 1) {
          expect(outputNumber(result.geometry[field] as ArrayLike<number>, i, width, component)).toBe(outputNumber(input[field] as ArrayLike<number>, original, width, component));
        }
      }
      expect((result.geometry.attributes!.heat!.data as Float32Array)[i]).toBe((input.attributes!.heat!.data as Float32Array)[original]);
      for (let component = 0; component < 3; component += 1) {
        expect(outputNumber(result.geometry.morphTargets![0]!.positions, i, 3, component)).toBe(outputNumber(input.morphTargets![0]!.positions, original, 3, component));
      }
    }
    (result.geometry.positions as Float32Array)[0] = 42;
    expect((input.positions as Float32Array)[0]).toBe(0);
    checkGutters(result);
  });

  it("separates folds, coincident overlapping faces and mirrored winding", () => {
    const input: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 1, 0, 3, 0, 1, 2] };
    const result = buildUVAtlas(input, options());
    expect(result.charts).toHaveLength(3);
    expect(result.seams.some((s) => s.reason === "nonmanifold")).toBe(true);
    checkGutters(result);
    const mirrored = buildUVAtlas({ kind: "aura-custom-geometry", positions: [0, 0, 0, -2, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, options());
    const uv = mirrored.geometry.uv1s as Float32Array;
    expect(Math.hypot((uv[2]! - uv[0]!) * mirrored.width, (uv[3]! - uv[1]!) * mirrored.height)).toBeCloseTo(48, 5);
    checkGutters(mirrored);
  });

  it("keeps an explicit cut even when adjacent faces have another path around it", () => {
    const fan: UVAtlasGeometry = {
      kind: "aura-custom-geometry",
      positions: [0,0,0, 1,0,0, 0,1,0, -1,0,0, 0,-1,0],
      indices: [0,1,2, 0,2,3, 0,3,4, 0,4,1]
    };
    const result = buildUVAtlas(fan, options({ seams: [[0, 1]] }));
    const first = result.charts.find((chart) => chart.triangles.includes(0))!;
    const last = result.charts.find((chart) => chart.triangles.includes(3))!;
    expect(first.id).not.toBe(last.id);
    expect(result.seams.find((seam) => seam.reason === "explicit")!.vertices).toEqual([0, 1]);
    checkGutters(result);
  });

  it("separates same-winding coincident faces and rejects UV precision collapse", () => {
    const duplicate: UVAtlasGeometry = {
      kind: "aura-custom-geometry", positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2, 0,1,2]
    };
    expect(buildUVAtlas(duplicate, options()).charts).toHaveLength(2);
    expect(() => buildUVAtlas(duplicate, options({ texelDensity: 1e-100 }))).toThrow(/UV precision/);
  });

  it("rotates charts to fit a rectangular atlas without changing density", () => {
    const triangle: UVAtlasGeometry = {
      kind: "aura-custom-geometry", positions: [0,0,0, 3,0,0, 0,1,0], indices: [0,1,2]
    };
    const result = buildUVAtlas(triangle, options({ width: 24, height: 48, texelDensity: 12, gutter: 2 }));
    expect(result.charts[0]!.rotated).toBe(true);
    const uv = result.geometry.uv1s as Float32Array;
    const dx = (uv[2]! - uv[0]!) * result.width;
    const dy = (uv[3]! - uv[1]!) * result.height;
    expect(Math.hypot(dx, dy)).toBeCloseTo(36, 5);
    checkGutters(result);
    const repeated = buildUVAtlas(triangle, options({ width: 24, height: 48, texelDensity: 12, gutter: 2 }));
    expect(repeated.geometry.uv1s).toEqual(result.geometry.uv1s);
    expect(repeated.charts).toEqual(result.charts);
  });

  it("reports integer chart pixel bounds even at fractional texel density", () => {
    const input: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0,0,0, 1.1,0,0, 0,0.9,0], indices: [0,1,2] };
    const result = buildUVAtlas(input, options({ texelDensity: 7 }));
    const bounds = result.charts[0]!.contentBounds;
    expect([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger)).toBe(true);
    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(7);
    checkGutters(result);
  });

  it("accepts non-indexed input and leaves it untouched", () => {
    const triangle: UVAtlasGeometry = { kind: "aura-custom-geometry", positions: [0,0,0, 1,0,0, 0,1,0], indices: [], drawRange: { start: 0, count: Infinity } };
    const result = buildUVAtlas(triangle, options());
    expect(Array.from(result.geometry.indices)).toEqual([0, 1, 2]);
    expect(result.geometry.drawRange).toEqual({ start: 0, count: Infinity });
    expect(triangle.indices).toEqual([]);
  });

  it("allows an explicitly selected replacement but protects authored UV channels by default", () => {
    const input = plane();
    expect(() => buildUVAtlas(input, options({ destination: "uvs" }))).toThrow(/already contains authored UVs/);
    const result = buildUVAtlas(input, options({ destination: "uvs", overwrite: true }));
    expect(result.geometry.uvs).not.toEqual(input.uvs);
    expect(result.geometry.uv1s).toBeUndefined();
    expect(input.uvs).toEqual(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]));
  });

  it("rejects degenerate triangles, missing seams, invalid indices and bounded overflows", () => {
    const cases = [
      () => buildUVAtlas({ ...plane(), positions: [0,0,0, 1,0,0, 2,0,0], indices: [0,1,2], normals: undefined, uvs: undefined, colors: undefined, attributes: undefined, groups: undefined, drawRange: undefined, morphTargets: undefined }, options()),
      () => buildUVAtlas(plane(), options({ seams: [[1, 3]] })),
      () => buildUVAtlas({ ...plane(), indices: [0, 1, 9] }, options()),
      () => buildUVAtlas(plane(), options({ destination: "unknown" })),
      () => buildUVAtlas(plane(), options({ texelDensity: 0 }))
    ];
    for (const run of cases) expect(run).toThrow(UVAtlasError);
    expect(() => buildUVAtlas(plane(), options({ maxTriangles: 1 }))).toThrow(/triangle count/);
    expect(() => buildUVAtlas(plane(), options({ width: 8, height: 8 }))).toThrow(/cannot fit/);
    expect(() => buildUVAtlas(plane(), options({ seams: [[0, 2]], maxCharts: 1 }))).toThrow(/chart count/);
    expect(() => buildUVAtlas(plane(), options({ seams: [[0, 2]], maxVertices: 5 }))).toThrow(/vertex count/);
  });

  it("honors cancellation before processing and during a progress callback", () => {
    const preaborted = new AbortController();
    preaborted.abort();
    expect(() => buildUVAtlas(plane(), options({ signal: preaborted.signal }))).toThrow(/cancelled/);
    const controller = new AbortController();
    let reports = 0;
    expect(() => buildUVAtlas(plane(), options({ signal: controller.signal, onProgress: () => { reports += 1; controller.abort(); } }))).toThrow(/cancelled/);
    expect(reports).toBe(1);
  });

  it("preserves tuple streams and interleaved attributes on seam duplication", () => {
    const input = plane();
    const source = {
      ...input,
      positions: [[0,0,0], [1,0,0], [1,1,0], [0,1,0]],
      colors: ["#f00", "#0f0", "#00f", "#fff"],
      attributes: { heat: { itemSize: 1, data: new Uint8Array([255, 9, 128, 9, 64, 9, 0, 9]), normalized: true, stride: 2, offset: 0 } }
    } as unknown as UVAtlasGeometry;
    const result = buildUVAtlas(source, options({ seams: [[0, 2]] }));
    expect(result.geometry.positions).toEqual([[0,0,0], [1,0,0], [1,1,0], [0,0,0], [1,1,0], [0,1,0]]);
    expect(result.geometry.colors).toEqual(["#f00", "#0f0", "#00f", "#f00", "#00f", "#fff"]);
    expect(result.geometry.attributes!.heat).toMatchObject({ itemSize: 1, normalized: true, stride: 1, offset: 0 });
    expect(result.geometry.attributes!.heat!.data).toEqual(new Uint8Array([255, 128, 64, 255, 64, 0]));
    const normalized = normalizeGeometryAttributes(result.geometry);
    expect(normalized.uv1s).toEqual(result.geometry.uv1s);
    expect(Array.from(normalized.custom[0]!.data)).toEqual([
      1, Math.fround(128 / 255), Math.fround(64 / 255), 1, Math.fround(64 / 255), 0
    ]);
  });
});
