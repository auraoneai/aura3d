import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat, type VertexAttributeDescriptor } from "../../../packages/rendering/src/VertexFormat";
import {
  consolidateStaticMeshes, createStaticMeshConsolidationCache, deindexGeometryToNonIndexed
} from "../../../packages/rendering/src/MeshConsolidation";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scaledAndTranslated = [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 5, 0, 7, 8, 9, 1];

function multiStreamGeometry(): Geometry {
  const format = new VertexFormat([
    { semantic: "normal", components: 3, offset: 0 },
    { semantic: "tangent", components: 4, offset: 12 },
    { semantic: "uv", components: 2, offset: 28, type: "uint8", normalized: true },
    { semantic: "position", components: 3, offset: 0, bufferSlot: 2 }
  ], 32, [{ slot: 2, stride: 16 }]);
  const directions = new VertexBuffer(format, 3);
  const positions = new VertexBuffer(format, 3, 2);
  for (let i = 0; i < 3; i += 1) {
    directions.setAttribute(i, "normal", [1, 1, 0]);
    directions.setAttribute(i, "tangent", [1, 2, 3, -1]);
    directions.setAttribute(i, "uv", [10 + i, 250 - i]);
    directions.writeBytes(i * 32 + 30, Uint8Array.of(170 + i, 180 + i));
    positions.setAttribute(i, "position", [i + 1, 2, 3]);
    positions.writeBytes(i * 16 + 12, Uint8Array.of(20 + i, 30 + i, 40 + i, 50 + i));
  }
  return new Geometry(directions, new IndexBuffer([2, 0, 1], 3), "triangles", undefined, [positions]);
}

function basicGeometry(color: Partial<VertexAttributeDescriptor> = {}): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "color", components: 4, offset: 12, type: "uint8", ...color }
  ], 16);
  const vertices = new VertexBuffer(format, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

describe("de-indexing vertex streams", () => {
  it("copies full typed vertex records and instance streams, and remaps morphs without sharing ownership", () => {
    const format = new VertexFormat([
      { semantic: "uv", components: 2, offset: 0, type: "uint16", normalized: true },
      { semantic: "position", components: 3, offset: 0, bufferSlot: 2 },
      { semantic: "color", components: 4, offset: 0, type: "uint8", normalized: true, bufferSlot: 3 }
    ], 6, [{ slot: 2, stride: 16 }, { slot: 3, stride: 4, stepMode: "instance", divisor: 2 }]);
    const uv = new VertexBuffer(format, 3);
    const positions = new VertexBuffer(format, 3, 2);
    const colors = new VertexBuffer(format, 2, 3);
    for (let i = 0; i < 3; i += 1) {
      uv.setAttribute(i, "uv", [100 + i, 1000 + i]);
      uv.writeBytes(i * 6 + 4, Uint8Array.of(70 + i, 80 + i));
      positions.setAttribute(i, "position", [i, i + 1, i + 2]);
      positions.writeBytes(i * 16 + 12, Uint8Array.of(i, 7, 8, 9));
    }
    colors.writeBytes(0, Uint8Array.of(255, 128, 0, 255, 1, 2, 3, 4));
    const source = new Geometry(uv, new IndexBuffer([2, 0, 1, 2, 1, 0], 3), "triangles", undefined, [positions, colors]);
    source.groups = [{ start: 0, count: 3, materialIndex: 7 }, { start: 3, count: 3, materialIndex: 2 }];
    source.drawRange = { start: 1, count: 4 };
    source.morphTargets = [{ name: "lift", positions: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]) }];

    const result = deindexGeometryToNonIndexed(source);
    expect(result.indexBuffer).toBeNull();
    expect(result.vertexBuffer.vertexCount).toBe(6);
    for (const [target, original] of [2, 0, 1, 2, 1, 0].entries()) {
      expect(result.getVertexBuffer(0).readBytes(target * 6, 6)).toEqual(uv.readBytes(original * 6, 6));
      expect(result.getVertexBuffer(2).readBytes(target * 16, 16)).toEqual(positions.readBytes(original * 16, 16));
    }
    expect(result.getVertexBuffer(3).vertexCount).toBe(2);
    expect(result.getVertexBuffer(3).readBytes()).toEqual(colors.readBytes());
    expect(result.getVertexBuffer(0).getDecodedAttribute(0, "uv")[0]).toBeCloseTo(102 / 65535);
    expect(result.groups).toEqual(source.groups);
    expect(result.groups).not.toBe(source.groups);
    expect(result.drawRange).toEqual(source.drawRange);
    expect(result.morphTargets?.[0]?.positions).toEqual(new Float32Array([6, 7, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 3, 4, 5, 0, 1, 2]));
    uv.writeBytes(0, Uint8Array.of(0));
    colors.writeBytes(0, Uint8Array.of(0));
    expect(result.getVertexBuffer(0).readBytes(6, 1)[0]).toBe(100);
    expect(result.getVertexBuffer(3).readBytes(0, 1)[0]).toBe(255);
    result.dispose();
    expect(() => result.getVertexBuffer(2)).toThrow(/disposed/);
    expect(positions.getAttribute(1, "position")).toEqual([1, 2, 3]);
    source.dispose();
  });

  it("rejects malformed indices and morphs before producing a geometry", () => {
    const source = multiStreamGeometry();
    source.indexBuffer!.data[1] = 8;
    expect(() => deindexGeometryToNonIndexed(source)).toThrow(/outside vertex count/);
    source.indexBuffer!.data[1] = 0;
    source.morphTargets = [{ positions: [1, 2, 3] }];
    expect(() => deindexGeometryToNonIndexed(source)).toThrow(/morph target.*position count/);
    expect(source.getVertexBuffer(2).getAttribute(0, "position")).toEqual([1, 2, 3]);
    source.dispose();
  });
});

describe("static consolidation with typed streams", () => {
  it("bakes positions and inverse-transpose normals in their actual slots and copies all other bytes", () => {
    const a = multiStreamGeometry();
    const b = multiStreamGeometry();
    const material = new PBRMaterial();
    const result = consolidateStaticMeshes([
      { geometry: a, material, modelMatrix: identity },
      { geometry: b, material, modelMatrix: scaledAndTranslated }
    ]);
    expect(result.mergedMeshes).toBe(1);
    const merged = result.renderItems[0]!.geometry;
    expect(Array.from(merged.indexBuffer!.data)).toEqual([2, 0, 1, 5, 3, 4]);
    expect(merged.getAttributeBuffer("position").bufferSlot).toBe(2);
    expect(merged.getVertexBuffer(2).getAttribute(3, "position")).toEqual([9, 16, 24]);
    expect(merged.vertexBuffer.getAttribute(3, "normal")).toEqual([0.5, 0.25, 0]);
    const tangent = merged.vertexBuffer.getAttribute(3, "tangent");
    expect(tangent.slice(0, 2)).toEqual([0.5, 0.5]);
    expect(tangent[2]).toBeCloseTo(0.6);
    expect(tangent[3]).toBe(-1);
    expect(merged.vertexBuffer.getAttribute(3, "uv")).toEqual([10, 250]);
    expect(merged.vertexBuffer.getDecodedAttribute(3, "uv")[0]).toBeCloseTo(10 / 255);
    expect(merged.vertexBuffer.readBytes(3 * 32 + 30, 2)).toEqual(Uint8Array.of(170, 180));
    expect(merged.getVertexBuffer(2).readBytes(3 * 16 + 12, 4)).toEqual(Uint8Array.of(20, 30, 40, 50));
    merged.dispose();
    expect(b.getVertexBuffer(2).getAttribute(0, "position")).toEqual([1, 2, 3]);
    a.dispose(); b.dispose(); material.dispose();
  });

  it("does not merge byte-compatible layouts with different shader-visible attribute contracts", () => {
    const material = new PBRMaterial();
    for (const variant of [
      { type: "int8" as const }, { normalized: true }, { integer: true },
      { shaderLocation: 12 }, { shaderName: "a_otherColor" }
    ]) {
      const a = basicGeometry();
      const b = basicGeometry(variant);
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }]);
      expect(result.mergedMeshes).toBe(0);
      expect(result.renderItems.map((item) => item.geometry)).toEqual([a, b]);
      a.dispose(); b.dispose();
    }
    material.dispose();
  });

  it("uses the inverse transpose for a shear instead of the position transform", () => {
    const a = multiStreamGeometry(); const b = multiStreamGeometry();
    const material = new PBRMaterial();
    const shear = [2, 0, 0, 0, 1, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: shear }]);
    const normal = result.renderItems[0]!.geometry.vertexBuffer.getAttribute(3, "normal");
    expect(normal[0]).toBeCloseTo(0.5);
    expect(normal[1]).toBeCloseTo(1 / 6);
    expect(normal[2]).toBe(0);
    result.renderItems[0]!.geometry.dispose();
    a.dispose(); b.dispose(); material.dispose();
  });

  it("does not bake attributes whose storage or shader bindings alias another attribute", () => {
    const formats = [
      new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "normal", components: 3, offset: 0 }
      ]),
      new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "normal", components: 3, offset: 12, shaderLocation: 0 }
      ])
    ];
    const material = new PBRMaterial();
    for (const format of formats) {
      const create = () => new Geometry(new VertexBuffer(format, 3), new IndexBuffer([0, 1, 2], 3));
      const a = create(); const b = create();
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }]);
      expect(result.renderItems.map((item) => item.geometry)).toEqual([a, b]);
      a.dispose(); b.dispose();
    }
    material.dispose();
  });

  it("leaves metadata, quantized geometric inputs, instancing, reflections and projective transforms on separate draws", () => {
    const material = new PBRMaterial();
    const fixtures: Geometry[] = [];
    const cases = [
      (geometry: Geometry) => { geometry.groups = [{ start: 0, count: 3 }]; },
      (geometry: Geometry) => { geometry.drawRange = { start: 0, count: 3 }; },
      (geometry: Geometry) => { geometry.morphTargets = [{ positions: new Float32Array(9) }]; }
    ];
    for (const setup of cases) {
      const a = basicGeometry(); const b = basicGeometry(); fixtures.push(a, b);
      setup(a); setup(b);
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }]);
      expect(result.mergedMeshes).toBe(0);
      expect(result.renderItems.map((item) => item.geometry)).toEqual([a, b]);
    }
    for (const matrix of [
      [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      [1, 0, 0, 0.5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    ]) {
      const a = basicGeometry(); const b = basicGeometry(); fixtures.push(a, b);
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: matrix }, { geometry: b, material, modelMatrix: matrix }]);
      expect(result.passthroughItems).toBe(2);
    }
    const packed = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "int8", normalized: true }]);
    const instanceFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, type: "uint8", bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 4, stepMode: "instance" }]);
    const quantized = () => new Geometry(new VertexBuffer(packed, 3), new IndexBuffer([0, 1, 2], 3));
    const instanced = () => new Geometry(new VertexBuffer(instanceFormat, 3), new IndexBuffer([0, 1, 2], 3), "triangles", undefined, [new VertexBuffer(instanceFormat, 1, 1)]);
    for (const create of [quantized, instanced]) {
      const a = create(); const b = create(); fixtures.push(a, b);
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }]);
      expect(result.passthroughItems).toBe(2);
    }
    fixtures.forEach((geometry) => geometry.dispose());
    material.dispose();
  });

  it("keeps blended and transmissive draws separate for per-object ordering", () => {
    const a = basicGeometry(); const b = basicGeometry();
    const blended = new Material({ shaderKey: "blended", renderState: { blendMode: "alpha" } });
    const glass = new PBRMaterial();
    glass.setParameter("u_transmissionFactor", 0.8);
    const instancedGlass = new MaterialInstance(new PBRMaterial());
    instancedGlass.setOverride("u_transmissionFactor", 0.8);
    const custom = new Material({ shaderKey: "custom" });
    const graph = new Material({ shaderKey: "aura3d/pbr-direct", shaderVariant: "graph:local-position" });
    for (const material of [blended, glass, instancedGlass, custom, graph]) {
      const result = consolidateStaticMeshes([{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }]);
      expect(result.renderItems.map((item) => item.geometry)).toEqual([a, b]);
    }
    a.dispose(); b.dispose(); blended.dispose(); glass.dispose(); instancedGlass.baseMaterial.dispose(); custom.dispose(); graph.dispose();
  });

  it("invalidates on source edits, direct index changes, options and eligibility, releasing only owned outputs", () => {
    const a = multiStreamGeometry(); const b = multiStreamGeometry();
    const material = new PBRMaterial();
    const items = [{ geometry: a, material, modelMatrix: identity }, { geometry: b, material, modelMatrix: identity }];
    const cache = createStaticMeshConsolidationCache();
    const first = cache.consolidate(items);
    const old = first.renderItems[0]!.geometry;
    expect(cache.consolidate(items)).toBe(first);
    a.getVertexBuffer(2).setAttribute(0, "position", [9, 2, 3]);
    const second = cache.consolidate(items);
    expect(second).not.toBe(first);
    expect(() => old.vertexBuffer.readBytes()).toThrow(/disposed/);
    expect(second.renderItems[0]!.geometry.getVertexBuffer(2).getAttribute(0, "position")).toEqual([9, 2, 3]);
    a.indexBuffer!.data[0] = 1;
    const third = cache.consolidate(items);
    expect(Array.from(third.renderItems[0]!.geometry.indexBuffer!.data)).toEqual([1, 0, 1, 5, 3, 4]);
    const split = cache.consolidate(items, { maxVerticesPerMesh: 3 });
    expect(split.mergedMeshes).toBe(0);
    expect(split.renderItems.map((item) => item.geometry)).toEqual([a, b]);
    const mergedAgain = cache.consolidate(items);
    a.drawRange = { start: 0, count: 3 };
    const ranged = cache.consolidate(items);
    expect(ranged.mergedMeshes).toBe(0);
    expect(() => mergedAgain.renderItems[0]!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/);
    cache.dispose();
    expect(a.getVertexBuffer(2).getAttribute(0, "position")).toEqual([9, 2, 3]);
    a.dispose(); b.dispose(); material.dispose();
  });

  it("reports exact input membership in emitted order, including grouped, split and passthrough draws", () => {
    const a = basicGeometry(); const b = basicGeometry(); const c = basicGeometry();
    const ranged = basicGeometry(); const e = basicGeometry();
    const oversized = new Geometry(new VertexBuffer(a.vertexBuffer.format, 7), new IndexBuffer([0, 1, 2], 7));
    ranged.drawRange = { start: 0, count: 3 };
    const material = new PBRMaterial(); const other = new PBRMaterial();
    const items = [
      { geometry: a, material, modelMatrix: identity },
      { geometry: b, material: other, modelMatrix: identity },
      { geometry: c, material, modelMatrix: identity },
      { geometry: ranged, material, modelMatrix: identity },
      { geometry: e, material, modelMatrix: identity },
      { geometry: oversized, material, modelMatrix: identity }
    ];
    const cache = createStaticMeshConsolidationCache();
    const result = cache.consolidate(items, { maxVerticesPerMesh: 6 });
    expect(result.sourceIndices).toEqual([[0, 2], [4], [5], [1], [3]]);
    expect(Object.isFrozen(result.sourceIndices)).toBe(true);
    expect(result.sourceIndices.every(Object.isFrozen)).toBe(true);
    expect(result.sourceIndices.length).toBe(result.renderItems.length);
    expect(result.renderItems[0]!.geometry.indexBuffer!.data).toEqual(new Uint16Array([0, 1, 2, 3, 4, 5]));
    expect(result.renderItems.slice(1).map((item) => item.geometry)).toEqual([e, oversized, b, ranged]);
    expect(cache.consolidate(items, { maxVerticesPerMesh: 6 })).toBe(result);
    expect(cache.consolidate(items, { maxVerticesPerMesh: 3 }).sourceIndices).toEqual([[0], [2], [4], [5], [1], [3]]);
    cache.dispose();
    for (const geometry of [a, b, c, ranged, e, oversized]) {
      expect(() => geometry.vertexBuffer.readBytes()).not.toThrow();
      geometry.dispose();
    }
    material.dispose(); other.dispose();
  });

  it("disposes allocated output buffers when a later source has invalid indices", () => {
    const a = basicGeometry(); const b = basicGeometry();
    const c = basicGeometry(); const d = basicGeometry();
    const material1 = new PBRMaterial(); const material2 = new PBRMaterial();
    d.indexBuffer!.data[0] = 9;
    const dispose = vi.spyOn(VertexBuffer.prototype, "dispose");
    expect(() => consolidateStaticMeshes([
      { geometry: a, material: material1, modelMatrix: identity }, { geometry: b, material: material1, modelMatrix: identity },
      { geometry: c, material: material2, modelMatrix: identity }, { geometry: d, material: material2, modelMatrix: identity }
    ])).toThrow(/outside vertex count/);
    expect(dispose).toHaveBeenCalledTimes(2);
    for (const geometry of [a, b, c, d]) expect(() => geometry.vertexBuffer.readBytes()).not.toThrow();
    dispose.mockRestore();
    a.dispose(); b.dispose(); c.dispose(); d.dispose(); material1.dispose(); material2.dispose();
  });
});
