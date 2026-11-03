import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseImageFormat } from "../../../packages/assets/src/loaders/ImageFormatLoaders";
import { defineAuraAssets, texture } from "../../../packages/engine/src/public/index";
import { prepareNativeTextureLoad, startNativeTextureLoad } from "../../../packages/engine/src/agent-api/nodes/loadNativeTexture";

/** Small independently constructed PVR v3 UNORM16 image with explicit mip bytes. */
function pvr16(options: {
  readonly width?: number;
  readonly height?: number;
  readonly channels?: string;
  readonly colorSpace?: "linear" | "srgb";
  readonly flags?: number;
  readonly metadata?: Uint8Array;
  readonly mips: readonly (readonly number[])[];
}): Uint8Array {
  const channels = options.channels ?? "rgba";
  const metadata = options.metadata ?? new Uint8Array();
  const byteLength = options.mips.reduce((total, mip) => total + mip.length * 2, 0);
  const bytes = new Uint8Array(52 + metadata.length + byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(4, options.flags ?? 0, true);
  for (let channel = 0; channel < channels.length; channel += 1) {
    bytes[8 + channel] = channels.charCodeAt(channel);
    bytes[12 + channel] = 16;
  }
  view.setUint32(16, options.colorSpace === "srgb" ? 1 : 0, true);
  view.setUint32(20, 4, true); // unsigned normalized 16-bit channels
  view.setUint32(24, options.height ?? 1, true);
  view.setUint32(28, options.width ?? 1, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, options.mips.length, true);
  view.setUint32(48, metadata.length, true);
  bytes.set(metadata, 52);
  let cursor = 52 + metadata.length;
  for (const mip of options.mips) for (const value of mip) {
    view.setUint16(cursor, value, true);
    cursor += 2;
  }
  return bytes;
}

function closePixels(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 6));
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PVR unsigned-normalized 16-bit texture conversion", () => {
  it("preserves linear reordered channels, alpha, mip data, and independent storage", async () => {
    const image = await parseImageFormat(pvr16({
      width: 2, height: 2, channels: "bgra",
      mips: [
        [0, 32768, 65535, 16384, 65535, 0, 32768, 65535, 5, 6, 7, 8, 9, 10, 11, 12],
        [100, 200, 300, 400]
      ]
    }), "pvr");
    const handle = texture.fromNativeImage(image);
    try {
      expect(handle.texture.format).toBe("rgba32f");
      expect(handle.texture.colorSpace).toBe("linear");
      expect(handle.minFilter).toBe("nearest-mipmap-nearest");
      expect(handle.magFilter).toBe("nearest");
      expect(handle.texture.mipLevels).toHaveLength(2);
      closePixels(handle.texture.mipLevels[0]!.data, [
        1, 32768 / 65535, 0, 16384 / 65535,
        32768 / 65535, 0, 1, 1,
        7 / 65535, 6 / 65535, 5 / 65535, 8 / 65535,
        11 / 65535, 10 / 65535, 9 / 65535, 12 / 65535
      ]);
      closePixels(handle.texture.mipLevels[1]!.data, [300 / 65535, 200 / 65535, 100 / 65535, 400 / 65535]);
      expect(handle.diagnostics.join(" ")).toMatch(/nearest filtering.*float32-filterable/);
      (image.levels[0]!.data as Uint16Array).fill(0);
      expect(handle.texture.mipLevels[0]!.data[0]).toBe(1);
    } finally { handle.dispose(); }
    expect(handle.texture.disposed).toBe(true);
  });

  it("decodes sRGB color channels to linear while keeping alpha linear", async () => {
    const image = await parseImageFormat(pvr16({ colorSpace: "srgb", mips: [[65535, 32768, 1024, 16384]] }), "pvr");
    const handle = texture.fromNativeImage(image);
    try {
      const srgb = (value: number): number => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      expect(handle.texture.colorSpace).toBe("linear");
      closePixels(handle.texture.mipLevels[0]!.data, [1, srgb(32768 / 65535), srgb(1024 / 65535), 16384 / 65535]);
      expect(handle.minFilter).toBe("nearest");
    } finally { handle.dispose(); }
  });

  it("loads the admitted, digest-checked asset through the public texture API", async () => {
    const bytes = pvr16({ channels: "rg", mips: [[0x1234, 0xabcd]] });
    const hash = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const asset = defineAuraAssets({ image: { type: "texture", format: "pvr", url: "https://assets.example.test/image.pvr", hash: `sha256-${hash}` } }).image;
    const handle = await texture.loadNativeAsset(asset, { maxDecodedBytes: 16 });
    try { closePixels(handle.texture.mipLevels[0]!.data, [0x1234 / 65535, 0xabcd / 65535, 0, 1]); }
    finally { handle.dispose(); }
  });

  it("enforces the caller's decoded-byte limit on expanded pixels before conversion", async () => {
    const bytes = pvr16({ mips: [[123, 456, 789, 12345]] });
    const hash = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const asset = defineAuraAssets({ image: { type: "texture", format: "pvr", url: "https://assets.example.test/image.pvr", hash } }).image;
    await expect(texture.loadNativeAsset(asset, { maxDecodedBytes: 15 })).rejects.toThrow(/converted mip pixels exceed the decoded-byte limit/);
    const image = await parseImageFormat(bytes, "pvr");
    expect(() => texture.fromNativeImage(image, { maxDecodedBytes: 15 })).toThrow(/decoded-byte limit/);
  });

  it("keeps the queued loader's captured byte limit when the caller changes its options", async () => {
    const bytes = pvr16({ mips: [[123, 456, 789, 12345]] });
    const hash = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const asset = defineAuraAssets({ image: { type: "texture", format: "pvr", url: "https://assets.example.test/image.pvr", hash } }).image;
    const options = { maxDecodedBytes: 15 };
    const plan = prepareNativeTextureLoad(asset, options);
    options.maxDecodedBytes = 16;
    const started = startNativeTextureLoad(plan, undefined, texture.fromNativeImage);
    await expect(started.result).rejects.toThrow(/converted mip pixels exceed the decoded-byte limit/);
    await expect(started.settled).resolves.toBeUndefined();
  });

  it("applies the direct decoded-byte limit to every retained mip and compressed fallback", () => {
    const base = { format: "test", colorSpace: "linear" as const, metadata: {}, diagnostics: [] };
    const rgba8 = { ...base, width: 1, height: 1, levels: [{ width: 1, height: 1, encoding: "rgba8", data: new Uint8Array(4) }] };
    const rgba32f = { ...base, width: 1, height: 1, levels: [{ width: 1, height: 1, encoding: "rgba32f", data: new Float32Array(4) }] };
    const rgba8Mips = { ...base, width: 2, height: 2, levels: [
      { width: 2, height: 2, encoding: "rgba8", data: new Uint8Array(16) },
      { width: 1, height: 1, encoding: "rgba8", data: new Uint8Array(4) }
    ] };
    // The 8-byte source block and 64-byte opaque RGBA8 fallback are retained.
    const bc1 = { ...base, width: 4, height: 4, levels: [{ width: 4, height: 4, encoding: "bc1-rgb", data: new Uint8Array(8) }] };
    for (const [image, size] of [[rgba8, 4], [rgba32f, 16], [rgba8Mips, 20], [bc1, 72]] as const) {
      expect(() => texture.fromNativeImage(image, { maxDecodedBytes: size - 1 })).toThrow(/decoded-byte limit/);
      const handle = texture.fromNativeImage(image, { maxDecodedBytes: size });
      try { expect(handle.texture.mipLevels).toHaveLength(image.levels.length); }
      finally { handle.dispose(); }
    }
  });

  it("rejects unsupported alpha, metadata, malformed mips, and excessive working sets", async () => {
    const premultiplied = await parseImageFormat(pvr16({ flags: 2, mips: [[1, 2, 3, 4]] }), "pvr");
    expect(() => texture.fromNativeImage(premultiplied)).toThrow(/premultiplied/);
    const oriented = await parseImageFormat(pvr16({ metadata: Uint8Array.of(1, 2, 3, 4), mips: [[1, 2, 3, 4]] }), "pvr");
    expect(() => texture.fromNativeImage(oriented)).toThrow(/orientation/);
    const image = await parseImageFormat(pvr16({ mips: [[1, 2, 3, 4]] }), "pvr");
    expect(() => texture.fromNativeImage({ ...image, metadata: { ...image.metadata, channelType: 0 } })).toThrow(/unsigned-normalized/);
    expect(() => texture.fromNativeImage({ ...image, metadata: { ...image.metadata, pixelFormat: [0x61626772, 0x08080808] } })).toThrow(/unsigned-normalized/);
    expect(() => texture.fromNativeImage({ ...image, levels: [{ ...image.levels[0]!, data: new Uint8Array(8) }] })).toThrow(/invalid pixel/);
    expect(() => texture.fromNativeImage({ ...image, levels: [{ ...image.levels[0]!, data: new Uint16Array(3) }] })).toThrow(/invalid pixel/);
    const width = 2048, height = 2048;
    expect(() => texture.fromNativeImage({ ...image, width, height, levels: [{ width, height, encoding: "rgba16", data: new Uint16Array(width * height * 4) }] }))
      .toThrow(/allocation limit/);
  });
});
