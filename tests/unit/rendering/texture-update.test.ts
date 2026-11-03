/**
 * PRD-06 T0.10a — `Texture.update` + `WebGL2TextureRegistry` sub-image re-upload.
 * A dynamic texture allocates immutable storage once (`texStorage2D`) and every
 * `update()` re-uploads via `texSubImage2D` on the same WebGL handle — the
 * palette/morph path must never create a second WebGLTexture per key.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

function mockGl() {
  const calls = new Map<string, number>();
  const args = new Map<string, unknown[][]>();
  const state = { afterSubImage: undefined as (() => void) | undefined };
  let fenceSignaled = false;
  const record = (name: string) => (...params: unknown[]) => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
    const list = args.get(name) ?? [];
    list.push(params);
    args.set(name, list);
  };
  const gl = {
    TEXTURE_2D: 0x0de1,
    TEXTURE_2D_ARRAY: 0x8c1a,
    TEXTURE_CUBE_MAP: 0x8513,
    RGBA32F: 0x8814,
    RGBA16F: 0x881a,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    UNSIGNED_BYTE: 0x1401,
    NONE: 0,
    TEXTURE_BASE_LEVEL: 0x813c,
    TEXTURE_MAX_LEVEL: 0x813d,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    SRGB: 0x8c42,
    SRGB8_ALPHA8: 0x8c43,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    BROWSER_DEFAULT_WEBGL: 0x9244,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    createTexture: () => {
      record("createTexture")();
      return {};
    },
    deleteTexture: record("deleteTexture"),
    fenceSync: (...params: unknown[]) => { record("fenceSync")(...params); return {}; },
    clientWaitSync: (...params: unknown[]) => { record("clientWaitSync")(...params); return fenceSignaled ? 0x911a : 0x911b; },
    deleteSync: record("deleteSync"),
    flush: record("flush"),
    bindTexture: record("bindTexture"),
    pixelStorei: record("pixelStorei"),
    texParameteri: record("texParameteri"),
    texImage2D: record("texImage2D"),
    texSubImage2D: (...params: unknown[]) => { record("texSubImage2D")(...params); state.afterSubImage?.(); },
    texImage3D: record("texImage3D"),
    texSubImage3D: record("texSubImage3D"),
    texStorage2D: record("texStorage2D"),
    texStorage3D: record("texStorage3D"),
    generateMipmap: record("generateMipmap"),
    compressedTexImage2D: record("compressedTexImage2D"),
    getExtension: () => null,
    getParameter: () => 4096
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls, args, state, signalFence: () => { fenceSignaled = true; } };
}

function registryFor(gl: WebGL2RenderingContext) {
  const host = {
    gl,
    device: {},
    stateCache: { invalidate: () => undefined },
    counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined,
    lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return new WebGL2TextureRegistry(host);
}

function callCount(calls: Map<string, number>, name: string): number {
  return calls.get(name) ?? 0;
}

afterEach(() => { vi.useRealTimers(); });

describe("Texture.update sub-image upload (T0.10a)", () => {
  it("100 updates on a dynamic texture: one texStorage2D, 100 texSubImage2D, 0 texImage2D, 0 new handles", () => {
    const { gl, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 8,
      height: 8,
      format: "rgba32f",
      colorSpace: "linear",
      label: "palette-test",
      dynamic: true
    });
    const handle = registry.getTextureHandle(texture);
    expect(callCount(calls, "createTexture")).toBe(1);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texImage2D")).toBe(0);
    const data = new Float32Array(8 * 8 * 4);
    for (let frame = 0; frame < 100; frame += 1) {
      data.fill(frame);
      texture.update(data);
      expect(registry.getTextureHandle(texture)).toBe(handle);
    }
    expect(callCount(calls, "createTexture")).toBe(1);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texSubImage2D")).toBe(100);
    expect(callCount(calls, "texImage2D")).toBe(0);
  });

  it("region updates forward the pending rectangle to texSubImage2D", () => {
    const { gl, args, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({ width: 8, height: 8, format: "rgba32f", colorSpace: "linear", dynamic: true });
    const handle = registry.getTextureHandle(texture);
    const pixels = new Float32Array(2 * 3 * 4).fill(7);
    texture.update(pixels, { x: 1, y: 2, width: 2, height: 3 });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const call = args.get("texSubImage2D")!.at(-1)!;
    // (target, level, x, y, width, height, format, type, data)
    expect(call.slice(2, 6)).toEqual([1, 2, 2, 3]);
    expect(Array.from(call[8] as Float32Array)).toEqual(Array.from(pixels));
    const retained = texture.getMipLevel(0)!.data;
    expect(retained[0]).toBe(0);
    expect(retained[(2 * 8 + 1) * 4]).toBe(7);
    expect(retained[(4 * 8 + 2) * 4]).toBe(7);
    expect(retained[(5 * 8 + 2) * 4]).toBe(0);
    expect(callCount(calls, "texStorage2D")).toBe(1);
    expect(callCount(calls, "texImage2D")).toBe(0);
  });

  it("keeps no-data rectangle updates coherent across fast and lagging devices", () => {
    const a = mockGl(), b = mockGl();
    const first = registryFor(a.gl), second = registryFor(b.gl);
    const texture = new Texture({ width: 3, height: 2, format: "rgba8", dynamic: true, generateMipmaps: false });
    const aHandle = first.getTextureHandle(texture), bHandle = second.getTextureHandle(texture);
    const pixels = new Uint8Array([1, 2, 3, 4]);
    texture.update(pixels, { x: 1, y: 0, width: 1, height: 1 });
    pixels.fill(99);
    expect(first.getTextureHandle(texture)).toBe(aHandle);
    const aWrite = a.args.get("texSubImage2D")!.at(-1)!;
    expect(aWrite.slice(2, 6)).toEqual([1, 0, 1, 1]);
    expect(Array.from(aWrite[8] as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(second.getTextureHandle(texture)).toBe(bHandle);
    const bWrite = b.args.get("texSubImage2D")!.at(-1)!;
    expect(bWrite.slice(2, 6)).toEqual([0, 0, 3, 2]);
    expect(Array.from(bWrite[8] as Uint8Array)).toEqual([0, 0, 0, 0, 1, 2, 3, 4, ...Array(16).fill(0)]);
    texture.update(new Uint8Array([5, 6, 7, 8]), { x: 2, y: 1, width: 1, height: 1 });
    expect(second.getTextureHandle(texture)).toBe(bHandle);
    expect(b.args.get("texSubImage2D")!.at(-1)!.slice(2, 6)).toEqual([2, 1, 1, 1]);
    expect(first.getTextureHandle(texture)).toBe(aHandle);
    const catchup = a.args.get("texSubImage2D")!.at(-1)!;
    expect(catchup.slice(2, 6)).toEqual([0, 0, 3, 2]);
    expect(Array.from(catchup[8] as Uint8Array)).toEqual([0, 0, 0, 0, 1, 2, 3, 4, ...Array(12).fill(0), 5, 6, 7, 8]);
    expect(callCount(a.calls, "texStorage2D")).toBe(1);
    expect(callCount(b.calls, "texStorage2D")).toBe(1);
  });

  it("falls back to the retained full image if the pending rectangle is mutated", () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", dynamic: true, generateMipmaps: false });
    registry.getTextureHandle(texture);
    const region = { x: 0, y: 0, width: 1, height: 1 };
    texture.update(new Uint8Array([1, 2, 3, 4]), region);
    region.x = 1;
    registry.getTextureHandle(texture);
    const write = ctx.args.get("texSubImage2D")!.at(-1)!;
    expect(write.slice(2, 6)).toEqual([0, 0, 2, 2]);
    expect(Array.from(write[8] as Uint8Array)).toEqual([1, 2, 3, 4, ...Array(12).fill(0)]);
  });

  it("does not mistake an unknown in-flight initial upload for zeroed storage", () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", dynamic: true, generateMipmaps: false, data: new Uint8Array(16).fill(8) });
    ctx.state.afterSubImage = () => {
      ctx.state.afterSubImage = undefined;
      texture.update(new Uint8Array([1, 2, 3, 4]), { x: 0, y: 0, width: 1, height: 1 });
    };
    const handle = registry.getTextureHandle(texture);
    expect(texture.needsUpdate).toBe(true);
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const write = ctx.args.get("texSubImage2D")!.at(-1)!;
    expect(write.slice(2, 6)).toEqual([0, 0, 2, 2]);
    expect(Array.from(write[8] as Uint8Array)).toEqual([1, 2, 3, 4, ...Array(12).fill(8)]);
    expect(texture.needsUpdate).toBe(false);
  });

  it("initially uploads a pre-allocation region as a complete retained image", () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", dynamic: true, generateMipmaps: false });
    texture.update(new Uint8Array([1, 2, 3, 4]), { x: 1, y: 1, width: 1, height: 1 });
    const handle = registry.getTextureHandle(texture);
    const initial = ctx.args.get("texSubImage2D")!.at(-1)!;
    expect(initial.slice(2, 6)).toEqual([0, 0, 2, 2]);
    expect(Array.from(initial[8] as Uint8Array)).toEqual([...Array(12).fill(0), 1, 2, 3, 4]);
    texture.update(new Uint8Array([5, 6, 7, 8]), { x: 0, y: 0, width: 1, height: 1 });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const next = ctx.args.get("texSubImage2D")!.at(-1)!;
    expect(next.slice(2, 6)).toEqual([0, 0, 1, 1]);
    expect(Array.from(next[8] as Uint8Array)).toEqual([5, 6, 7, 8]);
  });

  it("uses a bounded first region after null mutable 2D allocation", () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", generateMipmaps: false });
    const handle = registry.getTextureHandle(texture);
    expect(ctx.args.get("texImage2D")![0]![8]).toBeNull();
    texture.update(new Uint8Array([1, 2, 3, 4]), { x: 1, y: 0, width: 1, height: 1 });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const write = ctx.args.get("texSubImage2D")!.at(-1)!;
    expect(write.slice(2, 6)).toEqual([1, 0, 1, 1]);
    expect(Array.from(write[8] as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(callCount(ctx.calls, "texImage2D")).toBe(1);
  });

  it("uses a bounded first region after no-data array allocation", () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", dimension: "2d-array", layers: 2 });
    const handle = registry.getTextureHandle(texture);
    expect(callCount(ctx.calls, "texSubImage3D")).toBe(0);
    texture.update(new Uint8Array([1, 2, 3, 4]), { x: 1, y: 1, width: 1, height: 1, layer: 1 });
    expect(registry.getTextureHandle(texture)).toBe(handle);
    const writes = ctx.args.get("texSubImage3D")!;
    expect(writes).toHaveLength(1);
    expect(writes[0]!.slice(0, 8)).toEqual([ctx.gl.TEXTURE_2D_ARRAY, 0, 1, 1, 1, 1, 1, 1]);
    expect(Array.from(writes[0]![10] as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(callCount(ctx.calls, "texStorage3D")).toBe(1);
  });

  it("2d-array textures allocate texStorage3D once and re-upload per layer via texSubImage3D", () => {
    const { gl, calls } = mockGl();
    const registry = registryFor(gl);
    const layers = 3;
    const texture = new Texture({
      width: 4,
      height: 4,
      layers,
      dimension: "2d-array",
      format: "rgba32f",
      colorSpace: "linear",
      data: new Float32Array(4 * 4 * 4 * layers)
    });
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texStorage3D")).toBe(1);
    expect(callCount(calls, "texSubImage3D")).toBe(layers);
    texture.update(new Float32Array(4 * 4 * 4 * layers));
    registry.getTextureHandle(texture);
    expect(callCount(calls, "texStorage3D")).toBe(1);
    expect(callCount(calls, "texSubImage3D")).toBe(layers * 2);
    expect(callCount(calls, "texImage2D")).toBe(0);
    expect(callCount(calls, "texImage3D")).toBe(0);
  });

  it("2d-array uploads bind TEXTURE_2D_ARRAY first and use a sized internalformat", () => {
    const { gl, args, calls } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      layers: 2,
      dimension: "2d-array",
      format: "rgba8",
      colorSpace: "linear",
      data: new Uint8Array(4 * 4 * 4 * 2)
    });
    registry.getTextureHandle(texture);
    // A texture object is locked to the first target it binds — texStorage3D
    // on a handle first bound to TEXTURE_2D throws GL_INVALID_OPERATION.
    const firstBind = args.get("bindTexture")![0]!;
    expect(firstBind[0]).toBe(0x8c1a); // TEXTURE_2D_ARRAY
    // texStorage* requires a sized internalformat: RGBA8, not unsized RGBA.
    const storageArgs = args.get("texStorage3D")![0]!;
    expect(storageArgs.slice(0, 4)).toEqual([0x8c1a, 1, 0x8058, 4]); // (target, levels, RGBA8, width)
  });

  it("2d-array update with region.layer offsets texSubImage3D zoffset", () => {
    const { gl, args } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      layers: 3,
      dimension: "2d-array",
      format: "rgba8",
      colorSpace: "linear",
      data: new Uint8Array(4 * 4 * 4 * 3)
    });
    registry.getTextureHandle(texture);
    texture.update(new Uint8Array(4 * 4 * 4), { x: 0, y: 0, width: 4, height: 4, layer: 2 });
    registry.getTextureHandle(texture);
    const call = args.get("texSubImage3D")!.at(-1)!;
    // (target, level, x, y, zoffset, w, h, depth, format, type, data)
    expect(call[4]).toBe(2);
    expect(call[7]).toBe(1);
  });

  it("reuses mutable non-dynamic storage for full-data updates", () => {
    const { gl, calls, args } = mockGl();
    const registry = registryFor(gl);
    const texture = new Texture({
      width: 4,
      height: 4,
      format: "rgba32f",
      colorSpace: "linear",
      data: new Float32Array(4 * 4 * 4)
    });
    const handle = registry.getTextureHandle(texture);
    expect(callCount(calls, "texImage2D")).toBe(1);
    const updated = new Float32Array(4 * 4 * 4).fill(9);
    texture.update(updated);
    expect(registry.getTextureHandle(texture)).toBe(handle);
    expect(callCount(calls, "createTexture")).toBe(1);
    expect(callCount(calls, "texImage2D")).toBe(1);
    expect(callCount(calls, "texSubImage2D")).toBe(1);
    expect(args.get("texSubImage2D")![0]!.slice(2, 6)).toEqual([0, 0, 4, 4]);
    expect(Array.from(args.get("texSubImage2D")![0]![8] as Float32Array)).toEqual(Array.from(updated));
  });

  it("update() keeps the data reference (no clone) and validates shape", () => {
    const data = new Float32Array(16);
    const texture = new Texture({ width: 2, height: 2, format: "rgba32f", colorSpace: "linear" });
    const rev = texture.revision;
    texture.update(data);
    expect(texture.data).toBe(data);
    expect(texture.revision).toBe(rev + 1);
    expect(() => texture.update(new Float32Array(8))).toThrow(/exactly 64 bytes/);
    expect(() => texture.update(data, { x: 0, y: 0, width: 4, height: 4 })).toThrow(/region/);
  });
});

describe("disposed-handle sweep runs only after a disposal", () => {
  it("retains the allocation when the fixture cannot produce a fence", async () => {
    const ctx = mockGl();
    const registry = registryFor(ctx.gl);
    const texture = new Texture({ width: 2, height: 2, format: "rgba8", generateMipmaps: false });
    registry.getTextureHandle(texture);
    ctx.gl.fenceSync = () => null;
    texture.dispose();
    expect(registry.textures.has(texture)).toBe(false);
    await Promise.resolve();
    expect(callCount(ctx.calls, "deleteTexture")).toBe(0);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(16);
    registry.host.contextLost = true;
    registry.invalidateTextureHandles();
    expect(callCount(ctx.calls, "deleteTexture")).toBe(0);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(0);
  });

  it("detaches on disposal and deletes the handle only after its fence signals", async () => {
    vi.useFakeTimers();
    const { gl, calls, args, signalFence } = mockGl();
    const registry = registryFor(gl);
    let scans = 0;
    const textures = registry.textures;
    const keys = textures.keys.bind(textures);
    textures.keys = () => { scans += 1; return keys(); };
    const a = new Texture({ width: 4, height: 4, format: "rgba32f", colorSpace: "linear", dynamic: true });
    const b = new Texture({ width: 4, height: 4, format: "rgba32f", colorSpace: "linear", dynamic: true });
    const aHandle = registry.getTextureHandle(a);
    const bHandle = registry.getTextureHandle(b);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(512);
    const before = scans;
    for (let i = 0; i < 500; i += 1) registry.getTextureHandle(i % 2 ? a : b);
    expect(scans - before).toBe(0);
    a.dispose();
    expect(registry.textures.has(a)).toBe(false);
    expect(registry.host.counters.releasedTextureHandles).toBe(1);
    expect(registry.getTextureHandle(b)).toBe(bHandle);
    expect(scans - before).toBe(1);
    expect(calls.get("deleteTexture") ?? 0).toBe(0);
    expect(() => registry.getTextureHandle(a)).toThrow(/disposed/);
    await Promise.resolve();
    expect(callCount(calls, "fenceSync")).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount(calls, "deleteTexture")).toBe(0);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(512);
    signalFence();
    await vi.advanceTimersByTimeAsync(8);
    expect(args.get("deleteTexture")).toEqual([[aHandle]]);
    expect(callCount(calls, "deleteSync")).toBe(1);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(256);
    expect(registry.getTextureHandle(b)).toBe(bHandle);
    a.dispose();
    registry.releaseDisposedTextureHandles();
    expect(args.get("deleteTexture")).toEqual([[aHandle]]);
    b.dispose();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(args.get("deleteTexture")).toEqual([[aHandle], [bHandle]]);
    expect(registry.host.counters.releasedTextureHandles).toBe(2);
    expect(textureBudgetReport(registry.host.device).textureBytes).toBe(0);
  });
});
