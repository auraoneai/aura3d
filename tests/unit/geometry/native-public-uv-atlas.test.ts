import { describe, expect, expectTypeOf, it } from "vitest";
import { geometry as rootGeometry } from "../../../packages/engine/src/public/index.js";
import { geometry as v5Geometry } from "../../../packages/engine/src/public/v5.js";

const rectangle = () => ({
  kind: "aura-custom-geometry" as const,
  positions: new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0]),
  indices: [0, 1, 2, 0, 2, 3],
  uvs: new Float32Array([0.2, 0.1, 0.8, 0.1, 0.8, 0.9, 0.2, 0.9])
});

const options = {
  destination: "uv1s" as const,
  width: 128,
  height: 128,
  gutter: 3,
  texelDensity: 16
};

function triangleArea(uv: Float32Array, a: number, b: number, c: number): number {
  const ax = uv[a * 2]!, ay = uv[a * 2 + 1]!;
  const bx = uv[b * 2]!, by = uv[b * 2 + 1]!;
  const cx = uv[c * 2]!, cy = uv[c * 2 + 1]!;
  return Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
}

describe("public UV atlas geometry operation", () => {
  it("shares the lazily exposed function across root and v5 without changing other geometry operations", () => {
    expect(rootGeometry).toBe(v5Geometry);
    const defineBefore = rootGeometry.define;
    const boundsBefore = rootGeometry.computeBounds;
    const normalsBefore = rootGeometry.computeNormals;
    const membersBefore = Object.keys(rootGeometry);
    expect(membersBefore).toContain("buildUVAtlas");
    expect("buildUVAtlas" in rootGeometry).toBe(true);
    expect(rootGeometry.buildUVAtlas).toBe(v5Geometry.buildUVAtlas);
    expect(Object.getOwnPropertyDescriptor(rootGeometry, "buildUVAtlas")?.value).toBe(rootGeometry.buildUVAtlas);
    expect(Object.keys(v5Geometry)).toEqual(membersBefore);
    expect(rootGeometry.define).toBe(defineBefore);
    expect(rootGeometry.computeBounds).toBe(boundsBefore);
    expect(rootGeometry.computeNormals).toBe(normalsBefore);

    const defined = rootGeometry.define(rectangle());
    expect(defined.kind).toBe("aura-custom-geometry");
    const bounds = rootGeometry.computeBounds(defined);
    expect(bounds.min).toEqual([0, 0, 0]);
    expect(bounds.max).toEqual([2, 1, 0]);
    expect(Array.from(rootGeometry.computeNormals(defined))).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(v5Geometry.computeBounds).toBe(rootGeometry.computeBounds);
  });

  it.each([
    ["root", rootGeometry],
    ["v5", v5Geometry]
  ] as const)("unwraps a rectangle through the %s public entry", (_entry, geometry) => {
    const input = rectangle();
    const originalPositions = Array.from(input.positions);
    const originalUVs = Array.from(input.uvs);
    const atlas = geometry.buildUVAtlas(input, options);
    const outputUVs = atlas.geometry.uv1s as Float32Array;
    const outputIndices = Array.from(atlas.geometry.indices);

    expect(atlas.destination).toBe("uv1s");
    expect(atlas.charts).toHaveLength(1);
    expect(atlas.charts[0]!.triangles).toEqual([0, 1]);
    expect(outputIndices).toHaveLength(6);
    expect(outputUVs).toHaveLength(8);
    expect(Array.from(outputUVs).every((value) => value >= 0 && value <= 1)).toBe(true);
    const uvArea = triangleArea(outputUVs, outputIndices[0]!, outputIndices[1]!, outputIndices[2]!)
      + triangleArea(outputUVs, outputIndices[3]!, outputIndices[4]!, outputIndices[5]!);
    expect(uvArea).toBeCloseTo((2 * 16 * 16) / (128 * 128), 6);
    expect(Array.from(atlas.geometry.uvs as Float32Array)).toEqual(originalUVs);
    expect(atlas.geometry.uvs).not.toBe(input.uvs);
    const node = geometry.custom(atlas.geometry).toJSON();
    expect(node).toMatchObject({ kind: "primitive", primitive: "custom" });
    expect(node.geometry?.uv1s).toEqual(outputUVs);
    expect(Array.from(input.positions)).toEqual(originalPositions);
    expect(Array.from(input.uvs)).toEqual(originalUVs);
  });

  it("preserves authored UVs unless the caller explicitly selects replacement", () => {
    const input = rectangle();
    const originalUVs = Array.from(input.uvs);
    expect(() => rootGeometry.buildUVAtlas(input, { ...options, destination: "uvs" }))
      .toThrow(/already contains authored UVs/);
    const atlas = rootGeometry.buildUVAtlas(input, { ...options, destination: "uvs", overwrite: true });
    expect(Array.from(atlas.geometry.uvs as Float32Array)).not.toEqual(originalUVs);
    expect(Array.from(input.uvs)).toEqual(originalUVs);
  });

  it("preserves explicit seams and enforces supported input, work bounds, and cancellation", () => {
    const input = rectangle();
    const split = v5Geometry.buildUVAtlas(input, { ...options, seams: [[0, 2]] });
    expect(split.charts).toHaveLength(2);
    expect(split.seams).toContainEqual({ vertices: [0, 2], triangles: [0, 1], reason: "explicit" });
    expect(() => v5Geometry.buildUVAtlas({ ...input, topology: "lines" }, options))
      .toThrow(/only triangle geometry/);
    expect(() => v5Geometry.buildUVAtlas(input, { ...options, maxTriangles: 1 }))
      .toThrow(/triangle count 2 exceeds 1/);
    const controller = new AbortController();
    controller.abort();
    expect(() => v5Geometry.buildUVAtlas(input, { ...options, signal: controller.signal }))
      .toThrow(/cancelled/);
  });

  it("retains the public input and result types", () => {
    expectTypeOf<typeof rootGeometry.buildUVAtlas>().toEqualTypeOf<typeof v5Geometry.buildUVAtlas>();
    expectTypeOf<Parameters<typeof rootGeometry.buildUVAtlas>[1]["destination"]>()
      .toEqualTypeOf<"uvs" | "uv1s">();
    expectTypeOf<ReturnType<typeof rootGeometry.buildUVAtlas>["vertexRemap"]>()
      .toEqualTypeOf<Uint32Array>();
    expectTypeOf<ReturnType<typeof rootGeometry.buildUVAtlas>["indexRemap"]>()
      .toEqualTypeOf<Uint32Array>();

    if (false) {
      // @ts-expect-error Only the supported destination channels are accepted.
      rootGeometry.buildUVAtlas(rectangle(), { ...options, destination: "uv2s" });
    }
  });
});
