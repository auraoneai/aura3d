import { describe, expect, it } from "vitest";
import type { AuraCustomGeometrySpec } from "../../../packages/engine/src/agent-api/RootGeometry.js";
import { deformAuraMeshAlongCurve, simplifyAuraMesh, splitAuraMeshEdges, tessellateAuraMesh } from "../../../packages/engine/src/agent-api/geometry/MeshModifiers.js";
import { createMeshSurfaceSampler } from "../../../packages/engine/src/agent-api/geometry/MeshSurfaceSampler.js";
import { computeAuraCreasedNormals, convertAuraTriangleTopology, deinterleaveAuraAttributes, evaluateAuraMorphPositions, interleaveAuraAttributes, mergeAuraGeometryGroups, remapAuraGeometryVertices, weldAuraGeometry } from "../../../packages/engine/src/agent-api/geometry/GeometryUtilities.js";
import { parametricGeometry } from "../../../packages/rendering/src/geometry/ParametricGeometry.js";
import { loftGeometry } from "../../../packages/rendering/src/geometry/LoftGeometry.js";
import { teapotGeometry } from "../../../packages/rendering/src/geometry/TeapotGeometry.js";

function square(): AuraCustomGeometrySpec {
  return {
    kind: "aura-custom-geometry",
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    uv1s: new Float32Array([0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9]),
    colors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]),
    indices: [0, 1, 2, 0, 2, 3],
    attributes: { heat: { itemSize: 1, data: new Float32Array([0, 1, 2, 3]) } },
    morphTargets: [{ name: "lift", positions: new Float32Array([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]) }],
    groups: [{ start: 0, count: 6, materialIndex: 7 }],
    drawRange: { start: 0, count: 6 }
  };
}

describe("native mesh modifiers", () => {
  it("collapses edges and compacts every vertex stream while preserving group and draw ownership", () => {
    const input = square();
    const before = Array.from(input.positions as Float32Array);
    const result = simplifyAuraMesh(input, { targetTriangleCount: 1 });
    expect(result.stats).toEqual({ inputVertices: 4, outputVertices: 3, inputTriangles: 2, outputTriangles: 1 });
    expect(result.geometry.indices).toHaveLength(3);
    expect(result.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 7 }]);
    expect(result.geometry.drawRange).toEqual({ start: 0, count: 3 });
    expect(result.geometry.attributes!.heat!.data).toHaveLength(3);
    expect(result.geometry.uv1s).toHaveLength(6);
    expect(result.geometry.morphTargets![0]!.positions).toHaveLength(9);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "attributes-interpolated")).toBe(true);
    expect(Array.from(input.positions as Float32Array)).toEqual(before);
    expect(result.geometry.positions).not.toBe(input.positions);
  });

  it("reports an unreachable target instead of crossing a material boundary", () => {
    const input = { ...square(), groups: [{ start: 0, count: 3, materialIndex: 1 }, { start: 3, count: 3, materialIndex: 2 }] };
    const result = simplifyAuraMesh(input, { targetTriangleCount: 1 });
    expect(result.stats.outputTriangles).toBe(2);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "target-unreachable")).toBe(true);
  });

  it("does not pinch distinct boundary loops when simplifying an annulus", () => {
    const ring: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 1, 1, 0, 9, 1, 0, 9, 9, 0, 1, 9, 0],
      indices: [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    };
    // Radial edges are shorter than either boundary loop. Collapsing an
    // interior radial edge would join the loops at a non-manifold vertex.
    const result = simplifyAuraMesh(ring, { targetTriangleCount: 6, maxEdgeLength: 2 });
    expect(result.stats.outputTriangles).toBe(8);
    expect(result.diagnostics.some((d) => d.code === "target-unreachable")).toBe(true);
  });

  it("splits a right-angle vertex fan and preserves attributes and morphs", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2, 1, 0, 3],
      attributes: { id: { itemSize: 1, data: [10, 20, 30, 40] } },
      morphTargets: [{ name: "m", positions: [0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 2] }]
    };
    const split = splitAuraMeshEdges(input, { creaseAngle: Math.PI / 4 });
    expect(split.stats.outputVertices).toBe(6);
    expect(split.geometry.attributes!.id!.data).toHaveLength(6);
    expect(split.geometry.morphTargets![0]!.positions).toHaveLength(18);
    const normals = split.geometry.normals as Float32Array;
    const indices = Array.from(split.geometry.indices);
    const first = indices[0]! * 3; const second = indices[4]! * 3;
    expect(normals[first + 2]).toBeCloseTo(1);
    expect(normals[second + 1]).toBeCloseTo(1);
    expect(splitAuraMeshEdges(input, { creaseAngle: Math.PI }).stats.outputVertices).toBe(4);
  });

  it("bisects shared edges, interpolates vertex streams and enforces a triangle budget", () => {
    const result = tessellateAuraMesh(square(), { maxEdgeLength: 0.8, maxTriangles: 64 });
    expect(result.stats.outputTriangles).toBeGreaterThan(2);
    expect(result.geometry.groups).toEqual([{ start: 0, count: result.stats.outputTriangles * 3, materialIndex: 7 }]);
    expect(result.geometry.morphTargets![0]!.positions).toHaveLength(result.stats.outputVertices * 3);
    const positions = result.geometry.positions as Float32Array;
    const indices = Array.from(result.geometry.indices);
    let totalArea = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map((index) => [positions[index! * 3]!, positions[index! * 3 + 1]!]);
      totalArea += Math.abs((b![0]! - a![0]!) * (c![1]! - a![1]!) - (b![1]! - a![1]!) * (c![0]! - a![0]!)) / 2;
    }
    expect(totalArea).toBeCloseTo(1);
    expect(() => tessellateAuraMesh(square(), { maxEdgeLength: 0.1, maxTriangles: 2 })).toThrow(/maxTriangles/);
    expect(tessellateAuraMesh(square(), { maxEdgeLength: 0.1, maxOperations: 0 }).diagnostics.some((d) => d.code === "operation-limit")).toBe(true);
  });

  it("rejects a tessellation midpoint that rounds a triangle flat in float32", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [16_777_216, 0, 0, 16_777_218, 0, 0, 16_777_216, 1, 0],
      indices: [0, 1, 2]
    };
    expect(() => tessellateAuraMesh(input, { maxEdgeLength: 2, maxOperations: 1 })).toThrow(/degenerate.*float32/i);
    expect(input.positions).toEqual([16_777_216, 0, 0, 16_777_218, 0, 0, 16_777_216, 1, 0]);
  });

  it("keeps implicit smooth normals stable when subdivision changes face areas", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [0, 0, 0, 2, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 1, 2, 0, 3, 4]
    };
    const result = tessellateAuraMesh(input, { maxEdgeLength: 1.5, maxOperations: 1 });
    const positions = result.geometry.positions as Float32Array;
    const vertex = Array.from({ length: result.stats.outputVertices }, (_, i) => i)
      .find((i) => positions[i * 3] === 0 && positions[i * 3 + 1] === 0 && positions[i * 3 + 2] === 0)!;
    const normals = result.geometry.normals as Float32Array;
    expect(normals).toBeDefined();
    expect(normals[vertex * 3]).toBeCloseTo(1 / Math.sqrt(5));
    expect(normals[vertex * 3 + 1]).toBeCloseTo(0);
    expect(normals[vertex * 3 + 2]).toBeCloseTo(2 / Math.sqrt(5));
    expect(result.diagnostics.some((entry) => entry.code === "normals-recomputed")).toBe(true);
  });

  it("decodes interleaved normalized attributes before interpolation and reports the storage conversion", () => {
    const input: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry", positions: [0, 0, 0, 2, 0, 0, 0, 1, 0], indices: [0, 1, 2],
      attributes: { weight: { itemSize: 1, data: new Uint8Array([9, 0, 9, 255, 9, 0]), stride: 2, offset: 1, normalized: true } }
    };
    const result = tessellateAuraMesh(input, { maxEdgeLength: 1.5, maxOperations: 1 });
    const weights = Array.from(result.geometry.attributes!.weight!.data);
    expect(weights.some((value) => Math.abs(value - 0.5) < 1e-6)).toBe(true);
    expect(result.geometry.attributes!.weight!.normalized).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "attributes-packed")).toBe(true);
    expect(createMeshSurfaceSampler(input, { weightAttribute: "weight" }).sample().attributes.weight![0]).toBeGreaterThan(0);
  });

  it("deforms positions and relative morphs along a curve, and rejects a zero-length domain", () => {
    const input: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions: [-0.2, 0, 0, 0.2, 0, 0, 0, 0, 1], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], indices: [0, 1, 2], morphTargets: [{ positions: [0, 0, 0.1, 0, 0, 0.1, 0, 0, 0] }] };
    const result = deformAuraMeshAlongCurve(input, { axis: "z", morphMode: "relative", curve: { getPoint: (t) => [2 * t, 0, 0], getTangent: () => [1, 0, 0] } });
    const points = result.geometry.positions as Float32Array;
    expect(points[2]).toBeCloseTo(0.2);
    expect(points[6]).toBeCloseTo(2);
    expect((result.geometry.morphTargets![0]!.positions as Float32Array)[0]).toBeCloseTo(0.2);
    expect(result.diagnostics.some((d) => d.code === "normals-approximated")).toBe(true);
    expect(() => deformAuraMeshAlongCurve(input, { axis: "y", curve: { getPoint: (t) => [t, 0, 0] } })).toThrow(/range/);
  });

  it("keeps a straight z-axis mesh and its normals unchanged when the curve has matching scale", () => {
    const source = square();
    const input: AuraCustomGeometrySpec = { ...source, positions: [0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1], morphTargets: undefined };
    const result = deformAuraMeshAlongCurve(input, { curve: { getPoint: (t) => [0, 0, t], getTangent: () => [0, 0, 1] } });
    expect(Array.from(result.geometry.positions as Float32Array)).toEqual(input.positions);
    expect(Array.from(result.geometry.normals as Float32Array)).toEqual(Array.from(input.normals as Float32Array));
  });

  it("rejects curve output that cannot be represented by the returned float32 streams", () => {
    const source: AuraCustomGeometrySpec = {
      kind: "aura-custom-geometry",
      positions: [-1, 0, 0, 1, 0, 0, 0, 0, 1],
      indices: [0, 1, 2]
    };
    expect(() => deformAuraMeshAlongCurve(source, {
      curve: { getPoint: (t) => [Number.MAX_VALUE / 2, 0, t], getTangent: () => [0, 0, 1] }
    })).toThrow(/finite.*float32/i);
  });
});

describe("seeded area-weighted surface sampling", () => {
  it("interpolates and snapshots directional morph deltas in the native sampler", () => {
    const normals = [1, 0, 0, 0, 2, 0, 0, 0, 3];
    const tangents = [4, 0, 0, 0, 5, 0, 0, 0, 6];
    const source = {
      kind: "aura-custom-geometry" as const,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      morphTargets: [{ name: "bend", positions: Array(9).fill(0), normals, tangents }]
    };
    const sampler = createMeshSurfaceSampler(source, { seed: 31 });
    const sample = sampler.sample();
    const [a, b, c] = sample.barycentric;
    expect(sample.morphTargets![0]!.normal).toEqual([a, 2 * b, 3 * c]);
    expect(sample.morphTargets![0]!.tangent).toEqual([4 * a, 5 * b, 6 * c]);
    normals.fill(0); tangents.fill(0);
    sampler.reset();
    expect(sampler.sample()).toEqual(sample);
    expect(() => createMeshSurfaceSampler({
      ...source, morphTargets: [{ positions: Array(9).fill(0), normals: [1, 2, 3] }]
    })).toThrow(/morph normals/i);
  });

  it("reproduces samples, interpolates all attributes and snapshots source data", () => {
    const input = square();
    const sampler = createMeshSurfaceSampler(input, { seed: 42 });
    const first = sampler.sampleMany(5);
    (input.positions as Float32Array)[0] = 999;
    sampler.reset();
    expect(sampler.sampleMany(5)).toEqual(first);
    const sample = first[0]!;
    expect(sample.normal).toEqual([0, 0, 1]);
    expect(sample.uv![0]).toBeCloseTo(sample.position[0]);
    expect(sample.uv![1]).toBeCloseTo(sample.position[1]);
    expect(sample.uv1![0]).toBeCloseTo(0.1 + sample.position[0] * 0.8);
    expect(sample.barycentric.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(sample.attributes.heat).toHaveLength(1);
    expect(sample.morphTargets![0]!.position[2]).toBeCloseTo(1);
  });

  it("selects triangles in proportion to area and samples a linear density within faces", () => {
    const uneven: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 12, 0, 0, 10, 2, 0], indices: [0, 1, 2, 3, 4, 5] };
    const samples = createMeshSurfaceSampler(uneven, { seed: 104 }).sampleMany(5000);
    const large = samples.filter((sample) => sample.faceIndex === 1).length / samples.length;
    expect(large).toBeGreaterThan(0.77);
    expect(large).toBeLessThan(0.83);
    const weighted: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], attributes: { density: { itemSize: 1, data: [0, 0, 1] } } };
    const weightedSamples = createMeshSurfaceSampler(weighted, { seed: 12, weightAttribute: "density" }).sampleMany(5000);
    const meanY = weightedSamples.reduce((sum, sample) => sum + sample.position[1], 0) / weightedSamples.length;
    expect(meanY).toBeGreaterThan(0.48);
    expect(meanY).toBeLessThan(0.52);
  });

  it("applies group and draw limits and rejects invalid or zero-area domains", () => {
    const input = { ...square(), groups: [{ start: 0, count: 3 }, { start: 3, count: 3 }], drawRange: { start: 3, count: 3 } };
    expect(createMeshSurfaceSampler(input, { seed: 1 }).sampleMany(50).every((sample) => sample.faceIndex === 1)).toBe(true);
    expect(createMeshSurfaceSampler(input, { seed: 1, group: 0, useDrawRange: false }).sample().faceIndex).toBe(0);
    expect(() => createMeshSurfaceSampler(input, { group: 0 })).toThrow(/no non-degenerate/);
    expect(() => createMeshSurfaceSampler({ ...input, positions: new Float32Array(12) })).toThrow(/no non-degenerate/);
    expect(() => createMeshSurfaceSampler(input, { weightAttribute: "missing" })).toThrow(/not found/);
    expect(createMeshSurfaceSampler({ ...input, drawRange: { start: 0, count: Infinity } }, { seed: 1 }).sampleMany(10).length).toBe(10);
    const small: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions: [0, 0, 0, 1e-8, 0, 0, 0, 1e-8, 0], indices: [0, 1, 2] };
    expect(createMeshSurfaceSampler(small).sample().normal).toEqual([0, 0, 1]);
  });
});

describe("native geometry utilities", () => {
  it("interleaves named arrays in a deterministic layout, then copies them back", () => {
    const packed = interleaveAuraAttributes({ a: { itemSize: 2, data: [1, 2, 3, 4] }, b: { itemSize: 1, data: [7, 8] } });
    expect(packed).toMatchObject({ vertexCount: 2, stride: 3, data: [1, 2, 7, 3, 4, 8] });
    const unpacked = deinterleaveAuraAttributes(packed);
    expect(unpacked.a!.data).toEqual([1, 2, 3, 4]);
    expect(unpacked.b!.data).toEqual([7, 8]);
    expect(() => interleaveAuraAttributes({ a: { itemSize: 2, data: [1, 2] }, b: { itemSize: 1, data: [1, 2] } })).toThrow(/equal vertex counts/);
    const normalized = deinterleaveAuraAttributes(interleaveAuraAttributes({ weight: { itemSize: 1, data: new Uint8Array([0, 255]), normalized: true } }));
    expect(normalized.weight!.data).toBeInstanceOf(Uint8Array);
    expect(normalized.weight!.normalized).toBe(true);
  });

  it("validates normalization metadata and retains an explicitly requested empty layout count", () => {
    expect(interleaveAuraAttributes({}, 3)).toMatchObject({ vertexCount: 3, stride: 0, data: [] });
    expect(() => interleaveAuraAttributes({ weight: { itemSize: 1, data: [1], normalized: "no" as never } })).toThrow(/normalized.*boolean/i);
    expect(() => deinterleaveAuraAttributes({
      data: [0], vertexCount: 1, stride: 1,
      attributes: { weight: { itemSize: 1, offset: 0, storage: "uint8", normalized: "yes" as never } }
    })).toThrow(/normalized.*boolean/i);
  });

  it("remaps duplicate vertices and welds only when every attribute agrees", () => {
    const source = square();
    const result = remapAuraGeometryVertices(source, [0, 1, 2, 3, 0], [4, 1, 2, 0, 2, 3]);
    expect(Array.from(result.indices)).toEqual([4, 1, 2, 0, 2, 3]);
    expect(result.positions).toHaveLength(15);
    expect(result.uv1s).toHaveLength(10);
    expect(result.morphTargets![0]!.positions).toHaveLength(15);
    expect(result.groups).toEqual(source.groups);
    expect(result.positions).not.toBe(source.positions);
    const weld = weldAuraGeometry(result);
    expect(weld.newToOld).toHaveLength(4);
    expect(Array.from(weld.geometry.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    const different = { ...result, attributes: { heat: { itemSize: 1 as const, data: [0, 1, 2, 3, 99] } } };
    expect(weldAuraGeometry(different).newToOld).toHaveLength(5);
  });

  it("preserves conservative authored bounds during remapping and welding", () => {
    const source = { ...square(), bounds: { min: [-2, -3, -4] as const, max: [4, 5, 6] as const } };
    const remapped = remapAuraGeometryVertices(source, [0, 1, 2, 3, 0], [4, 1, 2, 0, 2, 3]);
    expect(remapped.bounds).toEqual(source.bounds);
    const welded = weldAuraGeometry(remapped);
    expect(welded.geometry.bounds).toEqual(source.bounds);
    expect(welded.geometry.groups).toEqual(source.groups);
    expect(welded.geometry.drawRange).toEqual(source.drawRange);
  });

  it("rejects invalid metadata rather than copying it through a remap or group merge", () => {
    const invalidGroup = { ...square(), groups: [{ start: 0, count: 9, materialIndex: 3 }] };
    expect(() => remapAuraGeometryVertices(invalidGroup, [0, 1, 2, 3])).toThrow(/group/i);
    expect(() => weldAuraGeometry(invalidGroup)).toThrow(/group/i);
    expect(() => mergeAuraGeometryGroups(invalidGroup)).toThrow(/group/i);
    const invalidRange = { ...square(), drawRange: { start: -1, count: 3 } };
    expect(() => remapAuraGeometryVertices(invalidRange, [0, 1, 2, 3])).toThrow(/drawRange/i);
  });

  it("merges adjacent material groups and converts strip and fan winding", () => {
    const groups = mergeAuraGeometryGroups({ ...square(), groups: [{ start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 2 }] });
    expect(groups.groups).toEqual([{ start: 0, count: 6, materialIndex: 2 }]);
    const strip = { ...square(), indices: [0, 1, 2, 3], groups: undefined, drawRange: undefined };
    expect(Array.from(convertAuraTriangleTopology(strip, "triangle-strip").indices)).toEqual([0, 1, 2, 2, 1, 3]);
    expect(Array.from(convertAuraTriangleTopology(strip, "triangle-fan").indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(() => convertAuraTriangleTopology({ ...strip, groups: [{ start: 0, count: 4 }] }, "triangle-strip")).toThrow(/segmentation/);
    const degenerate = { ...strip, indices: [0, 0, 0, 0] };
    expect(() => convertAuraTriangleTopology(degenerate, "triangle-strip")).toThrow(/non-degenerate|no triangles/i);
    expect(() => convertAuraTriangleTopology(degenerate, "triangle-fan")).toThrow(/non-degenerate|no triangles/i);
  });

  it("evaluates morph deltas and generates crease normals without losing indexed metadata", () => {
    const source = { ...square(), morphTargets: [{ name: "up", positions: new Float32Array([0, 0, 2, 0, 0, 2, 0, 0, 2, 0, 0, 2]) }] };
    const positions = evaluateAuraMorphPositions(source, [0.5]);
    expect(Array.from(positions)).toEqual([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
    const creased = computeAuraCreasedNormals(source, Math.PI / 4);
    expect(creased.positions).toHaveLength(18);
    expect(creased.uv1s).toHaveLength(12);
    expect(creased.morphTargets![0]!.positions).toHaveLength(18);
    expect(creased.groups).toEqual(source.groups);
    expect(Array.from(creased.normals as Float32Array)).toEqual(Array.from({ length: 18 }, (_, i) => i % 3 === 2 ? 1 : 0));
  });

  it("does not return non-finite float32 morph evaluations", () => {
    const source = { ...square(), morphTargets: [{ positions: new Float32Array(12).fill(1) }] };
    expect(() => evaluateAuraMorphPositions(source, [Number.MAX_VALUE])).toThrow(/finite.*float32/i);
  });
});

describe("native parametric and lofted surfaces", () => {
  it("creates a correctly oriented indexed parametric grid", () => {
    const grid = parametricGeometry({ surface: (u, v) => [u, v, 0], uSegments: 2, vSegments: 3 });
    expect(grid.positions).toHaveLength(36);
    expect(grid.indices).toHaveLength(36);
    for (let i = 0; i < grid.normals!.length; i += 3) expect(grid.normals!.slice(i, i + 3)).toEqual([0, 0, 1]);
    expect(() => parametricGeometry({ surface: (u, v) => [u, v, 0], uSegments: 0 })).toThrow();
    expect(() => parametricGeometry({ surface: () => [NaN, 0, 0] })).toThrow(/non-finite/);
  });

  it("duplicates periodic positions with distinct UVs and consistent seam normals", () => {
    const cylinder = parametricGeometry({ surface: (u, v) => [Math.cos(u * Math.PI * 2), Math.sin(u * Math.PI * 2), v], uSegments: 8, vSegments: 2, closedU: true });
    const last = 8 * 3;
    for (let j = 0; j < 3; j += 1) {
      expect(cylinder.positions.slice(j * 3, j * 3 + 3)).toEqual(cylinder.positions.slice((last + j) * 3, (last + j) * 3 + 3));
      expect(cylinder.normals!.slice(j * 3, j * 3 + 3)).toEqual(cylinder.normals!.slice((last + j) * 3, (last + j) * 3 + 3));
      expect(cylinder.uvs![j * 2]).toBe(0);
      expect(cylinder.uvs![(last + j) * 2]).toBe(1);
    }
    expect(() => parametricGeometry({ surface: (u, v) => [u, v, 0], closedU: true })).toThrow(/boundary/);
  });

  it("handles periodic sphere poles and small but valid surfaces without degenerate faces", () => {
    const sphere = parametricGeometry({ surface: (u, v) => [Math.sin(Math.PI * v) * Math.cos(2 * Math.PI * u), Math.sin(Math.PI * v) * Math.sin(2 * Math.PI * u), Math.cos(Math.PI * v)], uSegments: 8, vSegments: 4, closedU: true });
    for (let i = 0; i < sphere.normals!.length; i += 3) expect(Math.hypot(...sphere.normals!.slice(i, i + 3))).toBeCloseTo(1);
    for (let i = 0; i < sphere.indices!.length; i += 3) {
      const points = sphere.indices!.slice(i, i + 3).map((v) => sphere.positions.slice(v * 3, v * 3 + 3));
      const a = points[0]!; const b = points[1]!; const c = points[2]!;
      const ab = b.map((value, axis) => value - a[axis]!); const ac = c.map((value, axis) => value - a[axis]!);
      expect(Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!)).toBeGreaterThan(0);
    }
    const small = parametricGeometry({ surface: (u, v) => [u * 1e-8, v * 1e-8, 0], uSegments: 1, vSegments: 1 });
    expect(small.indices).toHaveLength(6);
    expect(() => parametricGeometry({ surface: (u, v) => [u * 1e-8, v * 1e-8, 0], closedU: true })).toThrow(/boundary/);
  });

  it("lofts a closed profile with independent cap faces and rejects degenerate inputs", () => {
    const profile = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    const loft = loftGeometry({ profile, path: [[0, 0, 0], [0, 0, 2]], capStart: true, capEnd: true });
    expect(loft.groups).toHaveLength(3);
    expect(loft.indices!.length / 3).toBe(12);
    expect(loft.positions.length).toBe(loft.normals!.length);
    expect(loft.uvs!.length / 2).toBe(loft.positions.length / 3);
    expect(loft.normals!.every(Number.isFinite)).toBe(true);
    expect(() => loftGeometry({ profile, path: [[0, 0, 0], [0, 0, 0]] })).toThrow(/coincident/);
    expect(() => loftGeometry({ profile: [[0, 0], [1, 0], [2, 0]], path: [[0, 0, 0], [0, 0, 1]] })).toThrow();
    const tapered = loftGeometry({ sections: [[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 2], [2, 0, 2], [0, 2, 2]]] });
    expect(tapered.indices!.length).toBeGreaterThan(0);
    const concentric = loftGeometry({ sections: [[[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], [[-2, -2, 0], [2, -2, 0], [2, 2, 0], [-2, 2, 0]]] });
    expect(concentric.indices!.length / 3).toBe(8);
    const concave = loftGeometry({ profile: [[-1, -1], [1, -1], [0, 0], [1, 1], [-1, 1]], path: [[0, 0, 0], [0, 0, 1]], capStart: true, capEnd: true });
    expect(concave.groups![1]!.count).toBe(9);
    expect(concave.groups![2]!.count).toBe(9);
  });

  it("tessellates independently authored teapot patches and permits component selection", () => {
    const full = teapotGeometry({ segments: 2 });
    expect(full.positions).toHaveLength(324 * 3);
    expect(full.indices!.length / 3).toBe(272);
    expect(full.normals!.length).toBe(full.positions.length);
    expect(full.uvs!.length / 2).toBe(full.positions.length / 3);
    const handle = teapotGeometry({ segments: 2, body: false, lid: false, spout: false });
    expect(handle.groups!.every((group) => group.materialIndex === 3)).toBe(true);
    expect(handle.positions.length).toBeLessThan(full.positions.length);
    expect(() => teapotGeometry({ segments: 0 })).toThrow();
    expect(() => teapotGeometry({ size: 0 })).toThrow();
  });
});
