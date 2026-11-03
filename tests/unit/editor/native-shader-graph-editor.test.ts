import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { AssetManager, GLTFLoader, type AssetHandle, type GLTFAsset, type GLTFRenderResources } from "@aura3d/assets";
import {
  ShaderGraphModel,
  EditorRuntime,
  parseEditorProject,
  serializeEditorProject
} from "@aura3d/editor-runtime";
import { Geometry, MockRenderDevice, Texture, type Material, type PortableShaderMaterial } from "@aura3d/rendering";
import { Renderer } from "@aura3d/engine/renderer";
import type { ShaderGraphDocument } from "@aura3d/rendering/shader-graph";
import { inspectTexture } from "../../../apps/editor/src/panels/TextureInspectorPanel";
import { validateGraphUniformValue } from "../../../apps/editor/src/panels/ShaderGraphPanel";
import { ProjectSerializer } from "../../../apps/editor/src/project/ProjectSerializer";
import { EditorViewport } from "../../../apps/editor/src/viewport/EditorViewport";
import { EditorShell } from "../../../apps/editor/src/EditorShell";
import { AssetBrowserPanel } from "../../../apps/editor/src/panels/AssetBrowserPanel";
import { InspectorPanel } from "../../../apps/editor/src/panels/InspectorPanel";
import { FrameInspector } from "../../../packages/debug/src/FrameInspector";
import { ShaderGraphInspector } from "../../../packages/debug/src/ShaderGraphInspector";

const colorGraph: ShaderGraphDocument = {
  version: 1,
  stage: "material",
  nodes: [
    { id: "red", op: "constant", type: "vec3", value: [1, 0, 0] },
    { id: "tint", op: "constant", type: "vec3", value: [0.5, 1, 1] },
    { id: "multiply", op: "mul", type: "vec3", inputs: ["red", "tint"] }
  ],
  resources: [],
  outputs: { color: "multiply" }
};

describe("native shader graph editor", () => {
  it("edits typed ports, compiles through the renderer and restores actual graph state with undo/redo", () => {
    const model = new ShaderGraphModel(colorGraph);
    expect(model.validate()).toEqual([]);
    const original = model.compile("glsl");
    expect(original.fragment).toContain("outColor");
    expect(model.compile("wgsl").fragment).toContain("@fragment");

    model.addNode({ id: "blue", op: "constant", type: "vec3", value: [0, 0, 1] });
    model.addNode({ id: "scalar", op: "constant", type: "f32", value: 2 });
    expect(model.inputPorts("multiply")[0]).toMatchObject({ index: 0, connectedNodeId: "red", acceptedTypes: ["vec3"] });
    expect(model.canConnect("scalar", "multiply", 0)).toBe(false);
    expect(() => model.connect("scalar", "multiply", 0)).toThrow(/incompatible type/);
    expect(() => model.connect("blue", "multiply", 3)).toThrow(/invalid port/);
    model.connect("blue", "multiply", 0);
    const changed = model.compile("glsl");
    expect(changed.fragment).not.toEqual(original.fragment);
    expect(model.undo()).toBe(true);
    expect(model.compile("glsl").fragment).toEqual(original.fragment);
    expect(model.redo()).toBe(true);
    expect(model.compile("glsl").fragment).toEqual(changed.fragment);

    model.removeNode("blue");
    expect(model.snapshot().nodes.find((node) => node.id === "multiply")?.inputs).toEqual(["", "tint"]);
    expect(model.validate().some((diagnostic) => diagnostic.code === "missing-node")).toBe(true);
    expect(() => model.compile("glsl")).toThrow();
    expect(model.undo()).toBe(true);
    expect(model.validate()).toEqual([]);
    model.undo();
    model.addNode({ id: "green", op: "constant", type: "vec3", value: [0, 1, 0] });
    expect(model.canRedo).toBe(false);
  });

  it("reports cycles, retains invalid drafts, isolates snapshots and bounds history", () => {
    const model = new ShaderGraphModel(colorGraph, { historyLimit: 2 });
    const notifications: ShaderGraphDocument[] = [];
    const unsubscribe = model.subscribe((graph) => notifications.push(graph));
    model.addNode({ id: "other", op: "add", type: "vec3", inputs: ["multiply", "red"] });
    model.connect("other", "multiply", 0);
    expect(model.validate().some((diagnostic) => diagnostic.code === "cycle")).toBe(true);
    expect(() => model.compile("glsl")).toThrow(/cycle/i);
    model.undo();
    expect(model.validate()).toEqual([]);
    model.redo();
    const snapshot = model.snapshot();
    (snapshot.nodes as unknown as { id: string }[])[0]!.id = "mutated";
    expect(model.snapshot().nodes[0]?.id).toBe("red");
    expect(notifications).toHaveLength(4);
    unsubscribe();
    model.disconnect("multiply", 0);
    expect(notifications).toHaveLength(4);
    expect(model.undo()).toBe(true);
    expect(model.undo()).toBe(true);
    expect(model.undo()).toBe(false);
  });

  it("exposes incremental constructor ports and rejects components that exceed the target width", () => {
    const model = new ShaderGraphModel({ version: 1, stage: "material", nodes: [
      { id: "xy", op: "constant", type: "vec2", value: [0.2, 0.4] },
      { id: "z", op: "constant", type: "f32", value: 0.6 },
      { id: "color", op: "construct", type: "vec3", inputs: [] }
    ], outputs: { color: "color" } });
    expect(model.inputPorts("color")).toHaveLength(1);
    model.connect("xy", "color", 0);
    expect(model.inputPorts("color")).toHaveLength(2);
    expect(model.canConnect("xy", "color", 1)).toBe(false);
    model.connect("z", "color", 1);
    expect(model.inputPorts("color")).toHaveLength(2);
    expect(model.validate()).toEqual([]);
    expect(model.compile("glsl").fragment).toContain("vec3(");
  });

  it("offers swizzle inputs only when components and result types are compatible", () => {
    const model = new ShaderGraphModel({ version: 1, stage: "material", nodes: [
      { id: "uv", op: "constant", type: "vec2", value: [0, 1] },
      { id: "color", op: "constant", type: "vec3", value: [0, 1, 0] },
      { id: "component", op: "swizzle", type: "f32", components: "z" }
    ], outputs: { roughness: "component" } });
    expect(model.canConnect("uv", "component", 0)).toBe(false);
    expect(model.canConnect("color", "component", 0)).toBe(true);
    model.connect("color", "component", 0);
    expect(model.validate()).toEqual([]);
  });

  it("does not add no-op edits or corrupt history when input data is cyclic", () => {
    const model = new ShaderGraphModel(colorGraph);
    const notices: ShaderGraphDocument[] = [];
    model.subscribe((graph) => notices.push(graph));
    model.updateNode("red", { value: [1, 0, 0] });
    expect(model.canUndo).toBe(false);
    expect(notices).toHaveLength(0);
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => model.updateNode("red", { value: cyclic as number[] })).toThrow(/cyclic objects/);
    expect(model.canUndo).toBe(false);
    expect(model.snapshot()).toEqual(colorGraph);
  });

  it("rejects malformed editable records while retaining compiler-invalid drafts", () => {
    const malformed = { version: 1, stage: "material", nodes: [null], outputs: {} } as unknown as ShaderGraphDocument;
    expect(() => new ShaderGraphModel(malformed)).toThrow(/nodes need/);
    const project = {
      schema: "a3d-editor-project" as const, name: "Scene", nodes: [],
      shaderGraphs: [{ id: "graph", name: "Graph", graph: malformed }]
    };
    expect(() => serializeEditorProject(project)).toThrow(/Invalid editable shader graph records/);
    const model = new ShaderGraphModel({ version: 1, stage: "material", nodes: [
      { id: "draft", op: "toString" as never, type: "vec3" }
    ], outputs: { color: "draft" } });
    expect(model.inputPorts("draft")).toEqual([]);
    expect(model.validate().some((entry) => entry.code === "unsupported-operation")).toBe(true);
    expect(() => model.updateNode("draft", { inputs: [null] as unknown as string[] })).toThrow(/string input references/);
    expect(model.canUndo).toBe(false);
  });

  it("migrates project selections and round-trips invalid graphs, resource choices and editor state", () => {
    const model = new ShaderGraphModel(colorGraph);
    model.disconnect("multiply", 0);
    const encoded = serializeEditorProject({
      schema: "a3d-editor-project",
      version: 105,
      name: "Material authoring",
      nodes: [],
      assets: [{ id: "albedo", name: "Albedo" }],
      shaderGraphs: [{
        id: "surface", name: "Surface", materialId: "hero", graph: model.snapshot(),
        bindings: { tint: { kind: "uniform", value: [0.5, 0.25, 1] }, base: { kind: "texture", assetId: "albedo" } }
      }],
      editor: { selectedResourceId: "albedo", activeShaderGraphId: "surface", selectedShaderNodeId: "multiply" }
    });
    const loaded = parseEditorProject(encoded);
    expect(loaded.version).toBe(105);
    expect(loaded.editorFormatVersion).toBe(2);
    expect(loaded.editor).toMatchObject({ selectedResourceIds: ["albedo"], activeShaderGraphId: "surface", selectedShaderNodeId: "multiply" });
    expect(loaded.editor?.selectedResourceId).toBeUndefined();
    expect(loaded.shaderGraphs?.[0]?.bindings?.base).toEqual({ kind: "texture", assetId: "albedo" });
    expect(new ShaderGraphModel(loaded.shaderGraphs![0]!.graph).validate().some((error) => error.code === "missing-node")).toBe(true);
    expect(() => parseEditorProject('{"schema":"a3d-editor-project","editorFormatVersion":99,"name":"bad","nodes":[]}')).toThrow(/Unsupported editor project format version/);
    expect(() => serializeEditorProject({ schema: "a3d-editor-project", name: "bad", nodes: [], editor: { selectedResourceIds: ["x", "x"] } })).toThrow(/unique/);
    expect(() => serializeEditorProject({ schema: "a3d-editor-project", name: "bad", nodes: [], shaderGraphs: [{ id: "g", name: "g", graph: colorGraph, bindings: { x: { kind: "uniform", value: Number.NaN } } }] })).toThrow(/finite/);
  });

  it("round-trips material graphs and resource selection through the actual editor project serializer", () => {
    const serializer = new ProjectSerializer();
    const draft = new ShaderGraphModel(colorGraph);
    draft.disconnect("multiply", 0);
    const project = {
      ...serializer.createDefaultProject(),
      shaderGraphs: [{ id: "hero-graph", name: "Hero graph", materialId: "node-hero", graph: draft.snapshot(), bindings: {
        tint: { kind: "uniform" as const, value: [0.2, 0.4, 0.6] },
        image: { kind: "texture" as const, assetId: "texture-1" }
      } }],
      editor: { selectedResourceId: "texture-1", activeShaderGraphId: "hero-graph" }
    };
    const loaded = serializer.parse(serializer.serialize(project));
    expect(loaded.editorFormatVersion).toBe(2);
    expect(loaded.editor?.selectedResourceIds).toEqual(["texture-1"]);
    expect(loaded.shaderGraphs?.[0]).toEqual(project.shaderGraphs[0]);
    expect(new ShaderGraphModel(loaded.shaderGraphs![0]!.graph).validate().some((entry) => entry.code === "missing-node")).toBe(true);
    expect(() => serializer.serialize({ ...project, shaderGraphs: [{ ...project.shaderGraphs[0]!, materialId: "deleted-node" }] })).toThrow(/missing material node/);
    expect(() => serializer.parse(JSON.stringify({ ...project, editorFormatVersion: 999 }))).toThrow(/Unsupported editor project format version/);
  });

  it("keeps graph edits and project commands in one chronological undo history", async () => {
    const { shell, runtime } = createShellHarness();
    const actions = shell as unknown as {
      createShaderGraph(): Promise<void>;
      addShaderGraphNode(op: string, type: string): Promise<void>;
      editShaderGraph(edit: (model: ShaderGraphModel) => void): Promise<void>;
    };
    runtime.select(["node-child"]);
    await actions.createShaderGraph();
    await actions.addShaderGraphNode("constant", "vec3");
    await shell.addAsset({
      id: "image", name: "Image", type: "texture", uri: "data:image/png;base64,AA==",
      importedAt: "2026-01-01T00:00:00.000Z", preview: "image", diagnostics: []
    });
    await actions.editShaderGraph((model) => model.updateNode("constant_1", { value: [0, 0, 1] }));
    const value = () => shell.project.shaderGraphs?.[0]?.graph.nodes[0]?.value;
    expect(value()).toEqual([0, 0, 1]);
    await shell.undo();
    expect(value()).toEqual([0, 0, 0]);
    expect(shell.project.assets).toHaveLength(1);
    await shell.undo();
    expect(shell.project.assets).toHaveLength(0);
    expect(value()).toEqual([0, 0, 0]);
    await shell.redo();
    await shell.redo();
    expect(shell.project.assets).toHaveLength(1);
    expect(value()).toEqual([0, 0, 1]);
  });

  it("restores saved material selection and tool, and clears commands tied to the previous scene", async () => {
    const { shell, runtime, buffer } = createShellHarness();
    runtime.select(["node-child", "node-hero"]);
    runtime.setTool("rotate");
    shell.project = {
      ...shell.project,
      shaderGraphs: [{ id: "child-graph", name: "Child graph", materialId: "node-child", graph: colorGraph, bindings: {} }],
      editor: { selectedResourceIds: ["image"] }
    };
    shell.saveProject();
    expect(JSON.parse(buffer.value).editor).toMatchObject({
      selectedNodeId: "node-child", selectedNodeIds: ["node-child", "node-hero"], activeTool: "rotate", selectedResourceIds: ["image"]
    });
    await shell.addAsset({
      id: "later", name: "Later", type: "texture", uri: "data:image/png;base64,AA==",
      importedAt: "2026-01-01T00:00:00.000Z", preview: "later", diagnostics: []
    });
    runtime.select(["node-hero"]);
    runtime.setTool("move");
    shell.loadProject();
    expect(runtime.currentSelection()).toEqual(["node-child", "node-hero"]);
    expect(runtime.activeTool).toBe("rotate");
    expect(runtime.history.canUndo).toBe(false);
    expect(shell.selectedProjectNode()?.id).toBe("node-child");
    expect(shell.project.shaderGraphs?.[0]?.materialId).toBe("node-child");
    expect(shell.project.editor?.selectedResourceIds).toEqual(["image"]);
    await shell.undo();
    expect(shell.project.assets).toHaveLength(0);
    expect(shell.project.shaderGraphs).toHaveLength(1);
  });

  it("retires the live material when undo removes the selected node's graph", () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const setShaderGraph = vi.fn(() => ({ ok: true, diagnostics: [] }));
    Object.assign(shell, { viewport: { setShaderGraph, render: vi.fn() }, renderFrameInspector: vi.fn() });
    shell.project = {
      ...shell.project,
      shaderGraphs: [{ id: "child-graph", name: "Child graph", materialId: "node-child", graph: colorGraph, bindings: {} }]
    };
    const sync = () => (shell as unknown as { syncShaderGraphSelection(): void }).syncShaderGraphSelection();
    sync();
    expect(setShaderGraph).toHaveBeenLastCalledWith("node-child", colorGraph, {});
    const state = (shell as unknown as { shaderGraphState(): { inspection?: { status: string; shaderStages: readonly unknown[]; expressions: readonly unknown[] } } }).shaderGraphState();
    expect(state.inspection).toMatchObject({ status: "compiled", shaderStages: expect.any(Array), expressions: expect.any(Array) });
    expect(state.inspection?.shaderStages).toHaveLength(2);
    expect(state.inspection?.expressions).toHaveLength(3);
    shell.project = { ...shell.project, shaderGraphs: [] };
    sync();
    expect(setShaderGraph).toHaveBeenLastCalledWith("node-child", null, {});
    expect(shell.project.editor?.activeShaderGraphId).toBeNull();
  });

  it("keeps graph materials for all project nodes when the selection changes", () => {
    const { shell, runtime } = createShellHarness();
    const setShaderGraph = vi.fn(() => ({ ok: true, diagnostics: [] }));
    Object.assign(shell, { viewport: { setShaderGraph } });
    shell.project = { ...shell.project, shaderGraphs: [
      { id: "hero-graph", name: "Hero", materialId: "node-hero", graph: colorGraph, bindings: {} },
      { id: "child-graph", name: "Child", materialId: "node-child", graph: colorGraph, bindings: {} }
    ] };
    const sync = () => (shell as unknown as { syncShaderGraphSelection(): void }).syncShaderGraphSelection();
    runtime.select(["node-hero"]);
    sync();
    expect(setShaderGraph).toHaveBeenCalledTimes(2);
    expect(setShaderGraph).toHaveBeenCalledWith("node-hero", colorGraph, {});
    expect(setShaderGraph).toHaveBeenCalledWith("node-child", colorGraph, {});
    runtime.select(["node-child"]);
    sync();
    expect(setShaderGraph).toHaveBeenCalledTimes(2);
    shell.project = { ...shell.project, scene: { nodes: shell.project.scene.nodes.map((node) => node.id === "node-child"
      ? { ...node, mesh: { ...node.mesh, primitive: "quad" as const } } : node) } };
    sync();
    expect(setShaderGraph).toHaveBeenCalledTimes(3);
    expect(setShaderGraph).toHaveBeenLastCalledWith("node-child", colorGraph, {});
    shell.project = { ...shell.project, shaderGraphs: shell.project.shaderGraphs!.filter((graph) => graph.materialId !== "node-hero") };
    sync();
    expect(setShaderGraph).toHaveBeenLastCalledWith("node-hero", null, {});
  });

  it("validates persisted editor selections and tool state", () => {
    const project = { schema: "a3d-editor-project" as const, name: "Scene", nodes: [] };
    expect(() => serializeEditorProject({ ...project, editor: { selectedNodeIds: ["one", "one"] } })).toThrow(/selectedNodeIds/);
    expect(() => serializeEditorProject({ ...project, editor: { selectedNodeId: Number.NaN } })).toThrow(/selectedNodeId/);
    expect(() => serializeEditorProject({ ...project, editor: { activeTool: " " } })).toThrow(/activeTool/);
    expect(() => serializeEditorProject({ ...project, editor: { playMode: "unknown" as never } })).toThrow(/playMode/);
  });

  it("edits and undoes inspector values against the current project after scene capture", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const inspector = Object.create(InspectorPanel.prototype) as InspectorPanel;
    Object.assign(inspector, { shell });
    const update = (path: string, value: string | boolean) =>
      (inspector as unknown as { updateField(path: string, value: string | boolean): Promise<void> }).updateField(path, value);
    const original = shell.selectedProjectNode()!.material.baseColor;
    await update("material.baseColor", "#123456");
    expect(shell.selectedProjectNode()!.material.baseColor).toBe("#123456");
    await shell.undo();
    expect(shell.selectedProjectNode()!.material.baseColor).toBe(original);
    await shell.redo();
    expect(shell.selectedProjectNode()!.material.baseColor).toBe("#123456");
    await update("rotation.Z", "0.5");
    expect(Math.hypot(...shell.selectedProjectNode()!.transform.rotation)).toBeCloseTo(1);
    expect(shell.selectedProjectNode()!.transform.rotation[2]).toBeGreaterThan(0);
    await expect(update("position.X", "NaN")).rejects.toThrow(/finite/);
    await expect(update("scale.W", "1")).rejects.toThrow(/Invalid transform field/);
    await expect(update("material.baseColor", "red")).rejects.toThrow(/#rrggbb/);
    await expect(update("material.roughness", "2")).rejects.toThrow(/between 0 and 1/);
    await shell.updateSelectedProjectNodeField(["material", "roughness"], 0.8);
    shell.projectFromScene();
    await shell.undo();
    expect(shell.selectedProjectNode()!.material.roughness).toBe(0.6);
  });

  it("releases a glTF asset handle when adding the imported asset fails", async () => {
    const { shell } = createShellHarness();
    const handle = { value: { meshes: [{ name: "Triangle" }], materials: [] } };
    const load = vi.fn().mockResolvedValue(handle);
    const release = vi.fn().mockResolvedValue(undefined);
    Object.assign(shell, { addAsset: vi.fn().mockRejectedValue(new Error("project failed")) });
    const panel = Object.create(AssetBrowserPanel.prototype) as AssetBrowserPanel;
    Object.assign(panel, { shell, assets: { load, release } });
    await expect((panel as unknown as { importSampleGltf(): Promise<void> }).importSampleGltf()).rejects.toThrow("project failed");
    expect(load).toHaveBeenCalledWith(expect.stringMatching(/^data:model\/gltf/), { type: "gltf" });
    expect(release).toHaveBeenCalledWith(handle);
  });

  it("checks uniform types, vector widths and integer bounds before saving bindings", () => {
    expect(validateGraphUniformValue(4294967295, "u32")).toBe(4294967295);
    expect(validateGraphUniformValue(-2147483648, "i32")).toBe(-2147483648);
    expect(validateGraphUniformValue([0.25, 0.5, 1], "vec3")).toEqual([0.25, 0.5, 1]);
    for (const value of [-1, 4294967296, 1.5, Number.NaN]) expect(() => validateGraphUniformValue(value, "u32")).toThrow();
    for (const value of [-2147483649, 2147483648]) expect(() => validateGraphUniformValue(value, "i32")).toThrow();
    expect(() => validateGraphUniformValue([1, 2], "vec3")).toThrow(/3 finite/);
    expect(() => validateGraphUniformValue(1, "bool")).toThrow(/true or false/);
  });

  it("authors an unsigned uniform through the editor and undoes its binding", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const actions = shell as unknown as {
      createShaderGraph(): Promise<void>;
      addShaderGraphNode(op: string, type: string): Promise<void>;
      editShaderGraph(edit: (model: ShaderGraphModel) => void): Promise<void>;
      setShaderGraphResource(name: string, kind: "uniform", type: string): Promise<void>;
      setShaderGraphBinding(name: string, value: unknown): Promise<void>;
    };
    await actions.createShaderGraph();
    await actions.setShaderGraphResource("counter", "uniform", "u32");
    await actions.addShaderGraphNode("uniform", "u32");
    await actions.editShaderGraph((model) => model.updateNode("uniform_1", { resource: "counter" }));
    await actions.setShaderGraphBinding("counter", 4294967295);
    const graph = () => shell.project.shaderGraphs![0]!;
    expect(graph().graph.nodes[0]).toMatchObject({ op: "uniform", type: "u32", resource: "counter" });
    expect(graph().bindings?.counter).toEqual({ kind: "uniform", value: 4294967295 });
    await expect(actions.setShaderGraphBinding("counter", 4294967296)).rejects.toThrow(/u32/);
    await shell.undo();
    expect(graph().bindings?.counter).toEqual({ kind: "uniform", value: 0 });
    await shell.redo();
    expect(graph().bindings?.counter).toEqual({ kind: "uniform", value: 4294967295 });
  });

  it("authors depth and volume resources only against compatible live sampled textures", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const image = new Texture({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
    const volume = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", data: new Uint8Array([5, 6, 7, 8]) });
    const depth = new Texture({ width: 1, height: 1, format: "depth24", usage: ["sampled"] });
    const unsampled = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", usage: ["storage"] });
    const dead = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", data: new Uint8Array(4) });
    dead.dispose();
    Object.assign(shell, { viewport: { getInspectableTextures: () => [
      { id: "image", texture: image }, { id: "volume", texture: volume }, { id: "depth", texture: depth },
      { id: "unsampled", texture: unsampled }, { id: "dead", texture: dead }
    ] } });
    const actions = shell as unknown as {
      createShaderGraph(): Promise<void>;
      setShaderGraphResource(name: string, kind: "texture3d" | "depth2d", type: string): Promise<void>;
      setShaderGraphBinding(name: string, value: unknown): Promise<void>;
      addShaderGraphNode(op: string, type: string): Promise<void>;
      shaderGraphState(): { readonly textures: readonly { id: string; kind: string }[] };
    };
    try {
      await actions.createShaderGraph();
      await actions.setShaderGraphResource("fog", "texture3d", "f32");
      await actions.setShaderGraphResource("sceneDepth", "depth2d", "f32");
      await actions.addShaderGraphNode("textureLoad", "f32");
      expect(shell.project.shaderGraphs?.[0]?.graph.nodes[0]).toMatchObject({ op: "textureLoad", type: "f32", resource: "" });
      expect(actions.shaderGraphState().textures.map(({ id, kind }) => [id, kind])).toEqual([
        ["image", "texture2d"], ["volume", "texture3d"], ["depth", "depth2d"]
      ]);
      for (const incompatible of ["image", "depth", "unsampled", "dead"]) await expect(actions.setShaderGraphBinding("fog", incompatible)).rejects.toThrow(/compatible live texture3d/);
      await expect(actions.setShaderGraphBinding("sceneDepth", "volume")).rejects.toThrow(/compatible live depth2d/);
      await actions.setShaderGraphBinding("fog", "volume");
      await actions.setShaderGraphBinding("sceneDepth", "depth");
      expect(shell.project.shaderGraphs?.[0]?.bindings).toMatchObject({
        fog: { kind: "texture", assetId: "volume" }, sceneDepth: { kind: "texture", assetId: "depth" }
      });
      await shell.undo();
      expect(shell.project.shaderGraphs?.[0]?.bindings?.sceneDepth).toBeUndefined();
      await shell.redo();
      expect(shell.project.shaderGraphs?.[0]?.bindings?.sceneDepth).toEqual({ kind: "texture", assetId: "depth" });
    } finally {
      image.dispose(); volume.dispose(); depth.dispose(); unsampled.dispose();
    }
  });

  it("preflights persisted 3D and depth bindings before replacing a viewport material", () => {
    const image = new Texture({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
    const volume = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", data: new Uint8Array([5, 6, 7, 8]) });
    const depth = new Texture({ width: 1, height: 1, format: "depth24", usage: ["sampled"] });
    const unsampled = new Texture({ width: 1, height: 1, depth: 1, dimension: "3d", usage: ["storage"] });
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", resources: [{ name: "fog", kind: "texture3d" }, { name: "sceneDepth", kind: "depth2d" }],
      nodes: [
        { id: "uvw", op: "constant", type: "vec3", value: [0, 0, 0] },
        { id: "pixel", op: "constant", type: "vec2", value: [0, 0] },
        { id: "sample", op: "textureSample", type: "vec4", resource: "fog", inputs: ["uvw"] },
        { id: "depth", op: "textureLoad", type: "f32", resource: "sceneDepth", inputs: ["pixel"] }
      ], outputs: { color: "sample", opacity: "depth" }
    };
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    Object.assign(viewport, { renderer: { device: new MockRenderDevice() }, graphMaterialSerial: 0, graphMaterials: new Map(), meshAssets: new Map(),
      textureAssets: new Map([["image", { texture: image }], ["volume", { texture: volume }], ["depth", { texture: depth }], ["unsampled", { texture: unsampled }]]) });
    const binding = (assetId: string) => ({ kind: "texture" as const, assetId });
    try {
      expect(viewport.setShaderGraph("node-child", graph, { sceneDepth: binding("depth") }).diagnostics.join(" ")).toMatch(/Choose a compatible texture3d/);
      expect(viewport.setShaderGraph("node-child", graph, { fog: binding("image"), sceneDepth: binding("depth") }).diagnostics.join(" ")).toMatch(/not a compatible sampled texture3d/);
      expect(viewport.setShaderGraph("node-child", graph, { fog: binding("unsampled"), sceneDepth: binding("depth") }).diagnostics.join(" ")).toMatch(/not a compatible sampled texture3d/);
      expect(viewport.setShaderGraph("node-child", graph, { fog: binding("volume"), sceneDepth: binding("image") }).diagnostics.join(" ")).toMatch(/not a compatible sampled depth2d/);
      expect(viewport.setShaderGraph("node-child", graph, { fog: { kind: "uniform", value: 1 }, sceneDepth: binding("depth") }).diagnostics.join(" ")).toMatch(/Choose a compatible texture3d/);
      expect(viewport.setShaderGraph("node-child", graph, { fog: binding("volume"), sceneDepth: binding("depth") })).toEqual({ ok: true, diagnostics: [] });
      const previous = (viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial> }).graphMaterials.get("node-child");
      volume.dispose();
      expect(viewport.setShaderGraph("node-child", graph, { fog: binding("volume"), sceneDepth: binding("depth") }).diagnostics.join(" ")).toMatch(/not loaded/);
      expect((viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial> }).graphMaterials.get("node-child")).toBe(previous);
      viewport.setShaderGraph("node-child", null, {});
    } finally {
      image.dispose(); volume.dispose(); depth.dispose(); unsampled.dispose();
    }
  });

  it("undoes resource bindings and asset deletion together in command order", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const asset = {
      id: "image", name: "Image", type: "texture" as const, uri: "data:image/png;base64,AA==",
      importedAt: "2026-01-01T00:00:00.000Z", preview: "image", diagnostics: []
    };
    shell.project = { ...shell.project, assets: [asset], editor: { selectedResourceIds: ["image"] } };
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    Object.assign(shell, { viewport: { getInspectableTextures: () => [{ id: "image", texture }] } });
    const actions = shell as unknown as {
      createShaderGraph(): Promise<void>;
      setShaderGraphResource(name: string, kind: "texture2d", type: string): Promise<void>;
      setShaderGraphBinding(name: string, value: unknown): Promise<void>;
    };
    await actions.createShaderGraph();
    await actions.setShaderGraphResource("albedo", "texture2d", "f32");
    await actions.setShaderGraphBinding("albedo", "image");
    await shell.deleteAsset("image");
    expect(shell.project.shaderGraphs?.[0]?.bindings).toEqual({});
    expect(shell.project.editor?.selectedResourceIds).toEqual([]);
    await shell.undo();
    expect(shell.project.assets).toHaveLength(1);
    expect(shell.project.shaderGraphs?.[0]?.bindings?.albedo).toEqual({ kind: "texture", assetId: "image" });
    expect(shell.project.editor?.selectedResourceIds).toEqual(["image"]);
    await shell.undo();
    expect(shell.project.shaderGraphs?.[0]?.bindings).toEqual({});
    await shell.redo();
    await shell.redo();
    expect(shell.project.assets).toHaveLength(0);
    expect(shell.project.shaderGraphs?.[0]?.bindings).toEqual({});
    texture.dispose();
  });

  it("clears and restores embedded texture selections and graph bindings when their source asset is deleted", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const asset = { id: "source", name: "Source", type: "gltf" as const, uri: "model.glb", importedAt: "2026-01-01", preview: "model", diagnostics: [] };
    const embeddedId = "gltf-texture:source:0%3Asrgb";
    shell.project = { ...shell.project, assets: [asset], editor: { selectedResourceIds: [embeddedId] }, shaderGraphs: [
      { id: "graph", name: "Graph", materialId: "node-child", graph: colorGraph, bindings: { image: { kind: "texture", assetId: embeddedId } } }
    ] };
    expect(() => shell.serializer.serialize({ ...shell.project, assets: [asset, asset] })).toThrow(/unique ids/);
    await shell.deleteAsset("source");
    expect(shell.project.editor?.selectedResourceIds).toEqual([]);
    expect(shell.project.shaderGraphs?.[0]?.bindings).toEqual({});
    await shell.undo();
    expect(shell.project.editor?.selectedResourceIds).toEqual([embeddedId]);
    expect(shell.project.shaderGraphs?.[0]?.bindings?.image).toEqual({ kind: "texture", assetId: embeddedId });
  });

  it("compiles a candidate on the device and retains the last good viewport material after errors", () => {
    const device = new MockRenderDevice();
    // Skip only DOM setup; exercise the real viewport and renderer/compiler path with a CPU mock device.
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    Object.assign(viewport, { renderer: { device }, graphMaterialSerial: 0, graphMaterials: new Map(), textureAssets: new Map(), meshAssets: new Map() });
    const material = () => (viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial> }).graphMaterials.get("node-child");
    expect(viewport.setShaderGraph("node-child", colorGraph, {})).toEqual({ ok: true, diagnostics: [] });
    const original = material();
    expect(original?.sources.glsl.fragment).toContain("outColor");
    expect(device.getDiagnostics().shaders).toBe(0);
    const invalid = { ...colorGraph, outputs: { color: "missing" } };
    expect(viewport.setShaderGraph("node-child", invalid, {}).ok).toBe(false);
    expect(material()).toBe(original);
    expect(original?.disposed).toBe(false);
    const changed = { ...colorGraph, nodes: colorGraph.nodes.map((node) => node.id === "red" ? { ...node, value: [0, 0, 1] } : node) };
    expect(viewport.setShaderGraph("node-child", changed, {}).ok).toBe(true);
    expect(material()?.sources.glsl.fragment).not.toEqual(original?.sources.glsl.fragment);
    expect(original?.disposed).toBe(true);
    expect(device.getDiagnostics().shaders).toBe(0);
    viewport.setShaderGraph("node-child", null, {});
    expect(material()).toBeUndefined();
  });

  it("round-trips an unsigned resource into the viewport material without losing its value", () => {
    const graph: ShaderGraphDocument = {
      ...colorGraph,
      nodes: [...colorGraph.nodes, { id: "counter_value", op: "uniform", type: "u32", resource: "counter" }],
      resources: [{ name: "counter", kind: "uniform", type: "u32" }]
    };
    const project = serializeEditorProject({
      schema: "a3d-editor-project", name: "Scene", nodes: [],
      shaderGraphs: [{ id: "graph", name: "Graph", graph, bindings: { counter: { kind: "uniform", value: 4294967295 } } }]
    });
    const record = parseEditorProject(project).shaderGraphs![0]!;
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    Object.assign(viewport, { renderer: { device: new MockRenderDevice() }, graphMaterialSerial: 0, graphMaterials: new Map(), textureAssets: new Map(), meshAssets: new Map() });
    expect(viewport.setShaderGraph("node-child", record.graph, record.bindings ?? {}).ok).toBe(true);
    const material = (viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial> }).graphMaterials.get("node-child")!;
    expect([...material.getParameters().values()]).toContain(4294967295);
    expect(viewport.setShaderGraph("node-child", record.graph, { counter: { kind: "uniform", value: 4294967296 } }).ok).toBe(false);
    expect((viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial> }).graphMaterials.get("node-child")).toBe(material);
    viewport.setShaderGraph("node-child", null, {});
  });

  it("shares initialization and disposes a renderer that completes after viewport disposal", async () => {
    let complete!: (renderer: Renderer) => void;
    const create = vi.spyOn(Renderer, "create").mockReturnValue(new Promise<Renderer>((resolve) => { complete = resolve; }));
    try {
      const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
      Object.assign(viewport, { canvas: { width: 16, height: 16 }, disposed: false, textureAssets: new Map(), graphMaterials: new Map(), nodeMaterials: new Map(), importedMaterials: new Map(), modelInstances: new Map(), geometries: new Map(), meshAssets: new Map() });
      const initializing = viewport.initialize();
      const alsoInitializing = viewport.initialize();
      expect(create).toHaveBeenCalledOnce();
      viewport.dispose();
      const dispose = vi.fn();
      complete({ dispose } as unknown as Renderer);
      await Promise.all([initializing, alsoInitializing]);
      expect(dispose).toHaveBeenCalledOnce();
      expect((viewport as unknown as { renderer?: Renderer }).renderer).toBeUndefined();
      await viewport.initialize();
      expect(create).toHaveBeenCalledOnce();
    } finally {
      create.mockRestore();
    }
  });

  it("renders every enabled scene node with world transforms, per-node graph materials and owned-resource disposal", () => {
    const { shell, runtime } = createShellHarness();
    const frames: { items: readonly { geometry: Geometry; material: Material; modelMatrix: readonly number[]; userData: Record<string, string> }[]; view: readonly number[] }[] = [];
    const viewport = createViewportHarness(shell, {
      device: new MockRenderDevice(),
      render: (source: { renderItems: typeof frames[number]["items"] }, camera: { viewProjectionMatrix: readonly number[] }) => {
        frames.push({ items: source.renderItems, view: camera.viewProjectionMatrix });
        return { drawCalls: source.renderItems.length };
      },
      dispose: vi.fn()
    });
    runtime.select(["node-hero"]);
    viewport.render();
    viewport.render();
    expect(frames[0]!.items).toHaveLength(2);
    expect(frames[1]!.items.map((item) => item.geometry)).toEqual(frames[0]!.items.map((item) => item.geometry));
    expect(frames[0]!.items[1]!.modelMatrix[12]).toBeCloseTo(1.2);
    shell.scene.getNodeById("node-hero")!.transform.setPosition(2, 0, 0);
    expect(viewport.setShaderGraph("node-hero", colorGraph, {}).ok).toBe(true);
    const blue = { ...colorGraph, nodes: colorGraph.nodes.map((node) => node.id === "red" ? { ...node, value: [0, 0, 1] } : node) };
    expect(viewport.setShaderGraph("node-child", blue, {}).ok).toBe(true);
    viewport.render();
    const last = frames[2]!.items;
    expect(last[1]!.modelMatrix[12]).toBeCloseTo(3.2);
    expect(last[0]!.material).not.toBe(last[1]!.material);
    runtime.select(["node-child"]);
    viewport.render();
    expect(frames[3]!.items.map((item) => item.material)).toEqual(last.map((item) => item.material));
    const cameraBefore = frames[3]!.view;
    Object.assign(viewport, { orbitYaw: 30 });
    viewport.render();
    expect(frames[4]!.view).not.toEqual(cameraBefore);
    const materials = last.map((item) => item.material);
    const geometry = last[0]!.geometry;
    viewport.dispose();
    expect(materials.every((material) => material.disposed)).toBe(true);
    expect(() => geometry.vertexBuffer.upload(new MockRenderDevice())).toThrow(/disposed/);
    viewport.render();
    expect(frames).toHaveLength(5);
  });

  it("submits the real project geometry and separate graph materials through the renderer on a mock device", async () => {
    const { shell } = createShellHarness();
    const renderer = await Renderer.create({ backend: "mock", width: 900, height: 520 });
    const viewport = createViewportHarness(shell, renderer);
    expect(viewport.setShaderGraph("node-hero", colorGraph, {}).ok).toBe(true);
    viewport.render();
    expect(viewport.diagnosticsSnapshot()).toMatchObject({ drawCalls: 2, lastError: null });
    expect(shell.runtime.diagnosticsSnapshot()).toMatchObject({ drawCalls: 2, triangleCount: 24 });
    shell.runtime.setMode("play");
    expect(() => viewport.render()).not.toThrow();
    expect(viewport.diagnosticsSnapshot()).toMatchObject({ drawCalls: 2, lastError: null });
    shell.runtime.setMode("edit");
    viewport.dispose();
  });

  it("loads imported glTF geometry into the project scene and releases its resources when removed", async () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const uri = triangleGltfUri();
    const asset = { id: "mesh", name: "Triangle", type: "gltf" as const, uri, importedAt: "2026-01-01T00:00:00.000Z", preview: "triangle", diagnostics: [] };
    shell.project = { ...shell.project, assets: [asset], scene: { nodes: shell.project.scene.nodes.map((node) =>
      node.id === "node-child" ? { ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: asset.id } } : node) } };
    const frames: { renderItems: readonly { geometry: Geometry; userData: Record<string, string>; modelMatrix: readonly number[] }[] }[] = [];
    const viewport = createViewportHarness(shell, {
      device: new MockRenderDevice(), render: (source: typeof frames[number]) => { frames.push(source); return { drawCalls: source.renderItems.length }; }, dispose: vi.fn()
    });
    const manager = new AssetManager();
    manager.register(new GLTFLoader());
    Object.assign(viewport, { assetManager: manager });
    const entry: { key: string; controller: AbortController; handle?: AssetHandle<GLTFAsset>; resources?: GLTFRenderResources } = {
      key: JSON.stringify([uri, null, 1]), controller: new AbortController()
    };
    const internals = viewport as unknown as {
      meshAssets: Map<string, typeof entry>;
      loadMeshAsset(id: string, uri: string, candidate: typeof entry): Promise<void>;
    };
    internals.meshAssets.set(asset.id, entry);
    await internals.loadMeshAsset(asset.id, uri, entry);
    expect(entry.handle?.disposed).toBe(false);
    expect(entry.resources?.geometryLibrary.size).toBeGreaterThan(0);
    viewport.render();
    const imported = frames[0]!.renderItems.find((item) => item.userData.editorNodeId === "node-child");
    expect(imported).toBeDefined();
    expect([...entry.resources!.geometryLibrary.values()]).toContain(imported!.geometry);
    expect(imported!.modelMatrix[12]).toBeCloseTo(1.2);
    const handle = entry.handle!;
    shell.project = { ...shell.project, assets: [] };
    viewport.render();
    expect(handle.disposed).toBe(true);
    expect(() => imported!.geometry.vertexBuffer.upload(new MockRenderDevice())).toThrow(/disposed/);
    expect(frames[1]!.renderItems.some((item) => item.userData.editorNodeId === "node-child")).toBe(false);
    viewport.dispose();
  });

  it("advances imported animation independently for each project node and restores the edit pose", async () => {
    const { shell, runtime } = createShellHarness();
    const uri = triangleGltfUri(true);
    const asset = { id: "model", name: "Model", type: "gltf" as const, uri, importedAt: "2026-01-01", preview: "model", diagnostics: [] };
    shell.project = { ...shell.project, assets: [asset], scene: { nodes: shell.project.scene.nodes.map((node) => ({
      ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: asset.id },
      animation: { enabled: node.id === "node-hero", clip: "Move", loop: true }
    })) } };
    const viewport = createViewportHarness(shell, { dispose: vi.fn() });
    const manager = new AssetManager();
    manager.register(new GLTFLoader());
    Object.assign(viewport, { assetManager: manager });
    const entry: { key: string; controller: AbortController; handle?: AssetHandle<GLTFAsset>; resources?: GLTFRenderResources } = {
      key: JSON.stringify([uri, null, 1]), controller: new AbortController()
    };
    const internals = viewport as unknown as {
      meshAssets: Map<string, typeof entry>;
      loadMeshAsset(id: string, uri: string, candidate: typeof entry): Promise<void>;
      sceneRenderItems(delta: number): readonly { modelMatrix: readonly number[]; userData: Record<string, string> }[];
    };
    internals.meshAssets.set(asset.id, entry);
    await internals.loadMeshAsset(asset.id, uri, entry);
    runtime.setMode("play");
    const frame = internals.sceneRenderItems(0.5);
    expect(frame.find((item) => item.userData.editorNodeId === "node-hero")?.modelMatrix[12]).toBeCloseTo(0.5);
    expect(frame.find((item) => item.userData.editorNodeId === "node-child")?.modelMatrix[12]).toBeCloseTo(1.2);
    const next = internals.sceneRenderItems(0.25);
    expect(next.find((item) => item.userData.editorNodeId === "node-hero")?.modelMatrix[12]).toBeCloseTo(0.75);
    expect(next.find((item) => item.userData.editorNodeId === "node-child")?.modelMatrix[12]).toBeCloseTo(1.2);
    runtime.setMode("edit");
    viewport.resetSceneInstances();
    const restored = internals.sceneRenderItems(0);
    expect(restored.find((item) => item.userData.editorNodeId === "node-hero")?.modelMatrix[12]).toBeCloseTo(0);
    viewport.dispose();
  });

  it("schedules only active animation frames and cancels frame handle zero", () => {
    const { shell, runtime } = createShellHarness();
    shell.project = { ...shell.project, scene: { nodes: shell.project.scene.nodes.map((node) =>
      node.id === "node-hero" ? { ...node, animation: { enabled: true, clip: "Move", loop: true } } : node) } };
    const viewport = createViewportHarness(shell, { dispose: vi.fn() });
    const request = vi.fn().mockReturnValue(0);
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    try {
      const internals = viewport as unknown as { modelInstances: Map<string, unknown>; scheduleAnimation(): void };
      internals.modelInstances.set("node-hero", { mixer: { snapshot: () => ({ activeClipNames: ["Move"] }) } });
      runtime.setMode("play");
      internals.scheduleAnimation();
      internals.scheduleAnimation();
      expect(request).toHaveBeenCalledOnce();
      runtime.setMode("edit");
      internals.scheduleAnimation();
      expect(cancel).toHaveBeenCalledWith(0);
      internals.modelInstances.clear();
      viewport.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects graph materials on deforming glTF meshes instead of silently losing deformation", () => {
    const { shell } = createShellHarness();
    const viewport = createViewportHarness(shell, { device: new MockRenderDevice(), dispose: vi.fn() });
    expect(viewport.setShaderGraph("node-child", colorGraph, {}).ok).toBe(true);
    const internals = viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial>; meshAssets: Map<string, unknown> };
    const previous = internals.graphMaterials.get("node-child")!;
    shell.project = { ...shell.project, scene: { nodes: shell.project.scene.nodes.map((node) => node.id === "node-child"
      ? { ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: "model" } } : node) } };
    internals.meshAssets.set("model", {
      key: "model", controller: new AbortController(),
      resources: { scene: { collectRenderables: () => [{ renderable: { skinning: { jointCount: 1 }, morphWeights: [] } }] } },
      handle: { value: { meshes: [] } }
    });
    const result = viewport.setShaderGraph("node-child", colorGraph, {});
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join(" ")).toMatch(/skinned or morph-target/);
    expect(previous.disposed).toBe(true);
    expect(internals.graphMaterials.has("node-child")).toBe(false);
    internals.meshAssets.clear();
    viewport.dispose();
  });

  it("preflights physical and UV graph attributes against every rendered mesh", () => {
    const { shell } = createShellHarness();
    const viewport = createViewportHarness(shell, { device: new MockRenderDevice(), dispose: vi.fn() });
    const roughness: ShaderGraphDocument = {
      ...colorGraph,
      nodes: [...colorGraph.nodes, { id: "rough", op: "constant", type: "f32", value: 0.5 }],
      outputs: { ...colorGraph.outputs, roughness: "rough" }
    };
    // The editable cube has normals, so the portable lit graph is applicable.
    expect(viewport.setShaderGraph("node-child", roughness, {}).ok).toBe(true);
    const internals = viewport as unknown as { graphMaterials: Map<string, PortableShaderMaterial>; meshAssets: Map<string, unknown> };
    const oldMaterial = internals.graphMaterials.get("node-child")!;
    const triangle = Geometry.triangle();
    shell.project = { ...shell.project, scene: { nodes: shell.project.scene.nodes.map((node) => node.id === "node-child"
      ? { ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: "model" } } : node) } };
    internals.meshAssets.set("model", {
      key: "model", controller: new AbortController(),
      resources: { scene: { collectRenderables: () => [{ renderable: { geometry: "triangle", morphWeights: [] } }] }, geometryLibrary: new Map([["triangle", triangle]]) },
      handle: { value: { meshes: [] } }
    });
    const missingNormal = viewport.setShaderGraph("node-child", roughness, {});
    expect(missingNormal.ok).toBe(false);
    expect(missingNormal.diagnostics.join(" ")).toMatch(/a_normal/);
    expect(oldMaterial.disposed).toBe(true);
    expect(internals.graphMaterials.has("node-child")).toBe(false);

    // An unlit graph still applies; a failed UV1 edit retains that compatible material.
    expect(viewport.setShaderGraph("node-child", colorGraph, {}).ok).toBe(true);
    const compatible = internals.graphMaterials.get("node-child")!;
    const uv1: ShaderGraphDocument = {
      ...colorGraph,
      nodes: [...colorGraph.nodes, { id: "uv", op: "input", type: "vec2", name: "uv1" },
        { id: "z", op: "constant", type: "f32", value: 0 }, { id: "position", op: "construct", type: "vec3", inputs: ["uv", "z"] }],
      outputs: { ...colorGraph.outputs, position: "position" }
    };
    const missingUv = viewport.setShaderGraph("node-child", uv1, {});
    expect(missingUv.ok).toBe(false);
    expect(missingUv.diagnostics.join(" ")).toMatch(/a_uv1/);
    expect(internals.graphMaterials.get("node-child")).toBe(compatible);
    expect(compatible.disposed).toBe(false);
    internals.meshAssets.clear();
    triangle.dispose();
    viewport.dispose();
  });

  it("inspects and binds embedded glTF textures and retires dependent graph materials", () => {
    const { shell, runtime } = createShellHarness();
    runtime.select(["node-child"]);
    const viewport = createViewportHarness(shell, { device: new MockRenderDevice(), dispose: vi.fn() });
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]), label: "Embedded image" });
    const disposeResources = vi.fn(() => texture.dispose());
    const resources = { textureLibrary: new Map([["0:srgb", texture]]), dispose: disposeResources };
    const entry = { key: "mesh-key", controller: new AbortController(), resources };
    const internals = viewport as unknown as { meshAssets: Map<string, typeof entry>; retireMeshAsset(candidate: typeof entry): void; graphMaterials: Map<string, PortableShaderMaterial> };
    internals.meshAssets.set("source", entry);
    const id = viewport.getInspectableTextures()[0]!.id;
    expect(id).toBe("gltf-texture:source:0%3Asrgb");
    expect(viewport.textureResourceState(id)).toMatchObject({ status: "ready" });
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material", nodes: [
        { id: "uv", op: "constant", type: "vec2", value: [0, 0] },
        { id: "sample", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] }
      ], resources: [{ name: "image", kind: "texture2d" }], outputs: { color: "sample" }
    };
    expect(viewport.setShaderGraph("node-child", graph, { image: { kind: "texture", assetId: id } }).ok).toBe(true);
    const material = internals.graphMaterials.get("node-child")!;
    internals.retireMeshAsset(entry);
    expect(disposeResources).toHaveBeenCalledOnce();
    expect(material.disposed).toBe(true);
    expect(internals.graphMaterials.has("node-child")).toBe(false);
    expect(texture.disposed).toBe(true);
    internals.meshAssets.clear();
    viewport.dispose();
  });

  it("releases a glTF handle that resolves after its viewport entry is retired", async () => {
    const { shell } = createShellHarness();
    const viewport = createViewportHarness(shell, { dispose: vi.fn() });
    let resolve!: (handle: { value: object }) => void;
    const load = vi.fn().mockReturnValue(new Promise<{ value: object }>((accept) => { resolve = accept; }));
    const release = vi.fn().mockResolvedValue(undefined);
    Object.assign(viewport, { assetManager: { load, release } });
    const entry = { key: "pending", controller: new AbortController() };
    const internals = viewport as unknown as {
      meshAssets: Map<string, typeof entry>;
      loadMeshAsset(id: string, uri: string, candidate: typeof entry): Promise<void>;
      retireMeshAsset(candidate: typeof entry): void;
    };
    internals.meshAssets.set("pending", entry);
    const pending = internals.loadMeshAsset("pending", "model.glb", entry);
    internals.retireMeshAsset(entry);
    internals.meshAssets.delete("pending");
    const handle = { value: {} };
    resolve(handle);
    await pending;
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(handle);
    viewport.dispose();
  });

  it("loads real texture handles from selected assets and disposes replaced or removed images", () => {
    class FakeImage {
      static readonly instances: FakeImage[] = [];
      naturalWidth = 2;
      naturalHeight = 1;
      src = "";
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { FakeImage.instances.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("document", { baseURI: "https://editor.invalid/" });
    try {
      const assets = [{ id: "image", name: "Image", type: "texture", uri: "/one.png" }];
      const notify = vi.fn();
      const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
      Object.assign(viewport, { shell: { project: { assets }, notifyShaderTexturesChanged: notify }, textureAssets: new Map(), meshAssets: new Map(), graphMaterials: new Map(), textureRevision: 0 });
      const sync = () => (viewport as unknown as { syncTextureAssets(): void }).syncTextureAssets();
      sync();
      expect(viewport.textureInspectionState().status).toBe("loading");
      const firstImage = FakeImage.instances[0]!;
      const lateFirstLoad = firstImage.onload!;
      firstImage.onload?.();
      const firstTexture = viewport.getInspectableTextures()[0]!.texture;
      expect(inspectTexture(firstTexture)).toMatchObject({ width: 2, height: 1, sourceBacked: true, disposed: false });
      assets[0]!.uri = "/two.png";
      sync();
      expect(firstTexture.disposed).toBe(true);
      lateFirstLoad();
      expect(viewport.getInspectableTextures()).toHaveLength(0);
      FakeImage.instances[1]!.onload?.();
      const secondTexture = viewport.getInspectableTextures()[0]!.texture;
      expect(secondTexture).not.toBe(firstTexture);
      assets.splice(0, 1);
      sync();
      expect(secondTexture.disposed).toBe(true);
      expect(viewport.getInspectableTextures()).toHaveLength(0);
      expect(notify).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("inspects live texture mip state and disposed handles rather than an editor fixture", () => {
    const texture = new Texture({ width: 4, height: 4, format: "rgba8", mipLevelCount: 3, data: new Uint8Array(64) });
    const before = inspectTexture(texture);
    expect(before).toMatchObject({ width: 4, height: 4, format: "rgba8", estimatedBytes: 84, disposed: false });
    expect(before.mipLevels.map((mip) => mip.cpuBytes)).toEqual([64, 0, 0]);
    texture.updateMip(1, new Uint8Array(16));
    expect(inspectTexture(texture).mipLevels[1]).toMatchObject({ width: 2, height: 2, cpuBytes: 16, revision: 1 });
    texture.dispose();
    expect(inspectTexture(texture).disposed).toBe(true);
  });

  it("reports live frame counters and measured passes without inventing missing timing data", () => {
    let draws = 2;
    const inspector = new FrameInspector({
      getDiagnostics: () => ({ drawCalls: draws, buffers: 1, shaders: 1, contextLost: false, lastError: null })
    });
    expect(inspector.capture()).toMatchObject({ status: "partial", drawCalls: 2, cpuTimeMs: null, passes: [] });
    draws = 5;
    expect(inspector.capture().drawCalls).toBe(5);
    const complete = new FrameInspector({
      getDiagnostics: () => ({ drawCalls: 0, buffers: 0, shaders: 0, contextLost: false, lastError: null }),
      getFrameInspection: () => ({
        frameNumber: 8, cpuTimeMs: 1.5, gpuTimeMs: null, complete: true,
        diagnostics: { drawCalls: 3, buffers: 2, shaders: 1, textures: 4, contextLost: false, lastError: null },
        passes: [{ name: "forward", reads: ["depth"], writes: ["color"], drawCalls: 3, cpuTimeMs: 0.8, gpuTimeMs: null }]
      })
    }).capture();
    expect(complete).toMatchObject({ status: "ready", frameNumber: 8, drawCalls: 3, gpuTimeMs: null, resources: { textures: 4 } });
    expect(complete.passes[0]).toMatchObject({ name: "forward", reads: ["depth"], writes: ["color"], cpuTimeMs: 0.8 });
  });

  it("inspects the current compiler output and redacts graph-owned secrets in diagnostics and expressions", () => {
    let graph: ShaderGraphDocument | null = colorGraph;
    const inspector = new ShaderGraphInspector({ getShaderGraph: () => graph });
    const first = inspector.inspect("glsl");
    expect(first.status).toBe("compiled");
    expect(first.shaderStages.map((stage) => stage.stage)).toEqual(["vertex", "fragment"]);
    expect(JSON.stringify(first)).not.toContain('"red"');
    graph = { ...colorGraph, nodes: colorGraph.nodes.map((node) => node.id === "multiply" ? { ...node, op: "add" } : node) };
    const second = inspector.inspect("glsl");
    expect(second.expressions).not.toEqual(first.expressions);
    graph = { ...colorGraph, nodes: [...colorGraph.nodes, { id: "private_secret", op: "add", type: "vec3", inputs: ["private_token", "red"] }] };
    const failure = inspector.inspect("glsl");
    expect(failure).toMatchObject({ status: "error", diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing-node", nodeIndex: 3 })]) });
    expect(JSON.stringify(failure)).not.toMatch(/private_secret|private_token/);
    graph = null;
    expect(inspector.inspect("wgsl").status).toBe("empty");
  });

  it("ships the declared local Whitney font files as WOFF2", () => {
    const root = new URL("../../../", import.meta.url);
    for (const weight of ["regular", "medium", "semibold"]) {
      const font = readFileSync(new URL(`public/fonts/whitney-${weight}.woff2`, root));
      expect(font.subarray(0, 4).toString("ascii")).toBe("wOF2");
      expect(font.byteLength).toBeGreaterThan(1000);
    }
    const css = readFileSync(new URL("apps/editor/src/styles.ts", root), "utf8");
    for (const weight of ["regular", "medium", "semibold"]) expect(css).toContain(`/fonts/whitney-${weight}.woff2`);
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|url\(["']?\/Users\//i);
  });

  it("ships Whitney glyphs and OpenType features used by the editor", () => {
    const root = new URL("../../../", import.meta.url);
    for (const weight of ["regular", "medium", "semibold"]) {
      const font = readFileSync(new URL(`public/fonts/whitney-${weight}.woff2`, root));
      expect(fontHasCodePoint(woff2Table(font, "cmap"), 0x20ac), `${weight} lacks €`).toBe(true);
      const features = fontFeatures(woff2Table(font, "GSUB"));
      expect(features.has("tnum"), `${weight} lacks tabular figures`).toBe(true);
      expect(features.has("smcp"), `${weight} lacks small caps`).toBe(true);
    }
  });

  it("uses metric-adjusted local fallbacks after Whitney", () => {
    const css = readFileSync(new URL("../../../apps/editor/src/styles.ts", import.meta.url), "utf8");
    expect(css).toMatch(/--font-ui:\s*"Whitney",\s*"Whitney Fallback",\s*sans-serif/);
    const fallbacks = [...css.matchAll(/@font-face\s*\{([^}]*"Whitney Fallback"[^}]*)\}/g)].map((match) => match[1]!);
    expect(fallbacks).toHaveLength(2);
    for (const fallback of fallbacks) {
      expect(fallback).toMatch(/src:\s*local\(/);
      for (const metric of ["size-adjust", "ascent-override", "descent-override", "line-gap-override"]) expect(fallback).toContain(`${metric}:`);
    }
  });

  it("keeps editor weights, typography and controls on the compact scale", () => {
    const css = readFileSync(new URL("../../../apps/editor/src/styles.ts", import.meta.url), "utf8");
    // invariant: source must keep `font-family: "Whitney"` — the editor UI renders in the licensed local Whitney face instead of a system or Google font
    expect(css).toContain('font-family: "Whitney"');
    expect(css).toContain("font-synthesis: none");
    expect(css).toContain("font-variant-caps: small-caps");
    expect(css).toContain("min-height: 32px");
    expect(css).not.toMatch(/font-weight:\s*(?:300|700|bold)\b|font-size:\s*(?:[0-9]|1[01])px\b/i);
    expect(css).not.toMatch(/fonts\.googleapis\.com|font-family:\s*["']?(?:Inter|Roboto|Graphik)/i);
  });

  it("uses Whitney tabular figures for aligned editor metrics without a digits-only font", () => {
    const css = readFileSync(new URL("../../../apps/editor/src/styles.ts", import.meta.url), "utf8");
    expect(css).toMatch(/td,\s*\.metrics dd\s*\{\s*font-variant-numeric:\s*tabular-nums/);
    expect(css).not.toMatch(/Whitney Numeric|DIN Pro|dinpro-/);
  });
});

/** Exercise the actual shell actions and serializer without constructing DOM panels. */
function createShellHarness(): { shell: EditorShell; runtime: EditorRuntime; buffer: { value: string } } {
  const serializer = new ProjectSerializer();
  const project = serializer.createDefaultProject();
  const runtime = new EditorRuntime();
  const buffer = { value: "" };
  const shell = Object.create(EditorShell.prototype) as EditorShell;
  Object.assign(shell, {
    runtime, serializer, project, scene: serializer.buildScene(project).scene,
    root: { querySelector: () => buffer }, messages: [], graphFeedback: new Map(), orphanedGraphs: new Map(),
    lastAttemptedGraphs: new Map(), graphTextureRevision: 0, savedProjectJson: "", disposed: false,
    refresh: vi.fn(), syncPrefabRegistry: vi.fn()
  });
  return { shell, runtime, buffer };
}

function createViewportHarness(shell: EditorShell, renderer: unknown): EditorViewport {
  const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
  Object.assign(viewport, {
    shell, renderer, disposed: false, canvas: { width: 900, height: 520 }, textureAssets: new Map(), textureRevision: 0,
    graphMaterials: new Map(), graphMaterialSerial: 0, nodeMaterials: new Map(), importedMaterials: new Map(), modelInstances: new Map(),
    geometries: new Map(), meshAssets: new Map(), assetManager: { release: vi.fn().mockResolvedValue(undefined) },
    orbitYaw: 0, orbitPitch: 20, panX: 0, panY: 0, focusZ: 0, zoom: 1, drawOverlay: vi.fn()
  });
  return viewport;
}

function triangleGltfUri(animated = false): string {
  const data = Buffer.alloc(animated ? 76 : 42);
  [-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0].forEach((value, index) => data.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => data.writeUInt16LE(value, 36 + index * 2));
  if (animated) {
    [0, 1].forEach((value, index) => data.writeFloatLE(value, 44 + index * 4));
    [0, 0, 0, 1, 0, 0].forEach((value, index) => data.writeFloatLE(value, 52 + index * 4));
  }
  const gltf = {
    asset: { version: "2.0" }, buffers: [{ uri: `data:application/octet-stream;base64,${data.toString("base64")}`, byteLength: data.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 },
      ...(animated ? [{ buffer: 0, byteOffset: 44, byteLength: 8 }, { buffer: 0, byteOffset: 52, byteLength: 24 }] : [])],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      ...(animated ? [{ bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
        { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" }] : [])],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], nodes: [{ name: "AnimatedTriangle", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    ...(animated ? { animations: [{ name: "Move", samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }] } : {})
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

// Read the untransformed cmap/GSUB tables directly so this test needs no font tool at runtime.
function woff2Table(font: Buffer, wanted: string): Buffer {
  const tags = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];
  let cursor = 48;
  const readSize = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = font[cursor++]!;
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("Invalid WOFF2 table size.");
  };
  const tables: { tag: string; size: number }[] = [];
  for (let i = 0; i < font.readUInt16BE(12); i += 1) {
    const flags = font[cursor++]!;
    const index = flags & 0x3f;
    const tag = index === 63 ? font.toString("ascii", cursor, cursor += 4) : tags[index]!;
    const originalSize = readSize();
    const version = flags >> 6;
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    tables.push({ tag, size: transformed ? readSize() : originalSize });
  }
  const decompressed = brotliDecompressSync(font.subarray(cursor, cursor + font.readUInt32BE(20)));
  let offset = 0;
  for (const table of tables) {
    if (table.tag === wanted) return decompressed.subarray(offset, offset + table.size);
    offset += table.size;
  }
  throw new Error(`WOFF2 is missing ${wanted}.`);
}

function fontHasCodePoint(cmap: Buffer, codePoint: number): boolean {
  for (let i = 0; i < cmap.readUInt16BE(2); i += 1) {
    const offset = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(offset);
    if (format === 12) {
      for (let j = 0; j < cmap.readUInt32BE(offset + 12); j += 1) {
        const group = offset + 16 + j * 12;
        const start = cmap.readUInt32BE(group);
        const end = cmap.readUInt32BE(group + 4);
        if (codePoint >= start && codePoint <= end && cmap.readUInt32BE(group + 8) + codePoint - start !== 0) return true;
      }
    } else if (format === 4 && codePoint <= 0xffff) {
      const segmentBytes = cmap.readUInt16BE(offset + 6);
      const ends = offset + 14;
      const starts = ends + segmentBytes + 2;
      const deltas = starts + segmentBytes;
      const ranges = deltas + segmentBytes;
      for (let j = 0; j < segmentBytes / 2; j += 1) {
        const start = cmap.readUInt16BE(starts + j * 2);
        const end = cmap.readUInt16BE(ends + j * 2);
        if (codePoint < start || codePoint > end) continue;
        const delta = cmap.readInt16BE(deltas + j * 2);
        const rangeAt = ranges + j * 2;
        const range = cmap.readUInt16BE(rangeAt);
        const raw = range === 0 ? codePoint : cmap.readUInt16BE(rangeAt + range + 2 * (codePoint - start));
        if (raw !== 0 && ((raw + delta) & 0xffff) !== 0) return true;
      }
    }
  }
  return false;
}

function fontFeatures(gsub: Buffer): Set<string> {
  const offset = gsub.readUInt16BE(6);
  const features = new Set<string>();
  for (let i = 0; i < gsub.readUInt16BE(offset); i += 1) features.add(gsub.toString("ascii", offset + 2 + i * 6, offset + 6 + i * 6));
  return features;
}
