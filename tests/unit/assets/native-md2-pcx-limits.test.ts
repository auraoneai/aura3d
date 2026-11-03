import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import {
  AnimationFormatError,
  createMD2FormatAdapter,
  createMD2GLTFAsset,
  decodeMD2PCXSkin,
  parseMD2,
  type MD2Asset
} from "../../../packages/assets/src/loaders/AnimationFormatLoaders";

/** Encode uniform planar data without relying on an external PCX fixture. */
function pcx(width = 1, height = 1, planes: 1 | 3 = 1, rowBytes = 2): Uint8Array {
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);
  header[0] = 10; header[1] = 5; header[2] = 1; header[3] = 8;
  view.setUint16(8, width - 1, true); view.setUint16(10, height - 1, true);
  header[65] = planes; view.setUint16(66, rowBytes, true);
  const data: number[] = [];
  for (let y = 0; y < height; y += 1) for (let plane = 0; plane < planes; plane += 1) {
    const value = planes === 1 ? 1 : [17, 34, 51][plane]!;
    for (let remaining = rowBytes; remaining > 0;) {
      const count = Math.min(remaining, 63);
      if (count > 1) data.push(0xc0 | count, value);
      else data.push(value);
      remaining -= count;
    }
  }
  const palette = planes === 1 ? new Uint8Array(769) : new Uint8Array();
  if (planes === 1) {
    palette[0] = 12;
    palette.set([17, 34, 51], 4);
  }
  const bytes = new Uint8Array(header.length + data.length + palette.length);
  bytes.set(header); bytes.set(data, header.length); bytes.set(palette, header.length + data.length);
  return bytes;
}

/** Read standard PNG chunk metadata and independently inflate its image bytes. */
function inspectPng(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let cursor = 8, width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (cursor < png.length) {
    const length = view.getUint32(cursor, false);
    const name = String.fromCharCode(...png.subarray(cursor + 4, cursor + 8));
    const start = cursor + 8, end = start + length;
    expect(end + 4).toBeLessThanOrEqual(png.length);
    if (name === "IHDR") {
      width = view.getUint32(start, false); height = view.getUint32(start + 4, false);
      expect(Array.from(png.subarray(start + 8, start + 13))).toEqual([8, 2, 0, 0, 0]);
    }
    if (name === "IDAT") idat.push(png.subarray(start, end));
    cursor = end + 4;
    if (name === "IEND") break;
  }
  expect(cursor).toBe(png.length);
  const compressed = Buffer.concat(idat.map((part) => Buffer.from(part)));
  return { width, height, pixels: inflateSync(compressed) };
}

function triangleMD2(): MD2Asset {
  const uvOffset = 68, triangleOffset = 80, frameOffset = 92, frameSize = 52, endOffset = 144;
  const bytes = new Uint8Array(endOffset), view = new DataView(bytes.buffer);
  const header = [0x32504449, 8, 16, 16, frameSize, 0, 3, 3, 1, 0, 1,
    68, uvOffset, triangleOffset, frameOffset, endOffset, endOffset];
  header.forEach((value, index) => view.setInt32(index * 4, value, true));
  [[0, 0], [16, 0], [0, 16]].forEach(([u, v], index) => {
    view.setInt16(uvOffset + index * 4, u!, true); view.setInt16(uvOffset + index * 4 + 2, v!, true);
    view.setUint16(triangleOffset + index * 2, index, true); view.setUint16(triangleOffset + 6 + index * 2, index, true);
    view.setFloat32(frameOffset + index * 4, 1, true);
  });
  bytes.set([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], frameOffset + 40);
  return parseMD2(bytes);
}

function skinAsset(skin: Uint8Array): MD2Asset {
  return { ...triangleMD2(), skinAssets: [{ uri: "independent.pcx", bytes: skin }] };
}

function failOnSampling(asset: MD2Asset): MD2Asset {
  return { ...asset, frames: asset.frames.map((frame) => ({
    ...frame, get time(): number { throw new Error("frame sampled before PCX preflight"); }
  })) };
}

function expectFormatError(action: () => unknown, code: string, message?: RegExp): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(AnimationFormatError);
  expect(caught).toMatchObject({ code });
  if (message) expect((caught as AnimationFormatError).message).toMatch(message);
}

describe("MD2 PCX skin allocation limits", () => {
  it.each([
    { planes: 1 as const, work: 106 },
    { planes: 3 as const, work: 110 }
  ])("decodes a $planes-plane image at its exact output and working limits", ({ planes, work }) => {
    const source = pcx(1, 1, planes);
    const png = decodeMD2PCXSkin(source, 72, work);
    expect(png.byteLength).toBe(72);
    const image = inspectPng(png);
    expect([image.width, image.height]).toEqual([1, 1]);
    expect(Array.from(image.pixels)).toEqual([0, 17, 34, 51]);
    expectFormatError(() => decodeMD2PCXSkin(source, 71, work), "OUTPUT_LIMIT", /PNG exceeds maxBytes/);
    expectFormatError(() => decodeMD2PCXSkin(source, 72, work - 1), "OUTPUT_LIMIT", /maxPCXWorkingBytes/);
  });

  it("preserves the positional maxBytes contract and checks view offsets", () => {
    const source = pcx();
    const backing = new Uint8Array(source.length + 19); backing.set(source, 7);
    expect(Array.from(decodeMD2PCXSkin(backing.subarray(7, 7 + source.length), 72)))
      .toEqual(Array.from(decodeMD2PCXSkin(source, 72)));
    expect(decodeMD2PCXSkin(source).length).toBe(72);
    expectFormatError(() => decodeMD2PCXSkin(source, 0), "INVALID_LIMIT", /maxBytes/);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid working limit %s",
    (maximum) => expectFormatError(() => decodeMD2PCXSkin(pcx(), 72, maximum), "INVALID_LIMIT", /maxPCXWorkingBytes/)
  );

  it("retains header, palette, and RLE validation", () => {
    const short = new Uint8Array(10);
    expectFormatError(() => decodeMD2PCXSkin(short), "UNSUPPORTED_MD2_SKIN");
    const planes = pcx(); planes[65] = 2;
    expectFormatError(() => decodeMD2PCXSkin(planes), "UNSUPPORTED_MD2_SKIN");
    const dimensions = pcx(); new DataView(dimensions.buffer).setUint16(66, 0, true);
    expectFormatError(() => decodeMD2PCXSkin(dimensions), "UNSUPPORTED_MD2_SKIN");
    const palette = pcx(); palette[palette.length - 769] = 0;
    expectFormatError(() => decodeMD2PCXSkin(palette), "TRUNCATED", /palette/);
    const incomplete = pcx(); incomplete[128] = 0xc1;
    expectFormatError(() => decodeMD2PCXSkin(incomplete), "TRUNCATED", /pixel data/);
    const overrun = pcx(); overrun[128] = 0xc3;
    expectFormatError(() => decodeMD2PCXSkin(overrun), "INVALID_MD2_SKIN", /run exceeds/);
  });

  it("preflights output and working budgets before reading malformed RLE", () => {
    const source = pcx(); source[128] = 0xc3;
    expectFormatError(() => decodeMD2PCXSkin(source, 71), "OUTPUT_LIMIT", /PNG exceeds maxBytes/);
    expectFormatError(() => decodeMD2PCXSkin(source, 72, 105), "OUTPUT_LIMIT", /maxPCXWorkingBytes/);
    expectFormatError(() => decodeMD2PCXSkin(source, 72, 106), "INVALID_MD2_SKIN", /run exceeds/);
  });

  it.each([
    { width: 28, height: 771, pngBytes: 65_603 },
    { width: 5, height: 4096, pngBytes: 65_609 }
  ])("counts DEFLATE blocks for $width × $height scanlines", ({ width, height, pngBytes }) => {
    const source = pcx(width, height, 1, width);
    const png = decodeMD2PCXSkin(source, pngBytes);
    expect(png.length).toBe(pngBytes);
    const image = inspectPng(png);
    expect([image.width, image.height]).toEqual([width, height]);
    expect(image.pixels.length).toBe((width * 3 + 1) * height);
    expect(Array.from(image.pixels.subarray(0, 4))).toEqual([0, 17, 34, 51]);
    expectFormatError(() => decodeMD2PCXSkin(source, pngBytes - 1), "OUTPUT_LIMIT", /PNG exceeds maxBytes/);
  });

  it("rejects a combined geometry and PCX output excess before sampling", async () => {
    const asset = failOnSampling(skinAsset(pcx()));
    await expect(createMD2GLTFAsset(asset, { maxBytes: 167 })).rejects.toMatchObject({
      code: "OUTPUT_LIMIT", message: expect.stringContaining("geometry and skin")
    });
    await expect(createMD2GLTFAsset(asset, { maxBytes: 168, maxPCXWorkingBytes: 105 })).rejects.toMatchObject({
      code: "OUTPUT_LIMIT", message: expect.stringContaining("maxPCXWorkingBytes")
    });
  });

  it("accepts exact combined output with decoded PCX padding larger than the remaining allowance", async () => {
    // Geometry is 96 bytes; PNG is 72 bytes; decoded padded PCX is 80 bytes.
    const projected = await createMD2GLTFAsset(skinAsset(pcx(1, 1, 1, 80)), { maxBytes: 168 });
    try {
      const image = inspectPng(new Uint8Array(projected.images[0]!.data!));
      expect(Array.from(image.pixels)).toEqual([0, 17, 34, 51]);
      expect(projected.meshes[0]?.positions).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    } finally { new GLTFLoader().dispose(projected); }
  });

  it("keeps non-PCX skins independent of the PCX working budget", async () => {
    const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const projected = await createMD2GLTFAsset(skinAsset(signature), { maxBytes: 104, maxPCXWorkingBytes: 1 });
    try {
      expect(Array.from(new Uint8Array(projected.images[0]!.data!))).toEqual(Array.from(signature));
    } finally { new GLTFLoader().dispose(projected); }
  });

  it("forwards the PCX working budget through the opt-in adapter", async () => {
    const adapter = createMD2FormatAdapter({ maxBytes: 168, maxPCXWorkingBytes: 105 });
    expect(adapter.buildRenderableScene).toBeDefined();
    await expect(adapter.buildRenderableScene!(failOnSampling(skinAsset(pcx())), {})).rejects.toMatchObject({
      code: "OUTPUT_LIMIT", message: expect.stringContaining("maxPCXWorkingBytes")
    });
  });
});
