/**
 * WP-13 mesh contracts: topology validation, logical memory estimation and
 * quantized compression through the public opt-in geometry-tools subpath.
 * Expectations are derived from the meshes' closed-form topology and sizes.
 */
import { describe, expect, it } from "vitest";
import {
  AuraTopologyValidationError,
  dequantizeAuraGeometry,
  estimateAuraGeometryMemory,
  quantizeAuraGeometry,
  validateAuraGeometryTopology
} from "@aura3d/engine/geometry-tools";

/** Unit tetrahedron with outward, consistent winding. */
const tetrahedron = () => ({
  kind: "aura-custom-geometry" as const,
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
});

describe("validateAuraGeometryTopology", () => {
  it("accepts a closed, consistently wound manifold", () => {
    const result = validateAuraGeometryTopology(tetrahedron());
    expect(result).toMatchObject({ valid: true, edgeAnalysisComplete: true, indexed: true, vertexCount: 4, triangleCount: 4, analyzedTriangleCount: 4, edgeCount: 6 });
    expect(result.boundaryEdges).toEqual([]);
    expect(result.nonManifoldEdges).toEqual([]);
    expect(result.inconsistentWindingEdges).toEqual([]);
  });

  it("reports boundary, flipped-winding, nonmanifold and degenerate faces without throwing", () => {
    const open = validateAuraGeometryTopology({ ...tetrahedron(), indices: [0, 2, 1, 0, 1, 3] });
    expect(open.valid).toBe(true);
    expect(open.boundaryEdges).toHaveLength(4);

    const flipped = validateAuraGeometryTopology({ ...tetrahedron(), indices: [0, 1, 2, 0, 1, 3, 0, 3, 2, 1, 2, 3] });
    expect(flipped.valid).toBe(false);
    expect(flipped.inconsistentWindingEdges.map((edge) => edge.vertices)).toContainEqual([0, 1]);

    const fin = validateAuraGeometryTopology({
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1],
      indices: [0, 1, 2, 1, 0, 3, 0, 1, 4]
    });
    expect(fin.nonManifoldEdges).toEqual([{ vertices: [0, 1], triangles: [0, 1, 2] }]);
    expect(fin.valid).toBe(false);

    const degenerate = validateAuraGeometryTopology({ ...tetrahedron(), indices: [0, 0, 1, 0, 1, 9, 0, 1, 3] });
    expect(degenerate.degenerateFaces).toEqual([{ triangle: 0, vertices: [0, 0, 1], reason: "repeated-index" }]);
    expect(degenerate.invalidIndices).toEqual([{ offset: 5, triangle: 1, value: 9, reason: "out-of-range" }]);
    expect(degenerate.edgeAnalysisComplete).toBe(false);
    expect(degenerate.valid).toBe(false);
  });

  it("fails closed on malformed input, unsupported topology and capacity", () => {
    const code = (run: () => unknown): string => {
      try { run(); } catch (error) { expect(error).toBeInstanceOf(AuraTopologyValidationError); return (error as AuraTopologyValidationError).code; }
      return "no-error";
    };
    expect(code(() => validateAuraGeometryTopology({ ...tetrahedron(), topology: "lines" }))).toBe("UNSUPPORTED_TOPOLOGY");
    expect(code(() => validateAuraGeometryTopology({ ...tetrahedron(), indices: [0, 1] }))).toBe("INVALID_INPUT");
    expect(code(() => validateAuraGeometryTopology(tetrahedron(), { maxTriangles: 3 }))).toBe("CAPACITY");
    expect(code(() => validateAuraGeometryTopology(tetrahedron(), { maxTriangles: 65_537 }))).toBe("INVALID_INPUT");
    expect(code(() => validateAuraGeometryTopology(tetrahedron(), { relativeAreaTolerance: -1 }))).toBe("INVALID_INPUT");
  });
});

describe("estimateAuraGeometryMemory", () => {
  it("counts logical source bytes and the staging upload layout", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const estimate = estimateAuraGeometryMemory({
      kind: "aura-custom-geometry",
      positions,
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: new Uint16Array([0, 2, 1, 0, 1, 3]),
      morphTargets: [{ positions: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] }]
    });
    // 8 + 12 numbers in plain arrays at 8 logical bytes; 48 + 12 typed bytes.
    expect(estimate.cpu).toEqual({ numberArrayBytes: 160, colorStringBytes: 0, typedBufferBytes: 60, typedViewBytes: 60, estimatedBytes: 220 });
    // position + generated normal (24) + uv (8) per vertex, 16-bit indices, float32 morph deltas.
    expect(estimate.logicalUpload).toEqual({ vertexStrideBytes: 32, vertexBytes: 128, indexBytes: 12, morphBytes: 48, totalBytes: 188 });
  });

  it("counts a shared backing buffer once and rejects malformed sizes", () => {
    const buffer = new Float32Array(24);
    const estimate = estimateAuraGeometryMemory({
      kind: "aura-custom-geometry",
      positions: buffer.subarray(0, 12),
      normals: buffer.subarray(12, 24),
      indices: []
    });
    expect(estimate.cpu.typedBufferBytes).toBe(96);
    expect(estimate.cpu.typedViewBytes).toBe(96);
    expect(() => estimateAuraGeometryMemory({ kind: "aura-custom-geometry", positions: [0, 0], indices: [] })).toThrow(/multiple of 3/);
    expect(() => estimateAuraGeometryMemory({ kind: "aura-custom-geometry", positions: new Float64Array(3) as never, indices: [] })).toThrow(/unsupported typed storage/);
  });
});

describe("quantizeAuraGeometry / dequantizeAuraGeometry", () => {
  const source = () => ({
    kind: "aura-custom-geometry" as const,
    positions: [-2, 0, 5, 2, 1, 5, 0, 3, 7, 1, 1, 6],
    normals: [0, 0, 1, 0, 1, 0, 1, 0, 0, -0.6, 0, 0.8],
    uvs: [0, 0, 1, 0, 0.5, 1, 0.25, 0.75],
    colors: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1],
    indices: [0, 1, 2, 0, 2, 3],
    groups: [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }],
    morphTargets: [{ name: "lift", positions: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] }],
    drawRange: { start: 0, count: 6 }
  });

  it("round-trips within the quantization step and preserves every non-quantized field", () => {
    const spec = source();
    const quantized = quantizeAuraGeometry(spec, { positionBits: 12, normalBits: 10, uvBits: 8 });
    // Range-quantized error is at most half a step: extent / (2^bits - 1) / 2.
    expect(quantized.positions.maxError).toBeLessThanOrEqual(4 / 4095 / 2 + 1e-7);
    expect(quantized.normals!.maxError).toBeLessThanOrEqual(1 / 511 / 2 + 1e-7);
    expect(quantized.uvs!.maxError).toBeLessThanOrEqual(1 / 255 / 2 + 1e-7);
    expect(quantized.indices).toBeInstanceOf(Uint16Array);
    expect(quantized.uncompressedFields).toEqual(["colors", "morphTargets", "groups", "drawRange"]);
    expect(quantized.bytes.before).toBe((12 + 12 + 8) * 4 + 6 * 4);
    expect(quantized.bytes.after).toBe((12 + 12 + 8) * 2 + 6 * 2);

    const restored = dequantizeAuraGeometry(quantized);
    const close = (actual: ArrayLike<number>, expected: readonly number[], tolerance: number) =>
      expected.forEach((value, i) => expect(Math.abs(actual[i]! - value)).toBeLessThanOrEqual(tolerance));
    close(restored.positions as Float32Array, spec.positions, quantized.positions.maxError + 1e-6);
    close(restored.normals as Float32Array, spec.normals, quantized.normals!.maxError + 1e-6);
    close(restored.uvs as Float32Array, spec.uvs, quantized.uvs!.maxError + 1e-6);
    expect(restored.indices).toEqual(spec.indices);
    expect(restored.groups).toEqual(spec.groups);
    expect(restored.morphTargets).toEqual(spec.morphTargets);
    expect(restored.colors).toEqual(spec.colors);
    expect(restored.drawRange).toEqual(spec.drawRange);
    // The topology of the decoded mesh is unchanged.
    expect(validateAuraGeometryTopology(restored).boundaryEdges).toHaveLength(validateAuraGeometryTopology(spec).boundaryEdges.length);
  });

  it("never aliases or modifies the source and keeps flat axes exact", () => {
    const spec = source();
    const snapshot = JSON.stringify(spec);
    const quantized = quantizeAuraGeometry(spec);
    expect(JSON.stringify(spec)).toBe(snapshot);
    expect(quantized.passthrough.groups).not.toBe(spec.groups);
    expect(quantized.passthrough.morphTargets![0]!.positions).not.toBe(spec.morphTargets[0]!.positions);
    const flat = quantizeAuraGeometry({ kind: "aura-custom-geometry", positions: [1, 2, 3, 4, 2, 3, 1, 2, 9], indices: [] });
    expect(flat.positions.scale[1]).toBe(0);
    expect(flat.indices).toBeUndefined();
    expect(Array.from(dequantizeAuraGeometry(flat).positions as Float32Array)).toEqual([1, 2, 3, 4, 2, 3, 1, 2, 9]);
  });

  it("rejects invalid options, budgets, out-of-range normals and corrupt encodings", () => {
    const spec = source();
    expect(() => quantizeAuraGeometry(spec, { positionBits: 7 })).toThrow(/positionBits/);
    expect(() => quantizeAuraGeometry(spec, { normalBits: 17 })).toThrow(/normalBits/);
    expect(() => quantizeAuraGeometry(spec, { maxVertices: 3 })).toThrow(/budget is 3/);
    expect(() => quantizeAuraGeometry({ ...spec, normals: [0, 0, 2, 0, 1, 0, 1, 0, 0, 0, 0, 1] })).toThrow(/\[-1, 1\]/);
    expect(() => quantizeAuraGeometry({ ...spec, groups: [{ start: 0, count: 99 }] })).toThrow();
    const quantized = quantizeAuraGeometry(spec);
    expect(() => dequantizeAuraGeometry({ ...quantized, vertexCount: 5 })).toThrow(/vertexCount/);
    expect(() => dequantizeAuraGeometry({ ...quantized, indices: new Uint16Array([0, 1, 4]) })).toThrow(/out of range/);
  });
});
