import { describe, expect, it, vi } from "vitest";
import { Texture, compressedTextureByteLength, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { MockRenderDevice, getRenderAttachmentIdentity, validateRenderAttachmentAccess } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";

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
