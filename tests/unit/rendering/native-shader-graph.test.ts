import { describe, expect, it } from "vitest";
import {
  ShaderGraphError,
  compileShaderGraph,
  validateShaderGraph,
  type ShaderGraphDocument
} from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";
import { material as materialFactory } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { tsl } from "../../../packages/engine/src/agent-api/nodes/tsl/index.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { MaterialBinding, MockRenderDevice, Texture, globalShaderSource } from "../../../packages/rendering/src/index.js";

const material: ShaderGraphDocument = {
  version: 1,
  stage: "material",
  resources: [
    { name: "map", kind: "texture2d" },
    { name: "gain", kind: "uniform", type: "f32" }
  ],
  nodes: [
    { id: "uv", op: "input", type: "vec2", name: "uv0" },
    { id: "uvSecond", op: "input", type: "vec2", name: "uv1" },
    { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] },
    { id: "rgb", op: "swizzle", type: "vec3", inputs: ["sample"], components: "xyz" },
    { id: "value", op: "uniform", type: "f32", resource: "gain" },
    { id: "worldPos", op: "input", type: "vec3", name: "positionLocal" },
    { id: "newPos", op: "construct", type: "vec3", inputs: ["uvSecond", "value"] }
  ],
  outputs: { color: "rgb", opacity: "value", position: "newPos" }
};

describe("typed shader graphs", () => {
  it("lowers sampled textures, two UV channels, vertex position and opacity to paired stages", () => {
    expect(validateShaderGraph(material)).toEqual([]);
    const gl = compileShaderGraph(material, "glsl");
    const gpu = compileShaderGraph(material, "wgsl");
    expect(gl.material?.vertex.outputs.position).toContain("auraGraph_uv1");
    expect(gl.vertex).toContain("in vec2 a_uv1;");
    expect(gl.vertex).toContain("auraGraph_v_uv0 = auraGraph_uv0");
    expect(gl.fragment).toContain("texture(auraGraph_resource_map, auraGraph_uv0)");
    expect(gl.fragment).toContain("gain");
    expect(gpu.vertex).toContain("@location(7) uv1: vec2<f32>");
    expect(gpu.vertex).toContain("auraGraph_clip.z * 0.5 + auraGraph_clip.w * 0.5");
    expect(gpu.fragment).toContain("textureSample(u_auraGraph_resource_mapTexture, u_auraGraph_resource_mapSampler, auraGraph_uv0)");
    expect(gpu.fragment).toContain("aura.u_auraGraph_resource_gain");
    expect(gpu.material?.varyings).toEqual(["uv0"]);
    expect(gpu.material?.builtins).toEqual(["uv0", "uv1"]);
    expect(gpu.bindings).toEqual([
      { name: "map", shaderName: "auraGraph_resource_map", kind: "texture2d", group: 0, binding: 2, samplerBinding: 1 },
      { name: "gain", shaderName: "auraGraph_resource_gain", kind: "uniform", type: "f32", group: 0, binding: 0 }
    ]);
    expect(compileShaderGraph(JSON.parse(JSON.stringify(material)), "wgsl").key).toBe(gpu.key);
    expect(compileShaderGraph(material, "wgsl", { skinning: 4 }).key).not.toBe(gpu.key);
    expect(() => compileShaderGraph(material, "wgsl", { skinning: 5 as 4 })).toThrow(/invalid-skinning/);
    expect(gpu.nodeSources.rgb).toContain("textureSample");
  });

  it("exposes physical material channels for the lit renderer without silently dropping them", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "color", op: "constant", type: "vec3", value: [0.8, 0.2, 0.1] },
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
        { id: "rough", op: "constant", type: "f32", value: 0.35 },
        { id: "metal", op: "constant", type: "f32", value: 0.7 }
      ], outputs: { color: "color", normal: "normal", roughness: "rough", metalness: "metal" }
    };
    for (const target of ["glsl", "wgsl"] as const) {
      const result = compileShaderGraph(graph, target);
      expect(result.material?.requiresLighting).toBe(true);
      expect(result.fragment).toContain("auraGraphDirect(");
      expect(result.fragment).toContain("auraGraph_metalness = clamp(0.7, 0.0, 1.0)");
      expect(result.material?.fragment.outputs).toMatchObject({ normal: "auraGraph_normalWorld", roughness: "0.35", metalness: "0.7" });
      expect(result.material?.varyings).toContain("normalWorld");
    }
  });

  it("emits paired scene-lit stages and preserves metallic hooks", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
        { id: "rough", op: "constant", type: "f32", value: 0.35 },
        { id: "pos", op: "input", type: "vec3", name: "positionLocal" },
        { id: "offset", op: "constant", type: "vec3", value: [0, 0.25, 0] },
        { id: "displaced", op: "add", type: "vec3", inputs: ["pos", "offset"] }
      ], outputs: { normal: "normal", roughness: "rough", position: "displaced" }
    };
    const glsl = compileShaderGraph(graph, "glsl");
    expect(glsl.material?.requiresLighting).toBe(true);
    expect(glsl.vertex).toContain("auraGraph_clipWorld = (modelMatrix * auraGraph_geometryLocal).xyz;");
    expect(glsl.vertex).toContain("auraGraph_surfaceWorldPosition = auraGraph_clipWorld;");
    expect(glsl.vertex).toContain("auraGraph_surfaceWorldNormal = normalMatrix * auraGraph_geometryNormal;");
    expect(glsl.fragment).toContain("vec3 auraGraph_normal = auraGraph_normalWorld;");
    expect(glsl.fragment).toContain("float auraGraph_roughness = clamp(0.35, 0.0, 1.0);");
    expect(glsl.fragment).toContain("auraGraphDirect(auraGraph_normal, auraGraph_view, auraGraph_baseColor, auraGraph_roughness, auraGraph_metalness, auraGraph_surfaceWorldPosition)");
    expect(glsl.fragment).toContain("a3dEnvSpecular(");
    const gpu = compileShaderGraph(graph, "wgsl");
    expect(gpu.fragment).toContain("auraGraphDirect(");
    expect(gpu.material?.fragment.outputs).toMatchObject({ normal: "auraGraph_normalWorld", roughness: "0.35" });

    const metallic: ShaderGraphDocument = {
      ...graph, nodes: [...graph.nodes, { id: "metal", op: "constant", type: "f32", value: 0.5 }],
      outputs: { ...graph.outputs, metalness: "metal" }
    };
    expect(compileShaderGraph(metallic, "glsl").fragment).toContain("auraGraph_metalness = clamp(0.5, 0.0, 1.0)");
    expect(compileShaderGraph(metallic, "glsl").material?.fragment.outputs.metalness).toBe("0.5");
    expect(shaderGraph.material({ graph: metallic, backend: "wgsl" }).custom?.wgsl?.fragment).toContain("auraGraph_metalness = clamp(0.5, 0.0, 1.0)");
  });

  it("enforces data types, stage access, cycles, missing nodes, duplicate bindings and lexical scope", () => {
    const graph = {
      version: 1, stage: "material", resources: [{ name: "time", kind: "uniform", type: "f32" }],
      nodes: [
        { id: "a", type: "vec3", op: "add", inputs: ["b", "missing"] },
        { id: "b", type: "vec3", op: "add", inputs: ["a", "a"] },
        { id: "depth", type: "f32", op: "input", name: "depth" },
        { id: "pos", type: "vec3", op: "construct", inputs: ["depth", "depth", "depth"] }
      ], outputs: { color: "depth", position: "pos" }
    } as ShaderGraphDocument;
    const diagnostics = validateShaderGraph(graph, "glsl");
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["cycle", "missing-node", "type-mismatch", "invalid-stage"]));
    expect(() => compileShaderGraph(graph, "glsl")).toThrow(ShaderGraphError);
    const compute = {
      version: 1, stage: "compute", nodes: [
        { id: "idx", op: "local", type: "u32", name: "i" },
        { id: "v", op: "constant", type: "u32", value: 1 }
      ], resources: [
        { name: "image", kind: "texture2d", binding: 0 },
        { name: "data", kind: "storage-buffer", type: "u32", binding: 1 }
      ], statements: [{ op: "store", resource: "data", index: "idx", value: "v" }]
    } as ShaderGraphDocument;
    expect(validateShaderGraph(compute, "wgsl").map((d) => d.code)).toEqual(expect.arrayContaining(["duplicate-binding", "invalid-scope"]));
    expect(validateShaderGraph(compute, "glsl").map((d) => d.code)).toContain("unsupported-backend");
  });

  it("generates compute with real storage writes, atomics, bounded loops and barriers", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "compute", workgroupSize: [32, 1, 1],
      resources: [
        { name: "data", kind: "storage-buffer", type: "u32", access: "read_write", binding: 0 },
        { name: "target", kind: "storage-texture", format: "rgba8unorm", access: "write", binding: 1 },
        { name: "source", kind: "texture2d", binding: 2 }
      ],
      nodes: [
        { id: "global", op: "input", type: "uvec3", name: "globalInvocationId" },
        { id: "index", op: "swizzle", type: "u32", inputs: ["global"], components: "x" },
        { id: "one", op: "constant", type: "u32", value: 1 },
        { id: "limit", op: "constant", type: "u32", value: 4 },
        { id: "test", op: "less", type: "bool", inputs: ["index", "limit"] },
        { id: "i", op: "local", type: "u32", name: "i" },
        { id: "xy", op: "constant", type: "vec2", value: [0, 0] },
        { id: "rgba", op: "textureSample", type: "vec4", resource: "source", inputs: ["xy"] }
      ],
      statements: [
        { op: "if", condition: "test", then: [
          { op: "loop", index: "i", count: 3, body: [{ op: "atomicAdd", resource: "data", index: "i", value: "one" }] },
          { op: "store", resource: "data", index: "index", value: "one" },
          { op: "textureStore", resource: "target", coordinates: "xy", value: "rgba" }
        ] },
        { op: "barrier", scope: "storage" }
      ]
    };
    expect(validateShaderGraph(graph, "wgsl")).toEqual([]);
    const result = compileShaderGraph(graph, "wgsl");
    expect(result.compute).toContain("@compute @workgroup_size(32, 1, 1)");
    expect(result.compute).toContain("@builtin(global_invocation_id) auraGraph_globalInvocationId");
    expect(result.compute).toContain("array<atomic<u32>>");
    expect(result.compute).toContain("atomicAdd(&auraGraph_resource_data[auraGraph_local_i], 1u)");
    expect(result.compute).toContain("atomicStore(&auraGraph_resource_data");
    expect(result.compute).toContain("textureStore(auraGraph_resource_target");
    expect(result.compute).toContain("textureSampleLevel(auraGraph_resource_source, auraGraph_sampler_source");
    expect(result.compute).toContain("storageBarrier()");
    expect(result.bindings.find((b) => b.name === "source")).toMatchObject({ binding: 2, samplerBinding: 3, group: 0 });
    expect(() => compileShaderGraph(graph, "glsl")).toThrow(/unsupported-backend/);
  });

  it("distinguishes stage-specific sampling and rejects oversized or malformed values", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "map", kind: "texture2d" }],
      nodes: [
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] },
        { id: "pos", op: "swizzle", type: "vec3", inputs: ["sample"], components: "xyz" }
      ], outputs: { position: "pos", color: "sample" }
    };
    const result = compileShaderGraph(graph, "wgsl");
    expect(result.vertex).toContain("textureSampleLevel(");
    expect(result.fragment).toContain("textureSample(");
    const invalid = { ...graph, nodes: [{ id: "x", op: "constant", type: "u32", value: -1 }], outputs: { opacity: "x" } } as ShaderGraphDocument;
    expect(validateShaderGraph(invalid).map((entry) => entry.code)).toContain("type-mismatch");
    expect(validateShaderGraph({ ...graph, nodes: Array.from({ length: 513 }, (_, i) => ({ id: `n${i}`, op: "constant", type: "f32", value: 0 })) }).map((entry) => entry.code)).toContain("graph-limit");
  });

  it("supports prototype-looking node identifiers without corrupting source mapping", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [{ id: "__proto__", op: "constant", type: "vec3", value: [1, 0, 0] }], outputs: { color: "__proto__" } };
    const compiled = compileShaderGraph(graph, "wgsl");
    expect(Object.hasOwn(compiled.nodeSources, "__proto__")).toBe(true);
    expect(compiled.nodeSources.__proto__).toBe("vec3<f32>(1.0, 0.0, 0.0)");
  });
});

describe("public graph facade and legacy materials", () => {
  it("round-trips deterministically and rejects malformed JSON and cyclic graph objects", () => {
    const serialized = shaderGraph.serialize(material);
    expect(shaderGraph.serialize(shaderGraph.deserialize(serialized))).toBe(serialized);
    expect(() => shaderGraph.deserialize("{garbage")).toThrow(/invalid-serialization/);
    const cyclic = { version: 1, stage: "material", nodes: [] as unknown[], outputs: {} };
    cyclic.nodes.push(cyclic);
    expect(() => shaderGraph.serialize(cyclic as unknown as ShaderGraphDocument)).toThrow(/cyclic/);
  });

  it("migrates texture, scalar-vector arithmetic and live uniforms into a renderer material", () => {
    const tex = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
    const scale = tsl.uniform(0.25, { name: "gain" });
    const legacy = { colorNode: tsl.texture(tex, tsl.uv(), { name: "image" }).rgb.mul(scale) };
    const migrated = shaderGraph.fromTsl(legacy);
    expect(migrated.uniforms.image).toBe(tex);
    expect(migrated.uniforms.gain).toBe(0.25);
    expect(migrated.graph.nodes.some((node) => node.op === "construct")).toBe(true);
    const materialSpec = shaderGraph.material({ graph: migrated.graph, uniforms: migrated.uniforms });
    expect(materialSpec.kind).toBe("custom");
    expect(materialSpec.custom?.glsl.fragment).toContain("texture(auraGraph_resource_image");
    expect(materialSpec.custom?.wgsl?.fragment).toContain("textureSample(u_auraGraph_resource_imageTexture");
    const runtime = createCustomShaderMaterial(materialSpec.custom!);
    expect(runtime.sources.glsl.fragment).toContain("u_auraGraph_resource_gain");
    expect(runtime.sources.wgsl?.fragment).toContain("@fragment");
    const program = runtime.compile(new MockRenderDevice());
    expect(program.ok).toBe(true);
    expect(new MaterialBinding().bind(runtime, program.program!).warnings.join("\n")).not.toContain("fallback texture");
    runtime.dispose();
    expect(materialFactory.node({ graph: migrated.graph, uniforms: migrated.uniforms }).kind).toBe("custom");
  });

  it("honors explicit backend requests and carries physical TSL outputs into WGSL", () => {
    const result = materialFactory.node({ backend: "wgsl", colorNode: tsl.vec3(0.2, 0.4, 0.8), roughnessNode: 0.3, metalnessNode: 0.7 });
    expect(result.custom?.wgsl?.fragment).toContain("auraGraph_metalness = clamp(0.7, 0.0, 1.0)");
    expect(result.custom?.glsl.fragment).toContain("auraGraphDirect(");
    expect(() => shaderGraph.material({ graph: material, backend: "unknown" as never })).toThrow(/unsupported-backend/);
  });

  it("carries borrowed read-only storage buffers and rejects a non-WebGPU backend", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "values", kind: "storage-buffer", type: "f32", access: "read" }],
      nodes: [
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "value", op: "storageLoad", type: "f32", resource: "values", inputs: ["index"] },
        { id: "color", op: "construct", type: "vec3", inputs: ["value", "value", "value"] }
      ], outputs: { color: "color" }
    };
    const compiled = compileShaderGraph(graph, "wgsl");
    expect(compiled.bindings).toContainEqual(expect.objectContaining({ name: "values", kind: "storage-buffer", group: 1, binding: 0, access: "read" }));
    expect(compiled.fragment).toContain("var<storage, read> auraGraph_resource_values");
    expect(compiled.storageStages).toEqual({ forward: [{ name: "values", visibility: "fragment" }], depth: [] });
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 16);
    try {
      expect(() => shaderGraph.material({ graph, backend: "wgsl" })).toThrow(/requires a matching storage-buffer value/);
      expect(() => shaderGraph.material({ graph, backend: "glsl", storage: { values: { kind: "storage-buffer", buffer } } })).toThrow(/material storage resources require WebGPU/);
      expect(() => shaderGraph.material({ graph, storage: { values: { kind: "storage-buffer", buffer, offset: 2, size: 4 } } })).toThrow(/in-bounds byte range/);
      expect(() => shaderGraph.material({ graph, storage: { values: { kind: "storage-buffer", buffer, offset: 12, size: 8 } } })).toThrow(/in-bounds byte range/);
      const spec = shaderGraph.material({ graph, backend: "wgsl", storage: { values: { kind: "storage-buffer", buffer } } }).custom!;
      const runtime = createCustomShaderMaterial(spec);
      try {
        expect(runtime.graphRequiresWebGPU).toBe(true);
        expect(runtime.graphStorageBindings("forward")).toEqual([expect.objectContaining({ group: 1, binding: 0, buffer })]);
        expect(runtime.graphStorageBindings("depth")).toEqual([]);
        expect(globalShaderSource(runtime.shaderKey)?.webgpu?.storageBindings).toEqual([{ kind: "storage-buffer", group: 1, binding: 0, visibility: "fragment", access: "read" }]);
        expect(runtime.compile(device)).toMatchObject({ ok: false, diagnostics: [expect.stringContaining("GRAPH_STORAGE_BACKEND_UNSUPPORTED")] });
      } finally { runtime.dispose(); }
      expect(buffer.disposed).toBe(false);
    } finally { buffer.dispose(); device.dispose(); }
  });

  it("uses the inverse transpose for skinned graph normals in forward and depth stages", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "normal", op: "input", type: "vec3", name: "normalLocal" },
        { id: "rough", op: "constant", type: "f32", value: 0.5 }
      ], outputs: { normal: "normal", position: "normal", roughness: "rough" }
    };
    for (const skinning of [4, 8] as const) {
      for (const target of ["glsl", "wgsl"] as const) {
        const result = compileShaderGraph(graph, target, { skinning });
        for (const source of [result.vertex!, result.depth!.vertex]) {
          expect(source).toContain("cross(auraGraph_skinBasis[1], auraGraph_skinBasis[2])");
          expect(source).toContain("(auraGraph_skinCofactors * normal) / auraGraph_skinDeterminant");
          expect(source).toContain("auraGraph_skinBasis * normal");
          expect(source).toContain("auraGraph_skinDeterminant");
        }
      }
    }
  });

  it("checks storage texture usage, format and read-only stage metadata", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "image", kind: "storage-texture", access: "read", format: "rgba8unorm", group: 2, binding: 3 }],
      nodes: [
        { id: "coord", op: "constant", type: "vec2", value: [0, 0] },
        { id: "value", op: "textureLoad", type: "vec4", resource: "image", inputs: ["coord"] }
      ], outputs: { color: "value" }
    };
    const image = new Texture({ width: 1, height: 1, format: "rgba8", usage: ["storage", "copy-dst"], data: new Uint8Array(4) });
    const sampledOnly = new Texture({ width: 1, height: 1, format: "rgba8", data: new Uint8Array(4) });
    try {
      expect(() => shaderGraph.material({ graph, storage: { image: { kind: "storage-texture", texture: sampledOnly } } })).toThrow(/live 2D storage texture/);
      const material = createCustomShaderMaterial(shaderGraph.material({ graph, storage: { image: { kind: "storage-texture", texture: image } } }).custom!);
      try {
        expect(material.graphStorageBindings("forward")).toEqual([expect.objectContaining({ name: "image", texture: image, group: 2, binding: 3 })]);
        expect(globalShaderSource(material.shaderKey)?.webgpu?.storageBindings).toEqual([{ kind: "storage-texture", access: "read", group: 2, binding: 3, visibility: "fragment", format: "rgba8unorm", viewDimension: "2d" }]);
      } finally { material.dispose(); }
      expect(image.disposed).toBe(false);
    } finally { image.dispose(); sampledOnly.dispose(); }
  });
});
