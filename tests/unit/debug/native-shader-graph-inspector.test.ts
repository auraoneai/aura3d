import { describe, expect, it, vi } from "vitest";
import * as shaderCompiler from "@aura3d/rendering/shader-graph";
import type { ShaderGraphDocument, ShaderGraphResource, ShaderGraphTarget } from "@aura3d/rendering/shader-graph";
import { ShaderGraphInspector } from "../../../packages/debug/src/ShaderGraphInspector";

const materialGraph: ShaderGraphDocument = {
  version: 1,
  stage: "material",
  resources: [
    { name: "private_volume", kind: "texture3d" },
    { name: "private_depth", kind: "depth2d" }
  ],
  nodes: [
    { id: "private_uvw", op: "constant", type: "vec3", value: [0.125, 0.375, 0.625] },
    { id: "private_pixel", op: "constant", type: "vec2", value: [34, 56] },
    { id: "private_color", op: "textureSample", type: "vec4", resource: "private_volume", inputs: ["private_uvw"] },
    { id: "private_depth_value", op: "textureLoad", type: "f32", resource: "private_depth", inputs: ["private_pixel"] }
  ],
  outputs: { color: "private_color", roughness: "private_depth_value" }
};

const computeGraph: ShaderGraphDocument = {
  version: 1,
  stage: "compute",
  resources: [
    { name: "private_volume", kind: "texture3d", group: 2, binding: 5 },
    { name: "private_depth", kind: "depth2d", group: 2, binding: 7 },
    { name: "private_colors", kind: "storage-buffer", type: "vec4", access: "write", group: 3, binding: 0 },
    { name: "private_depths", kind: "storage-buffer", type: "f32", access: "write", group: 3, binding: 1 }
  ],
  nodes: [
    ...materialGraph.nodes,
    { id: "private_index", op: "constant", type: "u32", value: 0 }
  ],
  statements: [
    { op: "store", resource: "private_colors", index: "private_index", value: "private_color" },
    { op: "store", resource: "private_depths", index: "private_index", value: "private_depth_value" }
  ]
};

function inspect(graph: ShaderGraphDocument, target: ShaderGraphTarget = "wgsl") {
  return new ShaderGraphInspector({ getShaderGraph: () => graph }).inspect(target);
}

describe("shader graph inspection", () => {
  it.each(["glsl", "wgsl"] as const)("summarizes 3D and depth material bindings safely for %s", (target) => {
    const report = inspect(materialGraph, target);

    expect(report).toMatchObject({ status: "compiled", target, stage: "material", outputs: ["color", "roughness"], requiresLighting: true });
    expect(report.bindings).toEqual([
      { kind: "texture3d", group: 0, binding: 2, samplerBinding: 1, type: null, access: null, format: null },
      { kind: "depth2d", group: 0, binding: 3, samplerBinding: null, type: null, access: null, format: null }
    ]);
    expect(report.shaderStages.map(({ stage }) => stage)).toEqual(["vertex", "fragment"]);
    expect(report.expressions.map(({ nodeIndex }) => nodeIndex)).toEqual([0, 1, 2, 3]);
    expect(JSON.stringify(report)).not.toMatch(/private_|0\.125|0\.375|0\.625|\b34\b|\b56\b/);
  });

  it("reports distinct compute sampler and depth slots without including the graph's identifiers", () => {
    const report = inspect(computeGraph);

    expect(report).toMatchObject({ status: "compiled", target: "wgsl", stage: "compute", outputs: [], requiresLighting: null });
    expect(report.bindings).toEqual([
      { kind: "texture3d", group: 2, binding: 5, samplerBinding: 6, type: null, access: null, format: null },
      { kind: "depth2d", group: 2, binding: 7, samplerBinding: null, type: null, access: null, format: null },
      { kind: "storage-buffer", group: 3, binding: 0, samplerBinding: null, type: "vec4", access: "write", format: null },
      { kind: "storage-buffer", group: 3, binding: 1, samplerBinding: null, type: "f32", access: "write", format: null }
    ]);
    expect(report.shaderStages.map(({ stage }) => stage)).toEqual(["compute"]);
    expect(report.expressions.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/private_|0\.125|0\.375|0\.625/);
  });

  it("returns generic, indexed diagnostics for invalid texture coordinates and results", () => {
    const invalid: ShaderGraphDocument = {
      ...materialGraph,
      nodes: materialGraph.nodes.map((node) => {
        if (node.id === "private_color") return { ...node, inputs: ["private_pixel"] };
        if (node.id === "private_depth_value") return { ...node, type: "vec3" };
        return node;
      }),
      outputs: { color: "private_color" }
    };
    const report = inspect(invalid);

    expect(report).toMatchObject({ status: "error", stage: "material", bindings: [], expressions: [] });
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      { code: "type-mismatch", message: "Connected ports or output types do not match.", nodeIndex: 2 },
      { code: "type-mismatch", message: "Connected ports or output types do not match.", nodeIndex: 3 }
    ]));
    expect(JSON.stringify(report)).not.toMatch(/private_|texture3d|depth2d|0\.125/);
  });

  it("sanitizes resource and sampler-collision errors and preserves the backend diagnostic", () => {
    const invalidResource: ShaderGraphDocument = {
      ...materialGraph,
      resources: [
        { name: "private_volume", kind: "texture3d", format: "private_format" } as unknown as ShaderGraphResource,
        { name: "private_depth", kind: "depth2d", access: "read" }
      ]
    };
    const resourceReport = inspect(invalidResource);
    expect(resourceReport.diagnostics).toEqual(expect.arrayContaining([
      { code: "invalid-resource", message: "Check the resource kind, format, access and value type.", nodeIndex: null }
    ]));
    expect(JSON.stringify(resourceReport)).not.toMatch(/private_|texture3d|depth2d/);

    const invalidMaterialBinding: ShaderGraphDocument = {
      ...materialGraph,
      resources: materialGraph.resources!.map((resource) => resource.kind === "texture3d" ? { ...resource, binding: 15 } : resource)
    };
    const bindingReport = inspect(invalidMaterialBinding);
    expect(bindingReport.diagnostics).toContainEqual({ code: "invalid-binding", message: "Check the resource group and binding against the shader stage's layout.", nodeIndex: null });
    expect(JSON.stringify(bindingReport)).not.toMatch(/private_|\b15\b/);

    const collision: ShaderGraphDocument = {
      ...computeGraph,
      resources: computeGraph.resources!.map((resource) => resource.kind === "depth2d" ? { ...resource, binding: 6 } : resource)
    };
    const collisionReport = inspect(collision);
    expect(collisionReport.diagnostics).toContainEqual({ code: "duplicate-binding", message: "Resources cannot occupy the same binding.", nodeIndex: null });
    expect(JSON.stringify(collisionReport)).not.toMatch(/private_|2:6/);

    const backendReport = inspect(computeGraph, "glsl");
    expect(backendReport.diagnostics).toContainEqual({ code: "unsupported-backend", message: "This operation or resource is unavailable on the selected backend.", nodeIndex: null });
    expect(JSON.stringify(backendReport)).not.toMatch(/private_/);
  });

  it("does not expose irrelevant graph-owned fields even if compiler metadata contains them", () => {
    const graph: ShaderGraphDocument = {
      version: 1,
      stage: "material",
      nodes: [],
      resources: [
        { name: "private_uniform", kind: "uniform", type: "f32" },
        { name: "private_storage", kind: "storage-texture", format: "rgba8unorm", access: "read" }
      ]
    };
    const result = shaderCompiler.compileShaderGraph(graph, "wgsl");
    const compiler = vi.spyOn(shaderCompiler, "compileShaderGraph").mockReturnValue({
      ...result,
      bindings: result.bindings.map((binding) => binding.kind === "uniform"
        ? { ...binding, format: "private_uniform_format" as never }
        : { ...binding, type: "private_storage_type" as never })
    });
    try {
      const report = inspect(graph);

      expect(report.status).toBe("compiled");
      expect(report.bindings).toEqual([
        { kind: "uniform", group: 0, binding: 0, samplerBinding: null, type: "f32", access: null, format: null },
        { kind: "storage-texture", group: 1, binding: 0, samplerBinding: null, type: null, access: "read", format: "rgba8unorm" }
      ]);
      expect(JSON.stringify(report)).not.toMatch(/private_/);

      compiler.mockReturnValue({
        ...result,
        bindings: result.bindings.map((binding) => binding.kind === "uniform"
          ? { ...binding, type: "private_uniform_type" as never }
          : { ...binding, access: "private_storage_access" as never, format: "private_storage_format" as never })
      });
      const unrecognized = inspect(graph);
      expect(unrecognized.bindings.map(({ type, access, format }) => ({ type, access, format }))).toEqual([
        { type: null, access: null, format: null },
        { type: null, access: null, format: null }
      ]);
      expect(JSON.stringify(unrecognized)).not.toMatch(/private_/);
    } finally {
      compiler.mockRestore();
    }

    const invalid: ShaderGraphDocument = {
      ...graph,
      resources: [
        { name: "private_uniform", kind: "uniform", type: "f32", format: "private_uniform_format" } as unknown as ShaderGraphResource,
        { name: "private_storage", kind: "storage-texture", type: "private_storage_type", format: "rgba8unorm", access: "read" } as unknown as ShaderGraphResource
      ]
    };
    const failure = inspect(invalid);
    expect(failure.status).toBe("error");
    expect(failure.diagnostics).toEqual([
      { code: "invalid-resource", message: "Check the resource kind, format, access and value type.", nodeIndex: null },
      { code: "invalid-resource", message: "Check the resource kind, format, access and value type.", nodeIndex: null }
    ]);
    expect(JSON.stringify(failure)).not.toMatch(/private_/);
  });

  it("retains useful generic diagnostics for graph and loop limits", () => {
    const tooManyNodes: ShaderGraphDocument = {
      version: 1,
      stage: "material",
      nodes: Array.from({ length: 513 }, (_, i) => ({ id: `private_node_${i}`, op: "constant" as const, type: "f32" as const, value: i }))
    };
    expect(inspect(tooManyNodes).diagnostics).toEqual([
      { code: "graph-limit", message: "Graph exceeds a supported complexity limit.", nodeIndex: null }
    ]);

    const badLoop: ShaderGraphDocument = {
      version: 1,
      stage: "compute",
      nodes: [],
      statements: [{ op: "loop", index: "private_loop", count: 1025, body: [] }]
    };
    const loopReport = inspect(badLoop);
    expect(loopReport.diagnostics).toEqual([
      { code: "invalid-loop", message: "A compute loop has an invalid iteration count.", nodeIndex: null }
    ]);
    expect(JSON.stringify(loopReport)).not.toMatch(/private_loop|1025/);
  });
});
