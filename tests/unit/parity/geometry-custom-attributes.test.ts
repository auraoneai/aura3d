/**
 * R-23 — author-named per-vertex attributes (three `setAttribute(name,
 * BufferAttribute)`): spec validation, vertex layout with stable shader
 * locations, in-place per-frame `updateAttribute`, `toNonIndexed`/`merge`
 * parity with three 0.185.1, and `material.custom` GLSL binding.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
    expect(() => withAttr("size", 3, 11)).toThrowError(/expected 4 vertices x 3 = 12/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 5 as never, data: new Float32Array(20) } } })).toThrowError(/itemSize must be 1, 2, 3 or 4/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 1, data: [1, 2, Number.NaN, 4] } } })).toThrowError(/must be finite/);
    expect(() => defineAuraCustomGeometry({ ...base, attributes: { size: { itemSize: 1, data: new Uint8Array(4) as never } } })).toThrowError(/Float32Array or number\[\]/);
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
    handle.updateAttribute!("noSuchAttr", { array: [1], offset: 0 });
    expect(() => pick()).toThrowError(/not a writable vertex semantic.*custom attribute on this geometry/);
  });

  it("updateAttribute rejects an overrun", () => {
    const { pick, handle } = boot();
    pick();
    handle.updateAttribute!("paintOriginal", { array: [1, 2], offset: 3 });
    expect(() => pick()).toThrowError(/overruns the vertex buffer/);
  });
});

describe("R-23 BufferGeometryUtils parity for custom attributes", () => {
  const threeQuad = (extra: Float32Array) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(QUAD_POSITIONS), 3));
    geo.setAttribute("size", new THREE.BufferAttribute(extra, 1));
    geo.setIndex(QUAD_INDICES);
    return geo;
  };

  it("toNonIndexed expands custom attributes exactly like three", () => {
    const size = Float32Array.from([10, 20, 30, 40]);
    const expected = (threeQuad(size).toNonIndexed().getAttribute("size") as THREE.BufferAttribute).array;
    const actual = auraGeometryToNonIndexed(defineAuraCustomGeometry({
      positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data: size } }
    }));
    expect(Array.from(actual.attributes!.size!.data)).toEqual(Array.from(expected));
    expect(geometry.toNonIndexed(actual)).toBeDefined();
  });

  it("merge concatenates custom attributes exactly like three's mergeGeometries", () => {
    const a = Float32Array.from([1, 2, 3, 4]);
    const b = Float32Array.from([5, 6, 7, 8]);
    const expected = (mergeGeometries([threeQuad(a), threeQuad(b)])!.getAttribute("size") as THREE.BufferAttribute).array;
    const mk = (data: Float32Array) => defineAuraCustomGeometry({ positions: QUAD_POSITIONS, indices: QUAD_INDICES, attributes: { size: { itemSize: 1, data } } });
    const merged = mergeAuraGeometries([mk(a), mk(b)]);
    expect(Array.from(merged.attributes!.size!.data)).toEqual(Array.from(expected));
    expect(normalizeGeometryAttributes(merged).vertexCount).toBe(8);
  });

  it("merge refuses mismatched custom attribute sets (three returns null)", () => {
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
