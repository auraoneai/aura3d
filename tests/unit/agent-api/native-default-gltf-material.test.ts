import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import { createProductionRuntimeMetadata } from "../../../packages/engine/src/agent-api/compiler/actors";
import { includeRootSourceMetadata } from "../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ProductionWebGPURenderer } from "../../../packages/rendering/src/production-runtime/ProductionWebGPURenderer";
import { validateProductionRendererInput } from "../../../packages/rendering/src/production-runtime/renderProofs";
import type { ProductionRendererInput } from "../../../packages/rendering/src/production-runtime/ProductionRendererTypes";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";

afterEach(() => vi.restoreAllMocks());

function fixture(mixed = false): string {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const buffer = Buffer.from(positions.buffer);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: buffer.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    ...(mixed ? { materials: [{ name: "authored" }] } : {}),
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }, ...(mixed ? [{ attributes: { POSITION: 0 }, material: 0 }] : [])] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

async function webgpuRenderer() {
  const diagnostics = { drawCalls: 1, textures: 0, textureBytes: 0, renderTargets: 0, contextLost: false, lastError: null };
  const renderer = {
    device: {
      kind: "webgpu",
      info: { capabilities: ["native-render-pipeline", "native-sampled-textures", "native-texture-readback"] },
      readPixelsAsync: vi.fn()
    },
    render: vi.fn(() => diagnostics),
    dispose: vi.fn()
  } as unknown as Renderer;
  vi.spyOn(Renderer, "create").mockResolvedValue(renderer);
  return ProductionWebGPURenderer.create({ width: 8, height: 8 });
}

function inputFor(pipeline: Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>): ProductionRendererInput {
  return { source: pipeline.source, metadata: pipeline.metadata };
}

describe("runtime-bound default glTF materials", () => {
  it("accepts an omitted material through the real pipeline and both production preflights", async () => {
    const pipeline = await loadProductionGLTFRenderPipeline({ url: fixture(), format: "gltf", assetId: "implicit" });
    const webgpu = await webgpuRenderer();
    try {
      expect(pipeline.metadata.materialCount).toBe(0);
      expect(pipeline.metadata.runtimeMaterialCount).toBe(1);
      const bindings = pipeline.resources.scene.collectRenderables();
      expect(bindings).toHaveLength(1);
      const binding = bindings[0];
      if (!binding) throw new Error("Expected a model renderable");
      expect(pipeline.source.scene).toBe(pipeline.resources.scene);
      expect(pipeline.source.geometryLibrary).toBe(pipeline.resources.geometryLibrary);
      expect(pipeline.source.materialLibrary).toBe(pipeline.resources.materialLibrary);
      expect(pipeline.resources.geometryLibrary.get(binding.renderable.geometry)).toBeDefined();
      expect(pipeline.resources.materialLibrary.get(binding.renderable.material)).toBeDefined();
      const input = inputFor(pipeline);
      expect(() => validateProductionRendererInput(input)).not.toThrow();
      const frame = webgpu.renderFrame(input);
      expect(frame.features.find((feature) => feature.id === "pbr-materials")).toMatchObject({
        state: "supported", detail: "0 authored materials; 1 runtime-bound materials"
      });

      const actor = { pipeline } as never;
      const aggregated = createProductionRuntimeMetadata([{ actor } as never], []);
      expect(aggregated).toMatchObject({ materialCount: 0, runtimeMaterialCount: 1 });
      expect(() => validateProductionRendererInput({ source: pipeline.source, metadata: aggregated })).not.toThrow();
    } finally {
      webgpu.dispose();
      await pipeline.disposeAsync();
    }
  });

  it("preserves authored counts while including both default and explicit runtime bindings", async () => {
    const pipeline = await loadProductionGLTFRenderPipeline({ url: fixture(true), format: "gltf", assetId: "mixed" });
    try {
      expect(pipeline.metadata).toMatchObject({ materialCount: 1, runtimeMaterialCount: 2 });
      const bindings = pipeline.resources.scene.collectRenderables();
      expect(bindings).toHaveLength(2);
      expect(new Set(bindings.map(({ renderable }) => pipeline.resources.materialLibrary.get(renderable.material))).size).toBe(2);
      expect(() => validateProductionRendererInput(inputFor(pipeline))).not.toThrow();
    } finally {
      await pipeline.disposeAsync();
    }
  });

  it("rejects an explicitly unbound runtime even when the source declared a material", async () => {
    const pipeline = await loadProductionGLTFRenderPipeline({ url: fixture(true), format: "gltf", assetId: "missing" });
    const webgpu = await webgpuRenderer();
    const materials = pipeline.resources.materialLibrary as unknown as Map<string, unknown>;
    const saved = [...materials];
    try {
      materials.clear();
      expect(pipeline.metadata.materialCount).toBe(1);
      expect(pipeline.metadata.runtimeMaterialCount).toBe(0);
      const input = inputFor(pipeline);
      expect(() => validateProductionRendererInput(input)).toThrow(/real material/);
      expect(() => webgpu.renderFrame(input)).toThrow(/real material/);
    } finally {
      for (const [key, value] of saved) materials.set(key, value);
      webgpu.dispose();
      await pipeline.disposeAsync();
    }
  });

  it("counts hidden bound nodes and drops disposed materials without rewriting authored metadata", async () => {
    const pipeline = await loadProductionGLTFRenderPipeline({ url: fixture(), format: "gltf", assetId: "lifecycle" });
    try {
      const [binding] = pipeline.resources.scene.collectRenderables();
      expect(binding).toBeDefined();
      if (!binding) throw new Error("Expected a model renderable");
      binding.node.visible = false;
      expect(pipeline.metadata.runtimeMaterialCount).toBe(1);
      pipeline.resources.materialLibrary.get(binding.renderable.material)!.dispose();
      expect(pipeline.metadata.runtimeMaterialCount).toBe(0);
      expect(pipeline.metadata.materialCount).toBe(0);
    } finally {
      await pipeline.disposeAsync();
    }
  });

  it("preserves legacy metadata inputs and counts attached-source materials when observed", () => {
    const source = { collectRenderItems: () => [] };
    const legacy = { primitiveCount: 1, meshCount: 1, materialCount: 1 };
    expect(() => validateProductionRendererInput({ source, metadata: legacy } as unknown as ProductionRendererInput)).not.toThrow();
    expect(() => validateProductionRendererInput({ source, metadata: { ...legacy, runtimeMaterialCount: 0 } } as unknown as ProductionRendererInput)).toThrow(/real material/);
    expect(() => validateProductionRendererInput({ source, metadata: { ...legacy, runtimeMaterialCount: Number.NaN } } as unknown as ProductionRendererInput)).toThrow(/real material/);
    const attached = { geometry: {}, material: {} } as unknown as RenderItem;
    const withAttached = includeRootSourceMetadata({ primitiveCount: 0, meshCount: 0, materialCount: 0, runtimeMaterialCount: 0 }, [attached]);
    expect(withAttached).toMatchObject({ primitiveCount: 1, meshCount: 1, materialCount: 1, runtimeMaterialCount: 1 });
    expect(() => validateProductionRendererInput({ source, metadata: withAttached } as unknown as ProductionRendererInput)).not.toThrow();
    expect(includeRootSourceMetadata(legacy, [attached])).not.toHaveProperty("runtimeMaterialCount");
    const disposed = { geometry: {}, material: { disposed: true } } as unknown as RenderItem;
    const withDisposed = includeRootSourceMetadata({ primitiveCount: 0, meshCount: 0, materialCount: 0, runtimeMaterialCount: 0 }, [disposed]);
    expect(withDisposed).toMatchObject({ materialCount: 1, runtimeMaterialCount: 0 });
    expect(() => validateProductionRendererInput({ source, metadata: withDisposed } as unknown as ProductionRendererInput)).toThrow(/real material/);
  });
});
