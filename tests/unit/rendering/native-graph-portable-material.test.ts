import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { shaderGraph as publicShaderGraph } from "@aura3d/engine/shader-graph-runtime";
import { applyCustomUniformWrites, assertCustomUniformWrite, clearCustomUniformWrites, createCustomShaderMaterial, customMaterialCacheKey, customUniformWritesFor, recordCustomUniformWrite, syncCustomTextureRefs } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { ForwardPass, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { CLUSTER_TILE_SIZE, MAX_LIGHTS_PER_CLUSTER, createClusteredForwardLighting } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { createContactShadowMaskTarget, setContactShadowMask } from "../../../packages/rendering/src/forward/contactShadowMaskStore";
import { clippingRetainsPoint, createClippingBinding } from "../../../packages/rendering/src/ClippingPlanes";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { Material } from "../../../packages/rendering/src/Material";
import { ShadowPass } from "../../../packages/rendering/src/ShadowPass";
import { ShadowMap } from "../../../packages/rendering/src/ShadowMap";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PortableShaderCompilationError, PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { ShaderLibrary, globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { ShaderModule } from "../../../packages/rendering/src/ShaderModule";
import { MockRenderDevice, type PortableShaderBinding, type ShaderSources, type UniformDataValue } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { deriveShaderDataLayout, type ShaderDataType } from "../../../packages/rendering/src/webgpu/ShaderDataLayout";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { DirectionalLight, PointLight } from "@aura3d/scene";
import { compileShaderGraph, type ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { deriveUniformDataLayout } from "../../../packages/rendering/src/program/UniformLayout";

// The selected value is not exactly representable as f32, so the upload must
// preserve the integer bits rather than merely produce a plausible colour.
const exactValue = 16_777_217;
const graph: ShaderGraphDocument = {
  version: 1, stage: "material",
  resources: [
    { name: "counter", kind: "uniform", type: "u32" }, { name: "gain", kind: "uniform", type: "f32" },
    { name: "signed", kind: "uniform", type: "i32" }, { name: "enabled", kind: "uniform", type: "bool" }
  ],
  nodes: [
    { id: "counter", op: "uniform", type: "u32", resource: "counter" },
    { id: "reference", op: "constant", type: "u32", value: exactValue },
    { id: "equal", op: "equal", type: "bool", inputs: ["counter", "reference"] },
    { id: "gain", op: "uniform", type: "f32", resource: "gain" },
    { id: "signed", op: "uniform", type: "i32", resource: "signed" },
    { id: "signedReference", op: "constant", type: "i32", value: -exactValue },
    { id: "signedEqual", op: "equal", type: "bool", inputs: ["signed", "signedReference"] },
    { id: "enabled", op: "uniform", type: "bool", resource: "enabled" },
    { id: "zero", op: "constant", type: "f32", value: 0 },
    { id: "channel", op: "select", type: "f32", inputs: ["equal", "gain", "zero"] },
    { id: "signedChannel", op: "select", type: "f32", inputs: ["signedEqual", "channel", "zero"] },
    { id: "enabledChannel", op: "select", type: "f32", inputs: ["enabled", "signedChannel", "zero"] },
    { id: "color", op: "construct", type: "vec3", inputs: ["enabledChannel", "enabledChannel", "enabledChannel"] }
  ],
  outputs: { color: "color" }
};

function nativeDevice() {
  const modules: string[] = [];
  const writes: { label: string; bytes: Uint8Array }[] = [];
  const textureWrites: { label: string; bytes: Uint8Array }[] = [];
  const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const layouts: { entries: readonly { binding: number; sampler?: { type: string }; texture?: { sampleType: string } }[] }[] = [];
  const pipelines: unknown[] = [];
  let draws = 0;
  const native: WebGPUDeviceLike = {
    queue: {
      writeBuffer(buffer, _offset, data) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        writes.push({ label: (buffer as { label?: string }).label ?? "", bytes: bytes.slice() });
      },
      writeTexture(destination, data) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        textureWrites.push({ label: (destination.texture as { label?: string }).label ?? "", bytes: bytes.slice() });
      },
      submit() {}, onSubmittedWorkDone: async () => {}
    },
    createBuffer({ label, size, usage }) { return { label, size, usage, destroy() {} }; },
    createTexture({ label }) { return { label, createView: (descriptor) => ({ label, descriptor }), destroy() {} }; },
    createSampler() { return {}; },
    createShaderModule({ code }) { modules.push(code); return {}; },
    createBindGroupLayout(descriptor) { layouts.push(descriptor); return {}; },
    createPipelineLayout() { return {}; },
    createRenderPipeline(descriptor) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor) { groups.push(descriptor); return {}; },
    createCommandEncoder() {
      return {
        beginRenderPass: () => ({ setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, draw() { draws += 1; }, drawIndexed() { draws += 1; }, end() {} }),
        finish: () => ({})
      };
    },
    destroy() {}
  };
  return { native, modules, writes, textureWrites, groups, layouts, pipelines, draws: () => draws };
}

function skinnedGeometry(eight: boolean): Geometry {
  const vertices = new VertexBuffer(eight ? VertexFormat.P3N3J8W8 : VertexFormat.P3N3J4W4, 3);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
    vertices.setAttribute(index, "normal", [0, 0, 1]);
    vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [eight ? 0.5 : 1, 0, 0, 0]);
    if (eight) {
      vertices.setAttribute(index, "joints1", [1, 0, 0, 0]);
      vertices.setAttribute(index, "weights1", [0.5, 0, 0, 0]);
    }
  }
  return new Geometry(vertices, null, "triangles");
}

function graphCube(label: string): Texture {
  return new Texture({ width: 1, height: 1, dimension: "cube", label,
    cubeFaces: (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({ face, mipLevels: [{ width: 1, height: 1, data: new Uint8Array([64, 128, 192, 255]) }] })) });
}

/** Read the actual generated WGSL struct so byte assertions follow the shader ABI. */
function portableFieldOffset(source: string, name: string): number {
  const body = /struct Aura3DPortableUniforms\s*\{([\s\S]*?)\};/.exec(source)?.[1];
  if (!body) throw new Error("Missing portable WGSL uniform struct");
  const typeOf = (text: string): ShaderDataType => {
    const array = /^array<(.+),\s*(\d+)>$/.exec(text);
    if (array) return { kind: "array", element: typeOf(array[1]!), length: Number(array[2]) };
    if (text === "f32" || text === "i32" || text === "u32") return text;
    const vector = /^vec([234])<f32>$/.exec(text);
    if (vector) return { kind: "vector", element: "f32", length: Number(vector[1]) as 2 | 3 | 4 };
    if (text === "mat4x4<f32>") return { kind: "matrix", columns: 4, rows: 4 };
    throw new Error(`Unexpected portable WGSL field type ${text}`);
  };
  const fields = [...body.matchAll(/^\s*(\w+):\s*(.+),\s*$/gm)].map((match) => ({ name: match[1]!, type: typeOf(match[2]!) }));
  const member = deriveShaderDataLayout({ kind: "struct", fields }, "wgsl-uniform").members?.find((entry) => entry.name === name);
  if (!member) throw new Error(`Portable WGSL field ${name} is missing`);
  return member.offset;
}

const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;
const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

describe("portable graph material bindings", () => {
  it("submits a compiled recursive graph schema to the portable WebGPU material path", async () => {
    const graph = {
      version: 1, stage: "material",
      structs: [
        { name: "Settings", fields: [{ name: "layers", type: "array:2:struct:Layer" }, { name: "weights", type: "array:2:f32" }, { name: "tail", type: "u32" }] },
        { name: "Layer", fields: [{ name: "weight", type: "f32" }, { name: "enabled", type: "bool" }, { name: "color", type: "vec3" }] }
      ],
      resources: [{ name: "settings", kind: "uniform", type: "struct:Settings" }],
      nodes: [
        { id: "settings", op: "uniform", resource: "settings", type: "struct:Settings" },
        { id: "layers", op: "structField", name: "layers", type: "array:2:struct:Layer", inputs: ["settings"] },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "index"] },
        { id: "color", op: "structField", name: "color", type: "vec3", inputs: ["layer"] },
        { id: "weights", op: "structField", name: "weights", type: "array:2:f32", inputs: ["settings"] },
        { id: "opacity", op: "arrayIndex", type: "f32", inputs: ["weights", "index"] }
      ],
      outputs: { color: "color", opacity: "opacity" }
    } as unknown as ShaderGraphDocument;
    const restored = publicShaderGraph.deserialize(publicShaderGraph.serialize(graph));
    const glsl = publicShaderGraph.compile(restored, "glsl");
    const wgsl = publicShaderGraph.compile(restored, "wgsl");
    const dataType = wgsl.bindings[0]!.dataType!;
    const initial = {
      layers: [
        { weight: 1.25, enabled: true, color: [1, 2, 3] },
        { weight: 2.5, enabled: false, color: [4, 5, 6] }
      ],
      weights: [3.5, 4.75], tail: 0xfedcba98
    };
    expect(() => publicShaderGraph.material({
      graph: restored, backend: "wgsl", uniforms: { settings: { ...initial, weights: new Float64Array([3.5, 4.75]) } }
    })).toThrow(/invalid-resource.*needs 2 values/);
    const prefix = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
    const vertexPrelude = "uniform mat4 u_modelViewProjection;\nuniform mat4 u_modelMatrix;\nin vec3 a_position;\n#define modelViewProjectionMatrix u_modelViewProjection\n#define modelMatrix u_modelMatrix\n#define position a_position\n";
    if (hasGlslang) {
      for (const [stage, source] of [["vert", prefix + vertexPrelude + glsl.vertex], ["frag", prefix + glsl.fragment]] as const) {
        const result = spawnSync("glslangValidator", ["--stdin", "-S", stage], { input: source, encoding: "utf8" });
        expect(result.status, `${stage}: ${result.stdout}\n${result.stderr}`).toBe(0);
      }
    }
    const library = new ShaderLibrary();
    const material = new PortableShaderMaterial({
      name: "recursive-compiled-graph", shaderLibrary: library,
      sources: {
        glsl: { vertex: prefix + vertexPrelude + glsl.vertex!, fragment: prefix + glsl.fragment! },
        wgsl: { vertex: wgsl.vertex!, fragment: wgsl.fragment! }
      },
      uniforms: [{ name: "u_auraGraph_resource_settings", kind: "data", dataType, value: initial }]
    });
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const geometry = Geometry.triangle();
    const flatBind = vi.spyOn(MaterialBinding.prototype, "bind");
    const recursiveBind = vi.spyOn(MaterialBinding.prototype, "bindRecursive");
    try {
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      new ForwardPass({ shaderLibrary: library, items: [{ geometry, material, label: "recursive-graph" }] }).execute({ device, width: 2, height: 2 });
      device.endFrame();
      expect(recursiveBind).toHaveBeenCalledTimes(1);
      expect(flatBind).not.toHaveBeenCalled();
      expect(mock.draws()).toBe(1);
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toContain("aura.u_auraGraph_resource_settings.layers[1u].color");
      expect(fragment).toContain("aura.u_auraGraph_resource_settings.weights[1u].value");
      const bindings = library.compileSource(material.shaderKey).portableBindings!;
      const toType = (binding: PortableShaderBinding): ShaderDataType => {
        if (binding.kind === "data") return binding.dataType!;
        const type: ShaderDataType = binding.kind === "mat4" ? { kind: "matrix", columns: 4, rows: 4 }
          : binding.kind === "vec2" || binding.kind === "vec3" || binding.kind === "vec4" ? { kind: "vector", element: "f32", length: Number(binding.kind.slice(3)) as 2 | 3 | 4 }
          : binding.kind === "i32" || binding.kind === "u32" || binding.kind === "bool" ? binding.kind : "f32";
        return binding.arrayLength === undefined ? type : { kind: "array", length: binding.arrayLength, element: type };
      };
      const layout = deriveUniformDataLayout({
        name: "GraphUpload", group: 0, binding: 0,
        members: bindings.filter((binding) => !binding.kind.startsWith("texture") && !binding.kind.startsWith("depth"))
          .map((binding) => ({ name: binding.name, type: toType(binding) }))
      }, "wgsl-uniform");
      const offset = layout.members!.find((member) => member.name === "u_auraGraph_resource_settings")!.offset;
      const bytes = mock.writes.find((write) => write.label === "recursive-graph-portable-uniforms")!.bytes;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect([0, 32, 64, 80].map((index) => view.getFloat32(offset + index, true))).toEqual([1.25, 2.5, 3.5, 4.75]);
      expect([4, 36, 96].map((index) => view.getUint32(offset + index, true))).toEqual([1, 0, 0xfedcba98]);
      const updated = { ...initial, weights: [0.125, 0.875], tail: 0xabcdef01 };
      material.setParameter("u_auraGraph_resource_settings", updated);
      updated.weights[1] = 99;
      expect(() => material.setParameter("u_auraGraph_resource_settings", { ...updated, tail: -1 })).toThrow(/unsigned 32-bit/);
      const moduleCount = mock.modules.length;
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      new ForwardPass({ shaderLibrary: library, items: [{ geometry, material, label: "recursive-graph-update" }] }).execute({ device, width: 2, height: 2 });
      device.endFrame();
      const nextBytes = mock.writes.find((write) => write.label === "recursive-graph-update-portable-uniforms")!.bytes;
      const nextView = new DataView(nextBytes.buffer, nextBytes.byteOffset, nextBytes.byteLength);
      expect(nextView.getFloat32(offset + 80, true)).toBe(0.875);
      expect(nextView.getUint32(offset + 96, true)).toBe(0xabcdef01);
      expect(mock.modules.length).toBe(moduleCount);
    } finally { flatBind.mockRestore(); recursiveBind.mockRestore(); geometry.dispose(); material.dispose(); device.dispose(); }
  });
  it("validates and bridges public recursive graph uniforms without WebGL support", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material",
      structs: [
        { name: "Layer", fields: [{ name: "enabled", type: "bool" }, { name: "amount", type: "f32" }, { name: "count", type: "u32" }] },
        { name: "Settings", fields: [{ name: "layers", type: "array:2:struct:Layer" }] }
      ],
      resources: [{ name: "settings", kind: "uniform", type: "struct:Settings" }],
      nodes: [
        { id: "root", op: "uniform", type: "struct:Settings", resource: "settings" },
        { id: "layers", op: "structField", type: "array:2:struct:Layer", name: "layers", inputs: ["root"] },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "index"] },
        { id: "opacity", op: "structField", type: "f32", name: "amount", inputs: ["layer"] }
      ],
      outputs: { opacity: "opacity" }
    };
    const valid = { layers: [
      { enabled: true, amount: 0.25, count: 16_777_217 },
      { enabled: false, amount: 0.75, count: 0xffffffff }
    ] };
    expect(publicShaderGraph.validate(graph, "wgsl")).toEqual([]);
    expect(publicShaderGraph.compile(graph, "wgsl").bindings[0]?.dataType).toBeDefined();
    expect(() => publicShaderGraph.material({ graph, backend: "glsl", uniforms: { settings: valid } })).toThrow(/unsupported-backend.*WebGL2/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl" })).toThrow(/invalid-resource.*requires an initial value/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: { layers: [valid.layers[0]] } } })).toThrow(/invalid-resource.*needs 2 values/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: { layers: [{ ...valid.layers[0], enabled: 2 }, valid.layers[1]] } } })).toThrow(/invalid-resource.*boolean/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: { layers: [{ ...valid.layers[0], amount: 1e100 }, valid.layers[1]] } } })).toThrow(/invalid-resource.*f32/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: { layers: [{ ...valid.layers[0], count: -1 }, valid.layers[1]] } } })).toThrow(/invalid-resource.*u32/);
    expect(() => publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: { ...valid, extra: 1 } } })).toThrow(/invalid-resource.*not declared/);
    const spec = publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: valid } });
    const uniform = spec.custom!.uniforms!.auraGraph_resource_settings;
    expect(uniform).toMatchObject({ type: "data", dataType: publicShaderGraph.compile(graph, "wgsl").bindings[0]!.dataType, value: valid });
    valid.layers[0]!.amount = 0.125;
    const material = createCustomShaderMaterial(spec.custom!);
    try {
      const name = "u_auraGraph_resource_settings";
      expect(material.uniformSchema.find((entry) => entry.name === name)).toMatchObject({ kind: "data", dataType: (uniform as { dataType: ShaderDataType }).dataType });
      expect((material.getParameter<UniformDataValue>(name) as typeof valid).layers[0]!.amount).toBe(0.25);
      const changed = { layers: [{ enabled: false, amount: 0.5, count: 3 }, { enabled: true, amount: 0.8, count: 0xffffffff }] };
      assertCustomUniformWrite(spec, "settings", changed);
      expect(applyCustomUniformWrites(material, new Map([["settings", changed]]))).toBe(1);
      const revision = material.getRevision();
      expect(applyCustomUniformWrites(material, new Map([["settings", changed]]))).toBe(0);
      expect(material.getRevision()).toBe(revision);
      expect(() => assertCustomUniformWrite(spec, "settings", { layers: [] })).toThrow(/expected 2 values/);
      expect(material.getRevision()).toBe(revision);
      const data = uniform as { type: "data"; dataType: ShaderDataType; value: typeof valid };
      const differentValue = { ...spec.custom!, uniforms: { ...spec.custom!.uniforms,
        auraGraph_resource_settings: { ...data, value: changed } } };
      const reorderedValue = { ...spec.custom!, uniforms: { ...spec.custom!.uniforms,
        auraGraph_resource_settings: { ...data, value: { layers: data.value.layers.map(({ count, amount, enabled }) => ({ count, amount, enabled })) } } } };
      expect(customMaterialCacheKey(differentValue)).not.toBe(customMaterialCacheKey(spec.custom!));
      expect(customMaterialCacheKey(reorderedValue)).toBe(customMaterialCacheKey(spec.custom!));
      const differentSchema = { ...spec.custom!, uniforms: { ...spec.custom!.uniforms,
        auraGraph_resource_settings: { ...data, dataType: { kind: "struct" as const, fields: [
          { name: "layers", type: { kind: "array" as const, length: 2, element: { kind: "struct" as const, fields: [
            { name: "enabled", type: "bool" as const }, { name: "amount", type: "f32" as const }, { name: "count", type: "i32" as const }
          ] } } }
        ] } } } };
      expect(customMaterialCacheKey(differentSchema)).not.toBe(customMaterialCacheKey(spec.custom!));
      const runtimeId = "aggregate-snapshot-test";
      try {
        recordCustomUniformWrite(runtimeId, "settings", changed);
        changed.layers[1]!.amount = 0.125;
        expect(applyCustomUniformWrites(material, customUniformWritesFor(runtimeId)!)).toBe(0);
      } finally { clearCustomUniformWrites(runtimeId); }
      const originalSchema = data.dataType;
      try {
        const fields = (originalSchema as Extract<ShaderDataType, { kind: "struct" }>).fields;
        (data as { dataType: ShaderDataType }).dataType = { kind: "struct", fields: [...fields, { name: "extra", type: "f32" }] };
        // Provide a value matching the edited schema so integrity, not value validation, rejects it.
        (data as { value: UniformDataValue }).value = { ...valid, extra: 0 };
        expect(() => createCustomShaderMaterial(spec.custom!)).toThrow(/compiled graph data schema or shader sources changed/);
      } finally {
        (data as { dataType: ShaderDataType }).dataType = originalSchema;
        (data as { value: UniformDataValue }).value = valid;
      }
    } finally { material.dispose(); }
  });
  it("submits public aggregate graph writes to forward and checked depth on WebGPU", async () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", alphaTest: 0.2,
      structs: [
        { name: "Layer", fields: [{ name: "enabled", type: "bool" }, { name: "amount", type: "f32" }, { name: "count", type: "u32" }] },
        { name: "Settings", fields: [{ name: "layers", type: "array:2:struct:Layer" }] }
      ],
      resources: [{ name: "settings", kind: "uniform", type: "struct:Settings" }],
      nodes: [
        { id: "root", op: "uniform", type: "struct:Settings", resource: "settings" },
        { id: "layers", op: "structField", type: "array:2:struct:Layer", name: "layers", inputs: ["root"] },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "index"] },
        { id: "opacity", op: "structField", type: "f32", name: "amount", inputs: ["layer"] }
      ],
      outputs: { opacity: "opacity" }
    };
    const settings = { layers: [
      { enabled: true, amount: 0.25, count: 16_777_217 },
      { enabled: false, amount: 0.75, count: 0xffffffff }
    ] };
    const spec = publicShaderGraph.material({ graph, backend: "wgsl", uniforms: { settings } });
    const material = createCustomShaderMaterial(spec.custom!);
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const geometry = Geometry.triangle();
    const item = { label: "public-recursive", geometry, material };
    const offsetFor = (key: string): number => {
      const bindings = globalShaderSource(key)!.portableBindings!;
      const fields = bindings.filter((binding) => !binding.kind.startsWith("texture") && !binding.kind.startsWith("depth"))
        .map((binding) => {
          const type: ShaderDataType = binding.kind === "data" ? binding.dataType!
            : binding.kind === "mat4" ? { kind: "matrix", columns: 4, rows: 4 }
            : binding.kind === "vec2" || binding.kind === "vec3" || binding.kind === "vec4"
              ? { kind: "vector", element: "f32", length: Number(binding.kind.slice(3)) as 2 | 3 | 4 }
              : binding.kind === "i32" || binding.kind === "u32" || binding.kind === "bool" ? binding.kind : "f32";
          return { name: binding.name, type: binding.arrayLength === undefined ? type : { kind: "array" as const, length: binding.arrayLength, element: type } };
        });
      return deriveUniformDataLayout({ name: "TestData", group: 0, binding: 0, members: fields }, "wgsl-uniform")
        .members!.find((member) => member.name === "u_auraGraph_resource_settings")!.offset;
    };
    try {
      const target = device.createRenderTarget({ width: 2, height: 2, depth: true });
      const forward = new ForwardPass({ items: [item] });
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      forward.execute({ device, width: 2, height: 2 });
      new DepthPass({ casters: [item], checkedSubmission: true }).execute({ device, width: 2, height: 2 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      for (const [label, key] of [
        ["public-recursive-portable-uniforms", material.shaderKey],
        ["public-recursive:custom-depth-portable-uniforms", material.customDepthShaderKey!]
      ] as const) {
        const bytes = mock.writes.find((entry) => entry.label === label)!.bytes;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const offset = offsetFor(key);
        expect(view.getUint32(offset, true)).toBe(1);
        expect(view.getUint32(offset + 8, true)).toBe(16_777_217);
        expect(view.getFloat32(offset + 20, true)).toBe(0.75);
        expect(view.getUint32(offset + 24, true)).toBe(0xffffffff);
      }
      const updated = { layers: [{ enabled: false, amount: 0.4, count: 3 }, { enabled: true, amount: 0.5, count: 7 }] };
      assertCustomUniformWrite(spec, "settings", updated);
      expect(applyCustomUniformWrites(material, new Map([["settings", updated]]))).toBe(1);
      const compiled = mock.modules.length;
      device.beginFrame(2, 2); device.setRenderTarget(target);
      forward.execute({ device, width: 2, height: 2 });
      device.endFrame();
      const bytes = mock.writes.filter((entry) => entry.label === "public-recursive-portable-uniforms").at(-1)!.bytes;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const offset = offsetFor(material.shaderKey);
      expect(view.getUint32(offset, true)).toBe(0);
      expect(view.getFloat32(offset + 20, true)).toBe(0.5);
      expect(mock.modules.length).toBe(compiled);
      // Prepared depth plans must notice nested instance changes even though
      // an instance override does not increment the base material revision.
      const instance = new MaterialInstance(material);
      instance.setOverride("u_auraGraph_resource_settings", settings);
      const depth = new DepthPass({ casters: [{ ...item, material: instance }], checkedSubmission: true });
      const context = { device, width: 2, height: 2 };
      device.beginFrame(2, 2); device.setRenderTarget(target);
      const plan = depth.prepare(context);
      expect(() => depth.validatePrepared(context, plan)).not.toThrow();
      instance.setOverride("u_auraGraph_resource_settings", updated);
      expect(() => depth.validatePrepared(context, plan)).toThrow(/stale/);
      plan.dispose();
      device.endFrame();
      expect(mock.draws()).toBe(3);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });
  it("preserves recursive uniform schemas in large storage-reflection fallbacks", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material",
      structs: [
        { name: "Config", fields: [{ name: "amount", type: "f32" }] },
        ...["A", "B", "C", "D"].map((name) => ({ name, fields: [{ name: "amount", type: "f32" as const }] })),
        { name: "Block", fields: ["A", "B", "C", "D"].map((name) => ({ name: name.toLowerCase(), type: `struct:${name}` as const })) }
      ],
      functions: [{
        name: "unused", parameters: [], returnType: "f32",
        nodes: Array.from({ length: 505 }, (_, index) => ({ id: `constant${index}`, op: "constant" as const, type: "f32" as const, value: 0 })),
        output: "constant0"
      }],
      resources: [
        { name: "settings", kind: "uniform", type: "struct:Config" },
        { name: "records", kind: "storage-buffer", type: "struct:Block", access: "read" }
      ],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "loaded", op: "storageLoad", type: "struct:Block", resource: "records", inputs: ["index"] },
        { id: "nested", op: "structField", type: "struct:A", name: "a", inputs: ["loaded"] },
        { id: "sample", op: "structField", type: "f32", name: "amount", inputs: ["nested"] },
        { id: "settings", op: "uniform", type: "struct:Config", resource: "settings" },
        { id: "amount", op: "structField", type: "f32", name: "amount", inputs: ["settings"] },
        { id: "sum", op: "add", type: "f32", inputs: ["sample", "amount"] }
      ],
      outputs: { opacity: "sum" }
    };
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    try {
      expect(publicShaderGraph.validate(graph, "wgsl")).toEqual([]);
      const spec = publicShaderGraph.material({
        graph, backend: "wgsl", uniforms: { settings: { amount: 0.5 } },
        storage: { records: { kind: "storage-buffer", buffer } }
      });
      expect(spec.custom!.uniforms!.auraGraph_resource_settings).toMatchObject({ type: "data", value: { amount: 0.5 } });
      const material = createCustomShaderMaterial(spec.custom!);
      try {
        expect(material.uniformSchema.find((entry) => entry.name === "u_auraGraph_resource_settings")).toMatchObject({ kind: "data" });
      } finally { material.dispose(); }
    } finally { buffer.dispose(); device.dispose(); }
  });
  it("submits structured public portable materials and isolated overrides through ForwardPass to WebGPU", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const library = new ShaderLibrary();
    const type = { kind: "struct", fields: [
      { name: "prefix", type: "i32" },
      { name: "items", type: { kind: "array", length: 2, element: { kind: "struct", fields: [
        { name: "enabled", type: "bool" },
        { name: "weights", type: { kind: "array", length: 2, element: "f32" } },
        { name: "position", type: { kind: "vector", element: "i32", length: 2 } }
      ] } } },
      { name: "flags", type: { kind: "array", length: 2, element: { kind: "array", length: 2, element: "bool" } } },
      { name: "tail", type: "u32" }
    ] } as const;
    const initial = {
      prefix: -7,
      items: [
        { enabled: true, weights: [1.25, 2.5], position: new Int32Array([-1, 2]) },
        { enabled: false, weights: [3.5, 4.75], position: new Int32Array([16_777_217, -2]) }
      ],
      flags: [[true, false], [false, true]],
      tail: 0xfedcba98
    };
    const sources = {
      glsl: {
        vertex: "#version 300 es\nlayout(location = 0) in vec3 a_position;\nuniform mat4 u_modelViewProjection;\nvoid main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }",
        fragment: `#version 300 es
precision highp float;
precision highp int;
struct Item { bool enabled; float weights[2]; ivec2 position; };
struct Data { int prefix; Item items[2]; bool flags[2][2]; uint tail; };
uniform Data u_data;
uniform float u_weights[2];
uniform uint u_marker;
uniform mat3x2 u_matrices[2];
out vec4 outColor;
void main() { outColor = vec4(u_data.items[1].weights[0] + u_weights[1] + float(u_marker) + u_matrices[1][2].y); }`
      },
      wgsl: {
        vertex: "/* @aura3d-bindings */ @vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return aura.u_modelViewProjection * vec4<f32>(p, 1.0); }",
        fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_data.items[1].weights[0] + f32(aura.u_data.flags[1][0]) + f32(aura.u_data.items[1].position.x) + aura.u_weights[1] + f32(aura.u_marker) + aura.u_matrices[1][2].y); }"
      }
    };
    const material = new PortableShaderMaterial({
      shaderLibrary: library, name: "public-forward-layout", sources,
      uniforms: [
        { name: "u_data", kind: "data", dataType: type, value: initial },
        { name: "u_weights", kind: "float", arrayLength: 2, value: [0.25, 0.75] },
        { name: "u_marker", kind: "u32", value: 0x12345678 },
        { name: "u_matrices", kind: "data", dataType: { kind: "array", length: 2, element: { kind: "matrix", columns: 3, rows: 2 } },
          value: [new Float32Array([1, 2, 3, 4, 5, 6]), new Float32Array([11, 12, 13, 14, 15, 16])] }
      ]
    });
    const geometry = Geometry.cube(1);
    try {
      const instance = new MaterialInstance(material);
      const override = {
        ...initial,
        items: initial.items.map((item) => ({ ...item, weights: [...item.weights], position: new Int32Array(item.position) })),
        flags: initial.flags.map((row) => [...row]),
        tail: 0x87654321
      };
      instance.setOverride("u_data", override);
      initial.items[0]!.weights[0] = 100;
      override.items[1]!.position[0] = 1;
      (type.fields[1]!.type as unknown as { length: number }).length = 3;
      const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
      const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      device.beginFrame(4, 4);
      device.setRenderTarget(target);
      new ForwardPass({ shaderLibrary: library, items: [
        { label: "structured-base", geometry, material, modelViewProjectionMatrix: matrix },
        { label: "structured-instance", geometry, material: instance, modelViewProjectionMatrix: matrix }
      ] }).execute({ device, width: 4, height: 4 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      const base = mock.writes.find((entry) => entry.label === "structured-base-portable-uniforms")!.bytes;
      const overridden = mock.writes.find((entry) => entry.label === "structured-instance-portable-uniforms")!.bytes;
      expect(base.byteLength).toBe(528);
      const view = new DataView(base.buffer, base.byteOffset, base.byteLength);
      const instanceView = new DataView(overridden.buffer, overridden.byteOffset, overridden.byteLength);
      expect(view.getInt32(192, true)).toBe(-7);
      expect([224, 240, 288, 304].map((offset) => view.getFloat32(offset, true))).toEqual([1.25, 2.5, 3.5, 4.75]);
      expect([208, 272, 336, 352, 368, 384].map((offset) => view.getUint32(offset, true))).toEqual([1, 0, 1, 0, 0, 1]);
      expect(view.getInt32(320, true)).toBe(16_777_217);
      expect(instanceView.getInt32(320, true)).toBe(16_777_217);
      expect(view.getUint32(400, true)).toBe(0xfedcba98);
      expect(instanceView.getUint32(400, true)).toBe(0x87654321);
      expect([416, 432].map((offset) => view.getFloat32(offset, true))).toEqual([0.25, 0.75]);
      expect(view.getUint32(448, true)).toBe(0x12345678);
      expect([464, 468, 472, 476, 480, 484].map((offset) => view.getFloat32(offset, true))).toEqual([1, 2, 3, 4, 5, 6]);
      expect([496, 500, 504, 508, 512, 516].map((offset) => view.getFloat32(offset, true))).toEqual([11, 12, 13, 14, 15, 16]);
      expect([...base.slice(196, 208)]).toEqual(Array(12).fill(0));
      expect([...base.slice(488, 496)]).toEqual(Array(8).fill(0));
      const fragment = mock.modules.find((source) => source.includes("@fragment") && source.includes("u_data"))!;
      expect(fragment).toContain("aura.u_data.items[1].weights[0].value");
      expect(fragment).toContain("aura.u_data.flags[1][0].value");
      expect(fragment).toContain("aura.u_weights[1].value");
      expect(fragment).toContain("aura.u_matrices[1].value[2].y");

      const replacement = { ...initial, prefix: -9, items: initial.items.map((item) => ({ ...item, weights: [...item.weights], position: new Int32Array(item.position) })) };
      replacement.items[0]!.weights[0] = 6.25;
      material.setParameter("u_data", replacement);
      replacement.items[0]!.weights[0] = 99;
      device.beginFrame(4, 4);
      device.setRenderTarget(target);
      new ForwardPass({ shaderLibrary: library, items: [
        { label: "structured-updated", geometry, material, modelViewProjectionMatrix: matrix },
        { label: "structured-retained", geometry, material: instance, modelViewProjectionMatrix: matrix }
      ] }).execute({ device, width: 4, height: 4 });
      device.endFrame();
      const updated = mock.writes.find((entry) => entry.label === "structured-updated-portable-uniforms")!.bytes;
      const retained = mock.writes.find((entry) => entry.label === "structured-retained-portable-uniforms")!.bytes;
      expect(new DataView(updated.buffer, updated.byteOffset, updated.byteLength).getFloat32(224, true)).toBe(6.25);
      expect(new DataView(retained.buffer, retained.byteOffset, retained.byteLength).getFloat32(224, true)).toBe(1.25);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uploads scalar and vector uniform arrays through a public material and native device", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = new Material({
      shaderKey: "uniform-arrays",
      uniformSchema: ["u_prefix", "u_weights", "u_offsets", "u_directions", "u_ids", "u_flags", "u_tail"]
        .map((name) => ({ name, kind: "any" as const })),
      parameters: {
        u_prefix: 0x12345678,
        u_weights: [1.5, 2.5],
        u_offsets: [3, 4, 5, 6],
        u_directions: [7, 8, 9, 10, 11, 12],
        u_ids: [16_777_217, 0xffffffff],
        u_flags: [1, 0],
        u_tail: 13.5
      }
    });
    try {
      const marker = "uniform-arrays";
      const shader = device.createShaderProgram({
        label: marker, marker,
        vertex: `// ${marker}\nin vec3 a_position; void main() { gl_Position = vec4(a_position, 1.0); }`,
        fragment: `// ${marker}\nuniform uint u_prefix; uniform float u_weights[2]; uniform vec2 u_offsets[2]; uniform vec3 u_directions[2]; uniform uint u_ids[2]; uniform bool u_flags[2]; uniform float u_tail; void main() {}`,
        webgpu: {
          vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
          fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_weights[1] + aura.u_offsets[1].x + aura.u_directions[1].y + f32(aura.u_ids[1]) + f32(aura.u_flags[0]) + aura.u_tail); }"
        },
        portableBindings: [
          { name: "u_prefix", kind: "u32" },
          { name: "u_weights", kind: "float", arrayLength: 2 },
          { name: "u_offsets", kind: "vec2", arrayLength: 2 },
          { name: "u_directions", kind: "vec3", arrayLength: 2 },
          { name: "u_ids", kind: "u32", arrayLength: 2 },
          { name: "u_flags", kind: "bool", arrayLength: 2 },
          { name: "u_tail", kind: "float" }
        ]
      });
      const uniforms = new MaterialBinding().bind(material, shader).uniforms;
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      device.draw({ label: "uniform-arrays", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      const bytes = mock.writes.find((write) => write.label === "uniform-arrays-portable-uniforms")!.bytes;
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(bytes.byteLength).toBe(192);
      expect(data.getUint32(0, true)).toBe(0x12345678);
      expect([16, 32].map((offset) => data.getFloat32(offset, true))).toEqual([1.5, 2.5]);
      expect([48, 52, 64, 68].map((offset) => data.getFloat32(offset, true))).toEqual([3, 4, 5, 6]);
      expect([80, 84, 88, 96, 100, 104].map((offset) => data.getFloat32(offset, true))).toEqual([7, 8, 9, 10, 11, 12]);
      expect([112, 128].map((offset) => data.getUint32(offset, true))).toEqual([16_777_217, 0xffffffff]);
      expect([144, 160].map((offset) => data.getUint32(offset, true))).toEqual([1, 0]);
      expect(data.getFloat32(176, true)).toBe(13.5);
      expect([...bytes.slice(20, 32)]).toEqual(Array(12).fill(0));
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toMatch(/@size\(16\)\s+value:\s*f32/);
      expect(fragment).toContain("aura.u_weights[1].value");
      expect(fragment).toContain("aura.u_offsets[1].value.x");
      expect(fragment).toContain("aura.u_directions[1].y");
      expect(fragment).toContain("aura.u_ids[1].value");
      expect(fragment).toContain("aura.u_flags[0].value");
    } finally { material.dispose(); device.dispose(); }
  });

  it("clones and uploads recursive material data with nested padded array accesses", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const type = { kind: "struct", fields: [
      { name: "prefix", type: "i32" },
      { name: "items", type: { kind: "array", length: 2, element: { kind: "struct", fields: [
        { name: "enabled", type: "bool" },
        { name: "weights", type: { kind: "array", length: 2, element: "f32" } },
        { name: "position", type: { kind: "vector", element: "i32", length: 2 } }
      ] } } },
      { name: "flags", type: { kind: "array", length: 2, element: { kind: "array", length: 2, element: "bool" } } },
      { name: "tail", type: "u32" }
    ] } as const;
    const value = {
      prefix: -7,
      items: [
        { enabled: true, weights: [1.25, 2.5], position: new Int32Array([-1, 2]) },
        { enabled: false, weights: [3.5, 4.75], position: new Int32Array([16_777_217, -2]) }
      ],
      flags: [[true, false], [0, 1]],
      tail: 0xfedcba98
    };
    const material = new Material<UniformDataValue>({ shaderKey: "recursive-uniforms", parameters: { u_data: value } });
    try {
      value.items[0]!.weights[0] = 99;
      value.items[1]!.position[0] = 0;
      const snapshot = material.getParameter("u_data") as unknown as typeof value;
      expect(snapshot.items[0]!.weights[0]).toBe(1.25);
      expect(snapshot.items[1]!.position[0]).toBe(16_777_217);
      snapshot.items[0]!.weights[0] = 98;
      expect((material.getParameter("u_data") as unknown as typeof value).items[0]!.weights[0]).toBe(1.25);
      const marker = "recursive-uniforms";
      const shader = device.createShaderProgram({
        label: marker, marker,
        vertex: `// ${marker}\nin vec3 a_position; void main() { gl_Position = vec4(a_position, 1.0); }`,
        fragment: `// ${marker}\nuniform float u_data; void main() {}`,
        webgpu: {
          vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
          fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_data.items[1].weights[0] + f32(aura.u_data.flags[1][0]) + f32(aura.u_data.items[1].position.x)); }"
        },
        portableBindings: [{ name: "u_data", kind: "data", dataType: type }]
      });
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      device.draw({ label: "recursive-uniforms", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms: material.getParameters() });
      device.endFrame();
      const bytes = mock.writes.find((write) => write.label === "recursive-uniforms-portable-uniforms")!.bytes;
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(bytes.byteLength).toBe(224);
      expect(data.getInt32(0, true)).toBe(-7);
      expect([16, 80].map((offset) => data.getUint32(offset, true))).toEqual([1, 0]);
      expect([32, 48, 96, 112].map((offset) => data.getFloat32(offset, true))).toEqual([1.25, 2.5, 3.5, 4.75]);
      expect([64, 68, 128, 132].map((offset) => data.getInt32(offset, true))).toEqual([-1, 2, 16_777_217, -2]);
      expect([144, 160, 176, 192].map((offset) => data.getUint32(offset, true))).toEqual([1, 0, 0, 1]);
      expect(data.getUint32(208, true)).toBe(0xfedcba98);
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toContain("aura.u_data.items[1].weights[0].value");
      expect(fragment).toContain("aura.u_data.flags[1][0].value");
      expect(fragment).toContain("aura.u_data.items[1].position.x");
    } finally { material.dispose(); device.dispose(); }
  });

  it("lowers dynamic nested matrix and scalar indices while retaining a schema snapshot", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const arrayType = { kind: "array" as const, length: 2, element: { kind: "matrix" as const, columns: 3 as const, rows: 2 as const } };
    const material = new Material<UniformDataValue>({
      shaderKey: "matrix-uniforms",
      parameters: { matrices: [[1, 2, 3, 4, 5, 6], [11, 12, 13, 14, 15, 16]], indices: [1, 0], tail: 0x12345678 }
    });
    try {
      const marker = "matrix-uniforms";
      const shader = device.createShaderProgram({
        label: marker, marker,
        vertex: `// ${marker}\nin vec3 a_position; void main() { gl_Position = vec4(a_position, 1.0); }`,
        fragment: `// ${marker}\nvoid main() {}`,
        webgpu: {
          vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
          fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { let first = aura.matrices[0].value[1].x; return vec4<f32>(first + aura.matrices[u32(aura.indices[0])][2].y); }"
        },
        portableBindings: [
          { name: "matrices", kind: "data", dataType: arrayType },
          { name: "indices", kind: "u32", arrayLength: 2 },
          { name: "tail", kind: "u32" }
        ]
      });
      arrayType.length = 3;
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      device.draw({ label: "matrix-uniforms", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms: material.getParameters() });
      device.endFrame();
      const bytes = mock.writes.find((write) => write.label === "matrix-uniforms-portable-uniforms")!.bytes;
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(bytes.byteLength).toBe(112);
      expect([0, 4, 8, 12, 16, 20].map((offset) => data.getFloat32(offset, true))).toEqual([1, 2, 3, 4, 5, 6]);
      expect([32, 36, 40, 44, 48, 52].map((offset) => data.getFloat32(offset, true))).toEqual([11, 12, 13, 14, 15, 16]);
      expect([64, 80, 96].map((offset) => data.getUint32(offset, true))).toEqual([1, 0, 0x12345678]);
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toMatch(/@size\(32\)\s+value:\s*mat3x2<f32>/);
      expect(fragment).toContain("aura.matrices[0].value[1].x");
      expect(fragment).not.toContain(".value.value");
      expect(fragment).toContain("aura.matrices[u32(aura.indices[0].value)].value[2].y");
    } finally { material.dispose(); device.dispose(); }
  });

  it("rejects malformed portable layouts, unsupported aggregate access and oversized uniforms before shader creation", async () => {
    const mock = nativeDevice();
    Object.assign(mock.native, { limits: { maxUniformBufferBindingSize: 64 } });
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const sources = (portableBindings: readonly PortableShaderBinding[], expression = "1.0"): ShaderSources => ({
      label: "invalid-uniforms", marker: "invalid-uniforms",
      vertex: "// invalid-uniforms\nvoid main() {}",
      fragment: "// invalid-uniforms\nvoid main() {}",
      webgpu: {
        vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
        fragment: `/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(${expression}); }`
      },
      portableBindings
    });
    try {
      const invalid = [
        [{ name: "x", kind: "data" }],
        [{ name: "x", kind: "float", dataType: "u32" }],
        [{ name: "x", kind: "data", dataType: "f32", arrayLength: 2 }],
        [{ name: "x", kind: "texture2d", arrayLength: 2 }],
        [{ name: "x", kind: "float", arrayLength: 0 }],
        [{ name: "x", kind: "float" }, { name: "x", kind: "u32" }],
        [{ name: "x", kind: "unknown" }],
        [{ name: "x", kind: "data", dataType: { kind: "struct", fields: [{ name: "if", type: "f32" }] } }]
      ] as unknown as readonly (readonly PortableShaderBinding[])[];
      for (const bindings of invalid) expect(() => device.createShaderProgram(sources(bindings))).toThrow();
      expect(() => device.createShaderProgram(sources([{ name: "x", kind: "float", arrayLength: 2 }], "f32(arrayLength(&aura.x))"))).toThrow(/aggregates must be accessed/);
      expect(() => device.createShaderProgram(sources([{ name: "x", kind: "float", arrayLength: 2 }], "f32(aura)"))).toThrow(/whole aggregate/);
      expect(() => device.createShaderProgram(sources([{ name: "x", kind: "float", arrayLength: 5 }], "aura.x[0]"))).toThrow(/device limit/);
      expect(mock.modules).toHaveLength(0);
    } finally { device.dispose(); }
  });

  it("rejects malformed recursive uniform values before allocating an upload", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    try {
      const marker = "invalid-values";
      const shader = device.createShaderProgram({
        label: marker, marker,
        vertex: `// ${marker}\nvoid main() {}`,
        fragment: `// ${marker}\nvoid main() {}`,
        webgpu: {
          vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
          fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(f32(aura.flags[0])); }"
        },
        portableBindings: [{ name: "flags", kind: "data", dataType: { kind: "array", element: "bool", length: 2 } }]
      });
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      const draw = (uniforms: ReadonlyMap<string, UniformDataValue>) => device.draw({
        label: "invalid-values", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, uniforms
      });
      expect(() => draw(new Map())).toThrow(/missing/i);
      expect(() => draw(new Map([["flags", [true, 2]]]))).toThrow(/true, false, 0, or 1/);
      expect(() => draw(new Map([["flags", [true]]]))).toThrow(/expected 2 values/);
      expect(() => draw(new Map<string, UniformDataValue>([["flags", [true, false]], ["extra", { value: 1 }]]))).toThrow(/matching numeric portable binding/);
      expect(mock.writes.some((write) => write.label === "invalid-values-portable-uniforms")).toBe(false);
      expect(mock.draws()).toBe(0);
      device.endFrame();
    } finally { device.dispose(); }
  });
  it.runIf(hasGlslang)("links baked metallic graph stages with GLSL validation", () => {
    const graphWithLighting: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "image", kind: "texture2d" }], nodes: [
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "color", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
        { id: "metal", op: "constant", type: "f32", value: 0.75 },
        { id: "position", op: "input", type: "vec3", name: "positionLocal" }
      ], outputs: { color: "color", normal: "normal", metalness: "metal", position: "position" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: graphWithLighting, fog: true }).custom!);
    const dir = mkdtempSync(join(tmpdir(), "aura3d-graph-glsl-"));
    const vertex = join(dir, "graph.vert");
    const fragment = join(dir, "graph.frag");
    try {
      writeFileSync(vertex, material.sources.glsl.vertex);
      writeFileSync(fragment, material.sources.glsl.fragment);
      const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
      // The forward cluster binder requires every name; keep this viewport
      // uniform active in the linked GLSL program as well as source reflection.
      expect(reflection).toMatch(/u_clusterViewportSize:/);
      for (const name of ["u_geometryMatrix", "u_a3dClipPlanes", "u_a3dClipGroups", "u_a3dClipGroupCount"]) {
        expect(reflection).toContain(`${name}:`);
      }
      const keys = [material.customDepthShaderKey!, ...Object.values(material.graphSkinningShaderKeys!), ...Object.values(material.graphSkinningDepthShaderKeys!)];
      for (const mask of [1, 2, 4, 8, 16, 48, 80, 112, 15, 126, 128, 254]) keys.push(material.graphShadowVariant(material.shaderKey, mask)!);
      const contactKey = material.graphShadowVariant(material.shaderKey, 128)!;
      for (const environment of [1, 2, 4, 7]) keys.push(material.graphLightingVariant(material.shaderKey, 15, environment)!);
      for (const first of ["float", "uint", "sint"] as const) {
        for (const pass of ["forward", "depth"] as const) {
          keys.push(material.graphSkinningVariant(4, first, "float", pass)!);
          for (const second of ["float", "uint", "sint"] as const) keys.push(material.graphSkinningVariant(8, first, second, pass)!);
        }
      }
      for (const key of new Set(keys)) {
        const pair = globalShaderSource(key)!;
        writeFileSync(vertex, pair.vertex);
        writeFileSync(fragment, pair.fragment);
        const linked = execFileSync("glslangValidator", key === contactKey ? ["-l", "-q", vertex, fragment] : ["-l", vertex, fragment], { encoding: "utf8" });
        if (key === contactKey) for (const name of ["u_contactShadowMask", "u_contactShadowMaskViewport", "u_contactShadowMaskStrength", "u_contactShadowLightIndex"]) {
          expect(linked).toContain(`${name}:`);
        }
      }
    } finally {
      unlinkSync(vertex); unlinkSync(fragment); rmdirSync(dir); material.dispose();
    }
  });

  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga for source-gate graph WGSL validation", () => {
    expect(hasNaga, "naga is required for graph WGSL validation").toBe(true);
  });

  it.runIf(hasNaga)("validates the injected physical graph WGSL stages with Naga", async () => {
    const graphWithLighting: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "image", kind: "texture2d" }], nodes: [
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "color", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
        { id: "metal", op: "constant", type: "f32", value: 0.75 },
        { id: "position", op: "input", type: "vec3", name: "positionLocal" }
      ], outputs: { color: "color", normal: "normal", metalness: "metal", position: "position" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: graphWithLighting, fog: true }).custom!);
    const dir = mkdtempSync(join(tmpdir(), "aura3d-graph-wgsl-"));
    const files: string[] = [];
    try {
      expect(material.compile(device).ok).toBe(true);
      ShaderModule.fromLibrary(new ShaderLibrary(), material.customDepthShaderKey!).compile(device);
      for (const key of [...Object.values(material.graphSkinningShaderKeys!), ...Object.values(material.graphSkinningDepthShaderKeys!)]) {
        ShaderModule.fromLibrary(new ShaderLibrary(), key).compile(device);
      }
      for (const [influences, first, second] of [[4, "uint", "float"], [4, "sint", "float"], [8, "uint", "sint"], [8, "sint", "uint"]] as const) {
        for (const pass of ["forward", "depth"] as const) ShaderModule.fromLibrary(new ShaderLibrary(), material.graphSkinningVariant(influences, first, second, pass)!).compile(device);
      }
      for (const mask of [1, 2, 4, 8, 16, 48, 80, 112, 15, 126, 128, 254]) ShaderModule.fromLibrary(new ShaderLibrary(), material.graphShadowVariant(material.shaderKey, mask)!).compile(device);
      for (const environment of [1, 2, 4, 7]) ShaderModule.fromLibrary(new ShaderLibrary(), material.graphLightingVariant(material.shaderKey, 15, environment)!).compile(device);
      expect(mock.modules).toHaveLength(60);
      for (const [index, source] of mock.modules.entries()) {
        const file = join(dir, `${index}.wgsl`);
        files.push(file);
        writeFileSync(file, source);
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      }
    } finally {
      for (const file of files) unlinkSync(file);
      rmdirSync(dir);
      material.dispose(); device.dispose();
    }
  });

  it("selects only active shadow textures and combines that selection with typed skinning", () => {
    const lit: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const textureNames = (key: string): string[] => globalShaderSource(key)!.portableBindings!
      .filter((binding) => binding.kind.startsWith("texture"))
      .map((binding) => binding.name);
    try {
      const base = textureNames(material.shaderKey);
      expect(base).toEqual(["u_clusterLightData", "u_clusterLightIndices", "u_a3dEnvMap"]);
      expect(material.sources.glsl.fragment).not.toContain("u_pointShadowMapTexture");
      expect(material.sources.wgsl?.fragment).not.toContain("u_graphCascadeTexture0");
      const point = material.graphShadowVariant(material.shaderKey, 2)!;
      const cascades = material.graphShadowVariant(material.shaderKey, 16)!;
      const fourCascades = material.graphShadowVariant(material.shaderKey, 112)!;
      expect(textureNames(point)).toEqual([...base.slice(0, 2), "u_pointShadowMapTexture", base[2]]);
      expect(textureNames(cascades)).toEqual([...base.slice(0, 2), "u_graphCascadeTexture0", base[2]]);
      expect(textureNames(fourCascades)).toEqual([...base.slice(0, 2), "u_graphCascadeTexture0", "u_graphCascadeTexture1", "u_graphCascadeTexture2", "u_graphCascadeTexture3", base[2]]);
      expect(globalShaderSource(cascades)!.portableBindings).toContainEqual(expect.objectContaining({ name: "u_graphCascadeSamples", arrayLength: 32 }));
      expect(globalShaderSource(fourCascades)!.portableBindings).toContainEqual(expect.objectContaining({ name: "u_graphCascadeSamples", arrayLength: 128 }));
      expect(globalShaderSource(point)!.fragment).not.toContain("u_spotShadowMapTexture");
      expect(globalShaderSource(point)!.webgpu!.fragment).not.toContain("u_localShadowAtlas");
      const typed = material.graphSkinningVariant(4, "uint", "float", "forward")!;
      const combined = material.graphShadowVariant(typed, 2)!;
      expect(material.graphShadowVariant(typed, 2)).toBe(combined);
      expect(globalShaderSource(combined)!.webgpu!.vertex).toContain("@location(5) joints: vec4<u32>");
      expect(globalShaderSource(combined)!.webgpu!.fragment).toContain("fn auraGraphPointShadow");
      const local = material.graphLightingVariant(typed, 2, 1)!;
      const volume = material.graphLightingVariant(typed, 2, 2)!;
      const cube = material.graphLightingVariant(typed, 2, 4)!;
      const all = material.graphLightingVariant(typed, 2, 7)!;
      const contact = material.graphLightingVariant(typed, 130, 7)!;
      expect(textureNames(local)).toEqual(expect.arrayContaining(["u_prd02ProbeCubeA", "u_prd02ProbeCubeB", "u_pointShadowMapTexture"]));
      expect(textureNames(local)).not.toContain("u_prd02IrradianceR");
      expect(textureNames(volume)).toEqual(expect.arrayContaining(["u_prd02IrradianceR", "u_prd02IrradianceG", "u_prd02IrradianceB"]));
      expect(textureNames(cube)).toContain("u_graphGlobalEnvCube");
      expect(globalShaderSource(all)!.fragment).toContain("auraGraphVolumeBlend");
      expect(globalShaderSource(all)!.webgpu!.fragment).toContain("auraGraphProbeRadiance");
      expect(globalShaderSource(all)!.webgpu!.vertex).toContain("@location(5) joints: vec4<u32>");
      expect(textureNames(contact)).toContain("u_contactShadowMask");
      expect(textureNames(all)).not.toContain("u_contactShadowMask");
      expect(globalShaderSource(contact)!.fragment).toContain("index == int(u_contactShadowLightIndex)");
      expect(globalShaderSource(contact)!.fragment).toContain("auraGraphContactShadow(gl_FragCoord.xy)");
      expect(globalShaderSource(contact)!.webgpu!.fragment).toContain("lightIndex == i32(aura.u_contactShadowLightIndex)");
      expect(globalShaderSource(contact)!.webgpu!.fragment).toContain("auraGraphContactShadow(contactScreen)");
      expect(material.graphShadowVariant(material.shaderKey, 17)).toBeUndefined();
      material.dispose();
      expect(globalShaderSource(combined)).toBeUndefined();
    } finally { material.dispose(); }
  });

  it("certifies only unchanged graph-adapter clipping stages and their derived variants", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "position", roughness: "rough" } };
    const spec = shaderGraph.material({ graph }).custom!;
    const material = createCustomShaderMaterial(spec, "certified-clipping");
    const copy = createCustomShaderMaterial({ ...spec }, "copied-clipping");
    const editedSpec = shaderGraph.material({ graph }).custom!;
    Object.assign(editedSpec.glsl, { vertex: `${editedSpec.glsl.vertex}\n// changed after graph compilation` });
    const edited = createCustomShaderMaterial(editedSpec, "edited-clipping");
    const defined = createCustomShaderMaterial(shaderGraph.material({ graph, defines: { USER_FLAG: 1 } }).custom!, "defined-clipping");
    const forged = new PortableShaderMaterial({ name: "forged-clipping", shaderLibrary: new ShaderLibrary(), sources: material.sources, graphMaterial: true });
    const geometry = Geometry.litCube(1), device = new MockRenderDevice();
    const clipped = { planes: [[1, 0, 0, 0] as const] };
    try {
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(copy)).toBe(false);
      expect(PortableShaderMaterial.hasGraphClippingContract(edited)).toBe(false);
      expect(PortableShaderMaterial.hasGraphClippingContract(defined)).toBe(false);
      expect(PortableShaderMaterial.hasGraphClippingContract(forged)).toBe(false);
      expect(PortableShaderMaterial.hasGraphClippingContract(new Proxy(material, {}))).toBe(false);
      Object.defineProperty(material, "getParameters", { configurable: true, value: () => new Map() });
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(false);
      delete (material as unknown as { getParameters?: unknown }).getParameters;
      const prototype = Object.getPrototypeOf(material) as object;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "graphLightingVariant")!;
      try {
        Object.defineProperty(prototype, "graphLightingVariant", { ...descriptor, value: () => undefined });
        expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(false);
      } finally { Object.defineProperty(prototype, "graphLightingVariant", descriptor); }
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(true);
      const typed = material.graphSkinningVariant(8, "uint", "sint", "forward")!;
      const typedDepth = material.graphSkinningVariant(8, "uint", "sint", "depth")!;
      const combined = material.graphLightingVariant(typed, 2, 1)!;
      expect(PortableShaderMaterial.hasGraphClippingContract(material, typed)).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(material, combined)).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(material, material.customDepthShaderKey)).toBe(false);
      expect(PortableShaderMaterial.hasGraphClippingContract(material, material.customDepthShaderKey, "depth")).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(material, typedDepth, "depth")).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(material, typedDepth)).toBe(false);
      const pair = globalShaderSource(combined)!;
      const original = pair.fragment;
      try {
        Object.assign(pair, { fragment: `${original}\n// changed after registration` });
        expect(PortableShaderMaterial.hasGraphClippingContract(material, combined)).toBe(false);
      } finally { Object.assign(pair, { fragment: original }); }
      const originalGpu = pair.webgpu!, originalBindings = pair.portableBindings!;
      try {
        Object.assign(pair, { webgpu: { ...originalGpu, fragment: `${originalGpu.fragment}\n// changed WGSL` } });
        expect(PortableShaderMaterial.hasGraphClippingContract(material, combined)).toBe(false);
        Object.assign(pair, { webgpu: originalGpu, portableBindings: [...originalBindings, { name: "u_fake", kind: "float" }] });
        expect(PortableShaderMaterial.hasGraphClippingContract(material, combined)).toBe(false);
      } finally { Object.assign(pair, { webgpu: originalGpu, portableBindings: originalBindings }); }
      expect(PortableShaderMaterial.hasGraphClippingContract(material, combined)).toBe(true);
      device.beginFrame(8, 8);
      for (const unsafe of [copy, edited, defined, forged]) {
        expect(() => new ForwardPass({ items: [{ geometry, material: unsafe, globalClipping: clipped }] }).execute({ device, width: 8, height: 8 }))
          .toThrow(/clipping/i);
      }
      expect(device.drawCommands).toHaveLength(0);
      new ForwardPass({ items: [{ geometry, material, globalClipping: clipped }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      material.hotReload(material.sources);
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(false);
      expect(() => new ForwardPass({ items: [{ geometry, material, globalClipping: clipped }] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/clipping/i);
      expect(device.drawCommands).toHaveLength(1);
      device.endFrame();
    } finally { geometry.dispose(); device.dispose(); forged.dispose(); defined.dispose(); edited.dispose(); copy.dispose(); material.dispose(); }
    expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(false);
  });

  it("routes dielectric graph inputs, displacement and scene lights through a mock forward draw", () => {
    const litGraph: ShaderGraphDocument = {
      version: 1, stage: "material",
      resources: [
        { name: "tint", kind: "uniform", type: "vec4" },
        { name: "roughness", kind: "uniform", type: "f32" },
        { name: "image", kind: "texture2d" }
      ],
      nodes: [
        { id: "tint", op: "uniform", type: "vec4", resource: "tint" },
        { id: "rough", op: "uniform", type: "f32", resource: "roughness" },
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "sample", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
        { id: "color", op: "mul", type: "vec4", inputs: ["tint", "sample"] },
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "offset", op: "constant", type: "vec3", value: [0, 0.25, 0] },
        { id: "displaced", op: "add", type: "vec3", inputs: ["position", "offset"] },
        { id: "opacity", op: "constant", type: "f32", value: 0.5 },
        { id: "emissive", op: "constant", type: "vec3", value: [0.1, 0.2, 0.3] }
      ],
      outputs: { color: "color", normal: "normal", roughness: "rough", position: "displaced", opacity: "opacity", emissive: "emissive" }
    };
    const image = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    const spec = shaderGraph.material({ graph: litGraph, uniforms: { tint: [0.8, 0.4, 0.2, 0.6], roughness: 0.35, image }, transparent: true, fog: true });
    expect(spec.custom?.wgsl?.fragment).toContain("auraGraphDirect(");
    expect(spec.custom?.castShadow).toBe(true);
    const runtime = createCustomShaderMaterial(spec.custom!);
    const geometry = Geometry.texturedCube(1);
    const device = new MockRenderDevice();
    const environmentCube = graphCube("graph-scene-cube");
    try {
      expect(runtime.sources.glsl.fragment).toContain("vec3 auraGraphDirect(");
      expect(runtime.sources.glsl.fragment).toContain("a3dApplyEnvironmentFog(outColor.rgb, auraGraph_surfaceWorldPosition)");
      expect(runtime.sources.glsl.fragment).toContain("vec3 a3dEnvDiffuse(");
      expect(runtime.sources.glsl.fragment).toContain("float auraGraph_roughness = clamp(auraGraph_resource_roughness, 0.0, 1.0);");
      expect(runtime.sources.glsl.fragment).toContain("texture(auraGraph_resource_image, auraGraph_uv0)");
      expect(runtime.sources.glsl.fragment).toContain(".a) * (0.5)");
      expect(runtime.customDepthShaderKey).toBeDefined();
      const key = runtime.shaderKey;
      expect(applyCustomUniformWrites(runtime, new Map([["roughness", 0.7]]))).toBe(1);
      expect(runtime.shaderKey).toBe(key);
      device.beginFrame(32, 24);
      new ForwardPass({
        items: [{ geometry, material: runtime, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), label: "lit-graph" }],
        cameraPosition: [2, 3, 4],
        environmentLighting: { color: [0.4, 0.2, 0.1], intensity: 2, environmentProbe: { sh9: Float32Array.from({ length: 27 }, (_, i) => i + 1), specularCube: environmentCube, mipCount: 1 } as never },
        environmentFog: { mode: "exponential-squared", color: [0.1, 0.2, 0.3], near: 0, far: 100, density: 0.08 },
        lights: [{
          kind: "directional", color: [0.25, 0.5, 1], intensity: 3, position: [1, 2, 3], direction: [0, -1, 0],
          range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: new DirectionalLight("graph-key")
        }]
      }).execute({ device, width: 32, height: 24 });
      device.endFrame();
      const command = device.drawCommands[0];
      expect(device.drawCommands).toHaveLength(1);
      expect(command?.uniforms?.get("u_auraGraph_resource_roughness")).toBe(0.7);
      expect(command?.uniforms?.get("u_auraGraph_resource_tint")).toEqual([0.8, 0.4, 0.2, 0.6]);
      const sampled = command?.uniforms?.get("u_auraGraph_resource_image");
      expect(sampled).toBeInstanceOf(TextureBinding);
      expect((sampled as TextureBinding).texture).not.toBeNull();
      expect(command?.uniforms?.get("u_lightCount")).toBe(1);
      expect(Array.from((command?.uniforms?.get("u_lightData") as Float32Array).slice(0, 4))).toEqual([0.25, 0.5, 1, 3]);
      expect(command?.uniforms?.get("u_a3dEnvAmbient")).toEqual([0.8, 0.4, 0.2]);
      expect(command?.uniforms?.get("u_cameraPosition")).toEqual([2, 3, 4]);
    } finally { geometry.dispose(); runtime.dispose(); image.dispose(); environmentCube.dispose(); device.dispose(); }
  });

  it("carries physical graph channels, sampled resources and packed scene lights into a native-shaped WebGPU draw", async () => {
    const litGraph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [
        { name: "metal", kind: "uniform", type: "f32" },
        { name: "counter", kind: "uniform", type: "u32" },
        { name: "image", kind: "texture2d" }
      ], nodes: [
        { id: "metalValue", op: "uniform", type: "f32", resource: "metal" },
        { id: "counter", op: "uniform", type: "u32", resource: "counter" },
        { id: "exact", op: "constant", type: "u32", value: exactValue },
        { id: "selected", op: "equal", type: "bool", inputs: ["counter", "exact"] },
        { id: "zero", op: "constant", type: "f32", value: 0 },
        { id: "metal", op: "select", type: "f32", inputs: ["selected", "metalValue", "zero"] },
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "color", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
        { id: "rough", op: "constant", type: "f32", value: 0.4 }
      ], outputs: { color: "color", roughness: "rough", metalness: "metal" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const image = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 64, 255]) });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: litGraph, uniforms: { metal: 0.75, counter: exactValue, image }, backend: "wgsl", fog: true }).custom!);
    const geometry = Geometry.texturedCube(1);
    const environmentCube = graphCube("graph-gpu-scene-cube");
    try {
      const result = material.compile(device);
      expect(result.ok).toBe(true);
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toContain("u_lightData: array<vec4<f32>, 96>");
      expect(fragment).toContain("u_a3dEnvSh: array<vec4<f32>, 7>");
      expect(fragment).toContain("u_auraGraph_resource_counter: u32");
      expect(fragment).toContain("textureSample(u_auraGraph_resource_imageTexture, u_auraGraph_resource_imageSampler, auraGraph_uv0)");
      expect(fragment).toContain("auraGraph_metalness = clamp(select(0.0, aura.u_auraGraph_resource_metal");
      expect(fragment).toContain("auraGraphFog(auraGraph_color, input.surfaceWorldPosition, vec2<f32>(input.position.x, aura.u_resolution.y - input.position.y))");
      expect(fragment).toContain("aura.u_clusterViewportSize.y - input.position.y");
      const target = device.createRenderTarget({ width: 8, height: 6, depth: false });
      device.beginFrame(8, 6);
      device.setRenderTarget(target);
      const forward = {
        items: [{ geometry, material, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), label: "lit-graph-gpu" }],
        cameraPosition: [2, 3, 4],
        environmentLighting: { color: [0.4, 0.2, 0.1], intensity: 2, environmentProbe: { sh9: Float32Array.from({ length: 27 }, (_, i) => i + 1), specularCube: environmentCube, mipCount: 1 } as never },
        environmentFog: { mode: "exponential-squared", color: [0.1, 0.2, 0.3], near: 0, far: 100, density: 0.08 },
        lights: [{
          kind: "directional", color: [0.25, 0.5, 1], intensity: 3, position: [1, 2, 3], direction: [0, -1, 0],
          range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: new DirectionalLight("gpu-graph-key")
        }]
      } as const;
      new ForwardPass(forward).execute({ device, width: 8, height: 6 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      const bytes = mock.writes.find((write) => write.label === "lit-graph-gpu-portable-uniforms")?.bytes;
      expect(bytes).toBeDefined();
      // Check actual shader-visible fields instead of fixed offsets: adding a
      // transform or clipping packet must not reinterpret the packed values.
      const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
      const compiled = mock.modules.filter((source) => source.includes("@fragment") && source.includes("fn auraGraphDirect")).at(-1)!;
      const camera = portableFieldOffset(compiled, "u_cameraPosition"), viewport = portableFieldOffset(compiled, "u_resolution");
      const clipRange = portableFieldOffset(compiled, "u_a3dClipRange"), lightCount = portableFieldOffset(compiled, "u_lightCount");
      const lightData = portableFieldOffset(compiled, "u_lightData");
      expect([0, 4, 8].map((offset) => view.getFloat32(camera + offset, true))).toEqual([2, 3, 4]);
      expect([0, 4].map((offset) => view.getFloat32(viewport + offset, true))).toEqual([8, 6]);
      expect(view.getFloat32(clipRange, true)).toBe(0);
      expect(view.getFloat32(lightCount, true)).toBe(1);
      expect([0, 4, 8, 12].map((offset) => view.getFloat32(lightData + offset, true))).toEqual([0.25, 0.5, 1, 3]);
      const words = Array.from({ length: bytes!.byteLength / 4 }, (_, index) => view.getFloat32(index * 4, true));
      const shStart = words.findIndex((_, start) => Array.from({ length: 27 }, (__, i) => words[start + i] === i + 1).every(Boolean));
      expect(shStart).toBeGreaterThanOrEqual(0);
      expect(words[shStart + 27]).toBe(0);
      expect(Array.from({ length: bytes!.byteLength / 4 }, (_, index) => view.getUint32(index * 4, true))).toContain(exactValue);
      device.beginFrame(8, 6);
      device.setRenderTarget(target);
      new ForwardPass({ ...forward, projectionClipRange: "zero-to-one" }).execute({ device, width: 8, height: 6 });
      device.endFrame();
      const writes = mock.writes.filter((write) => write.label === "lit-graph-gpu-portable-uniforms");
      const zeroToOne = writes[writes.length - 1]!.bytes;
      expect(new DataView(zeroToOne.buffer, zeroToOne.byteOffset, zeroToOne.byteLength).getFloat32(clipRange, true)).toBe(1);
    } finally { geometry.dispose(); material.dispose(); image.dispose(); environmentCube.dispose(); device.dispose(); }
  });

  it("rejects missing graph geometry attributes and unsupported scene lighting", () => {
    const litGraph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.4 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: litGraph }).custom!);
    const device = new MockRenderDevice();
    const withoutNormals = Geometry.triangle();
    const withNormals = Geometry.litCube(1);
    const modelMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    try {
      expect(material.requiredAttributes).toEqual(["a_position", "a_normal"]);
      expect(material.graphLightingModel).toBe("metallic-roughness");
      expect(material.graphMaterial).toBe(true);
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [{ geometry: withoutNormals, material, modelMatrix }] }).execute({ device, width: 8, height: 8 })).toThrow(/missing attributes required by its material/);
      expect(() => new ForwardPass({
        items: [{ geometry: withNormals, material, modelMatrix }],
        lights: [{ kind: "rect-area", color: [1, 1, 1], intensity: 1, position: [0, 1, 0], direction: [0, -1, 0], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: new DirectionalLight("area") }]
      }).execute({ device, width: 8, height: 8 })).toThrow(/GRAPH_RECT_LIGHT_UNSUPPORTED|rectangular/i);
      expect(() => new ForwardPass({
        items: [{ geometry: withNormals, material, modelMatrix, skinning: { jointCount: 1, matrices: modelMatrix } }]
      }).execute({ device, width: 8, height: 8 })).toThrow(/skinn/i);
      const probe = { geometry: withNormals, material, modelMatrix, [Symbol.for("@aura3d/rendering/prd02-item-probe-bindings")]: { device, owner: {}, uniforms: {}, assignment: {} } };
      const volume = { geometry: withNormals, material, modelMatrix, [Symbol.for("@aura3d/rendering/prd02-item-irradiance-bindings")]: { device, owner: {}, uniforms: {}, volume: { textures: [] } } };
      expect(() => new ForwardPass({ items: [probe] }).execute({ device, width: 8, height: 8 })).toThrow(/reflection probe/i);
      expect(() => new ForwardPass({ items: [volume] }).execute({ device, width: 8, height: 8 })).toThrow(/irradiance volume/i);
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame();
    } finally { withoutNormals.dispose(); withNormals.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds selected probe cubes and irradiance volumes to a native-shaped graph draw", async () => {
    const lit: ShaderGraphDocument = { version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.4 }], outputs: { roughness: "rough" } };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const inspect = new MockRenderDevice();
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const geometry = Geometry.litCube(1);
    const probeCube = graphCube("graph-local-probe");
    const globalCube = graphCube("graph-global-probe");
    const fields = ["r", "g", "b"].map((name) => new Texture({ width: 1, height: 1, dimension: "2d-array", layers: 1, format: "rgba16f", label: `graph-volume-${name}`, data: new Uint16Array([0, 0, 0, 0x3c00]) }));
    const sampler = new Sampler({ minFilter: "nearest", magFilter: "nearest" });
    const cube = new TextureBinding({ name: "u_prd02ProbeCubeA", texture: probeCube, expectedDimension: "cube" });
    const emptyCube = new TextureBinding({ name: "u_prd02ProbeCubeB", required: false, expectedDimension: "cube" });
    const v4 = (a: number, b: number, c: number, d: number) => new Float32Array([a, b, c, d]);
    const probeUniforms = {
      u_prd02ProbeCubeA: cube, u_prd02ProbeCubeB: emptyCube,
      u_prd02ProbeCenterA: v4(0, 0, 0, 1), u_prd02ProbeCenterB: v4(0, 0, 0, 0),
      u_prd02ProbeOriginA: v4(1, 0, 0, 1), u_prd02ProbeOriginB: v4(0, 0, 0, 0),
      u_prd02ProbeHalfA: v4(2, 2, 2, 0), u_prd02ProbeHalfB: v4(0, 0, 0, 0), u_prd02ProbeWeights: v4(0.4, 0, 0.6, 1)
    };
    const volumeUniforms = {
      u_prd02IrradianceR: new TextureBinding({ name: "u_prd02IrradianceR", texture: fields[0], sampler, expectedDimension: "2d-array" }),
      u_prd02IrradianceG: new TextureBinding({ name: "u_prd02IrradianceG", texture: fields[1], sampler, expectedDimension: "2d-array" }),
      u_prd02IrradianceB: new TextureBinding({ name: "u_prd02IrradianceB", texture: fields[2], sampler, expectedDimension: "2d-array" }),
      u_prd02IrradianceMin: v4(-1, -1, -1, 0), u_prd02IrradianceMax: v4(1, 1, 1, 0), u_prd02IrradianceGrid: v4(1, 1, 1, 2)
    };
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const itemFor = (owner: typeof device | typeof inspect) => ({ geometry, material, modelMatrix: identity, label: "graph-probe-volume",
      [Symbol.for("@aura3d/rendering/prd02-item-probe-bindings")]: { device: owner, owner: {}, uniforms: probeUniforms, assignment: {} },
      [Symbol.for("@aura3d/rendering/prd02-item-irradiance-bindings")]: { device: owner, owner: {}, uniforms: volumeUniforms, volume: { textures: fields } } });
    const environmentLighting = { color: [0, 0, 0] as const, intensity: 1, environmentMapIntensity: 2, environmentMapSpecularIntensity: 3,
      environmentProbe: { sh9: new Float32Array(27).fill(0.25), specularCube: globalCube, mipCount: 1 } as never };
    try {
      inspect.beginFrame(8, 8);
      new ForwardPass({ items: [itemFor(inspect)], environmentLighting }).execute({ device: inspect, width: 8, height: 8 });
      const draw = inspect.drawCommands[0]!;
      expect(draw.shader!.reflection.uniforms.has("u_prd02ProbeCubeA")).toBe(true);
      expect(draw.shader!.reflection.uniforms.has("u_prd02IrradianceR")).toBe(true);
      expect((draw.uniforms!.get("u_prd02ProbeCubeB") as TextureBinding).texture).toBe(probeCube);
      expect(draw.uniforms!.get("u_a3dLocalProbeIntensity")).toBe(1);
      expect(draw.uniforms!.get("u_graphGlobalEnvCubeInfo")).toEqual([1, 3, 0, 0]);
      expect(draw.uniforms!.get("u_graphGlobalEnvCubeDiffuseIntensity")).toBe(2);
      expect((draw.uniforms!.get("u_a3dEnvSh") as Float32Array)[0]).toBe(0.5);
      inspect.endFrame();
      const target = device.createRenderTarget({ width: 8, height: 8, depth: false });
      device.beginFrame(8, 8); device.setRenderTarget(target);
      new ForwardPass({ items: [itemFor(device)], environmentLighting }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      for (const label of ["graph-local-probe", "graph-global-probe", "graph-volume-r", "graph-volume-g", "graph-volume-b"]) {
        expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === label))).toBe(true);
      }
      expect(mock.modules.some((source) => source.includes("auraGraphVolumeBlend") && source.includes("auraGraphProbeRadiance"))).toBe(true);
      target.dispose();
    } finally { geometry.dispose(); material.dispose(); probeCube.dispose(); globalCube.dispose(); for (const field of fields) field.dispose(); inspect.dispose(); device.dispose(); }
  });

  it("carries a graph storage texture through capability-gated native layouts", async () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "image", kind: "storage-texture", access: "read", format: "rgba8unorm", group: 2, binding: 1 }],
      nodes: [{ id: "coord", op: "constant", type: "vec2", value: [0, 0] }, { id: "pixel", op: "textureLoad", type: "vec4", resource: "image", inputs: ["coord"] }],
      outputs: { color: "pixel" }
    };
    for (const supported of [false, true]) {
      const mock = nativeDevice();
      const adapter = { requestDevice: async () => mock.native };
      const gpu: WebGPULike = { requestAdapter: async () => adapter, wgslLanguageFeatures: new Set(supported ? ["readonly_and_readwrite_storage_textures"] : []) };
      const device = await WebGPUDevice.create({ gpu, adapter, device: mock.native });
      const image = new Texture({ width: 1, height: 1, format: "rgba8", usage: ["storage", "copy-dst"], label: `graph-storage-${supported}` });
      const material = createCustomShaderMaterial(shaderGraph.material({ graph, storage: { image: { kind: "storage-texture", texture: image } } }).custom!);
      const geometry = Geometry.triangle();
      const target = device.createRenderTarget({ width: 4, height: 4, depth: false });
      const modelMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      try {
        device.beginFrame(4, 4); device.setRenderTarget(target);
        const draw = () => new ForwardPass({ items: [{ geometry, material, modelMatrix }] }).execute({ device, width: 4, height: 4 });
        if (supported) {
          expect(draw).not.toThrow();
          expect(mock.draws()).toBe(1);
          expect(mock.layouts.some((layout) => layout.entries.some((entry) => (entry as { storageTexture?: { access: string } }).storageTexture?.access === "read-only"))).toBe(true);
          expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === "graph-storage-true"))).toBe(true);
        } else {
          expect(draw).toThrow(/readonly_and_readwrite_storage_textures/i);
          expect(mock.draws()).toBe(0);
        }
        device.endFrame();
      } finally { geometry.dispose(); material.dispose(); target.dispose(); image.dispose(); device.dispose(); }
    }
  });

  it("selects matching four- and eight-influence graph stages and forwards the live palette", () => {
    const displaced: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "offset", kind: "uniform", type: "vec3" }], nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "offset", op: "uniform", type: "vec3", resource: "offset" },
        { id: "placed", op: "add", type: "vec3", inputs: ["position", "offset"] },
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" }
      ], outputs: { position: "placed", normal: "normal" }
    };
    const spec = shaderGraph.material({ graph: displaced, uniforms: { offset: [0, 0.25, 0] } }).custom!;
    const material = createCustomShaderMaterial(spec);
    const twin = createCustomShaderMaterial(spec);
    const device = new MockRenderDevice();
    const four = skinnedGeometry(false);
    const eight = skinnedGeometry(true);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const translated = new Float32Array(identity);
    translated[12] = 2;
    const palette = new Float32Array([...identity, ...translated]);
    const forwardKeys = material.graphSkinningShaderKeys!;
    const depthKeys = material.graphSkinningDepthShaderKeys!;
    try {
      for (const kind of ["four", "eight"] as const) {
        const forward = globalShaderSource(forwardKeys[kind])!;
        const depth = globalShaderSource(depthKeys[kind])!;
        for (const vertex of [forward.vertex, depth.vertex]) {
          expect(vertex.indexOf("vec3 auraGraph_deformedPosition")).toBeLessThan(vertex.indexOf("vec3 auraGraph_positionLocal"));
          expect(vertex).toContain(`a3dSkinMatrix${kind === "four" ? "4" : "8"}(a_joints, a_weights`);
          expect(vertex).toContain("u_jointMatrices[96]");
        }
        for (const vertex of [forward.webgpu!.vertex, depth.webgpu!.vertex]) {
          expect(vertex).toContain("textureLoad(u_jointPaletteTextureTexture");
          expect(vertex.indexOf("let auraGraph_deformedPosition")).toBeLessThan(vertex.indexOf("let auraGraph_positionLocal"));
          expect(vertex.includes("@location(8) joints1")).toBe(kind === "eight");
        }
      }
      device.beginFrame(8, 8);
      for (const [kind, geometry, extraInfluences] of [["four", four, false], ["eight", eight, true]] as const) {
        const skinning = { jointCount: 2, matrices: palette, extraInfluences };
        const item = { geometry, material, modelMatrix: identity, skinning, label: kind };
        new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
        new DepthPass({ casters: [item], viewProjectionMatrix: identity }).execute({ device, width: 8, height: 8 });
      }
      expect(device.drawCommands.map((draw) => draw.shader?.label)).toEqual([forwardKeys.four, depthKeys.four, forwardKeys.eight, depthKeys.eight]);
      for (const draw of device.drawCommands) {
        expect(draw.uniforms?.get("u_jointCount")).toBe(2);
        expect(draw.uniforms?.get("u_jointMatrices")).toEqual(palette);
        expect(draw.uniforms?.get("u_jointPaletteMode")).toBe(0);
        expect(draw.uniforms?.get("u_auraGraph_resource_offset")).toEqual([0, 0.25, 0]);
      }
      device.endFrame();
      material.dispose();
      expect(globalShaderSource(forwardKeys.four)).toBeDefined();
      twin.dispose();
      expect(globalShaderSource(forwardKeys.four)).toBeUndefined();
      expect(globalShaderSource(depthKeys.eight)).toBeUndefined();
    } finally { four.dispose(); eight.dispose(); material.dispose(); twin.dispose(); device.dispose(); }
  });

  it("expands skinned eight-influence graph instances consistently in forward and depth", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "position", roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = skinnedGeometry(true);
    const device = new MockRenderDevice();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const translated = new Float32Array(identity); translated[12] = 3;
    const item = { geometry, material, modelMatrix: identity, modelViewProjectionMatrix: identity,
      instanceTransforms: new Float32Array([...identity, ...translated]), skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...identity]), extraInfluences: true } };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(4);
      for (const [index, draw] of device.drawCommands.entries()) {
        expect(draw.instanceCount ?? 1).toBe(1);
        expect(draw.shader!.reflection.attributes.has("a_joints1")).toBe(true);
        expect((draw.uniforms!.get("u_modelMatrix") as Float32Array)[12]).toBe(index % 2 === 0 ? 0 : 3);
        expect(draw.uniforms!.get("u_jointCount")).toBe(2);
      }
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses geometry-local clipping before noncommuting instance transforms in graph forward and depth", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "offset", op: "constant", type: "vec3", value: [0.25, 0, 0] },
      { id: "moved", op: "add", type: "vec3", inputs: ["position", "offset"] },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "moved", roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = skinnedGeometry(true), device = new MockRenderDevice();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const model = new Float32Array(identity); model[12] = 5;
    const camera = new Float32Array(identity); camera[0] = 3; camera[12] = 2;
    const geometryMatrix = new Float32Array(identity); geometryMatrix[0] = 2; geometryMatrix[5] = 3;
    const secondInstance = new Float32Array(identity); secondInstance[12] = 7;
    const secondJoint = new Float32Array(identity); secondJoint[12] = 0.5;
    const global = { planes: [[1, 0, 0, -12] as const], clipShadows: true };
    const local = { planes: [[1, 0, 0, -2.75] as const], space: "local" as const, clipShadows: true };
    const item = { geometry, material, modelMatrix: model, geometryMatrix,
      instanceTransforms: new Float32Array([...identity, ...secondInstance]),
      skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...secondJoint]), extraInfluences: true },
      globalClipping: global, materialClipping: local };
    const transform = (matrix: ArrayLike<number>, point: readonly [number, number, number, number]): [number, number, number, number] =>
      [0, 1, 2, 3].map((row) => [0, 1, 2, 3].reduce((sum, column) => sum + matrix[column * 4 + row]! * point[column]!, 0)) as [number, number, number, number];
    try {
      const forward = globalShaderSource(material.graphSkinningVariant(8, "float", "float", "forward")!)!;
      const depth = globalShaderSource(material.graphSkinningVariant(8, "float", "float", "depth")!)!;
      for (const source of [forward.vertex, depth.vertex]) {
        expect(source).toContain("u_geometryMatrix * vec4(auraGraph_finalPosition, 1.0)");
        expect(source).toContain("modelViewProjectionMatrix * auraGraph_geometryLocal");
        expect(source.indexOf("auraGraph_deformedPosition =")).toBeLessThan(source.indexOf("auraGraph_finalPosition ="));
        expect(source.indexOf("auraGraph_finalPosition =")).toBeLessThan(source.indexOf("auraGraph_geometryLocal ="));
      }
      for (const source of [forward.webgpu!.vertex, depth.webgpu!.vertex]) {
        expect(source).toContain("aura.u_geometryMatrix * vec4<f32>(auraGraph_finalPosition, 1.0)");
        expect(source).toContain("aura.u_modelViewProjection * auraGraph_geometryLocal");
        expect(source).toContain("auraGraph_geometryCofactors * auraGraph_geometryNormal");
      }
      expect(forward.fragment).toContain("auraGraphIsClipped(auraGraph_clipLocal, auraGraph_clipWorld)");
      expect(forward.webgpu!.fragment).toContain("auraGraphIsClipped(input.graphClipLocal, input.graphClipWorld)");
      expect(depth.vertex).toContain("u_a3dClipModel * auraGraph_geometryLocal");
      expect(depth.webgpu!.vertex).toContain("output.graphDepthLocal = auraGraph_geometryLocal.xyz;");
      const binding = createClippingBinding({ global, material: local, pass: "depth", backend: "mock" });
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item], cameraViewProjectionMatrix: camera }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], viewProjectionMatrix: camera, clippingPass: "depth" }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(4);
      for (const [index, draw] of device.drawCommands.entries()) {
        expect(Array.from(draw.uniforms!.get("u_geometryMatrix") as ArrayLike<number>)).toEqual(Array.from(geometryMatrix));
        expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(2);
        expect(Array.from(draw.uniforms?.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
        const localPosition = transform(draw.uniforms!.get("u_geometryMatrix") as Float32Array, [1.5, 0, 0, 1]);
        const world = transform(draw.uniforms!.get(index < 2 ? "u_modelMatrix" : "u_a3dClipModel") as Float32Array, localPosition);
        const raster = transform(draw.uniforms!.get("u_modelViewProjection") as Float32Array, localPosition);
        expect(localPosition).toEqual([3, 0, 0, 1]);
        expect(world).toEqual([index % 2 === 0 ? 8 : 15, 0, 0, 1]);
        expect(raster).toEqual([index % 2 === 0 ? 26 : 47, 0, 0, 1]);
        expect(clippingRetainsPoint(binding, [world[0], world[1], world[2]], [localPosition[0], localPosition[1], localPosition[2]])).toBe(index % 2 === 1);
      }
      new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      const plain = device.drawCommands.at(-1)!;
      expect(plain.uniforms?.get("u_a3dClipGroupCount")).toBe(0);
      expect(Array.from(plain.uniforms!.get("u_geometryMatrix") as ArrayLike<number>)).toEqual(Array.from(identity));
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("packs graph geometry and clipping for native-shaped forward and depth draws, then clears clipping", async () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "offset", op: "constant", type: "vec3", value: [0.25, 0, 0] },
      { id: "moved", op: "add", type: "vec3", inputs: ["position", "offset"] },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "moved", roughness: "rough" } };
    const mock = nativeDevice(), device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1), target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const geometryMatrix = new Float32Array(identity); geometryMatrix[0] = 2; geometryMatrix[5] = 3;
    const global = { planes: [[1, 0, 0, -12] as const], clipShadows: true };
    const local = { planes: [[1, 0, 0, -2.75] as const], space: "local" as const, clipShadows: true };
    const item = { geometry, material, modelMatrix: identity, modelViewProjectionMatrix: identity, geometryMatrix,
      globalClipping: global, materialClipping: local, label: "graph-geometry-native" };
    try {
      device.beginFrame(8, 8); device.setRenderTarget(target);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], clippingPass: "depth" }).execute({ device, width: 8, height: 8 });
      new ForwardPass({ items: [{ geometry, material, modelMatrix: identity, label: "graph-geometry-reset" }] }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(3);
      const forwardModule = mock.modules.find((source) => source.includes("@fragment") && source.includes("auraGraphIsClipped"))!;
      const depthModule = mock.modules.find((source) => source.includes("@vertex") && source.includes("output.graphDepthLocal"))!;
      const forwardBytes = mock.writes.find((write) => write.label === "graph-geometry-native-portable-uniforms")!.bytes;
      const depthBytes = mock.writes.find((write) => write.label === "graph-geometry-native:custom-depth-portable-uniforms")!.bytes;
      const resetBytes = mock.writes.find((write) => write.label === "graph-geometry-reset-portable-uniforms")!.bytes;
      for (const [module, bytes] of [[forwardModule, forwardBytes], [depthModule, depthBytes]] as const) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const matrix = portableFieldOffset(module, "u_geometryMatrix"), count = portableFieldOffset(module, "u_a3dClipGroupCount");
        const planes = portableFieldOffset(module, "u_a3dClipPlanes"), groups = portableFieldOffset(module, "u_a3dClipGroups");
        expect(Array.from({ length: 16 }, (_, index) => view.getFloat32(matrix + index * 4, true))).toEqual(Array.from(geometryMatrix));
        expect(view.getFloat32(count, true)).toBe(2);
        expect(Array.from({ length: 8 }, (_, index) => view.getFloat32(planes + index * 4, true))).toEqual([1, 0, 0, -12, 1, 0, 0, -2.75]);
        expect(Array.from({ length: 8 }, (_, index) => view.getFloat32(groups + index * 4, true))).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
      }
      const reset = new DataView(resetBytes.buffer, resetBytes.byteOffset, resetBytes.byteLength);
      const matrix = portableFieldOffset(forwardModule, "u_geometryMatrix");
      expect(Array.from({ length: 16 }, (_, index) => reset.getFloat32(matrix + index * 4, true))).toEqual(Array.from(identity));
      expect(reset.getFloat32(portableFieldOffset(forwardModule, "u_a3dClipGroupCount"), true)).toBe(0);
    } finally { target.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses matching cull states for mirrored geometry and mixed-sign graph instances", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "position", roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1), device = new MockRenderDevice();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const geometryMatrix = new Float32Array(identity); geometryMatrix[0] = -2; geometryMatrix[5] = 3;
    const mirrored = new Float32Array(identity); mirrored[0] = -1;
    const item = { geometry, material, modelMatrix: identity, geometryMatrix,
      instanceTransforms: new Float32Array([...identity, ...mirrored]), globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true } };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], clippingPass: "depth" }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(4);
      expect(device.drawCommands.map((draw) => draw.renderState?.cullMode)).toEqual(["front", "back", "front", "back"]);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("keeps storage-driven graph displacement bound in clipped forward and depth draws", async () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", resources: [
      { name: "offsets", kind: "storage-buffer", type: "vec3", access: "read" }
    ], nodes: [
      { id: "index", op: "constant", type: "u32", value: 0 },
      { id: "offset", op: "storageLoad", type: "vec3", resource: "offsets", inputs: ["index"] },
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "moved", op: "add", type: "vec3", inputs: ["position", "offset"] },
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { position: "moved", roughness: "rough" } };
    const mock = nativeDevice(), device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const storage = device.createBuffer("storage", 16), geometry = Geometry.litCube(1);
    const material = createCustomShaderMaterial(shaderGraph.material({ graph, backend: "wgsl", storage: { offsets: { kind: "storage-buffer", buffer: storage } } }).custom!);
    const target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const geometryMatrix = new Float32Array(identity); geometryMatrix[0] = 2;
    const item = { geometry, material, geometryMatrix, modelMatrix: identity, modelViewProjectionMatrix: identity,
      globalClipping: { planes: [[1, 0, 0, 0] as const], clipShadows: true }, label: "graph-storage-clipped" };
    try {
      device.beginFrame(8, 8); device.setRenderTarget(target);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], clippingPass: "depth" }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      const nativeBuffer = device.getNativeStorageBuffer(storage);
      const storageGroups = mock.groups.filter((group) => group.entries.some((entry) =>
        (entry.resource as { buffer?: unknown }).buffer === nativeBuffer));
      expect(storageGroups).toHaveLength(2);
      expect(storageGroups.every((group) => group.entries.some((entry) => entry.binding === 0 && (entry.resource as { buffer?: unknown }).buffer === nativeBuffer))).toBe(true);
      expect(globalShaderSource(material.customDepthShaderKey!)!.webgpu!.storageBindings).toEqual([
        expect.objectContaining({ kind: "storage-buffer", group: 1, binding: 0, visibility: "vertex", access: "read" })
      ]);
      expect(storage.disposed).toBe(false);
    } finally { target.dispose(); geometry.dispose(); material.dispose(); storage.dispose(); device.dispose(); }
  });

  it("submits a full reachable struct-storage graph with its index uniform in forward and depth", async () => {
    const nodes: ShaderGraphDocument["nodes"][number][] = [
      { id: "slot", op: "uniform", type: "u32", resource: "slot" },
      { id: "record", op: "storageLoad", type: "struct:Record", resource: "records", inputs: ["slot"] },
      { id: "offset", op: "structField", type: "vec3", name: "offset", inputs: ["record"] },
      { id: "alpha", op: "structField", type: "f32", name: "alpha", inputs: ["record"] },
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "moved", op: "add", type: "vec3", inputs: ["position", "offset"] }
    ];
    let opacity = "alpha";
    while (nodes.length < 512) {
      const id = `step${nodes.length}`;
      nodes.push({ id, op: "oneMinus", type: "f32", inputs: [opacity] });
      opacity = id;
    }
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", alphaTest: 0.4,
      structs: [{ name: "Record", fields: [{ name: "offset", type: "vec3" }, { name: "alpha", type: "f32" }] }],
      resources: [
        { name: "records", kind: "storage-buffer", type: "struct:Record", access: "read" },
        { name: "slot", kind: "uniform", type: "u32" }
      ],
      nodes, outputs: { position: "moved", opacity }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const storage = device.createBuffer("storage", 64), geometry = Geometry.triangle();
    const spec = shaderGraph.material({ graph, backend: "wgsl", storage: { records: { kind: "storage-buffer", buffer: storage } }, uniforms: { slot: 1 } }).custom!;
    const material = createCustomShaderMaterial(spec);
    const target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const item = { geometry, material, modelMatrix: identity, modelViewProjectionMatrix: identity, label: "graph-struct-limit" };
    try {
      expect(material.customDiagnostics.some((line) => line.includes("CUSTOM_UNIFORM_UNUSED") && line.includes("slot"))).toBe(false);
      device.beginFrame(8, 8); device.setRenderTarget(target);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], clippingPass: "depth" }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      const nativeBuffer = device.getNativeStorageBuffer(storage);
      expect(mock.groups.filter((group) => group.entries.some((entry) =>
        (entry.resource as { buffer?: unknown }).buffer === nativeBuffer))).toHaveLength(2);
      for (const key of [material.shaderKey, material.customDepthShaderKey!]) {
        const source = globalShaderSource(key)!.webgpu!;
        expect(source.vertex).toContain("auraGraph_resource_records[aura.u_auraGraph_resource_slot]");
        expect(source.fragment).toContain("auraGraph_resource_records[aura.u_auraGraph_resource_slot]");
        expect(source.storageBindings).toEqual([expect.objectContaining({ visibility: "vertex-fragment", access: "read" })]);
      }
      const source = mock.modules.find((entry) => entry.includes("@fragment") && entry.includes("u_auraGraph_resource_slot: u32"))!;
      const bytes = mock.writes.find((entry) => entry.label === "graph-struct-limit-portable-uniforms")?.bytes;
      expect(bytes).toBeDefined();
      expect(new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength).getUint32(portableFieldOffset(source, "u_auraGraph_resource_slot"), true)).toBe(1);
    } finally { target.dispose(); geometry.dispose(); material.dispose(); storage.dispose(); device.dispose(); }
  });

  it("selects the scoped contact mask for the exact graph light and rechecks its lifetime", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "rough", op: "constant", type: "f32", value: 0.5 }
    ], outputs: { roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1), skinned = skinnedGeometry(true);
    const device = new MockRenderDevice();
    const target = createContactShadowMaskTarget(device, 4, 4);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const light = { kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const,
      direction: [0, -1, 0] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("graph-contact") };
    const other = { ...light, source: new DirectionalLight("same-direction-other") };
    const frame = { device, width: 8, height: 8, postScopeId: {}, viewId: "graph-main", frameIndex: 4, timeSeconds: 0, blackboard: new Map(), rasterViewportIsFull: true,
      camera: { viewProjectionMatrix: identity, position: [0, 0, 1] } } as unknown as FrameContributorContext;
    const publication = { texture: target.colorTexture, width: 8, height: 8, strength: 0.4, cameraPosition: [0, 0, 1] as const, sourceLight: light.source };
    const item = { geometry, material, modelMatrix: identity, label: "graph-contact" };
    try {
      device.beginFrame(8, 8);
      frame.blackboard.set("prd02.contactShadowMask", target.colorTexture);
      setContactShadowMask(device, publication, frame, target);
      expect(material.graphDisplaced).toBe(false);
      new ForwardPass({ items: [item], lights: [other, light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      const active = device.drawCommands[0]!;
      expect(active.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(true);
      expect((active.uniforms!.get("u_contactShadowMask") as TextureBinding).texture).toBe(target.colorTexture);
      expect(active.uniforms!.get("u_contactShadowLightIndex")).toBe(1);
      expect(active.uniforms!.get("u_contactShadowMaskStrength")).toBe(0.4);
      expect(active.uniforms!.get("u_contactShadowMaskViewport")).toEqual([8, 8]);
      const inactiveItems = [
        { item: { ...item, receiveShadow: false }, frame },
        { item, frame: { ...frame, frameIndex: 5 } },
        { item, frame: { ...frame, viewId: "other" } },
        { item, frame: { ...frame, postScopeId: {} } },
        { item, frame: { ...frame, timeSeconds: 3 } },
        { item, frame: { ...frame, camera: { ...frame.camera!, position: [1, 0, 0] as const } } },
        { item, frame: { ...frame, rasterViewportIsFull: false } },
        { item, frame: { ...frame, blackboard: new Map([["prd02.contactShadowMask", target.colorTexture]]) } }
      ];
      for (const variant of inactiveItems) {
        new ForwardPass({ items: [variant.item], lights: [other, light], frameContext: variant.frame }).execute({ device, width: 8, height: 8 });
        expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
      }
      const differentCamera = new Float32Array(identity); differentCamera[12] = 2;
      new ForwardPass({ items: [item], lights: [light], frameContext: frame, cameraViewProjectionMatrix: differentCamera }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
      new ForwardPass({ items: [item], lights: [light], frameContext: frame, cameraPosition: [1, 0, 1] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
      new ForwardPass({ items: [item], lights: [light], frameContext: frame, timeSeconds: 1 }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
      new ForwardPass({ items: [item], lights: [light], frameContext: frame }).execute({ device, width: 16, height: 8 });
      expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
      expect(() => new ForwardPass({ items: [item], lights: [light, light], frameContext: frame }).execute({ device, width: 8, height: 8 })).toThrow(/light identity is ambiguous/i);
      const points = Array.from({ length: 16 }, (_, index) => ({ ...light, kind: "point" as const, castsShadow: false,
        position: [index, 0, 0] as const, source: new PointLight(`graph-contact-point-${index}`) }));
      new ForwardPass({ items: [item], lights: [...points, light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.at(-1)!.uniforms!.get("u_contactShadowLightIndex")).toBe(16);
      const translated = new Float32Array(identity); translated[12] = 3;
      new ForwardPass({ items: [{ ...item, geometry: skinned, instanceTransforms: new Float32Array([...identity, ...translated]),
        skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...identity]), extraInfluences: true } }], lights: [light], frameContext: frame })
        .execute({ device, width: 8, height: 8 });
      const instances = device.drawCommands.slice(-2);
      expect(instances).toHaveLength(2);
      expect(instances.map((draw) => (draw.uniforms!.get("u_modelMatrix") as Float32Array)[12])).toEqual([0, 3]);
      expect(instances.every((draw) => draw.shader!.reflection.attributes.has("a_joints1") && draw.uniforms!.get("u_contactShadowLightIndex") === 0)).toBe(true);
      const displaced: ShaderGraphDocument = { ...graph, nodes: [...graph.nodes,
        { id: "position", op: "input", type: "vec3", name: "positionLocal" }], outputs: { ...graph.outputs, position: "position" } };
      const displacedSpec = shaderGraph.material({ graph: displaced }).custom!;
      for (const castShadow of [true, false]) {
        const displacedMaterial = createCustomShaderMaterial({ ...displacedSpec, castShadow });
        try {
          expect(displacedMaterial.graphDisplaced).toBe(true);
          expect(typeof displacedMaterial.customDepthShaderKey === "string").toBe(castShadow);
          const receiver = { ...item, material: displacedMaterial };
          expect(() => new ForwardPass({ items: [receiver], lights: [light], frameContext: frame })
            .execute({ device, width: 8, height: 8 })).toThrow(/displaced graph contact receivers/i);
          new ForwardPass({ items: [{ ...receiver, receiveShadow: false }], lights: [light], frameContext: frame })
            .execute({ device, width: 8, height: 8 });
          expect(device.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_contactShadowMask")).toBe(false);
        } finally { displacedMaterial.dispose(); }
      }
      for (const state of [{ transparent: true }, { blending: "additive" as const }, { depthWrite: false }, { depthTest: false }]) {
        const unsafeMaterial = createCustomShaderMaterial(shaderGraph.material({ graph, ...state }).custom!);
        try {
          expect(() => new ForwardPass({ items: [{ ...item, material: unsafeMaterial }], lights: [light], frameContext: frame })
            .execute({ device, width: 8, height: 8 })).toThrow(/opaque receiver matching the camera depth prepass/i);
        } finally { unsafeMaterial.dispose(); }
      }
      const reloaded = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!, "graph-contact-reloaded");
      try {
        const sources = reloaded.sources;
        expect(reloaded.graphSourcesPristine).toBe(true);
        expect(() => reloaded.hotReload({ ...sources, glsl: { ...sources.glsl, fragment: "" } })).toThrow(PortableShaderCompilationError);
        expect(reloaded.graphSourcesPristine).toBe(true);
        reloaded.hotReload({ ...sources, glsl: { ...sources.glsl, vertex: `${sources.glsl.vertex}\n// caller supplied replacement` } });
        expect(reloaded.graphSourcesPristine).toBe(false);
        expect(() => new ForwardPass({ items: [{ ...item, material: reloaded }], lights: [light], frameContext: frame })
          .execute({ device, width: 8, height: 8 })).toThrow(/graph.*contact.*(depth|source)/i);
        new ForwardPass({ items: [{ ...item, material: reloaded, receiveShadow: false }], lights: [light], frameContext: frame })
          .execute({ device, width: 8, height: 8 });
      } finally { reloaded.dispose(); }
      const count = device.drawCommands.length;
      const remove = registerForwardDrawHook({ id: "graph-contact-expire", bind: () => frame.blackboard.delete("prd02.contactShadowMask") });
      try {
        expect(() => new ForwardPass({ items: [item], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 })).toThrow(/stable forward providers/i);
      } finally { remove(); }
      expect(frame.blackboard.get("prd02.contactShadowMask")).toBe(target.colorTexture);
      const expiringGeometry = Geometry.litCube(1);
      const createBuffer = device.createBuffer.bind(device);
      const expire = vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
        frame.blackboard.delete("prd02.contactShadowMask");
        return createBuffer(...args);
      });
      try {
        expect(() => new ForwardPass({ items: [{ ...item, geometry: expiringGeometry }], lights: [light], frameContext: frame })
          .execute({ device, width: 8, height: 8 })).toThrow(/contact shadow.*changed/i);
      } finally { expire.mockRestore(); expiringGeometry.dispose(); }
      expect(device.drawCommands).toHaveLength(count);
      device.endFrame();
    } finally { setContactShadowMask(device, undefined); geometry.dispose(); skinned.dispose(); material.dispose(); target.dispose(); device.dispose(); }
  });

  it("submits a scoped contact graph mask to a native-shaped WebGPU draw", async () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" } };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const checkedDraw = vi.spyOn(device, "drawChecked");
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1), skinned = skinnedGeometry(true);
    const maskTarget = createContactShadowMaskTarget(device, 4, 4);
    const output = device.createRenderTarget({ width: 8, height: 8, depth: false });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const light = { kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const,
      direction: [0, -1, 0] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("native-contact") };
    const frame = { device, width: 8, height: 8, postScopeId: {}, viewId: "native-graph", frameIndex: 3, timeSeconds: 0, blackboard: new Map(), rasterViewportIsFull: true,
      camera: { viewProjectionMatrix: identity, position: [0, 0, 1] } } as unknown as FrameContributorContext;
    try {
      device.beginFrame(8, 8); device.setRenderTarget(output);
      frame.blackboard.set("prd02.contactShadowMask", maskTarget.colorTexture);
      setContactShadowMask(device, { texture: maskTarget.colorTexture, width: 8, height: 8, strength: 0.6, cameraPosition: [0, 0, 1], sourceLight: light.source }, frame, maskTarget);
      new ForwardPass({ items: [{ geometry, material, modelMatrix: identity }], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      expect(checkedDraw).toHaveBeenCalledTimes(1);
      expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === maskTarget.colorTexture.label))).toBe(true);
      expect(mock.modules.some((source) => source.includes("auraGraphContactShadow(contactScreen)") && source.includes("input.position.xy"))).toBe(true);
      const translated = new Float32Array(identity); translated[12] = 3;
      device.beginFrame(8, 8); device.setRenderTarget(output);
      new ForwardPass({ items: [{ geometry: skinned, material, modelMatrix: identity, instanceTransforms: new Float32Array([...identity, ...translated]),
        skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...identity]), extraInfluences: true } }], lights: [light], frameContext: frame })
        .execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(3);
      expect(checkedDraw).toHaveBeenCalledTimes(3);
      expect(mock.modules.some((source) => source.includes("@location(8) joints1: vec4<f32>"))).toBe(true);
      device.beginFrame(8, 8); device.setRenderTarget(output);
      checkedDraw.mockImplementationOnce(() => { throw new Error("injected checked submission failure"); });
      expect(() => new ForwardPass({ items: [{ geometry, material, modelMatrix: identity }], lights: [light], frameContext: frame })
        .execute({ device, width: 8, height: 8 })).toThrow(/injected checked submission failure/);
      device.endFrame();
      expect(mock.draws()).toBe(3);
      expect(checkedDraw).toHaveBeenCalledTimes(4);
      maskTarget.dispose();
      device.beginFrame(8, 8); device.setRenderTarget(output);
      new ForwardPass({ items: [{ geometry, material, modelMatrix: identity }], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(4);
      expect(checkedDraw).toHaveBeenCalledTimes(4);
      expect(mock.modules.some((source) => source.includes("@fragment") && source.includes("fn auraGraphDirect") && !source.includes("u_contactShadowMaskTexture"))).toBe(true);
    } finally { checkedDraw.mockRestore(); setContactShadowMask(device, undefined); geometry.dispose(); skinned.dispose(); material.dispose(); maskTarget.dispose(); output.dispose(); device.dispose(); }
  });

  it("packs uniform and large texture palettes for native-shaped graph forward and depth draws", async () => {
    const displaced: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "offset", op: "constant", type: "vec3", value: [0, 0.25, 0] },
        { id: "placed", op: "add", type: "vec3", inputs: ["position", "offset"] },
        { id: "rough", op: "constant", type: "f32", value: 0.5 }
      ], outputs: { position: "placed", roughness: "rough" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: displaced }).custom!);
    const four = skinnedGeometry(false);
    const eight = skinnedGeometry(true);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "skin-output" });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const small = new Float32Array([...identity, ...identity]);
    small[12] = 3.5;
    const large = new Float32Array(97 * 16);
    for (let index = 0; index < 97; index += 1) large.set(identity, index * 16);
    large[12] = 4.5;
    large[96 * 16 + 12] = 9.25;
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      for (const [label, geometry, matrices, extraInfluences] of [["skin-four", four, small, false], ["skin-eight-large", eight, large, true]] as const) {
        const item = { geometry, material, modelMatrix: identity, skinning: { jointCount: matrices.length / 16, matrices, extraInfluences }, label };
        new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
        new DepthPass({ casters: [item], viewProjectionMatrix: identity }).execute({ device, width: 8, height: 8 });
      }
      device.endFrame();
      expect(mock.draws()).toBe(4);
      expect(mock.modules.some((source) => source.includes("@location(8) joints1: vec4<f32>"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("u_jointMatrices: array<mat4x4<f32>, 96>"))).toBe(true);
      const smallBytes = mock.writes.find((write) => write.label === "skin-four-portable-uniforms")!.bytes;
      const smallView = new DataView(smallBytes.buffer, smallBytes.byteOffset, smallBytes.byteLength);
      expect(Array.from({ length: smallBytes.byteLength / 4 }, (_, i) => smallView.getFloat32(i * 4, true))).toContain(3.5);
      const paletteUploads = mock.textureWrites.filter((write) => write.label === "aura3d-skinning-palette-97-joints");
      expect(paletteUploads).toHaveLength(2);
      for (const upload of paletteUploads) {
        const view = new DataView(upload.bytes.buffer, upload.bytes.byteOffset, upload.bytes.byteLength);
        expect(view.getFloat32(12 * 4, true)).toBe(4.5);
        expect(view.getFloat32((96 * 16 + 12) * 4, true)).toBe(9.25);
      }
      expect(mock.layouts.some((layout) => layout.entries.some((entry) => entry.texture?.sampleType === "unfilterable-float"))).toBe(true);
      expect(mock.layouts.some((layout) => layout.entries.some((entry) => entry.sampler?.type === "non-filtering"))).toBe(true);
    } finally { target.dispose(); four.dispose(); eight.dispose(); material.dispose(); device.dispose(); }
  });

  it("releases transient graph skinning palettes after successful and failed forward draws", () => {
    const lit: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const geometry = skinnedGeometry(false);
    const device = new MockRenderDevice();
    const matrices = new Float32Array(97 * 16);
    for (let joint = 0; joint < 97; joint += 1) for (let axis = 0; axis < 4; axis += 1) matrices[joint * 16 + axis * 5] = 1;
    const item = { geometry, material, skinning: { jointCount: 97, matrices }, label: "palette-cleanup" };
    const seen: Texture[] = [];
    const originalDraw = device.draw.bind(device);
    const draw = vi.spyOn(device, "draw").mockImplementation((command) => {
      seen.push((command.uniforms?.get("u_jointPaletteTexture") as TextureBinding).texture!);
      originalDraw(command);
    });
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.disposed).toBe(true);
      draw.mockImplementation((command) => {
        seen.push((command.uniforms?.get("u_jointPaletteTexture") as TextureBinding).texture!);
        throw new Error("injected draw failure");
      });
      expect(() => new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 })).toThrow(/injected draw failure/);
      expect(seen).toHaveLength(2);
      expect(seen[1]!.disposed).toBe(true);
      device.endFrame();
    } finally { draw.mockRestore(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("selects matching mixed unsigned and signed joint shaders for native-shaped forward and depth draws", async () => {
    const mixed: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "rough", op: "constant", type: "f32", value: 0.5 }
      ], outputs: { position: "position", roughness: "rough" }
    };
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 28 },
      { semantic: "joints1", components: 4, offset: 44, type: "int16", integer: true },
      { semantic: "weights1", components: 4, offset: 52 }
    ], 68);
    const buffer = new VertexBuffer(format, 3);
    for (let index = 0; index < 3; index += 1) {
      buffer.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
      buffer.setAttribute(index, "normal", [0, 0, 1]);
      buffer.setAttribute(index, "joints", [0, 0, 0, 0]);
      buffer.setAttribute(index, "weights", [0.5, 0, 0, 0]);
      buffer.setAttribute(index, "joints1", [1, 0, 0, 0]);
      buffer.setAttribute(index, "weights1", [0.5, 0, 0, 0]);
    }
    const geometry = new Geometry(buffer, null, "triangles");
    const spec = shaderGraph.material({ graph: mixed }).custom!;
    const material = createCustomShaderMaterial(spec);
    const twin = createCustomShaderMaterial(spec);
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const skinning = { jointCount: 2, matrices: new Float32Array([...identity, ...identity]), extraInfluences: true };
    try {
      const forwardKey = material.graphSkinningVariant(8, "uint", "sint", "forward")!;
      const depthKey = material.graphSkinningVariant(8, "uint", "sint", "depth")!;
      expect(twin.graphSkinningVariant(8, "uint", "sint", "forward")).toBe(forwardKey);
      expect(twin.graphSkinningVariant(8, "uint", "sint", "depth")).toBe(depthKey);
      expect(material.graphSkinningVariant(8, "uint", "sint", "forward")).toBe(forwardKey);
      const source = globalShaderSource(forwardKey)!;
      expect(source.vertex).toContain("layout(location = 5) in uvec4 a_joints;");
      expect(source.vertex).toContain("layout(location = 8) in ivec4 a_joints1;");
      expect(source.vertex).toContain("min(a_joints, uvec4(uint(max(u_jointCount - 1.0, 0.0))))");
      expect(source.vertex).toContain("clamp(a_joints1, ivec4(0), ivec4(int(max(u_jointCount - 1.0, 0.0))))");
      expect(source.webgpu?.vertex).toContain("@location(5) joints: vec4<u32>");
      expect(source.webgpu?.vertex).toContain("@location(8) joints1: vec4<i32>");
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      const item = { geometry, material, skinning, modelMatrix: identity, label: "mixed-skin" };
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item], viewProjectionMatrix: identity }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      const layouts = mock.pipelines.map((pipeline) => (pipeline as { vertex: { buffers: readonly { attributes: readonly { shaderLocation: number; format: string }[] }[] } }).vertex.buffers);
      for (const layout of layouts) {
        const attributes = layout.flatMap((stream) => stream?.attributes ?? []);
        expect(attributes.find((attribute) => attribute.shaderLocation === 5)?.format).toBe("uint8x4");
        expect(attributes.find((attribute) => attribute.shaderLocation === 8)?.format).toBe("sint16x4");
      }
      expect(globalShaderSource(depthKey)?.webgpu?.vertex).toContain("@location(8) joints1: vec4<i32>");
      material.dispose();
      expect(globalShaderSource(forwardKey)).toBeDefined();
      expect(globalShaderSource(depthKey)).toBeDefined();
      twin.dispose();
      expect(globalShaderSource(forwardKey)).toBeUndefined();
      expect(globalShaderSource(depthKey)).toBeUndefined();
    } finally { geometry.dispose(); material.dispose(); twin.dispose(); target.dispose(); device.dispose(); }
  });

  it("rejects missing secondary influences and misplaced native skin streams in both passes", async () => {
    const simple: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: simple }).custom!);
    const four = skinnedGeometry(false);
    const misplacedFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24, shaderLocation: 4 }, { semantic: "weights", components: 4, offset: 40 }
    ], 56);
    const misplaced = new Geometry(new VertexBuffer(misplacedFormat, 3), null, "triangles");
    const target = device.createRenderTarget({ width: 8, height: 8 });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      for (const item of [
        { geometry: four, material, skinning: { jointCount: 1, matrices: identity, extraInfluences: true } },
        { geometry: misplaced, material, skinning: { jointCount: 1, matrices: identity } }
      ]) {
        expect(() => new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 })).toThrow(/attribute|location|stream/i);
        expect(() => new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 })).toThrow(/attribute|location|stream/i);
      }
      expect(mock.draws()).toBe(0);
      device.endFrame();
    } finally { target.dispose(); four.dispose(); misplaced.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds nonfiltering float cluster textures for more than sixteen scene lights", async () => {
    const litGraph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "metal", op: "constant", type: "f32", value: 0.6 }], outputs: { metalness: "metal" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: litGraph }).custom!);
    const geometry = Geometry.litCube(1);
    const lights = Array.from({ length: 17 }, (_, i) => ({
      kind: "directional" as const, color: [1, 1, 1] as const, intensity: i + 1, position: [0, 1, 0] as const, direction: [0, -1, 0] as const,
      range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: new DirectionalLight(`cluster-${i}`)
    }));
    try {
      const target = device.createRenderTarget({ width: 8, height: 8, depth: false });
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new ForwardPass({ items: [{ geometry, material, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), label: "lit-clustered-graph" }], lights }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      expect(mock.layouts).toHaveLength(1);
      expect(mock.layouts[0]!.entries.filter((entry) => entry.sampler?.type === "non-filtering")).toHaveLength(2);
      expect(mock.layouts[0]!.entries.filter((entry) => entry.texture?.sampleType === "unfilterable-float")).toHaveLength(2);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("addresses partial edge clusters using the producer's fixed tile size in both graph shaders", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const width = 65, height = 65;
    const lights = [40.5, 64.5].map((pixel, index) => ({
      kind: "point" as const, color: [1, 1, 1] as const, intensity: 1,
      position: [pixel / width * 2 - 1, pixel / height * 2 - 1, 0] as const,
      direction: [0, -1, 0] as const, range: 0.002, spotAngle: 0, penumbra: 0,
      castsShadow: false, layerMask: 0xffffffff, source: new PointLight(`edge-cluster-${index}`)
    }));
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const clustered = createClusteredForwardLighting(lights, width, height, identity);
    try {
      expect([clustered.diagnostics.gridWidth, clustered.diagnostics.gridHeight]).toEqual([2, 2]);
      expect(clustered.diagnostics.indexedPerCluster).toEqual([1, 0, 0, 1]);
      const indices = clustered.lightIndices.texture!.textureLevels[0]!.data as Float32Array;
      const glsl = material.sources.glsl.fragment;
      const wgsl = material.sources.wgsl!.fragment;
      const glslSize = Number(glsl.match(/min\(gl_FragCoord\.xy, u_clusterViewportSize\) \/ (\d+\.0)/)?.[1]);
      const wgslSize = Number(wgsl.match(/min\(screen, aura\.u_clusterViewportSize\) \/ (\d+\.0)/)?.[1]);
      expect([glslSize, wgslSize]).toEqual([CLUSTER_TILE_SIZE, CLUSTER_TILE_SIZE]);
      expect(wgsl).toContain("aura.u_clusterViewportSize.y - input.position.y");
      for (const [lightIndex, pixel] of [40.5, 64.5].entries()) {
        const bottomLeft = pixel, topLeft = height - pixel;
        const glCluster = Math.floor(bottomLeft / glslSize) * 2 + Math.floor(pixel / glslSize);
        const gpuCluster = Math.floor((height - topLeft) / wgslSize) * 2 + Math.floor(pixel / wgslSize);
        expect(glCluster).toBe(gpuCluster);
        expect(indices[glCluster * MAX_LIGHTS_PER_CLUSTER * 4]).toBe(lightIndex);
      }
    } finally { clustered.dispose(); material.dispose(); }
  });

  it("feeds an encoded-color shadow target to a native-shaped graph receiver", async () => {
    const shadowGraph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "rough", op: "constant", type: "f32", value: 0.5 }
      ], outputs: { position: "position", roughness: "rough" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: shadowGraph }).custom!);
    const geometry = Geometry.litCube(1);
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: "texture", label: "graph-shadow-dual" });
    const output = device.createRenderTarget({ width: 8, height: 8, depth: false, label: "graph-output" });
    const light = new DirectionalLight("graph-shadow-light");
    light.castsShadow = true;
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const shadow = new ShadowPass({ light, casters: [{ geometry, material, modelMatrix: identity }], shadowMap: new ShadowMap({ size: 8 }), renderTarget: target, viewProjectionMatrix: identity });
    try {
      device.beginFrame(8, 8);
      expect(shadow.execute({ device, width: 8, height: 8 }).shadowTextureKind).toBe("encoded-color-depth");
      const map = shadow.getForwardShadowMap({ lightMatrix: identity })!;
      expect(map.texture.texture).toBe(target.colorTexture);
      expect(map.texture.texture).not.toBe(target.depthTexture);
      device.setRenderTarget(output);
      new ForwardPass({ items: [{ geometry, material, modelMatrix: identity, label: "graph-shadow-receiver" }], shadowMap: map,
        lights: [{ kind: "directional", color: [1, 1, 1], intensity: 1, position: [0, 1, 0], direction: [0, -1, 0], range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: light }] })
        .execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === "graph-shadow-dual"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("textureSampleLevel(u_shadowMapTextureTexture"))).toBe(true);
    } finally { shadow.dispose(); target.dispose(); output.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds point and spot shadow packets and texture views to a native-shaped graph receiver", async () => {
    const graphWithLighting: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: graphWithLighting }).custom!);
    const geometry = Geometry.litCube(1);
    const gpuGeometry = Geometry.litCube(1);
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const target = device.createRenderTarget({ width: 8, height: 8, depth: false });
    const directional = new Texture({ width: 1, height: 1, label: "graph-directional-depth", data: new Uint8Array([255, 0, 0, 255]) });
    const point = new Texture({ width: 1, height: 1, label: "graph-point-depth", data: new Uint8Array([255, 0, 0, 255]) });
    const spot = new Texture({ width: 1, height: 1, label: "graph-spot-depth", data: new Uint8Array([255, 0, 0, 255]) });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const faces = new Float32Array(Array.from({ length: 6 }, () => [...identity]).flat());
    const rects = new Float32Array(Array.from({ length: 6 }, (_, index) => [(index % 3) / 3, Math.floor(index / 3) / 2, 1 / 3, 1 / 2]).flat());
    const source = new DirectionalLight("shadow-test");
    const options = {
      items: [{ geometry, material, modelMatrix: identity, label: "point-spot-graph" }],
      lights: [
        { kind: "point", color: [1, 1, 1], intensity: 1, position: [1, 2, 3], direction: [0, -1, 0], range: 20, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source },
        { kind: "spot", color: [1, 1, 1], intensity: 1, position: [4, 5, 6], direction: [0, -1, 0], range: 30, spotAngle: 0.6, penumbra: 0.2, castsShadow: true, layerMask: 0xffffffff, source },
        { kind: "point", color: [1, 1, 1], intensity: 1, position: [7, 8, 9], direction: [0, -1, 0], range: 20, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source },
        { kind: "spot", color: [1, 1, 1], intensity: 1, position: [4, 5, 6], direction: [1, 0, 0], range: 30, spotAngle: 0.6, penumbra: 0.2, castsShadow: true, layerMask: 0xffffffff, source }
      ],
      shadowMap: {
        texture: new TextureBinding({ name: "u_shadowMapTexture", texture: directional }), lightMatrix: identity,
        pointLight: { texture: new TextureBinding({ name: "u_pointShadowMapTexture", texture: point }), lightPosition: [1, 2, 3], range: 20, faceMatrices: faces, faceRects: rects, strength: 0.7 },
        spotLight: { texture: new TextureBinding({ name: "u_spotShadowMapTexture", texture: spot }), lightPosition: [4, 5, 6], lightDirection: [0, -1, 0], angle: 0.6, penumbra: 0.2, range: 30, shadowMatrix: identity, strength: 0.8 }
      }
    } as const;
    const inspect = new MockRenderDevice();
    try {
      inspect.beginFrame(8, 8);
      new ForwardPass(options).execute({ device: inspect, width: 8, height: 8 });
      const uniforms = inspect.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_pointShadowMapEnabled")).toBe(1);
      expect(uniforms.get("u_lightCount")).toBe(4);
      expect(uniforms.get("u_pointShadowFaceMatrices")).toEqual(faces);
      expect(uniforms.get("u_pointShadowFaceRects")).toEqual(rects);
      expect(uniforms.get("u_spotShadowMapEnabled")).toBe(1);
      expect(uniforms.get("u_spotShadowLightPosition")).toEqual([4, 5, 6]);
      expect(uniforms.get("u_spotShadowCone")).toEqual([0.6, 0.2]);
      const duplicatePoint = { ...options.lights[0], position: [1.00001, 2, 3] as const };
      const duplicateSpot = { ...options.lights[1] };
      expect(() => new ForwardPass({ ...options, lights: [...options.lights, duplicatePoint] }).execute({ device: inspect, width: 8, height: 8 })).toThrow(/point shadow maps cannot distinguish multiple/i);
      expect(() => new ForwardPass({ ...options, lights: [...options.lights, duplicateSpot] }).execute({ device: inspect, width: 8, height: 8 })).toThrow(/spot shadow maps cannot distinguish multiple/i);
      expect(() => new ForwardPass({ ...options, lights: [...options.lights, { ...duplicatePoint, castsShadow: false }, { ...duplicateSpot, castsShadow: false }] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(() => new ForwardPass({ ...options, items: [{ ...options.items[0], receiveShadow: false }], lights: [...options.lights, duplicatePoint, duplicateSpot] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(() => new ForwardPass({ ...options, shadowMap: { ...options.shadowMap, pointLight: { ...options.shadowMap.pointLight, strength: 0 } }, lights: [...options.lights, duplicatePoint] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_pointShadowMapTexture")).toBe(false);
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_spotShadowMapTexture")).toBe(true);
      expect(() => new ForwardPass({ ...options, shadowMap: { ...options.shadowMap, spotLight: { ...options.shadowMap.spotLight, strength: 0 } }, lights: [...options.lights, duplicateSpot] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_pointShadowMapTexture")).toBe(true);
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_spotShadowMapTexture")).toBe(false);
      inspect.endFrame();
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new ForwardPass({ ...options, items: [{ ...options.items[0], geometry: gpuGeometry }] }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      for (const label of ["graph-point-depth", "graph-spot-depth"]) {
        expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === label))).toBe(true);
      }
      expect(mock.modules.some((source) => source.includes("fn auraGraphPointShadow") && source.includes("fn auraGraphSpotShadow"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("1.0 - uv.y - offset.y"))).toBe(true);
      const selected = globalShaderSource(material.graphShadowVariant(material.shaderKey, 6)!)!;
      expect(selected.fragment).toContain("length(p.xyz - u_pointShadowLightPosition) <= 0.0001");
      expect(selected.fragment).toContain("dot(d.xyz / max(length(d.xyz), 0.0001), u_spotShadowLightDirection / max(length(u_spotShadowLightDirection), 0.0001)) >= 0.9999");
      expect(selected.webgpu!.fragment).toContain("distance(p.xyz, aura.u_pointShadowLightPosition) <= 0.0001");
      expect(selected.webgpu!.fragment).toContain("dot(d.xyz / max(length(d.xyz), 0.0001), aura.u_spotShadowLightDirection / max(length(aura.u_spotShadowLightDirection), 0.0001)) >= 0.9999");
    } finally {
      geometry.dispose(); gpuGeometry.dispose(); material.dispose(); target.dispose(); directional.dispose(); point.dispose(); spot.dispose(); inspect.dispose(); device.dispose();
    }
  });

  it("binds a raw local-shadow atlas and packed tile selection for graph draws", async () => {
    const lit: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const geometry = Geometry.litCube(1);
    const gpuGeometry = Geometry.litCube(1);
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const target = device.createRenderTarget({ width: 8, height: 8, depth: false });
    const raw = new Texture({ width: 8, height: 8, label: "graph-local-atlas", data: new Uint8Array(8 * 8 * 4).fill(255) });
    const sampler = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
    const texture = new TextureBinding({ name: "u_localShadowAtlas", texture: raw, sampler });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const matrices = new Float32Array(Array.from({ length: 6 }, () => [...identity]).flat());
    const rects = new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1, 1]).flat());
    const texelScale = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0, 0]);
    const light = { kind: "point", color: [1, 1, 1], intensity: 1, position: [1, 2, 3], direction: [0, -1, 0], range: 20, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("atlas-light") } as const;
    const atlas = { slots: new Map([[light, 0]]), rawTexture: texture, atlasSize: 8, matrices, rects, texelScale, strength: 0.75, biasTexels: 0.5, slopeBiasTexels: 1.5, normalBiasTexels: 2 };
    const options = { items: [{ geometry, material, modelMatrix: identity, label: "local-atlas-graph" }], lights: [light],
      shadowMap: { texture: new TextureBinding({ name: "u_shadowMapTexture", texture: raw, sampler }), lightMatrix: identity, strength: 0, localShadows: atlas } } as const;
    const inspect = new MockRenderDevice();
    try {
      inspect.beginFrame(8, 8);
      new ForwardPass(options).execute({ device: inspect, width: 8, height: 8 });
      const uniforms = inspect.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_localShadowAtlas")).toBe(texture);
      expect(uniforms.get("u_localShadowMatrices")).toBe(matrices);
      expect(uniforms.get("u_localShadowRects")).toBe(rects);
      expect(uniforms.get("u_localShadowTexelScale")).toBe(texelScale);
      expect(uniforms.get("u_localShadowParams")).toEqual([0.75, 0.5, 1.5, 2]);
      expect(uniforms.get("u_localShadowAtlasTexel")).toEqual([0.125, 0.125]);
      expect((uniforms.get("u_lightData") as Float32Array)[19]).toBe(1);
      new ForwardPass({ ...options, shadowMap: { ...options.shadowMap, localShadows: { ...atlas, strength: 0 } } }).execute({ device: inspect, width: 8, height: 8 });
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_localShadowAtlas")).toBe(false);
      inspect.endFrame();
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new ForwardPass({ ...options, items: [{ ...options.items[0], geometry: gpuGeometry }] }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === "graph-local-atlas"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("fn auraGraphAtlasShadow") && source.includes("right.w, p.xyz"))).toBe(true);
    } finally { geometry.dispose(); gpuGeometry.dispose(); material.dispose(); target.dispose(); raw.dispose(); inspect.dispose(); device.dispose(); }
  });

  it("binds separate directional cascade textures, splits and filter packets", async () => {
    const lit: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const geometry = Geometry.litCube(1);
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const target = device.createRenderTarget({ width: 8, height: 8, depth: false });
    const nearTexture = new Texture({ width: 2, height: 2, label: "graph-cascade-near", data: new Uint8Array(16).fill(255) });
    const farTexture = new Texture({ width: 4, height: 4, label: "graph-cascade-far", data: new Uint8Array(64).fill(255) });
    const sampler = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const near = { texture: new TextureBinding({ name: "u_shadowMapTexture", texture: nearTexture, sampler }), lightMatrix: identity, strength: 0.6, bias: 0.01, slopeBias: 1, normalBias: 0.02 };
    const far = { texture: new TextureBinding({ name: "u_shadowMapTexture", texture: farTexture, sampler }), lightMatrix: identity, strength: 0.8, bias: 0.02, slopeBias: 2, normalBias: 0.03 };
    const light = { kind: "directional", color: [1, 1, 1], intensity: 1, position: [0, 1, 0], direction: [0, -1, 0], range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("cascade-light") } as const;
    const options = { items: [{ geometry, material, modelMatrix: identity, label: "cascade-graph" }], lights: [light], cameraViewMatrix: identity,
      shadowMap: { ...near, cascades: [{ index: 0, near: 0, far: 5, shadowMap: near }, { index: 1, near: 5, far: 25, shadowMap: far }] } } as const;
    const inspect = new MockRenderDevice();
    try {
      inspect.beginFrame(8, 8);
      new ForwardPass(options).execute({ device: inspect, width: 8, height: 8 });
      const uniforms = inspect.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_graphCascadeCount")).toBe(2);
      expect(uniforms.get("u_graphCascadeViewMode")).toBe(0);
      expect(Array.from(uniforms.get("u_graphCascadeSplits") as Float32Array)).toEqual([5, 25, 0, 0]);
      expect(Array.from((uniforms.get("u_graphCascadeParams") as Float32Array).slice(0, 8))).toEqual(Array.from(new Float32Array([0.6, 0.01, 1, 0.02, 0.8, 0.02, 2, 0.03])));
      expect((uniforms.get("u_graphCascadeTexture0") as TextureBinding).texture).toBe(nearTexture);
      expect((uniforms.get("u_graphCascadeTexture1") as TextureBinding).texture).toBe(farTexture);
      const other = { ...light, direction: [1, 0, 0] as const, source: new DirectionalLight("other-cascade-light") };
      expect(() => new ForwardPass({ ...options, lights: [light, other] }).execute({ device: inspect, width: 8, height: 8 })).toThrow(/cannot distinguish multiple shadow-casting directional lights/);
      expect(() => new ForwardPass({ ...options, lights: [light, { ...other, castsShadow: false }] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(() => new ForwardPass({ ...options, items: [{ ...options.items[0], receiveShadow: false }], lights: [light, other] }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      const darkCascades = options.shadowMap.cascades.map((cascade) => ({ ...cascade, shadowMap: { ...cascade.shadowMap, strength: 0 } }));
      expect(() => new ForwardPass({ ...options, lights: [light, other], shadowMap: { ...options.shadowMap, cascades: darkCascades } }).execute({ device: inspect, width: 8, height: 8 })).not.toThrow();
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_graphCascadeTexture0")).toBe(false);
      expect(inspect.drawCommands.at(-1)!.shader!.reflection.uniforms.has("u_shadowMapTexture")).toBe(false);
      inspect.endFrame();
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      new ForwardPass(options).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      for (const label of ["graph-cascade-near", "graph-cascade-far"]) {
        expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { label?: string }).label === label))).toBe(true);
      }
      expect(mock.modules.some((source) => source.includes("fn auraGraphSunShadow") && source.includes("u_graphCascadeSplits[i]"))).toBe(true);
    } finally { geometry.dispose(); material.dispose(); target.dispose(); nearTexture.dispose(); farTexture.dispose(); inspect.dispose(); device.dispose(); }
  });

  it("reuses the correct graph program when shadow features change between draws", () => {
    const lit: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [{ id: "rough", op: "constant", type: "f32", value: 0.5 }], outputs: { roughness: "rough" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: lit }).custom!);
    const geometry = Geometry.litCube(1);
    const device = new MockRenderDevice();
    const library = new ShaderLibrary();
    const image = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const faces = new Float32Array(Array.from({ length: 6 }, () => [...identity]).flat());
    const rects = new Float32Array(Array.from({ length: 6 }, (_, i) => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 1 / 2]).flat());
    const light = { kind: "point", color: [1, 1, 1], intensity: 1, position: [0, 1, 0], direction: [0, -1, 0], range: 5, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("cache-light") } as const;
    const item = { geometry, material, modelMatrix: identity, label: "feature-cache" };
    const shadowMap = { texture: new TextureBinding({ name: "u_shadowMapTexture", texture: image }), lightMatrix: identity, strength: 0,
      pointLight: { texture: new TextureBinding({ name: "u_pointShadowMapTexture", texture: image }), lightPosition: [0, 1, 0] as const, range: 5, faceMatrices: faces, faceRects: rects } };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ shaderLibrary: library, items: [item], lights: [light] }).execute({ device, width: 8, height: 8 });
      new ForwardPass({ shaderLibrary: library, items: [item], lights: [light], shadowMap }).execute({ device, width: 8, height: 8 });
      new ForwardPass({ shaderLibrary: library, items: [item], lights: [light] }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      const [unshadowed, point, again] = device.drawCommands.map((draw) => draw.shader!);
      expect(unshadowed!.label).toBe(material.shaderKey);
      expect(point!.label).toBe(material.graphShadowVariant(material.shaderKey, 2));
      expect(point!.id).not.toBe(unshadowed!.id);
      expect(again!.id).toBe(unshadowed!.id);
      expect(point!.reflection.uniforms.has("u_pointShadowMapTexture")).toBe(true);
      expect(unshadowed!.reflection.uniforms.has("u_pointShadowMapTexture")).toBe(false);
    } finally { geometry.dispose(); material.dispose(); image.dispose(); device.dispose(); }
  });

  it("uses displaced graph vertices and color-encoded depth in a native-shaped shadow pass", async () => {
    const graphWithPosition: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [
        { name: "offset", kind: "uniform", type: "f32" }, { name: "image", kind: "texture2d" }
      ], nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "offset", op: "uniform", type: "f32", resource: "offset" },
        { id: "zero", op: "constant", type: "f32", value: 0 },
        { id: "delta", op: "construct", type: "vec3", inputs: ["zero", "offset", "zero"] },
        { id: "displaced", op: "add", type: "vec3", inputs: ["position", "delta"] },
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "color", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] }
      ], outputs: { color: "color", position: "displaced" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: graphWithPosition, uniforms: { offset: 0.35 } }).custom!);
    const geometry = Geometry.texturedCube(1);
    try {
      const depthKey = material.customDepthShaderKey!;
      const source = globalShaderSource(depthKey)!;
      expect(source.fragment).toContain("float depth = gl_FragCoord.z;");
      expect(source.fragment).toContain("gl_FragDepth = depth;");
      expect(source.fragment).toContain("u_a3dClipPlanes[8]");
      expect(source.vertex).toContain("v_a3dGraphDepthLocal = auraGraph_geometryLocal.xyz;");
      expect(source.webgpu?.vertex).toContain("aura.u_auraGraph_resource_offset");
      expect(source.webgpu?.vertex).toContain("output.graphDepthLocal = auraGraph_geometryLocal.xyz;");
      expect(source.webgpu?.fragment).toContain("@builtin(frag_depth) depth: f32");
      expect(source.webgpu?.fragment).toContain("aura.u_a3dLogDepthEnabled > 0.5");
      const target = device.createRenderTarget({ width: 8, height: 8 });
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      new DepthPass({ casters: [{ geometry, material, modelMatrix: identity, label: "displaced-graph" }], viewProjectionMatrix: identity }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      // The image is used only by the color fragment; depth still declares its
      // portable binding, so an explicit layout must admit both entries.
      expect(mock.layouts).toHaveLength(1);
      expect(mock.layouts[0]!.entries.map((entry) => entry.binding)).toEqual([0, 1, 2]);
      expect(mock.layouts[0]!.entries[1]?.sampler?.type).toBe("filtering");
      expect(mock.layouts[0]!.entries[2]?.texture?.sampleType).toBe("float");
      expect(mock.modules.some((source) => source.includes("aura.u_auraGraph_resource_offset"))).toBe(true);
      const bytes = mock.writes.find((write) => write.label === "displaced-graph:custom-depth-portable-uniforms")?.bytes;
      expect(bytes).toBeDefined();
      const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
      const values = Array.from({ length: bytes!.byteLength / 4 }, (_, index) => view.getFloat32(index * 4, true));
      expect(values.some((value) => Math.abs(value - 0.35) < 0.000001)).toBe(true);
      const depthModule = mock.modules.filter((stage) => stage.includes("@vertex") && stage.includes("output.graphDepthLocal")).at(-1)!;
      const clipRange = portableFieldOffset(depthModule, "u_a3dClipRange");
      expect(view.getFloat32(clipRange, true)).toBe(0);
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      const depthConvention = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
      new DepthPass({ casters: [{ geometry, material, modelMatrix: identity, label: "displaced-graph" }], viewProjectionMatrix: identity, depthConvention }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      const depthWrites = mock.writes.filter((write) => write.label === "displaced-graph:custom-depth-portable-uniforms");
      const zeroToOne = depthWrites[depthWrites.length - 1]!.bytes;
      expect(new DataView(zeroToOne.buffer, zeroToOne.byteOffset, zeroToOne.byteLength).getFloat32(clipRange, true)).toBe(1);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("round-trips u32 resources and uploads the exact scalar with WebGL's unsigned setter", () => {
    const serialized = shaderGraph.serialize(graph);
    expect(shaderGraph.serialize(shaderGraph.deserialize(serialized))).toBe(serialized);
    const spec = shaderGraph.material({ graph: shaderGraph.deserialize(serialized), uniforms: { counter: exactValue, gain: 0.5, signed: -exactValue, enabled: true } });
    expect(spec.custom?.uniformAliases).toMatchObject({ counter: "auraGraph_resource_counter" });
    const runtime = createCustomShaderMaterial(spec.custom!);
    try {
      expect(runtime.uniformSchema).toContainEqual(expect.objectContaining({ name: "u_auraGraph_resource_counter", kind: "u32" }));
      expect(runtime.sources.glsl.fragment).toContain("uniform highp uint u_auraGraph_resource_counter;");
      expect(runtime.sources.glsl.fragment).toContain("uniform highp int u_auraGraph_resource_signed;");
      expect(runtime.sources.glsl.fragment).toContain("uniform bool u_auraGraph_resource_enabled;");
      expect(runtime.sources.glsl.fragment).toContain("precision highp int;");
      expect(runtime.sources.wgsl?.fragment).toContain("aura.u_auraGraph_resource_counter");
      expect(runtime.sources.wgsl?.fragment).toContain("aura.u_auraGraph_resource_enabled != 0u");
      const result = runtime.compile(new MockRenderDevice());
      expect(result.ok).toBe(true);
      const bound = new MaterialBinding().bindLegacy(runtime, result.program!);
      expect(bound.uniforms.get("u_auraGraph_resource_counter")).toBe(exactValue);
      expect(result.program!.reflection.uniformDetails.get("u_auraGraph_resource_counter")?.type).toBe("uint");

      const uploads: [string, string, number][] = [];
      const host = {
        counters: { uniformLocationLookupCount: 0, inactiveUniformBindCount: 0 },
        stateCache: {},
        gl: {
          getUniformLocation: (_program: unknown, name: string) => ({ name }),
          uniform1ui: (location: { name: string }, value: number) => uploads.push(["uint", location.name, value]),
          uniform1i: (location: { name: string }, value: number) => uploads.push(["int", location.name, value]),
          uniform1f() {}
        }
      };
      const glShader = { handle: {}, reflection: result.program!.reflection };
      new WebGL2DrawCallBinder(host as never).uploadUniforms(glShader as never, bound.uniforms);
      expect(uploads).toEqual([
        ["uint", "u_auraGraph_resource_counter", exactValue],
        ["int", "u_auraGraph_resource_signed", -exactValue],
        ["int", "u_auraGraph_resource_enabled", 1]
      ]);
      // Linked WebGL programs expose numeric GL enums rather than source names.
      const enumDetails = new Map(result.program!.reflection.uniformDetails);
      for (const [name, type] of [["counter", "5125"], ["signed", "5124"], ["enabled", "35670"]]) {
        const shaderName = `u_auraGraph_resource_${name}`;
        enumDetails.set(shaderName, { ...enumDetails.get(shaderName)!, type });
      }
      const linkedShader = { handle: {}, reflection: { ...result.program!.reflection, uniformDetails: enumDetails } };
      uploads.length = 0;
      new WebGL2DrawCallBinder(host as never).uploadUniforms(linkedShader as never, bound.uniforms);
      expect(uploads).toEqual([
        ["uint", "u_auraGraph_resource_counter", exactValue],
        ["int", "u_auraGraph_resource_signed", -exactValue],
        ["int", "u_auraGraph_resource_enabled", 1]
      ]);

      assertCustomUniformWrite(spec, "counter", 0xffffffff);
      expect(applyCustomUniformWrites(runtime, new Map([["counter", 0xffffffff]]))).toBe(1);
      expect(runtime.getParameter("u_auraGraph_resource_counter")).toBe(0xffffffff);
      for (const invalid of [-1, 1.5, 0x1_0000_0000, NaN, Infinity, true]) {
        expect(() => assertCustomUniformWrite(spec, "counter", invalid)).toThrow(/u32|finite/);
        expect(() => shaderGraph.material({ graph, uniforms: { counter: invalid } })).toThrow(/u32|finite/);
      }
      for (const invalid of [-0x80000001, 0x80000000, 1.5, true]) expect(() => assertCustomUniformWrite(spec, "signed", invalid)).toThrow(/i32/);
      expect(() => assertCustomUniformWrite(spec, "enabled", 2)).toThrow(/bool/);
      expect(() => runtime.setParameter("u_auraGraph_resource_counter", [1])).toThrow(/u32/);
      const instance = new MaterialInstance(runtime);
      instance.setOverride("u_auraGraph_resource_counter", -1);
      expect(() => new MaterialBinding().bind(instance, result.program!)).toThrow(/u32/);
      const defaultSpec = shaderGraph.material({ graph });
      const defaults = createCustomShaderMaterial(defaultSpec.custom!);
      expect(defaults.getParameter("u_auraGraph_resource_counter")).toBe(0);
      defaults.dispose();
    } finally { runtime.dispose(); }
  });

  it("injects a WGSL u32 field and writes its little-endian bytes into a native-shaped draw", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const spec = shaderGraph.material({ graph, uniforms: { counter: exactValue, gain: 0.5, signed: -exactValue, enabled: true } });
    const material = createCustomShaderMaterial(spec.custom!);
    try {
      const program = material.compile(device);
      expect(program.ok).toBe(true);
      expect(mock.modules.some((source) => source.includes("u_auraGraph_resource_counter: u32"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("u_auraGraph_resource_signed: i32"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("u_auraGraph_resource_enabled: u32"))).toBe(true);
      const uniforms = new MaterialBinding().bind(material, program.program!).uniforms;
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      device.draw({ label: "u32-graph", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader: program.program, uniforms });
      expect(applyCustomUniformWrites(material, new Map<string, number | boolean>([["counter", 0xffffffff], ["signed", -0x80000000], ["enabled", false]]))).toBe(3);
      const updated = new MaterialBinding().bind(material, program.program!).uniforms;
      device.draw({ label: "u32-graph-updated", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader: program.program, uniforms: updated });
      device.endFrame();
      expect(mock.draws()).toBe(2);
      const bytes = mock.writes.find((write) => write.label === "u32-graph-portable-uniforms")?.bytes;
      expect(bytes).toBeDefined();
      const fragment = mock.modules.find((stage) => stage.includes("@fragment") && stage.includes("u_auraGraph_resource_counter: u32"))!;
      const counter = portableFieldOffset(fragment, "u_auraGraph_resource_counter"), gain = portableFieldOffset(fragment, "u_auraGraph_resource_gain");
      const signed = portableFieldOffset(fragment, "u_auraGraph_resource_signed"), enabled = portableFieldOffset(fragment, "u_auraGraph_resource_enabled");
      const clipRange = portableFieldOffset(fragment, "u_a3dClipRange");
      expect([...bytes!.slice(counter, counter + 4)]).toEqual([1, 0, 0, 1]);
      const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
      expect(view.getFloat32(clipRange, true)).toBe(0);
      expect(view.getUint32(counter, true)).toBe(exactValue);
      expect(view.getFloat32(gain, true)).toBe(0.5);
      expect(view.getInt32(signed, true)).toBe(-exactValue);
      expect(view.getUint32(enabled, true)).toBe(1);
      const updatedBytes = mock.writes.find((write) => write.label === "u32-graph-updated-portable-uniforms")?.bytes;
      expect(updatedBytes).toBeDefined();
      const updatedView = new DataView(updatedBytes!.buffer, updatedBytes!.byteOffset, updatedBytes!.byteLength);
      expect(updatedView.getUint32(counter, true)).toBe(0xffffffff);
      expect(updatedView.getInt32(signed, true)).toBe(-0x80000000);
      expect(updatedView.getUint32(enabled, true)).toBe(0);
    } finally { material.dispose(); device.dispose(); }
  });

  it("binds declared 3D colour and depth target textures and rejects wrong texture kinds", async () => {
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const depthTarget = device.createRenderTarget({ width: 2, height: 2, depth: "texture", label: "source" });
    const volume = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", data: new Uint8Array([255, 0, 0, 255]) });
    const spec = {
      glsl: { fragment: "out vec4 color; void main() { color = texture(volume, vec3(0.5)) + vec4(texelFetch(depth, ivec2(0), 0).r); }" },
      wgsl: { fragment: "@fragment fn fs_main() -> @location(0) vec4<f32> { return textureSample(u_volumeTexture, u_volumeSampler, vec3<f32>(0.5)) + vec4<f32>(textureLoad(u_depthTexture, vec2<i32>(0), 0)); }" },
      uniforms: { volume: { type: "texture3d" as const, value: volume }, depth: { type: "depth2d" as const, value: depthTarget.depthTexture! } }
    };
    const material = createCustomShaderMaterial(spec);
    try {
      expect(material.sources.glsl.fragment).toContain("uniform highp sampler3D u_volume;");
      expect(material.sources.glsl.fragment).toContain("uniform highp sampler2D u_depth;");
      const program = material.compile(device);
      expect(program.ok).toBe(true);
      expect(mock.modules.some((source) => source.includes("var u_volumeTexture: texture_3d<f32>"))).toBe(true);
      expect(mock.modules.some((source) => source.includes("var u_depthTexture: texture_depth_2d"))).toBe(true);
      const uniforms = new MaterialBinding().bind(material, program.program!).uniforms;
      const target = device.createRenderTarget({ width: 2, height: 2, depth: false, label: "output" });
      const vertexBuffer = device.createBuffer("vertex", 36);
      device.beginFrame(2, 2);
      device.setRenderTarget(target);
      device.draw({ topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader: program.program, uniforms });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      expect(mock.groups.some((group) => group.entries.some((entry) => (entry.resource as { descriptor?: { aspect?: string } }).descriptor?.aspect === "depth-only"))).toBe(true);
      expect(() => createCustomShaderMaterial({ ...spec, uniforms: { ...spec.uniforms, volume: { type: "texture3d", value: depthTarget.depthTexture } } })).toThrow(/3d texture/);
      expect(() => createCustomShaderMaterial({ ...spec, uniforms: { ...spec.uniforms, depth: { type: "depth2d", value: volume } } })).toThrow(/2d depth texture/);
      const missing = createCustomShaderMaterial({ ...spec, uniforms: { volume: "texture3d", depth: "depth2d" } });
      try {
        const mockProgram = missing.compile(new MockRenderDevice());
        expect(() => new MaterialBinding().bind(missing, mockProgram.program!)).toThrow(/requires a bound/);
      } finally { missing.dispose(); }
    } finally { material.dispose(); volume.dispose(); device.dispose(); }
  });

  it("keeps public graph names distinct even when one resembles another generated binding", () => {
    const collisionGraph: ShaderGraphDocument = {
      ...graph,
      resources: [...graph.resources!, { name: "auraGraph_resource_counter", kind: "uniform", type: "u32" }]
    };
    const spec = shaderGraph.material({ graph: collisionGraph, uniforms: { counter: 3, auraGraph_resource_counter: 5 } });
    const material = createCustomShaderMaterial(spec.custom!);
    try {
      assertCustomUniformWrite(spec, "counter", 7);
      assertCustomUniformWrite(spec, "auraGraph_resource_counter", 11);
      expect(applyCustomUniformWrites(material, new Map([["counter", 7], ["auraGraph_resource_counter", 11]]))).toBe(2);
      expect(material.getParameter("u_auraGraph_resource_counter")).toBe(7);
      expect(material.getParameter("u_auraGraph_resource_auraGraph_resource_counter")).toBe(11);
    } finally { material.dispose(); }
  });

  it("rejects a portable integer schema paired with a float GLSL declaration", () => {
    try {
      new PortableShaderMaterial({
        name: "mismatched-unsigned", shaderLibrary: new ShaderLibrary(),
        sources: { glsl: {
          vertex: "uniform mat4 u_modelViewProjection; in vec3 a_position; void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }",
          fragment: "precision highp float; uniform float u_counter; out vec4 color; void main() { color = vec4(u_counter); }"
        } },
        uniforms: [{ name: "u_counter", kind: "u32", value: 1 }]
      });
      throw new Error("expected a type mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(PortableShaderCompilationError);
      expect((error as PortableShaderCompilationError).diagnostics).toContain("GLSL uniform u_counter must be uint for u32, got float");
    }
  });

  it("rejects multisampled depth smuggled into the public portable schema", () => {
    try {
      new PortableShaderMaterial({
        name: "multisampled-depth-unavailable", shaderLibrary: new ShaderLibrary(),
        sources: { glsl: {
          vertex: "uniform mat4 u_modelViewProjection; in vec3 a_position; void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }",
          fragment: "precision highp float; uniform sampler2D u_depth; out vec4 color; void main() { color = texture(u_depth, vec2(0.5)); }"
        } },
        uniforms: [{ name: "u_depth", kind: "depth2d-multisampled" as never, value: new TextureBinding({ name: "u_depth", required: false }) }]
      });
      throw new Error("expected an unsupported multisampled depth schema");
    } catch (error) {
      expect(error).toBeInstanceOf(PortableShaderCompilationError);
      expect((error as PortableShaderCompilationError).diagnostics).toEqual(expect.arrayContaining([
        expect.stringMatching(/do not support depth2d-multisampled/)
      ]));
    }
  });

  it("keeps live 3D texture handles synchronized without recompiling", () => {
    const handle = texture.data3d({ width: 1, height: 1, depth: 1, data: new Uint8Array([0, 0, 0, 255]) });
    const material = createCustomShaderMaterial({
      glsl: { fragment: "out vec4 color; void main() { color = texture(volume, vec3(0.5)); }" },
      uniforms: { volume: { type: "texture3d", value: handle } }
    });
    try {
      const key = material.shaderKey;
      expect(syncCustomTextureRefs(material)).toBe(0);
      handle.wrapS = "repeat";
      expect(syncCustomTextureRefs(material)).toBe(1);
      expect((material.getParameter("u_volume") as TextureBinding).sampler.addressU).toBe("repeat");
      expect(material.shaderKey).toBe(key);
    } finally { material.dispose(); handle.dispose(); }
  });

  it("binds graph time, viewport and camera builtins through a native-shaped forward draw", async () => {
    const builtinGraph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "uv", op: "input", type: "vec2", name: "viewportUV" },
        { id: "time", op: "input", type: "f32", name: "time" },
        { id: "camera", op: "input", type: "vec3", name: "cameraPosition" },
        { id: "value", op: "construct", type: "vec3", inputs: ["uv", "time"] },
        { id: "color", op: "add", type: "vec3", inputs: ["value", "camera"] }
      ], outputs: { color: "color" }
    };
    const mock = nativeDevice();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => mock.native }, device: mock.native });
    const material = createCustomShaderMaterial(shaderGraph.material({ graph: builtinGraph }).custom!);
    const geometry = Geometry.triangle();
    try {
      const target = device.createRenderTarget({ width: 8, height: 6, depth: false });
      device.beginFrame(8, 6);
      device.setRenderTarget(target);
      new ForwardPass({
        items: [{ geometry, material, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), label: "graph-builtins" }],
        cameraPosition: [2, 3, 4], timeSeconds: 7.25
      }).execute({ device, width: 8, height: 6 });
      device.endFrame();
      expect(mock.draws()).toBe(1);
      const fragment = mock.modules.find((source) => source.includes("@fragment"))!;
      expect(fragment).toContain("u_cameraPosition: vec3<f32>");
      expect(fragment).toContain("u_time: f32");
      expect(fragment).toContain("u_resolution: vec2<f32>");
      expect(fragment).toContain("aura.u_cameraPosition");
      const bytes = mock.writes.find((write) => write.label === "graph-builtins-portable-uniforms")?.bytes;
      expect(bytes).toBeDefined();
      const view = new DataView(bytes!.buffer, bytes!.byteOffset, bytes!.byteLength);
      const camera = portableFieldOffset(fragment, "u_cameraPosition"), time = portableFieldOffset(fragment, "u_time"), resolution = portableFieldOffset(fragment, "u_resolution");
      expect([0, 4, 8].map((offset) => view.getFloat32(camera + offset, true))).toEqual([2, 3, 4]);
      expect(view.getFloat32(time, true)).toBe(7.25);
      expect([0, 4].map((offset) => view.getFloat32(resolution + offset, true))).toEqual([8, 6]);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rebuilds frame bindings atomically when portable WGSL is hot reloaded", () => {
    const library = new ShaderLibrary();
    const sources = {
      glsl: {
        vertex: "uniform mat4 u_modelViewProjection; in vec3 a_position; void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); }",
        fragment: "precision highp float; uniform float u_time; out vec4 color; void main() { color = vec4(u_time); }"
      },
      wgsl: {
        vertex: "/* @aura3d-bindings */ @vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }",
        fragment: "/* @aura3d-bindings */ @fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
      }
    };
    const material = new PortableShaderMaterial({ name: "frame-hot-reload", shaderLibrary: library, sources });
    try {
      expect(library.compileSource(material.shaderKey).portableBindings?.some((entry) => entry.name === "u_time")).toBe(false);
      const usingTime = { ...sources, wgsl: { ...sources.wgsl, fragment: sources.wgsl.fragment.replace("vec4<f32>(1.0)", "vec4<f32>(aura.u_time)") } };
      material.hotReload(usingTime);
      expect(library.compileSource(material.shaderKey).portableBindings).toContainEqual({ name: "u_time", kind: "float", required: false });
      expect(() => material.hotReload({ ...usingTime, glsl: { ...sources.glsl, fragment: sources.glsl.fragment.replace("uniform float u_time;", "") } })).toThrow(PortableShaderCompilationError);
      expect(library.compileSource(material.shaderKey).portableBindings).toContainEqual({ name: "u_time", kind: "float", required: false });
      material.hotReload(sources);
      expect(library.compileSource(material.shaderKey).portableBindings?.some((entry) => entry.name === "u_time")).toBe(false);
    } finally { material.dispose(); }
  });
});
