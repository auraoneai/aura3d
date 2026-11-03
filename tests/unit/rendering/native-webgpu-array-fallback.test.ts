import { describe, expect, it } from "vitest";
import { Texture, type TextureCompressedFormat, type TextureCubeFace } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPUTextureDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";

type MockTexture = {
  readonly descriptor: WebGPUTextureDescriptorLike;
  readonly views: unknown[];
  destroyed: number;
  createView(descriptor?: unknown): unknown;
  destroy(): void;
};

type Write = {
  readonly destination: { readonly texture: MockTexture; readonly mipLevel?: number; readonly origin?: { readonly x?: number; readonly y?: number; readonly z?: number } };
  readonly bytes: number[];
  readonly layout: { readonly bytesPerRow?: number; readonly rowsPerImage?: number };
  readonly size: { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number };
};

// Mock calls and fences expose upload ordering and ownership, not GPU rendering.
async function fixture(options: {
  readonly features?: readonly string[];
  readonly adapterFeatures?: readonly string[];
  readonly maxBytes?: number;
  readonly limits?: Readonly<Record<string, number>>;
} = {}) {
  const textures: MockTexture[] = [];
  const writes: Write[] = [];
  const events: string[] = [];
  const fences: Array<() => void> = [];
  let inWrite = false;
  let failView = false;
  let onWrite: (() => void) | undefined;
  const native = {
    features: new Set(options.features ?? []),
    limits: options.limits ?? { maxTextureDimension2D: 8192, maxTextureArrayLayers: 256 },
    queue: {
      submit() {},
      writeBuffer() {},
      writeTexture(destination: Write["destination"], data: ArrayBufferView, layout: Write["layout"], size: Write["size"]) {
        inWrite = true;
        events.push("write-start");
        writes.push({ destination, bytes: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)), layout, size });
        try { onWrite?.(); } finally { inWrite = false; events.push("write-end"); }
      },
      onSubmittedWorkDone() {
        events.push(inWrite ? "fence-during-write" : "fence-after-write");
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer: () => ({ destroy() {} }),
    createTexture(descriptor: WebGPUTextureDescriptorLike): MockTexture {
      const texture: MockTexture = {
        descriptor, views: [], destroyed: 0,
        createView(view?: unknown) {
          if (failView) throw new Error("injected view failure");
          this.views.push(view);
          return { texture, descriptor: view };
        },
        destroy() { this.destroyed += 1; }
      };
      textures.push(texture);
      return texture;
    }
  } as unknown as WebGPUDeviceLike;
  const adapter = { features: new Set(options.adapterFeatures ?? options.features ?? []), requestDevice: async () => native };
  const device = await WebGPUDevice.create({ adapter, device: native,
    ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const finishFences = async () => {
    for (const resolve of fences.splice(0)) resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { device, textures, writes, events, finishFences,
    onWrite(callback?: () => void) { onWrite = callback; },
    failView(value: boolean) { failView = value; },
    async close() { onWrite = undefined; if (!device.disposed) device.dispose(); await finishFences(); } };
}

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) { output.set(value, offset); offset += value.length; }
  return output;
}

function errorFrom(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the operation to fail");
}

// Constant-color BC1 blocks and matching RGBA pixels, independently specified.
function bc1Solid(color565: number): Uint8Array {
  return Uint8Array.of(color565 & 255, color565 >>> 8, color565 & 255, color565 >>> 8, 0, 0, 0, 0);
}
function solidPixels(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < bytes.length; offset += 4) bytes.set(rgba, offset);
  return bytes;
}

function arraySource(options: {
  readonly format?: TextureCompressedFormat;
  readonly colorSpace?: "linear" | "srgb";
  readonly count?: 1 | 2;
  readonly fallbacks?: 0 | 1 | 2;
  readonly fallbackAsData?: boolean;
} = {}) {
  const count = options.count ?? 2;
  const compressed = [
    { width: 4, height: 4, data: concat(bc1Solid(0xf800), bc1Solid(0x07e0)) },
    { width: 2, height: 2, data: concat(bc1Solid(0x001f), bc1Solid(0xffff)) }
  ].slice(0, count);
  const decoded = [
    { width: 4, height: 4, data: concat(solidPixels(4, 4, [255, 0, 0, 255]), solidPixels(4, 4, [0, 255, 0, 255])) },
    { width: 2, height: 2, data: concat(solidPixels(2, 2, [0, 0, 255, 255]), solidPixels(2, 2, [255, 255, 255, 255])) }
  ].slice(0, options.fallbacks ?? count);
  if (options.fallbackAsData && (count !== 1 || decoded.length !== 1)) throw new Error("Single-level fallback data requires one complete mip");
  const texture = new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2,
    format: options.format ?? "bc1-rgb-unorm", colorSpace: options.colorSpace ?? "linear", generateMipmaps: false,
    mipLevels: compressed, mipLevelCount: count, ...(options.fallbackAsData ? { fallbackData: decoded[0]!.data }
      : decoded.length ? { fallbackMipLevels: decoded } : {}) });
  return { texture, compressed, decoded };
}

describe("WebGPU compressed 2D-array fallback", () => {
  it.each(["linear", "srgb"] as const)("uploads every mip and layer as caller-supplied %s RGBA8", async (colorSpace) => {
    const f = await fixture();
    const { texture, decoded } = arraySource({ colorSpace });
    const expected = decoded.map((level) => Array.from(level.data));
    // Construction snapshots the caller's bytes, including all array layers.
    decoded[0]!.data.fill(0);
    try {
      const native = f.device.getNativeTexture(texture);
      expect(native).toBe(f.textures[0]);
      expect(f.textures[0]!.descriptor).toMatchObject({
        size: { width: 4, height: 4, depthOrArrayLayers: 2 },
        format: colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm", mipLevelCount: 2
      });
      expect(f.textures[0]!.views).toEqual([{ dimension: "2d-array" }]);
      expect(f.writes).toHaveLength(2);
      expect(f.writes.map((write) => ({ mip: write.destination.mipLevel, z: write.destination.origin?.z ?? 0,
        layout: write.layout, size: write.size }))).toEqual([
        { mip: 0, z: 0, layout: { bytesPerRow: 16, rowsPerImage: 4 }, size: { width: 4, height: 4, depthOrArrayLayers: 2 } },
        { mip: 1, z: 0, layout: { bytesPerRow: 8, rowsPerImage: 2 }, size: { width: 2, height: 2, depthOrArrayLayers: 2 } }
      ]);
      expect(f.writes.map((write) => write.bytes)).toEqual(expected);
      expect(f.device.getDiagnostics()).toMatchObject({ textureBytes: 160, textureFallbacks: 1, textureFallbackBytes: 160, compressedTextures: 0 });
      expect(f.device.getNativeTexture(texture)).toBe(native);
      expect(f.writes).toHaveLength(2);
    } finally { texture.dispose(); await f.close(); }
  });

  it("selects compression from the enabled device features, keeping opaque BC1 RGB on fallback", async () => {
    const disabled = await fixture({ adapterFeatures: ["texture-compression-bc"] });
    const enabled = await fixture({ features: ["texture-compression-bc"] });
    const rgba = arraySource({ format: "bc1-rgba-unorm", count: 1, fallbackAsData: true });
    const rgb = arraySource({ count: 1 });
    try {
      disabled.device.getNativeTexture(rgba.texture);
      enabled.device.getNativeTexture(rgba.texture);
      enabled.device.getNativeTexture(rgb.texture);
      expect(disabled.textures[0]!.descriptor.format).toBe("rgba8unorm");
      expect(disabled.writes[0]!.bytes).toEqual(Array.from(rgba.decoded[0]!.data));
      expect(enabled.textures[0]!.descriptor.format).toBe("bc1-rgba-unorm");
      expect(enabled.writes[0]!.bytes).toEqual(Array.from(rgba.compressed[0]!.data));
      expect(enabled.writes[0]!.size.depthOrArrayLayers).toBe(2);
      expect(enabled.textures[1]!.descriptor.format).toBe("rgba8unorm");
      expect(enabled.writes[1]!.bytes).toEqual(Array.from(rgb.decoded[0]!.data));
      expect(disabled.device.getDiagnostics()).toMatchObject({ textureBytes: 128, textureFallbacks: 1, compressedTextures: 0 });
      expect(enabled.device.getDiagnostics()).toMatchObject({ textureBytes: 144, textureFallbacks: 1, compressedTextures: 1 });
    } finally { rgba.texture.dispose(); rgb.texture.dispose(); await disabled.close(); await enabled.close(); }
  });

  it("rejects missing, incomplete, malformed and cube fallbacks without allocating a GPU texture", async () => {
    const f = await fixture();
    const missing = arraySource({ format: "bc1-rgba-unorm", fallbacks: 0 });
    const incomplete = arraySource({ format: "bc1-rgba-unorm", fallbacks: 1 });
    const faces: TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
    const cube = new Texture({ width: 4, height: 4, dimension: "cube", format: "bc1-rgba-unorm", generateMipmaps: false,
      cubeFaces: faces.map((face) => ({ face, mipLevels: [{ width: 4, height: 4, data: bc1Solid(0xf800) }] })) });
    try {
      expect(errorFrom(() => f.device.getNativeTexture(missing.texture))).toMatchObject({ code: "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED" });
      expect(errorFrom(() => f.device.getNativeTexture(incomplete.texture))).toMatchObject({ code: "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED" });
      expect(errorFrom(() => f.device.getNativeTexture(cube))).toMatchObject({ code: "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED" });
      expect(() => new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2, format: "bc1-rgba-unorm",
        data: new Uint8Array(16), fallbackData: new Uint8Array(127) })).toThrow(/fallbackData/i);
      expect(() => new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2, format: "bc1-rgba-unorm",
        data: new Uint8Array(16), fallbackMipLevels: [{ width: 4, height: 4, data: new Uint8Array(127) }] })).toThrow(/fallback mip/i);
      expect(f.textures).toHaveLength(0);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { missing.texture.dispose(); incomplete.texture.dispose(); cube.dispose(); await f.close(); }
  });

  it.each(["bc1-rgb-unorm", "etc2-rgb8unorm"] as const)("rejects nonopaque decoded alpha for %s before allocation", async (format) => {
    const f = await fixture();
    const { texture } = arraySource({ format });
    // Exposed retained typed arrays can be edited after constructor validation.
    texture.fallbackTextureLevels[1]!.data[3 + 4 * 4] = 0;
    try {
      expect(errorFrom(() => f.device.getNativeTexture(texture))).toMatchObject({ code: "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED" });
      expect(f.textures).toHaveLength(0);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { texture.dispose(); await f.close(); }
  });

  it.each([
    { maxTextureDimension2D: 3, maxTextureArrayLayers: 2 },
    { maxTextureDimension2D: 4, maxTextureArrayLayers: 1 }
  ])("rejects dimensions and layer counts beyond native limits: %o", async (limits) => {
    const f = await fixture({ limits });
    const { texture } = arraySource();
    try {
      expect(errorFrom(() => f.device.getNativeTexture(texture))).toMatchObject({ code: "WEBGPU_TEXTURE_LIMIT_EXCEEDED" });
      expect(f.textures).toHaveLength(0);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { texture.dispose(); await f.close(); }
  });

  it("rejects the decoded allocation when only the compressed byte size fits the budget", async () => {
    const f = await fixture({ maxBytes: 159 });
    const { texture } = arraySource();
    try {
      expect(texture.byteLength).toBe(32);
      expect(texture.fallbackByteLength).toBe(160);
      expect(() => f.device.getNativeTexture(texture)).toThrow(/budget/i);
      expect(f.textures).toHaveLength(0);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { texture.dispose(); await f.close(); }
  });

  it.each(["updateMip", "markNeedsUpdate"] as const)("never uses stale decoded layers after %s on either device", async (change) => {
    const first = await fixture();
    const second = await fixture();
    const { texture } = arraySource();
    try {
      first.device.getNativeTexture(texture);
      second.device.getNativeTexture(texture);
      if (change === "updateMip") texture.updateMip(1, new Uint8Array(16).fill(1));
      else texture.markNeedsUpdate();
      expect(texture.fallbackTextureLevels).toHaveLength(0);
      expect(() => first.device.getNativeTexture(texture)).toThrow(/fallback.*update|updat.*fallback/i);
      expect(() => second.device.getNativeTexture(texture)).toThrow(/fallback.*update|updat.*fallback/i);
      expect(first.writes).toHaveLength(2);
      expect(second.writes).toHaveLength(2);
      expect(first.device.getDiagnostics().textureBytes).toBe(160);
      expect(second.device.getDiagnostics().textureBytes).toBe(160);
    } finally { texture.dispose(); await first.close(); await second.close(); }
  });

  it("keeps two device allocations independent and never disposes their shared source", async () => {
    const first = await fixture();
    const second = await fixture();
    const { texture } = arraySource();
    try {
      const a = first.device.getNativeTexture(texture);
      const b = second.device.getNativeTexture(texture);
      expect(a).not.toBe(b);
      first.device.dispose();
      expect(texture.disposed).toBe(false);
      expect(first.textures[0]!.destroyed).toBe(0);
      expect(first.device.getDiagnostics().textureBytes).toBe(160);
      expect(second.device.getNativeTexture(texture)).toBe(b);
      await first.finishFences();
      expect(first.textures[0]!.destroyed).toBe(1);
      expect(first.device.getDiagnostics().textureBytes).toBe(0);
      expect(second.device.getDiagnostics().textureBytes).toBe(160);
      expect(second.textures[0]!.destroyed).toBe(0);
    } finally { texture.dispose(); await first.close(); await second.close(); }
  });

  it.each(["dispose", "revision", "color space", "write failure"] as const)("stops and fence-retires a fallback interrupted by %s", async (mode) => {
    const f = await fixture();
    const { texture } = arraySource();
    f.onWrite(() => {
      if (mode === "dispose") texture.dispose();
      else if (mode === "revision") texture.updateMip(1, new Uint8Array(16).fill(1));
      else if (mode === "color space") texture.colorSpace = "srgb";
      else throw new Error("injected write failure");
    });
    try {
      const error = errorFrom(() => f.device.getNativeTexture(texture));
      if (mode === "write failure") expect(error).toMatchObject({ message: "injected write failure" });
      else expect(error).toMatchObject({ code: mode === "dispose" ? "DISPOSED_RESOURCE" : "WEBGPU_TEXTURE_UPLOAD_STALE" });
      expect(f.writes).toHaveLength(1);
      expect(f.events).not.toContain("fence-during-write");
      expect(f.textures[0]!.destroyed).toBe(0);
      expect(f.device.getDiagnostics()).toMatchObject({ textureBytes: 160, textureFallbacks: 0 });
      await f.finishFences();
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { texture.dispose(); await f.close(); }
  });

  it("retires the decoded allocation after view creation fails", async () => {
    const f = await fixture();
    const { texture } = arraySource();
    f.failView(true);
    try {
      expect(() => f.device.getNativeTexture(texture)).toThrow(/injected view failure/);
      expect(f.writes).toHaveLength(2);
      expect(f.textures[0]!.destroyed).toBe(0);
      expect(f.device.getDiagnostics()).toMatchObject({ textureBytes: 160, textureFallbacks: 0 });
      await f.finishFences();
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { texture.dispose(); await f.close(); }
  });
});
