/** Dynamic geometry and geometry operation contracts, with independent numerical fixtures. */

import { describe, expect, it } from "vitest";

import {
  applyAuraGeometryMatrix4,
  auraGeometryToNonIndexed,
  computeAuraGeometryBounds,
  computeAuraGeometryNormals,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  normalizeGeometryAttributes
} from "../../../packages/engine/src/agent-api/RootGeometry";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import {
  createProductionPrimitiveGeometry,
  createProductionRuntimePrimitiveEntries,
  resolveProductionPrimitiveRuntimeState,
  selectProductionPrimitiveResource
} from "../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

function makeRibbon(vertices: number): { positions: Float32Array; uvs: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const colors = new Float32Array(vertices * 4);
  for (let i = 0; i < vertices; i += 1) {
    const t = i / Math.max(1, vertices - 1);
    positions[i * 3] = t * 8 - 4;
    positions[i * 3 + 1] = Math.sin(t * Math.PI * 4) * 0.5;
    positions[i * 3 + 2] = 0;
    uvs[i * 2] = t;
    uvs[i * 2 + 1] = i % 2;
    colors[i * 4] = t;
    colors[i * 4 + 1] = 1 - t;
    colors[i * 4 + 2] = 0.5;
    colors[i * 4 + 3] = 1;
  }
  // Two-triangle-per-pair strip as an explicit index stream (Uint32 exercise).
  const indices = new Uint32Array((vertices - 2) * 3);
  for (let i = 0; i < vertices - 2; i += 1) {
    indices[i * 3] = i;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return { positions, uvs, colors, indices };
}

describe("SG-05 dynamic geometry spec + normalization", () => {
  it("accepts a 10k-vertex typed-array ribbon with colors/groups/drawRange", () => {
    const { positions, uvs, colors, indices } = makeRibbon(10_000);
    const spec = defineAuraDynamicGeometry({
      positions,
      uvs,
      colors,
      indices,
      groups: [{ start: 0, count: indices.length, materialIndex: 0 }],
      drawRange: { start: 0, count: indices.length }
    });
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(spec.dynamic).toBe(true);
    expect(spec.positions).toBe(positions);
    expect(spec.indices instanceof Uint32Array || spec.indices instanceof Uint16Array).toBe(true);

    const normalized = normalizeGeometryAttributes(spec);
    expect(normalized.vertexCount).toBe(10_000);
    expect(normalized.positions).toBe(positions);
    expect(normalized.uvs).toBe(uvs);
    expect(normalized.colors).toBe(colors);
    // >65535 max index → uint32 index storage.
    expect(normalized.indices).toBeInstanceOf(Uint32Array);
  });

  it("normalizes tuple + plain-array inputs identically", () => {
    const tuples = defineAuraCustomGeometry({
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      indices: [0, 1, 2]
    });
    const flat = defineAuraDynamicGeometry({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2])
    });
    const a = normalizeGeometryAttributes(tuples);
    const b = normalizeGeometryAttributes(flat);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.indices!)).toEqual(Array.from(b.indices!));
  });

  it.each([65_535, 65_536, 65_537])("synthesizes sequential indices without overflow for %i vertices", (count) => {
    const spec = defineAuraDynamicGeometry({ positions: new Float32Array(count * 3), topology: "points" });
    expect(spec.indices).toBeInstanceOf(count <= 65_536 ? Uint16Array : Uint32Array);
    expect(spec.indices.length).toBe(count);
    expect(spec.indices[count - 1]).toBe(count - 1);
  });

  it("rejects incomplete dynamic triangles instead of creating an invalid index stream", () => {
    expect(() => defineAuraDynamicGeometry({ positions: [0, 0, 0, 1, 0, 0] })).toThrow(/complete triangles/);
    expect(() => defineAuraDynamicGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1] })).toThrow(/complete triangles/);
    expect(defineAuraDynamicGeometry({ positions: [0, 0, 0, 1, 0, 0], topology: "points" }).indices).toHaveLength(2);
  });

  it("rejects tuple components that overflow the float32 geometry representation", () => {
    expect(() => normalizeGeometryAttributes({ positions: [[Number.MAX_VALUE, 0, 0]] })).toThrow(/positions.*finite/i);
    expect(() => normalizeGeometryAttributes({ positions: [[0, 0, 0]], uvs: [[Number.MAX_VALUE, 0]] })).toThrow(/uvs.*finite/i);
  });

  it("chooses explicit numeric index width using the largest referenced vertex", () => {
    const positions = new Float32Array(65_537 * 3);
    expect(normalizeGeometryAttributes({ positions, indices: [65_535] }).indices).toBeInstanceOf(Uint16Array);
    const indices = normalizeGeometryAttributes({ positions, indices: [65_536] }).indices!;
    expect(indices).toBeInstanceOf(Uint32Array);
    expect(indices[0]).toBe(65_536);
    expect(() => normalizeGeometryAttributes({ positions: [0, 0, 0], indices: [4_294_967_296] })).toThrowError(/outside the position buffer/);
    expect(() => normalizeGeometryAttributes({ positions: [0, 0, 0], indices: [-1] })).toThrowError(/non-negative integers/);
  });

  it("identifies the invalid custom layout field with a stable error code", () => {
    const geometry = {
      positions: [0, 0, 0],
      attributes: { weight: { itemSize: 1 as const, data: new Float32Array([1]), normalized: true } }
    };
    try {
      normalizeGeometryAttributes(geometry);
      throw new Error("Expected normalized float data to be rejected.");
    } catch (error) {
      expect(error).toMatchObject({ code: "AURA_GEOMETRY_INVALID", field: "attributes.weight.normalized" });
    }
  });
});

describe("geometry helpers preserve geometry and metadata", () => {
  it("computes area-weighted indexed normals and finite bounds", () => {
    // The shared vertex touches a large +Z face (cross length 4) and a small
    // +Y face (cross length 1). Their weighted sum is [0, 1, 4].
    const positions = [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 1, 0, 0];
    const normals = computeAuraGeometryNormals({ positions, indices: [0, 1, 2, 0, 3, 4] });
    expect(normals[0]).toBeCloseTo(0);
    expect(normals[1]).toBeCloseTo(1 / Math.sqrt(17));
    expect(normals[2]).toBeCloseTo(4 / Math.sqrt(17));
    expect(computeAuraGeometryBounds({ positions })).toEqual({ min: [0, 0, 0], max: [2, 2, 1] });
    expect(() => computeAuraGeometryNormals({ positions, indices: [0, 1, 99] })).toThrow(/outside the position buffer/);
  });

  it("requires a nonempty bound and triangle topology for normal generation", () => {
    expect(() => computeAuraGeometryBounds({ positions: [] })).toThrow(/non.?empty/i);
    expect(() => computeAuraGeometryNormals({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], topology: "points" })).toThrow(/triangle topology/i);
  });

  it("uses inverse-transpose normals for shear, nonuniform scale and reflection", () => {
    const source = defineAuraCustomGeometry({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
      normals: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      morphTargets: [{ name: "raise", positions: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
      bounds: { min: [0, 0, 0], max: [1, 1, 0] }
    });
    // A = [[2,1,0], [0,3,0], [0,0,-1]]. A^-T * [1,1,1] is [3,1,-6]/6.
    const matrix = [2, 0, 0, 0, 1, 3, 0, 0, 0, 0, -1, 0, 5, -2, 4, 1];
    const moved = applyAuraGeometryMatrix4(source, matrix);
    const values = normalizeGeometryAttributes(moved);
    expect(Array.from(values.positions)).toEqual([5, -2, 4, 7, -2, 4, 6, 1, 4]);
    expect(values.normals![0]).toBeCloseTo(3 / Math.sqrt(46));
    expect(values.normals![1]).toBeCloseTo(1 / Math.sqrt(46));
    expect(values.normals![2]).toBeCloseTo(-6 / Math.sqrt(46));
    expect(Array.from(moved.morphTargets![0]!.positions)).toEqual([2, 0, 0, 1, 3, 0, 0, 0, -1]);
    expect(moved.bounds).toEqual({ min: [5, -2, 4], max: [8, 1, 4] });
    const singular = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(() => applyAuraGeometryMatrix4(source, singular)).toThrowError(/singular matrix/);
    try { applyAuraGeometryMatrix4(source, singular); } catch (error) {
      expect(error).toMatchObject({ code: "AURA_GEOMETRY_SINGULAR_MATRIX", field: "matrix" });
    }
    expect(() => applyAuraGeometryMatrix4(source, [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toThrowError(/affine matrix/);
    expect(() => applyAuraGeometryMatrix4(source, [1e40, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toThrowError(/non-finite position/);
  });

  it("deindexes all vertex and morph streams without changing groups or draw range", () => {
    const spec = defineAuraCustomGeometry({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], indices: [2, 1, 0, 2, 3, 1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1], uv1s: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      morphTargets: [{ name: "move", positions: [10, 0, 0, 20, 0, 0, 30, 0, 0, 40, 0, 0] }],
      groups: [{ start: 0, count: 3, materialIndex: 2 }, { start: 3, count: 3, materialIndex: 5 }],
      drawRange: { start: 3, count: 3 },
      attributes: { weight: { itemSize: 1, data: new Uint8Array([7, 10, 7, 20, 7, 30, 7, 40]), stride: 2, offset: 1, normalized: true } }
    });
    const result = auraGeometryToNonIndexed(spec);
    expect(result.indices.length).toBe(0);
    expect(Array.from(result.positions as Float32Array)).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0]);
    expect(Array.from(result.morphTargets![0]!.positions)).toEqual([30, 0, 0, 20, 0, 0, 10, 0, 0, 30, 0, 0, 40, 0, 0, 20, 0, 0]);
    expect(result.attributes!.weight!.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.attributes!.weight!.data)).toEqual([30, 20, 10, 30, 40, 20]);
    expect(result.attributes!.weight!.normalized).toBe(true);
    expect(Array.from(normalizeGeometryAttributes(result).uv1s!)).toEqual(Array.from(Float32Array.from([0.5, 0.6, 0.3, 0.4, 0.1, 0.2, 0.5, 0.6, 0.7, 0.8, 0.3, 0.4])));
    expect(result.groups).toEqual(spec.groups);
    expect(result.drawRange).toEqual(spec.drawRange);
  });

  it("merges mixed indexed and non-indexed streams without losing identity", () => {
    const make = (x: number, indices: number[]) => defineAuraCustomGeometry({
      positions: [x, 0, 0, x + 1, 0, 0, x, 1, 0], indices,
      uv1s: [0, 0, 1, 0, 0, 1],
      morphTargets: [{ name: "move", positions: [x, 0, 0, x, 0, 0, x, 0, 0] }],
      attributes: { paint: { itemSize: 1, data: new Uint8Array([1, 2, 3]), normalized: true } },
      groups: [{ start: 0, count: 3, materialIndex: x + 1 }]
    });
    const merged = mergeAuraGeometries([make(0, [2, 0, 1]), make(4, [])]);
    expect(Array.from(merged.indices)).toEqual([2, 0, 1, 3, 4, 5]);
    expect(merged.groups).toEqual([{ start: 0, count: 3, materialIndex: 1 }, { start: 3, count: 3, materialIndex: 5 }]);
    expect(Array.from(merged.morphTargets![0]!.positions)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 4, 0, 0, 4, 0, 0]);
    expect(Array.from(merged.attributes!.paint!.data)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(normalizeGeometryAttributes(merged).uv1s).toHaveLength(12);
  });

  it("preserves a contiguous combined draw range and rejects impossible combinations", () => {
    const base = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] });
    const points = { ...base, topology: "points" as const };
    const partial = { ...points, drawRange: { start: 1, count: 2 } };
    expect(mergeAuraGeometries([partial, points]).drawRange).toEqual({ start: 1, count: 5 });
    expect(() => mergeAuraGeometries([points, partial])).toThrowError(/disjoint draw ranges/);
    expect(() => mergeAuraGeometries([{ ...base, drawRange: { start: 1, count: 2 } }, base])).toThrowError(/incomplete primitive/);
    expect(() => mergeAuraGeometries([base, { ...base, normals: new Float32Array(9) }])).toThrowError(/same normals/);
    expect(() => mergeAuraGeometries([base, { ...base, topology: "points" }])).toThrowError(/matching topology/);
    expect(() => mergeAuraGeometries([base, { ...base, morphTargets: [{ positions: new Float32Array(9) }] }])).toThrowError(/matching morph target/);
    expect(() => auraGeometryToNonIndexed({ ...base, morphTargets: [{ positions: [1, 2, 3] }] })).toThrowError(/one finite float32 vec3 per vertex/);
    expect(() => auraGeometryToNonIndexed({ ...base, indices: [0, 1, 100] })).toThrowError(/outside the position buffer/);
    expect(() => auraGeometryToNonIndexed({ ...base, indices: [0, 1] })).toThrowError(/complete primitives/);
  });

  it("retains non-indexed line topology, conservative bounds and material groups", () => {
    const first = defineAuraCustomGeometry({
      positions: [0, 0, 0, 1, 0, 0], indices: [], topology: "lines",
      bounds: { min: [-2, -1, -1], max: [2, 1, 1] }, groups: [{ start: 0, count: 2, materialIndex: 7 }]
    });
    const second = defineAuraCustomGeometry({ positions: [3, 0, 0, 4, 0, 0], indices: [], topology: "lines" });
    const merged = mergeAuraGeometries([first, second]);
    expect(merged.topology).toBe("lines");
    expect(merged.indices).toHaveLength(0);
    expect(merged.groups).toEqual([{ start: 0, count: 2, materialIndex: 7 }, { start: 2, count: 2 }]);
    expect(merged.bounds).toEqual({ min: [-2, -1, -1], max: [4, 1, 1] });
  });
});

describe("SG-04 edges/wireframe spec helpers", () => {
  const cubeSpec = defineAuraCustomGeometry({
    positions: [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ],
    indices: [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2
    ]
  });

  it("geometry.edges emits the twelve sharp cube edges", () => {
    const spec = geometry.edges(cubeSpec, 1);
    expect(spec.topology).toBe("lines");
    const flat = normalizeGeometryAttributes(spec);
    expect(flat.positions.length).toBe(12 * 2 * 3);
  });

  it("geometry.wireframe emits cube edges and face diagonals", () => {
    const spec = geometry.wireframe(cubeSpec);
    expect(spec.topology).toBe("lines");
    const flat = normalizeGeometryAttributes(spec);
    expect(flat.positions.length).toBe(18 * 2 * 3);
  });
});

describe("SG-03 compiler dispatch — no fail-closed kinds remain", () => {
  const kinds = [
    "cone", "circle", "ring", "torusKnot", "polyhedron", "roundedBox",
    "tube", "lathe", "extrude", "shape"
  ] as const;

  for (const kind of kinds) {
    it(`primitives.${kind} compiles to non-empty geometry`, () => {
      const node: AuraPrimitiveNode = {
        kind: "primitive",
        primitive: kind,
        params:
          kind === "tube"
            ? { path: { getPoint: (t: number) => [t * 2 - 1, Math.sin(t * Math.PI), 0] }, tubularSegments: 8, radius: 0.2 }
            : kind === "lathe"
              ? { points: [[0, 0, 0] as const, [0.4, 0.2, 0] as const, [0.2, 0.8, 0] as const] }
              : kind === "extrude" || kind === "shape"
                ? { shape: [[0, 0], [1, 0], [1, 1], [0, 1]], depth: 0.4 }
                : {},
        size: [1, 1, 1]
      };
      const geo = createProductionPrimitiveGeometry(node);
      expect(geo.vertexBuffer.vertexCount).toBeGreaterThan(0);
      expect(geo.topology).toBe("triangles");
      expect(geo.bounds.min[0]).toBeLessThanOrEqual(geo.bounds.max[0]);
    });
  }
});

describe("L2-04 runtime setGeometry/updateAttribute — no realloc on stable vertex count", () => {
  function dynamicNode(vertices: number) {
    const { positions, uvs, indices } = makeRibbon(vertices);
    return {
      node: primitive("custom", {
        geometry: defineAuraDynamicGeometry({ positions, uvs, indices })
      }).runtime({ id: "dyn" }).toJSON() as AuraPrimitiveNode,
      positions,
      uvs,
      indices
    };
  }

  const snap = (node: AuraPrimitiveNode) =>
    ({ nodes: [node] }) as unknown as import("../../../packages/engine/src/agent-api/nodes/types").AuraSceneSnapshot;

  it("setGeometry with same vertex count keeps the VertexBuffer and dirty-marks it", () => {
    const { node, positions, uvs, indices } = dynamicNode(128);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const state = resolveProductionPrimitiveRuntimeState(entry!, registry);
    const resource = selectProductionPrimitiveResource(entry!, state.node, [0, 0, 10]);
    const buffer = resource.geometry.vertexBuffer;
    expect(buffer.uploadedBuffer).toBeNull();

    const handle = registry.get("dyn")!;
    const moved = Float32Array.from(positions);
    moved[1] += 2;
    handle.setGeometry!({ positions: moved, uvs, indices });

    const nextState = resolveProductionPrimitiveRuntimeState(entry!, registry);
    const next = selectProductionPrimitiveResource(entry!, nextState.node, [0, 0, 10]);
    // No realloc: identical VertexBuffer + Geometry, dirty byte range queued.
    expect(next.geometry.vertexBuffer).toBe(buffer);
    expect(next.geometry).toBe(resource.geometry);
    expect(buffer.getDirtyRange()).not.toBeNull();
    expect(buffer.getAttribute(0, "position")[1]).toBeCloseTo(moved[1]!, 6);
  });

  it("setGeometry with a different vertex count rebuilds the geometry once", () => {
    const { node, positions, uvs, indices } = dynamicNode(64);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const first = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    // `first` and `next` are the SAME resource — capture the buffer before the swap.
    const firstBuffer = first.geometry.vertexBuffer;
    const handle = registry.get("dyn")!;
    const grown = makeRibbon(256);
    handle.setGeometry!({ positions: grown.positions, uvs: grown.uvs, indices: grown.indices });
    const next = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    expect(next.geometry.vertexBuffer).not.toBe(firstBuffer);
    expect(next.geometry.vertexBuffer.vertexCount).toBe(256);
    expect(positions.length / 3).toBe(64);
  });

  it("updateAttribute writes a partial range into the live vertex buffer", () => {
    const { node, positions, uvs, indices } = dynamicNode(32);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const resource = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    const buffer = resource.geometry.vertexBuffer;
    buffer.getDirtyRange();

    const handle = registry.get("dyn")!;
    const patch = Float32Array.from([0, 9, 0, 0, -9, 0]); // two positions at offset 4
    handle.updateAttribute!("position", { array: patch, offset: 4 });

    selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    expect(buffer.getAttribute(4, "position")).toEqual([0, 9, 0]);
    expect(buffer.getAttribute(5, "position")).toEqual([0, -9, 0]);
    // Queued writes drain exactly once — a second resolve applies nothing new.
    expect(positions.length / 3).toBe(32);
    expect(uvs.length / 2).toBe(32);
    expect(indices.length).toBe(30 * 3);
  });
});
