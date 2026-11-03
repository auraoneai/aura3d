import { describe, expect, it } from "vitest";
import {
  compileShaderGraph,
  validateShaderGraph,
  type ShaderGraphDocument
} from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";

const graph: ShaderGraphDocument = {
  version: 1,
  stage: "material",
  resources: [
    { name: "albedo", kind: "texture2d" },
    { name: "sceneDepth", kind: "depth2d" },
    { name: "volume", kind: "texture3d" },
    { name: "gain", kind: "uniform", type: "f32" }
  ],
  nodes: [
    { id: "uv", op: "constant", type: "vec2", value: [0.2, 0.6] },
    { id: "uvw", op: "constant", type: "vec3", value: [0.125, 0.5, 0.75] },
    { id: "pixel", op: "constant", type: "vec2", value: [0, 1] },
    { id: "map", op: "textureSample", type: "vec4", resource: "albedo", inputs: ["uv"] },
    { id: "sample", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] },
    { id: "combined", op: "add", type: "vec4", inputs: ["map", "sample"] },
    { id: "xyz", op: "swizzle", type: "vec3", components: "xyz", inputs: ["sample"] },
    { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["pixel"] },
    { id: "depthVector", op: "construct", type: "vec3", inputs: ["depth", "depth", "depth"] },
    { id: "displaced", op: "add", type: "vec3", inputs: ["xyz", "depthVector"] }
  ],
  outputs: { color: "combined", opacity: "depth", position: "displaced" }
};

/** Execute the emitted depth expression against CPU textures with native origins. */
function evaluateDepthExpression(source: string, target: "glsl" | "wgsl", bottomRows: readonly (readonly number[])[]): number {
  const rows = target === "glsl" ? bottomRows : [...bottomRows].reverse();
  const tex = { rows, width: rows[0]!.length, height: rows.length };
  type Point = { x: number; y: number };
  const vec2 = (x: number | Point, y?: number): Point => typeof x === "number" ? { x, y: y! } : x;
  const ivec2 = (x: number | Point, y?: number): Point => {
    const p = vec2(x, y);
    return { x: Math.trunc(p.x), y: Math.trunc(p.y) };
  };
  const fetch = (image: typeof tex, point: Point): number => image.rows[point.y]![point.x]!;
  const identifier = target === "glsl" ? "auraGraph_resource_sceneDepth" : "u_auraGraph_resource_sceneDepthTexture";
  // This fixture produces only compiler-generated constants, constructors and
  // texture operations; no externally supplied shader text is evaluated.
  const expression = source.replaceAll("vec2<f32>", "vec2").replaceAll("vec2<i32>", "ivec2").replaceAll("i32(", "toInt(");
  const run = new Function(identifier, "vec2", "ivec2", "toInt", "texelFetch", "textureLoad", "textureDimensions", `return ${expression};`);
  return run(tex, vec2, ivec2, Math.trunc,
    (image: typeof tex, point: Point) => ({ r: fetch(image, point) }),
    fetch, (image: typeof tex) => ({ x: image.width, y: image.height })) as number;
}

describe("shader graph sampled resources", () => {
  it("keeps material slots and stage-specific 3D sampling compatible with portable bindings", () => {
    const glsl = compileShaderGraph(graph, "glsl");
    const wgsl = compileShaderGraph(graph, "wgsl");
    expect(wgsl.bindings.map(({ name, group, binding, samplerBinding }) => ({ name, group, binding, samplerBinding }))).toEqual([
      { name: "albedo", group: 0, binding: 2, samplerBinding: 1 },
      { name: "sceneDepth", group: 0, binding: 3, samplerBinding: undefined },
      { name: "volume", group: 0, binding: 5, samplerBinding: 4 },
      { name: "gain", group: 0, binding: 0, samplerBinding: undefined }
    ]);
    expect(glsl.vertex).toContain("textureLod(auraGraph_resource_volume, vec3(0.125, 0.5, 0.75), 0.0)");
    expect(glsl.fragment).toContain("texture(auraGraph_resource_volume, vec3(0.125, 0.5, 0.75))");
    expect(wgsl.vertex).toContain("textureSampleLevel(u_auraGraph_resource_volumeTexture, u_auraGraph_resource_volumeSampler");
    expect(wgsl.fragment).toContain("textureSample(u_auraGraph_resource_volumeTexture, u_auraGraph_resource_volumeSampler");
    expect(glsl.vertex).toContain("texelFetch(auraGraph_resource_sceneDepth, ivec2(vec2(0.0, 1.0)), 0).r");
    expect(wgsl.vertex).toContain("textureLoad(u_auraGraph_resource_sceneDepthTexture");
    expect(wgsl.fragment).toContain("textureLoad(u_auraGraph_resource_sceneDepthTexture");
    expect(wgsl.storageStages).toEqual({ forward: [], depth: [] });
    expect(wgsl.depth?.vertex).toContain("textureLoad(u_auraGraph_resource_sceneDepthTexture");
    expect(compileShaderGraph(JSON.parse(JSON.stringify(graph)) as ShaderGraphDocument, "wgsl").key).toBe(wgsl.key);
  });

  it("reads the same lower-left pixel in both backends, including non-square textures and fractional coordinates", () => {
    const rows = [[0.11, 0.12, 0.13], [0.21, 0.22, 0.23], [0.31, 0.32, 0.33], [0.41, 0.42, 0.43]];
    for (const [x, y, expected] of [[0, 0, 0.11], [2, 0, 0.13], [0, 3, 0.41], [2, 3, 0.43], [1.9, 2.4, 0.32]]) {
      const fixture: ShaderGraphDocument = {
        version: 1, stage: "material", resources: [{ name: "sceneDepth", kind: "depth2d" }],
        nodes: [
          { id: "pixel", op: "constant", type: "vec2", value: [x!, y!] },
          { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["pixel"] }
        ], outputs: { opacity: "depth" }
      };
      for (const target of ["glsl", "wgsl"] as const) {
        const result = compileShaderGraph(fixture, target);
        expect(evaluateDepthExpression(result.nodeSources.depth!, target, rows)).toBe(expected);
      }
    }
  });

  it("emits compute declarations and non-overlapping depth, 3D sampler and storage bindings", () => {
    const compute: ShaderGraphDocument = {
      version: 1, stage: "compute",
      resources: [
        { name: "sceneDepth", kind: "depth2d", binding: 0 },
        { name: "volume", kind: "texture3d", binding: 1 },
        { name: "output", kind: "storage-texture", format: "rgba8unorm", access: "write", binding: 3 },
        { name: "measure", kind: "storage-buffer", type: "f32", access: "read_write", binding: 4 }
      ],
      nodes: [
        { id: "pixel", op: "constant", type: "vec2", value: [2, 3] },
        { id: "uvw", op: "constant", type: "vec3", value: [0.1, 0.2, 0.3] },
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["pixel"] },
        { id: "sample", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] }
      ],
      statements: [
        { op: "store", resource: "measure", index: "index", value: "depth" },
        { op: "textureStore", resource: "output", coordinates: "pixel", value: "sample" }
      ]
    };
    expect(validateShaderGraph(compute, "wgsl")).toEqual([]);
    const compiled = compileShaderGraph(compute, "wgsl");
    expect(compiled.bindings.map(({ name, binding, samplerBinding }) => ({ name, binding, samplerBinding }))).toEqual([
      { name: "sceneDepth", binding: 0, samplerBinding: undefined },
      { name: "volume", binding: 1, samplerBinding: 2 },
      { name: "output", binding: 3, samplerBinding: undefined },
      { name: "measure", binding: 4, samplerBinding: undefined }
    ]);
    expect(compiled.compute).toContain("@group(0) @binding(0) var auraGraph_resource_sceneDepth: texture_depth_2d;");
    expect(compiled.compute).toContain("@group(0) @binding(1) var auraGraph_resource_volume: texture_3d<f32>;");
    expect(compiled.compute).toContain("@group(0) @binding(2) var auraGraph_sampler_volume: sampler;");
    expect(compiled.compute).not.toContain("auraGraph_sampler_sceneDepth");
    expect(compiled.compute).toContain("textureLoad(auraGraph_resource_sceneDepth");
    expect(compiled.compute).toContain("textureSampleLevel(auraGraph_resource_volume, auraGraph_sampler_volume");
    expect(compiled.compute).toContain("textureStore(auraGraph_resource_output");
    expect(() => compileShaderGraph(compute, "glsl")).toThrow(/unsupported-backend/);
  });

  it("rejects invalid resource operations, ignored resource options and reserved binding collisions", () => {
    const invalid = (resource: ShaderGraphDocument["resources"] extends readonly (infer R)[] | undefined ? R : never, op: "textureLoad" | "textureSample", coord: "vec2" | "vec3", result: "f32" | "vec4") => {
      const value = coord === "vec2" ? [0, 0] : [0, 0, 0];
      return validateShaderGraph({ version: 1, stage: "material", resources: [resource], nodes: [
        { id: "coord", op: "constant", type: coord, value },
        { id: "fetch", op, type: result, resource: resource.name, inputs: ["coord"] }
      ] }, "wgsl");
    };
    expect(invalid({ name: "image", kind: "texture3d" }, "textureSample", "vec2", "vec4")).toContainEqual(expect.objectContaining({ code: "type-mismatch", nodeId: "fetch" }));
    expect(invalid({ name: "image", kind: "texture2d" }, "textureSample", "vec3", "vec4")).toContainEqual(expect.objectContaining({ code: "type-mismatch", nodeId: "fetch" }));
    expect(invalid({ name: "image", kind: "depth2d" }, "textureSample", "vec2", "vec4")).toContainEqual(expect.objectContaining({ code: "type-mismatch", nodeId: "fetch" }));
    expect(invalid({ name: "image", kind: "depth2d" }, "textureLoad", "vec2", "vec4")).toContainEqual(expect.objectContaining({ code: "type-mismatch", nodeId: "fetch" }));
    expect(invalid({ name: "image", kind: "depth2d", access: "read" }, "textureLoad", "vec2", "f32")).toContainEqual(expect.objectContaining({ code: "invalid-resource" }));
    const collision: ShaderGraphDocument = { version: 1, stage: "compute", nodes: [], resources: [
      { name: "volume", kind: "texture3d", binding: 3 },
      { name: "depth", kind: "depth2d", binding: 4 }
    ] };
    expect(validateShaderGraph(collision, "wgsl")).toContainEqual(expect.objectContaining({ code: "duplicate-binding" }));
    expect(validateShaderGraph({ ...collision, stage: "material" }, "wgsl")).toContainEqual(expect.objectContaining({ code: "invalid-binding" }));
  });

  it("does not permit loading storage textures whose omitted access defaults to write", () => {
    const compute: ShaderGraphDocument = {
      version: 1, stage: "compute", resources: [{ name: "image", kind: "storage-texture", format: "rgba8unorm" }],
      nodes: [{ id: "coord", op: "constant", type: "vec2", value: [0, 0] }, { id: "load", op: "textureLoad", type: "vec4", resource: "image", inputs: ["coord"] }]
    };
    expect(validateShaderGraph(compute, "wgsl")).toContainEqual(expect.objectContaining({ code: "type-mismatch", nodeId: "load" }));
    const readable: ShaderGraphDocument = { ...compute, resources: [{ name: "image", kind: "storage-texture", format: "rgba8unorm", access: "read" }] };
    expect(validateShaderGraph(readable, "wgsl")).toEqual([]);
  });

  it("rejects irrelevant fields and diagnoses malformed storage formats without throwing", () => {
    const invalid: ShaderGraphDocument = { version: 1, stage: "compute", nodes: [], resources: [
      { name: "value", kind: "uniform", type: "f32", format: "r32float" },
      { name: "buffer", kind: "storage-buffer", type: "u32", format: "r32uint" },
      { name: "image", kind: "storage-texture", type: "vec4", format: "rgba8unorm" }
    ] };
    expect(validateShaderGraph(invalid, "wgsl").filter((entry) => entry.code === "invalid-resource")).toHaveLength(3);
    const malformed: ShaderGraphDocument = { version: 1, stage: "compute",
      resources: [{ name: "image", kind: "storage-texture", access: "read", format: 12 as unknown as "rgba8unorm" }],
      nodes: [{ id: "coord", op: "constant", type: "vec2", value: [0, 0] }, { id: "load", op: "textureLoad", type: "vec4", resource: "image", inputs: ["coord"] }]
    };
    expect(validateShaderGraph(malformed, "wgsl").map((entry) => entry.code)).toEqual(expect.arrayContaining(["invalid-resource", "type-mismatch"]));
  });
});
