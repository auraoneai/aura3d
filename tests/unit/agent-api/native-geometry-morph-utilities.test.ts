import { describe, expect, it, vi } from "vitest";
import type { AuraCustomGeometrySpec } from "../../../packages/engine/src/agent-api/RootGeometry.js";
import { assertGeometryMorphChannels } from "../../../packages/engine/src/agent-api/geometry/MorphChannels.js";
import { computeAuraCreasedNormals, remapAuraGeometryVertices, weldAuraGeometry } from "../../../packages/engine/src/agent-api/geometry/GeometryUtilities.js";
import { buildUVAtlas } from "../../../packages/engine/src/agent-api/geometry/UVAtlas.js";
import { deformAuraMeshAlongCurve, simplifyAuraMesh, splitAuraMeshEdges, tessellateAuraMesh } from "../../../packages/engine/src/agent-api/geometry/MeshModifiers.js";

function square(): AuraCustomGeometrySpec {
  return {
    kind: "aura-custom-geometry",
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: [0, 1, 2, 0, 2, 3],
    morphTargets: [{
      name: "shape",
      positions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      normals: new Float32Array([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]),
      tangents: new Float32Array([-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12])
    }]
  };
}

const atlasOptions = { destination: "uv1s" as const, width: 128, height: 128, gutter: 2, texelDensity: 16, seams: [[0, 2] as const] };

describe("morph channels in geometry utilities", () => {
  it("remaps positions, normals and tangents together without borrowing their arrays", () => {
    const input = square();
    const output = remapAuraGeometryVertices(input, [2, 0, 1, 3, 0], [4, 2, 0, 1, 0, 3]);
    const result = output.morphTargets![0]!;
    expect(Array.from(output.indices)).toEqual([4, 2, 0, 1, 0, 3]);
    expect(Array.from(result.positions)).toEqual([7, 8, 9, 1, 2, 3, 4, 5, 6, 10, 11, 12, 1, 2, 3]);
    expect(Array.from(result.normals!)).toEqual([17, 18, 19, 11, 12, 13, 14, 15, 16, 20, 21, 22, 11, 12, 13]);
    expect(Array.from(result.tangents!)).toEqual([-7, -8, -9, -1, -2, -3, -4, -5, -6, -10, -11, -12, -1, -2, -3]);
    expect(result.positions).not.toBe(input.morphTargets![0]!.positions);
    expect(result.normals).not.toBe(input.morphTargets![0]!.normals);
    expect(result.tangents).not.toBe(input.morphTargets![0]!.tangents);
    (result.normals as Float32Array)[0] = 999;
    expect(input.morphTargets![0]!.normals![6]).toBe(17);
  });

  it.each(["normals", "tangents"] as const)("does not weld duplicate positions whose morph %s differ", (channel) => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
      indices: [0, 1, 2, 3, 1, 2],
      morphTargets: [{ positions: Array(12).fill(0), [channel]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0] }]
    };
    const distinct = weldAuraGeometry(input, 0);
    expect(distinct.oldToNew[0]).not.toBe(distinct.oldToNew[3]);
    const equal = { ...input, morphTargets: [{ ...input.morphTargets![0]!, [channel]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0] }] };
    const joined = weldAuraGeometry(equal, 0);
    expect(joined.oldToNew[0]).toBe(joined.oldToNew[3]);
    expect(joined.geometry.morphTargets![0]![channel]).toHaveLength(9);
  });

  it("duplicates every morph channel at an atlas seam and leaves source arrays untouched", () => {
    const input = square();
    const result = buildUVAtlas(input, atlasOptions);
    expect(Array.from(result.vertexRemap)).toEqual([0, 1, 2, 0, 2, 3]);
    const morph = result.geometry.morphTargets![0]!;
    expect(Array.from(morph.positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 7, 8, 9, 10, 11, 12]);
    expect(Array.from(morph.normals!)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 11, 12, 13, 17, 18, 19, 20, 21, 22]);
    expect(Array.from(morph.tangents!)).toEqual([-1, -2, -3, -4, -5, -6, -7, -8, -9, -1, -2, -3, -7, -8, -9, -10, -11, -12]);
    expect(morph.normals).not.toBe(input.morphTargets![0]!.normals);
    expect(morph.tangents).not.toBe(input.morphTargets![0]!.tangents);
    (morph.tangents as Float32Array)[0] = 42;
    expect(input.morphTargets![0]!.tangents![0]).toBe(-1);
  });

  it("interpolates all present morph channels on a tessellated edge", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 2, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      morphTargets: [{ name: "m", positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], normals: [0, 0, 0, 2, 0, 0, 0, 2, 0], tangents: [0, 0, 0, 0, 2, 0, 0, 0, 2] }]
    };
    const result = tessellateAuraMesh(input, { maxEdgeLength: 2, maxOperations: 1 });
    const outputPositions = result.geometry.positions as Float32Array;
    const vertex = Array.from({ length: result.stats.outputVertices }, (_, i) => i)
      .find((i) => outputPositions[i * 3] === 1 && outputPositions[i * 3 + 1] === 0.5)!;
    expect(vertex).toBeDefined();
    const target = result.geometry.morphTargets![0]!;
    expect(Array.from(target.positions).slice(vertex * 3, vertex * 3 + 3)).toEqual([1, 1, 0]);
    expect(Array.from(target.normals!).slice(vertex * 3, vertex * 3 + 3)).toEqual([1, 1, 0]);
    expect(Array.from(target.tangents!).slice(vertex * 3, vertex * 3 + 3)).toEqual([0, 1, 1]);
    expect(result.diagnostics.some((entry) => entry.code === "attributes-interpolated")).toBe(true);
  });

  it("keeps a tessellated normal delta in the same scale as its normalized base normal", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 2, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      morphTargets: [{ positions: Array(9).fill(0), normals: [0, 0, 0, 0.2, 0.4, 0, 0.6, 0.8, 0] }]
    };
    const result = tessellateAuraMesh(input, { maxEdgeLength: 2, maxOperations: 1 });
    const positions = result.geometry.positions as Float32Array;
    const vertex = Array.from({ length: result.stats.outputVertices }, (_, i) => i)
      .find((i) => positions[i * 3] === 1 && positions[i * 3 + 1] === 0.5)!;
    expect(vertex).toBeDefined();
    const normals = result.geometry.normals as Float32Array;
    const deltas = result.geometry.morphTargets![0]!.normals!;
    expect(normals[vertex * 3]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(normals[vertex * 3 + 1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(deltas[vertex * 3]).toBeCloseTo(0.4 / Math.SQRT1_2, 6);
    expect(deltas[vertex * 3 + 1]).toBeCloseTo(0.6 / Math.SQRT1_2, 6);
  });

  it("preserves directional deltas when simplification performs no collapse", () => {
    const input = square();
    const result = simplifyAuraMesh(input, { targetTriangleCount: 2 });
    expect(Array.from(result.geometry.morphTargets![0]!.normals!)).toEqual(Array.from(input.morphTargets![0]!.normals!));
    expect(Array.from(result.geometry.morphTargets![0]!.tangents!)).toEqual(Array.from(input.morphTargets![0]!.tangents!));
  });

  it("rejects normal-recomputing and nonlinear operations that cannot preserve direction deltas", () => {
    const input = square();
    expect(() => simplifyAuraMesh(input, { targetTriangleCount: 1 })).toThrow(/morph normal or tangent/);
    expect(() => splitAuraMeshEdges(input, { creaseAngle: Math.PI })).toThrow(/morph normal or tangent/);
    expect(() => computeAuraCreasedNormals(input, Math.PI)).toThrow(/morph normal or tangent/);
    const getPoint = vi.fn((t: number) => [0, 0, t] as const);
    expect(() => deformAuraMeshAlongCurve(input, { curve: { getPoint } })).toThrow(/morph normal or tangent/);
    expect(getPoint).not.toHaveBeenCalled();
  });

  it("rejects malformed or unknown channels before any utility silently loses them", () => {
    const input = square();
    const badLength = { ...input, morphTargets: [{ ...input.morphTargets![0]!, normals: [0, 0, 0] }] };
    expect(() => remapAuraGeometryVertices(badLength, [0, 1, 2, 3])).toThrow(/morph normals/);
    expect(() => weldAuraGeometry(badLength)).toThrow(/morph normals/);
    expect(() => buildUVAtlas(badLength, atlasOptions)).toThrow(/morph normals/);
    expect(() => tessellateAuraMesh(badLength, { maxEdgeLength: 2 })).toThrow(/morph normals/);
    const nonfinite = { ...input, morphTargets: [{ ...input.morphTargets![0]!, tangents: [0, 0, 0, 0, 0, 0, 0, 0, 0, Infinity, 0, 0] }] };
    expect(() => buildUVAtlas(nonfinite, atlasOptions)).toThrow(/morph tangents/);
    const unknown = { ...input, morphTargets: [{ ...input.morphTargets![0]!, unsupported: [1, 2, 3] }] };
    expect(() => remapAuraGeometryVertices(unknown, [0, 1, 2, 3])).toThrow(/unsupported morph target field/);
  });

  it("validates untyped target containers, names and float32 representability", () => {
    expect(() => assertGeometryMorphChannels(null, 1)).toThrow(/morph targets must be an array/);
    expect(() => assertGeometryMorphChannels([{ positions: [0, 0, 0], name: 3 }], 1)).toThrow(/names must be strings/);
    expect(() => assertGeometryMorphChannels([{ positions: [0, 0, Number.MAX_VALUE] }], 1)).toThrow(/finite float32/);
    expect(() => assertGeometryMorphChannels(undefined, -1)).toThrow(/vertex count/);
    expect(() => assertGeometryMorphChannels([{ name: "", positions: [0, 0, 0] }], 1)).not.toThrow();
  });
});
