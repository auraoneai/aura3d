import { describe, expect, it, vi } from "vitest";
import { GLTFLoader, LoadContext, createGLTFRenderResources, type GLTFAsset, type GLTFRenderResources } from "@aura3d/assets";
import { DepthPass, ForwardPass, MockRenderDevice, type PortableShaderMaterial, type RenderItem } from "@aura3d/rendering";
import type { Renderer } from "@aura3d/engine/renderer";
import type { ShaderGraphDocument } from "@aura3d/rendering/shader-graph";
import { ProjectSceneRuntime, type ProjectSceneHost } from "../../../apps/editor/src/export/ProjectSceneRuntime";
import { ProjectSerializer } from "../../../apps/editor/src/project/ProjectSerializer";

const graph: ShaderGraphDocument = {
  version: 1, stage: "material",
  nodes: [{ id: "color", op: "constant", type: "vec3", value: [1, 0.5, 0.25] }],
  outputs: { color: "color" }
};

/** One animated glTF triangle, authored solely for this source test. */
function skinUri(options: { readonly morph?: boolean; readonly eight?: boolean; readonly invalidJoint?: boolean } = {}): string {
  const parts: Buffer[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const add = (data: ArrayBufferView): number => {
    const offset = parts.reduce((sum, part) => sum + part.length, 0);
    const padding = (4 - offset % 4) % 4;
    if (padding) parts.push(Buffer.alloc(padding));
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    views.push({ buffer: 0, byteOffset: offset + padding, byteLength: bytes.length });
    parts.push(bytes);
    return views.length - 1;
  };
  const positions = add(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]));
  const normals = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const joints = add(new Uint16Array([options.invalidJoint ? 1 : 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const weights = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const inverse = add(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  const times = add(new Float32Array([0, 1]));
  const translations = add(new Float32Array([0, 0, 0, 1, 0, 0]));
  const joints1 = options.eight ? add(new Uint16Array(12)) : undefined;
  const weights1 = options.eight ? add(new Float32Array(12)) : undefined;
  const morph = options.morph ? add(new Float32Array([0, 0, 0.2, 0, 0, 0, 0, 0, 0])) : undefined;
  const binary = Buffer.concat(parts);
  const accessors = [
    { bufferView: positions, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
    { bufferView: normals, componentType: 5126, count: 3, type: "VEC3" },
    { bufferView: joints, componentType: 5123, count: 3, type: "VEC4" },
    { bufferView: weights, componentType: 5126, count: 3, type: "VEC4" },
    { bufferView: inverse, componentType: 5126, count: 1, type: "MAT4" },
    { bufferView: times, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
    { bufferView: translations, componentType: 5126, count: 2, type: "VEC3" },
    ...(options.eight ? [{ bufferView: joints1, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: weights1, componentType: 5126, count: 3, type: "VEC4" }] : []),
    ...(options.morph ? [{ bufferView: morph, componentType: 5126, count: 3, type: "VEC3" }] : [])
  ];
  const document = {
    asset: { version: "2.0" }, buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.length }],
    bufferViews: views, accessors,
    meshes: [{ name: "Triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3,
      ...(options.eight ? { JOINTS_1: 7, WEIGHTS_1: 8 } : {}) }, ...(options.morph ? { targets: [{ POSITION: options.eight ? 9 : 7 }] } : {}) }] }],
    nodes: [{ name: "Mesh", mesh: 0, skin: 0 }, { name: "Joint" }], skins: [{ joints: [1], inverseBindMatrices: 4 }],
    scenes: [{ nodes: [0, 1] }], scene: 0,
    animations: [{ name: "Move", samplers: [{ input: 5, output: 6 }], channels: [{ sampler: 0, target: { node: 1, path: "translation" } }] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`;
}

async function harness(options: Parameters<typeof skinUri>[0] = {}) {
  const asset = await new GLTFLoader().load({ url: skinUri(options) }, new LoadContext());
  const resources = await createGLTFRenderResources(asset);
  const serializer = new ProjectSerializer();
  const original = serializer.createDefaultProject();
  const project = { ...original, scene: { nodes: original.scene.nodes.map((node) => node.id === "node-child"
    ? { ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: "model" }, animation: { enabled: true, clip: "Move", loop: true } } : node) } };
  const host: ProjectSceneHost = {
    project, scene: serializer.buildScene(project).scene, runtime: { mode: "play" },
    notifyShaderTexturesChanged: vi.fn(), addConsoleMessage: vi.fn()
  };
  const runtime = new ProjectSceneRuntime(host);
  const device = new MockRenderDevice();
  runtime.setRenderer({ device, dispose: () => {} } as unknown as Renderer);
  const internal = runtime as unknown as {
    meshAssets: Map<string, { key: string; controller: AbortController; resources: GLTFRenderResources; handle: { value: GLTFAsset } }>;
    graphMaterials: Map<string, PortableShaderMaterial>;
    assetManager: { release: () => Promise<void> };
    sceneRenderItems(delta: number): RenderItem[];
  };
  internal.assetManager = { release: async () => {} };
  internal.meshAssets.set("model", { key: "model", controller: new AbortController(), resources, handle: { value: asset } });
  return { runtime, device, internal, host };
}

describe("editor graph materials on imported skins", () => {
  it("compiles actual skin variants and submits an animated imported mesh in forward and depth passes", async () => {
    const { runtime, device, internal } = await harness();
    try {
      expect(runtime.setShaderGraph("node-child", graph, {})).toEqual({ ok: true, diagnostics: [] });
      const material = internal.graphMaterials.get("node-child")!;
      const item = internal.sceneRenderItems(0.5).find((entry) => entry.userData?.editorNodeId === "node-child")!;
      expect(item.material).toBe(material);
      expect(item.skinning?.jointCount).toBe(1);
      expect(item.skinning?.matrices[12]).toBeCloseTo(0.5);
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]!.shader?.label).toBe(material.graphSkinningVariant(4, "float", "float", "forward"));
      expect(device.drawCommands[1]!.shader?.label).toBe(material.graphSkinningVariant(4, "float", "float", "depth"));
      expect(device.drawCommands[0]!.uniforms?.get("u_jointCount")).toBe(1);
      device.endFrame();
      expect(runtime.setShaderGraph("node-child", { ...graph, outputs: { color: "missing" } }, {}).ok).toBe(false);
      expect(internal.graphMaterials.get("node-child")).toBe(material);
      expect(material.disposed).toBe(false);
    } finally { runtime.dispose(); device.dispose(); }
  });

  it.each([
    [{ morph: true }, /morph-target/],
    [{ eight: true }, /eight skin influences/],
    [{ invalidJoint: true }, /invalid skin joint or weight/]
  ])("rejects unsupported imported deformation with a diagnostic (%o)", async (options, message) => {
    const { runtime, device } = await harness(options);
    try {
      const result = runtime.setShaderGraph("node-child", graph, {});
      expect(result.ok).toBe(false);
      expect(result.diagnostics.join(" ")).toMatch(message);
    } finally { runtime.dispose(); device.dispose(); }
  });

  it("keeps the last working skin material when a new depth variant fails to compile", async () => {
    const { runtime, device, internal } = await harness();
    const originalCompile = device.createShaderProgram.bind(device);
    try {
      expect(runtime.setShaderGraph("node-child", graph, {}).ok).toBe(true);
      const previous = internal.graphMaterials.get("node-child")!;
      let calls = 0;
      vi.spyOn(device, "createShaderProgram").mockImplementation((source) => {
        calls += 1;
        if (calls === 3) throw new Error("depth variant compilation failed");
        return originalCompile(source);
      });
      const edited: ShaderGraphDocument = { ...graph, nodes: [{ id: "color", op: "constant", type: "vec3", value: [0, 1, 0] }] };
      const result = runtime.setShaderGraph("node-child", edited, {});
      expect(result.ok).toBe(false);
      expect(result.diagnostics.join(" ")).toMatch(/depth variant compilation failed/);
      expect(internal.graphMaterials.get("node-child")).toBe(previous);
      expect(previous.disposed).toBe(false);
      expect(device.getDiagnostics().shaders).toBe(0);
    } finally { vi.restoreAllMocks(); runtime.dispose(); device.dispose(); }
  });

  it("does not reuse an admitted graph after the imported model changes to a morph target", async () => {
    const { runtime, device, internal, host } = await harness();
    const originalResources = internal.meshAssets.get("model")!.resources;
    const replacementAsset = await new GLTFLoader().load({ url: skinUri({ morph: true }) }, new LoadContext());
    const replacementResources = await createGLTFRenderResources(replacementAsset);
    try {
      expect(runtime.setShaderGraph("node-child", graph, {}).ok).toBe(true);
      const previous = internal.graphMaterials.get("node-child")!;
      internal.sceneRenderItems(0);
      internal.meshAssets.set("model", { key: "replacement", controller: new AbortController(), resources: replacementResources, handle: { value: replacementAsset } });
      const item = internal.sceneRenderItems(0).find((entry) => entry.userData?.editorNodeId === "node-child")!;
      expect(item.material).not.toBe(previous);
      expect(previous.disposed).toBe(true);
      expect(internal.graphMaterials.has("node-child")).toBe(false);
      await Promise.resolve();
      expect(host.notifyShaderTexturesChanged).toHaveBeenCalled();
      expect(runtime.setShaderGraph("node-child", graph, {}).diagnostics.join(" ")).toMatch(/morph-target/);
    } finally { originalResources.dispose(); runtime.dispose(); device.dispose(); }
  });

  it("does not invalidate unrelated graph materials when an unbuilt asset is retired", async () => {
    const { runtime, device, internal } = await harness();
    try {
      expect(runtime.setShaderGraph("node-child", graph, {}).ok).toBe(true);
      const previous = internal.graphMaterials.get("node-child")!;
      const retire = runtime as unknown as { retireMeshAsset(entry: { key: string; controller: AbortController }): void };
      retire.retireMeshAsset({ key: "pending", controller: new AbortController() });
      expect(internal.graphMaterials.get("node-child")).toBe(previous);
      expect(previous.disposed).toBe(false);
    } finally { runtime.dispose(); device.dispose(); }
  });
});
