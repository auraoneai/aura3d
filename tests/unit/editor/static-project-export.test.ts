import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, PortableShaderMaterial, type RenderItem } from "@aura3d/rendering";
import { createStaticExportRuntime } from "@aura3d/editor-runtime";
import { Renderer } from "@aura3d/engine/renderer";
import type { ShaderGraphDocument } from "@aura3d/rendering/shader-graph";
import { StaticProjectExporter } from "../../../apps/editor/src/export/StaticProjectExporter";
import { ExportedProjectRuntime, startExportedProject } from "../../../apps/editor/src/export/exportRuntimeEntry";
import { EditorShell } from "../../../apps/editor/src/EditorShell";
import { ProjectSerializer, type EditorAssetRecord } from "../../../apps/editor/src/project/ProjectSerializer";
import { createEditorExportRuntimePlugin } from "../../../vite.config";

const bundle = { script: "globalThis.__AURA3D_EXPORT_START__ = () => {};", fontDataUri: "data:font/woff2;base64,AQ==" };
const graph: ShaderGraphDocument = {
  version: 1, stage: "material", nodes: [{ id: "color", op: "constant", type: "vec3", value: [1, 0, 0] }],
  outputs: { color: "color" }
};

function asset(id: string, uri: string, type: EditorAssetRecord["type"] = "gltf"): EditorAssetRecord {
  return { id, name: id, uri, type, importedAt: "2026-01-01", preview: "", diagnostics: [], cacheKey: uri };
}

function response(body: BodyInit, type: string): Response {
  return new Response(body, { headers: { "content-type": type } });
}

function decodeDataUri(uri: string): Uint8Array {
  return Uint8Array.from(Buffer.from(uri.split(",")[1]!, "base64"));
}

describe("standalone editor project export", () => {
  it("delivers the generated runtime and font through the Vite export module", async () => {
    const compile = vi.fn().mockResolvedValue(bundle.script);
    const plugin = createEditorExportRuntimePlugin(compile, () => "AQ==");
    expect(plugin.resolveId("unrelated")).toBeNull();
    expect(await plugin.load("unrelated")).toBeNull();
    expect(compile).not.toHaveBeenCalled();
    const id = plugin.resolveId("virtual:aura3d-editor-export-runtime")!;
    const module = await plugin.load(id);
    expect(JSON.parse(module!.replace(/^export default /, "").replace(/;$/, ""))).toEqual(bundle);
    expect(compile).toHaveBeenCalledOnce();
  });

  it("emits a syntactically valid module bootstrap with escaped selector options", () => {
    const source = createStaticExportRuntime({ globalName: 'test"name', canvasSelector: "#canvas", projectPath: "./project.json" });
    expect(() => new Function(`return async () => { ${source} };`)).not.toThrow();
    expect(source).toContain('test\\"name');
  });

  it("captures glTF external buffers and images and embeds the runtime and licensed font", async () => {
    const serializer = new ProjectSerializer();
    const project = { ...serializer.createDefaultProject(), assets: [asset("model", "models/scene.gltf"), asset("image", "textures/albedo.png", "texture")] };
    const requests: string[] = [];
    const source = JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin", byteLength: 3 }], images: [{ uri: "../textures/albedo.png" }] });
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input); requests.push(url);
      if (url.endsWith("scene.gltf")) return response(source, "model/gltf+json");
      if (url.endsWith("mesh.bin")) return response(new Uint8Array([1, 2, 3]), "application/octet-stream");
      if (url.endsWith("albedo.png")) return response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "application/octet-stream");
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const exporter = new StaticProjectExporter(async () => bundle, fetcher, () => "https://editor.test/work/");
    const result = await exporter.export(project);
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "project.json", "runtime.js"]);
    const saved = serializer.parse(result.files[1]!.content);
    const savedGltf = JSON.parse(new TextDecoder().decode(decodeDataUri(saved.assets[0]!.uri)));
    expect([...decodeDataUri(savedGltf.buffers[0].uri)]).toEqual([1, 2, 3]);
    expect(savedGltf.images[0].uri).toMatch(/^data:image\/png;base64,/);
    expect([...decodeDataUri(savedGltf.images[0].uri)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(saved.assets[1]!.uri).toMatch(/^data:image\/png;base64,/);
    expect(saved.assets[0]!.cacheKey).toBe(`${saved.assets[0]!.uri}#rev-1`);
    expect(requests).toContain("https://editor.test/work/models/mesh.bin");
    expect(result.files[0]!.content).toContain(bundle.fontDataUri);
    expect(result.files[2]!.content).toContain(bundle.script);
    expect(result.files[2]!.content).toContain("__AURA3D_EXPORTED_PROJECT__");
    expect(result.files[2]!.content).not.toContain('getContext("2d")');
    expect(project.assets[0]!.uri).toBe("models/scene.gltf");
  });

  it("rewrites external GLB references without corrupting the remaining binary chunk", async () => {
    const serializer = new ProjectSerializer();
    const project = { ...serializer.createDefaultProject(), assets: [asset("model", "scene.glb")] };
    const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "outside.bin", byteLength: 4 }] }));
    const padded = Math.ceil(json.length / 4) * 4;
    const glb = Buffer.alloc(20 + padded + 12, 0x20);
    glb.write("glTF", 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(padded, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
    glb.writeUInt32LE(4, 20 + padded); glb.writeUInt32LE(0x004e4942, 24 + padded); glb.set([9, 8, 7, 6], 28 + padded);
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith(".glb")
      ? response(glb, "model/gltf-binary") : response(new Uint8Array([1, 2, 3, 4]), "application/octet-stream")) as typeof fetch;
    const result = await new StaticProjectExporter(async () => bundle, fetcher, () => "https://editor.test/").export(project);
    const saved = serializer.parse(result.files[1]!.content);
    const bytes = decodeDataUri(saved.assets[0]!.uri);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint32(12, true);
    expect(view.getUint32(8, true)).toBe(bytes.length);
    const rewritten = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)).trim());
    expect([...decodeDataUri(rewritten.buffers[0].uri)]).toEqual([1, 2, 3, 4]);
    expect([...bytes.slice(-4)]).toEqual([9, 8, 7, 6]);
  });

  it("fails closed when an asset or runtime bundle cannot be captured", async () => {
    const serializer = new ProjectSerializer();
    const project = { ...serializer.createDefaultProject(), assets: [asset("model", "https://private.test/secret.glb")] };
    const denied = new StaticProjectExporter(async () => bundle, async () => new Response(null, { status: 404 }), () => "https://editor.test/");
    await expect(denied.export(project)).rejects.toThrow(/Cannot export model: asset request failed \(404\)/);
    await expect(new StaticProjectExporter(async () => ({ ...bundle, script: "" }), async () => response("{}", "application/json"), () => "https://editor.test/").export({ ...project, assets: [] })).rejects.toThrow(/bundle or licensed font/);
    const invalid = { ...project, assets: [asset("model", "file:///secret.glb")] };
    await expect(denied.export(invalid)).rejects.toThrow(/unsupported asset URL scheme/);
  });

  it("cancels pending asset snapshots and does not wait for a late runtime bundle", async () => {
    const serializer = new ProjectSerializer();
    const project = { ...serializer.createDefaultProject(), assets: [asset("model", "model.glb")] };
    let assetSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: string | URL | Request, options?: RequestInit) => {
      assetSignal = options?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => assetSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }) as typeof fetch;
    let finishBundle!: (value: typeof bundle) => void;
    const exporter = new StaticProjectExporter(() => new Promise((resolve) => { finishBundle = resolve; }), fetcher, () => "https://editor.test/");
    const controller = new AbortController();
    const exporting = exporter.export(project, controller.signal);
    controller.abort();
    await expect(exporting).rejects.toThrow(/cancelled/);
    expect(assetSignal?.aborted).toBe(true);
    finishBundle(bundle);
  });

  it("offers each exported file for download and revokes replaced object URLs", async () => {
    const serializer = new ProjectSerializer();
    const files = [{ path: "index.html", type: "html", content: "html" }, { path: "project.json", type: "json", content: "{}" }, { path: "runtime.js", type: "javascript", content: "js" }];
    const links: { href: string; download: string; textContent: string }[] = [];
    const summary = { textContent: "", append: (link: unknown) => { if (typeof link === "object" && link && "download" in link) links.push(link as typeof links[number]); } };
    const makeUrl = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:1").mockReturnValueOnce("blob:2").mockReturnValueOnce("blob:3")
      .mockReturnValueOnce("blob:4").mockReturnValueOnce("blob:5").mockReturnValueOnce("blob:6");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", { createElement: () => ({ href: "", download: "", textContent: "" }), createTextNode: () => ({}) });
    try {
      const shell = Object.create(EditorShell.prototype) as EditorShell;
      Object.assign(shell, { disposed: false, exportUrls: [], root: { querySelector: () => summary }, project: serializer.createDefaultProject(),
        exporter: { export: vi.fn().mockResolvedValue({ entry: "index.html", files }) }, saveProject: vi.fn(), refresh: vi.fn(), addConsoleMessage: vi.fn() });
      await shell.exportProject();
      expect(links.slice(0, 3).map((link) => [link.download, link.href])).toEqual([["index.html", "blob:1"], ["project.json", "blob:2"], ["runtime.js", "blob:3"]]);
      await shell.exportProject();
      expect(revoke.mock.calls.map(([url]) => url)).toEqual(["blob:1", "blob:2", "blob:3"]);
      expect(makeUrl).toHaveBeenCalledTimes(6);
      (shell as unknown as { clearExportDownloads(): void }).clearExportDownloads();
      expect(revoke).toHaveBeenCalledTimes(6);
    } finally {
      makeUrl.mockRestore();
      revoke.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("submits the authored hierarchy, camera, and separate graph materials to the renderer and disposes them", () => {
    const serializer = new ProjectSerializer();
    const base = serializer.createDefaultProject();
    const project = { ...base, scene: { nodes: base.scene.nodes.map((node, index) => index === 0
      ? { ...node, transform: { ...node.transform, position: [0, 0, 4] as const } } : node) },
      shaderGraphs: [{ id: "g1", name: "red", materialId: "node-hero", graph }, { id: "g2", name: "blue", materialId: "node-child", graph: { ...graph, nodes: [{ id: "color", op: "constant" as const, type: "vec3" as const, value: [0, 0, 1] }] } }] };
    const frames: { items: readonly RenderItem[]; view: readonly number[] }[] = [];
    const device = new MockRenderDevice();
    const dispose = vi.fn();
    const renderer = { device, render: (source: { renderItems: readonly RenderItem[] }, camera: { viewMatrix: readonly number[] }) => {
      frames.push({ items: source.renderItems, view: camera.viewMatrix });
      return { drawCalls: source.renderItems.length };
    }, dispose } as unknown as Renderer;
    const runtime = new ExportedProjectRuntime(project, renderer);
    expect(runtime.frame(0, 900, 520).errors).toEqual([]);
    const frame = frames.at(-1)!;
    expect(frame.items).toHaveLength(2);
    expect(frame.items[0]!.material).not.toBe(frame.items[1]!.material);
    expect(frame.items[1]!.modelMatrix![12]).toBeCloseTo(1.2);
    expect(frame.items[1]!.modelMatrix![14]).toBeCloseTo(4);
    expect(frame.view[14]).toBeCloseTo(-4);
    const materials = frame.items.map((item) => item.material);
    runtime.dispose(); runtime.dispose();
    expect(materials.every((material) => material instanceof PortableShaderMaterial && material.disposed)).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => runtime.frame(0, 900, 520)).toThrow(/disposed/);
  });

  it("reports invalid graph drafts and missing imported models instead of claiming success", () => {
    const serializer = new ProjectSerializer();
    const base = serializer.createDefaultProject();
    const project = { ...base, scene: { nodes: base.scene.nodes.map((node, index) => index === 1
      ? { ...node, mesh: { enabled: true, primitive: "imported" as const, assetId: "missing" } } : node) },
      shaderGraphs: [{ id: "g", name: "bad graph", materialId: "node-hero", graph: { ...graph, outputs: { color: "missing" } } }] };
    const renderer = { device: new MockRenderDevice(), render: () => ({ drawCalls: 1 }), dispose: vi.fn() } as unknown as Renderer;
    const runtime = new ExportedProjectRuntime(project, renderer);
    const frame = runtime.frame(0, 900, 520);
    expect(frame.errors.join(" ")).toMatch(/bad graph/);
    expect(frame.errors.join(" ")).toMatch(/model asset is missing/);
    runtime.dispose();
  });

  it("runs independent animation instances for two nodes sharing an exported model", async () => {
    const serializer = new ProjectSerializer();
    const base = serializer.createDefaultProject();
    const project = {
      ...base,
      assets: [asset("model", animatedTriangleUri())],
      scene: { nodes: base.scene.nodes.map((node, index) => ({
        ...node, parentId: null, mesh: { enabled: true, primitive: "imported" as const, assetId: "model" },
        animation: { enabled: index === 0, clip: "Move", loop: true }
      })) }
    };
    let rendered: readonly RenderItem[] = [];
    const renderer = { device: new MockRenderDevice(), render: (source: { renderItems: readonly RenderItem[] }) => {
      rendered = source.renderItems;
      return { drawCalls: rendered.length };
    }, dispose: vi.fn() } as unknown as Renderer;
    const runtime = new ExportedProjectRuntime(project, renderer);
    try {
      runtime.frame(0, 900, 520);
      await vi.waitFor(() => {
        const result = runtime.frame(0, 900, 520);
        expect(result.loading).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(rendered).toHaveLength(2);
      });
      const initial = rendered.map((item) => item.modelMatrix![12]);
      const result = runtime.frame(0.5, 900, 520);
      expect(result.animating).toBe(true);
      expect(rendered[0]!.modelMatrix![12]).toBeCloseTo(initial[0]! + 0.5);
      expect(rendered[1]!.modelMatrix![12]).toBeCloseTo(initial[1]!);
    } finally {
      runtime.dispose();
    }
  });

  it("disposes a renderer that finishes initialization after the export page closes", async () => {
    const serializer = new ProjectSerializer();
    const handlers = new Map<string, (event: PageTransitionEvent) => void>();
    const fakeWindow = {
      addEventListener: (name: string, handler: (event: PageTransitionEvent) => void) => handlers.set(name, handler),
      removeEventListener: (name: string) => handlers.delete(name)
    };
    const canvas = { width: 900, height: 520, addEventListener: vi.fn(), removeEventListener: vi.fn(), focus: vi.fn() } as unknown as HTMLCanvasElement;
    const status = { textContent: "" } as HTMLElement;
    let complete!: (renderer: Renderer) => void;
    const create = vi.spyOn(Renderer, "create").mockReturnValue(new Promise<Renderer>((resolve) => { complete = resolve; }));
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("fetch", vi.fn(async () => response(serializer.serialize(serializer.createDefaultProject()), "application/json")));
    try {
      const starting = startExportedProject({ canvas, status, projectPath: "./project.json", globalName: "testExport" });
      await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
      handlers.get("pagehide")!({ persisted: false } as PageTransitionEvent);
      const dispose = vi.fn();
      complete({ dispose } as unknown as Renderer);
      await starting;
      expect(dispose).toHaveBeenCalledOnce();
      expect(handlers.has("pagehide")).toBe(false);
    } finally {
      create.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

function animatedTriangleUri(): string {
  const bytes = Buffer.alloc(76);
  [-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0].forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => bytes.writeUInt16LE(value, 36 + index * 2));
  [0, 1].forEach((value, index) => bytes.writeFloatLE(value, 44 + index * 4));
  [0, 0, 0, 1, 0, 0].forEach((value, index) => bytes.writeFloatLE(value, 52 + index * 4));
  const gltf = {
    asset: { version: "2.0" }, buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }, { buffer: 0, byteOffset: 44, byteLength: 8 }, { buffer: 0, byteOffset: 52, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }, { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], nodes: [{ name: "triangle", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [{ name: "Move", samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}
