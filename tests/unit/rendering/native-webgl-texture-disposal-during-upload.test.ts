import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";

function context(maxDimension?: number) {
  const calls: { method: string; args: unknown[] }[] = [];
  const events: string[] = [];
  const created: object[] = [];
  const deleted: object[] = [];
  const fences: object[] = [];
  const state: { signaled: boolean; onCall?: (method: string) => void } = { signaled: false };
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    events.push(method);
    state.onCall?.(method);
  };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_3D: 0x806f, TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515, TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516,
    TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517, TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518,
    TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519, TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
    RGBA: 0x1908, RGBA8: 0x8058, UNSIGNED_BYTE: 0x1401,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, TEXTURE_WRAP_R: 0x8072,
    NEAREST: 0x2600, CLAMP_TO_EDGE: 0x812f,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a,
    CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    createTexture: () => { const handle = {}; created.push(handle); return handle; },
    deleteTexture: (handle: object) => { deleted.push(handle); },
    bindTexture: record("bindTexture"), texParameteri: record("texParameteri"),
    texImage2D: record("texImage2D"), texSubImage2D: record("texSubImage2D"),
    texStorage2D: record("texStorage2D"), texStorage3D: record("texStorage3D"),
    texImage3D: record("texImage3D"), texSubImage3D: record("texSubImage3D"),
    compressedTexImage2D: record("compressedTexImage2D"), compressedTexImage3D: record("compressedTexImage3D"),
    compressedTexSubImage2D: record("compressedTexSubImage2D"), compressedTexSubImage3D: record("compressedTexSubImage3D"),
    getParameter: () => 0, pixelStorei: () => {}, getExtension: () => null, generateMipmap: record("generateMipmap"),
    fenceSync: () => { const fence = {}; fences.push(fence); events.push("fence"); return fence; },
    flush: () => {}, clientWaitSync: () => state.signaled ? 0x911a : 0x911b, deleteSync: () => {}
  };
  const device = {};
  const host = {
    gl, device, stateCache: { invalidate() {} }, counters: { releasedTextureHandles: 0 },
    lifecycle: { readError: () => null, isDeviceLost: () => false },
    ...(maxDimension === undefined ? {} : { textureBudgetPolicy: { maxDimension } })
  } as unknown as WebGL2DeviceHost;
  const registry = new WebGL2TextureRegistry(host);
  return { calls, events, created, deleted, fences, state, device, registry };
}

const faces: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
const rgbaMips = () => [
  { width: 4, height: 4, data: new Uint8Array(64).fill(1) },
  { width: 2, height: 2, data: new Uint8Array(16).fill(2) },
  { width: 1, height: 1, data: new Uint8Array(4).fill(3) }
];

function expectDisposed(operation: () => unknown): void {
  let failure: unknown;
  try { operation(); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "DISPOSED_RESOURCE" });
}

async function finishRetirement(ctx: ReturnType<typeof context>, bytes: number): Promise<void> {
  expect(ctx.fences).toHaveLength(1);
  expect(ctx.deleted).toEqual([]);
  expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(bytes);
  ctx.state.signaled = true;
  await vi.advanceTimersByTimeAsync(0);
  expect(ctx.deleted).toEqual(ctx.created);
  expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  ctx.registry.disposeTextureHandles();
  expect(ctx.deleted).toEqual(ctx.created);
}

afterEach(() => { vi.useRealTimers(); });

describe("WebGL texture disposal during upload", () => {
  it("stops after the first 2D mip and fences its attempted storage", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 4, height: 4, mipLevels: rgbaMips() });
    ctx.state.onCall = (method) => { if (method === "texImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    const images = ctx.calls.filter(({ method }) => method === "texImage2D");
    expect(images).toHaveLength(1);
    expect(images[0]!.args[8]).toBeInstanceOf(Uint8Array);
    expect(ctx.calls.filter(({ method }) => method === "texParameteri")).toHaveLength(0);
    expect(ctx.registry.textures.has(source)).toBe(false);
    expect(ctx.events.indexOf("texImage2D")).toBeLessThan(ctx.events.indexOf("fence"));
    await finishRetirement(ctx, 84);
  });

  it("stops a cube upload before the next mip or face", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 4, height: 4, dimension: "cube", cubeFaces: faces.map((face) => ({ face, mipLevels: rgbaMips() })) });
    ctx.state.onCall = (method) => { if (method === "texImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texImage2D")).toHaveLength(1);
    await finishRetirement(ctx, 504);
  });

  it("stops compressed cube faces before allocating blank later levels", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const compressedMips = () => [
      { width: 4, height: 4, data: new Uint8Array(8).fill(1) },
      { width: 2, height: 2, data: new Uint8Array(8).fill(2) }
    ];
    const source = new Texture({ width: 4, height: 4, dimension: "cube", format: "etc2-rgb8unorm",
      cubeFaces: faces.map((face) => ({ face, mipLevels: compressedMips() })) });
    ctx.state.onCall = (method) => { if (method === "compressedTexImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "compressedTexImage2D")).toHaveLength(1);
    await finishRetirement(ctx, 96);
  });

  it("stops an RGBA fallback chain after its first attempted level", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", mipLevelCount: 3,
      mipLevels: rgbaMips().map(({ width, height }) => ({ width, height, data: new Uint8Array(8) })),
      fallbackMipLevels: rgbaMips() });
    ctx.state.onCall = (method) => { if (method === "texImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texImage2D")).toHaveLength(1);
    await finishRetirement(ctx, 84);
  });

  it("stops after volume storage allocation before reading or uploading layers", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 2, height: 2, dimension: "2d-array", layers: 2, data: new Uint8Array(32) });
    ctx.state.onCall = (method) => { if (method === "texStorage3D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texStorage3D")).toHaveLength(1);
    expect(ctx.calls.filter(({ method }) => method === "texSubImage3D")).toHaveLength(0);
    await finishRetirement(ctx, 32);
  });

  it("stops a dynamic texture after storage allocation before its pixel write", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, data: new Uint8Array(16) });
    ctx.state.onCall = (method) => { if (method === "texStorage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texStorage2D")).toHaveLength(1);
    expect(ctx.calls.filter(({ method }) => method === "texSubImage2D" || method === "texImage2D")).toHaveLength(0);
    await finishRetirement(ctx, 16);
  });

  it("stops between array layer uploads when the first write disposes the texture", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 2, height: 2, dimension: "2d-array", layers: 2, data: new Uint8Array(32) });
    ctx.state.onCall = (method) => { if (method === "texSubImage3D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texSubImage3D")).toHaveLength(1);
    await finishRetirement(ctx, 32);
  });

  it("checks the original texture while uploading a budget-downscaled copy", async () => {
    vi.useFakeTimers();
    const ctx = context(2);
    const source = new Texture({ width: 4, height: 4, mipLevels: rgbaMips() });
    ctx.state.onCall = (method) => { if (method === "texImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    const images = ctx.calls.filter(({ method }) => method === "texImage2D");
    expect(images).toHaveLength(1);
    expect(images[0]!.args.slice(3, 5)).toEqual([2, 2]);
    await finishRetirement(ctx, 20);
  });

  it("stops an existing cube's revision and retires its handle only once", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 4, height: 4, dimension: "cube", cubeFaces: faces.map((face) => ({ face, mipLevels: rgbaMips() })) });
    const handle = ctx.registry.getTextureHandle(source);
    source.updateMip(0, new Uint8Array(64), { face: "px" });
    source.updateMip(0, new Uint8Array(64), { face: "nx" });
    ctx.calls.length = 0;
    ctx.state.onCall = (method) => { if (method === "texSubImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texSubImage2D")).toHaveLength(1);
    expect(ctx.fences).toHaveLength(0);
    expect(ctx.registry.textures.has(source)).toBe(false);
    await Promise.resolve();
    expect(ctx.created).toEqual([handle]);
    await finishRetirement(ctx, 504);
  });

  it("stops a compressed cube revision before writing another face", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const compressedMips = () => [
      { width: 4, height: 4, data: new Uint8Array(8).fill(1) },
      { width: 2, height: 2, data: new Uint8Array(8).fill(2) }
    ];
    const source = new Texture({ width: 4, height: 4, dimension: "cube", format: "etc2-rgb8unorm",
      cubeFaces: faces.map((face) => ({ face, mipLevels: compressedMips() })) });
    ctx.registry.getTextureHandle(source);
    source.updateMip(0, new Uint8Array(8), { face: "px" });
    source.updateMip(0, new Uint8Array(8), { face: "nx" });
    ctx.calls.length = 0;
    ctx.state.onCall = (method) => { if (method === "compressedTexSubImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "compressedTexSubImage2D")).toHaveLength(1);
    expect(ctx.fences).toHaveLength(0);
    await Promise.resolve();
    await finishRetirement(ctx, 96);
  });

  it("stops a multi-layer region revision after its first write", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = new Texture({ width: 2, height: 2, dimension: "2d-array", layers: 2, data: new Uint8Array(32) });
    ctx.registry.getTextureHandle(source);
    source.update(new Uint8Array(32), { x: 0, y: 0, width: 2, height: 2 });
    ctx.calls.length = 0;
    ctx.state.onCall = (method) => { if (method === "texSubImage3D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texSubImage3D")).toHaveLength(1);
    expect(ctx.fences).toHaveLength(0);
    await Promise.resolve();
    await finishRetirement(ctx, 32);
  });

  it("fences both charges when a source is disposed during a resizing revision", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const canvas = { width: 2, height: 2 };
    const source = new Texture({ width: 2, height: 2, dynamic: true, generateMipmaps: false, source: canvas as unknown as TexImageSource });
    const handle = ctx.registry.getTextureHandle(source);
    canvas.width = 3;
    source.markNeedsUpdate();
    ctx.calls.length = 0;
    ctx.state.onCall = (method) => { if (method === "texImage2D") source.dispose(); };
    expectDisposed(() => ctx.registry.getTextureHandle(source));
    expect(ctx.calls.filter(({ method }) => method === "texImage2D")).toHaveLength(1);
    expect(ctx.calls.filter(({ method }) => method === "texParameteri" || method === "generateMipmap")).toHaveLength(0);
    expect(ctx.fences).toHaveLength(1);
    expect(ctx.deleted).toEqual([]);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(40);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(2);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([handle]);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    ctx.registry.disposeTextureHandles();
    expect(ctx.deleted).toEqual([handle]);
  });
});
