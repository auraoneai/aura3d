import { beforeAll, describe, expect, it, vi } from "vitest";
import { rootSdfFontAtlas, text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { ProductionRuntimePrimitiveResource } from "../../../packages/engine/src/agent-api/nodes/types";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createBuiltinGlyphAtlasScope, retainBuiltinGlyphResource, retireBuiltinGlyphResource } from "../../../packages/engine/src/agent-api/compiler/BuiltinGlyphAtlas";
import { createProductionRuntimePrimitiveEntries, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { layoutSdfText, rasterizeSdfTextLabelImage, type SdfFontAtlas } from "../../../packages/rendering/src/SdfText";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPUTextureDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

let font: SdfFontAtlas;
beforeAll(() => { font = rootSdfFontAtlas(); }, 60_000);

function boundTexture(resource: ProductionRuntimePrimitiveResource) {
  return (resource.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
}

// Exercise the mutable text handle and compiler, rather than constructing a
// stand-in texture. Both labels borrow the one scoped, native atlas texture.
function integratedLabels() {
  const scope = createBuiltinGlyphAtlasScope(font);
  const original = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared" })
    .runtime({ id: "label", mutable: true }).toJSON();
  const other = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared" }).toJSON();
  const [entry, otherEntry] = createProductionRuntimePrimitiveEntries([original, other], undefined, scope);
  const handle = createRuntimeNodeHandle(original as never, original.runtime!);
  const registry = { get: (id: string) => id === "label" ? handle : undefined } as never;
  let current = entry!.resources[0]!;
  const second = otherEntry!.resources[0]!;
  const texture = boundTexture(current);
  return {
    scope, texture, second,
    current: () => current,
    setText(text: string) {
      handle.setText(text);
      const state = resolveProductionPrimitiveRuntimeState(entry!, registry);
      current = selectProductionPrimitiveResource(entry!, state.node, [0, 0, 1]);
      return current;
    },
    async close() {
      scope.dispose();
      retireBuiltinGlyphResource(current);
      retireBuiltinGlyphResource(second);
      await scope.whenDisposed();
    }
  };
}

function assertBytes(actual: Uint8Array, expected: Uint8Array) {
  expect(actual.byteLength).toBe(expected.byteLength);
  expect(Buffer.compare(actual, expected)).toBe(0);
}

function atlasPixels(resource: ProductionRuntimePrimitiveResource): Uint8Array {
  const pixels = boundTexture(resource).getMipLevel(0)?.data;
  if (!(pixels instanceof Uint8Array)) throw new Error("Expected RGBA8 atlas pixels");
  return pixels;
}

// Check the pixels at the UVs used by the actual label against a separately
// rasterized glyph, not just against another copy of the atlas buffer.
function assertGlyph(pixels: Uint8Array, resource: ProductionRuntimePrimitiveResource, quad: number, glyph: string) {
  const texture = boundTexture(resource);
  const expected = rasterizeSdfTextLabelImage(layoutSdfText(glyph, font), font, { texelsPerWorldUnit: 64 });
  const [u, v] = resource.geometry.vertexBuffer.getAttribute(quad * 4, "uv");
  const x = Math.round(u! * texture.width), y = Math.round(v! * texture.height);
  const actual = new Uint8Array(expected.width * expected.height * 4);
  for (let row = 0; row < expected.height; row += 1) {
    const start = ((y + row) * texture.width + x) * 4;
    actual.set(pixels.subarray(start, start + expected.width * 4), row * expected.width * 4);
  }
  assertBytes(actual, expected.data);
}

type GlTexture = { id: number; width: number; height: number; pixels: Uint8Array };
type GlWrite = { x: number; y: number; width: number; height: number; pixels: Uint8Array };

// The fake records calls and applies their bytes to an in-memory native image;
// it makes no claim about a real WebGL implementation or rendered pixels.
function webglFixture() {
  const state = new Map<number, number>([[0x9240, 1], [0x9241, 1], [0x9243, 0x9244], [0x0cf5, 8], [0x0cf2, 3], [0x806e, 5], [0x0cf4, 1], [0x0cf3, 2], [0x806d, 4]]);
  const writes: GlWrite[] = [];
  const deleted: GlTexture[] = [];
  const fence = { signaled: true };
  let next = 0;
  let bound: GlTexture | null = null;
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_3D: 0x806f, TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515, TEXTURE_CUBE_MAP_NEGATIVE_X: 0x8516,
    TEXTURE_CUBE_MAP_POSITIVE_Y: 0x8517, TEXTURE_CUBE_MAP_NEGATIVE_Y: 0x8518,
    TEXTURE_CUBE_MAP_POSITIVE_Z: 0x8519, TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
    RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, RGBA: 0x1908, RGBA16F: 0x881a, RGBA32F: 0x8814,
    R32F: 0x822e, RED: 0x1903, FLOAT: 0x1406, HALF_FLOAT: 0x140b, UNSIGNED_BYTE: 0x1401,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, TEXTURE_WRAP_R: 0x8072, NEAREST: 0x2600, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    UNPACK_ALIGNMENT: 0x0cf5, UNPACK_ROW_LENGTH: 0x0cf2, UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4, UNPACK_SKIP_ROWS: 0x0cf3, UNPACK_SKIP_IMAGES: 0x806d, NONE: 0,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    fenceSync: () => ({}), flush: () => undefined, clientWaitSync: () => fence.signaled ? 0x911a : 0x911b, deleteSync: () => undefined,
    createTexture: (): GlTexture => ({ id: ++next, width: 0, height: 0, pixels: new Uint8Array() }),
    deleteTexture: (texture: GlTexture) => { deleted.push(texture); },
    bindTexture: (_target: number, texture: GlTexture | null) => { bound = texture; },
    getParameter: (key: number) => state.get(key) ?? 0, getExtension: () => null,
    pixelStorei: (key: number, value: number) => { state.set(key, value); },
    texParameteri: () => undefined,
    texStorage2D: (_target: number, _levels: number, _format: number, width: number, height: number) => {
      if (!bound) throw new Error("No bound texture");
      bound.width = width; bound.height = height; bound.pixels = new Uint8Array(width * height * 4);
    },
    texSubImage2D: (_target: number, _level: number, x: number, y: number, width: number, height: number,
      _format: number, _type: number, data: Uint8Array) => {
      if (!bound) throw new Error("No bound texture");
      const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
      writes.push({ x, y, width, height, pixels });
      for (let row = 0; row < height; row += 1) {
        bound.pixels.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), ((y + row) * bound.width + x) * 4);
      }
    }
  };
  const counters = { releasedTextureHandles: 0, textureBindCount: 0, samplerParameterUploadCount: 0, nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0 };
  const stateCache = {
    invalidate() {},
    activeTexture: (_unit: number, call: () => void) => call(),
    bindTexture: (_target: number, _handle: unknown, call: () => void) => call(),
    bindSampler: (_unit: number, _handle: unknown, call: () => void) => call()
  };
  const host = { gl, stateCache, counters, lifecycle: { readError: () => null }, device: {} } as unknown as WebGL2DeviceHost;
  const registry = new WebGL2TextureRegistry(host);
  host.textureRegistry = registry;
  return { registry, writes, deleted, fence };
}

type GpuWrite = {
  destination: { texture: unknown; mipLevel?: number };
  pixels: Uint8Array;
  layout: { bytesPerRow?: number; rowsPerImage?: number };
  size: { width: number; height: number; depthOrArrayLayers?: number };
};

async function webgpuFixture(onSubmittedWorkDone: () => Promise<void> = async () => undefined) {
  const writes: GpuWrite[] = [];
  const destroyed: object[] = [];
  const native = {
    features: new Set<string>(),
    limits: { maxTextureDimension2D: 8192, maxTextureArrayLayers: 256 },
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture(destination: GpuWrite["destination"], data: ArrayBufferView, layout: GpuWrite["layout"], size: GpuWrite["size"]) {
        writes.push({ destination, pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(), layout, size });
      },
      onSubmittedWorkDone
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: WebGPUTextureDescriptorLike) {
      const texture = { descriptor, createView: () => ({}), destroy(): void { destroyed.push(texture); } };
      return texture;
    }
  } as unknown as WebGPUDeviceLike;
  const adapter = { features: new Set<string>(), requestDevice: async () => native };
  const device = await WebGPUDevice.create({ adapter, device: native });
  return { device, writes, destroyed };
}

function deferredFence() {
  let signal!: () => void;
  const promise = new Promise<void>((resolve) => { signal = resolve; });
  return { promise, signal };
}

function holdAtlasAndFrames(labels: ReturnType<typeof integratedLabels>) {
  const atlasLease = labels.scope.acquire("B");
  labels.scope.flush();
  const first = retainBuiltinGlyphResource(labels.current());
  const second = retainBuiltinGlyphResource(labels.current());
  const other = retainBuiltinGlyphResource(labels.second);
  if (!first || !second || !other) throw new Error("Expected frame-retained atlas resources");
  return { atlasLease, first, second, other };
}

describe("built-in text atlas backend uploads (device mocks)", () => {
  it("shares a WebGL handle and refreshes a region or the full image according to observed revisions", async () => {
    const labels = integratedLabels();
    const gl = webglFixture();
    try {
      expect(boundTexture(labels.second)).toBe(labels.texture);
      const native = gl.registry.getTextureHandle(labels.texture);
      expect(gl.registry.getTextureHandle(boundTexture(labels.second))).toBe(native);
      const image = native as unknown as GlTexture;
      expect(gl.writes).toHaveLength(1);
      expect(gl.writes[0]).toMatchObject({ x: 0, y: 0, width: 512, height: 512 });
      assertBytes(image.pixels, atlasPixels(labels.current()));
      assertGlyph(image.pixels, labels.current(), 0, "A");

      const previousRevision = labels.texture.revision;
      const ab = labels.setText("AB");
      expect(boundTexture(ab)).toBe(labels.texture);
      expect(labels.texture.revision).toBe(previousRevision + 1);
      const region = labels.texture.pendingUpdateRegion;
      expect(region).not.toBeNull();
      expect(region!.width * region!.height).toBeLessThan(512 * 512);
      expect(gl.registry.getTextureHandle(boundTexture(ab))).toBe(native);
      expect(gl.writes).toHaveLength(2);
      expect(gl.writes[1]).toMatchObject({ x: region!.x, y: region!.y, width: region!.width, height: region!.height });
      assertBytes(image.pixels, atlasPixels(ab));
      assertGlyph(image.pixels, ab, 0, "A");
      assertGlyph(image.pixels, ab, 1, "B");

      const observed = labels.texture.revision;
      labels.setText("ABC");
      const abcd = labels.setText("ABCD");
      expect(labels.texture.revision).toBe(observed + 2);
      expect(gl.registry.getTextureHandle(boundTexture(abcd))).toBe(native);
      expect(gl.writes).toHaveLength(3);
      expect(gl.writes[2]).toMatchObject({ x: 0, y: 0, width: 512, height: 512 });
      assertBytes(gl.writes[2]!.pixels, atlasPixels(abcd));
      assertBytes(image.pixels, atlasPixels(abcd));
      for (const [quad, glyph] of [..."ABCD"].entries()) assertGlyph(image.pixels, abcd, quad, glyph);
    } finally {
      await labels.close();
      gl.registry.releaseDisposedTextureHandles();
    }
  });

  it("shares a WebGPU handle and writes the complete updated mip with the correct glyph pixels", async () => {
    const labels = integratedLabels();
    const gpu = await webgpuFixture();
    try {
      expect(boundTexture(labels.second)).toBe(labels.texture);
      const native = gpu.device.getNativeTexture(labels.texture);
      expect(gpu.device.getNativeTexture(boundTexture(labels.second))).toBe(native);
      const initial = gpu.writes.filter((write) => write.destination.texture === native);
      expect(initial).toHaveLength(1);
      assertBytes(initial[0]!.pixels, atlasPixels(labels.current()));
      assertGlyph(initial[0]!.pixels, labels.current(), 0, "A");

      const ab = labels.setText("AB");
      expect(boundTexture(ab)).toBe(labels.texture);
      expect(gpu.device.getNativeTexture(boundTexture(ab))).toBe(native);
      const writes = gpu.writes.filter((write) => write.destination.texture === native);
      expect(writes).toHaveLength(2);
      expect(writes[1]!.destination.mipLevel).toBe(0);
      expect(writes[1]!.layout).toEqual({ bytesPerRow: 512 * 4, rowsPerImage: 512 });
      expect(writes[1]!.size).toEqual({ width: 512, height: 512, depthOrArrayLayers: 1 });
      assertBytes(writes[1]!.pixels, atlasPixels(ab));
      assertGlyph(writes[1]!.pixels, ab, 0, "A");
      assertGlyph(writes[1]!.pixels, ab, 1, "B");
    } finally {
      await labels.close();
      gpu.device.dispose();
    }
  });

  it("retires the WebGL atlas handle once after every frame and glyph lease and the device fence", async () => {
    const labels = integratedLabels(), gl = webglFixture(), held = holdAtlasAndFrames(labels);
    const native = gl.registry.getTextureHandle(labels.texture);
    gl.fence.signaled = false;
    vi.useFakeTimers();
    try {
      const closing = labels.close();
      await Promise.resolve();
      expect(labels.texture.disposed).toBe(false);
      expect(gl.registry.textures.get(labels.texture)).toBe(native);
      expect(gl.deleted).toEqual([]);

      held.first(); held.first(); held.other();
      expect(labels.texture.disposed).toBe(false);
      expect(gl.registry.textures.get(labels.texture)).toBe(native);
      held.second();
      // The explicit atlas lease still owns a glyph after both frame owners retire.
      expect(labels.texture.disposed).toBe(false);
      expect(gl.registry.textures.get(labels.texture)).toBe(native);
      expect(gl.deleted).toEqual([]);

      held.atlasLease.release();
      await closing;
      expect(labels.texture.disposed).toBe(true);
      let drained = false;
      gl.registry.onNativeRetirementsDrained(() => { drained = true; });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(gl.deleted).toEqual([]);
      expect(drained).toBe(false);
      gl.fence.signaled = true;
      await vi.advanceTimersByTimeAsync(8);
      expect(drained).toBe(true);
      expect(gl.deleted).toEqual([native]);

      held.atlasLease.release(); held.second(); held.other();
      await labels.close();
      gl.registry.releaseDisposedTextureHandles();
      gl.registry.disposeTextureHandles();
      await vi.runAllTimersAsync();
      expect(gl.deleted).toEqual([native]);
    } finally {
      held.first(); held.second(); held.other(); held.atlasLease.release();
      await labels.close();
      gl.fence.signaled = true;
      await Promise.resolve();
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    }
  });

  it("retires the WebGPU atlas handle once after every frame and glyph lease and the queue fence", async () => {
    const labels = integratedLabels(), fence = deferredFence(), held = holdAtlasAndFrames(labels);
    const gpu = await webgpuFixture(() => fence.promise);
    const native = gpu.device.getNativeTexture(labels.texture);
    try {
      const closing = labels.close();
      await Promise.resolve();
      expect(labels.texture.disposed).toBe(false);
      expect(() => gpu.device.resourceInterop.assertUsable(native)).not.toThrow();
      expect(gpu.destroyed).not.toContain(native);

      held.first(); held.first(); held.other();
      expect(labels.texture.disposed).toBe(false);
      expect(() => gpu.device.resourceInterop.assertUsable(native)).not.toThrow();
      held.second();
      expect(labels.texture.disposed).toBe(false);
      expect(() => gpu.device.resourceInterop.assertUsable(native)).not.toThrow();
      expect(gpu.destroyed).not.toContain(native);

      held.atlasLease.release();
      await closing;
      expect(labels.texture.disposed).toBe(true);
      expect(() => gpu.device.resourceInterop.assertUsable(native)).toThrow(/RETIRED/);
      const retirement = gpu.device.resourceInterop.retire(native);
      await Promise.resolve();
      expect(gpu.destroyed).not.toContain(native);
      fence.signal();
      await retirement;
      expect(gpu.destroyed.filter((texture) => texture === native)).toEqual([native]);

      held.atlasLease.release(); held.second(); held.other();
      await labels.close();
      gpu.device.dispose(); gpu.device.dispose();
      await Promise.resolve();
      expect(gpu.destroyed.filter((texture) => texture === native)).toEqual([native]);
    } finally {
      held.first(); held.second(); held.other(); held.atlasLease.release();
      await labels.close();
      fence.signal();
      gpu.device.dispose();
    }
  });
});
