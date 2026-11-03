import { describe, expect, it, vi } from "vitest";
import { Texture, compressedTextureByteLength, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { MockRenderDevice, getRenderAttachmentIdentity, validateRenderAttachmentAccess } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { createRenderDevice } from "../../../packages/rendering/src";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { RenderDevice, RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { createProofWebGPU } from "./webgpu-rtt-mock";

describe("texture dimensions, formats and independent mip updates", () => {
  it("validates volume extent, r32f data and target storage usage", () => {
    const volume = new Texture({ width: 4, height: 2, depth: 2, dimension: "3d", format: "r32f", data: new Float32Array(16), mipLevelCount: 3, usage: ["storage", "sampled", "copy-dst"] });
    expect(volume.byteLength).toBe((4 * 2 * 2 + 2 + 1) * 4);
    expect(volume.getMipLevel(0)?.depth).toBe(2);
    expect(() => { volume.colorSpace = "srgb"; }).toThrow(/linear/);
    expect(() => new Texture({ width: 1, height: 1, dimension: "3d" })).toThrow(/depth/);
    expect(() => new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f", data: new Float32Array(7) })).toThrow(/32 bytes/);
    expect(() => new Texture({ width: 1, height: 1, format: "r32f", colorSpace: "srgb" })).toThrow(/linear/);
    expect(() => new Texture({ width: 1, height: 1, format: "depth24", usage: ["storage"] })).toThrow(/storage/i);
    expect(() => new Texture({ width: 1, height: 1, usage: ["sampled", "sampled"] })).toThrow(/unique/);
    expect(() => new Texture({ width: 1, height: 1, usage: ["sampled"] }).updateMip(0, new Uint8Array(4))).toThrow(/copy-dst/);
    expect(() => new Texture({ width: 1, height: 1, dimension: "2d-array", layers: 2, source: {} as TexImageSource })).toThrow(/source uploads require a 2d/);
    const source = new Texture({ width: 1, height: 1, source: {} as TexImageSource });
    expect(() => source.update(new Uint8Array(4))).toThrow(/source-backed/i);
  });

  it("keeps independent mips and snapshots caller data for separate consumers", () => {
    const texture = new Texture({ width: 4, height: 4, depth: 2, dimension: "3d", format: "r32f", mipLevelCount: 3 });
    const small = new Float32Array([2, 3, 4, 5]);
    texture.updateMip(1, small);
    small.fill(99);
    texture.updateMip(2, new Float32Array([7]));
    expect(Array.from(texture.getMipLevel(1)!.data)).toEqual([2, 3, 4, 5]);
    expect(texture.getMipLevel(1)?.depth).toBe(1);
    expect(texture.getMipRevision(1)).toBe(1);
    expect(texture.getMipRevision(2)).toBe(2);
    expect(texture.getMipLevel(0)).toBeNull();
    expect(() => texture.updateMip(1, new Float32Array(3))).toThrow(/16 bytes/);
    expect(() => texture.updateMip(3, new Float32Array(1))).toThrow(/Mip level/);
    texture.dispose();
    expect(() => texture.updateMip(0, new Float32Array(32))).toThrow(/disposed/);
  });

  it("merges bounded partial writes to separate array layers across successive updates", () => {
    const texture = new Texture({ width: 2, height: 2, layers: 2, dimension: "2d-array", format: "r32f", data: new Float32Array(8) });
    texture.update(new Float32Array([3, 4]), { x: 1, y: 0, width: 1, height: 2, layer: 0 });
    texture.update(new Float32Array([8]), { x: 0, y: 1, width: 1, height: 1, layer: 1 });
    expect(Array.from(texture.getMipLevel(0)!.data)).toEqual([0, 3, 0, 4, 0, 0, 8, 0]);
    expect(texture.getMipRevision(0)).toBe(2);
    expect(() => texture.update(new Float32Array([1, 2]), { x: 0, y: 0, width: 1, height: 1, layer: 1 })).toThrow(/layers exceed/);
    expect(() => texture.update(new Uint8Array(4), { x: 0, y: 0, width: 1, height: 1, layer: 0 })).toThrow(/Float32Array/);
  });

  it("supports compressed cube chains and validates face and block sizes", () => {
    const faces = (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({ face, mipLevels: [{ width: 4, height: 4, data: new Uint8Array(8) }, { width: 2, height: 2, data: new Uint8Array(8) }] }));
    const cube = new Texture({ width: 4, height: 4, dimension: "cube", format: "etc2-rgb8unorm", cubeFaces: faces });
    expect(compressedTextureByteLength(4, 4, "etc2-rgb8unorm")).toBe(8);
    expect(cube.byteLength).toBe(6 * 16);
    cube.updateMip(1, new Uint8Array(8).fill(12), { face: "px" });
    expect(cube.getMipLevel(1, "px")?.data[0]).toBe(12);
    expect(cube.getMipLevel(1, "nx")?.data[0]).toBe(0);
    expect(() => cube.updateMip(1, new Uint8Array(16), { face: "px" })).toThrow(/8 bytes/);
    expect(() => cube.updateMip(1, new Uint8Array(8))).toThrow(/cube face/);
    expect(() => new Texture({ width: 4, height: 4, format: "etc2-rgb8unorm", cubeFaces: [...faces.slice(0, 5), { ...faces[5]!, face: "px" as TextureCubeFace }] })).toThrow(/Duplicate/);
  });

  it("never advertises stale decoded fallback after compressed mip edits", () => {
    const compressed = new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8), fallbackData: new Uint8Array(64) });
    expect(compressed.fallbackTextureLevels).toHaveLength(1);
    compressed.updateMip(0, new Uint8Array(8).fill(1));
    expect(compressed.fallbackTextureLevels).toHaveLength(0);
  });

  it("exposes volume, storage and compressed cube resources through texture factories", () => {
    const volume = texture.data3d({ width: 2, height: 2, depth: 2, format: "r32f", data: new Float32Array(8), mipLevelCount: 2 });
    volume.updateMip(1, new Float32Array([42]));
    expect(volume.texture.getMipLevel(1)?.data[0]).toBe(42);
    const storage = texture.storage({ width: 2, height: 2, dimension: "2d-array", depth: 3, format: "r32f" });
    expect(storage.texture).toMatchObject({ dimension: "2d-array", layers: 3, format: "r32f" });
    expect(storage.texture.usage).toContain("storage");
    expect(() => texture.storage({ width: 2, height: 2, dimension: "3d" })).toThrow(/storage depth/);
    const faces = (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({ face, mipmaps: [{ width: 4, height: 4, data: new Uint8Array(8) }] }));
    const cube = texture.compressedCube({ format: "bc1", faces });
    cube.updateMip(0, new Uint8Array(8).fill(7), { face: "pz" });
    expect(cube.texture.getMipLevel(0, "pz")?.data[0]).toBe(7);
    volume.dispose(); storage.dispose(); cube.dispose();
  });

  it("records distinct video frames even when another device has not cleared its dirty flag", () => {
    const source = { width: 1, height: 1, currentTime: 0, readyState: 4 };
    const handle = texture.video({ video: source });
    handle.texture.pollContentRevision!();
    const revision = handle.texture.revision;
    source.currentTime = 1;
    handle.texture.pollContentRevision!();
    expect(handle.texture.revision).toBe(revision + 1);
    expect(handle.needsUpdate).toBe(true);
    handle.dispose();
  });

  it("shares disposal epochs across separate copies of the rendering module", async () => {
    const first = await import("../../../packages/rendering/src/Texture");
    const before = first.currentTextureDisposeEpoch();
    vi.resetModules();
    const second = await import("../../../packages/rendering/src/Texture");
    expect(second.Texture).not.toBe(first.Texture);
    const otherCopy = new second.Texture({ width: 1, height: 1 });
    otherCopy.dispose();
    expect(first.currentTextureDisposeEpoch()).toBe(before + 1);
    otherCopy.dispose();
    expect(first.currentTextureDisposeEpoch()).toBe(before + 1);
  });
});

describe("render target identity and transfers", () => {
  it("tracks attachment formats, layers, samples and conflicting access", () => {
    const device = new MockRenderDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, dimension: "2d-array", layers: 2, depth: "texture" });
    const first = getRenderAttachmentIdentity(target.layerTargets![0]!);
    const second = getRenderAttachmentIdentity(target.layerTargets![1]!);
    const depth = getRenderAttachmentIdentity(target.layerTargets![0]!, "depth");
    expect(first).toMatchObject({ aspect: "color", format: "rgba8", layer: 0, mipLevel: 0, sampleCount: 1 });
    expect(second.layer).toBe(1);
    expect(depth).toMatchObject({ aspect: "depth", format: "depth24", layer: 0 });
    expect(() => validateRenderAttachmentAccess([first], [first])).toThrow(/overlapping/);
    expect(() => validateRenderAttachmentAccess([first], [second])).not.toThrow();
    expect(() => device.createRenderTarget({ width: 2, height: 4, dimension: "cube" })).toThrow(/square/);
    target.dispose();
    expect(() => getRenderAttachmentIdentity(target)).toThrow(/disposed/);
    expect(target.depthTexture?.disposed).toBe(true);
  });

  it("copies and resolves without transferring ownership; abort leaves destination untouched", async () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 1, height: 1, sampleCount: 4, depth: false });
    const dest = device.createRenderTarget({ width: 1, height: 1, depth: false });
    device.writeRenderTargetPixels(source, new Uint8Array([1, 2, 3, 4]));
    const controller = new AbortController();
    const aborted = device.resolveRenderTarget({ source, destination: dest, signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    expect([...await device.readRenderTarget({ target: dest })]).toEqual([0, 0, 0, 0]);
    await device.resolveRenderTarget({ source, destination: dest });
    const bytes = await device.readRenderTarget({ target: dest });
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    bytes[0] = 99;
    expect([...await device.readRenderTarget({ target: dest })]).toEqual([1, 2, 3, 4]);
    expect(source.disposed || dest.disposed).toBe(false);
    await expect(device.copyRenderTarget({ source: dest, destination: dest })).rejects.toThrow(/overlapping/);
    const hdr = device.createRenderTarget({ width: 1, height: 1, format: "rgba32f" });
    await expect(device.readRenderTarget({ target: hdr })).rejects.toMatchObject({ code: "INVALID_RESOURCE_READBACK" });
    const vertex = device.createBuffer("vertex", 12);
    device.setRenderTarget(dest);
    device.beginFrame(1, 1);
    expect(() => device.draw({ topology: "triangles", vertexBuffer: vertex, vertexCount: 1, uniforms: new Map([["u_texture", new TextureBinding({ name: "u_texture", texture: dest.colorTexture })]]) })).toThrow(/active render attachment/);
    device.endFrame();
    device.dispose();
  });
});

/** Browser-shaped WebGL double records framebuffer transfers without launching a browser. */
function webglDevice() {
  const constants = new Map<string, number>();
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x10000 + constants.size);
    return constants.get(name)!;
  };
  let nextId = 1;
  let readFramebuffer: unknown = null;
  let drawFramebuffer: unknown = null;
  const calls: { name: string; args: unknown[] }[] = [];
  const deleted: unknown[] = [];
  const overrides: Record<string, unknown> = {
    NO_ERROR: 0, NONE: 0,
    getError: () => 0,
    getExtension: () => ({}),
    checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
    getParameter: (pname: number) => pname === constant("MAX_SAMPLES") ? 4
      : pname === constant("READ_FRAMEBUFFER_BINDING") ? readFramebuffer
        : pname === constant("DRAW_FRAMEBUFFER_BINDING") || pname === constant("FRAMEBUFFER_BINDING") ? drawFramebuffer
          : pname === constant("ACTIVE_TEXTURE") ? constant("TEXTURE0") : constant("COLOR_ATTACHMENT0"),
    bindFramebuffer: (target: number, framebuffer: unknown) => {
      calls.push({ name: "bindFramebuffer", args: [target, framebuffer] });
      if (target === constant("FRAMEBUFFER")) readFramebuffer = drawFramebuffer = framebuffer;
      else if (target === constant("READ_FRAMEBUFFER")) readFramebuffer = framebuffer;
      else if (target === constant("DRAW_FRAMEBUFFER")) drawFramebuffer = framebuffer;
    },
    blitFramebuffer: (...args: unknown[]) => calls.push({ name: "blitFramebuffer", args }),
    framebufferTextureLayer: (...args: unknown[]) => calls.push({ name: "framebufferTextureLayer", args }),
    texStorage3D: (...args: unknown[]) => calls.push({ name: "texStorage3D", args }),
    readBuffer: (...args: unknown[]) => calls.push({ name: "readBuffer", args }),
    drawBuffers: (...args: unknown[]) => calls.push({ name: "drawBuffers", args }),
    readPixels: (_x: number, _y: number, _w: number, _h: number, _format: number, _type: number, result: Uint8Array) => result.fill(27),
    deleteTexture: (handle: unknown) => deleted.push(handle)
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in overrides) return overrides[name];
    if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
    if (name.startsWith("create")) return () => ({ id: nextId++ });
    return () => undefined;
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: (type: string) => type === "webgl2" ? gl : null, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  return { device: WebGL2Device.create({ canvas }), calls, deleted };
}

describe("3d render targets", () => {
  it("renders depth slices of one volume through per-slice targets and refuses unsupported combinations", () => {
    const device = new MockRenderDevice();
    const volume = device.createRenderTarget({ width: 4, height: 2, dimension: "3d", layers: 3, depth: false });
    expect(volume.colorTexture).toMatchObject({ dimension: "3d", depth: 3, width: 4, height: 2 });
    expect(volume.layerTargets).toHaveLength(3);
    const slice = getRenderAttachmentIdentity(volume.layerTargets![2]!);
    expect(slice).toMatchObject({ layer: 2, mipLevel: 0, format: "rgba8" });
    expect(() => validateRenderAttachmentAccess([getRenderAttachmentIdentity(volume.layerTargets![0]!)], [slice])).not.toThrow();
    expect(() => device.createRenderTarget({ width: 4, height: 4, dimension: "3d", layers: 2 })).toThrow(/color-only/);
    expect(() => device.createRenderTarget({ width: 4, height: 4, dimension: "3d", depth: false })).toThrow(/require `layers`/);
    expect(() => device.createRenderTarget({ width: 4, height: 4, dimension: "3d", layers: 2, depth: false, sampleCount: 4 })).toThrow(/single-sample/);
    volume.dispose();
    expect(volume.colorTexture.disposed).toBe(true);
    device.dispose();
  });

  it("attaches each WebGL2 volume slice with framebufferTextureLayer", () => {
    const { device, calls } = webglDevice();
    const volume = device.createRenderTarget({ width: 2, height: 2, dimension: "3d", layers: 4, depth: false });
    expect(calls.filter(({ name }) => name === "texStorage3D")).toHaveLength(1);
    expect(calls.find(({ name }) => name === "texStorage3D")!.args.slice(3)).toEqual([2, 2, 4]);
    expect(calls.filter(({ name }) => name === "framebufferTextureLayer").map(({ args }) => args[4])).toEqual([0, 1, 2, 3]);
    expect(volume.layerTargets).toHaveLength(4);
    expect(volume.colorTexture).toMatchObject({ dimension: "3d", depth: 4 });
    volume.dispose();
    device.dispose();
  });
});

describe("WebGPU layered render targets", () => {
  it("renders 2d-array layers through single-layer views and retires the shared texture once, after its fence", async () => {
    const mock = createProofWebGPU();
    const sizes: unknown[] = [];
    const views: Record<string, unknown>[] = [];
    const createTexture = (mock.native as unknown as { createTexture(descriptor: { size: unknown }): { createView(descriptor?: Record<string, unknown>): object } }).createTexture;
    (mock.native as unknown as { createTexture: typeof createTexture }).createTexture = (descriptor) => {
      sizes.push(descriptor.size);
      const native = createTexture(descriptor);
      const plain = native.createView.bind(native);
      native.createView = (view?: Record<string, unknown>) => { views.push(view ?? {}); return plain(); };
      return native;
    };
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const target = device.createRenderTarget({ width: 2, height: 2, dimension: "2d-array", layers: 3, depth: "texture", label: "array" });
      expect(sizes).toEqual([[2, 2, 3], [2, 2, 3]]);
      expect(target.layerTargets).toHaveLength(3);
      expect(target.colorTexture).toMatchObject({ dimension: "2d-array", layers: 3 });
      expect(getRenderAttachmentIdentity(target.layerTargets![2]!)).toMatchObject({ layer: 2, aspect: "color" });
      expect(getRenderAttachmentIdentity(target.layerTargets![1]!, "depth")).toMatchObject({ layer: 1, aspect: "depth" });
      expect(views).toContainEqual({ dimension: "2d-array" });
      expect(views).toContainEqual({ dimension: "2d", baseArrayLayer: 2, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 });
      device.setRenderTarget(target.layerTargets![1]!);
      device.beginFrame(2, 2);
      device.clear([0, 1, 0, 1]);
      device.endFrame();
      device.setRenderTarget(null);

      target.layerTargets![0]!.dispose();
      expect(mock.textures.some((texture) => texture.destroyed)).toBe(false);
      expect(target.colorTexture.disposed).toBe(false);
      target.dispose();
      expect(target.layerTargets!.every((layer) => layer.disposed)).toBe(true);
      expect(target.colorTexture.disposed).toBe(true);
      await (target as typeof target & { whenDisposed(): Promise<void> }).whenDisposed();
      expect(mock.textures.filter((texture) => texture.destroyed)).toHaveLength(2);
    } finally {
      device.dispose();
    }
  });
});

type RecordedPass = { readonly colorAttachments: readonly { readonly view: unknown; readonly depthSlice?: number }[]; readonly depthStencilAttachment?: { readonly view: unknown } };

/** Proof mock that records texture/view descriptors, pipelines and passes; color-less passes get a recording stub. */
async function recordingWebGPU() {
  const mock = createProofWebGPU();
  const native = mock.native as unknown as Record<string, (descriptor?: Record<string, unknown>) => Record<string, unknown>>;
  const textures: Record<string, unknown>[] = [], views: Record<string, unknown>[] = [], pipelines: Record<string, unknown>[] = [], passes: RecordedPass[] = [];
  const createTexture = native.createTexture!.bind(native);
  native.createTexture = (descriptor) => {
    textures.push(descriptor!);
    const texture = createTexture(descriptor) as { createView(view?: Record<string, unknown>): unknown };
    const plain = texture.createView.bind(texture);
    texture.createView = (view?: Record<string, unknown>) => { views.push(view ?? {}); return plain(); };
    return texture as unknown as Record<string, unknown>;
  };
  const createPipeline = native.createRenderPipeline!.bind(native);
  native.createRenderPipeline = (descriptor) => { pipelines.push(descriptor!); return createPipeline(descriptor); };
  const createEncoder = native.createCommandEncoder!.bind(native);
  native.createCommandEncoder = (descriptor) => {
    const encoder = createEncoder(descriptor) as { beginRenderPass(pass: RecordedPass): unknown };
    const begin = encoder.beginRenderPass.bind(encoder);
    encoder.beginRenderPass = (pass) => {
      passes.push(pass);
      if (pass.colorAttachments.length) return begin(pass);
      const noop = (): void => {};
      return { setPipeline: noop, setVertexBuffer: noop, setBindGroup: noop, setViewport: noop, setScissorRect: noop, setBlendConstant: noop, setStencilReference: noop, draw: noop, end: noop };
    };
    return encoder as unknown as Record<string, unknown>;
  };
  const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
  return { mock, device, textures, views, pipelines, passes };
}

function drawPortableTriangle(device: RenderDevice, target: RenderTarget): void {
  const shader = device.createShaderProgram({
    label: "slice-shader", marker: "@aura3d-shader:wp05-slice",
    vertex: "// @aura3d-shader:wp05-slice\nin vec3 position;\nvoid main() { gl_Position = vec4(position, 1.0); }",
    fragment: "// @aura3d-shader:wp05-slice\nuniform vec4 u_color;\nout vec4 outColor;\nvoid main() { outColor = u_color; }",
    portableBindings: [{ name: "u_color", kind: "vec4", required: true }],
    webgpu: {
      vertex: "/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(position, 1.0); }",
      fragment: "/* @aura3d-bindings */\n@fragment fn fs_main() -> @location(0) vec4<f32> { return aura.u_color; }"
    }
  });
  const vertices = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
  device.setRenderTarget(target);
  device.beginFrame(target.width, target.height);
  device.draw({ label: "slice-draw", topology: "triangles", vertexBuffer: buffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
    renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" },
    uniforms: new Map([["u_color", [1, 0, 0, 1]]]) });
  device.endFrame();
  device.setRenderTarget(null);
  buffer.dispose();
  shader.dispose();
}

describe("WebGPU 3d and depth-only render targets", () => {
  it("renders each 3d slice through the full volume view with a per-pass depthSlice and retires the volume once", async () => {
    const f = await recordingWebGPU();
    try {
      const volume = f.device.createRenderTarget({ width: 2, height: 2, dimension: "3d", layers: 3, depth: false, label: "volume" });
      expect(f.textures).toHaveLength(1);
      expect(f.textures[0]).toMatchObject({ size: [2, 2, 3], dimension: "3d" });
      expect(f.views).toContainEqual({ dimension: "3d", baseMipLevel: 0, mipLevelCount: 1 });
      expect(volume.colorTexture).toMatchObject({ dimension: "3d", depth: 3 });
      expect(volume.layerTargets).toHaveLength(3);
      expect(getRenderAttachmentIdentity(volume.layerTargets![2]!)).toMatchObject({ layer: 2, aspect: "color" });
      for (const [slice, layer] of volume.layerTargets!.entries()) {
        f.device.setRenderTarget(layer);
        f.device.beginFrame(2, 2);
        f.device.clear([slice / 2, 0, 0, 1]);
        f.device.endFrame();
        f.device.setRenderTarget(null);
      }
      drawPortableTriangle(f.device, volume.layerTargets![1]!);
      const slices = f.passes.map((pass) => pass.colorAttachments[0]?.depthSlice);
      expect(slices).toEqual([0, 1, 2, 1]);
      expect(f.passes.every((pass) => pass.colorAttachments[0]!.view === f.passes[0]!.colorAttachments[0]!.view)).toBe(true);
      await expect(f.device.readRenderTarget!({ target: volume.layerTargets![1]! })).rejects.toMatchObject({ code: "NATIVE_READBACK_TARGET_UNSUPPORTED" });

      volume.layerTargets![0]!.dispose();
      expect(f.mock.textures.some((texture) => texture.destroyed)).toBe(false);
      volume.dispose();
      expect(volume.layerTargets!.every((layer) => layer.disposed)).toBe(true);
      await (volume as typeof volume & { whenDisposed(): Promise<void> }).whenDisposed();
      expect(f.mock.textures.filter((texture) => texture.destroyed)).toHaveLength(1);
    } finally {
      f.device.dispose();
    }
  });

  it("renders depth-only targets with no color attachment or color target and refuses color operations", async () => {
    const f = await recordingWebGPU();
    try {
      const shadow = f.device.createRenderTarget({ width: 4, height: 4, depthOnly: true, label: "shadow" });
      expect(f.textures).toHaveLength(1);
      expect(String(f.textures[0]!.format)).toMatch(/^depth/);
      expect(shadow.depthOnly).toBe(true);
      expect(shadow.depthTexture).toMatchObject({ format: "depth24" });
      expect(() => getRenderAttachmentIdentity(shadow)).toThrow(/no live color attachment/);
      drawPortableTriangle(f.device, shadow);
      expect(f.passes.length).toBeGreaterThan(0);
      for (const pass of f.passes) {
        expect(pass.colorAttachments).toEqual([]);
        expect(pass.depthStencilAttachment).toBeDefined();
      }
      expect(f.pipelines).toHaveLength(1);
      expect((f.pipelines[0]!.fragment as { targets: unknown[] }).targets).toEqual([]);
      expect(f.pipelines[0]!.depthStencil).toBeDefined();
      expect(f.mock.textures.every((texture) => texture.label !== "shadow")).toBe(true);

      await expect(f.device.readRenderTarget!({ target: shadow })).rejects.toMatchObject({ code: "INVALID_RENDER_ATTACHMENT" });
      expect(() => f.device.writeRenderTargetPixels!(shadow, new Uint8Array(64))).toThrow(expect.objectContaining({ code: "RENDER_TARGET_DEPTH_ONLY" }));
      f.device.setRenderTarget(shadow);
      f.device.beginFrame(4, 4);
      await expect(f.device.readPixelsAsync!(0, 0, 1, 1)).rejects.toMatchObject({ code: "RENDER_TARGET_DEPTH_ONLY" });
      f.device.endFrame();
      f.device.setRenderTarget(null);

      const cube = f.device.createRenderTarget({ width: 2, height: 2, dimension: "cube", depthOnly: true, label: "point-shadow" });
      expect(cube.layerTargets).toHaveLength(6);
      expect(f.textures.at(-1)).toMatchObject({ size: [2, 2, 6] });
      shadow.dispose();
      cube.dispose();
      await (shadow as typeof shadow & { whenDisposed(): Promise<void> }).whenDisposed();
      await (cube as typeof cube & { whenDisposed(): Promise<void> }).whenDisposed();
      expect(f.mock.textures.every((texture) => texture.destroyed)).toBe(true);
    } finally {
      f.device.dispose();
    }
  });
});

describe("WebGL2 resource transfers", () => {
  it("blits once, restores framebuffer state, reads bytes and cleans handles once", async () => {
    const { device, calls, deleted } = webglDevice();
    const source = device.createRenderTarget({ width: 2, height: 2, depth: false, sampleCount: 4 });
    const destination = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const controller = new AbortController();
    const pending = device.resolveRenderTarget({ source, destination, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.filter(({ name }) => name === "blitFramebuffer")).toHaveLength(0);
    await device.resolveRenderTarget({ source, destination });
    expect(calls.filter(({ name }) => name === "blitFramebuffer")).toHaveLength(1);
    expect(calls.filter(({ name }) => name === "bindFramebuffer").slice(-2).map(({ args }) => args[1])).toEqual([null, null]);
    expect([...await device.readRenderTarget({ target: destination })]).toEqual(Array(16).fill(27));
    await expect(device.copyRenderTarget({ source: destination, destination })).rejects.toMatchObject({ code: "RENDER_ATTACHMENT_HAZARD" });
    source.dispose();
    destination.dispose();
    device.dispose();
    expect(new Set(deleted).size).toBe(deleted.length);
  });
});

describe("WebGPU resource transfers", () => {
  it("resolves, copies and reads owned targets asynchronously; abort and depth copies leave targets untouched", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const source = device.createRenderTarget({ width: 2, height: 2, depth: false, sampleCount: 4, label: "msaa" });
      const destination = device.createRenderTarget({ width: 2, height: 2, depth: false, label: "resolved" });
      const copy = device.createRenderTarget({ width: 2, height: 2, depth: false, label: "copy" });
      device.setRenderTarget(source);
      device.beginFrame(2, 2);
      device.clear([1, 0, 0, 1]);
      device.endFrame();
      device.setRenderTarget(null);

      const controller = new AbortController();
      const aborted = device.resolveRenderTarget!({ source, destination, signal: controller.signal });
      controller.abort();
      await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
      expect(mock.events).not.toContain("copy-texture");

      await device.resolveRenderTarget!({ source, destination });
      expect(mock.events.filter((event) => event === "copy-texture")).toHaveLength(1);
      expect([...await device.readRenderTarget!({ target: destination })]).toEqual(Array(4).fill([255, 0, 0, 255]).flat());
      await device.copyRenderTarget!({ source: destination, destination: copy });
      const bytes = await device.readRenderTarget!({ target: copy });
      expect([...bytes.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
      expect(device.getRenderTarget?.()).toBe(null);
      expect([source, destination, copy].some((target) => target.disposed)).toBe(false);

      await expect(device.copyRenderTarget!({ source: copy, destination: copy })).rejects.toMatchObject({ code: "RENDER_ATTACHMENT_HAZARD" });
      await expect(device.readRenderTarget!({ target: source })).rejects.toMatchObject({ code: "INVALID_RESOURCE_READBACK" });
      const depthSource = device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
      const depthDestination = device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
      await expect(device.copyRenderTarget!({ source: depthSource, destination: depthDestination, aspect: "depth" }))
        .rejects.toMatchObject({ code: "WEBGPU_DEPTH_COPY_UNSUPPORTED" });

      const readbacksBefore = mock.buffers.length;
      const readController = new AbortController();
      const read = device.readRenderTarget!({ target: copy, signal: readController.signal });
      readController.abort();
      await expect(read).rejects.toMatchObject({ name: "AbortError" });
      expect(mock.buffers.slice(readbacksBefore).filter((buffer) => buffer.label.includes("byte-readback"))).toEqual([]);
      for (const target of [source, destination, copy, depthSource, depthDestination]) target.dispose();
      await Promise.resolve();
      const staging = mock.buffers.filter((buffer) => buffer.label.includes("byte-readback"));
      expect(staging).toHaveLength(2);
      expect(staging.every((buffer) => buffer.destroyed)).toBe(true);
    } finally {
      device.dispose();
    }
  });
});
