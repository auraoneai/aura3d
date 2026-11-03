import { afterEach, describe, expect, it, vi } from "vitest";
import { Geometry, type GeometryMorphTarget } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { consolidateStaticMeshes, deindexGeometryToNonIndexed } from "../../../packages/rendering/src/MeshConsolidation";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import {
  clearPrimitiveGeometryCache,
  createPrimitiveGeometry,
  primitiveGeometryCacheSize
} from "../../../packages/rendering/src/geometry/Primitives";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const fullDetail = { primitiveSegments: "full" as const };

function indexedTriangle(): Geometry {
  const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }], 12);
  const vertices = new VertexBuffer(format, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  return new Geometry(vertices, new IndexBuffer([2, 0, 1, 2, 1, 0], 3));
}

afterEach(() => {
  clearPrimitiveGeometryCache();
  vi.restoreAllMocks();
});

describe("renderer morph-channel remapping", () => {
  it("deindexes each packed channel in index order and isolates both owners", () => {
    const source = indexedTriangle();
    const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const normals = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    const tangents = new Float32Array([20, 21, 22, 23, 24, 25, 26, 27, 28]);
    source.morphTargets = [{ name: "bend", positions, normals, tangents }];

    const expanded = deindexGeometryToNonIndexed(source);
    const target = expanded.morphTargets![0]!;
    expect(expanded.indexBuffer).toBeNull();
    expect(target.name).toBe("bend");
    expect(target.positions).toBeInstanceOf(Float32Array);
    expect(target.normals).toBeInstanceOf(Array);
    expect(target.tangents).toBeInstanceOf(Float32Array);
    expect(Array.from(target.positions)).toEqual([7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 5, 6, 1, 2, 3]);
    expect(Array.from(target.normals!)).toEqual([16, 17, 18, 10, 11, 12, 13, 14, 15, 16, 17, 18, 13, 14, 15, 10, 11, 12]);
    expect(Array.from(target.tangents!)).toEqual([26, 27, 28, 20, 21, 22, 23, 24, 25, 26, 27, 28, 23, 24, 25, 20, 21, 22]);
    expect(target.positions).not.toBe(positions);
    expect(target.normals).not.toBe(normals);
    expect(target.tangents).not.toBe(tangents);

    positions[6] = 1000;
    normals[6] = 1001;
    tangents[6] = 1002;
    expect(Array.from(target.positions).slice(0, 3)).toEqual([7, 8, 9]);
    expect(Array.from(target.normals!).slice(0, 3)).toEqual([16, 17, 18]);
    expect(Array.from(target.tangents!).slice(0, 3)).toEqual([26, 27, 28]);
    (target.positions as Float32Array)[0] = -1;
    (target.normals as number[])[0] = -2;
    (target.tangents as Float32Array)[0] = -3;
    expect([positions[6], normals[6], tangents[6]]).toEqual([1000, 1001, 1002]);
    expanded.dispose();
    expect(source.vertexBuffer.getAttribute(0, "position")).toEqual([0, 0, 0]);
    source.dispose();
  });

  it("preserves position-only targets and independently remaps multiple optional channel layouts", () => {
    const source = indexedTriangle();
    source.morphTargets = [
      { name: "position-only", positions: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "normal-only", positions: new Float32Array(9), normals: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) },
      { name: "tangent-only", positions: new Float32Array(9), tangents: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
    ];
    const expanded = deindexGeometryToNonIndexed(source);
    const [plain, normal, tangent] = expanded.morphTargets!;
    expect(plain!.positions).toEqual([6, 7, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 3, 4, 5, 0, 1, 2]);
    expect(plain).not.toHaveProperty("normals");
    expect(plain).not.toHaveProperty("tangents");
    expect(Array.from(normal!.normals!)).toEqual([7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 5, 6, 1, 2, 3]);
    expect(normal).not.toHaveProperty("tangents");
    expect(Array.from(tangent!.tangents!)).toEqual([7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 5, 6, 1, 2, 3]);
    expect(tangent).not.toHaveProperty("normals");
    expanded.dispose();
    source.dispose();
  });

  it("uses one index and morph snapshot when a source stream changes during copying", () => {
    const source = indexedTriangle();
    const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const normals = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    source.morphTargets = [{ positions, normals }];
    const stream = source.vertexBuffer;
    const read = stream.readBytes.bind(stream);
    let changed = false;
    vi.spyOn(stream, "readBytes").mockImplementation((offset, length) => {
      if (!changed) {
        changed = true;
        source.indexBuffer!.data.set([0, 0, 0, 0, 0, 0]);
        positions.fill(99);
        normals.fill(88);
      }
      return read(offset, length);
    });

    const expanded = deindexGeometryToNonIndexed(source);
    expect(changed).toBe(true);
    expect(Array.from(expanded.morphTargets![0]!.positions)).toEqual([
      7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 5, 6, 1, 2, 3
    ]);
    expect(Array.from(expanded.morphTargets![0]!.normals!)).toEqual([
      16, 17, 18, 10, 11, 12, 13, 14, 15, 16, 17, 18, 13, 14, 15, 10, 11, 12
    ]);
    expanded.dispose();
    source.dispose();
  });

  it.each([
    ["normal length", { normals: [1, 2, 3] }],
    ["tangent length", { tangents: new Float32Array(8) }],
    ["position NaN", { positions: [0, 0, 0, 0, Number.NaN, 0, 0, 0, 0] }],
    ["normal infinity", { normals: [0, 0, 0, 0, Number.POSITIVE_INFINITY, 0, 0, 0, 0] }],
    ["tangent non-number", { tangents: [0, 0, 0, 0, "invalid", 0, 0, 0, 0] }]
  ] as const)("rejects malformed %s before returning a deindexed geometry", (_label, invalid) => {
    const source = indexedTriangle();
    source.morphTargets = [{ positions: new Float32Array(9), ...invalid } as unknown as GeometryMorphTarget];
    expect(() => deindexGeometryToNonIndexed(source)).toThrow(/morph/i);
    expect(source.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    expect(Array.from(source.indexBuffer!.data)).toEqual([2, 0, 1, 2, 1, 0]);
    source.dispose();
  });

  it("keeps deformable geometries out of static consolidation without changing their channels", () => {
    const a = indexedTriangle();
    const b = indexedTriangle();
    const material = new PBRMaterial();
    const normals = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const tangents = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    a.morphTargets = [{ positions: new Float32Array(9), normals, tangents }];
    b.morphTargets = [{ positions: new Float32Array(9), normals: normals.slice(), tangents: [...tangents] }];

    const result = consolidateStaticMeshes([
      { geometry: a, material, modelMatrix: identity },
      { geometry: b, material, modelMatrix: identity }
    ]);
    expect(result.mergedMeshes).toBe(0);
    expect(result.passthroughItems).toBe(2);
    expect(result.renderItems.map((item) => item.geometry)).toEqual([a, b]);
    expect(result.sourceIndices).toEqual([[0], [1]]);
    expect(a.morphTargets![0]!.normals).toBe(normals);
    expect(a.morphTargets![0]!.tangents).toBe(tangents);
    expect(Array.from(b.morphTargets![0]!.normals!)).toEqual(Array.from(normals));
    a.dispose(); b.dispose(); material.dispose();
  });
});

describe("primitive template morph-channel ownership", () => {
  it("keeps cached snapshots and equal acquisitions independent of all source channels", () => {
    const originalBox = Geometry.box;
    let sourcePositions!: Float32Array;
    let sourceNormals!: number[];
    let sourceTangents!: Float32Array;
    const build = vi.spyOn(Geometry, "box").mockImplementation((options) => {
      const source = originalBox(options);
      const length = source.vertexBuffer.vertexCount * 3;
      sourcePositions = Float32Array.from({ length }, (_, index) => index + 1);
      sourceNormals = Array.from({ length }, (_, index) => index + 101);
      sourceTangents = Float32Array.from({ length }, (_, index) => index + 201);
      source.morphTargets = [{ name: "cached", positions: sourcePositions, normals: sourceNormals, tangents: sourceTangents }];
      return source;
    });

    const first = createPrimitiveGeometry("box", undefined, fullDetail);
    const second = createPrimitiveGeometry("box", undefined, fullDetail);
    expect(build).toHaveBeenCalledTimes(1);
    expect(primitiveGeometryCacheSize()).toBe(1);
    const firstTarget = first.morphTargets![0]!;
    const secondTarget = second.morphTargets![0]!;
    expect(firstTarget.positions).toBeInstanceOf(Float32Array);
    expect(firstTarget.normals).toBeInstanceOf(Array);
    expect(firstTarget.tangents).toBeInstanceOf(Float32Array);
    expect(firstTarget.positions).not.toBe(secondTarget.positions);
    expect(firstTarget.normals).not.toBe(secondTarget.normals);
    expect(firstTarget.tangents).not.toBe(secondTarget.tangents);

    sourcePositions[0] = -1;
    sourceNormals[0] = -2;
    sourceTangents[0] = -3;
    (firstTarget.positions as Float32Array)[1] = -4;
    (firstTarget.normals as number[])[1] = -5;
    (firstTarget.tangents as Float32Array)[1] = -6;
    expect(Array.from(secondTarget.positions).slice(0, 2)).toEqual([1, 2]);
    expect(Array.from(secondTarget.normals!).slice(0, 2)).toEqual([101, 102]);
    expect(Array.from(secondTarget.tangents!).slice(0, 2)).toEqual([201, 202]);

    const third = createPrimitiveGeometry("box", undefined, fullDetail);
    expect(Array.from(third.morphTargets![0]!.positions).slice(0, 2)).toEqual([1, 2]);
    expect(Array.from(third.morphTargets![0]!.normals!).slice(0, 2)).toEqual([101, 102]);
    expect(Array.from(third.morphTargets![0]!.tangents!).slice(0, 2)).toEqual([201, 202]);
    first.dispose(); second.dispose(); third.dispose();
  });

  it.each([
    ["short normals", (length: number) => ({ normals: new Float32Array(length - 1) })],
    ["non-finite tangents", (length: number) => ({ tangents: Array.from({ length }, (_, i) => i === 0 ? Number.NaN : 0) })]
  ] as const)("rejects %s without caching a partial template", (_label, invalid) => {
    const originalBox = Geometry.box;
    let source!: Geometry;
    vi.spyOn(Geometry, "box").mockImplementation((options) => {
      source = originalBox(options);
      const length = source.vertexBuffer.vertexCount * 3;
      source.morphTargets = [{ positions: new Float32Array(length), ...invalid(length) }];
      return source;
    });
    expect(() => createPrimitiveGeometry("box", undefined, fullDetail)).toThrow(/morph/i);
    expect(primitiveGeometryCacheSize()).toBe(0);
    expect(() => source.vertexBuffer).toThrow(/disposed/i);
  });
});
