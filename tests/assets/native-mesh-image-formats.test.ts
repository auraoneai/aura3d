import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { ImageFormatLoader, NativeImageError, parseImageFormat } from "../../packages/assets/src/loaders/ImageFormatLoaders";
import { ImageFormatLoader as PublicImageFormatLoader, parseImageFormat as publicParseImageFormat } from "../../packages/assets/src/importers";

// These tiny specimens are authored here from the format definitions, not copied
// from another engine. They deliberately use different channel values, padded
// rows, mip sizes and byte orders so a signature-only parser cannot pass.
// DDS: https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header
// PVR: https://docs.imgtec.com/specifications/pvr-file-format-specification/html/topics/pvr-header-format.html
// KTX1: https://registry.khronos.org/KTX/specs/1.0/ktxspec.v1.html
// TIFF 6.0: https://download.osgeo.org/libtiff/doc/TIFF6.pdf
function put32(a: Uint8Array, offset: number, value: number, le = true): void { new DataView(a.buffer, a.byteOffset, a.byteLength).setUint32(offset, value >>> 0, le); }
function put16(a: Uint8Array, offset: number, value: number, le = true): void { new DataView(a.buffer, a.byteOffset, a.byteLength).setUint16(offset, value, le); }
function concat(...parts: Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let at = 0; for (const a of parts) { out.set(a, at); at += a.length; } return out; }
function rgba(image: Awaited<ReturnType<typeof parseImageFormat>>, level = 0): number[] { return Array.from(image.levels[level]!.data); }
function code(s: string): number { return s.charCodeAt(0) | s.charCodeAt(1) << 8 | s.charCodeAt(2) << 16 | s.charCodeAt(3) << 24; }

function dds(payload: Uint8Array, opts: { width?: number; height?: number; bits?: number; masks?: number[]; flags?: number; fourcc?: string; pitch?: number; mips?: number; dxgi?: number; alphaMode?: number } = {}): Uint8Array {
  const dx = opts.dxgi !== undefined, head = new Uint8Array(dx ? 148 : 128), bits = opts.bits ?? 24;
  put32(head, 0, code("DDS ")); put32(head, 4, 124); put32(head, 8, 0x1007 | (opts.pitch === undefined ? 0 : 8));
  put32(head, 12, opts.height ?? 1); put32(head, 16, opts.width ?? 1); put32(head, 20, opts.pitch ?? 0); put32(head, 28, opts.mips ?? 1);
  put32(head, 76, 32); put32(head, 80, opts.flags ?? (opts.fourcc || dx ? 4 : 0x40));
  put32(head, 84, code(dx ? "DX10" : opts.fourcc ?? "\0\0\0\0")); put32(head, 88, bits);
  (opts.masks ?? [0xff0000, 0xff00, 0xff, 0]).forEach((mask, i) => put32(head, 92 + 4 * i, mask));
  put32(head, 108, 0x1000);
  if (dx) { put32(head, 128, opts.dxgi!); put32(head, 132, 3); put32(head, 140, 1); put32(head, 144, opts.alphaMode ?? 0); }
  return concat(head, payload);
}

function pvr(payload: Uint8Array, opts: { width?: number; height?: number; format?: number; channels?: string; bits?: number; type?: number; color?: number; flags?: number; mips?: number; metadata?: Uint8Array } = {}): Uint8Array {
  const head = new Uint8Array(52), channels = opts.channels;
  put32(head, 0, 0x03525650); put32(head, 4, opts.flags ?? 0);
  if (channels) { for (let i = 0; i < channels.length; i++) { head[8 + i] = channels.charCodeAt(i); head[12 + i] = opts.bits ?? 8; } }
  else put32(head, 8, opts.format ?? 7);
  put32(head, 16, opts.color ?? 0); put32(head, 20, opts.type ?? 0); put32(head, 24, opts.height ?? 1); put32(head, 28, opts.width ?? 1);
  put32(head, 32, 1); put32(head, 36, 1); put32(head, 40, 1); put32(head, 44, opts.mips ?? 1); put32(head, 48, opts.metadata?.length ?? 0);
  return concat(head, opts.metadata ?? new Uint8Array(), payload);
}

function ktx(levels: Uint8Array[], opts: { width?: number; height?: number; type?: number; typeSize?: number; format?: number; internal?: number; base?: number; little?: boolean; orientation?: string; mips?: number } = {}): Uint8Array {
  const le = opts.little ?? true, head = new Uint8Array(64);
  head.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 13, 10, 26, 10]);
  const fields = [0x04030201, opts.type ?? 0x1401, opts.typeSize ?? 1, opts.format ?? 0x1908, opts.internal ?? 0x8058, opts.base ?? 0x1908, opts.width ?? 1, opts.height ?? 1, 0, 0, 1, opts.mips ?? levels.length, 0];
  fields.forEach((v, i) => put32(head, 12 + i * 4, v, le));
  let metadata = new Uint8Array();
  if (opts.orientation) {
    const entry = new TextEncoder().encode(`KTXorientation\0${opts.orientation}\0`), size = Math.ceil(entry.length / 4) * 4;
    metadata = new Uint8Array(4 + size); put32(metadata, 0, entry.length, le); metadata.set(entry, 4); put32(head, 60, metadata.length, le);
  }
  const chunks = levels.map((level) => { const chunk = new Uint8Array(4 + Math.ceil(level.length / 4) * 4); put32(chunk, 0, level.length, le); chunk.set(level, 4); return chunk; });
  return concat(head, metadata, ...chunks);
}

function tga(payload: Uint8Array, opts: { width?: number; height?: number; kind?: number; bits?: number; descriptor?: number; palette?: Uint8Array; first?: number; entries?: number; paletteBits?: number } = {}): Uint8Array {
  const head = new Uint8Array(18); head[1] = opts.palette ? 1 : 0; head[2] = opts.kind ?? 2;
  put16(head, 3, opts.first ?? 0); put16(head, 5, opts.entries ?? 0); head[7] = opts.paletteBits ?? 0;
  put16(head, 12, opts.width ?? 1); put16(head, 14, opts.height ?? 1); head[16] = opts.bits ?? 24; head[17] = opts.descriptor ?? 0x20;
  return concat(head, opts.palette ?? new Uint8Array(), payload);
}
function tgaV2(image: Uint8Array, attributes: number): Uint8Array {
  const extension = new Uint8Array(495), footer = new Uint8Array(26);
  put16(extension, 0, extension.length); extension[494] = attributes;
  put32(footer, 0, image.length); footer.set(new TextEncoder().encode("TRUEVISION-XFILE.\0"), 8);
  return concat(image, extension, footer);
}

interface TiffOptions {
  width: number; height: number; strips: Uint8Array[]; bits?: number; samples?: number; photo?: number; compression?: number;
  rows?: number; planar?: number; predictor?: number; orientation?: number; fillOrder?: number; extra?: number; palette?: number[]; little?: boolean;
}
function tiff(o: TiffOptions): Uint8Array {
  const le = o.little ?? true, samples = o.samples ?? 1;
  const tags: Array<{ id: number; type: 3 | 4; values: number[] }> = [
    { id: 256, type: 4, values: [o.width] }, { id: 257, type: 4, values: [o.height] },
    { id: 258, type: 3, values: Array(samples).fill(o.bits ?? 8) }, { id: 259, type: 3, values: [o.compression ?? 1] },
    { id: 262, type: 3, values: [o.photo ?? 1] }, { id: 273, type: 4, values: o.strips.map(() => 0) },
    { id: 274, type: 3, values: [o.orientation ?? 1] }, { id: 277, type: 3, values: [samples] },
    { id: 278, type: 4, values: [o.rows ?? o.height] }, { id: 279, type: 4, values: o.strips.map((s) => s.length) },
    { id: 284, type: 3, values: [o.planar ?? 1] }, { id: 317, type: 3, values: [o.predictor ?? 1] }
  ];
  if (o.extra !== undefined) tags.push({ id: 338, type: 3, values: [o.extra] });
  if (o.fillOrder !== undefined) tags.push({ id: 266, type: 3, values: [o.fillOrder] });
  if (o.palette) tags.push({ id: 320, type: 3, values: o.palette });
  tags.sort((a, b) => a.id - b.id);
  let tail = 8 + 2 + tags.length * 12 + 4;
  for (const tag of tags) if (tag.values.length * (tag.type === 3 ? 2 : 4) > 4) tail += tag.values.length * (tag.type === 3 ? 2 : 4);
  const offsets = tags.find((tag) => tag.id === 273)!; let start = tail;
  offsets.values = o.strips.map((strip) => { const at = start; start += strip.length; return at; });
  const out = new Uint8Array(start); out[0] = out[1] = le ? 0x49 : 0x4d; put16(out, 2, 42, le); put32(out, 4, 8, le); put16(out, 8, tags.length, le);
  let valueAt = 8 + 2 + tags.length * 12 + 4;
  tags.forEach((tag, i) => {
    const at = 10 + i * 12, stride = tag.type === 3 ? 2 : 4, len = stride * tag.values.length;
    put16(out, at, tag.id, le); put16(out, at + 2, tag.type, le); put32(out, at + 4, tag.values.length, le);
    const where = len <= 4 ? at + 8 : valueAt;
    if (len > 4) { put32(out, at + 8, valueAt, le); valueAt += len; }
    tag.values.forEach((value, j) => tag.type === 3 ? put16(out, where + j * stride, value, le) : put32(out, where + j * stride, value, le));
  });
  o.strips.forEach((strip, i) => out.set(strip, offsets.values[i]!));
  return out;
}
function lzwLiterals(values: number[]): Uint8Array {
  const codes = [256, ...values, 257], bits = codes.map((n) => n.toString(2).padStart(9, "0")).join("");
  return Uint8Array.from({ length: Math.ceil(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8).padEnd(8, "0"), 2));
}
const bytes = (...v: number[]): Uint8Array => Uint8Array.from(v);
const error = (code: NativeImageError["code"]) => expect.objectContaining({ name: "NativeImageError", code });

describe("native image format sources", () => {
  it("exports the same loader through the opt-in importer source", () => {
    expect(PublicImageFormatLoader).toBe(ImageFormatLoader); expect(publicParseImageFormat).toBe(parseImageFormat);
    expect(new ImageFormatLoader("tiff").canLoad({ url: "image.tif?rev=2" })).toBe(true);
    expect(new ImageFormatLoader("ktx1").canLoad({ url: "image.ktx2" })).toBe(false);
  });

  it("decodes DDS padded RGB rows, luminance-alpha, DXGI channels and sRGB", async () => {
    const file = dds(bytes(0, 0, 255, 0, 255, 0, 99, 99, 255, 0, 0, 255, 255, 255, 99, 99), { width: 2, height: 2, pitch: 8 });
    expect(rgba(await parseImageFormat(file, "dds"))).toEqual([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]);
    const la = await parseImageFormat(dds(bytes(17, 128, 240, 64), { width: 2, bits: 16, flags: 0x20001, masks: [255, 0, 0, 0xff00] }), "dds");
    expect(rgba(la)).toEqual([17,17,17,128, 240,240,240,64]);
    expect(rgba(await parseImageFormat(dds(bytes(7, 9), { dxgi: 49 }), "dds"))).toEqual([7,9,0,255]);
    expect(rgba(await parseImageFormat(dds(bytes(42), { dxgi: 65 }), "dds"))).toEqual([0,0,0,42]);
    const srgb = await parseImageFormat(dds(bytes(1,2,3,4), { dxgi: 29 }), "dds");
    expect(srgb.colorSpace).toBe("srgb"); expect(rgba(srgb)).toEqual([1,2,3,4]);
    expect(rgba(await parseImageFormat(dds(bytes(1,2,3,4), { dxgi: 29, alphaMode: 3 }), "dds"))).toEqual([1,2,3,255]);
    expect(rgba(await parseImageFormat(dds(bytes(0, 0xf8), { dxgi: 85 }), "dds"))).toEqual([255,0,0,255]);
  });

  it("resolves DDS mip row alignment and permits explicit alignment for ambiguous tails", async () => {
    const base = bytes(0,0,255, 0,255,0, 255,0,0, 0,0,0), mip = bytes(7,8,9, 0);
    const file = dds(concat(base, mip), { width: 4, mips: 2, pitch: 12 });
    // Level one is 2 pixels wide: six data bytes plus two padding bytes.
    const payload = concat(base, bytes(7,8,9, 10,11,12, 0,0));
    const aligned = dds(payload, { width: 4, mips: 2, pitch: 12 });
    const image = await parseImageFormat(aligned, "dds");
    expect(image.metadata.rowAlignment).toBe("dword"); expect(rgba(image, 1)).toEqual([9,8,7,255,12,11,10,255]);
    const withTail = concat(aligned, bytes(1,2,3));
    const explicit = await parseImageFormat(withTail, "dds", { ddsRowAlignment: "dword" });
    expect(rgba(explicit, 1)).toEqual([9,8,7,255,12,11,10,255]);
    await expect(parseImageFormat(file, "dds")).rejects.toMatchObject(error("malformed"));
  });

  it("decodes BC1–BC5 or preserves explicitly supported DDS blocks", async () => {
    const bc1 = bytes(0,0, 255,255, 255,255,255,255); // color0 <= color1, index 3 => transparent
    expect(rgba(await parseImageFormat(dds(bc1, { width: 1, height: 1, fourcc: "DXT1" }), "dds"))).toEqual([0,0,0,0]);
    expect(rgba(await parseImageFormat(dds(bc1, { dxgi: 71, alphaMode: 3 }), "dds"))).toEqual([0,0,0,255]);
    const opaqueRed = bytes(0,0xf8, 0,0, 0,0,0,0);
    const bc2 = concat(bytes(0x88,0x88,0x88,0x88,0x88,0x88,0x88,0x88), opaqueRed);
    const bc3 = concat(bytes(128,0,0,0,0,0,0,0), opaqueRed);
    const bc4 = bytes(77,0,0,0,0,0,0,0), bc5 = concat(bc4, bytes(33,0,0,0,0,0,0,0));
    const cases: Array<[string, Uint8Array, number[]]> = [["DXT3", bc2, [255,0,0,136]], ["DXT5", bc3, [255,0,0,128]], ["ATI1", bc4, [77,0,0,255]], ["ATI2", bc5, [77,33,0,255]]];
    for (const [fourcc, block, expected] of cases) expect(rgba(await parseImageFormat(dds(block, { fourcc }), "dds"))).toEqual(expected);
    const encoded = await parseImageFormat(dds(bc5, { fourcc: "ATI2" }), "dds", { gpuFormats: ["bc5"] });
    expect(encoded.levels[0]!.encoding).toBe("bc5"); expect(rgba(encoded)).toEqual(Array.from(bc5));
    const premul = await parseImageFormat(dds(bc3, { fourcc: "DXT4" }), "dds");
    expect(premul.metadata.alphaMode).toBe("premultiplied"); expect(premul.diagnostics.join(" ")).toContain("premultiplied");
  });

  it("decodes PVR channel ordering, 16-bit samples and mip levels", async () => {
    const image = await parseImageFormat(pvr(bytes(3,2,1,4, 30,20,10,40, 9,8,7,6), { width: 2, channels: "bgra", mips: 2, color: 1, flags: 2 }), "pvr");
    expect(image.colorSpace).toBe("srgb"); expect(rgba(image)).toEqual([1,2,3,4, 10,20,30,40]);
    expect(rgba(image, 1)).toEqual([7,8,9,6]); expect(image.diagnostics.join(" ")).toContain("premultiplied");
    const sixteen = await parseImageFormat(pvr(bytes(0x34,0x12, 0xcd,0xab), { channels: "rg", bits: 16, type: 4 }), "pvr");
    expect(sixteen.levels[0]!.encoding).toBe("rgba16"); expect(rgba(sixteen)).toEqual([0x1234,0xabcd,0,65535]);
  });

  it("requires declared capabilities for ETC and accounts for whole PVRTC blocks", async () => {
    const etc = pvr(new Uint8Array(8), { format: 6 });
    await expect(parseImageFormat(etc, "pvr")).rejects.toMatchObject(error("codec-unavailable"));
    expect((await parseImageFormat(etc, "pvr", { gpuFormats: ["etc1"] })).levels[0]!.encoding).toBe("etc1");
    const pvrtc = pvr(new Uint8Array(48), { width: 17, height: 8, format: 0 });
    expect((await parseImageFormat(pvrtc, "pvr", { gpuFormats: ["pvrtc1-2-rgb"] })).levels[0]!.data.length).toBe(48);
    await expect(parseImageFormat(pvrtc.subarray(0, pvrtc.length - 1), "pvr", { gpuFormats: ["pvrtc1-2-rgb"] })).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(pvr(new Uint8Array(8), { format: 12, type: 1 }), "pvr")).rejects.toMatchObject(error("unsupported"));
  });

  it("decodes KTX1 row padding, orientation, channel layout and big-endian 16-bit samples", async () => {
    const bgr = ktx([bytes(0,0,255, 0,255,0, 0,0, 255,0,0, 255,255,255, 0,0)], { width: 2, height: 2, format: 0x80e0, base: 0x1907, internal: 0x8051, orientation: "S=l,T=u" });
    expect(rgba(await parseImageFormat(bgr, "ktx1"))).toEqual([255,255,255,255, 0,0,255,255, 0,255,0,255, 255,0,0,255]);
    const sixteen = ktx([bytes(0x12,0x34, 0xab,0xcd)], { type: 0x1403, typeSize: 2, format: 0x8227, base: 0x8227, internal: 0x822c, little: false });
    const image = await parseImageFormat(sixteen, "ktx1");
    expect(image.levels[0]!.encoding).toBe("rgba16"); expect(image.metadata.littleEndian).toBe(false); expect(rgba(image)).toEqual([0x1234,0xabcd,0,65535]);
    const alpha = ktx([bytes(24,0,0,0)], { format: 0x1906, base: 0x1906, internal: 0x803c, mips: 0 });
    const result = await parseImageFormat(alpha, "ktx1"); expect(rgba(result)).toEqual([0,0,0,24]); expect(result.metadata.generateMipmaps).toBe(true);
  });

  it("distinguishes opaque KTX1 BC1 RGB from transparent BC1 RGBA", async () => {
    const block = bytes(0,0,255,255,255,255,255,255);
    const make = (internal: number, base: number) => ktx([block], { type: 0, format: 0, internal, base, orientation: "S=r,T=d" });
    expect(rgba(await parseImageFormat(make(0x83f0, 0x1907), "ktx1"))).toEqual([0,0,0,255]);
    expect(rgba(await parseImageFormat(make(0x83f1, 0x1908), "ktx1"))).toEqual([0,0,0,0]);
    const encoded = await parseImageFormat(make(0x83f0, 0x1907), "ktx1", { gpuFormats: ["bc1-rgb"] });
    expect(encoded.levels[0]!.encoding).toBe("bc1-rgb"); expect(rgba(encoded)).toEqual(Array.from(block));
    expect(encoded.diagnostics.join(" ")).toContain("texture.fromNativeImage");
    const flipped = ktx([block], { type: 0, format: 0, internal: 0x83f0, base: 0x1907, orientation: "S=l,T=u" });
    expect((await parseImageFormat(flipped, "ktx1", { gpuFormats: ["bc1-rgb"] })).metadata.uvTransform).toEqual({ scale: [-1,-1], offset: [1,1] });
  });

  it("decodes TGA origin, RLE palette and gray-alpha", async () => {
    const raw = tga(bytes(0,0,255, 0,255,0, 255,0,0, 255,255,255), { width: 2, height: 2, descriptor: 0 });
    expect(rgba(await parseImageFormat(raw, "tga"))).toEqual([0,0,255,255,255,255,255,255,255,0,0,255,0,255,0,255]);
    const indexed = tga(bytes(0x81, 5, 0x00, 6), { width: 3, kind: 9, bits: 8, first: 5, entries: 2, paletteBits: 32, palette: bytes(3,2,1,40, 6,5,4,80) });
    expect(rgba(await parseImageFormat(indexed, "tga"))).toEqual([1,2,3,40,1,2,3,40,4,5,6,80]);
    expect(rgba(await parseImageFormat(tga(bytes(70,40), { kind: 3, bits: 16, descriptor: 0x28 }), "tga"))).toEqual([70,70,70,40]);
    expect(rgba(await parseImageFormat(tga(bytes(70,40), { kind: 3, bits: 16 }), "tga"))).toEqual([70,70,70,255]);
  });

  it("preserves TGA 2 alpha declarations and rejects metadata overlap", async () => {
    const pixels = tga(bytes(16,32,64,128), { bits: 32, descriptor: 0x28 });
    const premultiplied = await parseImageFormat(tgaV2(pixels, 4), "tga");
    expect(rgba(premultiplied)).toEqual([64,32,16,128]); expect(premultiplied.metadata.attributeType).toBe(4);
    expect(premultiplied.diagnostics.join(" ")).toContain("premultiplied");
    expect(rgba(await parseImageFormat(tgaV2(pixels, 1), "tga"))).toEqual([64,32,16,255]);
    const broken = tgaV2(pixels, 4); put32(broken, broken.length - 26, 19);
    await expect(parseImageFormat(broken, "tga")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(tga(bytes(1,2,3,4), { bits: 32, descriptor: 0x21 }), "tga")).rejects.toMatchObject(error("unsupported"));
  });

  it("decodes TIFF packed bilevel, FillOrder and palette with row padding", async () => {
    const mono = tiff({ width: 3, height: 2, bits: 1, photo: 0, strips: [bytes(0xa0, 0x40)] });
    expect(rgba(await parseImageFormat(mono, "tiff"))).toEqual([0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255, 0,0,0,255, 255,255,255,255]);
    const reverse = tiff({ width: 3, height: 1, bits: 1, fillOrder: 2, strips: [bytes(0x05)] });
    expect(rgba(await parseImageFormat(reverse, "tiff"))).toEqual([255,255,255,255,0,0,0,255,255,255,255,255]);
    const palette = Array(16 * 3).fill(0); palette[1] = 65535; palette[16 + 2] = 32768; palette[32 + 3] = 65535;
    const pal = tiff({ width: 3, height: 1, bits: 4, photo: 3, palette, compression: 32773, strips: [bytes(1, 0x12, 0x30)] });
    expect(rgba(await parseImageFormat(pal, "tiff"))).toEqual([255,0,0,255,0,128,0,255,0,0,255,255]);
  });

  it("decodes TIFF planar strips, prediction, associated alpha and 16-bit orientation", async () => {
    const planar = tiff({ width: 2, height: 1, photo: 2, samples: 4, planar: 2, predictor: 2, extra: 1, strips: [bytes(64,16),bytes(32,16),bytes(16,16),bytes(128,0)] });
    expect(rgba(await parseImageFormat(planar, "tiff"))).toEqual([128,64,32,128, 159,96,64,128]);
    const be = tiff({ width: 2, height: 1, bits: 16, orientation: 6, little: false, strips: [bytes(0x12,0x34,0xab,0xcd)] });
    const image = await parseImageFormat(be, "tiff"); expect([image.width, image.height]).toEqual([1,2]);
    expect(image.levels[0]!.encoding).toBe("rgba16"); expect(rgba(image)).toEqual([0x1234,0x1234,0x1234,65535,0xabcd,0xabcd,0xabcd,65535]);
    const unspecified = tiff({ width: 1, height: 1, photo: 2, samples: 4, extra: 0, strips: [bytes(10,20,30,40)] });
    const ignored = await parseImageFormat(unspecified, "tiff"); expect(rgba(ignored)).toEqual([10,20,30,255]); expect(ignored.diagnostics.join(" ")).toContain("unspecified");
  });

  it("decodes TIFF Deflate and LZW strips with independently generated byte streams", async () => {
    const pixels = bytes(12,34,56,78);
    for (const [compression, strip] of [[8, deflateSync(pixels)], [5, lzwLiterals(Array.from(pixels))]] as const) {
      const image = await parseImageFormat(tiff({ width: 2, height: 2, compression, rows: 2, strips: [strip] }), "tiff");
      expect(rgba(image)).toEqual([12,12,12,255,34,34,34,255,56,56,56,255,78,78,78,255]);
    }
  });

  it("decodes an independently encoded TIFF LZW strip across code-width changes", async () => {
    // Generated from a 512-pixel arithmetic sequence with Pillow 12.3.0's TIFF
    // encoder; this stream crosses TIFF's 9-to-10-bit early-change boundary.
    const encoded = Buffer.from("gAAJKSbYkNq2f5ISLaEZsWr+I6QbIiNa0fpGR7YEJqWb8IqOa4gNKyfZERrWD5oWL6IaMaoeM6wfJCRbUDpmV74IKKaYcMque5ARLSDZkVr2H6IaIaMaseo+Q7QDJiVb0HqGZ4YMKqeY8QrOC5gVLyHaEZoWL6oeI6QbMCpeU7wHKCZYULqmd44QLKCZcUruG6AZISLakdo2P7ICJaUbsGp+Y4QLKidY0PrGB5YULqGZ8YoOK6gdIyPbEBpWT7oGJ6YYMKqec4wPLCBZUTrmF54YIKKaccouO7ABJSTbkFp2X4IKKacYsOq+A5QTLiFZ0XoGJ6YcIqOa8ApOS7gFJyXYEJqWb4oOK6AZMSreE5wXICJaUbomN64AJKSbcEo3Fu2rbty3bet+4LhuK47kuW5rnui6bquu7Ltu677wvG8rzvS9b2ve+L5vq+78v2/r/lugSCIMhCFIYhyIIkiiLIwjSOI8kCRJIkyUJUliXJgmSaJsnCdJ4nygKEoijKQpSmKcqCpKoqysK0rivLAsSyLMtC1LYty4Lkui7LwvS+L8wDBMIwzEMUxjHMgyTKMszDNM4zzQNE0jTNQ1TWNc2DZGEgI=", "base64");
    const image = await parseImageFormat(tiff({ width: 512, height: 1, compression: 5, strips: [encoded] }), "tiff");
    const expected = Array.from({ length: 512 }, (_, i) => (i * 73 + Math.floor(i / 256) * 11) % 256);
    expect(Array.from(image.levels[0]!.data).filter((_, i) => i % 4 === 0)).toEqual(expected);
  });

  it("rejects truncated inputs, invalid dimensions, limits and unsupported representations", async () => {
    const specimens: Array<["dds" | "pvr" | "ktx1" | "tga" | "tiff", Uint8Array]> = [
      ["dds", dds(bytes(0,0,0))], ["pvr", pvr(bytes(1,2,3,4), { channels: "rgba" })],
      ["ktx1", ktx([bytes(1,2,3,4)])], ["tga", tga(bytes(1,2,3))], ["tiff", tiff({ width: 1, height: 1, strips: [bytes(1)] })]
    ];
    for (const [format, file] of specimens) {
      await expect(parseImageFormat(file.subarray(0, file.length - 1), format)).rejects.toMatchObject(error("malformed"));
      await expect(parseImageFormat(file, format, { maxFileBytes: file.length - 1 })).rejects.toMatchObject(error("limit"));
      await expect(parseImageFormat(file, format, { maxPixels: 0 })).rejects.toMatchObject(error("limit"));
    }
    await expect(parseImageFormat(dds(bytes(1,2,3), { bits: 24, masks: [0xff,0xff,0xff0000,0] }), "dds")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(dds(bytes(0,0,0), { pitch: 2 }), "dds")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(pvr(bytes(0,0,0,0), { channels: "rgba", color: 7 }), "pvr")).rejects.toMatchObject(error("unsupported"));
    const badKtx = ktx([bytes(1,2,3,4)]); put32(badKtx, 64, 1024); await expect(parseImageFormat(badKtx, "ktx1")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(ktx([bytes(0x12,0x34,0xab,0xcd)], { type: 0x1403, typeSize: 2, format: 0x8227, base: 0x8227, internal: 0x822c }), "ktx1", { maxDecodedBytes: 7 })).rejects.toMatchObject(error("limit"));
    await expect(parseImageFormat(dds(new Uint8Array(8), { width: 4, mips: 2, fourcc: "DXT1" }), "dds", { maxMipLevels: 1 })).rejects.toMatchObject(error("limit"));
    await expect(parseImageFormat(tga(bytes(0x81,1,2,3), { width: 1, kind: 10 }), "tga")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(tga(bytes(7), { kind: 1, bits: 8, first: 2, entries: 1, paletteBits: 24, palette: bytes(1,2,3) }), "tga")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(tiff({ width: 1, height: 1, compression: 32773, strips: [bytes(1, 12)] }), "tiff")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(tiff({ width: 1, height: 1, compression: 5, strips: [bytes(0)] }), "tiff")).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(tiff({ width: 1, height: 1, photo: 2, samples: 4, extra: 3, strips: [bytes(1,2,3,4)] }), "tiff")).rejects.toMatchObject(error("unsupported"));
  });

  it("requires explicit JXL and UltraHDR codecs and validates gain-map and allocation contracts", async () => {
    const jxl = bytes(0xff,0x0a,1,2), hdr = bytes(0xff,0xd8,0xff,0xd9);
    await expect(parseImageFormat(jxl, "jxl")).rejects.toMatchObject(error("codec-unavailable"));
    await expect(parseImageFormat(hdr, "ultrahdr")).rejects.toMatchObject(error("codec-unavailable"));
    await expect(parseImageFormat(bytes(0,1), "jxl")).rejects.toMatchObject(error("malformed"));
    const jxlCodec = vi.fn(() => ({ width: 1, height: 1, data: bytes(1,2,3,4), colorSpace: "linear" as const }));
    const image = await parseImageFormat(jxl, "jxl", { maxPixels: 10, maxDecodedBytes: 100, codecs: { jxl: jxlCodec } });
    expect(jxlCodec).toHaveBeenCalledWith(jxl, expect.objectContaining({ maxPixels: 10, maxDecodedBytes: 100 }));
    expect(rgba(image)).toEqual([1,2,3,4]); expect(image.colorSpace).toBe("linear");
    const hdrData = new Float32Array([2,1,0.5,1]);
    const codec = () => ({ width: 1, height: 1, data: hdrData, colorSpace: "linear" as const, metadata: { gainMapApplied: true } });
    expect(rgba(await parseImageFormat(hdr, "ultrahdr", { codecs: { ultrahdr: codec } }))).toEqual([2,1,0.5,1]);
    await expect(parseImageFormat(hdr, "ultrahdr", { codecs: { ultrahdr: () => ({ ...codec(), metadata: {} }) } })).rejects.toMatchObject(error("unsupported"));
    await expect(parseImageFormat(hdr, "ultrahdr", { codecs: { ultrahdr: () => ({ ...codec(), data: new Float32Array([NaN,0,0,1]) }) } })).rejects.toMatchObject(error("malformed"));
    await expect(parseImageFormat(hdr, "ultrahdr", { maxDecodedBytes: 8, codecs: { ultrahdr: codec } })).rejects.toMatchObject(error("limit"));
    const controller = new AbortController(), reason = new Error("cancelled by caller"); controller.abort(reason);
    await expect(parseImageFormat(jxl, "jxl", { signal: controller.signal, codecs: { jxl: jxlCodec } })).rejects.toBe(reason);
  });

  it("loads a bounded source via the asset manager adapter", async () => {
    const input = tga(bytes(3,2,1)), url = `data:application/octet-stream;base64,${Buffer.from(input).toString("base64")}`, progress: string[] = [];
    const asset = await new ImageFormatLoader("tga").load({ url, onProgress: (event) => progress.push(event.phase) }, new LoadContext());
    expect(rgba(asset)).toEqual([1,2,3,255]); expect(progress).toContain("complete");
  });
});
