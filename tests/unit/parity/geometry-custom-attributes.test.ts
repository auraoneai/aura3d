/**
 * Author-named per-vertex attributes: validation, integer normalization,
 * interleaved input, stable shader locations, in-place partial updates,
 * geometry operations, and `material.custom` GLSL binding.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_CUSTOM_VERTEX_ATTRIBUTES,
  auraGeometryToNonIndexed,
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
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import {
  CUSTOM_ATTRIBUTE_LOCATION_POOL,
  VertexFormat,
  MockRenderDevice,
  Renderer,
  assignCustomAttributeLocations,
  customAttributeSemantic
} from "../../../packages/rendering/src";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection";

// Quad (2 triangles): the four Strange Orbit paint attributes.
const QUAD_POSITIONS = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
const QUAD_INDICES = [0, 1, 2, 0, 2, 3];
const paintAttributes = () => ({
  paintOriginal: { itemSize: 1 as const, data: Float32Array.from([0, 1, 0.5, 0.25]) },
  pigmentBase: { itemSize: 3 as const, data: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0]) },
  pigmentVein: { itemSize: 3 as const, data: Float32Array.from(Array.from({ length: 12 }, (_, i) => i / 12)) },
  pigmentChalk: { itemSize: 3 as const, data: Float32Array.from(Array.from({ length: 12 }, (_, i) => 1 - i / 12)) }
});

describe("R-23 spec validation", () => {
  const base = { positions: QUAD_POSITIONS, indices: QUAD_INDICES };
  const withAttr = (name: string, itemSize: 1 | 2 | 3 | 4 = 1, length = 4 * itemSize) =>
    defineAuraCustomGeometry({ ...base, attributes: { [name]: { itemSize, data: new Float32Array(length) } } });

  it("accepts number[] and Float32Array data and normalizes to Float32Array", () => {
    const spec = defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 1, data: [1, 2, 3, 4] } } });
    expect(spec.attributes!.size!.data).toBeInstanceOf(Float32Array);
    expect(Array.from(spec.attributes!.size!.data)).toEqual([1, 2, 3, 4]);
  });

  it("rejects non-GLSL identifiers, gl_ names and double underscores", () => {
    expect(() => withAttr("bad-name")).toThrowError(/GLSL identifier/);
    expect(() => withAttr("1abc")).toThrowError(/GLSL identifier/);
    expect(() => withAttr("gl_thing")).toThrowError(/reserved by GLSL/);
    expect(() => withAttr("a__b")).toThrowError(/reserved by GLSL/);
  });

  it("rejects engine prefixes and built-in semantic names", () => {
    expect(() => withAttr("a_extra")).toThrowError(/a_, u_/);
    expect(() => withAttr("u_extra")).toThrowError(/a_, u_/);
    for (const name of ["position", "normal", "uv", "uv1", "color", "tangent", "joints", "weights", "colors", "index", "instanceMatrix"]) {
      expect(() => withAttr(name), name).toThrowError(/built-in vertex semantic/);
    }
  });

  it("rejects length mismatch, bad itemSize, non-finite values and wrong data type", () => {
    expect(() => withAttr("size", 3, 11)).toThrowError(/expected 4 vertices x 3/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 5 as never, data: new Float32Array(20) } } })).toThrowError(/itemSize must be 1, 2, 3 or 4/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 1, data: [1, 2, Number.NaN, 4] } } })).toThrowError(/must be finite/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 1, data: new Float64Array(4) as never } } })).toThrowError(/data/);
  });

  it("rejects values that overflow the packed float32 shader stream", () => {
    const packed = { size: { itemSize: 1 as const, data: [0, 1, Number.MAX_VALUE, 3] } };
    const interleaved = { size: { itemSize: 1 as const, data: [0, 0, 1, 0, Number.MAX_VALUE, 0, 3, 0], stride: 2 } };
    for (const attributes of [packed, interleaved]) {
      expect(() => defineAuraCustomGeometry({ ...base, attributes })).toThrow(/finite.*float32/i);
    }
  });

  it("does not silently discard unknown custom attribute metadata", () => {
    const attributes = { size: { itemSize: 1 as const, data: [0, 1, 2, 3], divisor: 1 } };
    expect(() => defineAuraCustomGeometry({ ...base, attributes })).toThrow(/unsupported.*divisor/i);
  });

  it("caps the attribute count at the location pool size", () => {
    expect(MAX_CUSTOM_VERTEX_ATTRIBUTES).toBe(CUSTOM_ATTRIBUTE_LOCATION_POOL.length);
    const many = Object.fromEntries(Array.from({ length: MAX_CUSTOM_VERTEX_ATTRIBUTES + 1 }, (_, i) => [`attr${i}`, { itemSize: 1 as const, data: new Float32Array(4) }]));
    expect(() => defineAuraCustomGeometry({ ...base, attributes: many })).toThrowError(/at most 11/);
    const ok = Object.fromEntries(Array.from({ length: MAX_CUSTOM_VERTEX_ATTRIBUTES }, (_, i) => [`attr${i}`, { itemSize: 1 as const, data: new Float32Array(4) }]));
    expect(() => defineAuraCustomGeometry({ ...base, attributes: ok })).not.toThrow();
  });

  it("geometry.dynamic carries and validates attributes too", () => {
    const spec = defineAuraDynamicGeometry({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes: paintAttributes() });
    expect(Object.keys(spec.attributes!).sort()).toEqual(["paintOriginal", "pigmentBase", "pigmentChalk", "pigmentVein"]);
    expect(() => defineAuraDynamicGeometry({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data: [1] } } })).toThrowError(/expected 4/);
  });
});

describe("R-23 stable shader locations", () => {
  it("assigns pool slots by ascending name, independent of insertion order", () => {
    const a = assignCustomAttributeLocations(["pigmentVein", "paintOriginal", "size", "pigmentBase"]);
    const b = assignCustomAttributeLocations(["size", "pigmentBase", "pigmentVein", "paintOriginal"]);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect([...a.entries()]).toEqual([
      ["paintOriginal", 3], ["pigmentBase", 5], ["pigmentVein", 6], ["size", 8]
    ]);
  });

  it("never hands out a location the custom-geometry path or the atlas shader owns", () => {
    for (const reserved of [0, 1, 2, 4, 7]) expect(CUSTOM_ATTRIBUTE_LOCATION_POOL).not.toContain(reserved);
    expect(Math.max(...CUSTOM_ATTRIBUTE_LOCATION_POOL)).toBeLessThan(16);
  });

  it("VertexFormat requires an explicit location for custom semantics and rejects collisions", () => {
    expect(() => new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: customAttributeSemantic("foo"), components: 1, offset: 12 }]))
      .toThrowError(/explicit shaderLocation/);
    expect(() => new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: customAttributeSemantic("foo"), components: 1, offset: 12, shaderLocation: 0 }
    ])).toThrowError(/share shader location 0/);
    expect(() => new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: customAttributeSemantic("foo"), components: 1, offset: 12, shaderLocation: 3 },
      { semantic: customAttributeSemantic("bar"), components: 1, offset: 16, shaderLocation: 3 }
    ])).toThrowError(/share shader location 3/);
    expect(() => assignCustomAttributeLocations(Array.from({ length: 12 }, (_, i) => `a${i}`))).toThrowError(/At most 11/);
  });
});

describe("R-23 vertex layout + round trip", () => {
  const customNode = (attributes = paintAttributes()): AuraPrimitiveNode => primitive("custom", {
    geometry: defineAuraCustomGeometry({
      positions: QUAD_POSITIONS,
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: QUAD_INDICES,
      attributes
    })
  }).toJSON() as AuraPrimitiveNode;

  it("lays custom attributes after position/normal/uv with GLSL-name binding and pool locations", () => {
    const geo = createProductionPrimitiveGeometry(customNode());
    const format = geo.vertexBuffer.format;
    const byName = Object.fromEntries(format.attributes.map((a) => [a.shaderName, a]));
    expect(format.attributes.map((a) => a.shaderName)).toEqual([
      "a_position", "a_normal", "a_uv", "paintOriginal", "pigmentBase", "pigmentChalk", "pigmentVein"
    ]);
    expect(byName.paintOriginal).toMatchObject({ components: 1, shaderLocation: 3, offset: 32 });
    expect(byName.pigmentBase).toMatchObject({ components: 3, shaderLocation: 5, offset: 36 });
    expect(byName.pigmentChalk).toMatchObject({ components: 3, shaderLocation: 6, offset: 48 });
    expect(byName.pigmentVein).toMatchObject({ components: 3, shaderLocation: 8, offset: 60 });
    expect(format.stride).toBe(72);
  });

  it("layout is identical regardless of the order attributes are authored in", () => {
    const attrs = paintAttributes();
    const reversed = Object.fromEntries(Object.entries(attrs).reverse()) as typeof attrs;
    const a = createProductionPrimitiveGeometry(customNode(attrs)).vertexBuffer.format;
    const b = createProductionPrimitiveGeometry(customNode(reversed)).vertexBuffer.format;
    expect(b.attributes.map((x) => [x.shaderName, x.shaderLocation, x.offset])).toEqual(a.attributes.map((x) => [x.shaderName, x.shaderLocation, x.offset]));
  });

  it("stores every authored value per vertex (round trip)", () => {
    const attrs = paintAttributes();
    const buffer = createProductionPrimitiveGeometry(customNode(attrs)).vertexBuffer;
    for (const [name, spec] of Object.entries(attrs)) {
      for (let v = 0; v < 4; v += 1) {
        expect(buffer.getAttribute(v, customAttributeSemantic(name)), `${name}[${v}]`)
          .toEqual(Array.from(spec.data.slice(v * spec.itemSize, (v + 1) * spec.itemSize)));
      }
    }
  });

  it("a geometry without custom attributes keeps the pre-R-23 layout", () => {
    const node = primitive("custom", { geometry: defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES }) }).toJSON() as AuraPrimitiveNode;
    const format = createProductionPrimitiveGeometry(node).vertexBuffer.format;
    expect(format.attributes.map((a) => a.shaderName)).toEqual(["a_position", "a_normal"]);
    expect(format.stride).toBe(24);
  });
});

describe("Typed and interleaved custom attributes", () => {
  const makeNode = (attributes: Parameters<typeof defineAuraDynamicGeometry>[0]["attributes"]) => primitive("custom", {
    geometry: defineAuraDynamicGeometry({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes })
  }).runtime({ id: "typed" }).toJSON() as AuraPrimitiveNode;

  it("reads components from a typed-array view with nonzero offset and stride, then uploads normalized values", () => {
    // Each record has unrelated bytes around the two useful components. The
    // view begins inside the parent buffer, exercising both offsets.
    const backing = Uint8Array.from([222, 77, 0, 255, 88, 77, 64, 128, 88, 77, 255, 0, 88, 77, 128, 64, 88, 222]);
    const data = backing.subarray(1, 17);
    const node = makeNode({ signal: { itemSize: 2, data, normalized: true, stride: 4, offset: 1 } });
    const attribute = node.geometry!.attributes!.signal!;
    expect(attribute.data).toBe(data);
    expect(attribute).toMatchObject({ normalized: true, stride: 4, offset: 1 });
    const geo = createProductionPrimitiveGeometry(node);
    const values = [[0, 255], [64, 128], [255, 0], [128, 64]];
    const attr = geo.vertexBuffer.format.getAttribute(customAttributeSemantic("signal"));
    expect(attr).toMatchObject({ type: "uint8", normalized: true, components: 2 });
    values.forEach((expected, vertex) => {
      const actual = geo.vertexBuffer.getAttribute(vertex, customAttributeSemantic("signal"));
      expect(actual).toEqual(expected);
    });
    const device = new MockRenderDevice();
    const uploaded = geo.vertexBuffer.upload(device);
    const uploadedBytes = device.readBuffer(uploaded);
    expect(uploadedBytes[geo.vertexBuffer.format.stride + attr.offset]).toBe(64);
    expect(uploadedBytes[geo.vertexBuffer.format.stride + attr.offset + 1]).toBe(128);
    expect(Array.from(normalizeGeometryAttributes(node.geometry!).custom[0]!.data)).toEqual(values.flat().map((value) => Math.fround(value / 255)));
    geo.dispose();
    device.dispose();
  });

  it("maps signed integer minima to -1 and preserves unnormalized integer values", () => {
    const node = makeNode({
      signed: { itemSize: 1, data: Int8Array.from([-128, -127, 0, 127]), normalized: true },
      raw: { itemSize: 1, data: Uint16Array.from([0, 1, 1024, 65535]) }
    });
    const geo = createProductionPrimitiveGeometry(node);
    expect([0, 1, 2, 3].map((i) => geo.vertexBuffer.getAttribute(i, customAttributeSemantic("signed"))[0])).toEqual([-1, -1, 0, 1]);
    expect([0, 1, 2, 3].map((i) => geo.vertexBuffer.getAttribute(i, customAttributeSemantic("raw"))[0])).toEqual([0, 1, 1024, 65535]);
  });

  it("rejects invalid offsets, strides, short backing stores, and ambiguous normalized float data", () => {
    const attribute = (fields: Record<string, unknown>) => () => makeNode({ signal: { itemSize: 2, data: new Uint8Array(16), ...fields } });
    expect(attribute({ stride: 1 })).toThrow(/stride/);
    expect(attribute({ stride: 4, offset: -1 })).toThrow(/offset/);
    expect(attribute({ stride: 4, offset: 3 })).toThrow(/offset|stride/);
    expect(attribute({ stride: 5, offset: 1 })).toThrow(/length|values|vertices|data/);
    expect(() => makeNode({ signal: { itemSize: 1, data: new Float32Array(4), normalized: true } })).toThrow(/normaliz/i);
  });

  it("updates a vertex range using its authored integer normalization and uploads only the dirty range", () => {
    const node = makeNode({ signal: { itemSize: 2, data: Uint8Array.from([0, 255, 64, 128, 255, 0, 128, 64]), normalized: true } });
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const pick = () => selectProductionPrimitiveResource(entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]);
    const resource = pick();
    const buffer = resource.geometry.vertexBuffer;
    const device = new MockRenderDevice();
    const gpuBuffer = buffer.upload(device);
    expect(buffer.getDirtyRange()).toBeNull();
    registry.get("typed")!.updateAttribute!("signal", { array: Uint8Array.from([255, 0, 128, 255]), offset: 1 });
    expect(pick().geometry.vertexBuffer).toBe(buffer);
    const attr = buffer.format.getAttribute(customAttributeSemantic("signal"));
    expect(attr).toMatchObject({ type: "uint8", normalized: true });
    expect(buffer.getDirtyRange()).toEqual({ start: buffer.format.stride + attr.offset, end: buffer.format.stride * 2 + attr.offset + attr.byteLength });
    expect(buffer.getAttribute(0, attr.semantic)).toEqual([0, 255]);
    expect(buffer.getAttribute(1, attr.semantic)).toEqual([255, 0]);
    expect(buffer.getAttribute(2, attr.semantic)).toEqual([128, 255]);
    expect(buffer.upload(device)).toBe(gpuBuffer);
    const uploadedBytes = device.readBuffer(gpuBuffer);
    expect(uploadedBytes[buffer.format.stride + attr.offset]).toBe(255);
    expect(uploadedBytes[buffer.format.stride * 2 + attr.offset]).toBe(128);
    expect(buffer.getDirtyRange()).toBeNull();
    resource.geometry.dispose();
    device.dispose();
  });

  it("uses a float fallback for GPU-incompatible formats and rebuilds when storage changes", () => {
    const node = makeNode({ signal: { itemSize: 2, data: Uint8Array.from([0, 255, 64, 128, 255, 0, 128, 64]), normalized: true } });
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const pick = () => selectProductionPrimitiveResource(entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]);
    const resource = pick();
    const previous = resource.geometry;
    registry.get("typed")!.setGeometry!({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: {
      signal: { itemSize: 2, data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) }
    } });
    const updated = pick().geometry;
    expect(updated).not.toBe(previous);
    expect(updated.vertexBuffer.format.getAttribute(customAttributeSemantic("signal"))).toMatchObject({ type: "float32", normalized: false });
    expect(updated.vertexBuffer.getAttribute(1, customAttributeSemantic("signal"))).toEqual([3, 4]);
  });
});

describe("R-23 runtime setGeometry / updateAttribute on custom attributes", () => {
  const snap = (node: AuraPrimitiveNode) => ({ nodes: [node] }) as unknown as AuraSceneSnapshot;
  function boot(attributes = paintAttributes()) {
    const node = primitive("custom", {
      geometry: defineAuraDynamicGeometry({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes })
    }).runtime({ id: "paint" }).toJSON() as AuraPrimitiveNode;
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const pick = () => selectProductionPrimitiveResource(entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]);
    return { registry, pick, handle: registry.get("paint")! };
  }

  it("updateAttribute on a custom name writes a partial range in place (no realloc)", () => {
    const { pick, handle } = boot();
    const first = pick();
    const buffer = first.geometry.vertexBuffer;
    handle.updateAttribute!("pigmentVein", { array: Float32Array.from([9, 8, 7, 6, 5, 4]), offset: 1 });
    const next = pick();
    expect(next.geometry).toBe(first.geometry);
    expect(next.geometry.vertexBuffer).toBe(buffer);
    expect(buffer.getDirtyRange()).not.toBeNull();
    expect(buffer.getAttribute(1, customAttributeSemantic("pigmentVein"))).toEqual([9, 8, 7]);
    expect(buffer.getAttribute(2, customAttributeSemantic("pigmentVein"))).toEqual([6, 5, 4]);
    // untouched vertices keep their authored value
    expect(buffer.getAttribute(0, customAttributeSemantic("pigmentVein"))).toEqual([0, 1 / 12, 2 / 12].map((x) => Math.fround(x)));
  });

  it("updateAttribute on a 1-component custom attribute", () => {
    const { pick, handle } = boot();
    const first = pick();
    handle.updateAttribute!("paintOriginal", { array: [0.75], offset: 3 });
    pick();
    expect(first.geometry.vertexBuffer.getAttribute(3, customAttributeSemantic("paintOriginal"))).toEqual([0.75]);
  });

  it("setGeometry with the same custom set rewrites values in place", () => {
    const { pick, handle } = boot();
    const first = pick();
    const buffer = first.geometry.vertexBuffer;
    const next = paintAttributes();
    next.paintOriginal.data.fill(0.5);
    handle.setGeometry!({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes: next });
    const after = pick();
    expect(after.geometry.vertexBuffer).toBe(buffer);
    expect(buffer.getAttribute(2, customAttributeSemantic("paintOriginal"))).toEqual([0.5]);
  });

  it("setGeometry with a different custom set rebuilds the layout once", () => {
    const { pick, handle } = boot();
    const firstGeometry = pick().geometry;
    const attrs = paintAttributes();
    delete (attrs as Record<string, unknown>).pigmentChalk;
    handle.setGeometry!({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, attributes: attrs });
    const after = pick();
    expect(after.geometry).not.toBe(firstGeometry);
    expect(after.geometry.vertexBuffer.format.hasAttribute(customAttributeSemantic("pigmentChalk"))).toBe(false);
    expect(after.geometry.vertexBuffer.format.hasAttribute(customAttributeSemantic("pigmentVein"))).toBe(true);
  });

  it("updateAttribute rejects an unknown name with a message naming custom attributes", () => {
    const { pick, handle } = boot();
    pick();
    expect(() => handle.updateAttribute!("noSuchAttr", { array: [1], offset: 0 })).toThrowError(/noSuchAttr|attribute/i);
  });

  it("updateAttribute rejects an overrun", () => {
    const { pick, handle } = boot();
    pick();
    expect(() => handle.updateAttribute!("paintOriginal", { array: [1, 2], offset: 3 })).toThrowError(/overrun|range/i);
  });
});

describe("Runtime geometry state and bounds", () => {
  const boot = (spec: Parameters<typeof defineAuraDynamicGeometry>[0]) => {
    const node = primitive("custom", { geometry: defineAuraDynamicGeometry(spec) }).runtime({ id: "dynamic" }).toJSON() as AuraPrimitiveNode;
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const pick = () => selectProductionPrimitiveResource(entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]);
    return { handle: registry.get("dynamic")!, pick };
  };

  it("refreshes resource and geometry bounds from all live positions after a partial edit", () => {
    const { handle, pick } = boot({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: [0, 1, 2],
      bounds: { min: [0, 0, 0], max: [1, 1, 0] }
    });
    const first = pick();
    handle.updateAttribute!("position", { array: [8, -3, 2], offset: 1 });
    const updated = pick();
    expect(updated.geometry).toBe(first.geometry);
    expect(updated.bounds).toEqual({ min: [0, -3, 0], max: [8, 1, 2] });
    expect(updated.geometry.bounds).toEqual(updated.bounds);
  });

  it("installs and updates the second UV set through the real vertex layout", () => {
    const uv1s = Float32Array.from([0, 0, 0.25, 0.5, 1, 1, 0.5, 1]);
    const { handle, pick } = boot({ positions: Float32Array.from(QUAD_POSITIONS), indices: QUAD_INDICES, uv1s });
    const first = pick();
    expect(first.geometry.vertexBuffer.getAttribute(1, "uv1")).toEqual([0.25, 0.5]);
    handle.updateAttribute!("uv1", { array: [0.75, 0.125], offset: 1 });
    const updated = pick();
    expect(updated.geometry).toBe(first.geometry);
    expect(updated.geometry.vertexBuffer.getAttribute(1, "uv1")).toEqual([0.75, 0.125]);
  });

  it("replaces an index buffer when its width increases or indexing is removed", () => {
    const positions = new Float32Array(65538 * 3);
    const { handle, pick } = boot({ positions, indices: [0, 1, 2] });
    const resource = pick();
    const firstIndex = resource.geometry.indexBuffer!;
    expect(firstIndex.type).toBe("uint16");
    handle.setGeometry!({ positions, indices: [65536, 1, 2] });
    const widened = pick();
    expect(widened.geometry).toBe(resource.geometry);
    expect(widened.geometry.indexBuffer!.type).toBe("uint32");
    expect(Array.from(widened.geometry.indexBuffer!.data)).toEqual([65536, 1, 2]);
    expect(() => firstIndex.setIndices(0, [1])).toThrow(/disposed/i);
    handle.setGeometry!({ positions, indices: [] });
    expect(pick().geometry.indexBuffer).toBeNull();
  });
});

describe("Geometry operations on custom attributes", () => {
  it("limits wireframe traversal to the authored groups for indexed and non-indexed meshes", () => {
    const grouped = defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, groups: [{ start: 3, count: 3 }] });
    const lines = geometry.wireframe(grouped);
    expect(Array.from(lines.positions as readonly number[])).toEqual([0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
    const expanded = auraGeometryToNonIndexed(grouped);
    expect(Array.from(geometry.wireframe(expanded).positions as readonly number[])).toEqual(Array.from(lines.positions as readonly number[]));
    expect(() => geometry.edges(grouped)).toThrow(/groups|drawRange/);
    expect(() => geometry.wireframe({ ...grouped, topology: "points" })).toThrow(/triangle topology/);
    expect(() => geometry.wireframe({ ...grouped, drawRange: { start: 0, count: 3 } })).toThrow(/drawRange/);
  });

  it("toNonIndexed expands custom attributes in index order", () => {
    const size = Float32Array.from([10, 20, 30, 40]);
    const actual = auraGeometryToNonIndexed(defineAuraCustomGeometry({
      positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data: size } }
    }));
    expect(Array.from(actual.attributes!.size!.data)).toEqual([10, 20, 30, 10, 30, 40]);
    expect(geometry.toNonIndexed(actual)).toBeDefined();
  });

  it("merge concatenates custom attributes and offsets indices", () => {
    const a = Float32Array.from([1, 2, 3, 4]);
    const b = Float32Array.from([5, 6, 7, 8]);
    const mk = (data: Float32Array) => defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data } } });
    const merged = mergeAuraGeometries([mk(a), mk(b)]);
    expect(Array.from(merged.attributes!.size!.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(merged.indices)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(normalizeGeometryAttributes(merged).vertexCount).toBe(8);
  });

  it("merge refuses mismatched custom attribute sets", () => {
    const withSize = defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data: new Float32Array(4) } } });
    const without = defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES });
    expect(() => mergeAuraGeometries([withSize, without])).toThrowError(/same custom vertex attributes/);
  });
});

describe("R-23 material.custom GLSL binding", () => {
  const VERTEX_GLSL1 = `attribute float paintOriginal;
attribute vec3 pigmentBase;
varying float vPaintOriginal;
varying vec3 vPigmentBase;
void main() {
  vPaintOriginal = paintOriginal;
  vPigmentBase = pigmentBase;
  gl_Position = u_modelViewProjection * vec4(position, 1.0);
}`;
  const FRAGMENT = `in float vPaintOriginal;
in vec3 vPigmentBase;
out vec4 outColor;
void main() { outColor = vec4(vPigmentBase * vPaintOriginal, 1.0); }`;

  it("rewrites GLSL1 `attribute` to `in` so the stage compiles under #version 300 es", () => {
    const vertex = VERTEX_GLSL1.replace(/varying/g, "out");
    const material = createCustomShaderMaterial({ glsl: { vertex, fragment: FRAGMENT } });
    const baked = material.sources.glsl.vertex;
    expect(baked).toContain("in float paintOriginal;");
    expect(baked).toContain("in vec3 pigmentBase;");
    expect(baked).not.toMatch(/^\s*attribute\s/m);
  });

  it("reflection exposes the custom names, and the geometry layout binds the same names", () => {
    const vertex = VERTEX_GLSL1.replace(/varying/g, "out");
    const material = createCustomShaderMaterial({ glsl: { vertex, fragment: FRAGMENT } });
    const reflection = reflectShaderSources({ label: "r23", marker: "r23", vertex: material.sources.glsl.vertex, fragment: material.sources.glsl.fragment });
    const geo = createProductionPrimitiveGeometry(primitive("custom", {
      geometry: defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: paintAttributes() })
    }).toJSON() as AuraPrimitiveNode);
    const bound = geo.vertexBuffer.format.attributes.filter((a) => reflection.attributes.has(a.shaderName)).map((a) => a.shaderName);
    expect(bound).toEqual(expect.arrayContaining(["a_position", "paintOriginal", "pigmentBase"]));
    // pigmentVein/pigmentChalk exist on the geometry but the shader does not read them: unbound, not an error.
    expect(reflection.attributes.has("pigmentVein")).toBe(false);
  });

  it("requires the declared custom attributes from the geometry, not engine or built-in names", () => {
    const vertex = `in float paintOriginal;
in vec3 a_color;
in vec3 normal;
void main() { gl_Position = u_modelViewProjection * vec4(position + vec3(paintOriginal), 1.0); }`;
    const material = createCustomShaderMaterial({ glsl: { vertex, fragment: "out vec4 o; void main() { o = vec4(1.0); }" } });
    expect(material.requiredAttributes).toEqual(["a_position", "paintOriginal"]);
  });

  it("a plain geometry lacks the attribute the material requires; the authored one has it", () => {
    const material = createCustomShaderMaterial({ glsl: { vertex: "in float paintOriginal;\nvoid main() { gl_Position = vec4(position + vec3(paintOriginal), 1.0); }", fragment: "out vec4 o; void main() { o = vec4(1.0); }" } });
    const has = (geo: ReturnType<typeof createProductionPrimitiveGeometry>, name: string) =>
      geo.vertexBuffer.format.attributes.some((a) => a.semantic === name || a.shaderName === name);
    const plain = createProductionPrimitiveGeometry(primitive("custom", { geometry: defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES }) }).toJSON() as AuraPrimitiveNode);
    const painted = createProductionPrimitiveGeometry(primitive("custom", { geometry: defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: paintAttributes() }) }).toJSON() as AuraPrimitiveNode);
    expect(material.requiredAttributes.every((name) => has(plain, name))).toBe(false);
    expect(material.requiredAttributes.every((name) => has(painted, name))).toBe(true);
  });
});

describe("R-23 points topology (THREE.Points + ShaderMaterial size attribute)", () => {
  // 7 vertices: deliberately not a multiple of 3, like a particle pool.
  const COUNT = 7;
  const pointSpec = () => defineAuraDynamicGeometry({
    positions: Float32Array.from({ length: COUNT * 3 }, (_, i) => i / 10),
    colors: Float32Array.from({ length: COUNT * 3 }, () => 1),
    topology: "points",
    attributes: { size: { itemSize: 1, data: Float32Array.from({ length: COUNT }, (_, i) => 0.1 + i / 100) } }
  });

  it("geometry.dynamic carries topology: points and rejects unknown topologies", () => {
    expect(pointSpec().topology).toBe("points");
    expect(() => defineAuraDynamicGeometry({ positions: Float32Array.from([0, 0, 0]), topology: "lines" as never })).toThrowError(/must be "triangles" or "points"/);
  });

  it("geometry.define accepts points with a single vertex and no triangle-count rule", () => {
    expect(() => defineAuraCustomGeometry({ positions: [0, 0, 0], indices: [], topology: "points" })).not.toThrow();
    expect(() => defineAuraCustomGeometry({ positions: [0, 0, 0], indices: [] })).toThrowError(/at least three positions/);
  });

  it("compiles to a points Geometry with finite normals even when the count is not a multiple of 3", () => {
    const node = primitive("custom", { geometry: pointSpec() }).toJSON() as AuraPrimitiveNode;
    const geo = createProductionPrimitiveGeometry(node);
    expect(geo.topology).toBe("points");
    expect(geo.vertexBuffer.vertexCount).toBe(COUNT);
    expect(geo.vertexBuffer.getAttribute(COUNT - 1, "normal")).toEqual([0, 1, 0]);
    expect(geo.vertexBuffer.getAttribute(3, customAttributeSemantic("size"))[0]).toBeCloseTo(0.13, 6);
    expect(geo.vertexBuffer.format.getAttribute(customAttributeSemantic("size")).shaderName).toBe("size");
  });

  it("per-frame size updates stay in place (particle pool pattern)", () => {
    const node = primitive("custom", { geometry: pointSpec() }).runtime({ id: "pts" }).toJSON() as AuraPrimitiveNode;
    const registry = createAuraRuntimeNodeRegistry({ nodes: [node] } as unknown as AuraSceneSnapshot);
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const pick = () => selectProductionPrimitiveResource(entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]);
    const first = pick();
    const buffer = first.geometry.vertexBuffer;
    registry.get("pts")!.updateAttribute!("size", { array: Float32Array.from([0, 0, 0.5]), offset: 2 });
    const next = pick();
    expect(next.geometry.vertexBuffer).toBe(buffer);
    expect(buffer.getAttribute(2, customAttributeSemantic("size"))).toEqual([0]);
    expect(buffer.getAttribute(4, customAttributeSemantic("size"))[0]).toBeCloseTo(0.5, 6);
  });

  it("the Strange Orbit particle shader compiles its GLSL1 attribute and requires the geometry to supply it", () => {
    const material = createCustomShaderMaterial({
      glsl: {
        vertex: "attribute float size; varying vec3 vColor; void main(){vColor=vec3(1.0);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*280./(-p.z),1.,65.);}".replace("varying", "out"),
        fragment: "in vec3 vColor; out vec4 o; void main(){ o = vec4(vColor, 1.0); }"
      },
      transparent: true,
      depthWrite: false,
      blending: "additive"
    });
    expect(material.sources.glsl.vertex).toContain("in float size;");
    expect(material.requiredAttributes).toEqual(["a_position", "size"]);
    const reflection = reflectShaderSources({ label: "so", marker: "so", vertex: material.sources.glsl.vertex, fragment: material.sources.glsl.fragment });
    expect(reflection.attributes.has("size")).toBe(true);
    const geo = createProductionPrimitiveGeometry(primitive("custom", { geometry: pointSpec() }).toJSON() as AuraPrimitiveNode);
    expect(geo.vertexBuffer.format.attributes.some((a) => a.shaderName === "size")).toBe(true);
  });
});

describe("R-23 through the real renderer (mock device)", () => {
  const POINT_VERTEX = "in float size;\nvoid main() { gl_Position = u_modelViewProjection * vec4(position, 1.0); gl_PointSize = size; }";
  const POINT_FRAGMENT = "out vec4 o; void main() { o = vec4(1.0); }";
  const pointNode = (withSize: boolean) => primitive("custom", {
    geometry: defineAuraDynamicGeometry({
      positions: Float32Array.from({ length: 7 * 3 }, (_, i) => i / 20),
      topology: "points",
      ...(withSize ? { attributes: { size: { itemSize: 1 as const, data: Float32Array.from({ length: 7 }, () => 4) } } } : {})
    })
  }).toJSON() as AuraPrimitiveNode;

  it("submits a points draw whose vertex layout carries the size attribute", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    try {
      const material = createCustomShaderMaterial({ glsl: { vertex: POINT_VERTEX, fragment: POINT_FRAGMENT } });
      const geo = createProductionPrimitiveGeometry(pointNode(true));
      renderer.render([{ geometry: geo, material, label: "particles" }]);
      const commands = (renderer.device as MockRenderDevice).drawCommands;
      const draw = commands.find((c) => c.label === "particles");
      expect(draw?.topology).toBe("points");
      expect(draw?.vertexFormat?.attributes.map((a) => a.shaderName)).toContain("size");
      expect(draw?.vertexFormat?.attributes.find((a) => a.shaderName === "size")?.shaderLocation).toBe(3);
      expect(draw?.vertexCount).toBe(7);
    } finally {
      renderer.dispose();
    }
  });

  it("rejects the same material on a geometry that lacks the declared attribute, naming it", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    try {
      const material = createCustomShaderMaterial({ glsl: { vertex: POINT_VERTEX, fragment: POINT_FRAGMENT } });
      const geo = createProductionPrimitiveGeometry(pointNode(false));
      expect(() => renderer.render([{ geometry: geo, material, label: "particles-missing" }]))
        .toThrow(/missing attributes required by its material|RENDER_ITEM_GEOMETRY_MATERIAL_CONTRACT/);
    } finally {
      renderer.dispose();
    }
  });
});
