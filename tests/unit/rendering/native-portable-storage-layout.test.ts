import { describe, expect, it, vi } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import type { NativeShaderStorageLayout } from "../../../packages/rendering/src/RenderDevice";
import { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { ShaderModule } from "../../../packages/rendering/src/ShaderModule";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

interface Layout { readonly entries: readonly Record<string, unknown>[]; }

async function fixture(languageFeature = false, limits?: Readonly<Record<string, number>>) {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  const layouts: Layout[] = [];
  const groups: { readonly label?: string; readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }[] = [];
  const setGroups: number[] = [];
  const native = {
    limits,
    queue: { writeBuffer() {}, writeTexture() {}, submit: vi.fn(), onSubmittedWorkDone: () => fence },
    createBuffer: ({ size, usage }: { readonly size: number; readonly usage: number }) => ({ size, usage, destroy() {} }),
    createTexture: () => ({ createView: (descriptor?: unknown) => ({ descriptor }), destroy: vi.fn() }),
    createSampler: () => ({}),
    createShaderModule: (descriptor: unknown) => ({ descriptor }),
    createBindGroupLayout(descriptor: Layout) { layouts.push(descriptor); return descriptor; },
    createPipelineLayout(descriptor: { readonly bindGroupLayouts: readonly Layout[] }) { return descriptor; },
    createRenderPipeline(descriptor: { readonly layout: "auto" | { readonly bindGroupLayouts: readonly Layout[] } }) {
      return { getBindGroupLayout: (index: number) => descriptor.layout === "auto" ? {} : descriptor.layout.bindGroupLayouts[index] };
    },
    createBindGroup(descriptor: { readonly label?: string; readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] }) { groups.push(descriptor); return {}; },
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup(index: number) { setGroups.push(index); }, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
    destroy() {}
  };
  const adapter = { requestDevice: async () => native as unknown as WebGPUDeviceLike };
  const gpu: WebGPULike = { requestAdapter: async () => adapter, wgslLanguageFeatures: new Set(languageFeature ? ["readonly_and_readwrite_storage_textures"] : []) };
  const device = await WebGPUDevice.create({ gpu, adapter });
  const sampled = new Texture({ width: 1, height: 1, format: "rgba32f", data: new Float32Array(4) });
  const storage = new Texture({ width: 2, height: 2, format: "rgba8", usage: ["storage", "copy-dst"] });
  const buffer = device.createBuffer("storage", 256);
  const vertices = device.createBuffer("vertex", 36);
  const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
  const uniforms = new Map([["u_tex", new TextureBinding({ name: "u_tex", texture: sampled, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) })]]);
  const bindings = [
    { name: "image", group: 1, binding: 0, kind: "storage-texture" as const, texture: storage },
    { name: "values", group: 2, binding: 1, kind: "storage-buffer" as const, buffer }
  ];
  const makeShader = (storageBindings?: readonly NativeShaderStorageLayout[]) => {
    const library = new ShaderLibrary();
    const readTexture = storageBindings?.some(binding => binding.kind === "storage-texture" && binding.access === "read") ?? false;
    const hasTexture = storageBindings === undefined || storageBindings.some(binding => binding.kind === "storage-texture");
    library.register({ name: "portable-storage", marker: "portable-storage", vertex: "// portable-storage\nlayout(location=0) in vec3 a_position; void main() {}",
      fragment: "// portable-storage\nuniform sampler2D u_tex; void main() {}", portableBindings: [{ name: "u_tex", kind: "texture2d" }],
      webgpu: { vertex: `// portable-storage
/* @aura3d-bindings */
@group(2) @binding(1) var<storage, read> values: array<u32>;
@vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p + vec3<f32>(f32(values[0]) * 0.0), 1.0); }`,
        fragment: `// portable-storage
/* @aura3d-bindings */
${hasTexture ? `@group(1) @binding(0) var image: texture_storage_2d<rgba8unorm, ${readTexture ? "read" : "write"}>;` : ""}
@fragment fn fs_main() -> @location(0) vec4<f32> { ${!hasTexture ? "let pixel = vec4<f32>(0.0);" : readTexture ? "let pixel = textureLoad(image, vec2<i32>(0));" : "textureStore(image, vec2<i32>(0), vec4<f32>(1.0)); let pixel = vec4<f32>(0.0);"} return pixel + textureSampleLevel(u_texTexture, u_texSampler, vec2<f32>(0.5), 0.0); }`,
        ...(storageBindings === undefined ? {} : { storageBindings }) } });
    const module = ShaderModule.fromLibrary(library, "portable-storage");
    expect(module.source.webgpu?.storageBindings).toEqual(storageBindings);
    return module.compile(device);
  };
  const declarations: readonly NativeShaderStorageLayout[] = [
    { group: 1, binding: 0, visibility: "fragment", kind: "storage-texture", access: "write", format: "rgba8unorm" },
    { group: 2, binding: 1, visibility: "vertex", kind: "storage-buffer", access: "read" }
  ];
  const draw = (shader: ReturnType<typeof makeShader>, storageBindings = bindings) => device.draw({ topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3,
    vertexCount: 3, shader, uniforms, nativeStorageBindings: storageBindings });
  device.beginFrame(2, 2); device.setRenderTarget(target);
  return { device, native, layouts, groups, setGroups, sampled, storage, buffer, bindings, declarations, makeShader, draw, finish };
}

describe("portable WebGPU textures with native storage groups", () => {
  it("carries library metadata to an explicit multi-group layout and binds borrowed resources", async () => {
    const f = await fixture(); const shader = f.makeShader(f.declarations);
    f.draw(shader);
    expect(f.layouts.map(layout => layout.entries)).toEqual([
      [{ binding: 0, visibility: 3, buffer: { type: "uniform" } }, { binding: 1, visibility: 3, sampler: { type: "non-filtering" } },
        { binding: 2, visibility: 3, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } }],
      [{ binding: 0, visibility: 2, storageTexture: { access: "write-only", format: "rgba8unorm", viewDimension: "2d" } }],
      [{ binding: 1, visibility: 1, buffer: { type: "read-only-storage" } }]
    ]);
    expect(f.setGroups).toEqual([0, 1, 2]);
    expect(f.native.queue.submit).toHaveBeenCalledTimes(1);
    expect(f.groups.filter(group => group.label?.includes("storage-")).map(group => group.entries.map(entry => entry.binding))).toEqual([[0], [1]]);
    expect(f.groups.find(group => group.label?.includes("storage-1"))?.entries[0]?.resource).toMatchObject({ descriptor: { dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 } });
    expect(f.storage.disposed).toBe(false); expect(f.buffer.disposed).toBe(false);
    f.device.endFrame(); f.device.dispose(); f.sampled.dispose(); f.storage.dispose();
  });

  it("fails closed for missing, duplicate, incompatible, or undeclared storage metadata", async () => {
    const f = await fixture();
    expect(() => f.draw(f.makeShader())).toThrow(/storage metadata/i);
    expect(() => f.draw(f.makeShader(f.declarations), f.bindings.slice(0, 1))).toThrow(/does not match/i);
    expect(() => f.draw(f.makeShader([...f.declarations, f.declarations[0]!]))).toThrow(/duplicate/i);
    expect(() => f.draw(f.makeShader([{ ...f.declarations[0]!, format: "rgba16float" } as NativeShaderStorageLayout, f.declarations[1]!]))).toThrow(/format/i);
    expect(() => f.draw(f.makeShader([f.declarations[0]!, { group: 2, binding: 1, visibility: "vertex", kind: "storage-buffer", access: "read_write" }]))).toThrow(/writable storage buffers/i);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    f.device.endFrame(); f.device.dispose(); f.sampled.dispose(); f.storage.dispose();
  });

  it("requires the WGSL feature before exposing read-only storage textures", async () => {
    const f = await fixture();
    const read: readonly NativeShaderStorageLayout[] = [{ group: 1, binding: 0, visibility: "vertex-fragment", kind: "storage-texture", access: "read", format: "rgba8unorm" }, f.declarations[1]!];
    expect(() => f.draw(f.makeShader(read))).toThrow(/readonly_and_readwrite_storage_textures/i);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    f.device.endFrame(); f.device.dispose(); f.sampled.dispose(); f.storage.dispose();
    const supported = await fixture(true); supported.draw(supported.makeShader(read));
    expect(supported.layouts[1]?.entries).toEqual([{ binding: 0, visibility: 3, storageTexture: { access: "read-only", format: "rgba8unorm", viewDimension: "2d" } }]);
    supported.device.endFrame(); supported.device.dispose(); supported.sampled.dispose(); supported.storage.dispose();
  });

  it("includes empty layouts for sparse groups and enforces stage limits", async () => {
    const f = await fixture();
    f.draw(f.makeShader([f.declarations[1]!]), f.bindings.slice(1));
    expect(f.layouts[1]?.entries).toEqual([]);
    expect(f.setGroups).toEqual([0, 2]);
    f.device.endFrame(); f.device.dispose(); f.sampled.dispose(); f.storage.dispose();
    const limited = await fixture(false, { maxStorageTexturesPerShaderStage: 0 });
    expect(() => limited.draw(limited.makeShader(limited.declarations))).toThrow(/stage limits/i);
    expect(limited.native.queue.submit).not.toHaveBeenCalled();
    limited.device.endFrame(); limited.device.dispose(); limited.sampled.dispose(); limited.storage.dispose();
  });

  it("retains a borrowed storage texture until the submitted draw's queue fence", async () => {
    const f = await fixture();
    f.draw(f.makeShader(f.declarations));
    const handle = f.device.getNativeTexture(f.storage) as unknown as { readonly destroy: ReturnType<typeof vi.fn> };
    f.storage.dispose();
    expect(handle.destroy).not.toHaveBeenCalled();
    f.finish(); await Promise.resolve(); await Promise.resolve();
    expect(handle.destroy).toHaveBeenCalledOnce();
    f.device.endFrame(); f.device.dispose(); f.sampled.dispose();
  });
});
