/**
 * three.js `DataTexture` parity: `texture.data({ data })` keeps the caller's
 * typed array by reference, so the canonical dynamic-texture loop
 * (mutate `data` in place -> `handle.needsUpdate = true`) re-uploads the NEW
 * bytes on both backends. Regression for Splat Turf, whose paint splat map was
 * written into its own array while the device kept re-uploading a construction
 * snapshot (paint never reached the GPU although coverage hit 100%).
 */

import { describe, expect, it } from "vitest";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { auraTextureRefTexture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

function mockGl() {
  const uploads: { name: string; bytes: number[] }[] = [];
  const noop = () => undefined;
  const capture = (name: string, dataIndex: number) => (...params: unknown[]) => {
    const data = params[dataIndex] as ArrayBufferView | null | undefined;
    if (data && ArrayBuffer.isView(data)) uploads.push({ name, bytes: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) });
  };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_CUBE_MAP: 0x8513,
    RGBA32F: 0x8814, RGBA16F: 0x881a, RGBA8: 0x8058, RGBA: 0x1908, FLOAT: 0x1406, HALF_FLOAT: 0x140b, UNSIGNED_BYTE: 0x1401,
    NONE: 0, TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, NEAREST: 0x2600, LINEAR: 0x2601, SRGB: 0x8c42, SRGB8_ALPHA8: 0x8c43,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    BROWSER_DEFAULT_WEBGL: 0x9244, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    createTexture: () => ({}), deleteTexture: noop, fenceSync: () => ({}), clientWaitSync: () => 0x911b, deleteSync: noop,
    flush: noop, bindTexture: noop, pixelStorei: noop, texParameteri: noop, generateMipmap: noop, compressedTexImage2D: noop,
    texStorage2D: noop, texStorage3D: noop, texImage3D: noop, texSubImage3D: noop,
    texImage2D: capture("texImage2D", 8),
    texSubImage2D: capture("texSubImage2D", 8),
    getExtension: () => null,
    getParameter: () => 4096
  };
  return { gl: gl as unknown as WebGL2RenderingContext, uploads };
}

function registryFor(gl: WebGL2RenderingContext) {
  const host = {
    gl, device: {}, stateCache: { invalidate: () => undefined }, counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined, lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return new WebGL2TextureRegistry(host);
}

async function mockWebGpu() {
  const writes: number[][] = [];
  const native = {
    lost: new Promise(() => undefined),
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture(_destination: unknown, data: ArrayBufferView) {
        writes.push(Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      },
      onSubmittedWorkDone: () => Promise.resolve()
    },
    createBuffer: () => ({ destroy() {} }),
    createSampler: () => ({}), createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (group: unknown) => group,
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
    createTexture(descriptor: object) {
      const created = { ...descriptor, destroy() {}, createView() { return { texture: created }; } };
      return created;
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, writes };
}

/** A 2x2 RGBA8 map: transparent "base", then one texel painted saturated red, like a splat-map cell write. */
function paintedPixels(): { pixels: Uint8Array; paint(): void } {
  const pixels = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([247, 244, 236, 0], i);
  return { pixels, paint: () => pixels.set([230, 20, 60, 255], 4) };
}

describe("texture.data in-place pixel updates reach the GPU (DataTexture parity)", () => {
  it("retains the caller's array so in-place writes are what the device uploads", () => {
    const { pixels, paint } = paintedPixels();
    const handle = texture.data({ width: 2, height: 2, data: pixels, colorSpace: "srgb" });
    const backing = auraTextureRefTexture(handle)!;
    paint();
    expect(Array.from(backing.getMipLevel(0)!.data as Uint8Array)).toEqual(Array.from(pixels));
  });

  it("WebGL2: mutate + needsUpdate re-uploads the painted bytes via texSubImage2D", () => {
    const { gl, uploads } = mockGl();
    const registry = registryFor(gl);
    const { pixels, paint } = paintedPixels();
    const handle = texture.data({ width: 2, height: 2, data: pixels, colorSpace: "srgb" });
    const backing = auraTextureRefTexture(handle)!;
    const glHandle = registry.getTextureHandle(backing);
    const firstUploads = uploads.length;
    expect(firstUploads).toBeGreaterThan(0);
    expect(uploads.at(-1)!.bytes.slice(4, 8)).toEqual([247, 244, 236, 0]);

    paint();
    handle.needsUpdate = true;
    expect(registry.getTextureHandle(backing)).toBe(glHandle);
    expect(uploads.length).toBe(firstUploads + 1);
    expect(uploads.at(-1)!.bytes.slice(4, 8)).toEqual([230, 20, 60, 255]);
    expect(handle.needsUpdate).toBe(false);
  });

  it("WebGPU: mutate + needsUpdate re-uploads the painted bytes via queue.writeTexture", async () => {
    const { device, writes } = await mockWebGpu();
    const { pixels, paint } = paintedPixels();
    const handle = texture.data({ width: 2, height: 2, data: pixels, colorSpace: "srgb" });
    const backing = auraTextureRefTexture(handle)!;
    const native = device.getNativeTexture(backing);
    const firstWrites = writes.length;
    expect(firstWrites).toBeGreaterThan(0);
    expect(writes.at(-1)!.slice(4, 8)).toEqual([247, 244, 236, 0]);

    paint();
    handle.needsUpdate = true;
    expect(device.getNativeTexture(backing)).toBe(native);
    expect(writes.length).toBe(firstWrites + 1);
    expect(writes.at(-1)!.slice(4, 8)).toEqual([230, 20, 60, 255]);
    expect(handle.needsUpdate).toBe(false);
  });
});
