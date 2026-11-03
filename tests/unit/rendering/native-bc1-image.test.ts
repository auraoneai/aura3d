import { describe, expect, it, vi } from "vitest";
import { parseImageFormat } from "../../../packages/assets/src/loaders/ImageFormatLoaders";
import { ktx2TargetToTextureFormat } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { texture as publicTexture } from "../../../packages/engine/src/public/index";
import { auraTextureRefTransform, resolveAuraTextureRef } from "../../../packages/engine/src/agent-api/compiler/textures";
import { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import { resolveCompressedTextureFormatReal } from "../../../packages/rendering/src/webgl2/TextureFormats";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";

// KTX1 and DXT1 specimens authored from the Khronos specifications. The
// three-color block selects black, white, their midpoint, then selector 3.
const hazardous = Uint8Array.of(0, 0, 255, 255, 0xe4, 0, 0, 0);
const safe = Uint8Array.of(255, 255, 0, 0, 0xff, 0xff, 0xff, 0xff);

function ktx(mips: readonly Uint8Array[], srgb = true): Uint8Array {
  const orientation = new TextEncoder().encode("KTXorientation\0S=l,T=u\0");
  const metadataSize = 4 + Math.ceil(orientation.length / 4) * 4;
  const bytes = new Uint8Array(64 + metadataSize + mips.length * 12);
  const view = new DataView(bytes.buffer);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 13, 10, 26, 10]);
  const fields = [0x04030201, 0, 1, 0, srgb ? 0x8c4c : 0x83f0, 0x1907, 4, 4, 0, 0, 1, mips.length, metadataSize];
  fields.forEach((value, index) => view.setUint32(12 + index * 4, value, true));
  view.setUint32(64, orientation.length, true); bytes.set(orientation, 68);
  mips.forEach((mip, index) => { const start = 64 + metadataSize + index * 12; view.setUint32(start, 8, true); bytes.set(mip, start + 4); });
  return bytes;
}

async function parsed(mips: readonly Uint8Array[], srgb = true) {
  return parseImageFormat(ktx(mips, srgb), "ktx1", { gpuFormats: ["bc1-rgb"] });
}

function opaqueDds(block: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(148 + block.length);
  const view = new DataView(bytes.buffer);
  const put = (offset: number, value: number) => view.setUint32(offset, value, true);
  put(0, 0x20534444); put(4, 124); put(8, 0x1007); put(12, 4); put(16, 4); put(28, 1);
  put(76, 32); put(80, 4); put(84, 0x30315844); put(108, 0x1000);
  put(128, 72); put(132, 3); put(140, 1); put(144, 3);
  bytes.set(block, 148);
  return bytes;
}

function webgl(options: { readonly compression?: boolean; readonly maxBytes?: number; readonly failFirstCompressed?: boolean } = {}) {
  const calls: Record<string, unknown[][]> = {};
  let compressedError = false, failedCompressed = false;
  const record = (name: string) => (...args: unknown[]) => {
    (calls[name] ??= []).push(args.map((arg) => ArrayBuffer.isView(arg) ? Array.from(arg as unknown as ArrayLike<number>) : arg));
  };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_CUBE_MAP: 0x8513,
    RGBA: 0x1908, RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, UNSIGNED_BYTE: 0x1401,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    fenceSync: () => ({}), flush: () => undefined, clientWaitSync: () => 0x911a, deleteSync: () => undefined,
    createTexture: () => ({}), deleteTexture: record("deleteTexture"), bindTexture: record("bindTexture"),
    getParameter: () => 0, pixelStorei: () => {}, texParameteri: record("texParameteri"),
    compressedTexImage2D: (...args: unknown[]) => {
      record("compressedTexImage2D")(...args);
      if (options.failFirstCompressed && !failedCompressed) { failedCompressed = true; compressedError = true; }
    }, compressedTexSubImage2D: record("compressedTexSubImage2D"),
    texImage2D: record("texImage2D"),
    getExtension(name: string) {
      if (options.compression === false) return null;
      if (name === "WEBGL_compressed_texture_s3tc") return { COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0, COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1 };
      if (name === "WEBGL_compressed_texture_s3tc_srgb") return { COMPRESSED_SRGB_S3TC_DXT1_EXT: 0x8c4c, COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT: 0x8c4d };
      return null;
    }
  };
  const device = {};
  const host = { gl, device, stateCache: { invalidate() {} }, counters: { releasedTextureHandles: 0 }, lifecycle: { readError: () => {
    if (!compressedError) return null;
    compressedError = false;
    return "0x0505";
  } },
    ...(options.maxBytes !== undefined ? { textureBudgetPolicy: { maxBytes: options.maxBytes } } : {}) } as unknown as WebGL2DeviceHost;
  return { gl, calls, device, registry: new WebGL2TextureRegistry(host) };
}

const drainWebglRetirements = (registry: WebGL2TextureRegistry) =>
  new Promise<void>((resolve) => registry.onNativeRetirementsDrained(resolve));

async function webgpu(hasBcFeature: boolean) {
  const textures: { descriptor: unknown; destroy: ReturnType<typeof vi.fn>; createView(): object }[] = [];
  const uploads: { mipLevel: number; bytes: number[]; layout: unknown }[] = [];
  const native = {
    features: new Set(hasBcFeature ? ["texture-compression-bc"] : []),
    queue: {
      writeBuffer() {}, submit() {}, onSubmittedWorkDone: async () => {},
      writeTexture(destination: { mipLevel: number }, data: ArrayBufferView, layout: unknown) {
        uploads.push({ mipLevel: destination.mipLevel, bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)], layout });
      }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: unknown) {
      const result = { descriptor, destroy: vi.fn(), createView: () => ({}) };
      textures.push(result); return result;
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, textures, uploads };
}

describe("opaque BC1 imported images", () => {
  it("preserves public image metadata, mips, ownership, and opaque selector 3", async () => {
    const asset = await parsed([hazardous, safe]);
    expect(publicTexture).toBe(texture);
    const handle = publicTexture.fromNativeImage(asset);
    expect(handle.texture.format).toBe("bc1-rgb-unorm");
    expect(handle.texture.colorSpace).toBe("srgb");
    expect(handle.texture.byteLength).toBe(16);
    expect(handle.texture.fallbackByteLength).toBe(80);
    expect(handle.texture.cpuByteLength).toBe(96);
    expect(handle.texture.fallbackTextureLevels[0]!.data.slice(0, 16)).toEqual(Uint8Array.of(0,0,0,255, 255,255,255,255, 127,127,127,255, 0,0,0,255));
    expect(handle.texture.fallbackTextureLevels[1]!.data.byteLength).toBe(16);
    expect(handle.repeat).toEqual([-1, -1]); expect(handle.offset).toEqual([1, 1]);
    expect(auraTextureRefTransform(handle)).toMatchObject({ scale: [-1, -1], offset: [1, 1] });
    expect(resolveAuraTextureRef(handle)).toMatchObject({ texture: handle.texture, transform: { scale: [-1, -1], offset: [1, 1] } });
    expect(handle.diagnostics.join(" ")).toMatch(/fallback on WebGPU/);
    asset.levels[0]!.data.fill(0);
    expect(handle.texture.textureLevels[0]!.data[4]).toBe(0xe4);
    handle.dispose(); expect(handle.texture.disposed).toBe(true);
    expect(ktx2TargetToTextureFormat("bc1-rgb-unorm")).toBe("bc1-rgb-unorm");
  });

  it("honors opaque DDS metadata even when the retained blocks use BC1 RGBA encoding", async () => {
    const asset = await parseImageFormat(opaqueDds(hazardous), "dds", { gpuFormats: ["bc1"] });
    expect(asset.levels[0]!.encoding).toBe("bc1");
    expect(asset.metadata.alphaMode).toBe("opaque");
    const handle = publicTexture.fromNativeImage(asset);
    expect(handle.texture.format).toBe("bc1-rgb-unorm");
    expect(handle.texture.colorSpace).toBe("srgb");
    expect(handle.texture.fallbackTextureLevels[0]!.data.slice(12, 16)).toEqual(Uint8Array.of(0, 0, 0, 255));
    handle.dispose();
  });

  it("uses the WebGL RGB enums for safe blocks and an opaque fallback for hazardous blocks", async () => {
    const ctx = webgl();
    expect(resolveCompressedTextureFormatReal("bc1-rgb-unorm", "linear", ctx.gl as never)).toBe(0x83f0);
    expect(resolveCompressedTextureFormatReal("bc1-rgb-unorm", "srgb", ctx.gl as never)).toBe(0x8c4c);
    expect(resolveCompressedTextureFormatReal("bc1-rgba-unorm", "srgb", ctx.gl as never)).toBe(0x8c4d);
    const direct = texture.fromNativeImage(await parsed([safe]));
    ctx.registry.getTextureHandle(direct.texture);
    expect(ctx.calls.compressedTexImage2D![0]![2]).toBe(0x8c4c);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(8);
    direct.updateMip(0, hazardous);
    expect(() => ctx.registry.getTextureHandle(direct.texture)).toThrow(/fresh decoded RGBA8 fallback/);
    direct.dispose(); ctx.registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(8);
    await drainWebglRetirements(ctx.registry);

    const fallback = texture.fromNativeImage(await parsed([hazardous, safe]));
    ctx.registry.getTextureHandle(fallback.texture);
    expect(ctx.calls.compressedTexImage2D).toHaveLength(1);
    expect(ctx.calls.texImage2D![0]![2]).toBe(ctx.gl.SRGB8_ALPHA8);
    expect((ctx.calls.texImage2D![0]![8] as number[]).slice(12, 16)).toEqual([0, 0, 0, 255]);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(80);
    fallback.dispose(); ctx.registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(80);
    await drainWebglRetirements(ctx.registry);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    expect(ctx.calls.deleteTexture).toHaveLength(2);
  });

  it.each([false, true])("uses complete RGBA8 WebGPU fallback with BC feature %s", async (hasBc) => {
    const gpu = await webgpu(hasBc);
    const handle = texture.fromNativeImage(await parsed([hazardous, safe]));
    gpu.device.getNativeTexture(handle.texture);
    expect(gpu.textures[0]!.descriptor).toMatchObject({ format: "rgba8unorm-srgb", mipLevelCount: 2 });
    expect(gpu.uploads.map((upload) => upload.mipLevel)).toEqual([0, 1]);
    expect(gpu.uploads[0]!.bytes.slice(12, 16)).toEqual([0, 0, 0, 255]);
    expect(gpu.device.getDiagnostics()).toMatchObject({ compressedTextures: 0, textureFallbacks: 1, textureFallbackBytes: 80, textureBytes: 80 });
    handle.updateMip(0, safe);
    expect(() => gpu.device.getNativeTexture(handle.texture)).toThrow(/fallback requires replacement data/);
    expect(gpu.device.getDiagnostics()).toMatchObject({ textureFallbacks: 1, textureFallbackBytes: 80, textureBytes: 80 });
    handle.dispose();
    expect(gpu.device.getDiagnostics()).toMatchObject({ textureFallbacks: 0, textureFallbackBytes: 0 });
    gpu.device.dispose();
  });

  it("charges WebGL fallback residency, and releases a failed budget admission", async () => {
    const handle = publicTexture.fromNativeImage(await parsed([safe], false));
    const supportedBudget = webgl({ compression: false, maxBytes: 64 });
    supportedBudget.registry.getTextureHandle(handle.texture);
    expect(supportedBudget.calls.compressedTexImage2D).toBeUndefined();
    expect(supportedBudget.calls.texImage2D![0]![2]).toBe(supportedBudget.gl.RGBA);
    expect(textureBudgetReport(supportedBudget.device as never).textureBytes).toBe(64);
    const tooSmall = webgl({ compression: false, maxBytes: 20 });
    expect(() => tooSmall.registry.getTextureHandle(handle.texture)).toThrow(/budget/i);
    expect(textureBudgetReport(tooSmall.device as never).textureBytes).toBe(0);
    expect(tooSmall.calls.deleteTexture).toHaveLength(1);
    handle.dispose(); supportedBudget.registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(supportedBudget.device as never).textureBytes).toBe(64);
    await drainWebglRetirements(supportedBudget.registry);
    expect(textureBudgetReport(supportedBudget.device as never).textureBytes).toBe(0);
  });

  it("holds a failed compressed allocation until its fence before admitting a decoded fallback", async () => {
    const ctx = webgl({ maxBytes: 64, failFirstCompressed: true });
    const handle = publicTexture.fromNativeImage(await parsed([safe], false));
    expect(() => ctx.registry.getTextureHandle(handle.texture)).toThrow(/budget/i);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(8);
    expect(ctx.calls.compressedTexImage2D).toHaveLength(1);
    await drainWebglRetirements(ctx.registry);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    ctx.registry.getTextureHandle(handle.texture);
    expect(ctx.calls.compressedTexImage2D).toHaveLength(1);
    expect(ctx.calls.texImage2D).toHaveLength(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(64);
    handle.dispose(); ctx.registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(ctx.registry);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  });

  it("uploads decoded image assets without confusing normalized integers with floats", () => {
    const rgba = publicTexture.fromNativeImage({ format: "dds", width: 1, height: 1, colorSpace: "srgb", metadata: { alphaMode: "opaque" }, diagnostics: [],
      levels: [{ width: 1, height: 1, encoding: "rgba8", data: Uint8Array.of(12, 34, 56, 0) }] });
    expect(rgba.texture.textureLevels[0]!.data).toEqual(Uint8Array.of(12, 34, 56, 255));
    expect(rgba.texture.colorSpace).toBe("srgb");
    const hdr = publicTexture.fromNativeImage({ format: "ultrahdr", width: 1, height: 1, colorSpace: "linear", metadata: {}, diagnostics: [],
      levels: [{ width: 1, height: 1, encoding: "rgba32f", data: new Float32Array([2, 0.5, -0.25, 1]) }] });
    expect(hdr.texture.textureLevels[0]!.data).toEqual(new Float32Array([2, 0.5, -0.25, 1]));
    expect(hdr.minFilter).toBe("nearest");
    expect(() => publicTexture.fromNativeImage({ format: "tiff", width: 1, height: 1, colorSpace: "linear", metadata: {}, diagnostics: [],
      levels: [{ width: 1, height: 1, encoding: "rgba16", data: new Uint16Array([1, 2, 3, 65535]) }] })).toThrow(/RGBA8 decode/);
    rgba.dispose(); hdr.dispose();
  });

  it("rejects missing, incomplete, and nonopaque fallbacks instead of aliasing RGB to RGBA", async () => {
    const gpu = await webgpu(true);
    const missing = new Texture({ width: 4, height: 4, format: "bc1-rgb-unorm", data: safe });
    expect(() => gpu.device.getNativeTexture(missing)).toThrow(/complete decoded RGBA8 fallback/);
    expect(() => new Texture({ width: 4, height: 4, format: "bc1-rgb-unorm", data: safe, mipLevelCount: 2, fallbackData: new Uint8Array(64).fill(255) })).toThrow(/every allocated mip/);
    expect(() => new Texture({ width: 4, height: 4, format: "bc1-rgb-unorm", data: safe, fallbackData: new Uint8Array(64) })).toThrow(/alpha must be opaque/);
    missing.dispose(); gpu.device.dispose();
  });

  it("keeps metadata changes usable but never revives fallback bytes after an in-place edit", async () => {
    const first = await webgpu(true);
    const second = await webgpu(true);
    const handle = texture.fromNativeImage(await parsed([safe]));
    handle.colorSpace = "linear";
    expect(handle.texture.fallbackByteLength).toBe(64);
    first.device.getNativeTexture(handle.texture);
    expect(first.textures[0]!.descriptor).toMatchObject({ format: "rgba8unorm" });
    expect(handle.needsUpdate).toBe(false);
    handle.texture.textureLevels[0]!.data[4] = 0;
    handle.needsUpdate = true;
    expect(handle.texture.fallbackByteLength).toBe(0);
    expect(() => first.device.getNativeTexture(handle.texture)).toThrow(/fallback requires replacement data/);
    expect(() => second.device.getNativeTexture(handle.texture)).toThrow(/complete decoded RGBA8 fallback/);
    handle.dispose(); first.device.dispose(); second.device.dispose();
  });

  it("uploads a replacement decoded fallback after a compressed content edit into the existing storage", async () => {
    const red = new Uint8Array(64).map((_, i) => [255, 0, 0, 255][i % 4]!);
    const blue = new Uint8Array(16).map((_, i) => [0, 0, 255, 255][i % 4]!);
    const green = new Uint8Array(64).map((_, i) => [0, 255, 0, 255][i % 4]!);

    // WebGPU without BC: the decoded chain lives in one rgba8 allocation.
    const gpu = await webgpu(false);
    const handle = texture.fromNativeImage(await parsed([hazardous, safe]));
    gpu.device.getNativeTexture(handle.texture);
    expect(gpu.textures).toHaveLength(1);
    handle.updateMip(0, safe);
    expect(() => gpu.device.getNativeTexture(handle.texture)).toThrow(/fallback requires replacement data/);
    expect(() => handle.texture.replaceFallbackLevels([{ width: 4, height: 4, data: green }])).toThrow(/every allocated mip/);
    expect(() => handle.texture.replaceFallbackLevels([{ width: 4, height: 4, data: green.map((v, i) => i % 4 === 3 ? 0 : v) }, { width: 2, height: 2, data: blue }])).toThrow(/alpha must be opaque/);
    handle.texture.replaceFallbackLevels([{ width: 4, height: 4, data: green }, { width: 2, height: 2, data: blue }]);
    expect(handle.texture.fallbackReplaced).toBe(true);
    const uploadsBefore = gpu.uploads.length;
    gpu.device.getNativeTexture(handle.texture);
    expect(gpu.textures).toHaveLength(1);
    expect(gpu.uploads.slice(uploadsBefore).map((upload) => [upload.mipLevel, upload.bytes.slice(0, 4)])).toEqual([[0, [0, 255, 0, 255]], [1, [0, 0, 255, 255]]]);
    expect(gpu.device.getDiagnostics()).toMatchObject({ textureFallbacks: 1, textureFallbackBytes: 80 });
    // A metadata-only revision keeps the written replacement without re-uploading it.
    handle.texture.markMetadataNeedsUpdate();
    const uploadsAfterReplacement = gpu.uploads.length;
    gpu.device.getNativeTexture(handle.texture);
    expect(gpu.uploads).toHaveLength(uploadsAfterReplacement);
    // A later content edit invalidates the replacement again.
    handle.updateMip(1, safe);
    expect(handle.texture.fallbackReplaced).toBe(false);
    expect(() => gpu.device.getNativeTexture(handle.texture)).toThrow(/fallback requires replacement data/);
    handle.dispose(); gpu.device.dispose();

    // WebGL without S3TC: the fallback storage receives the replacement in place.
    const ctx = webgl({ compression: false });
    const single = publicTexture.fromNativeImage(await parsed([safe], false));
    ctx.registry.getTextureHandle(single.texture);
    expect(ctx.calls.texImage2D).toHaveLength(1);
    single.updateMip(0, hazardous);
    expect(() => ctx.registry.getTextureHandle(single.texture)).toThrow(/without replacement fallback levels/);
    single.texture.replaceFallbackLevels([{ width: 4, height: 4, data: red }]);
    ctx.registry.getTextureHandle(single.texture);
    expect(ctx.calls.texImage2D).toHaveLength(2);
    expect((ctx.calls.texImage2D![1]![8] as number[]).slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(ctx.calls.deleteTexture ?? []).toHaveLength(0);
    single.dispose(); ctx.registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(ctx.registry);
    expect(ctx.calls.deleteTexture).toHaveLength(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  });

  it("reports unresolved alpha, unsupported encodings, and malformed mip data", async () => {
    const asset = await parsed([hazardous]);
    expect(() => texture.fromNativeImage({ ...asset, metadata: { alphaMode: "premultiplied" } })).toThrow(/premultiplied/);
    expect(() => texture.fromNativeImage({ ...asset, format: "tga", metadata: { attributeType: 2 } })).toThrow(/application-defined alpha/);
    expect(() => texture.fromNativeImage({ ...asset, format: "pvr", metadata: { flags: 0, pixelFormat: [8, 0] } })).toThrow(/premultiplied/);
    expect(() => texture.fromNativeImage({ ...asset, metadata: { uvTransform: { scale: [1], offset: [0, 0] } } })).toThrow(/orientation/);
    expect(() => texture.fromNativeImage({ ...asset, width: 2 ** 30 })).toThrow(/pixel limit/);
    expect(() => texture.fromNativeImage({ ...asset, levels: [{ ...asset.levels[0]!, encoding: "rgba16" }] })).toThrow(/RGBA8 decode/);
    expect(() => texture.fromNativeImage({ ...asset, levels: [{ ...asset.levels[0]!, data: Uint8Array.of(0) }] })).toThrow(/invalid pixel or block bytes/);
    const mipRequest = texture.fromNativeImage({ ...asset, metadata: { ...asset.metadata, generateMipmaps: true } });
    expect(mipRequest.diagnostics.join(" ")).toMatch(/mip pyramid was not created/);
    mipRequest.dispose();
  });
});
