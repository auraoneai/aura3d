import { describe, expect, expectTypeOf, it } from "vitest";
import * as entry from "@aura3d/engine/shader-graph-runtime";
import * as compiler from "@aura3d/rendering/shader-graph";
import { PortableShaderMaterial } from "@aura3d/rendering";
import * as facade from "../../../packages/engine/src/agent-api/nodes/shaderGraph.js";
import { createCustomShaderMaterial as createOriginalMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import type { AuraCustomMaterialSpec as OriginalMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";

const graph: entry.ShaderGraphDocument = {
  version: 1,
  stage: "material",
  nodes: [
    { id: "position", op: "input", type: "vec3", name: "positionLocal" },
    { id: "roughness", op: "constant", type: "f32", value: 0.5 }
  ],
  outputs: { position: "position", roughness: "roughness" }
};

describe("opt-in shader graph public entry", () => {
  it("passes a recursive graph uniform through the public material adapter", () => {
    const graph = {
      version: 1, stage: "material",
      structs: [
        { name: "Data", fields: [{ name: "layers", type: "array:2:struct:Layer" }, { name: "weights", type: "array:2:f32" }] },
        { name: "Layer", fields: [{ name: "color", type: "vec3" }, { name: "enabled", type: "bool" }] }
      ],
      resources: [{ name: "settings", kind: "uniform", type: "struct:Data" }],
      nodes: [
        { id: "data", op: "uniform", resource: "settings", type: "struct:Data" },
        { id: "layers", op: "structField", name: "layers", type: "array:2:struct:Layer", inputs: ["data"] },
        { id: "index", op: "constant", type: "u32", value: 1 },
        { id: "layer", op: "arrayIndex", type: "struct:Layer", inputs: ["layers", "index"] },
        { id: "color", op: "structField", name: "color", type: "vec3", inputs: ["layer"] },
        { id: "weights", op: "structField", name: "weights", type: "array:2:f32", inputs: ["data"] },
        { id: "weight", op: "arrayIndex", type: "f32", inputs: ["weights", "index"] }
      ],
      outputs: { color: "color", opacity: "weight" }
    } as unknown as entry.ShaderGraphDocument;
    const initial = { layers: [
      { color: [0.1, 0.2, 0.3], enabled: true },
      { color: [0.4, 0.5, 0.6], enabled: false }
    ], weights: [0.25, 0.75] };
    const materialSpec = entry.shaderGraph.material({ graph, backend: "wgsl", uniforms: { settings: initial } });
    const uniform = materialSpec.custom!.uniforms!.auraGraph_resource_settings as any;
    expect(uniform.type).toBe("data");
    expect(uniform.dataType.kind).toBe("struct");
    expect(uniform.value).toEqual(initial);
    const runtime = entry.createCustomShaderMaterial(materialSpec.custom!);
    try {
      const descriptor = runtime.uniformSchema.find((item) => item.name === "u_auraGraph_resource_settings") as any;
      expect(descriptor.kind).toBe("data");
      expect(descriptor.dataType).toEqual(uniform.dataType);
      expect(runtime.getParameter("u_auraGraph_resource_settings")).toEqual(initial);
      expect(runtime.sources.wgsl!.fragment).toContain("aura.u_auraGraph_resource_settings.layers[1u].color");
    } finally { runtime.dispose(); }
    expect(() => entry.shaderGraph.material({ graph, backend: "glsl", uniforms: { settings: initial } })).toThrow(/unsupported-backend/);
  });
  it("preserves the original facade, material, persistence, migration, and compiler bindings", () => {
    expect(entry.shaderGraph).toBe(facade.shaderGraph);
    expect(entry.shaderGraphMaterial).toBe(facade.shaderGraphMaterial);
    expect(entry.createCustomShaderMaterial).toBe(createOriginalMaterial);
    expect(entry.serializeShaderGraph).toBe(facade.serializeShaderGraph);
    expect(entry.deserializeShaderGraph).toBe(facade.deserializeShaderGraph);
    expect(entry.migrateTslShaderGraph).toBe(facade.migrateTslShaderGraph);
    expect(entry.ShaderGraphError).toBe(compiler.ShaderGraphError);
    expect(entry.shaderGraph.material).toBe(entry.shaderGraphMaterial);
    expect(entry.shaderGraph.serialize).toBe(entry.serializeShaderGraph);
    expect(entry.shaderGraph.deserialize).toBe(entry.deserializeShaderGraph);
    expect(entry.shaderGraph.fromTsl).toBe(entry.migrateTslShaderGraph);
    expect(entry.shaderGraph.validate).toBe(compiler.validateShaderGraph);
    expect(entry.shaderGraph.compile).toBe(compiler.compileShaderGraph);
  });

  it("persists a graph canonically and reports malformed input with the shared error class", () => {
    const serialized = entry.serializeShaderGraph(graph);
    const reordered: entry.ShaderGraphDocument = {
      outputs: graph.outputs,
      nodes: graph.nodes,
      stage: graph.stage,
      version: graph.version
    };
    expect(entry.shaderGraph.serialize(reordered)).toBe(serialized);
    expect(entry.deserializeShaderGraph(serialized)).toEqual(graph);
    expect(() => entry.deserializeShaderGraph("{invalid")).toThrow(entry.ShaderGraphError);
    expect(() => entry.shaderGraph.compile({ ...graph, nodes: [] }, "wgsl")).toThrow(entry.ShaderGraphError);
  });

  it("passes the original graph material spec through the existing clipping certificate", () => {
    const options: entry.ShaderGraphMaterialOptions = { graph };
    const spec = entry.shaderGraph.material(options).custom!;
    const material = entry.createCustomShaderMaterial(spec, "public-graph-original");
    const copy = entry.createCustomShaderMaterial({ ...spec }, "public-graph-copy");
    try {
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(true);
      expect(PortableShaderMaterial.hasGraphClippingContract(copy)).toBe(false);
    } finally {
      copy.dispose();
      material.dispose();
    }
  });

  it("exposes the original graph and material types", () => {
    expectTypeOf<entry.AuraCustomMaterialSpec>().toEqualTypeOf<OriginalMaterialSpec>();
    expectTypeOf<entry.ShaderGraphMaterialOptions>().toEqualTypeOf<facade.ShaderGraphMaterialOptions>();
    expectTypeOf<entry.ShaderGraphStorageValue>().toEqualTypeOf<facade.ShaderGraphStorageValue>();
    expectTypeOf<entry.LegacyShaderGraphMigration>().toEqualTypeOf<facade.LegacyShaderGraphMigration>();
    expectTypeOf<entry.ShaderGraphDocument>().toEqualTypeOf<compiler.ShaderGraphDocument>();
    expectTypeOf<entry.ShaderGraphNode>().toEqualTypeOf<compiler.ShaderGraphNode>();
    expectTypeOf<entry.ShaderGraphResource>().toEqualTypeOf<compiler.ShaderGraphResource>();
    expectTypeOf<entry.ShaderGraphMaterialOutput>().toEqualTypeOf<compiler.ShaderGraphMaterialOutput>();
    expectTypeOf<entry.ShaderGraphValueType>().toEqualTypeOf<compiler.ShaderGraphValueType>();
    expectTypeOf<entry.ShaderGraphTarget>().toEqualTypeOf<compiler.ShaderGraphTarget>();
    expectTypeOf<entry.ShaderGraphCompileResult>().toEqualTypeOf<compiler.ShaderGraphCompileResult>();
    expectTypeOf<entry.ShaderGraphDiagnostic>().toEqualTypeOf<compiler.ShaderGraphDiagnostic>();
    expectTypeOf<entry.ShaderGraphBuiltin>().toEqualTypeOf<compiler.ShaderGraphBuiltin>();
    expectTypeOf<entry.ShaderGraphOperation>().toEqualTypeOf<compiler.ShaderGraphOperation>();
    expectTypeOf<entry.ShaderGraphStatement>().toEqualTypeOf<compiler.ShaderGraphStatement>();
    expectTypeOf<entry.ShaderGraphBinding>().toEqualTypeOf<compiler.ShaderGraphBinding>();
    expectTypeOf<entry.ShaderGraphStageData>().toEqualTypeOf<compiler.ShaderGraphStageData>();
    expectTypeOf<entry.ShaderGraphStorageStageBinding>().toEqualTypeOf<compiler.ShaderGraphStorageStageBinding>();
  });
});
