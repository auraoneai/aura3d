import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodePngTexturePixels } from "../../../packages/engine/src/agent-api/PngTexturePixels";

/** Build source-local PNG chunks with their actual CRCs for independent fixtures. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) result[4 + i] = type.charCodeAt(i);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, 8 + data.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(8 + data.length, (~crc) >>> 0);
  return result;
}

function png(width: number, height: number, color: 2 | 6, raw: Uint8Array, split = false): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = color;
  const compressed = deflateSync(raw);
  const middle = Math.floor(compressed.length / 2);
  const pieces = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(split ? [chunk("IDAT", compressed.subarray(0, middle)), chunk("IDAT", compressed.subarray(middle))] : [chunk("IDAT", compressed)]),
    chunk("IEND", new Uint8Array())
  ];
  const result = new Uint8Array(pieces.reduce((size, piece) => size + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) { result.set(piece, offset); offset += piece.length; }
  return result;
}

/** A controllable output stream tests reader cleanup independently of zlib chunk size. */
function fakeInflate(chunks: readonly Uint8Array[], cancelRejects = false) {
  let output!: ReadableStream<Uint8Array>;
  let pulls = 0;
  const cancel = vi.fn(async () => { if (cancelRejects) throw new Error("cancellation failed"); });
  class FakeDecompressionStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable = new WritableStream<Uint8Array>({ write() {} });
    constructor() {
      let index = 0;
      output = this.readable = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls++;
          if (index < chunks.length) controller.enqueue(chunks[index++]!);
          else controller.close();
        },
        cancel
      }, { highWaterMark: 0 });
    }
  }
  vi.stubGlobal("DecompressionStream", FakeDecompressionStream);
  return { cancel, pulls: () => pulls, output: () => output };
}

afterEach(() => vi.unstubAllGlobals());

describe("bounded PNG scanline inflation", () => {
  it("retains exact RGBA pixels for every supported filter and RGB alpha defaults across split IDAT chunks", async () => {
    const rgba = png(2, 5, 6, new Uint8Array([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
      1, 10, 20, 30, 40, 1, 2, 3, 4,
      2, 10, 10, 10, 10, 20, 20, 20, 20,
      3, 30, 35, 40, 45, 25, 24, 24, 23,
      4, 1, 2, 3, 4, 5, 6, 7, 8
    ]), true);
    const decoded = await decodePngTexturePixels(rgba);
    expect(decoded && [decoded.width, decoded.height]).toEqual([2, 5]);
    expect(Array.from(decoded!.data)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
      10, 20, 30, 40, 11, 22, 33, 44,
      20, 30, 40, 50, 31, 42, 53, 64,
      40, 50, 60, 70, 60, 70, 80, 90,
      41, 52, 63, 74, 65, 76, 87, 98
    ]);

    const rgb = png(2, 2, 2, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 1, 10, 20, 30, 2, 3, 4]), true);
    const rgbDecoded = await decodePngTexturePixels(rgb);
    expect(Array.from(rgbDecoded!.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 10, 20, 30, 255, 12, 23, 34, 255]);
  });

  it("rejects scanlines shorter or longer than the image layout, including a high-expansion payload", async () => {
    await expect(decodePngTexturePixels(png(1, 1, 6, new Uint8Array([0, 1, 2, 3])))).rejects.toThrow(/scanline length.*truncated/);
    await expect(decodePngTexturePixels(png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4, 5])))).rejects.toThrow(/scanline length.*exceeds/);
    await expect(decodePngTexturePixels(png(1, 1, 6, new Uint8Array(1_000_000)))).rejects.toThrow(/scanline length.*exceeds/);
    await expect(decodePngTexturePixels(png(1, 1, 2, new Uint8Array([0, 1, 2, 3, 4])))).rejects.toThrow(/scanline length.*exceeds/);
  });

  it("stops at the first oversized output chunk, cancels, and releases the reader", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    const fake = fakeInflate([new Uint8Array(6), new Uint8Array(1)]);
    await expect(decodePngTexturePixels(fixture)).rejects.toThrow(/scanline length.*exceeds/);
    expect(fake.pulls()).toBe(1);
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(fake.output().locked).toBe(false);
  });

  it("checks for trailing output even when an earlier chunk filled the expected size", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    const fake = fakeInflate([new Uint8Array([0, 1, 2, 3, 4]), new Uint8Array([5])]);
    await expect(decodePngTexturePixels(fixture)).rejects.toThrow(/scanline length.*exceeds/);
    expect(fake.pulls()).toBe(2);
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(fake.output().locked).toBe(false);
  });

  it("does not mask the length error when stream cancellation itself rejects", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    const fake = fakeInflate([new Uint8Array(6)], true);
    await expect(decodePngTexturePixels(fixture)).rejects.toThrow(/scanline length.*exceeds/);
    expect(fake.cancel).toHaveBeenCalledOnce();
    expect(fake.output().locked).toBe(false);
  });

  it("assembles exact-length scanlines across multiple chunks and releases a completed reader", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    const fake = fakeInflate([new Uint8Array([0, 1]), new Uint8Array([2]), new Uint8Array([3, 4])]);
    const decoded = await decodePngTexturePixels(fixture);
    expect(Array.from(decoded!.data)).toEqual([1, 2, 3, 4]);
    expect(fake.cancel).not.toHaveBeenCalled();
    expect(fake.output().locked).toBe(false);
  });

  it("releases a reader after a short stream has closed", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    const fake = fakeInflate([new Uint8Array([0, 1, 2, 3])]);
    await expect(decodePngTexturePixels(fixture)).rejects.toThrow(/scanline length.*truncated/);
    expect(fake.cancel).not.toHaveBeenCalled();
    expect(fake.output().locked).toBe(false);
  });

  it("releases a reader when decompression fails", async () => {
    const fixture = png(1, 1, 6, new Uint8Array([0, 1, 2, 3, 4]));
    let output!: ReadableStream<Uint8Array>;
    class FailedDecompressionStream {
      readonly readable = output = new ReadableStream<Uint8Array>({
        pull(controller) { controller.error(new Error("inflate failed")); }
      });
      readonly writable = new WritableStream<Uint8Array>({ write() {} });
    }
    vi.stubGlobal("DecompressionStream", FailedDecompressionStream);
    await expect(decodePngTexturePixels(fixture)).rejects.toThrow("inflate failed");
    expect(output.locked).toBe(false);
  });
});
