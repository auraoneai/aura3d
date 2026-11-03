import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShaderGraph, validateShaderGraph, type ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler.js";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { tsl } from "../../../packages/engine/src/agent-api/nodes/tsl/index.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { DepthPass } from "../../../packages/rendering/src/DepthPass.js";
import { Geometry } from "../../../packages/rendering/src/Geometry.js";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer.js";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat.js";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice.js";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore.js";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator.js";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures.js";

const graph: ShaderGraphDocument = {
  version: 1, stage: "material", alphaTest: 0.4,
  resources: [{ name: "image", kind: "texture2d" }, { name: "gain", kind: "uniform", type: "f32" }],
  nodes: [
    { id: "uv", op: "input", type: "vec2", name: "uv0" },
    { id: "sample", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
    { id: "gain", op: "uniform", type: "f32", resource: "gain" }
  ], outputs: { color: "sample", opacity: "gain" }
};

function buildMaterial() {
  const tex = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 80, 0, 128]) });
  const spec = shaderGraph.material({ graph, uniforms: { image: tex, gain: 0.5 } }).custom!;
  return createCustomShaderMaterial(spec);
}

describe("portable shader graph alpha coverage", () => {
  it("migrates the legacy threshold, validates it, and includes it in serialization and shader identity", () => {
    const tex = texture.data({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 128]) });
    const migrated = shaderGraph.fromTsl({ colorNode: tsl.texture(tex, tsl.uv(), { name: "image" }), opacityNode: 0.5, alphaTest: 0.4 });
    expect(migrated.graph.alphaTest).toBe(0.4);
    expect(shaderGraph.deserialize(shaderGraph.serialize(migrated.graph))).toEqual(migrated.graph);
    const native = material.node({ backend: "wgsl", colorNode: tsl.texture(tex, tsl.uv(), { name: "image" }), alphaTest: 0.4 });
    expect(native.custom?.castShadow).toBe(true);
    const unchanged = { ...graph, alphaTest: 0 };
    expect(compileShaderGraph(graph, "wgsl").key).not.toBe(compileShaderGraph(unchanged, "wgsl").key);
    expect(compileShaderGraph(unchanged, "wgsl").material?.alphaTest).toBeUndefined();
    expect(compileShaderGraph(unchanged, "wgsl").depth).toBeUndefined();
    for (const invalid of [-1, 1.1, NaN, Infinity, "0.5"] as unknown[]) {
      expect(validateShaderGraph({ ...graph, alphaTest: invalid as number }).map((d) => d.code)).toContain("invalid-alpha-test");
    }
    expect(validateShaderGraph({ version: 1, stage: "compute", nodes: [], alphaTest: 0 }).map((d) => d.code)).toContain("invalid-alpha-test");
  });

  it.each(["glsl", "wgsl"] as const)("emits matching sampled coverage in %s forward and shadow variants", (target) => {
    for (const skinning of [undefined, 4, 8] as const) {
      const result = compileShaderGraph(graph, target, { skinning });
      expect(result.material?.alphaTest).toBe(0.4);
      expect(result.fragment).toContain(target === "glsl" ? "texture(auraGraph_resource_image" : "textureSample(u_auraGraph_resource_imageTexture");
      expect(result.depth?.fragment).toContain(target === "glsl" ? "texture(auraGraph_resource_image" : "textureSample(u_auraGraph_resource_imageTexture");
      expect(result.fragment).toContain("< 0.4");
      expect(result.depth?.fragment).toContain("< 0.4");
      expect(result.depth?.fragment).toContain(target === "glsl" ? "auraGraph_v_uv0" : "input.v_uv0");
    }
  });

  it("rejects coverage that changes between camera and shadow passes", () => {
    for (const name of ["depth", "viewportUV", "cameraPosition"] as const) {
      const type = name === "depth" ? "f32" : name === "viewportUV" ? "vec2" : "vec3";
      const nodes: ShaderGraphDocument["nodes"] = type === "f32"
        ? [{ id: "input", op: "input", name, type }]
        : [{ id: "input", op: "input", name, type }, { id: "component", op: "swizzle", type: "f32", inputs: ["input"], components: "x" }];
      const unsafe: ShaderGraphDocument = { version: 1, stage: "material", alphaTest: 0.5, nodes, outputs: { opacity: type === "f32" ? "input" : "component" } };
      expect(validateShaderGraph(unsafe).map((d) => d.code)).toContain("alpha-test-shadow-unsupported");
    }
  });

  it("rejects the separate generated-program route until it has matching graph shadows", () => {
    const compiled = compileShaderGraph(graph, "glsl");
    const features = normalizeProgramFeatures({ lighting: "unlit", graph: compiled });
    expect(() => generateProgramImpl(features)).toThrow(/GRAPH_ALPHA_TEST_GENERATED_PROGRAM_UNSUPPORTED/);
  });

  it("includes alpha-reachable storage in the shadow fragment binding layout", () => {
    const storage: ShaderGraphDocument = {
      version: 1, stage: "material", alphaTest: 0.5,
      resources: [{ name: "values", kind: "storage-buffer", type: "f32", access: "read", group: 1, binding: 0 }],
      nodes: [{ id: "i", op: "constant", type: "u32", value: 0 },
        { id: "a", op: "storageLoad", type: "f32", resource: "values", inputs: ["i"] }],
      outputs: { opacity: "a" }
    };
    const compiled = compileShaderGraph(storage, "wgsl");
    expect(compiled.storageStages?.depth).toEqual([{ name: "values", visibility: "fragment" }]);
    expect(compiled.depth?.fragment).toContain("var<storage, read> auraGraph_resource_values");
    expect(compiled.depth?.fragment).toContain("auraGraph_resource_values[0u]");
  });

  it("binds sampled texture and numeric uniforms into the actual shadow depth source and draw", () => {
    const runtime = buildMaterial();
    const device = new MockRenderDevice();
    const vb = new VertexBuffer(VertexFormat.P3N3T2, 3);
    for (let i = 0; i < 3; i++) {
      vb.setAttribute(i, "position", [i === 1 ? 1 : 0, i === 2 ? 1 : 0, 0]);
      vb.setAttribute(i, "normal", [0, 0, 1]);
      vb.setAttribute(i, "uv", [i === 1 ? 1 : 0, i === 2 ? 1 : 0]);
    }
    const geometry = new Geometry(vb);
    try {
      expect(runtime.customDepthShaderKey).toBeDefined();
      for (const key of [runtime.customDepthShaderKey!, ...Object.values(runtime.graphSkinningDepthShaderKeys!)]) {
        const pair = globalShaderSource(key)!;
        expect(pair.fragment).toContain("uniform sampler2D u_auraGraph_resource_image;");
        expect(pair.fragment).toContain("uniform float u_auraGraph_resource_gain;");
        expect(pair.fragment).toContain("< 0.4");
        expect(pair.webgpu?.fragment).toContain("< 0.4");
      }
      device.beginFrame(16, 16);
      new DepthPass({ casters: [{ geometry, material: runtime, label: "alpha" }] }).execute({ device, width: 16, height: 16 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.uniforms?.get("u_auraGraph_resource_gain")).toBe(0.5);
      expect(device.drawCommands[0]!.uniforms?.get("u_auraGraph_resource_image")).toBeDefined();
      device.endFrame();
    } finally { geometry.dispose(); runtime.dispose(); device.dispose(); }
  });

  it.runIf(spawnSync("glslangValidator", ["--version"]).status === 0)("links the real GLSL forward, shadow, and skinned shadow stages offline", () => {
    const runtime = buildMaterial();
    const dir = mkdtempSync(join(tmpdir(), "aura3d-graph-alpha-"));
    try {
      for (const key of [runtime.shaderKey, runtime.customDepthShaderKey!, ...Object.values(runtime.graphSkinningDepthShaderKeys!)]) {
        const pair = globalShaderSource(key)!;
        const vertex = join(dir, "graph.vert"), fragment = join(dir, "graph.frag");
        writeFileSync(vertex, pair.vertex); writeFileSync(fragment, pair.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); runtime.dispose(); }
  });
});
