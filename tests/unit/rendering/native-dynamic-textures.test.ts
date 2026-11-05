import { describe, expect, it } from "vitest";
import { Texture, claimRenderTargetTextureOwner, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { WebGL2SamplerRegistry } from "../../../packages/rendering/src/webgl2/Samplers";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";

function context(options: { readonly maxBytes?: number; readonly maxDimension?: number; readonly readError?: () => string | null; readonly onCall?: (name: string) => void; readonly unpackBuffer?: object; readonly floatLinear?: boolean } = {}) {
  const calls: Record<string, unknown[][]> = {};
  const state = new Map<number, number>([[0x9240, 1], [0x9241, 1], [0x9243, 0x9244], [0x0cf5, 8], [0x0cf2, 3], [0x806e, 5], [0x0cf4, 1], [0x0cf3, 2], [0x806d, 4]]);
  let next = 0;
  let unpackBuffer: object | null = options.unpackBuffer ?? null;
  const record = (name: string) => (...args: unknown[]) => {
    const snapshot = args.map((arg) => ArrayBuffer.isView(arg) ? Array.from(arg as unknown as ArrayLike<number>) : arg);
    (calls[name] ??= []).push(snapshot);
    options.onCall?.(name);
  };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_3D: 0x806f, TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515, TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516,
    TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517, TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518,
    TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519, TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
    RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, RGBA: 0x1908, RGBA16F: 0x881a, RGBA32F: 0x8814,
    R32F: 0x822e, RED: 0x1903, FLOAT: 0x1406, HALF_FLOAT: 0x140b, UNSIGNED_BYTE: 0x1401,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, TEXTURE_WRAP_R: 0x8072, NEAREST: 0x2600, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f, REPEAT: 0x2901, MIRRORED_REPEAT: 0x8370, TEXTURE0: 0x84c0,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    UNPACK_ALIGNMENT: 0x0cf5, UNPACK_ROW_LENGTH: 0x0cf2, UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4, UNPACK_SKIP_ROWS: 0x0cf3, UNPACK_SKIP_IMAGES: 0x806d, NONE: 0,
    PIXEL_UNPACK_BUFFER: 0x88ec, PIXEL_UNPACK_BUFFER_BINDING: 0x88ef,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    fenceSync: () => ({}), flush: () => undefined, clientWaitSync: () => 0x911a, deleteSync: () => undefined,
    createTexture: () => { record("createTexture")(); return { id: ++next }; }, deleteTexture: record("deleteTexture"), bindTexture: record("bindTexture"),
    getParameter: (key: number) => key === 0x88ef ? unpackBuffer : state.get(key) ?? 0,
    getExtension: (name: string) => name === "OES_texture_float_linear" && options.floatLinear ? {} : null,
    bindBuffer: (target: number, value: object | null) => { if (target === 0x88ec) unpackBuffer = value; record("bindBuffer")(target, value); },
    pixelStorei: (key: number, value: number) => { state.set(key, value); record("pixelStorei")(key, value); },
    texParameteri: record("texParameteri"), texImage2D: record("texImage2D"), texSubImage2D: record("texSubImage2D"),
    texStorage2D: record("texStorage2D"), texImage3D: record("texImage3D"), texSubImage3D: record("texSubImage3D"),
    texStorage3D: record("texStorage3D"), compressedTexImage2D: record("compressedTexImage2D"),
    compressedTexSubImage2D: record("compressedTexSubImage2D"), compressedTexImage3D: record("compressedTexImage3D"),
    compressedTexSubImage3D: record("compressedTexSubImage3D"), generateMipmap: record("generateMipmap"),
    createSampler: () => ({ sampler: ++next }), samplerParameteri: record("samplerParameteri"), bindSampler: record("bindSampler"),
    activeTexture: record("activeTexture"), uniform1i: record("uniform1i")
  };
  const counters = { releasedTextureHandles: 0, textureBindCount: 0, samplerParameterUploadCount: 0, nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0 };
  const device = {};
  const stateCache = {
    invalidate() {},
    activeTexture: (_unit: number, call: () => void) => call(),
    bindTexture: (_target: number, _handle: unknown, call: () => void) => call(),
    bindSampler: (_unit: number, _handle: unknown, call: () => void) => call()
  };
  const host = { gl, stateCache, counters, lifecycle: { readError: options.readError ?? (() => null) }, device,
    ...((options.maxBytes !== undefined || options.maxDimension !== undefined) ? { textureBudgetPolicy: { maxBytes: options.maxBytes, maxDimension: options.maxDimension } } : {}) } as unknown as WebGL2DeviceHost;
  const registry = new WebGL2TextureRegistry(host);
  host.textureRegistry = registry;
  return { gl, state, calls, registry, counters, host, device };
}

const callsFor = (calls: Record<string, unknown[][]>, method: string): unknown[][] => calls[method] ?? [];
const drainRetirements = async () => {
  // Disposal queues the fence after the current synchronous draw stack.
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("native dynamic texture uploads", () => {
  it("keeps revisions independent across contexts and merges multiple rectangle edits", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 4, height: 4, dynamic: true, generateMipmaps: false, data: new Uint8Array(64) });
    const aHandle = a.registry.getTextureHandle(texture);
    const bHandle = b.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([10, 20, 30, 255]), { x: 1, y: 0, width: 1, height: 1 });
    a.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([40, 50, 60, 255]), { x: 3, y: 2, width: 1, height: 1 });
    expect(b.registry.getTextureHandle(texture)).toBe(bHandle);
    expect(a.registry.getTextureHandle(texture)).toBe(aHandle);
    const bData = callsFor(b.calls, "texSubImage2D").at(-1)!;
    expect(bData.slice(2, 6)).toEqual([0, 0, 4, 4]);
    const pixels = bData[8] as number[];
    expect(pixels.slice(4, 8)).toEqual([10, 20, 30, 255]);
    expect(pixels.slice(44, 48)).toEqual([40, 50, 60, 255]);
    expect(callsFor(a.calls, "texStorage2D")).toHaveLength(1);
    expect(callsFor(b.calls, "texStorage2D")).toHaveLength(1);
    texture.dispose();
    a.registry.releaseDisposedTextureHandles(); b.registry.releaseDisposedTextureHandles();
    expect(a.counters.releasedTextureHandles).toBe(1);
    expect(b.counters.releasedTextureHandles).toBe(1);
    expect(() => a.registry.getTextureHandle(texture)).toThrow(/disposed/);
  });

  it("uploads the same retained rectangle snapshot in every context", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 3, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(24) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    const pixels = new Uint8Array([4, 5, 6, 255]);
    texture.update(pixels, { x: 1, y: 1, width: 1, height: 1 });
    pixels.fill(99);
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    expect(callsFor(a.calls, "texSubImage2D").at(-1)?.slice(2, 6)).toEqual([1, 1, 1, 1]);
    expect(callsFor(a.calls, "texSubImage2D").at(-1)?.[8]).toEqual([4, 5, 6, 255]);
    expect((callsFor(b.calls, "texSubImage2D").at(-1)?.[8] as number[]).slice(16, 20)).toEqual([4, 5, 6, 255]);
    texture.dispose();
  });

  it("reuses existing mutable 2D storage for complete data updates in every context", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, data: new Uint8Array(16) });
    const first = a.registry.getTextureHandle(texture);
    const second = b.registry.getTextureHandle(texture);
    texture.update(new Uint8Array(16).fill(6));
    expect(a.registry.getTextureHandle(texture)).toBe(first);
    expect(b.registry.getTextureHandle(texture)).toBe(second);
    for (const ctx of [a, b]) {
      expect(callsFor(ctx.calls, "texImage2D")).toHaveLength(1);
      expect(callsFor(ctx.calls, "texSubImage2D").at(-1)?.[8]).toEqual(Array(16).fill(6));
    }
    texture.dispose();
  });

  it("does not overwrite device-owned render-target storage or bind it from another device", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 2, height: 2, generateMipmaps: false, data: new Uint8Array(16) });
    const handle = {} as WebGLTexture;
    claimRenderTargetTextureOwner(texture, a.device);
    a.registry.textures.set(texture, handle);
    expect(a.registry.getTextureHandle(texture)).toBe(handle);
    for (const name of ["bindTexture", "texImage2D", "texSubImage2D"]) expect(callsFor(a.calls, name)).toHaveLength(0);
    expect(() => b.registry.getTextureHandle(texture)).toThrow(/another device/i);
    expect(callsFor(b.calls, "createTexture")).toHaveLength(0);
    a.registry.textures.delete(texture);
    texture.dispose();
  });

  it("does not lose pixels when a caller mutates a pending rectangle descriptor", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 3, height: 1, dynamic: true, generateMipmaps: false, data: new Uint8Array(12) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    const region = { x: 0, y: 0, width: 1, height: 1 };
    texture.update(new Uint8Array([7, 8, 9, 255]), region);
    region.x = 2;
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    for (const ctx of [a, b]) {
      const update = callsFor(ctx.calls, "texSubImage2D").at(-1)!;
      expect(update.slice(2, 6)).toEqual([0, 0, 3, 1]);
      expect(update[8]).toEqual([7, 8, 9, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
    texture.dispose();
  });

  it("snapshots array-region coordinates across reentrant layer uploads", () => {
    const region = { x: 0, y: 0, width: 1, height: 1, layer: 0 };
    let armed = false;
    const { calls, registry } = context({ onCall: (name) => {
      if (armed && name === "texSubImage3D") {
        armed = false;
        region.x = 1;
        region.layer = 1;
      }
    } });
    const texture = new Texture({ width: 2, height: 1, dimension: "2d-array", layers: 2, data: new Uint8Array(16) });
    registry.getTextureHandle(texture);
    texture.update(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), region);
    const before = callsFor(calls, "texSubImage3D").length;
    armed = true;
    registry.getTextureHandle(texture);
    const updates = callsFor(calls, "texSubImage3D").slice(before);
    expect(updates.map((call) => call.slice(2, 8))).toEqual([[0, 0, 0, 1, 1, 1], [0, 0, 1, 1, 1, 1]]);
    expect(updates.map((call) => call[10])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
    texture.dispose();
  });

  it("rejects a detached full update before changing WebGL state", () => {
    const { calls, registry } = context();
    const texture = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    const handle = registry.getTextureHandle(texture);
    const borrowed = new Uint8Array(16);
    texture.update(borrowed);
    structuredClone(borrowed, { transfer: [borrowed.buffer] });
    const before = Object.fromEntries(Object.entries(calls).map(([name, entries]) => [name, entries.length]));
    expect(() => registry.getTextureHandle(texture)).toThrow(/byte|detach|pixel/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D", "texSubImage2D"]) {
      expect(callsFor(calls, name)).toHaveLength(before[name] ?? 0);
    }
    expect(registry.textures.get(texture)).toBe(handle);
    texture.update(new Uint8Array(16).fill(3));
    expect(registry.getTextureHandle(texture)).toBe(handle);
    expect(callsFor(calls, "texSubImage2D").at(-1)?.[8]).toEqual(Array(16).fill(3));
    texture.dispose();
  });

  it("rejects non-linear float storage before allocating a texture", () => {
    const { calls, registry } = context();
    const texture = new Texture({ width: 1, height: 1, format: "rgba32f", colorSpace: "srgb", data: new Float32Array(4) });
    expect(() => registry.getTextureHandle(texture)).toThrow(/float.*linear/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D"]) expect(callsFor(calls, name)).toHaveLength(0);
    texture.dispose();
  });

  it("writes bounded array rectangles to the requested layer and leaves other layers intact", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 3, height: 2, dimension: "2d-array", layers: 3, data: new Uint8Array(72) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([8, 7, 6, 255]), { x: 1, y: 1, width: 1, height: 1, layer: 2 });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    const partial = callsFor(a.calls, "texSubImage3D").at(-1)!;
    expect(partial.slice(2, 8)).toEqual([1, 1, 2, 1, 1, 1]);
    const lastLayers = callsFor(b.calls, "texSubImage3D").slice(-3);
    expect(lastLayers.map((call) => call[4])).toEqual([0, 1, 2]);
    expect((lastLayers[0]![10] as number[]).every((value) => value === 0)).toBe(true);
    expect((lastLayers[2]![10] as number[]).slice(16, 20)).toEqual([8, 7, 6, 255]);
    expect(() => texture.update(new Uint8Array(4), { x: 3, y: 0, width: 1, height: 1, layer: 2 })).toThrow(/bounds/);
    expect(() => texture.update(new Uint8Array(4), { x: 0, y: 0, width: 1, height: 1, layer: 3 })).toThrow(/layer/);
  });

  it("allocates 3D R32F mip storage and changes only the requested level", () => {
    const { calls, registry, gl } = context();
    const texture = new Texture({ width: 4, height: 4, depth: 4, dimension: "3d", format: "r32f", mipLevelCount: 3, data: new Float32Array(64) });
    const handle = registry.getTextureHandle(texture);
    expect(callsFor(calls, "texStorage3D")[0]).toEqual([gl.TEXTURE_3D, 3, gl.R32F, 4, 4, 4]);
    texture.updateMip(1, new Float32Array(8).fill(2.5));
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const update = callsFor(calls, "texSubImage3D").at(-1)!;
    expect(update.slice(0, 10)).toEqual([gl.TEXTURE_3D, 1, 0, 0, 0, 2, 2, 2, gl.RED, gl.FLOAT]);
    expect(update[10]).toEqual(Array(8).fill(2.5));
    expect(() => texture.updateMip(2, new Float32Array(2))).toThrow(/exactly/);
    expect(() => texture.updateMip(3, new Float32Array(1))).toThrow(/Mip level/);
  });

  it("uses a bounded array-layer rectangle with allocated mip levels", () => {
    const { calls, gl, registry } = context();
    const texture = new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2, mipLevelCount: 2, data: new Uint8Array(128) });
    const handle = registry.getTextureHandle(texture);
    const before = callsFor(calls, "texSubImage3D").length;
    texture.update(new Uint8Array([7, 8, 9, 255]), { x: 2, y: 1, width: 1, height: 1, layer: 1 });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const writes = callsFor(calls, "texSubImage3D").slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.slice(0, 8)).toEqual([gl.TEXTURE_2D_ARRAY, 0, 2, 1, 1, 1, 1, 1]);
    expect(writes[0]![10]).toEqual([7, 8, 9, 255]);
    expect(callsFor(calls, "texStorage3D")).toHaveLength(1);
    texture.dispose();
  });

  it("reuploads retained 3D mip contents after an in-place dirty mark in each context", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 4, height: 4, depth: 4, dimension: "3d", format: "r32f", mipLevelCount: 2,
      mipLevels: [{ width: 4, height: 4, depth: 4, data: new Float32Array(64) }, { width: 2, height: 2, depth: 2, data: new Float32Array(8) }] });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    (texture.mipLevels[0]!.data as Float32Array)[0] = 3.5;
    texture.markNeedsUpdate();
    texture.updateMip(1, new Float32Array(8).fill(6));
    const aBefore = callsFor(a.calls, "texSubImage3D").length;
    const bBefore = callsFor(b.calls, "texSubImage3D").length;
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    for (const writes of [callsFor(a.calls, "texSubImage3D").slice(aBefore), callsFor(b.calls, "texSubImage3D").slice(bBefore)]) {
      expect(writes.map((write) => write[1])).toEqual([0, 1]);
      expect((writes[0]![10] as number[])[0]).toBe(3.5);
      expect(writes[1]![10]).toEqual(Array(8).fill(6));
    }
    texture.dispose();
  });

  it("uploads an in-place full-content mark after a pending mip edit on every context", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 4, height: 4, depth: 4, dimension: "3d", format: "r32f", mipLevelCount: 2,
      mipLevels: [{ width: 4, height: 4, depth: 4, data: new Float32Array(64) }, { width: 2, height: 2, depth: 2, data: new Float32Array(8) }] });
    const handleA = a.registry.getTextureHandle(texture);
    const handleB = b.registry.getTextureHandle(texture);
    texture.updateMip(1, new Float32Array(8).fill(6));
    (texture.getMipLevel(0)!.data as Float32Array)[0] = 3.5;
    texture.markNeedsUpdate();
    const aBefore = callsFor(a.calls, "texSubImage3D").length;
    const bBefore = callsFor(b.calls, "texSubImage3D").length;

    expect(a.registry.getTextureHandle(texture)).toBe(handleA);
    expect(texture.needsUpdate).toBe(false);
    expect(b.registry.getTextureHandle(texture)).toBe(handleB);
    for (const writes of [callsFor(a.calls, "texSubImage3D").slice(aBefore), callsFor(b.calls, "texSubImage3D").slice(bBefore)]) {
      expect(writes.map((write) => write[1])).toEqual([0, 1]);
      expect((writes[0]![10] as number[])[0]).toBe(3.5);
      expect(writes[1]![10]).toEqual(Array(8).fill(6));
    }
    texture.dispose();
  });

  it("keeps pending rectangles and later in-place edits for both fast and lagging contexts", () => {
    const a = context(); const b = context();
    const texture = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([1, 2, 3, 4]), { x: 0, y: 0, width: 1, height: 1 });
    texture.getMipLevel(0)!.data.set([5, 6, 7, 8], 12);
    const beforeMark = texture.revision;
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(beforeMark + 1);

    const aBefore = callsFor(a.calls, "texSubImage2D").length;
    a.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([9, 10, 11, 12]), { x: 1, y: 0, width: 1, height: 1 });
    const bBefore = callsFor(b.calls, "texSubImage2D").length;
    b.registry.getTextureHandle(texture);
    a.registry.getTextureHandle(texture);
    const lagging = callsFor(b.calls, "texSubImage2D").slice(bBefore);
    expect(lagging).toHaveLength(1);
    expect(lagging[0]!.slice(2, 6)).toEqual([0, 0, 2, 2]);
    expect(lagging[0]![8]).toEqual([1, 2, 3, 4, 9, 10, 11, 12, 0, 0, 0, 0, 5, 6, 7, 8]);
    const fast = callsFor(a.calls, "texSubImage2D").slice(aBefore);
    expect(fast[0]![8]).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8]);
    // B consumed the region hint first; A must still catch up from retained pixels.
    expect(fast.at(-1)!.slice(2, 6)).toEqual([0, 0, 2, 2]);
    expect(fast.at(-1)![8]).toEqual([1, 2, 3, 4, 9, 10, 11, 12, 0, 0, 0, 0, 5, 6, 7, 8]);
    texture.dispose();
  });

  it("restores the same full mark and pending rectangle after a failed WebGL upload", () => {
    let fail = false;
    const ctx = context({ readError: () => fail ? "0x0505" : null });
    const texture = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    ctx.registry.getTextureHandle(texture);
    texture.update(new Uint8Array([1, 2, 3, 4]), { x: 0, y: 0, width: 1, height: 1 });
    texture.getMipLevel(0)!.data.set([5, 6, 7, 8], 12);
    texture.markNeedsUpdate();
    const revision = texture.revision;
    const pendingRegion = texture.pendingUpdateRegion;

    fail = true;
    expect(() => ctx.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(texture.revision).toBe(revision);
    expect(texture.needsUpdate).toBe(true);
    expect(texture.pendingUpdateRegion).toBe(pendingRegion);
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(revision);

    fail = false;
    ctx.registry.getTextureHandle(texture);
    expect(texture.needsUpdate).toBe(false);
    expect(texture.pendingUpdateRegion).toBeNull();
    expect(callsFor(ctx.calls, "texSubImage2D").at(-1)![8]).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8]);
    texture.dispose();
  });

  it("does not restore a failed mark after another WebGL context acknowledged it", () => {
    const b = context();
    let armed = false;
    let fail = false;
    let texture: Texture;
    const a = context({
      readError: () => fail ? "0x0505" : null,
      onCall: (name) => {
        if (!armed || name !== "texSubImage2D") return;
        armed = false;
        b.registry.getTextureHandle(texture);
      }
    });
    texture = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    texture.getMipLevel(0)!.data[0] = 5;
    texture.markNeedsUpdate();
    const revision = texture.revision;
    armed = true; fail = true;
    expect(() => a.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(texture.revision).toBe(revision);
    expect(texture.needsUpdate).toBe(false);

    texture.getMipLevel(0)!.data[0] = 9;
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(revision + 1);
    fail = false;
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    expect((callsFor(a.calls, "texSubImage2D").at(-1)![8] as number[])[0]).toBe(9);
    expect((callsFor(b.calls, "texSubImage2D").at(-1)![8] as number[])[0]).toBe(9);
    texture.dispose();
  });

  it("refreshes every compressed cube face after a mip edit followed by a full-content mark", () => {
    const a = context(); const b = context();
    const faces: TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
    const texture = new Texture({ width: 4, height: 4, dimension: "cube", format: "etc2-rgb8unorm", mipLevelCount: 2,
      cubeFaces: faces.map((face) => ({ face, mipLevels: [{ width: 4, height: 4, data: new Uint8Array(8) }, { width: 2, height: 2, data: new Uint8Array(8) }] })) });
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    texture.updateMip(1, new Uint8Array(8).fill(42), { face: "ny" });
    texture.getMipLevel(0, "px")!.data[0] = 23;
    texture.markNeedsUpdate();
    a.registry.getTextureHandle(texture); b.registry.getTextureHandle(texture);
    for (const ctx of [a, b]) {
      const writes = callsFor(ctx.calls, "compressedTexSubImage2D");
      expect(writes).toHaveLength(12);
      expect((writes.find((write) => write[0] === ctx.gl.TEXTURE_CUBE_MAP_POSITIVE_X && write[1] === 0)![7] as number[])[0]).toBe(23);
      expect(writes.find((write) => write[0] === ctx.gl.TEXTURE_CUBE_MAP_NEGATIVE_Y && write[1] === 1)![7]).toEqual(Array(8).fill(42));
    }
    texture.dispose();
  });

  it("preserves an in-place mip dirty mark made during a revision upload", () => {
    let armed = false;
    let texture: Texture;
    const ctx = context({ onCall: (name) => {
      if (armed && name === "texSubImage3D") {
        armed = false;
        (texture.mipLevels[0]!.data as Float32Array)[0] = 7;
        texture.markNeedsUpdate();
      }
    } });
    texture = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f", mipLevelCount: 2,
      mipLevels: [{ width: 2, height: 2, depth: 2, data: new Float32Array(8) }, { width: 1, height: 1, depth: 1, data: new Float32Array(1) }] });
    const handle = ctx.registry.getTextureHandle(texture);
    texture.updateMip(1, new Float32Array([5]));
    const revision = texture.revision;
    armed = true;
    ctx.registry.getTextureHandle(texture);
    expect(texture.revision).toBeGreaterThan(revision);
    expect(texture.needsUpdate).toBe(true);
    const before = callsFor(ctx.calls, "texSubImage3D").length;
    expect(ctx.registry.getTextureHandle(texture)).toBe(handle);
    const writes = callsFor(ctx.calls, "texSubImage3D").slice(before);
    expect(writes.map((write) => write[1])).toEqual([0, 1]);
    expect((writes[0]![10] as number[])[0]).toBe(7);
    texture.dispose();
  });

  it("records a second full mark during a WebGL full-content upload", () => {
    let armed = false;
    let texture: Texture;
    const ctx = context({ onCall: (name) => {
      if (!armed || name !== "texSubImage3D") return;
      armed = false;
      (texture.getMipLevel(0)!.data as Float32Array)[0] = 7;
      texture.markNeedsUpdate();
    } });
    texture = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f", mipLevelCount: 2,
      mipLevels: [{ width: 2, height: 2, depth: 2, data: new Float32Array(8) }, { width: 1, height: 1, depth: 1, data: new Float32Array(1) }] });
    const handle = ctx.registry.getTextureHandle(texture);
    (texture.getMipLevel(0)!.data as Float32Array)[0] = 3;
    texture.markNeedsUpdate();
    const revision = texture.revision;
    armed = true;
    ctx.registry.getTextureHandle(texture);
    expect(texture.revision).toBe(revision + 1);
    expect(texture.needsUpdate).toBe(true);
    const before = callsFor(ctx.calls, "texSubImage3D").length;
    expect(ctx.registry.getTextureHandle(texture)).toBe(handle);
    const writes = callsFor(ctx.calls, "texSubImage3D").slice(before);
    expect(writes.map((write) => write[1])).toEqual([0, 1]);
    expect((writes[0]![10] as number[])[0]).toBe(7);
    texture.dispose();
  });

  it("reuploads compressed mips after the caller marks retained bytes dirty", () => {
    const { calls, registry } = context();
    const texture = new Texture({ width: 4, height: 4, format: "etc2-rgb8unorm", mipLevelCount: 2,
      mipLevels: [{ width: 4, height: 4, data: new Uint8Array(8) }, { width: 2, height: 2, data: new Uint8Array(8) }] });
    const handle = registry.getTextureHandle(texture);
    texture.mipLevels[0]!.data[0] = 23;
    texture.markNeedsUpdate();
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const writes = callsFor(calls, "compressedTexSubImage2D");
    expect(writes.map((write) => write[1])).toEqual([0, 1]);
    expect((writes[0]![7] as number[])[0]).toBe(23);
    texture.dispose();
  });

  it("preserves decoded compressed data when a metadata-only replacement fails", async () => {
    let fail = false;
    const ctx = context({ readError: () => fail ? "0x0505" : null });
    const texture = new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8), fallbackData: new Uint8Array(64) });
    const first = ctx.registry.getTextureHandle(texture);
    texture.colorSpace = "srgb";
    texture.markMetadataNeedsUpdate();
    fail = true;
    expect(() => ctx.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(texture.needsUpdate).toBe(true);
    expect(texture.fallbackTextureLevels).toHaveLength(1);
    fail = false;
    expect(ctx.registry.getTextureHandle(texture)).not.toBe(first);
    texture.dispose();
    await drainRetirements();
  });

  it("updates a single compressed cube face and mip using complete blocks", () => {
    const { calls, registry, gl } = context();
    const faces: TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
    const texture = new Texture({ width: 4, height: 4, dimension: "cube", format: "etc2-rgb8unorm", mipLevelCount: 2,
      cubeFaces: faces.map((face) => ({ face, mipLevels: [{ width: 4, height: 4, data: new Uint8Array(8) }] })) });
    const handle = registry.getTextureHandle(texture);
    expect(callsFor(calls, "compressedTexImage2D")).toHaveLength(12);
    texture.updateMip(1, new Uint8Array(8).fill(42), { face: "ny" });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const update = callsFor(calls, "compressedTexSubImage2D");
    expect(update).toHaveLength(1);
    expect(update[0]!.slice(0, 7)).toEqual([gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 1, 0, 0, 2, 2, 0x9274]);
    expect(update[0]![7]).toEqual(Array(8).fill(42));
    expect(() => texture.updateMip(1, new Uint8Array(4), { face: "ny" })).toThrow(/8 bytes/);
  });

  it("reuses media storage until size changes, honors flip, restores unpack state and stops polling on disposal", async () => {
    const { gl, state, calls, registry } = context();
    const before = new Map(state);
    const canvas = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: canvas as unknown as TexImageSource, dynamic: true, flipY: true, generateMipmaps: false });
    let frame = 0; let observed = 0; let polls = 0;
    texture.pollContentRevision = () => { polls += 1; if (frame !== observed) { observed = frame; texture.markNeedsUpdate(); } };
    const handle = registry.getTextureHandle(texture);
    frame = 1;
    expect(registry.getTextureHandle(texture)).toBe(handle);
    expect(callsFor(calls, "texSubImage2D")).toHaveLength(1);
    canvas.width = 3; frame = 2;
    expect(registry.getTextureHandle(texture)).toBe(handle);
    expect(callsFor(calls, "texImage2D")).toHaveLength(2);
    expect(callsFor(calls, "pixelStorei")).toContainEqual([gl.UNPACK_FLIP_Y_WEBGL, 1]);
    expect(state).toEqual(before);
    texture.dispose();
    expect(() => registry.getTextureHandle(texture)).toThrow(/disposed/);
    expect(polls).toBe(2);
    expect(callsFor(calls, "deleteTexture")).toHaveLength(0);
    await drainRetirements();
    expect(callsFor(calls, "deleteTexture")).toHaveLength(1);
  });

  it("rejects closed borrowed frames before changing upload state, storage, or budget", async () => {
    const { calls, state, registry, device } = context();
    const source = { displayWidth: 2, displayHeight: 2, closeCalls: 0, [Symbol.toStringTag]: "VideoFrame",
      close() { this.displayWidth = 0; this.displayHeight = 0; this.closeCalls += 1; } };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const handle = registry.getTextureHandle(texture);
    const beforeState = new Map(state);
    source.close();
    texture.markNeedsUpdate();
    const before = Object.fromEntries(Object.entries(calls).map(([name, entries]) => [name, entries.length]));
    expect(() => registry.getTextureHandle(texture)).toThrow(/dimensions|closed/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D", "texSubImage2D"]) {
      expect(callsFor(calls, name)).toHaveLength(before[name] ?? 0);
    }
    expect(state).toEqual(beforeState);
    expect(registry.textures.get(texture)).toBe(handle);
    expect(textureBudgetReport(device as never).textureBytes).toBe(16);
    texture.dispose();
    expect(source.closeCalls).toBe(1);
    await drainRetirements();
  });

  it("rejects a closed frame on first use before creating a native allocation", () => {
    const { calls, registry, device } = context();
    const source = { displayWidth: 0, displayHeight: 0, [Symbol.toStringTag]: "VideoFrame" };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true });
    expect(() => registry.getTextureHandle(texture)).toThrow(/dimensions|closed/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D"]) expect(callsFor(calls, name)).toHaveLength(0);
    expect(textureBudgetReport(device as never).textureBytes).toBe(0);
    texture.dispose();
  });

  it("rejects a requested ImageBitmap flip before mutating an existing texture (strict)", () => {
    const { calls, registry, device } = context();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device as never);
    const source = { width: 2, height: 2, [Symbol.toStringTag]: "ImageBitmap" };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, flipY: false, generateMipmaps: false });
    const handle = registry.getTextureHandle(texture);
    texture.flipY = true;
    texture.markMetadataNeedsUpdate();
    const before = Object.fromEntries(Object.entries(calls).map(([name, entries]) => [name, entries.length]));
    expect(() => registry.getTextureHandle(texture)).toThrow(/ImageBitmap.*flip/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D", "texSubImage2D"]) {
      expect(callsFor(calls, name)).toHaveLength(before[name] ?? 0);
    }
    expect(registry.textures.get(texture)).toBe(handle);
    expect(textureBudgetReport(device as never).textureBytes).toBe(16);
    texture.dispose();
  });

  it("rejects source-backed explicit mip storage rather than silently ignoring it", () => {
    const { calls, registry } = context();
    const source = { width: 4, height: 4 };
    const texture = new Texture({ width: 4, height: 4, source: source as unknown as TexImageSource, mipLevelCount: 2, generateMipmaps: false });
    expect(() => registry.getTextureHandle(texture)).toThrow(/source.*mip/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D"]) expect(callsFor(calls, name)).toHaveLength(0);
    texture.dispose();
  });

  it("enforces the source dimension budget before a resize touches native state", () => {
    const { calls, registry, device } = context({ maxDimension: 3 });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const handle = registry.getTextureHandle(texture);
    source.width = 4;
    texture.markNeedsUpdate();
    const before = Object.fromEntries(Object.entries(calls).map(([name, entries]) => [name, entries.length]));
    expect(() => registry.getTextureHandle(texture)).toThrow(/dimension|size/i);
    for (const name of ["createTexture", "bindBuffer", "pixelStorei", "bindTexture", "texImage2D", "texSubImage2D"]) {
      expect(callsFor(calls, name)).toHaveLength(before[name] ?? 0);
    }
    expect(registry.textures.get(texture)).toBe(handle);
    expect(textureBudgetReport(device as never).textureBytes).toBe(16);
    texture.dispose();
  });

  it("keeps a revision recorded during an upload pending for the next upload", () => {
    let armed = false;
    let texture: Texture;
    const { calls, registry } = context({ onCall: (name) => {
      if (armed && name === "texSubImage2D") {
        armed = false;
        texture.update(new Uint8Array([9, 8, 7, 255]), { x: 1, y: 1, width: 1, height: 1 });
      }
    } });
    texture = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    const handle = registry.getTextureHandle(texture);
    texture.update(new Uint8Array([1, 2, 3, 255]), { x: 0, y: 0, width: 1, height: 1 });
    armed = true;
    registry.getTextureHandle(texture);
    expect(texture.needsUpdate).toBe(true);
    const before = callsFor(calls, "texSubImage2D").length;
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const writes = callsFor(calls, "texSubImage2D").slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.slice(2, 6)).toEqual([1, 1, 1, 1]);
    expect(writes[0]![8]).toEqual([9, 8, 7, 255]);
    texture.dispose();
  });

  it("restores pixel unpack and buffer state after a source upload throws", () => {
    let fail = false;
    const buffer = {};
    const { gl, state, registry } = context({ unpackBuffer: buffer, onCall: (name) => {
      if (fail && name === "texSubImage2D") throw new Error("upload interrupted");
    } });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, flipY: true, generateMipmaps: false });
    registry.getTextureHandle(texture);
    const before = new Map(state);
    texture.markNeedsUpdate();
    fail = true;
    expect(() => registry.getTextureHandle(texture)).toThrow(/upload interrupted/);
    expect(state).toEqual(before);
    expect(gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING)).toBe(buffer);
    expect(texture.needsUpdate).toBe(true);
    texture.dispose();
  });

  it("regenerates RGBA mipmaps after data updates and reallocates only when immutable mip layout changes", async () => {
    const { calls, registry, gl } = context();
    const texture = new Texture({ width: 4, height: 4, dynamic: true, generateMipmaps: true, data: new Uint8Array(64) });
    const initial = registry.getTextureHandle(texture);
    expect(callsFor(calls, "texStorage2D")[0]).toEqual([gl.TEXTURE_2D, 3, gl.RGBA8, 4, 4]);
    expect(callsFor(calls, "generateMipmap")).toHaveLength(1);
    texture.update(new Uint8Array([2, 3, 4, 255]), { x: 1, y: 1, width: 1, height: 1 });
    expect(registry.getTextureHandle(texture)).toBe(initial);
    expect(callsFor(calls, "generateMipmap")).toHaveLength(2);
    texture.generateMipmaps = false;
    texture.markNeedsUpdate();
    const withoutMips = registry.getTextureHandle(texture);
    expect(withoutMips).not.toBe(initial);
    expect(callsFor(calls, "texStorage2D").at(-1)).toEqual([gl.TEXTURE_2D, 1, gl.RGBA8, 4, 4]);
    expect(callsFor(calls, "deleteTexture")).toHaveLength(0);
    await drainRetirements();
    expect(callsFor(calls, "deleteTexture")).toHaveLength(1);
    expect(callsFor(calls, "generateMipmap")).toHaveLength(2);
    texture.dispose();
    registry.releaseDisposedTextureHandles();
  });

  it("charges actual dynamic mip storage and rolls back failed allocations and source resizes", async () => {
    let firstUploadError = true;
    const failed = context({ readError: () => {
      if (!firstUploadError) return null;
      firstUploadError = false;
      return "0x0505";
    } });
    const bad = new Texture({ width: 4, height: 4, data: new Uint8Array(64), generateMipmaps: false });
    expect(() => failed.registry.getTextureHandle(bad)).toThrow(/upload failed/i);
    expect(textureBudgetReport(failed.device as never).textureBytes).toBe(64);
    await drainRetirements();
    expect(textureBudgetReport(failed.device as never).textureBytes).toBe(0);
    expect(callsFor(failed.calls, "deleteTexture")).toHaveLength(1);

    const bounded = context({ maxBytes: 80 });
    const mipped = new Texture({ width: 4, height: 4, dynamic: true, data: new Uint8Array(64), generateMipmaps: true });
    expect(() => bounded.registry.getTextureHandle(mipped)).toThrow(/budget/i);
    expect(textureBudgetReport(bounded.device as never).textureBytes).toBe(0);

    let failRevision = false;
    const live = context({ readError: () => failRevision ? "0x0505" : null });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const handle = live.registry.getTextureHandle(texture);
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(16);
    source.width = 4;
    texture.markNeedsUpdate();
    failRevision = true;
    expect(() => live.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(48);
    failRevision = false;
    expect(live.registry.getTextureHandle(texture)).not.toBe(handle);
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(80);
    await drainRetirements();
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(32);
    texture.dispose();
    live.registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(32);
    await drainRetirements();
    expect(textureBudgetReport(live.device as never).textureBytes).toBe(0);
  });

  it("retires an indeterminate source resize before retrying a reverted dimension", async () => {
    let failed = false;
    const ctx = context({ readError: () => failed ? "0x0502" : null });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const first = ctx.registry.getTextureHandle(texture);
    source.width = 4;
    texture.markNeedsUpdate();
    failed = true;
    expect(() => ctx.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(ctx.registry.textures.has(texture)).toBe(false);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(48);
    source.width = 2;
    failed = false;
    expect(ctx.registry.getTextureHandle(texture)).not.toBe(first);
    expect(callsFor(ctx.calls, "texImage2D")).toHaveLength(3);
    expect(callsFor(ctx.calls, "texSubImage2D")).toHaveLength(0);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(64);
    await drainRetirements();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    texture.dispose();
    await drainRetirements();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  });

  it("fails an immutable storage allocation instead of claiming a mutable fallback succeeded", async () => {
    let error = true;
    const ctx = context({ readError: () => { if (!error) return null; error = false; return "0x0505"; } });
    const texture = new Texture({ width: 2, height: 2, data: new Uint8Array(16), dynamic: true, generateMipmaps: false });
    expect(() => ctx.registry.getTextureHandle(texture)).toThrow(/upload failed/i);
    expect(callsFor(ctx.calls, "texStorage2D")).toHaveLength(1);
    expect(callsFor(ctx.calls, "texImage2D")).toHaveLength(0);
    expect(callsFor(ctx.calls, "texSubImage2D")).toHaveLength(0);
    expect(ctx.registry.textures.has(texture)).toBe(false);
    await drainRetirements();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    texture.dispose();
  });

  it("rejects a source resize that cannot coexist with its in-flight old storage", async () => {
    const ctx = context({ maxBytes: 40 });
    const source = { width: 2, height: 2 };
    const texture = new Texture({ width: 2, height: 2, source: source as unknown as TexImageSource, dynamic: true, generateMipmaps: false });
    const handle = ctx.registry.getTextureHandle(texture);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    source.width = 4;
    texture.markNeedsUpdate();
    expect(() => ctx.registry.getTextureHandle(texture)).toThrow(/resize exceeds/);
    expect(callsFor(ctx.calls, "texImage2D")).toHaveLength(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    source.width = 2;
    expect(ctx.registry.getTextureHandle(texture)).toBe(handle);
    texture.dispose(); ctx.registry.releaseDisposedTextureHandles();
    await drainRetirements();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  });

  it("restores live textures with fresh handles after context invalidation and releases fallback handles once", async () => {
    const { calls, registry, device } = context();
    const texture = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    const first = registry.getTextureHandle(texture);
    const snapshots = (registry as unknown as { uploadedBaseData: WeakMap<Texture, unknown> }).uploadedBaseData;
    expect(snapshots.has(texture)).toBe(true);
    registry.getFallbackTextureHandle(); registry.getFallbackCubeTextureHandle();
    registry.getFallbackArrayTextureHandle(); registry.getFallback3DTextureHandle();
    registry.invalidateTextureHandles();
    expect(snapshots.has(texture)).toBe(false);
    expect(textureBudgetReport(device as never).textureBytes).toBe(0);
    expect(callsFor(calls, "deleteTexture")).toHaveLength(0);
    expect(registry.getTextureHandle(texture)).not.toBe(first);
    registry.getFallbackTextureHandle(); registry.getFallbackCubeTextureHandle();
    registry.getFallbackArrayTextureHandle(); registry.getFallback3DTextureHandle();
    registry.disposeFallbackTextures();
    registry.disposeFallbackTextures();
    expect(callsFor(calls, "deleteTexture")).toHaveLength(0);
    await drainRetirements();
    expect(callsFor(calls, "deleteTexture")).toHaveLength(4);
    texture.dispose();
    registry.releaseDisposedTextureHandles();
  });

  it("binds matching 3D and array targets, including target-specific fallback and sampler wrap", () => {
    const { calls, gl, registry, host } = context();
    const sampler = new WebGL2SamplerRegistry(host);
    const texture = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f", data: new Float32Array(8) });
    sampler.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "volume", texture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) }), 0, "sampler3D");
    expect(callsFor(calls, "bindTexture").at(-1)?.[0]).toBe(gl.TEXTURE_3D);
    sampler.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "array" }), 1, "sampler2DArray");
    sampler.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "volume" }), 2, String(0x8b5f));
    expect(callsFor(calls, "texImage3D").map((call) => call[0])).toEqual([gl.TEXTURE_2D_ARRAY, gl.TEXTURE_3D]);
    expect(callsFor(calls, "samplerParameteri").filter((call) => call[1] === gl.TEXTURE_WRAP_R).length).toBeGreaterThanOrEqual(2);
    expect(() => sampler.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "wrong", texture }), 0, "sampler2D")).toThrow(/dimension/i);
    expect(() => sampler.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "integer" }), 0, "isampler3D")).toThrow(/integer/i);
    registry.disposeFallbackTextures();
    texture.dispose(); registry.releaseDisposedTextureHandles();
  });

  it("rejects unavailable 32-bit float filtering while allowing nearest and supported linear sampling", () => {
    const unsupported = context(); const supported = context({ floatLinear: true });
    const texture = new Texture({ width: 2, height: 2, depth: 2, dimension: "3d", format: "r32f", data: new Float32Array(8) });
    const linear = new TextureBinding({ name: "volume", texture });
    const nearest = new TextureBinding({ name: "volume", texture, sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) });
    const a = new WebGL2SamplerRegistry(unsupported.host);
    const b = new WebGL2SamplerRegistry(supported.host);
    expect(() => a.uploadTextureUniform({} as WebGLUniformLocation, linear, 0, "sampler3D")).toThrow(/float.*linear|linear.*float/i);
    expect(callsFor(unsupported.calls, "createTexture")).toHaveLength(0);
    expect(() => a.uploadTextureUniform({} as WebGLUniformLocation, nearest, 0, "sampler3D")).not.toThrow();
    expect(() => b.uploadTextureUniform({} as WebGLUniformLocation, linear, 0, "sampler3D")).not.toThrow();
    texture.dispose();
  });

  it("forgets sampler objects and float filtering capabilities after context loss", () => {
    const ctx = context({ floatLinear: true });
    const sampler = new WebGL2SamplerRegistry(ctx.host);
    ctx.host.samplers = sampler;
    const texture = new Texture({ width: 1, height: 1, format: "rgba32f", data: new Float32Array(4) });
    const binding = new TextureBinding({ name: "float", texture });
    sampler.uploadTextureUniform({} as WebGLUniformLocation, binding, 0, "sampler2D");
    const first = sampler.getSamplerHandle(binding.sampler, ctx.gl.TEXTURE_2D, texture);
    ctx.host.contextLost = true;
    ctx.registry.invalidateTextureHandles();
    expect(sampler.samplerObjectCache.size).toBe(0);
    ctx.host.contextLost = false;
    ctx.gl.getExtension = () => null;
    expect(() => sampler.uploadTextureUniform({} as WebGLUniformLocation, binding, 0, "sampler2D")).toThrow(/float.*linear/i);
    const second = sampler.getSamplerHandle(binding.sampler, ctx.gl.TEXTURE_2D, texture);
    expect(second).not.toBe(first);
    texture.dispose();
  });

  it("keeps 2D and 3D sampler identities and third-axis address modes distinct", () => {
    const { calls, gl, host } = context();
    const registry = new WebGL2SamplerRegistry(host);
    const repeating = new Sampler({ addressV: "clamp-to-edge", addressW: "repeat" });
    const mirrored = new Sampler({ addressV: "clamp-to-edge", addressW: "mirror-repeat" });
    const flat = registry.getSamplerHandle(repeating, gl.TEXTURE_2D);
    const volume = registry.getSamplerHandle(repeating, gl.TEXTURE_3D);
    const otherVolume = registry.getSamplerHandle(mirrored, gl.TEXTURE_3D);
    expect(volume).not.toBe(flat);
    expect(otherVolume).not.toBe(volume);
    expect(callsFor(calls, "samplerParameteri")).toContainEqual([volume, gl.TEXTURE_WRAP_R, gl.REPEAT]);
    expect(callsFor(calls, "samplerParameteri")).toContainEqual([otherVolume, gl.TEXTURE_WRAP_R, gl.MIRRORED_REPEAT]);
  });
});
