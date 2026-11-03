import { describe, expect, it } from "vitest";

import {
  applyAuraGeometryMatrix4,
  auraGeometryToNonIndexed,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  type AuraCustomGeometrySpec,
  type AuraGeometryMorphTargetSpec
} from "../../../packages/engine/src/agent-api/RootGeometry";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";

const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
const indices = [2, 1, 0, 2, 3, 1];
const positionDeltas = [0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4];
const normalDeltas = [1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0];
const tangentDeltas = [0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0];

function morph(options: { normal?: boolean; tangent?: boolean } = { normal: true, tangent: true }): AuraGeometryMorphTargetSpec {
  return {
    name: "bend",
    positions: Float32Array.from(positionDeltas),
    ...(options.normal ? { normals: Float32Array.from(normalDeltas) } : {}),
    ...(options.tangent ? { tangents: Float32Array.from(tangentDeltas) } : {})
  };
}

function quad(target = morph()): AuraCustomGeometrySpec {
  return defineAuraCustomGeometry({
    positions: Float32Array.from(vertices),
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices,
    morphTargets: [target]
  });
}

function values(input: ArrayLike<number> | undefined): number[] | undefined {
  return input === undefined ? undefined : Array.from(input);
}

function expectGeometryError(action: () => unknown, code: string, field: string): void {
  try {
    action();
    throw new Error("Expected the geometry operation to reject the input.");
  } catch (error) {
    expect(error).toMatchObject({ code, field });
  }
}

function normalized(vector: readonly number[]): number[] {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

describe("custom geometry morph normal and tangent channels", () => {
  it("retains named normal and tangent deltas in the public static and dynamic builders", () => {
    const source = morph();
    const staticSpec = geometry.define({ positions: vertices, indices, morphTargets: [source] });
    const dynamicSpec = geometry.dynamic({ positions: vertices, indices, morphTargets: [source] });

    for (const spec of [staticSpec, dynamicSpec]) {
      expect(spec.morphTargets).toHaveLength(1);
      expect(spec.morphTargets![0]).not.toBe(source);
      expect(spec.morphTargets![0]!.name).toBe("bend");
      expect(values(spec.morphTargets![0]!.positions)).toEqual(positionDeltas);
      expect(values(spec.morphTargets![0]!.normals)).toEqual(normalDeltas);
      expect(values(spec.morphTargets![0]!.tangents)).toEqual(tangentDeltas);
    }
    expect(dynamicSpec.dynamic).toBe(true);
  });

  it("preserves independently optional channels on separate named targets", () => {
    const positionOnly = { name: "position-only", positions: positionDeltas };
    const normalOnly = { name: "normal-only", positions: positionDeltas, normals: normalDeltas };
    const tangentOnly = { name: "tangent-only", positions: positionDeltas, tangents: tangentDeltas };
    const spec = geometry.define({ positions: vertices, indices, morphTargets: [positionOnly, normalOnly, tangentOnly] });

    expect(spec.morphTargets!.map((entry) => entry.name)).toEqual(["position-only", "normal-only", "tangent-only"]);
    expect(spec.morphTargets![0]!.normals).toBeUndefined();
    expect(spec.morphTargets![0]!.tangents).toBeUndefined();
    expect(values(spec.morphTargets![1]!.normals)).toEqual(normalDeltas);
    expect(spec.morphTargets![1]!.tangents).toBeUndefined();
    expect(spec.morphTargets![2]!.normals).toBeUndefined();
    expect(values(spec.morphTargets![2]!.tangents)).toEqual(tangentDeltas);
  });

  it.each([
    ["normals", [1, 2, 3]],
    ["tangents", [1, 2, 3]],
    ["normals", [...normalDeltas.slice(0, 11), Number.NaN]],
    ["tangents", [...tangentDeltas.slice(0, 11), Number.POSITIVE_INFINITY]]
  ] as const)("rejects malformed %s deltas from static and dynamic builders", (channel, bad) => {
    const target = { name: "bad", positions: positionDeltas, [channel]: bad };
    for (const build of [defineAuraCustomGeometry, defineAuraDynamicGeometry]) {
      expectGeometryError(
        () => build({ positions: vertices, indices, morphTargets: [target] }),
        "AURA_GEOMETRY_INVALID",
        `morphTargets[0].${channel}`
      );
    }
  });

  it("requires position deltas even when an optional channel is present", () => {
    const target = { name: "missing-position", normals: normalDeltas } as unknown as AuraGeometryMorphTargetSpec;
    expectGeometryError(
      () => defineAuraCustomGeometry({ positions: vertices, indices, morphTargets: [target] }),
      "AURA_GEOMETRY_INVALID",
      "morphTargets[0].positions"
    );
  });

  it("rejects an unknown untyped morph channel instead of silently discarding it", () => {
    const target = { positions: positionDeltas, colors: new Float32Array(16) } as unknown as AuraGeometryMorphTargetSpec;
    for (const build of [defineAuraCustomGeometry, defineAuraDynamicGeometry]) {
      expectGeometryError(
        () => build({ positions: vertices, indices, morphTargets: [target] }),
        "AURA_GEOMETRY_INCOMPATIBLE",
        "morphTargets[0].colors"
      );
    }
  });

  it.each(["normals", "tangents"] as const)("rejects a non-array %s channel from untyped callers", (channel) => {
    const target = { positions: positionDeltas, [channel]: null } as unknown as AuraGeometryMorphTargetSpec;
    expectGeometryError(
      () => defineAuraCustomGeometry({ positions: vertices, indices, morphTargets: [target] }),
      "AURA_GEOMETRY_INVALID",
      `morphTargets[0].${channel}`
    );
  });

  it("deindexes each morph channel in index order without mutating the authored arrays", () => {
    const source = quad();
    const target = source.morphTargets![0]!;
    const original = {
      positions: values(target.positions),
      normals: values(target.normals),
      tangents: values(target.tangents)
    };
    const expanded = geometry.toNonIndexed(source);
    const result = expanded.morphTargets![0]!;

    expect(expanded.indices).toHaveLength(0);
    expect(result.name).toBe("bend");
    expect(values(result.positions)).toEqual([0, 0, 3, 0, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 4, 0, 0, 2]);
    expect(values(result.normals)).toEqual([3, 0, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 4, 0, 0, 2, 0, 0]);
    expect(values(result.tangents)).toEqual([0, 3, 0, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 4, 0, 0, 2, 0]);
    expect(result.positions).not.toBe(target.positions);
    expect(result.normals).not.toBe(target.normals);
    expect(result.tangents).not.toBe(target.tangents);
    (result.positions as Float32Array)[0] = 99;
    (result.normals as Float32Array)[0] = 99;
    (result.tangents as Float32Array)[0] = 99;
    expect({ positions: values(target.positions), normals: values(target.normals), tangents: values(target.tangents) }).toEqual(original);
  });

  it("concatenates matching morph channels when merging indexed and non-indexed geometry", () => {
    const first = quad();
    const second = defineAuraCustomGeometry({
      positions: [4, 0, 0, 5, 0, 0, 4, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [],
      morphTargets: [{
        name: "bend",
        positions: [0, 0, 5, 0, 0, 6, 0, 0, 7],
        normals: [5, 0, 0, 6, 0, 0, 7, 0, 0],
        tangents: [0, 5, 0, 0, 6, 0, 0, 7, 0]
      }]
    });
    const merged = geometry.merge([first, second]);
    const target = merged.morphTargets![0]!;

    expect(Array.from(merged.indices)).toEqual([2, 1, 0, 2, 3, 1, 4, 5, 6]);
    expect(target.name).toBe("bend");
    expect(values(target.positions)).toEqual([...positionDeltas, 0, 0, 5, 0, 0, 6, 0, 0, 7]);
    expect(values(target.normals)).toEqual([...normalDeltas, 5, 0, 0, 6, 0, 0, 7, 0, 0]);
    expect(values(target.tangents)).toEqual([...tangentDeltas, 0, 5, 0, 0, 6, 0, 0, 7, 0]);
    expect(target.normals).not.toBe(first.morphTargets![0]!.normals);
    expect(target.tangents).not.toBe(second.morphTargets![0]!.tangents);
    (target.normals as Float32Array)[0] = 99;
    (target.tangents as Float32Array)[12] = 99;
    expect(values(first.morphTargets![0]!.normals)).toEqual(normalDeltas);
    expect(values(second.morphTargets![0]!.tangents)).toEqual([0, 5, 0, 0, 6, 0, 0, 7, 0]);
  });

  it.each(["normals", "tangents"] as const)("rejects a merge with mismatched %s channel presence", (channel) => {
    const full = quad();
    const partialTarget = { ...morph(), [channel]: undefined };
    const partial = quad(partialTarget);
    expectGeometryError(() => mergeAuraGeometries([full, partial]), "AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[0].${channel}`);
    expectGeometryError(() => mergeAuraGeometries([partial, full]), "AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[0].${channel}`);
  });

  it("checks channel compatibility independently for every named target in a merge", () => {
    const first = defineAuraCustomGeometry({
      positions: vertices, indices,
      morphTargets: [
        { name: "one", positions: positionDeltas },
        { name: "two", positions: positionDeltas, normals: normalDeltas }
      ]
    });
    const second = defineAuraCustomGeometry({
      positions: vertices, indices,
      morphTargets: [
        { name: "one", positions: positionDeltas },
        { name: "two", positions: positionDeltas }
      ]
    });
    expectGeometryError(() => mergeAuraGeometries([first, second]), "AURA_GEOMETRY_INCOMPATIBLE", "morphTargets[1].normals");
  });

  it("revalidates borrowed morph data before deindex, merge and transform", () => {
    const source = quad();
    const normals = source.morphTargets![0]!.normals as Float32Array;
    normals[3] = Number.NaN;
    for (const action of [
      () => auraGeometryToNonIndexed(source),
      () => mergeAuraGeometries([source]),
      () => applyAuraGeometryMatrix4(source, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    ]) {
      expectGeometryError(action, "AURA_GEOMETRY_INVALID", "morphTargets[0].normals");
    }
  });

  it("preserves the normalized direction of blended normal deltas under a sheared nonuniform transform", () => {
    const baseNormal = [1, 2, 1];
    const deltaNormal = [0.5, -0.25, 1];
    const source = defineAuraCustomGeometry({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [...baseNormal, ...baseNormal, ...baseNormal],
      indices: [0, 1, 2],
      morphTargets: [{ name: "tilt", positions: [1, 0, 0, 0, 1, 0, 0, 0, 1], normals: [...deltaNormal, ...deltaNormal, ...deltaNormal] }]
    });
    // A = [[2, 1, 0], [0, 3, 0], [0, 0, -1]]; translation affects no delta.
    const matrix = [2, 0, 0, 0, 1, 3, 0, 0, 0, 0, -1, 0, 5, -2, 4, 1];
    const transformed = geometry.applyMatrix4(source, matrix);
    const base = Array.from(transformed.normals as Float32Array).slice(0, 3);
    const delta = Array.from(transformed.morphTargets![0]!.normals!).slice(0, 3);
    const inverseTranspose = ([x, y, z]: readonly number[]) => [x! / 2, -x! / 6 + y! / 3, -z!];

    expect(values(transformed.morphTargets![0]!.positions)).toEqual([2, 0, 0, 1, 3, 0, 0, 0, -1]);
    for (const weight of [-0.5, 0, 0.25, 1]) {
      const actual = normalized(base.map((value, axis) => value + weight * delta[axis]!));
      const expected = normalized(inverseTranspose(baseNormal.map((value, axis) => value + weight * deltaNormal[axis]!)));
      for (let axis = 0; axis < 3; axis += 1) expect(actual[axis]).toBeCloseTo(expected[axis]!, 6);
    }
    expect(values(source.morphTargets![0]!.normals)).toEqual([...deltaNormal, ...deltaNormal, ...deltaNormal]);
  });

  it("rejects transforms of normal deltas without base normals and tangent deltas without base tangents", () => {
    const matrix = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const noBaseNormals = defineAuraCustomGeometry({ positions: vertices, indices, morphTargets: [morph({ normal: true })] });
    const withTangents = quad(morph({ tangent: true }));

    expectGeometryError(() => applyAuraGeometryMatrix4(noBaseNormals, matrix), "AURA_GEOMETRY_INCOMPATIBLE", "morphTargets[0].normals");
    expectGeometryError(() => applyAuraGeometryMatrix4(withTangents, matrix), "AURA_GEOMETRY_INCOMPATIBLE", "morphTargets[0].tangents");
  });
});
