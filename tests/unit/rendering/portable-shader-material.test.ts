import { describe, expect, it, vi } from "vitest";
import {
  ForwardPass,
  Geometry,
  MockRenderDevice,
  MaterialBinding,
  MaterialInstance,
  PortableShaderCompilationError,
  PortableShaderMaterial,
  ShaderLibrary,
  Texture,
  TextureBinding,
  type RecursiveUniformValue,
  type ShaderDataType,
  type UniformDataValue
} from "../../../packages/rendering/src";

const SOURCES = {
  glsl: {
    vertex: `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }`,
    fragment: `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_time;
out vec4 outColor;
void main() { outColor = vec4(u_color * (0.75 + 0.25 * sin(u_time)), 1.0); }`
  },
  wgsl: {
    vertex: `/* @aura3d-bindings */
struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clip.xy, clip.z * 0.5 + clip.w * 0.5, clip.w);
  return output;
}`,
    fragment: `/* @aura3d-bindings */
@fragment fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(aura.u_color * (0.75 + 0.25 * sin(aura.u_time)), 1.0);
}`
  }
} as const;

function material(library = new ShaderLibrary()): PortableShaderMaterial {
  return new PortableShaderMaterial({
    shaderLibrary: library,
    name: "unit-pulse",
    sources: SOURCES,
    uniforms: [
      { name: "u_color", kind: "vec3", value: [0.2, 0.7, 1] },
      { name: "u_time", kind: "float", value: 0 }
    ]
  });
}

const DATA_SOURCES = {
  glsl: {
    vertex: `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }`,
    fragment: `#version 300 es
precision highp float;
struct Item { int id; float weights[2]; };
struct Data { Item items[2]; uint flag; };
uniform Data u_data;
uniform float u_weights[2];
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = vec4(u_data.items[0].weights[0] + u_weights[0]); }`
  },
  wgsl: {
    vertex: `/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> {
      return aura.u_modelViewProjection * vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }`,
    fragment: `/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> {
      return vec4<f32>(aura.u_data.items[0].weights[0] + aura.u_weights[0]);
    }`
  }
} as const;

function dataType(): ShaderDataType {
  return { kind: "struct", fields: [
    { name: "items", type: { kind: "array", length: 2, element: { kind: "struct", fields: [
      { name: "id", type: "i32" },
      { name: "weights", type: { kind: "array", length: 2, element: "f32" } }
    ] } } },
    { name: "flag", type: "u32" }
  ] };
}

function dataValue() {
  return { items: [
    { id: -7, weights: new Float32Array([0.25, 0.5]) },
    { id: 16_777_217, weights: new Float32Array([0.75, 1]) }
  ], flag: 0xfedcba98 };
}

describe("PortableShaderMaterial", () => {
  it("keeps the flat public binder on the forward path for flat portable materials", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const geometry = Geometry.triangle();
    const device = new MockRenderDevice();
    const bind = vi.spyOn(MaterialBinding.prototype, "bind");
    try {
      device.beginFrame(2, 2);
      new ForwardPass({ shaderLibrary: library, items: [{ geometry, material: instance }] }).execute({ device, width: 2, height: 2 });
      device.endFrame();
      expect(bind).toHaveBeenCalledTimes(1);
      expect(device.drawCommands).toHaveLength(1);
    } finally { bind.mockRestore(); geometry.dispose(); instance.dispose(); device.dispose(); }
  });
  it("registers paired sources and schema-checks parameter values", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const compiled = library.compileSource(instance.shaderKey);

    expect(compiled.webgpu?.vertex).toContain("@vertex");
    expect(compiled.portableBindings?.map((binding) => binding.name)).toEqual([
      "u_modelViewProjection",
      "u_modelMatrix",
      "u_normalMatrix",
      "u_color",
      "u_time"
    ]);
    expect(() => instance.setParameter("u_color", [1, 2])).toThrow(/vec3 with 3 scalar values/);
    expect(() => instance.setParameter("u_color", [1, 0.5, 0.25])).not.toThrow();
  });

  it("returns normalized compile diagnostics and compiles through the public device contract", () => {
    const instance = material();
    const result = instance.compile(new MockRenderDevice());
    expect(result.ok).toBe(true);
    expect(result.program?.label).toBe(instance.shaderKey);
    expect(result.diagnostics).toEqual([]);
  });

  it("atomically hot reloads both backends and advances library revision", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.getRevision();
    const changed = {
      ...SOURCES,
      glsl: { ...SOURCES.glsl, fragment: SOURCES.glsl.fragment.replace("0.75", "0.60") },
      wgsl: { ...SOURCES.wgsl, fragment: SOURCES.wgsl.fragment.replace("0.75", "0.60") }
    };

    instance.hotReload(changed);

    expect(library.getRevision()).toBe(before + 1);
    expect(library.compileSource(instance.shaderKey).fragment).toContain("0.60");
    expect(instance.sources.wgsl?.fragment).toContain("0.60");
  });

  it("rejects partial or schema-divergent reloads without replacing the live shader", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.compileSource(instance.shaderKey).fragment;
    const broken = {
      ...SOURCES,
      wgsl: { ...SOURCES.wgsl, fragment: SOURCES.wgsl.fragment.replace("/* @aura3d-bindings */", "") }
    };

    expect(() => instance.hotReload(broken)).toThrow(PortableShaderCompilationError);
    expect(instance.diagnostics).toContain("WGSL fragment stage is missing /* @aura3d-bindings */");
    expect(library.compileSource(instance.shaderKey).fragment).toBe(before);
  });

  it("unregisters its owned shader and becomes unusable on disposal", () => {
    const library = new ShaderLibrary();
    const instance = material(library);
    const before = library.getRevision();

    instance.dispose();

    expect(instance.disposed).toBe(true);
    expect(library.getRevision()).toBe(before + 1);
    expect(() => library.get(instance.shaderKey)).toThrow(/not registered/);
    expect(instance.compile(new MockRenderDevice())).toEqual({ ok: false, diagnostics: ["Material unit-pulse is disposed"] });
  });

  it("snapshots structured schemas and nested values across construction, reads, binding and reload", () => {
    const library = new ShaderLibrary();
    const type = dataType();
    const input = dataValue();
    const texture = new Texture({ width: 1, height: 1 });
    const binding = new TextureBinding({ name: "u_texture", texture });
    const instance = new PortableShaderMaterial({
      shaderLibrary: library, name: "public-structured", sources: DATA_SOURCES,
      uniforms: [
        { name: "u_data", kind: "data", dataType: type, value: input },
        { name: "u_weights", kind: "float", arrayLength: 2, value: [1, 2] },
        { name: "u_texture", kind: "texture2d", value: binding }
      ]
    });
    try {
      input.items[0]!.weights[0] = 9;
      (type as unknown as { fields: { type: { length: number } }[] }).fields[0]!.type.length = 3;
      const snapshot = instance.getParameter<UniformDataValue>("u_data") as typeof input;
      expect(snapshot.items[0]!.weights[0]).toBe(0.25);
      snapshot.items[1]!.weights[1] = 99;
      expect((instance.getParameter<UniformDataValue>("u_data") as typeof input).items[1]!.weights[1]).toBe(1);
      expect(instance.getParameter("u_texture")).toBe(binding);

      const source = library.compileSource(instance.shaderKey);
      expect(source.portableBindings).toContainEqual(expect.objectContaining({
        name: "u_data", kind: "data", dataType: dataType()
      }));
      expect(source.portableBindings).toContainEqual({ name: "u_weights", kind: "float", arrayLength: 2, required: true });
      const result = instance.compile(new MockRenderDevice());
      expect(result.ok).toBe(true);
      const materialBinding = new MaterialBinding().bindRecursive(instance, result.program!);
      const bound = materialBinding.uniforms.get("u_data") as typeof input;
      bound.items[0]!.weights[0] = 11;
      expect((instance.getParameter<UniformDataValue>("u_data") as typeof input).items[0]!.weights[0]).toBe(0.25);

      instance.hotReload(DATA_SOURCES);
      expect(library.compileSource(instance.shaderKey).portableBindings).toContainEqual(expect.objectContaining({
        name: "u_data", kind: "data", dataType: dataType()
      }));
      expect(library.compileSource(instance.shaderKey).portableBindings).toContainEqual(expect.objectContaining({
        name: "u_weights", kind: "float", arrayLength: 2
      }));
    } finally {
      instance.dispose();
      expect(texture.disposed).toBe(false);
      texture.dispose();
    }
  });

  it("isolates structured instance overrides and reports invalid data rather than binding defaults", () => {
    const library = new ShaderLibrary();
    const base = new PortableShaderMaterial({
      shaderLibrary: library, name: "structured-instance", sources: DATA_SOURCES,
      uniforms: [
        { name: "u_data", kind: "data", dataType: dataType(), value: dataValue() },
        { name: "u_weights", kind: "float", arrayLength: 2, value: [1, 2] }
      ]
    });
    try {
      const program = base.compile(new MockRenderDevice()).program!;
      const override = dataValue();
      const instance = new MaterialInstance(base);
      instance.setOverride("u_data", override);
      override.items[0]!.weights[0] = 10;
      const read = instance.getParameter<UniformDataValue>("u_data") as typeof override;
      expect(read.items[0]!.weights[0]).toBe(0.25);
      read.items[0]!.weights[0] = 12;
      expect((instance.getParameter<UniformDataValue>("u_data") as typeof override).items[0]!.weights[0]).toBe(0.25);
      const bound = new MaterialBinding().bindRecursive(instance, program).uniforms.get("u_data") as typeof override;
      bound.items[1]!.weights[0] = 15;
      expect((instance.getParameter<UniformDataValue>("u_data") as typeof override).items[1]!.weights[0]).toBe(0.75);
      expect((base.getParameter<UniformDataValue>("u_data") as typeof override).items[1]!.weights[0]).toBe(0.75);
      expect(instance.getRecursiveParameters().get("u_data")).toEqual(instance.getRecursiveParameter("u_data"));
      expect(() => new MaterialBinding().bind(instance, program)).toThrow(/WebGL.*data.*u_data/);
      expect(() => new MaterialBinding().bindLegacy(instance, program)).toThrow(/WebGL.*data.*u_data/);
      expect(() => new MaterialBinding().bindGenerated(instance, program)).toThrow(/Generated programs do not support portable uniform data/);
      instance.setOverride("u_data", { items: [], flag: 0 } as RecursiveUniformValue);
      expect(() => new MaterialBinding().bindRecursive(instance, program)).toThrow(/expected 2 values/i);
      expect(() => base.setParameter("u_data", { items: [], flag: 0 })).toThrow(/expected 2 values/i);
      expect(() => base.setParameter("u_weights", [1])).toThrow(/2/);
      expect(() => base.setParameter("u_data", undefined as never)).toThrow();
      instance.clearOverride("u_data");
      expect((instance.getParameter<UniformDataValue>("u_data") as typeof override).items[0]!.id).toBe(-7);
    } finally { base.dispose(); }
  });

  it("rejects malformed schemas, missing data and invalid overrides atomically", () => {
    const library = new ShaderLibrary();
    const create = (uniform: unknown) => new PortableShaderMaterial({
      shaderLibrary: library, name: "invalid-layout", sources: DATA_SOURCES, uniforms: [uniform as never]
    });
    for (const invalid of [
      { name: "u_data", kind: "data", value: dataValue() },
      { name: "u_data", kind: "data", dataType: dataType(), arrayLength: 2, value: dataValue() },
      { name: "u_data", kind: "float", dataType: "f32", value: 1 },
      { name: "u_data", kind: "texture2d", arrayLength: 2, value: new TextureBinding({ name: "u_data" }) },
      { name: "u_weights", kind: "float", arrayLength: 0, value: [] },
      { name: "u_weights", kind: "float", arrayLength: 2, value: [1] },
      { name: "u_data", kind: "data", dataType: dataType(), value: undefined }
    ]) expect(() => create(invalid)).toThrow();
    expect(library.getRevision()).toBe(0);

    const base = new PortableShaderMaterial({
      shaderLibrary: library, name: "validated-layout", sources: DATA_SOURCES,
      uniforms: [
        { name: "u_data", kind: "data", dataType: dataType(), value: dataValue() },
        { name: "u_weights", kind: "float", arrayLength: 2, value: [1, 2] }
      ]
    });
    try {
      const expected = base.getParameter<UniformDataValue>("u_data");
      const revision = base.getRevision();
      for (const invalid of [
        { ...dataValue(), flag: -1 },
        { ...dataValue(), flag: 0x1_0000_0000 },
        { ...dataValue(), flag: 1.5 },
        { ...dataValue(), extra: 1 },
        { items: [], flag: 0 },
        { ...dataValue(), items: [{ id: 1, weights: [NaN, 2] }, { id: 2, weights: [3, 4] }] },
        { ...dataValue(), items: [{ id: 1, weights: [1] }, { id: 2, weights: [3, 4] }] }
      ]) {
        expect(() => base.setParameter("u_data", invalid)).toThrow();
        expect(base.getParameter<UniformDataValue>("u_data")).toEqual(expected);
        expect(base.getRevision()).toBe(revision);
      }
      const recursive: { self?: unknown } = {};
      recursive.self = recursive;
      const instance = new MaterialInstance(base);
      instance.markClean();
      expect(() => instance.setOverride("u_data", recursive as never)).toThrow(/acyclic/);
      expect(instance.isDirty()).toBe(false);
      instance.setOverride("u_data", { items: [], flag: 0 });
      const program = base.compile(new MockRenderDevice()).program!;
      expect(() => new MaterialBinding().bindRecursive(instance, program)).toThrow(/expected 2 values/);
      expect(() => new MaterialBinding().bindGenerated(instance, program)).toThrow(/expected 2 values/);

      const schema = base.uniformSchema[0] as unknown as { dataType: { fields: unknown[] } };
      const binding = library.compileSource(base.shaderKey).portableBindings!.find((entry) => entry.name === "u_data")!;
      expect(Object.isFrozen(schema.dataType.fields)).toBe(true);
      expect(Object.isFrozen(binding)).toBe(true);
      expect(Object.isFrozen(binding.dataType)).toBe(true);
    } finally { base.dispose(); }
  });

  it("validates flat and nested numeric array uniforms without inventing missing elements", () => {
    const library = new ShaderLibrary();
    const sources = {
      ...DATA_SOURCES,
      glsl: { ...DATA_SOURCES.glsl, fragment: DATA_SOURCES.glsl.fragment.replace("uniform sampler2D u_texture;", `
uniform vec2 u_offsets[2];
uniform uint u_ids[2];
uniform bool u_flags[2];`) }
    };
    const offsets = [[1, 2], [3, 4]];
    const instance = new PortableShaderMaterial({
      shaderLibrary: library, name: "numeric-arrays", sources,
      uniforms: [
        { name: "u_offsets", kind: "vec2", arrayLength: 2, value: offsets },
        { name: "u_ids", kind: "u32", arrayLength: 2, value: new Uint32Array([16_777_217, 0xffffffff]) },
        { name: "u_flags", kind: "bool", arrayLength: 2, value: [true, false] }
      ]
    });
    try {
      offsets[0]![0] = 20;
      const program = instance.compile(new MockRenderDevice()).program!;
      const bound = new MaterialBinding().bindRecursive(instance, program).uniforms;
      expect(bound.get("u_offsets")).toEqual([[1, 2], [3, 4]]);
      expect(bound.get("u_ids")).toEqual(new Uint32Array([16_777_217, 0xffffffff]));
      expect(bound.get("u_flags")).toEqual([true, false]);
      expect(() => new MaterialBinding().bind(instance, program)).toThrow(/structured uniform u_offsets/);
      instance.setParameter("u_offsets", new Float32Array([5, 6, 7, 8]));
      expect(instance.getParameter("u_offsets")).toEqual(new Float32Array([5, 6, 7, 8]));
      expect(() => instance.setParameter("u_offsets", [[1, 2], [3]])).toThrow(/2 scalar values/);
      expect(() => instance.setParameter("u_ids", [1, -1])).toThrow(/unsigned 32-bit/);
      expect(() => instance.setParameter("u_flags", [true, 2])).toThrow(/true, false, 0, or 1/);
      expect(() => instance.setParameter("u_flags", [true])).toThrow(/2 scalar values/);
    } finally { instance.dispose(); }
  });
});
