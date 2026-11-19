/**
 * Splat Turf core mechanic: painting N grid cells through `createTurfSplatSurface` must change the splat-map
 * bytes the GPU receives (WebGL2 texSubImage2D and WebGPU queue.writeTexture), with saturated, opaque team colours
 * at exactly the painted cells. Regression for "coverage reaches 100% but no paint ever appears on the road".
 */

import { describe, expect, it } from "vitest";
import { auraTextureRefTexture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { SPLAT_TEXELS_PER_COL, SPLAT_TEXELS_PER_ROW, createTurfSplatSurface } from "../../../apps/showcase-splat-turf/src/art/wet-ink.js";
import { LOOK, hexToRgba8 } from "../../../apps/showcase-splat-turf/src/look.js";

const ROWS = 40;
const COLS = 6;
const WIDTH = COLS * SPLAT_TEXELS_PER_COL;
const PAINT = LOOK.paintColors.map((hex) => hexToRgba8(hex, 255));
/** Cells a kart drives over: a diagonal weave across all six lanes. */
const PAINTED: readonly (readonly [number, number])[] = Array.from({ length: 24 }, (_, i) => [3 + i, i % COLS] as const);

function centreTexel(bytes: readonly number[] | Uint8Array, row: number, col: number): number[] {
  const x = col * SPLAT_TEXELS_PER_COL + SPLAT_TEXELS_PER_COL / 2;
  const y = row * SPLAT_TEXELS_PER_ROW;
  const i = (y * WIDTH + x) * 4;
  return Array.from(bytes.slice(i, i + 4));
}

function paintAll(surface: ReturnType<typeof createTurfSplatSurface>): void {
  PAINTED.forEach(([r, c], i) => surface.writeCell(r, c, 1, PAINT[i % PAINT.length]!));
  surface.flush();
}

function expectPainted(bytes: readonly number[] | Uint8Array): void {
  PAINTED.forEach(([r, c], i) => {
    const [red, green, blue, alpha] = centreTexel(bytes, r, c);
    expect([red, green, blue]).toEqual(PAINT[i % PAINT.length]!.slice(0, 3));
    expect(alpha).toBe(255);
  });
  // Unpainted gesso stays transparent so the shader shows the dry deck there.
  expect(centreTexel(bytes, 0, 0)[3]).toBe(0);
  expect(centreTexel(bytes, ROWS - 1, 5)[3]).toBe(0);
}

function webgl2(): { registry: WebGL2TextureRegistry; uploads: number[][] } {
  const uploads: number[][] = [];
  const noop = () => undefined;
  const capture = (...params: unknown[]) => {
    const data = params[8];
    if (ArrayBuffer.isView(data)) uploads.push(Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
  };
  const gl = {
    TEXTURE_2D: 0x0de1, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_CUBE_MAP: 0x8513, RGBA8: 0x8058, RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401, FLOAT: 0x1406, HALF_FLOAT: 0x140b, RGBA32F: 0x8814, RGBA16F: 0x881a, NONE: 0,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, NEAREST: 0x2600, LINEAR: 0x2601, SRGB: 0x8c42, SRGB8_ALPHA8: 0x8c43,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    BROWSER_DEFAULT_WEBGL: 0x9244, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a, TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    createTexture: () => ({}), deleteTexture: noop, fenceSync: () => ({}), clientWaitSync: () => 0x911b, deleteSync: noop,
    flush: noop, bindTexture: noop, pixelStorei: noop, texParameteri: noop, generateMipmap: noop, compressedTexImage2D: noop,
    texStorage2D: noop, texStorage3D: noop, texImage3D: noop, texSubImage3D: noop,
    texImage2D: capture, texSubImage2D: capture, getExtension: () => null, getParameter: () => 4096
  };
  const host = {
    gl, device: {}, stateCache: { invalidate: () => undefined }, counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined, lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return { registry: new WebGL2TextureRegistry(host), uploads };
}

async function webgpu(): Promise<{ device: WebGPUDevice; writes: number[][]; formats: string[] }> {
  const writes: number[][] = [];
  const formats: string[] = [];
  const native = {
    lost: new Promise(() => undefined),
    queue: {
      submit() {}, writeBuffer() {},
      writeTexture(_d: unknown, data: ArrayBufferView) { writes.push(Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))); },
      onSubmittedWorkDone: () => Promise.resolve()
    },
    createBuffer: () => ({ destroy() {} }), createSampler: () => ({}), createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (group: unknown) => group,
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
    createTexture(descriptor: { format: string }) {
      formats.push(descriptor.format);
      const created = { ...descriptor, destroy() {}, createView() { return { texture: created }; } };
      return created;
    },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, writes, formats };
}

describe("Splat Turf wet-ink splat map reaches the GPU", () => {
  it("is a raw-byte (linear) texture: the shader decodes sRGB itself, so the hardware must not decode twice", () => {
    const surface = createTurfSplatSurface(ROWS, COLS);
    expect(surface.texture.colorSpace).toBe("linear");
  });

  it("WebGL2: painting N cells re-uploads the saturated team colours at those cells", () => {
    const { registry, uploads } = webgl2();
    const surface = createTurfSplatSurface(ROWS, COLS);
    const backing = auraTextureRefTexture(surface.texture)!;
    surface.flush();
    registry.getTextureHandle(backing);
    expect(centreTexel(uploads.at(-1)!, 3, 0)[3]).toBe(0);
    const before = uploads.length;

    paintAll(surface);
    registry.getTextureHandle(backing);
    expect(uploads.length).toBe(before + 1);
    expectPainted(uploads.at(-1)!);

    // Nothing changed -> no redundant re-upload.
    surface.flush();
    registry.getTextureHandle(backing);
    expect(uploads.length).toBe(before + 1);
  });

  it("WebGPU: painting N cells re-uploads the saturated team colours at those cells", async () => {
    const { device, writes, formats } = await webgpu();
    const surface = createTurfSplatSurface(ROWS, COLS);
    const backing = auraTextureRefTexture(surface.texture)!;
    surface.flush();
    device.getNativeTexture(backing);
    expect(formats).toContain("rgba8unorm");
    const before = writes.length;

    paintAll(surface);
    device.getNativeTexture(backing);
    expect(writes.length).toBe(before + 1);
    expectPainted(writes.at(-1)!);
  });
});
