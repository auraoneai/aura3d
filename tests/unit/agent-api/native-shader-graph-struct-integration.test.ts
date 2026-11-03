import { describe, expect, expectTypeOf, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as entry from "@aura3d/engine/shader-graph-runtime";
import type * as compiler from "@aura3d/rendering/shader-graph";
import { MockRenderDevice, type PortableShaderMaterial } from "@aura3d/rendering";
import { ShaderGraphModel } from "../../../packages/editor-runtime/src/ShaderGraphModel";
import { parseEditorProject, serializeEditorProject } from "../../../packages/editor-runtime/src/ProjectSerializer";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { material as materialFactory } from "../../../packages/engine/src/agent-api/nodes/material";
import { EditorViewport } from "../../../apps/editor/src/viewport/EditorViewport";

const structures: readonly entry.ShaderGraphStruct[] = [
  { name: "Surface", fields: [{ name: "position", type: "vec3" }, { name: "alpha", type: "f32" }] },
  { name: "Other", fields: [{ name: "alpha", type: "vec2" }] }
];

const functions: readonly entry.ShaderGraphFunction[] = [
  {
    name: "fade",
    parameters: [{ name: "coord", type: "vec2" }, { name: "strength", type: "f32" }],
    returnType: "f32",
    nodes: [
      { id: "p", op: "parameter", name: "coord", type: "vec2" },
      { id: "s", op: "parameter", name: "strength", type: "f32" },
      { id: "n", op: "noise", type: "f32", inputs: ["p"] },
      { id: "result", op: "mul", type: "f32", inputs: ["n", "s"] }
    ],
    output: "result"
  },
  {
    name: "zero",
    parameters: [],
    returnType: "f32",
    nodes: [{ id: "result", op: "constant", type: "f32", value: 0 }],
    output: "result"
  }
];

function editorGraph(): entry.ShaderGraphDocument {
  return {
    version: 1,
    stage: "material",
    structs: structures,
    functions,
    nodes: [
      { id: "position", op: "input", name: "positionLocal", type: "vec3" },
      { id: "uv", op: "input", name: "uv0", type: "vec2" },
      { id: "strength", op: "constant", type: "f32", value: 0.5 },
      { id: "unsigned", op: "constant", type: "u32", value: 1 },
      { id: "sample", op: "noise", type: "f32" },
      { id: "fade", op: "call", name: "fade", type: "f32" },
      { id: "zero", op: "call", name: "zero", type: "f32" },
      { id: "surface", op: "structConstruct", type: "struct:Surface" },
      { id: "alpha", op: "structField", name: "alpha", type: "f32" },
      { id: "point", op: "structField", name: "position", type: "vec3" },
      { id: "other", op: "structConstruct", type: "struct:Other", inputs: ["uv"] },
      { id: "param", op: "parameter", name: "coord", type: "vec2" }
    ],
    outputs: { color: "position", position: "point", opacity: "alpha" }
  };
}

function finishedEditorGraph(): entry.ShaderGraphDocument {
  const graph = editorGraph();
  const inputs: Readonly<Record<string, readonly string[]>> = {
    sample: ["uv"], fade: ["uv", "sample"], surface: ["position", "fade"], alpha: ["surface"], point: ["surface"]
  };
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== "param").map((node) => inputs[node.id] ? { ...node, inputs: inputs[node.id] } : node)
  };
}

function storageGraph(): entry.ShaderGraphDocument {
  return {
    version: 1,
    stage: "material",
    alphaTest: 0.4,
    structs: [
      { name: "Outer", fields: [{ name: "position", type: "vec3" }, { name: "inner", type: "struct:Inner" }] },
      { name: "Inner", fields: [
        { name: "color", type: "vec3" },
        { name: "alpha", type: "f32" },
        { name: "ids", type: "uvec3" },
        { name: "count", type: "u32" },
        { name: "signed", type: "i32" }
      ] }
    ],
    functions: [functions[0]!],
    resources: [
      { name: "surfaceData", kind: "storage-buffer", type: "struct:Outer", access: "read" },
      { name: "sceneDepth", kind: "depth2d" }
    ],
    nodes: [
      { id: "auraGraphReflection0", op: "constant", type: "u32", value: 0 },
      { id: "uv", op: "input", name: "uv0", type: "vec2" },
      { id: "loaded", op: "storageLoad", type: "struct:Outer", resource: "surfaceData", inputs: ["auraGraphReflection0"] },
      { id: "inner", op: "structField", name: "inner", type: "struct:Inner", inputs: ["loaded"] },
      { id: "position", op: "structField", name: "position", type: "vec3", inputs: ["loaded"] },
      { id: "color", op: "structField", name: "color", type: "vec3", inputs: ["inner"] },
      { id: "alpha", op: "structField", name: "alpha", type: "f32", inputs: ["inner"] },
      { id: "fadedAlpha", op: "call", name: "fade", type: "f32", inputs: ["uv", "alpha"] },
      { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["uv"] },
      { id: "depthColor", op: "construct", type: "vec3", inputs: ["depth", "depth", "depth"] },
      { id: "shaded", op: "mul", type: "vec3", inputs: ["color", "depthColor"] }
    ],
    outputs: { position: "position", color: "shaded", opacity: "fadedAlpha" }
  };
}

describe("shader graph struct, noise and function integration", () => {
  it("offers signature- and field-typed ports and persists an edited material", () => {
    const model = new ShaderGraphModel(editorGraph());
    expect(model.inputPorts("param")).toEqual([]);
    expect(model.inputPorts("zero")).toEqual([]);
    expect(model.inputPorts("sample")).toMatchObject([{ acceptedTypes: ["f32", "vec2", "vec3", "vec4"] }]);
    expect(model.canConnect("unsigned", "sample", 0)).toBe(false);
    expect(model.inputPorts("fade")).toMatchObject([
      { name: "coord", acceptedTypes: ["vec2"] },
      { name: "strength", acceptedTypes: ["f32"] }
    ]);
    expect(model.inputPorts("surface")).toMatchObject([
      { name: "position", acceptedTypes: ["vec3"] },
      { name: "alpha", acceptedTypes: ["f32"] }
    ]);
    expect(model.inputPorts("alpha")[0]?.acceptedTypes).toEqual(["struct:Surface"]);
    expect(model.canConnect("other", "alpha", 0)).toBe(false);
    expect(model.canConnect("uv", "fade", 1)).toBe(false);
    expect(model.canConnect("strength", "surface", 2)).toBe(false);
    expect(model.validate().some((diagnostic) => diagnostic.code === "invalid-scope" && diagnostic.nodeId === "param")).toBe(true);

    model.removeNode("param");
    model.connect("uv", "sample", 0);
    model.connect("uv", "fade", 0);
    model.connect("sample", "fade", 1);
    model.connect("position", "surface", 0);
    model.connect("fade", "surface", 1);
    model.connect("surface", "alpha", 0);
    model.connect("surface", "point", 0);
    const graph = model.snapshot();
    expect(graph).toEqual(finishedEditorGraph());
    expect(model.validate()).toEqual([]);
    const originalFragment = model.compile("glsl").fragment;
    model.connect("strength", "fade", 1);
    expect(model.compile("glsl").fragment).not.toEqual(originalFragment);
    expect(model.undo()).toBe(true);
    expect(model.snapshot()).toEqual(graph);
    expect(model.redo()).toBe(true);
    expect(model.undo()).toBe(true);

    const project = { schema: "a3d-editor-project" as const, name: "Graph", nodes: [], shaderGraphs: [{ id: "surface", name: "Surface", graph }] };
    const saved = parseEditorProject(serializeEditorProject(project)).shaderGraphs![0]!.graph;
    expect(saved).toEqual(graph);
    expect(entry.deserializeShaderGraph(entry.serializeShaderGraph(saved))).toEqual(graph);
    const spec = entry.shaderGraphMaterial({ graph: saved }).custom!;
    const material = entry.createCustomShaderMaterial(spec);
    const device = new MockRenderDevice();
    try {
      expect(material.compile(device).ok).toBe(true);
      expect(globalShaderSource(material.shaderKey)?.fragment).toContain("auraGraph_fn_vfade");
      expect(globalShaderSource(material.shaderKey)?.webgpu?.fragment).toContain("auraGraph_fn_vfade");
    } finally {
      material.dispose();
      device.dispose();
    }
  });

  it("emits graph declarations once in global scope of generated GLSL stages", () => {
    const graph = finishedEditorGraph();
    const compiled = entry.shaderGraph.compile(graph, "glsl");
    const forward = generateProgramImpl(normalizeProgramFeatures({ graph: compiled, lighting: "unlit" }));
    for (const [source, declarations] of [
      [forward.vertex, compiled.material!.vertex.declarations!],
      [forward.fragment, compiled.material!.fragment.declarations!]
    ] as const) {
      for (const declaration of declarations) {
        const index = source.indexOf(declaration);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(source.indexOf(declaration, index + declaration.length)).toBe(-1);
        expect(index).toBeLessThan(source.indexOf("void main()"));
      }
      expect(source).toContain("auraGraph_struct_vSurface");
      expect(source).toContain("auraGraph_noise2");
      expect(source).toContain("auraGraph_fn_vfade");
    }
    const depth = generateProgramImpl(normalizeProgramFeatures({ graph: compiled, pass: "depth", lighting: "unlit" }));
    expect(depth.vertex).toContain("auraGraph_fn_vfade");
    expect(depth.vertex.indexOf("auraGraph_fn_vfade")).toBeLessThan(depth.vertex.indexOf("void main()"));
    expect(depth.vertex).toContain(compiled.material!.vertex.outputs.position);
  });

  it("tracks definition edits, signature changes and missing references through undo", () => {
    const model = new ShaderGraphModel(finishedEditorGraph());
    const changed = structuredClone(structures[0]!);
    (changed.fields as entry.ShaderGraphStructField[]).reverse();
    model.setStruct(changed);
    expect(model.inputPorts("surface").map((port) => [port.name, port.acceptedTypes])).toEqual([
      ["alpha", ["f32"]], ["position", ["vec3"]]
    ]);
    expect(model.validate().some((diagnostic) => diagnostic.nodeId === "surface" && diagnostic.code === "type-mismatch")).toBe(true);
    (changed.fields as entry.ShaderGraphStructField[]).reverse();
    expect(model.inputPorts("surface")[0]?.name).toBe("alpha");
    expect(model.undo()).toBe(true);
    expect(model.inputPorts("surface")[0]?.name).toBe("position");
    model.removeFunction("fade");
    expect(model.inputPorts("fade")).toEqual([]);
    expect(model.validate().some((diagnostic) => diagnostic.code === "missing-function")).toBe(true);
    expect(model.undo()).toBe(true);
    const replacement = { ...functions[0]!, parameters: [{ name: "coord", type: "vec3" as const }, functions[0]!.parameters[1]!] };
    model.setFunction(replacement);
    expect(model.inputPorts("fade")[0]?.acceptedTypes).toEqual(["vec3"]);
    expect(model.undo()).toBe(true);
    model.removeStruct("Surface");
    expect(model.validate().some((diagnostic) => diagnostic.code === "invalid-type")).toBe(true);
    expect(model.undo()).toBe(true);
    expect(model.validate()).toEqual([]);
    expect(() => model.removeFunction("missing")).toThrow(/not found/);
    expect(() => model.removeStruct("missing")).toThrow(/not found/);
  });

  it("installs the edited graph through material.node and the actual editor viewport", () => {
    const graph = finishedEditorGraph();
    const project = { schema: "a3d-editor-project" as const, name: "Viewport", nodes: [], shaderGraphs: [{ id: "graph", name: "Graph", graph }] };
    const saved = parseEditorProject(serializeEditorProject(project)).shaderGraphs![0]!.graph;
    const spec = materialFactory.node({ graph: saved }).custom!;
    expect(spec.glsl.fragment).toContain("auraGraph_fn_vfade");
    expect(spec.wgsl?.fragment).toContain("auraGraph_fn_vfade");
    const device = new MockRenderDevice();
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    const graphMaterials = new Map<string, PortableShaderMaterial>();
    Object.assign(viewport, { renderer: { device }, graphMaterialSerial: 0, graphMaterials, textureAssets: new Map(), meshAssets: new Map() });
    try {
      expect(viewport.setShaderGraph("node", saved, {})).toEqual({ ok: true, diagnostics: [] });
      const installed = graphMaterials.get("node")!;
      expect(installed.sources.glsl.fragment).toContain("auraGraph_struct_vSurface");
      expect(installed.sources.glsl.fragment).toContain("auraGraph_fn_vfade");
      const invalid = { ...saved, functions: [] };
      expect(viewport.setShaderGraph("node", invalid, {}).ok).toBe(false);
      expect(graphMaterials.get("node")).toBe(installed);
      expect(installed.disposed).toBe(false);
      expect(viewport.setShaderGraph("node", null, {}).ok).toBe(true);
      expect(installed.disposed).toBe(true);
    } finally {
      device.dispose();
    }
  });

  it("declares sampled depth and 3D resources on the generated GLSL path", () => {
    const graph: entry.ShaderGraphDocument = {
      version: 1, stage: "material",
      resources: [
        { name: "volume", kind: "texture3d" },
        { name: "depth", kind: "depth2d" },
        { name: "gain", kind: "uniform", type: "f32" }
      ],
      nodes: [
        { id: "uvw", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
        { id: "pixel", op: "constant", type: "vec2", value: [1, 2] },
        { id: "sample", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] },
        { id: "position", op: "swizzle", type: "vec3", components: "xyz", inputs: ["sample"] },
        { id: "depth", op: "textureLoad", type: "f32", resource: "depth", inputs: ["pixel"] },
        { id: "gain", op: "uniform", type: "f32", resource: "gain" },
        { id: "opacity", op: "mul", type: "f32", inputs: ["depth", "gain"] }
      ],
      outputs: { position: "position", color: "sample", opacity: "opacity" }
    };
    const compiled = entry.shaderGraph.compile(graph, "glsl");
    const generated = generateProgramImpl(normalizeProgramFeatures({ graph: compiled, lighting: "unlit" }));
    for (const source of [generated.vertex, generated.fragment]) {
      expect(source).toContain("uniform highp sampler3D auraGraph_resource_volume;");
      expect(source).toContain("uniform sampler2D auraGraph_resource_depth;");
      expect(source).toContain("uniform float auraGraph_resource_gain;");
    }
    expect(generated.vertex).toContain("textureLod(auraGraph_resource_volume");
    expect(generated.fragment).toContain("texelFetch(auraGraph_resource_depth");
    if (spawnSync("glslangValidator", ["--version"]).status === 0) {
      const dir = mkdtempSync(join(tmpdir(), "aura3d-graph-samplers-"));
      try {
        const vertex = join(dir, "graph.vert");
        const fragment = join(dir, "graph.frag");
        writeFileSync(vertex, generated.vertex);
        writeFileSync(fragment, generated.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it.runIf(spawnSync("glslangValidator", ["--version"]).status === 0)("links generated GLSL stages with real struct and function declarations", () => {
    const graph = entry.shaderGraph.compile(finishedEditorGraph(), "glsl");
    const programs = (["forward", "depth", "distance"] as const).map((pass) =>
      generateProgramImpl(normalizeProgramFeatures({ graph, lighting: "unlit", pass })));
    const dir = mkdtempSync(join(tmpdir(), "aura3d-graph-integration-"));
    try {
      const vertex = join(dir, "graph.vert");
      const fragment = join(dir, "graph.frag");
      for (const program of programs) {
        writeFileSync(vertex, program.vertex);
        writeFileSync(fragment, program.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(spawnSync("glslangValidator", ["--version"]).status === 0)("links nested-storage GLSL reflection and shadow shaders offline", () => {
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    const dir = mkdtempSync(join(tmpdir(), "aura3d-storage-reflection-"));
    let material: ReturnType<typeof entry.createCustomShaderMaterial> | undefined;
    try {
      const spec = entry.shaderGraphMaterial({ graph: storageGraph(), backend: "wgsl", storage: { surfaceData: { kind: "storage-buffer", buffer } } }).custom!;
      material = entry.createCustomShaderMaterial(spec);
      const vertex = join(dir, "graph.vert");
      const fragment = join(dir, "graph.frag");
      for (const key of [material.shaderKey, material.customDepthShaderKey!]) {
        const source = globalShaderSource(key)!;
        writeFileSync(vertex, source.vertex);
        writeFileSync(fragment, source.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
      }
    } finally {
      material?.dispose();
      buffer.dispose();
      device.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reflects nested storage as typed GLSL constructors while retaining real WGSL bindings", () => {
    const graph = storageGraph();
    const original = structuredClone(graph);
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    try {
      const options: entry.ShaderGraphMaterialOptions = {
        graph,
        backend: "wgsl",
        storage: { surfaceData: { kind: "storage-buffer", buffer } }
      };
      const spec = entry.shaderGraphMaterial(options).custom!;
      expect(graph).toEqual(original);
      expect(spec.glsl.vertex).toContain("auraGraph_struct_vOuter(");
      expect(spec.glsl.vertex).toContain("auraGraph_struct_vInner(");
      expect(spec.glsl.vertex).toContain("uvec3(0u, 0u, 0u)");
      expect(spec.glsl.fragment).toContain("texelFetch(auraGraph_resource_sceneDepth");
      expect(spec.glsl.fragment).not.toContain("auraGraph_resource_surfaceData");
      expect(spec.glsl.fragment).toContain("auraGraph_fn_vfade");
      expect(spec.wgsl?.vertex).toContain("auraGraph_resource_surfaceData[0u]");
      expect(spec.wgsl?.fragment).toContain("auraGraph_resource_surfaceData[0u]");
      const material = entry.createCustomShaderMaterial(spec);
      try {
        expect(material.graphRequiresWebGPU).toBe(true);
        expect(material.graphStorageBindings("forward")).toEqual([expect.objectContaining({ name: "surfaceData", buffer })]);
        expect(material.graphStorageBindings("depth")).toEqual([expect.objectContaining({ name: "surfaceData", buffer })]);
        const forward = globalShaderSource(material.shaderKey)!;
        const depth = globalShaderSource(material.customDepthShaderKey!)!;
        expect(forward.webgpu?.storageBindings).toEqual([expect.objectContaining({ visibility: "vertex-fragment" })]);
        expect(depth.webgpu?.storageBindings).toEqual([expect.objectContaining({ visibility: "vertex-fragment" })]);
        expect(depth.webgpu?.fragment).toContain("auraGraph_resource_surfaceData[0u]");
        expect(material.compile(device)).toMatchObject({ ok: false, diagnostics: [expect.stringContaining("GRAPH_STORAGE_BACKEND_UNSUPPORTED")] });
      } finally {
        material.dispose();
      }
      expect(buffer.disposed).toBe(false);
    } finally {
      buffer.dispose();
      device.dispose();
    }
  });

  it("reflects a storage graph at the node limit without retaining unreachable draft nodes", () => {
    const source = storageGraph();
    const remaining = 512 - source.nodes.length - source.functions![0]!.nodes.length;
    const graph: entry.ShaderGraphDocument = {
      ...source,
      nodes: [...source.nodes, ...Array.from({ length: remaining }, (_, index) => ({
        id: `unused${index}`, op: "constant" as const, type: "f32" as const, value: 1
      }))]
    };
    expect(entry.shaderGraph.validate(graph, "wgsl")).toEqual([]);
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    try {
      const spec = entry.shaderGraphMaterial({ graph, backend: "wgsl", storage: { surfaceData: { kind: "storage-buffer", buffer } } }).custom!;
      expect(spec.glsl.vertex).toContain("auraGraph_struct_vOuter(");
      expect(spec.wgsl?.fragment).toContain("auraGraph_resource_surfaceData");
    } finally {
      buffer.dispose();
      device.dispose();
    }
  });

  it("reflects a storage graph whose reachable nodes fill the compiler limit", () => {
    const base = storageGraph();
    const source: entry.ShaderGraphDocument = {
      ...base,
      resources: [
        ...base.resources!,
        { name: "volume", kind: "texture3d" },
        { name: "index", kind: "uniform", type: "u32" },
        { name: "gain", kind: "uniform", type: "f32" },
        { name: "unused", kind: "uniform", type: "f32" }
      ],
      nodes: [
        ...base.nodes.map((node) => node.id === "auraGraphReflection0"
          ? { id: node.id, op: "uniform" as const, type: "u32" as const, resource: "index" }
          : node),
        { id: "uvw", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
        { id: "volume", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] },
        { id: "volumeColor", op: "swizzle", type: "vec3", components: "xyz", inputs: ["volume"] },
        { id: "surfaceColor", op: "mul", type: "vec3", inputs: ["shaded", "volumeColor"] },
        { id: "gain", op: "uniform", type: "f32", resource: "gain" },
        { id: "gained", op: "mul", type: "f32", inputs: ["fadedAlpha", "gain"] }
      ],
      outputs: { ...base.outputs, color: "surfaceColor", opacity: "gained" }
    };
    const remaining = 512 - source.nodes.length - source.functions![0]!.nodes.length;
    const nodes: entry.ShaderGraphNode[] = [...source.nodes];
    let opacity = source.outputs!.opacity!;
    for (let index = 0; index < remaining; index++) {
      const id = `reachable${index}`;
      nodes.push({ id, op: "oneMinus", type: "f32", inputs: [opacity] });
      opacity = id;
    }
    const graph: entry.ShaderGraphDocument = { ...source, nodes, outputs: { ...source.outputs, opacity } };
    expect(entry.shaderGraph.validate(graph, "wgsl")).toEqual([]);
    const compiled = entry.shaderGraph.compile(graph, "wgsl");
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    try {
      const spec = entry.shaderGraphMaterial({
        graph, backend: "wgsl", storage: { surfaceData: { kind: "storage-buffer", buffer } },
        uniforms: { index: 0, gain: 1, unused: 1 }
      }).custom!;
      expect(spec.wgsl).toEqual({ vertex: compiled.vertex, fragment: compiled.fragment });
      expect(spec.glsl.vertex).toContain("precision highp sampler3D;");
      expect(spec.glsl.vertex).toContain("uniform sampler3D auraGraph_resource_volume;");
      const material = entry.createCustomShaderMaterial(spec);
      try {
        const unusedDiagnostics = material.customDiagnostics.filter((line) => line.includes("[CUSTOM_UNIFORM_UNUSED]"));
        for (const name of ["sceneDepth", "volume", "index", "gain"]) {
          expect(unusedDiagnostics).not.toEqual(expect.arrayContaining([
            expect.stringContaining(`uniform "auraGraph_resource_${name}"`)
          ]));
        }
        expect(unusedDiagnostics).toEqual(expect.arrayContaining([
          expect.stringContaining('uniform "auraGraph_resource_unused"')
        ]));
        expect(material.graphStorageBindings("forward")).toEqual([expect.objectContaining({ name: "surfaceData", buffer })]);
        expect(material.compile(device)).toMatchObject({ ok: false, diagnostics: [expect.stringContaining("GRAPH_STORAGE_BACKEND_UNSUPPORTED")] });
        if (spawnSync("glslangValidator", ["--version"]).status === 0) {
          const dir = mkdtempSync(join(tmpdir(), "aura3d-storage-limit-reflection-"));
          try {
            const vertex = join(dir, "graph.vert"), fragment = join(dir, "graph.frag");
            for (const key of [material.shaderKey, material.customDepthShaderKey!]) {
              const shaders = globalShaderSource(key)!;
              writeFileSync(vertex, shaders.vertex);
              writeFileSync(fragment, shaders.fragment);
              execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
            }
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }
      } finally {
        material.dispose();
      }
    } finally {
      buffer.dispose();
      device.dispose();
    }
  });

  it("does not report an index uniform used by storage as unused", () => {
    const source = storageGraph();
    const graph: entry.ShaderGraphDocument = {
      ...source,
      resources: [
        ...source.resources!,
        { name: "storageIndex", kind: "uniform", type: "u32" },
        { name: "unused", kind: "uniform", type: "f32" }
      ],
      nodes: source.nodes.map((node) => node.id === "auraGraphReflection0"
        ? { id: node.id, op: "uniform", type: "u32", resource: "storageIndex" }
        : node)
    };
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 128);
    try {
      const spec = entry.shaderGraphMaterial({
        graph, backend: "wgsl", storage: { surfaceData: { kind: "storage-buffer", buffer } },
        uniforms: { storageIndex: 0, unused: 1 }
      }).custom!;
      expect(spec.wgsl!.vertex).toContain("aura.u_auraGraph_resource_storageIndex");
      const material = entry.createCustomShaderMaterial(spec);
      try {
        expect(material.customDiagnostics).not.toEqual(expect.arrayContaining([
          expect.stringContaining('uniform "auraGraph_resource_storageIndex"')
        ]));
        expect(material.customDiagnostics).toEqual(expect.arrayContaining([
          expect.stringContaining('uniform "auraGraph_resource_unused"')
        ]));
      } finally {
        material.dispose();
      }
    } finally {
      buffer.dispose();
      device.dispose();
    }
  });

  it("exposes the compiler's named struct and function contracts from the public entry", () => {
    expectTypeOf<entry.ShaderGraphStructField>().toEqualTypeOf<compiler.ShaderGraphStructField>();
    expectTypeOf<entry.ShaderGraphStruct>().toEqualTypeOf<compiler.ShaderGraphStruct>();
    expectTypeOf<entry.ShaderGraphFunctionParameter>().toEqualTypeOf<compiler.ShaderGraphFunctionParameter>();
    expectTypeOf<entry.ShaderGraphFunction>().toEqualTypeOf<compiler.ShaderGraphFunction>();
  });
});
