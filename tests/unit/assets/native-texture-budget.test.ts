import { describe, expect, it } from "vitest";
import { evaluateDistancePrioritizedMipResidency } from "../../../packages/assets/src/TextureStreaming";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { createRenderDevice } from "../../../packages/rendering/src/RenderBackend";
import { Texture, type TextureDescriptor } from "../../../packages/rendering/src/Texture";
// Resolve the lazy backend during collection so the lifetime tests time device
// and fence work, rather than a first Vite transform of the WebGPU module.
import "../../../packages/rendering/src/WebGPUDevice";
import type { WebGPUDevice, WebGPUDeviceLike, WebGPUTextureDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { normalizeCreateAppRendererOptions, normalizeTextureBudgetPolicy, resolveDrawingPathOptions } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import type { AuraCreateAppRendererOptions } from "../../../packages/engine/src/agent-api/nodes/types";
import {
  applyTextureBudget,
  beginTextureBudgetResize,
  releaseTextureBudget,
  resetTextureBudgetLedger,
  retireTextureBudget,
  setTextureBudgetResidentBytes,
  textureBudgetReport
} from "../../../packages/rendering/src/textures/TextureBudget";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";

/** Explicit RGBA8 mip levels, largest first, filled with distinct bytes. */
function rgbaMipChain(size: number, label = "same-name"): TextureDescriptor {
  const mipLevels: NonNullable<TextureDescriptor["mipLevels"]>[number][] = [];
  for (let extent = size; ; extent = Math.max(1, Math.floor(extent / 2))) {
    mipLevels.push({ width: extent, height: extent, data: new Uint8Array(extent * extent * 4).fill(extent) });
    if (extent === 1) break;
  }
  return { width: size, height: size, format: "rgba8", label, mipLevels, generateMipmaps: false };
}

function rgba(size: number, label = "same-name"): TextureDescriptor {
  return {
    width: size,
    height: size,
    label,
    format: "rgba8",
    data: new Uint8Array(size * size * 4).map((_, i) => [12, 34, 56, 255][i % 4]!),
    generateMipmaps: false
  };
}

function bytes(texture: TextureDescriptor): number {
  if (texture.mipLevels?.length) return texture.mipLevels.reduce((sum, level) => sum + level.data.byteLength, 0);
  return texture.data?.byteLength ?? 0;
}

describe("texture streaming decisions", () => {
  it("funds real coarse mip bytes before higher detail and evicts the farthest when necessary", () => {
    const candidates = [
      { id: "near", distanceMeters: 1, mipBytesCoarseToFine: [4, 16, 64] },
      { id: "far", distanceMeters: 30, mipBytesCoarseToFine: [4, 16, 64] }
    ];
    const full = evaluateDistancePrioritizedMipResidency(candidates, 168);
    expect(full.usedBytes).toBe(168);
    expect(full.evicted).toEqual([]);
    const reduced = evaluateDistancePrioritizedMipResidency(candidates, 4);
    expect(reduced.usedBytes).toBe(4);
    expect(reduced.residents).toEqual([
      { id: "near", residentLevels: 1, residentBytes: 4 },
      { id: "far", residentLevels: 0, residentBytes: 0 }
    ]);
    expect(reduced.evicted).toEqual(["far"]);
    const restored = evaluateDistancePrioritizedMipResidency(candidates, 168);
    expect(restored).toEqual(full);
  });

  it("rejects duplicate residency keys and non-finite or negative inputs", () => {
    const valid = { id: "same", distanceMeters: 1, mipBytesCoarseToFine: [4, 16] };
    expect(() => evaluateDistancePrioritizedMipResidency([valid, valid], 20)).toThrow(/duplicate/i);
    for (const bad of [
      { ...valid, distanceMeters: -1 },
      { ...valid, distanceMeters: Number.NaN },
      { ...valid, priority: Number.POSITIVE_INFINITY },
      { ...valid, mipBytesCoarseToFine: [4, -1] },
      { ...valid, mipBytesCoarseToFine: [4, Number.NaN] }
    ]) {
      expect(() => evaluateDistancePrioritizedMipResidency([bad], 20)).toThrow();
    }
  });
});

describe("texture budget: returned CPU data", () => {
  it("returns the retained mip bytes instead of only changing the reported total", () => {
    const device = new MockRenderDevice();
    const input = rgbaMipChain(8);
    const output = applyTextureBudget(input, { maxBytes: 100 }, device);

    // 8² + 4² + 2² + 1² RGBA8 = 340 bytes. Dropping the 8²
    // level leaves 64 + 16 + 4 = 84 real bytes.
    expect(input.mipLevels?.map((level) => level.width)).toEqual([8, 4, 2, 1]);
    expect(output.width).toBe(4);
    expect(output.height).toBe(4);
    expect(output.mipLevels?.map((level) => [level.width, level.height, level.data.byteLength])).toEqual([
      [4, 4, 64], [2, 2, 16], [1, 1, 4]
    ]);
    expect(output.mipLevels?.[0]?.data).toEqual(input.mipLevels?.[1]?.data);
    expect(bytes(output)).toBe(84);
    expect(textureBudgetReport(device).textureBytes).toBe(bytes(output));
  });

  it("generates smaller real RGBA8 data when no mip chain exists", () => {
    const device = new MockRenderDevice();
    const input = rgba(4);
    const output = applyTextureBudget(input, { maxBytes: 16 }, device);

    expect([output.width, output.height]).toEqual([2, 2]);
    expect(bytes(output)).toBe(16);
    const pixels = output.mipLevels?.[0]?.data ?? output.data;
    expect([...pixels!]).toEqual(Array.from({ length: 4 }, () => [12, 34, 56, 255]).flat());
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    expect(input.data?.byteLength).toBe(64);
  });

  it("retains real block-compressed mip bytes when the budget drops top levels", () => {
    const device = new MockRenderDevice();
    // BC1 occupies eight bytes per 4×4 block, including the 2×2 and 1×1 mips.
    const input: TextureDescriptor = {
      width: 16, height: 16, format: "bc1-rgba-unorm", label: "bc1",
      mipLevels: [
        { width: 16, height: 16, data: new Uint8Array(128).fill(16) },
        { width: 8, height: 8, data: new Uint8Array(32).fill(8) },
        { width: 4, height: 4, data: new Uint8Array(8).fill(4) },
        { width: 2, height: 2, data: new Uint8Array(8).fill(2) },
        { width: 1, height: 1, data: new Uint8Array(8).fill(1) }
      ]
    };
    const output = applyTextureBudget(input, { maxBytes: 56 }, device);
    expect(output.width).toBe(8);
    expect(output.mipLevels?.map((level) => level.data.byteLength)).toEqual([32, 8, 8, 8]);
    expect(output.mipLevels?.map((level) => level.data[0])).toEqual([8, 4, 2, 1]);
    expect(textureBudgetReport(device).textureBytes).toBe(bytes(output));
    expect(bytes(output)).toBe(56);
    releaseTextureBudget(output, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("never claims an earlier returned allocation shrank when a later texture arrives", () => {
    const device = new MockRenderDevice();
    const first = applyTextureBudget(rgbaMipChain(4, "first"), { maxBytes: 100 }, device);
    const second = applyTextureBudget(rgbaMipChain(4, "second"), { maxBytes: 100 }, device);

    expect(bytes(first)).toBe(84);
    expect(bytes(second)).toBeLessThanOrEqual(16);
    expect(textureBudgetReport(device).textureBytes).toBe(bytes(first) + bytes(second));
    expect(textureBudgetReport(device).textureBytes).toBeLessThanOrEqual(100);
  });

  it("counts duplicate labels independently, isolates devices, and releases either identity once", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = rgbaMipChain(4);
    const second = rgbaMipChain(4);
    const returnedFirst = applyTextureBudget(first, { maxBytes: 100 }, a);
    const returnedSecond = applyTextureBudget(second, { maxBytes: 100 }, a);
    const returnedOnB = applyTextureBudget(first, { maxBytes: 100 }, b);
    expect(textureBudgetReport(a).textureBytes).toBe(bytes(returnedFirst) + bytes(returnedSecond));
    expect(textureBudgetReport(b).textureBytes).toBe(bytes(returnedOnB));

    releaseTextureBudget(returnedFirst, a);
    releaseTextureBudget(first, a);
    expect(textureBudgetReport(a).textureBytes).toBe(bytes(returnedSecond));
    expect(textureBudgetReport(b).textureBytes).toBe(bytes(returnedOnB));
    releaseTextureBudget(second, a);
    releaseTextureBudget(returnedOnB, b);
    expect(textureBudgetReport(a).textureBytes).toBe(0);
    expect(textureBudgetReport(b).textureBytes).toBe(0);

    const reloaded = applyTextureBudget(first, { maxBytes: 100 }, a);
    expect(bytes(reloaded)).toBe(84);
    expect(textureBudgetReport(a).textureBytes).toBe(84);
    releaseTextureBudget(reloaded, a);
    expect(textureBudgetReport(a).textureBytes).toBe(0);
  });

  it("rejects an unshrinkable allocation without changing the resident total", () => {
    const device = new MockRenderDevice();
    const resident = applyTextureBudget(rgba(1), { maxBytes: 8 }, device);
    const impossible: TextureDescriptor = {
      width: 1, height: 1, format: "rgba32f", data: new Float32Array([1, 2, 3, 4])
    };
    let failure: unknown;
    try {
      applyTextureBudget(impossible, { maxBytes: 8 }, device);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "TEXTURE_BUDGET_EXCEEDED" });
    expect(textureBudgetReport(device).textureBytes).toBe(bytes(resident));
    releaseTextureBudget(resident, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("accounts for compressed block rounding and float formats across allocated levels", () => {
    const device = new MockRenderDevice();
    const rgb = new Texture({ width: 7, height: 5, format: "bc1-rgb-unorm", data: new Uint8Array(32), mipLevelCount: 3 });
    const bc7 = new Texture({ width: 7, height: 5, format: "bc7-rgba-unorm", data: new Uint8Array(64), mipLevelCount: 3 });
    const halfFloat = new Texture({ width: 3, height: 2, format: "rgba16f", mipLevelCount: 2 });
    const r32f = new Texture({ width: 4, height: 4, format: "r32f", generateMipmaps: true });
    for (const texture of [rgb, bc7, halfFloat, r32f]) applyTextureBudget(texture, {}, device);
    // BC1: 32+8+8; BC7: 64+16+16; RGBA16F: 48+8; R32F is not auto-mipped in WebGL.
    expect(textureBudgetReport(device).textureBytes).toBe(48 + 96 + 56 + 64);
    for (const texture of [rgb, bc7, halfFloat, r32f]) releaseTextureBudget(texture, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("preserves allocated mip counts when downsizing and does not generate extra levels", () => {
    const device = new MockRenderDevice();
    const original = new Texture({ width: 8, height: 4, data: new Uint8Array(128), mipLevelCount: 2, generateMipmaps: true });
    const smaller = applyTextureBudget(original, { maxBytes: 32 }, device);
    expect([smaller.width, smaller.height, smaller.mipLevelCount, smaller.generateMipmaps]).toEqual([4, 2, 1, false]);
    expect(textureBudgetReport(device).textureBytes).toBe(32);
    releaseTextureBudget(smaller, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("does not discard updates to previously uninitialized mip levels during reduction", () => {
    const device = new MockRenderDevice();
    const texture = new Texture({ width: 4, height: 4, data: new Uint8Array(64), mipLevelCount: 3, generateMipmaps: false });
    texture.updateMip(2, new Uint8Array([1, 2, 3, 4]));
    expect(() => applyTextureBudget(texture, { maxBytes: 20 }, device)).toThrow(/cannot be safely downscaled/);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    expect(texture.getMipLevel(2)?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("does not revive a fallback invalidated by a compressed mip edit", () => {
    const device = new MockRenderDevice();
    const texture = new Texture({
      width: 8, height: 8, format: "bc1-rgba-unorm", generateMipmaps: false,
      mipLevels: [{ width: 8, height: 8, data: new Uint8Array(32) }, { width: 4, height: 4, data: new Uint8Array(8) }],
      fallbackMipLevels: [{ width: 8, height: 8, data: new Uint8Array(256) }, { width: 4, height: 4, data: new Uint8Array(64) }]
    });
    texture.updateMip(0, new Uint8Array(32).fill(5));
    const reduced = applyTextureBudget(texture, { maxBytes: 8 }, device);
    expect(reduced.width).toBe(4);
    expect(reduced.fallbackTextureLevels).toEqual([]);
    expect(textureBudgetReport(device).textureBytes).toBe(8);
    releaseTextureBudget(reduced, device);
  });

  it("enforces the tightest live admission limit for later representations and duplicate identities", () => {
    const device = new MockRenderDevice();
    const first = applyTextureBudget(rgba(2), {}, device);
    const second = applyTextureBudget(rgba(1), { maxBytes: 24 }, device);
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    expect(applyTextureBudget(first, { maxBytes: 20 }, device)).toBe(first);
    expect(() => setTextureBudgetResidentBytes(first, 17, device)).toThrow(/exceeds/);
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    expect(() => applyTextureBudget(first, { maxDimension: 1 }, device)).toThrow(/dimensions/);
    releaseTextureBudget(first, device);
    setTextureBudgetResidentBytes(second, 24, device);
    expect(textureBudgetReport(device).textureBytes).toBe(24);
    releaseTextureBudget(second, device);
  });

  it("retains fenced bytes while allowing a new admission under the same identity", () => {
    const device = new MockRenderDevice();
    const original = rgba(2);
    applyTextureBudget(original, { maxBytes: 20 }, device);
    const retired = retireTextureBudget(original, device);
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    const next = applyTextureBudget(original, { maxBytes: 20 }, device);
    expect(next.width).toBe(1);
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    retired();
    retired();
    expect(textureBudgetReport(device).textureBytes).toBe(4);
    releaseTextureBudget(next, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    applyTextureBudget(original, { maxBytes: 20 }, device);
    const afterReset = retireTextureBudget(original, device);
    resetTextureBudgetLedger(device);
    afterReset();
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });
});

/**
 * A small WebGL-shaped resource recorder. It measures bytes actually submitted
 * or generated on each live handle; it is not a hardware or rasterization test.
 */
function webglHarness(maxBytes: number, failAllocation = false) {
  const device = new MockRenderDevice();
  const resources = new Map<object, Map<string, { width: number; height: number; bytes: number; pixels?: number[] }>>();
  let bound: object | undefined;
  let created = 0;
  let deleted = 0;
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_3D: 0x806f, TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515, TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516,
    TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517, TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518,
    TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519, TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
    RGBA: 0x1908, RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, UNSIGNED_BYTE: 0x1401,
    NONE: 0, TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    fenceSync: () => ({}), flush: () => undefined, clientWaitSync: () => 0x911a, deleteSync: () => undefined,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    createTexture: () => {
      if (failAllocation) return null;
      const handle = {};
      created += 1;
      resources.set(handle, new Map());
      return handle;
    },
    deleteTexture: (handle: object) => { if (resources.delete(handle)) deleted += 1; },
    bindTexture: (_target: number, handle: object) => { bound = handle; },
    pixelStorei: () => undefined,
    texParameteri: () => undefined,
    texImage2D: (target: number, level: number, _internal: number, width: number, height: number, _border: number, _format: number, _type: number, data: ArrayBufferView | null) => {
      expect(bound).toBeDefined();
      expect(data === null || data.byteLength === width * height * 4).toBe(true);
      resources.get(bound!)!.set(`${target}:${level}`, {
        width, height, bytes: width * height * 4,
        ...(data instanceof Uint8Array ? { pixels: [...data] } : {})
      });
    },
    texSubImage2D: (target: number, level: number, x: number, y: number, width: number, height: number, _format: number, _type: number, data: Uint8Array) => {
      const mip = resources.get(bound!)!.get(`${target}:${level}`)!;
      const pixels = mip.pixels ?? new Array<number>(mip.bytes).fill(0);
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          for (let channel = 0; channel < 4; channel += 1) {
            pixels[((y + row) * mip.width + x + col) * 4 + channel] = data[(row * width + col) * 4 + channel]!;
          }
        }
      }
      mip.pixels = pixels;
    },
    texStorage3D: (target: number, count: number, _internal: number, width: number, height: number, depth: number) => {
      for (let level = 0; level < count; level += 1) {
        resources.get(bound!)!.set(`${target}:${level}`, { width, height, bytes: width * height * depth * 4 });
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
        if (target === 0x806f) depth = Math.max(1, Math.floor(depth / 2));
      }
    },
    generateMipmap: () => {
      const levels = resources.get(bound!)!;
      let { width, height } = levels.get("3553:0")!;
      let level = 0;
      while (width > 1 || height > 1) {
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
        levels.set(`3553:${++level}`, { width, height, bytes: width * height * 4 });
      }
    },
    getExtension: () => null,
    getParameter: () => 4096
  } as unknown as WebGL2RenderingContext;
  const host = {
    gl,
    device,
    stateCache: { invalidate: () => undefined },
    counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: { maxBytes },
    lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  const residentBytes = () => [...resources.values()].reduce(
    (sum, levels) => sum + [...levels.values()].reduce((total, level) => total + level.bytes, 0), 0
  );
  const basePixels = () => [...resources.values()].map((levels) => levels.get("3553:0")?.pixels);
  return { gl, device, registry: new WebGL2TextureRegistry(host), residentBytes, basePixels, counts: () => ({ created, deleted }) };
}

const drainWebglRetirements = (...registries: WebGL2TextureRegistry[]) =>
  Promise.all(registries.map((registry) => new Promise<void>((resolve) => registry.onNativeRetirementsDrained(resolve))));

describe("texture budget: WebGL upload ownership", () => {
  it("keeps old and attempted resize charges distinct through rollback and ledger reset", () => {
    const device = new MockRenderDevice();
    const texture = new Texture(rgba(2));
    applyTextureBudget(texture, { maxBytes: 48 }, device);
    const resize = beginTextureBudgetResize(texture, 32, device);
    expect(textureBudgetReport(device).textureBytes).toBe(48);
    const retireAttempt = resize.rollback();
    expect(textureBudgetReport(device).textureBytes).toBe(48);
    retireAttempt(); retireAttempt();
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    const next = beginTextureBudgetResize(texture, 32, device);
    resetTextureBudgetLedger(device);
    next.commit()();
    releaseTextureBudget(texture, device);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    device.dispose();
  });

  it("reports the uploaded mip bytes, reuses a downscaled handle, and releases it", async () => {
    const { device, registry, residentBytes, counts } = webglHarness(20);
    const texture = new Texture(rgbaMipChain(4));
    const handle = registry.getTextureHandle(texture);
    expect(registry.getTextureHandle(texture)).toBe(handle);
    expect(counts()).toEqual({ created: 1, deleted: 0 });
    expect(residentBytes()).toBe(20);
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());

    texture.dispose();
    registry.releaseDisposedTextureHandles();
    registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    await drainWebglRetirements(registry);
    expect(counts()).toEqual({ created: 1, deleted: 1 });
    expect(residentBytes()).toBe(0);
    expect(textureBudgetReport(device).textureBytes).toBe(0);

    const reloaded = new Texture(rgbaMipChain(4));
    registry.getTextureHandle(reloaded);
    expect(residentBytes()).toBe(20);
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    reloaded.dispose();
    registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(registry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("reuploads changed original pixels after a budgeted downscale without leaking the old allocation", async () => {
    const { device, registry, residentBytes, basePixels, counts } = webglHarness(16);
    const texture = new Texture(rgba(4));
    registry.getTextureHandle(texture);
    expect(basePixels()[0]).toEqual(Array.from({ length: 4 }, () => [12, 34, 56, 255]).flat());

    texture.update(new Uint8Array(64).fill(240));
    expect(() => registry.getTextureHandle(texture)).toThrow(/cannot fit/);
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    await drainWebglRetirements(registry);
    registry.getTextureHandle(texture);
    expect(basePixels()[0]).toEqual(new Array(16).fill(240));
    expect(counts().created - counts().deleted).toBe(1);
    expect(residentBytes()).toBe(16);
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    texture.dispose();
    registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(registry);
    expect(counts().created).toBe(counts().deleted);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("counts generated mip levels as resident device bytes", async () => {
    const { device, registry, residentBytes } = webglHarness(100);
    const texture = new Texture({ ...rgba(4), generateMipmaps: true });
    registry.getTextureHandle(texture);
    expect(residentBytes()).toBe(84);
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
    texture.dispose();
    registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(device).textureBytes).toBe(84);
    await drainWebglRetirements(registry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("counts allocated but uninitialized mip levels, including array layers", async () => {
    const { device, registry, residentBytes } = webglHarness(252);
    const plain = new Texture({ ...rgba(4), mipLevelCount: 3 });
    const array = new Texture({
      width: 4, height: 4, dimension: "2d-array", layers: 2,
      format: "rgba8", mipLevelCount: 3, generateMipmaps: false
    });
    registry.getTextureHandle(plain);
    expect(residentBytes()).toBe(84);
    expect(textureBudgetReport(device).textureBytes).toBe(84);
    registry.getTextureHandle(array);
    expect(residentBytes()).toBe(252);
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
    plain.dispose();
    array.dispose();
    registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(registry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("counts volume depth reduction and all six cube faces for allocated mip levels", async () => {
    const { device, registry, residentBytes } = webglHarness(772);
    const volume = new Texture({
      width: 4, height: 4, depth: 4, dimension: "3d", format: "rgba8", mipLevelCount: 3
    });
    const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
    const cube = new Texture({
      width: 4, height: 4, dimension: "cube", format: "rgba8", mipLevelCount: 2,
      cubeFaces: faces.map((face) => ({
        face, mipLevels: [{ width: 4, height: 4, data: new Uint8Array(64) }]
      }))
    });
    registry.getTextureHandle(volume);
    expect(residentBytes()).toBe(256 + 32 + 4);
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
    registry.getTextureHandle(cube);
    expect(residentBytes()).toBe(292 + 6 * (64 + 16));
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
    volume.dispose();
    cube.dispose();
    registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(registry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("rejects an array whose allocated levels exceed the remaining budget", () => {
    const { device, registry, residentBytes, counts } = webglHarness(167);
    const array = new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2, mipLevelCount: 3, generateMipmaps: false });
    expect(() => registry.getTextureHandle(array)).toThrow(/cannot fit/);
    expect(residentBytes()).toBe(0);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    expect(counts()).toEqual({ created: 0, deleted: 0 });
  });

  it("does not overspend when generated mip levels exceed the remaining budget", async () => {
    const { device, registry, residentBytes } = webglHarness(64);
    const texture = new Texture({ ...rgba(4), generateMipmaps: true });
    let failure: unknown;
    try {
      registry.getTextureHandle(texture);
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) {
      expect(failure).toMatchObject({ code: "TEXTURE_BUDGET_EXCEEDED" });
      expect(residentBytes()).toBe(0);
      expect(textureBudgetReport(device).textureBytes).toBe(0);
    } else {
      expect(residentBytes()).toBeGreaterThan(0);
      expect(residentBytes()).toBeLessThanOrEqual(64);
      expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
      texture.dispose();
      registry.releaseDisposedTextureHandles();
      await drainWebglRetirements(registry);
      expect(residentBytes()).toBe(0);
      expect(textureBudgetReport(device).textureBytes).toBe(0);
    }
  });

  it("isolates same-name allocations and release between two active device registries", async () => {
    const a = webglHarness(104);
    const b = webglHarness(84);
    const first = new Texture(rgbaMipChain(4));
    const second = new Texture(rgbaMipChain(4));
    a.registry.getTextureHandle(first);
    a.registry.getTextureHandle(second);
    b.registry.getTextureHandle(first);
    expect(a.residentBytes()).toBe(104);
    expect(b.residentBytes()).toBe(84);
    expect(textureBudgetReport(a.device).textureBytes).toBe(a.residentBytes());
    expect(textureBudgetReport(b.device).textureBytes).toBe(b.residentBytes());

    first.dispose();
    a.registry.releaseDisposedTextureHandles();
    b.registry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(a.device).textureBytes).toBe(104);
    expect(textureBudgetReport(b.device).textureBytes).toBe(84);
    await drainWebglRetirements(a.registry, b.registry);
    expect(a.residentBytes()).toBe(20);
    expect(b.residentBytes()).toBe(0);
    expect(textureBudgetReport(a.device).textureBytes).toBe(20);
    expect(textureBudgetReport(b.device).textureBytes).toBe(0);

    const reloaded = new Texture(rgbaMipChain(4));
    a.registry.getTextureHandle(reloaded);
    expect(a.residentBytes()).toBe(104);
    expect(textureBudgetReport(a.device).textureBytes).toBe(104);
    second.dispose();
    reloaded.dispose();
    a.registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(a.registry);
    expect(textureBudgetReport(a.device).textureBytes).toBe(0);
  });

  it("accounts for actual RGBA fallback bytes when the compressed codec is unavailable", async () => {
    const { device, registry, residentBytes } = webglHarness(100);
    const texture = new Texture({
      width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8),
      fallbackData: new Uint8Array(64), generateMipmaps: false
    });
    registry.getTextureHandle(texture);
    expect(residentBytes()).toBe(64);
    expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
    texture.dispose();
    registry.releaseDisposedTextureHandles();
    await drainWebglRetirements(registry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("does not silently exceed the budget when a compressed texture needs a larger fallback", async () => {
    const { device, registry, residentBytes } = webglHarness(16);
    const texture = new Texture({
      width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8),
      fallbackData: new Uint8Array(64), generateMipmaps: false
    });
    let failure: unknown;
    try {
      registry.getTextureHandle(texture);
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) {
      // An unsupported reduction is allowed to fail, but cannot retain bytes.
      expect(failure).toMatchObject({ code: "TEXTURE_BUDGET_EXCEEDED" });
      expect(residentBytes()).toBe(0);
      expect(textureBudgetReport(device).textureBytes).toBe(0);
    } else {
      // A supported reduction must affect the actual resource, not just the report.
      expect(residentBytes()).toBeGreaterThan(0);
      expect(residentBytes()).toBeLessThanOrEqual(16);
      expect(textureBudgetReport(device).textureBytes).toBe(residentBytes());
      texture.dispose();
      registry.releaseDisposedTextureHandles();
      await drainWebglRetirements(registry);
      expect(residentBytes()).toBe(0);
      expect(textureBudgetReport(device).textureBytes).toBe(0);
    }
  });

  it("rolls back residency and the handle when compressed upload has no fallback", () => {
    const { device, registry, residentBytes, counts } = webglHarness(100);
    const texture = new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8) });
    expect(() => registry.getTextureHandle(texture)).toThrow(/no RGBA8 fallback data/i);
    expect(counts()).toEqual({ created: 1, deleted: 1 });
    expect(residentBytes()).toBe(0);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });

  it("does not retain a budget reservation when device allocation fails", () => {
    const { device, registry, residentBytes, counts } = webglHarness(100, true);
    expect(() => registry.getTextureHandle(new Texture(rgbaMipChain(4)))).toThrow(/failed to allocate/i);
    expect(counts()).toEqual({ created: 0, deleted: 0 });
    expect(residentBytes()).toBe(0);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
  });
});

/** Records native descriptors and holds fences until a test explicitly settles them. */
async function webgpuHarness(maxBytes: number, failAllocation = false) {
  const allocated: WebGPUTextureDescriptorLike[] = [];
  let destroyed = 0;
  let finishFence!: () => void;
  let lose!: (info: { reason: string }) => void;
  const fence = new Promise<void>((resolve) => { finishFence = resolve; });
  const lost = new Promise<{ reason: string }>((resolve) => { lose = resolve; });
  const native: WebGPUDeviceLike = {
    lost,
    features: new Set<string>(),
    queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => fence },
    createBuffer: () => ({ destroy() {} }),
    createTexture: (descriptor) => {
      if (failAllocation) throw new Error("allocation failed");
      allocated.push(descriptor);
      return { createView: () => ({}), destroy: () => { destroyed += 1; } };
    }
  };
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) };
  const device = await createRenderDevice({ backend: "webgpu", webgpu: gpu, textureBudgetPolicy: { maxBytes } }) as WebGPUDevice;
  return { device, allocated, finishFence, lose, destroyed: () => destroyed };
}

/** Tracks each attachment and settles each native retirement independently. */
async function webgpuMultisampleBudgetHarness(options: { readonly maxBytes: number; readonly failTextureAt?: number; readonly failViewAt?: number }) {
  const textures: Array<{ descriptor: WebGPUTextureDescriptorLike; destroyed: number }> = [];
  const fences: Array<{ resolve(): void; reject(error: Error): void }> = [];
  let textureCalls = 0;
  let viewCalls = 0;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native: WebGPUDeviceLike = {
    lost,
    features: new Set<string>(),
    queue: {
      writeBuffer() {}, submit() {},
      onSubmittedWorkDone: () => new Promise<void>((resolve, reject) => { fences.push({ resolve, reject }); })
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor) {
      textureCalls += 1;
      if (textureCalls === options.failTextureAt) throw new Error("injected texture allocation failure");
      const record = { descriptor, destroyed: 0 };
      textures.push(record);
      return {
        createView() {
          viewCalls += 1;
          if (viewCalls === options.failViewAt) throw new Error("injected texture view failure");
          return {};
        },
        destroy() { record.destroyed += 1; }
      };
    }
  };
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) };
  const device = await createRenderDevice({ backend: "webgpu", webgpu: gpu, textureBudgetPolicy: { maxBytes: options.maxBytes } }) as WebGPUDevice;
  return { device, textures, fences, lose };
}

describe("texture budget: device option and WebGPU ownership", () => {
  it("keeps telemetry separate from the opt-in admission policy", () => {
    const defaults = normalizeCreateAppRendererOptions(undefined);
    expect(defaults.textureBudgetBytes).toBe(256 * 1024 * 1024);
    expect(defaults.textureBudgetPolicy).toBeUndefined();
    const optedIn = normalizeCreateAppRendererOptions({ textureBudgetBytes: 64, textureBudgetPolicy: { maxBytes: 16, maxDimension: 8 } });
    expect(optedIn.textureBudgetBytes).toBe(64);
    expect(optedIn.textureBudgetPolicy).toEqual({ maxBytes: 16, maxDimension: 8 });
    expect(() => normalizeTextureBudgetPolicy({ maxBytes: -1 })).toThrow(/maxBytes/);
    expect(() => normalizeTextureBudgetPolicy({ maxDimension: 1.5 })).toThrow(/maxDimension/);
  });

  it("accepts a typed drawing path and validates unsupported values", () => {
    const options = { drawingPath: { mode: "deferred", allowFallback: true } } satisfies AuraCreateAppRendererOptions;
    expect(resolveDrawingPathOptions(options)).toEqual({ mode: "deferred", allowFallback: true });
    expect(() => resolveDrawingPathOptions({ drawingPath: { mode: "unknown" } } as unknown as AuraCreateAppRendererOptions)).toThrow(/DRAWING_PATH_OPTION_INVALID/);
  });

  it("passes an explicit policy from backend creation into WebGL texture admission", async () => {
    const { gl, residentBytes } = webglHarness(0);
    Object.assign(gl, { NO_ERROR: 0, getError: () => 0 });
    const canvas = { getContext: () => gl } as unknown as HTMLCanvasElement;
    const device = await createRenderDevice({ backend: "webgl2", canvas, textureBudgetPolicy: { maxBytes: 16 } });
    const host = (device as unknown as { readonly host: WebGL2DeviceHost }).host;
    const texture = new Texture(rgba(4));
    host.textureRegistry.getTextureHandle(texture);
    expect(residentBytes()).toBe(16);
    expect(textureBudgetReport(device).textureBytes).toBe(16);
    expect(device.getDiagnostics().textureBytes).toBe(16);
    texture.dispose();
    host.textureRegistry.releaseDisposedTextureHandles();
    await drainWebglRetirements(host.textureRegistry);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    device.dispose();
  });

  it("holds old residency through a fence and admits a smaller replacement", async () => {
    const { device, allocated, finishFence, destroyed } = await webgpuHarness(24);
    const first = new Texture(rgbaMipChain(4));
    device.getNativeTexture(first);
    expect(allocated[0]).toMatchObject({ size: { width: 2, height: 2 }, mipLevelCount: 2 });
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    first.dispose();
    expect(textureBudgetReport(device).textureBytes).toBe(20);
    expect(device.getDiagnostics().textureBytes).toBe(20);
    const second = new Texture(rgbaMipChain(4));
    device.getNativeTexture(second);
    expect(allocated[1]).toMatchObject({ size: { width: 1, height: 1 }, mipLevelCount: 1 });
    expect(textureBudgetReport(device).textureBytes).toBe(24);
    expect(device.getDiagnostics().textureBytes).toBe(24);
    finishFence();
    await Promise.resolve();
    expect(destroyed()).toBe(1);
    expect(textureBudgetReport(device).textureBytes).toBe(4);
    second.dispose();
    await Promise.resolve();
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    device.dispose();
  });

  it("charges decoded fallback storage and rolls back failed allocations", async () => {
    const makeTexture = () => new Texture({ width: 4, height: 4, format: "bc1-rgba-unorm", data: new Uint8Array(8), fallbackData: new Uint8Array(64), generateMipmaps: false });
    const allowed = await webgpuHarness(64);
    const texture = makeTexture();
    allowed.device.getNativeTexture(texture);
    expect(allowed.allocated[0]).toMatchObject({ format: "rgba8unorm" });
    expect(textureBudgetReport(allowed.device).textureBytes).toBe(64);
    texture.dispose();
    allowed.finishFence();
    await Promise.resolve();
    expect(textureBudgetReport(allowed.device).textureBytes).toBe(0);
    allowed.device.dispose();

    const rejected = await webgpuHarness(16);
    expect(() => rejected.device.getNativeTexture(makeTexture())).toThrow(/exceeds/);
    expect(rejected.allocated).toHaveLength(0);
    expect(textureBudgetReport(rejected.device).textureBytes).toBe(0);
    rejected.device.dispose();

    const failed = await webgpuHarness(64, true);
    expect(() => failed.device.getNativeTexture(new Texture(rgba(4)))).toThrow(/allocation failed/);
    expect(textureBudgetReport(failed.device).textureBytes).toBe(0);
    failed.device.dispose();
  });

  it("charges WebGPU flat data for its allocated levels without inventing mip generation", async () => {
    const { device, allocated, finishFence } = await webgpuHarness(64);
    const texture = new Texture({ ...rgba(4), generateMipmaps: true });
    device.getNativeTexture(texture);
    expect(allocated[0]).toMatchObject({ size: { width: 4, height: 4 }, mipLevelCount: 1 });
    expect(textureBudgetReport(device).textureBytes).toBe(64);
    texture.dispose();
    finishFence();
    await Promise.resolve();
    device.dispose();
  });

  it("rejects an invalidated compressed fallback after downsizing", async () => {
    const { device, allocated } = await webgpuHarness(8);
    const texture = new Texture({
      width: 8, height: 8, format: "bc1-rgba-unorm", generateMipmaps: false,
      mipLevels: [{ width: 8, height: 8, data: new Uint8Array(32) }, { width: 4, height: 4, data: new Uint8Array(8) }],
      fallbackMipLevels: [{ width: 8, height: 8, data: new Uint8Array(256) }, { width: 4, height: 4, data: new Uint8Array(64) }]
    });
    texture.updateMip(0, new Uint8Array(32).fill(5));
    expect(() => device.getNativeTexture(texture)).toThrow(/complete decoded RGBA8 fallback/);
    expect(allocated).toHaveLength(0);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    device.dispose();
  });

  it("releases live and retiring reservations when the device is lost", async () => {
    const { device, lose, destroyed } = await webgpuHarness(128);
    const first = new Texture(rgba(4));
    const second = new Texture(rgba(4));
    device.getNativeTexture(first);
    device.getNativeTexture(second);
    first.dispose();
    expect(textureBudgetReport(device).textureBytes).toBe(128);
    lose({ reason: "destroyed" });
    await Promise.resolve();
    expect(destroyed()).toBe(2);
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    second.dispose();
    device.dispose();
  });
});

describe("WebGPU multisample target budget ownership", () => {
  const colorOnly = { width: 2, height: 2, format: "rgba8" as const, sampleCount: 4, depth: false as const };
  const withDepth = { ...colorOnly, depth: true as const };

  it("admits the resolve and four color samples only when both fit, and retires them independently", async () => {
    const rejected = await webgpuMultisampleBudgetHarness({ maxBytes: 79 });
    expect(() => rejected.device.createRenderTarget(colorOnly)).toThrow(/budget/i);
    expect(rejected.textures).toHaveLength(0);
    expect(textureBudgetReport(rejected.device).textureBytes).toBe(0);
    rejected.device.dispose();

    const f = await webgpuMultisampleBudgetHarness({ maxBytes: 80 });
    const target = f.device.createRenderTarget(colorOnly);
    expect(f.textures.map(({ descriptor }) => descriptor)).toMatchObject([
      { size: [2, 2], format: "rgba8unorm" },
      { size: [2, 2], format: "rgba8unorm", sampleCount: 4 }
    ]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(80);
    expect(f.device.getDiagnostics().textureBytes).toBe(80);
    expect(f.device.getDiagnostics().approximateGpuMemoryBytes).toBe(80);
    target.dispose();
    target.dispose();
    expect(f.fences).toHaveLength(2);
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 0]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(80);
    f.fences[0]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 0]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(64);
    f.fences[1]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(0);
    f.device.dispose();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1]);
  });

  it("accounts for depth separately from both color allocations", async () => {
    const rejected = await webgpuMultisampleBudgetHarness({ maxBytes: 143 });
    expect(() => rejected.device.createRenderTarget(withDepth)).toThrow(/budget/i);
    expect(rejected.textures).toHaveLength(0);
    expect(textureBudgetReport(rejected.device).textureBytes).toBe(0);
    rejected.device.dispose();

    const f = await webgpuMultisampleBudgetHarness({ maxBytes: 144 });
    const target = f.device.createRenderTarget(withDepth);
    expect(f.textures.map(({ descriptor }) => descriptor)).toMatchObject([
      { format: "rgba8unorm" },
      { format: "rgba8unorm", sampleCount: 4 },
      { format: "depth24plus-stencil8", sampleCount: 4 }
    ]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(144);
    expect(f.device.getDiagnostics().approximateGpuMemoryBytes).toBe(144);
    target.dispose();
    expect(f.fences).toHaveLength(3);
    // Disposal retires the resolve, then depth, then multisampled color.
    f.fences[1]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 0, 1]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(80);
    f.fences[2]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 1, 1]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(16);
    f.fences[0]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1, 1]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(0);
    f.device.dispose();
  });

  it("rolls back unregistered allocations immediately when a native allocation fails", async () => {
    for (const failTextureAt of [1, 2, 3]) {
      const f = await webgpuMultisampleBudgetHarness({ maxBytes: 144, failTextureAt });
      expect(() => f.device.createRenderTarget(withDepth)).toThrow("injected texture allocation failure");
      expect(f.textures).toHaveLength(failTextureAt - 1);
      expect(f.textures.map((texture) => texture.destroyed)).toEqual(Array(failTextureAt - 1).fill(1));
      expect(f.fences).toHaveLength(0);
      expect(textureBudgetReport(f.device).textureBytes).toBe(0);
      f.device.dispose();
      expect(f.textures.map((texture) => texture.destroyed)).toEqual(Array(failTextureAt - 1).fill(1));
    }
  });

  it("retains all registered charges on view failure until their individual fences", async () => {
    const f = await webgpuMultisampleBudgetHarness({ maxBytes: 144, failViewAt: 2 });
    expect(() => f.device.createRenderTarget(withDepth)).toThrow("injected texture view failure");
    expect(f.textures).toHaveLength(3);
    expect(f.fences).toHaveLength(3);
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 0, 0]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(144);
    // Failed construction retires resolve, multisampled color, then depth.
    f.fences[1]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 1, 0]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(80);
    f.fences[0]!.resolve();
    f.fences[2]!.resolve();
    await Promise.resolve();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1, 1]);
    expect(textureBudgetReport(f.device).textureBytes).toBe(0);
    f.device.dispose();
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1, 1]);
  });

  it("releases live and retiring attachments exactly once on confirmed device loss", async () => {
    const f = await webgpuMultisampleBudgetHarness({ maxBytes: 160 });
    const retiring = f.device.createRenderTarget(colorOnly);
    const live = f.device.createRenderTarget(colorOnly);
    retiring.dispose();
    expect(f.fences).toHaveLength(2);
    f.fences[0]!.reject(new Error("fence failed"));
    await Promise.resolve();
    expect(textureBudgetReport(f.device).textureBytes).toBe(160);
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([0, 0, 0, 0]);
    f.lose();
    await Promise.resolve();
    expect(textureBudgetReport(f.device).textureBytes).toBe(0);
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1, 1, 1]);
    f.fences[1]!.resolve();
    await Promise.resolve();
    live.dispose();
    f.device.dispose();
    expect(textureBudgetReport(f.device).textureBytes).toBe(0);
    expect(f.textures.map((texture) => texture.destroyed)).toEqual([1, 1, 1, 1]);
  });
});
