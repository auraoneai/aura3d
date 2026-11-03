import { describe, expect, it } from "vitest";

import {
  auraGeometryToNonIndexed,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  normalizeGeometryAttributes
} from "../../../packages/engine/src/agent-api/RootGeometry";

function quadInput() {
  return {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 0, 1, 1, 1],
    uv1s: [0, 0, 1, 0, 0, 1, 1, 1],
    colors: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1],
    indices: [2, 1, 0, 2, 3, 1],
    attributes: {
      paint: { itemSize: 1 as const, data: new Uint8Array([255, 10, 255, 20, 255, 30, 255, 40]), stride: 2, offset: 1, normalized: true }
    },
    bounds: { min: [0, 0, 0] as const, max: [1, 1, 0] as const },
    groups: [{ start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 5 }],
    drawRange: { start: 0, count: 6 },
    morphTargets: [{
      name: "bend",
      positions: [1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0],
      normals: [0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0],
      tangents: [0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]
    }],
    topology: "triangles" as const
  };
}

function expectUnsupported(action: () => unknown, field: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect(thrown).toMatchObject({ code: "AURA_GEOMETRY_INCOMPATIBLE", field });
  expect((thrown as Error).message).toContain(field);
}

const unsupported: [string, unknown][] = [
  ["tangents", new Float32Array(16)],
  ["joints", new Uint16Array(16)],
  ["weights", new Float32Array(16)],
  ["customStream", [10, 20, 30, 40]],
  ["descriptorStream", { itemSize: 1, data: [10, 20, 30, 40] }],
  ["metadata", "an unsupported extension"]
];

describe("geometry operations reject unsupported top-level fields", () => {
  it.each(unsupported)("rejects %s during normalization and both builders", (field, value) => {
    const input = { ...quadInput(), [field]: value };
    const originalPositions = [...input.positions];
    const originalIndices = [...input.indices];
    expectUnsupported(() => normalizeGeometryAttributes(input), field);
    expectUnsupported(() => defineAuraCustomGeometry(input), field);
    expectUnsupported(() => defineAuraDynamicGeometry(input), field);
    expect(input.positions).toEqual(originalPositions);
    expect(input.indices).toEqual(originalIndices);
    expect(input[field as keyof typeof input]).toBe(value);
  });

  it.each(unsupported)("rejects %s on indexed and non-indexed deindex inputs", (field, value) => {
    const indexed = { ...defineAuraCustomGeometry(quadInput()), [field]: value };
    const nonIndexed = {
      ...defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [] }),
      [field]: value
    };
    expectUnsupported(() => auraGeometryToNonIndexed(indexed), field);
    expectUnsupported(() => auraGeometryToNonIndexed(nonIndexed), field);
    expect(indexed.indices).toEqual([2, 1, 0, 2, 3, 1]);
    expect(nonIndexed.indices).toEqual([]);
  });

  it.each(unsupported)("rejects %s on either or both merge inputs", (field, value) => {
    const first = defineAuraCustomGeometry(quadInput());
    const second = defineAuraCustomGeometry(quadInput());
    const firstWithExtra = { ...first, [field]: value };
    const secondWithExtra = { ...second, [field]: value };
    const firstPositions = Array.from(first.positions as readonly number[]);
    const secondPositions = Array.from(second.positions as readonly number[]);
    expectUnsupported(() => mergeAuraGeometries([firstWithExtra, second]), field);
    expectUnsupported(() => mergeAuraGeometries([first, secondWithExtra]), field);
    expectUnsupported(() => mergeAuraGeometries([firstWithExtra, secondWithExtra]), field);
    expect(Array.from(first.positions as readonly number[])).toEqual(firstPositions);
    expect(Array.from(second.positions as readonly number[])).toEqual(secondPositions);
    expect(first.indices).toEqual([2, 1, 0, 2, 3, 1]);
    expect(second.indices).toEqual([2, 1, 0, 2, 3, 1]);
  });

  it("revalidates a supported geometry after an untyped caller adds a stream", () => {
    const source = defineAuraCustomGeometry(quadInput());
    const stream = new Float32Array(16);
    Object.assign(source, { tangents: stream });
    expectUnsupported(() => auraGeometryToNonIndexed(source), "tangents");
    expectUnsupported(() => mergeAuraGeometries([source]), "tangents");
    expect(source.indices).toEqual([2, 1, 0, 2, 3, 1]);
    expect((source as typeof source & { tangents: Float32Array }).tangents).toBe(stream);
  });

  it("rejects an enumerable symbol-keyed stream rather than copying or dropping it", () => {
    const stream = Symbol("stream");
    const input = { ...quadInput(), [stream]: new Float32Array(4) };
    expectUnsupported(() => defineAuraCustomGeometry(input), "Symbol(stream)");
    expectUnsupported(() => auraGeometryToNonIndexed({ ...defineAuraCustomGeometry(quadInput()), [stream]: input[stream] }), "Symbol(stream)");
  });

  it("continues to deindex supported built-in, custom and morph streams in index order", () => {
    const source = defineAuraCustomGeometry(quadInput());
    const result = auraGeometryToNonIndexed(source);
    expect(Array.from(result.positions as Float32Array)).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0]);
    expect(result.indices).toEqual([]);
    expect(result.attributes!.paint!.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.attributes!.paint!.data)).toEqual([30, 20, 10, 30, 40, 20]);
    expect(result.attributes!.paint!.normalized).toBe(true);
    expect(Array.from(result.morphTargets![0]!.tangents!)).toEqual([0, 3, 0, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 4, 0, 0, 2, 0]);
    expect(result.groups).toEqual(source.groups);
    expect(result.drawRange).toEqual(source.drawRange);
    expect(result.bounds).toEqual(source.bounds);
    expect(Array.from(source.attributes!.paint!.data)).toEqual([255, 10, 255, 20, 255, 30, 255, 40]);
    expect(Array.from(source.morphTargets![0]!.tangents!)).toEqual([0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]);
  });

  it("continues to merge supported attributes, morph channels and metadata", () => {
    const first = defineAuraCustomGeometry(quadInput());
    const second = defineAuraCustomGeometry(quadInput());
    const merged = mergeAuraGeometries([first, second]);
    expect(Array.from(merged.indices)).toEqual([2, 1, 0, 2, 3, 1, 6, 5, 4, 6, 7, 5]);
    expect(Array.from(merged.attributes!.paint!.data)).toEqual([10, 20, 30, 40, 10, 20, 30, 40]);
    expect(merged.attributes!.paint!.data).toBeInstanceOf(Uint8Array);
    expect(merged.attributes!.paint!.normalized).toBe(true);
    expect(Array.from(merged.morphTargets![0]!.tangents!)).toEqual([0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]);
    expect(merged.groups).toEqual([
      { start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 5 },
      { start: 6, count: 3, materialIndex: 2 }, { start: 9, count: 3, materialIndex: 5 }
    ]);
    expect(merged.drawRange).toEqual({ start: 0, count: 12 });
    expect(merged.bounds).toEqual(first.bounds);
  });

  it("accepts dynamic geometry and preserves the non-indexed identity shortcut", () => {
    const dynamic = defineAuraDynamicGeometry(quadInput());
    expect(dynamic.dynamic).toBe(true);
    expect(normalizeGeometryAttributes(dynamic).vertexCount).toBe(4);
    const nonIndexed = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [] });
    expect(auraGeometryToNonIndexed(nonIndexed)).toBe(nonIndexed);
  });
});
