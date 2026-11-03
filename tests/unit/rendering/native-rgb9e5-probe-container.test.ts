import { readFileSync } from "node:fs";
import { read as readKtx } from "ktx-parse";
import { describe, expect, it } from "vitest";
import { readRgb9e5Cube } from "../../../packages/rendering/src/environment/Rgb9e5Cube";

// The header, index and six RGBSDA sample records below are authored from
// Khronos KTX2 and Data Format 1.4, Table 102. Values are synthetic; this is
// not a relabeled historical probe or a claim about an external image asset.
const magic = Uint8Array.of(0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a);
const encoder = new TextEncoder();

function metadataRecord(key: string, value: string): Uint8Array {
  const bytes = encoder.encode(`${key}\0${value}\0`);
  const result = new Uint8Array(Math.ceil((4 + bytes.length) / 4) * 4);
  new DataView(result.buffer).setUint32(0, bytes.length, true);
  result.set(bytes, 4);
  return result;
}

function cube(standard: boolean, records: Uint8Array[] = []): Uint8Array {
  const header = standard ? 80 : 68;
  const mipCount = 2;
  const indexEnd = header + mipCount * 24;
  const descriptorLength = standard ? 124 : 0;
  const metadataLength = records.reduce((sum, record) => sum + record.length, 0);
  const descriptorOffset = indexEnd;
  const metadataOffset = descriptorOffset + descriptorLength;
  const dataOffset = metadataOffset + metadataLength;
  const sizes = [96, 24]; // 2×2×6 and 1×1×6 packed 32-bit texels.
  const bytes = new Uint8Array(dataOffset + sizes[0]! + sizes[1]!);
  const view = new DataView(bytes.buffer);
  bytes.set(magic);
  view.setUint32(12, standard ? 123 : 142, true);
  view.setUint32(16, 4, true);
  view.setUint32(20, 2, true);
  view.setUint32(24, 2, true);
  view.setUint32(36, 6, true);
  view.setUint32(40, mipCount, true);
  view.setUint32(48, standard ? descriptorOffset : 68, true);
  view.setUint32(52, descriptorLength, true);
  view.setUint32(56, standard ? metadataOffset : 68, true);
  view.setUint32(60, metadataLength, true);
  if (standard) {
    view.setUint32(descriptorOffset, descriptorLength, true);
    view.setUint16(descriptorOffset + 8, 2, true);
    view.setUint16(descriptorOffset + 10, 120, true);
    view.setUint8(descriptorOffset + 12, 1); // RGBSDA
    view.setUint8(descriptorOffset + 13, 1); // BT.709 primaries
    view.setUint8(descriptorOffset + 14, 1); // linear transfer
    view.setUint8(descriptorOffset + 20, 4); // four-byte texel
    for (let channel = 0; channel < 3; channel += 1) {
      for (let exponent = 0; exponent < 2; exponent += 1) {
        const sample = descriptorOffset + 28 + (channel * 2 + exponent) * 16;
        view.setUint16(sample, exponent ? 27 : 9 * channel, true);
        view.setUint8(sample + 2, exponent ? 4 : 8);
        view.setUint8(sample + 3, channel | (exponent ? 0x20 : 0));
        view.setUint32(sample + 8, exponent ? 15 : 0, true);
        view.setUint32(sample + 12, exponent ? 31 : 8448, true);
      }
    }
  }
  let meta = metadataOffset;
  for (const record of records) { bytes.set(record, meta); meta += record.length; }
  // The smaller mip precedes the larger one on disk; index order stays logical.
  const offsets = [dataOffset + sizes[1]!, dataOffset];
  for (let level = 0; level < mipCount; level += 1) {
    const entry = header + 24 * level;
    view.setBigUint64(entry, BigInt(offsets[level]!), true);
    view.setBigUint64(entry + 8, BigInt(sizes[level]!), true);
    view.setBigUint64(entry + 16, BigInt(sizes[level]!), true);
    const texelsPerFace = level === 0 ? 4 : 1;
    for (let face = 0; face < 6; face += 1) {
      // exponent=16, green=128 and blue=64 yield [*, .5, .25].
      const red = level === 0 ? 256 + face * 16 : 128;
      const word = ((16 << 27) | (64 << 18) | (128 << 9) | red) >>> 0;
      for (let t = 0; t < texelsPerFace; t += 1) {
        view.setUint32(offsets[level]! + (face * texelsPerFace + t) * 4, word, true);
      }
    }
  }
  return bytes;
}

function edited(bytes: Uint8Array, edit: (view: DataView) => void): Uint8Array {
  const copy = bytes.slice();
  edit(new DataView(copy.buffer));
  return copy;
}

describe("RGB9E5 probe container formats", () => {
  it("decodes a table-derived standard KTX2 cube with metadata and out-of-order mip offsets", () => {
    const bytes = cube(true, [metadataRecord("KTXorientation", "rd"), metadataRecord("KTXswizzle", "rgb1")]);
    const parsed = readKtx(bytes);
    expect(parsed.vkFormat).toBe(123);
    expect(parsed.faceCount).toBe(6);
    expect(parsed.dataFormatDescriptor[0]!.samples.map((sample) => [sample.bitOffset, sample.bitLength, sample.channelType])).toEqual([
      [0, 8, 0], [27, 4, 32], [9, 8, 1], [27, 4, 33], [18, 8, 2], [27, 4, 34]
    ]);
    const result = readRgb9e5Cube(bytes);
    expect(result.faceSize).toBe(2);
    expect(result.mipCount).toBe(2);
    for (let face = 0; face < 6; face += 1) {
      expect(Array.from(result.levels[0]![face]!.subarray(0, 4))).toEqual([1 + face / 16, .5, .25, 1]);
      expect(Array.from(result.levels[1]![face]!)).toEqual([.5, .5, .25, 1]);
    }
  });

  it("keeps the actual bundled historical probe readable without relabeling its bytes", () => {
    const source = readFileSync("public/aura-environments/studio.specular.ktx2");
    expect(source.readUInt32LE(12)).toBe(142);
    const result = readRgb9e5Cube(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
    expect(result.faceSize).toBe(256);
    expect(result.mipCount).toBe(5);
    expect(result.levels[0]).toHaveLength(6);
    expect(result.levels[4]![0]!.every(Number.isFinite)).toBe(true);
  });

  it.each([true, false])("decodes an unaligned byte subarray in %s layout", (standard) => {
    const data = cube(standard);
    const storage = new Uint8Array(data.length + 3);
    storage.set(data, 1);
    const result = readRgb9e5Cube(storage.subarray(1, data.length + 1));
    expect(Array.from(result.levels[0]![1]!.subarray(0, 4))).toEqual([1.0625, .5, .25, 1]);
  });

  it("rejects wrong descriptors, unsupported primaries, and contradictory sample packing", () => {
    const good = cube(true);
    const descriptor = new DataView(good.buffer).getUint32(48, true);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint8(descriptor + 13, 0)))).toThrow(/ENV_KTX2_DESCRIPTOR/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint8(descriptor + 14, 2)))).toThrow(/ENV_KTX2_DESCRIPTOR/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint16(descriptor + 28, 1, true)))).toThrow(/ENV_KTX2_DESCRIPTOR/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint8(descriptor + 20, 8)))).toThrow(/ENV_KTX2_DESCRIPTOR/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint32(52, 28, true)))).toThrow(/ENV_KTX2_DESCRIPTOR/);
  });

  it("rejects metadata orientation, swizzle, duplicate records and malformed padding", () => {
    expect(() => readRgb9e5Cube(cube(true, [metadataRecord("KTXorientation", "ru")]))).toThrow(/ENV_KTX2_METADATA/);
    expect(() => readRgb9e5Cube(cube(true, [metadataRecord("KTXswizzle", "bgra")]))).toThrow(/ENV_KTX2_METADATA/);
    expect(() => readRgb9e5Cube(cube(true, [metadataRecord("KTXorientation", "rd"), metadataRecord("KTXorientation", "rd")]))).toThrow(/ENV_KTX2_METADATA/);
    const record = metadataRecord("KTXwriter", "xy");
    record[record.length - 1] = 1;
    expect(() => readRgb9e5Cube(cube(true, [record]))).toThrow(/ENV_KTX2_METADATA/);
    const unterminated = metadataRecord("KTXorientation", "rd");
    const view = new DataView(unterminated.buffer);
    view.setUint32(0, view.getUint32(0, true) - 1, true);
    expect(() => readRgb9e5Cube(cube(true, [unterminated]))).toThrow(/ENV_KTX2_METADATA/);
    expect(readRgb9e5Cube(cube(true, [metadataRecord("x".repeat(4096), "x")])).faceSize).toBe(2);
  });

  it.each([true, false])("rejects invalid dimensions, level bounds and overlapping payloads in %s layout", (standard) => {
    const good = cube(standard);
    const index = standard ? 80 : 68;
    expect(() => readRgb9e5Cube(edited(good, (v) => { v.setUint32(20, 0, true); v.setUint32(24, 0, true); }))).toThrow(/ENV_KTX2_NONSQUARE/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setUint32(40, 4, true)))).toThrow(/ENV_KTX2_LEVELS/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(index, 2n ** 63n, true)))).toThrow(/ENV_KTX2_TRUNCATED/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(index, BigInt(index + 1), true)))).toThrow(/ENV_KTX2_LAYOUT/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(index + 16, 1n, true)))).toThrow(/ENV_KTX2_LEVELSIZE/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(index + 24, v.getBigUint64(index, true), true)))).toThrow(/ENV_KTX2_LAYOUT/);
  });

  it("does not reinterpret a standard format-142 texture as a legacy RGB9E5 probe", () => {
    const bytes = edited(cube(true), (v) => v.setUint32(12, 142, true));
    expect(() => readRgb9e5Cube(bytes)).toThrow(/ENV_KTX2_LAYOUT/);
  });

  it("rejects standard descriptor or payload overlap, truncation and global data", () => {
    const good = cube(true);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(64, 16n, true)))).toThrow(/ENV_KTX2_LAYOUT/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(80, BigInt(v.getUint32(48, true)), true)))).toThrow(/ENV_KTX2_LAYOUT/);
    expect(() => readRgb9e5Cube(good.subarray(0, 130))).toThrow(/ENV_KTX2_TRUNCATED/);
    expect(() => readRgb9e5Cube(edited(good, (v) => v.setBigUint64(80 + 16, 0n, true)))).toThrow(/ENV_KTX2_LEVELSIZE/);
  });
});
