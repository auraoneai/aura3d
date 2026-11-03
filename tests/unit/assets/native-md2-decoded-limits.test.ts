import { describe, expect, it } from "vitest";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import {
  AnimationFormatError,
  createMD2FormatAdapter,
  MD2Loader,
  parseMD2
} from "../../../packages/assets/src/loaders/AnimationFormatLoaders";

/** Independently encoded single-triangle MD2 with an adjustable frame count. */
function triangleMD2(frameCount = 2): Uint8Array {
  const headerSize = 68;
  const uvOffset = headerSize;
  const triangleOffset = uvOffset + 12;
  const frameOffset = triangleOffset + 12;
  const frameSize = 52;
  const endOffset = frameOffset + frameCount * frameSize;
  const bytes = new Uint8Array(endOffset);
  const view = new DataView(bytes.buffer);
  const header = [0x32504449, 8, 16, 16, frameSize, 0, 3, 3, 1, 0, frameCount,
    headerSize, uvOffset, triangleOffset, frameOffset, endOffset, endOffset];
  header.forEach((value, index) => view.setInt32(index * 4, value, true));
  [[0, 0], [16, 0], [0, 16]].forEach(([u, v], index) => {
    view.setInt16(uvOffset + index * 4, u!, true);
    view.setInt16(uvOffset + index * 4 + 2, v!, true);
    view.setUint16(triangleOffset + index * 2, index, true);
    view.setUint16(triangleOffset + 6 + index * 2, index, true);
  });
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frameOffset + frame * frameSize;
    for (let axis = 0; axis < 3; axis += 1) view.setFloat32(offset + axis * 4, 1, true);
    bytes.set(new TextEncoder().encode(`frame${frame}`), offset + 24);
    bytes.set([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, frame, 0], offset + 40);
  }
  return bytes;
}

function expectFormatError(action: () => unknown, code: string, message?: RegExp): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(AnimationFormatError);
  expect(caught).toMatchObject({ code });
  if (message) expect((caught as AnimationFormatError).message).toMatch(message);
}

describe("MD2 decoded typed-array limits", () => {
  // One triangle contributes 36 bytes; each of the two frames has
  // three vertices at 13 bytes apiece, for 114 decoded payload bytes.
  it.each([114, 115])("accepts a %i-byte decoded budget", (maxDecodedBytes) => {
    const asset = parseMD2(triangleMD2(), { maxDecodedBytes });
    expect(Array.from(asset.vertexIndices)).toEqual([0, 1, 2]);
    expect(Array.from(asset.texcoords)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(asset.frames).toHaveLength(2);
    expect(Array.from(asset.frames[1]!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 1]);
    expect(asset.normalIndices.map((normalIndices) => normalIndices.length)).toEqual([3, 3]);
  });

  it("rejects one byte below the combined payload with an actionable error", () => {
    expectFormatError(
      () => parseMD2(triangleMD2(), { maxDecodedBytes: 113 }),
      "OUTPUT_LIMIT",
      /MD2 decoded typed-array payload exceeds maxDecodedBytes.*increase the limit/
    );
  });

  it("accounts for every frame as well as the corner arrays", () => {
    const bytes = triangleMD2(3);
    // 36 corner bytes + 3 frames * 3 vertices * 13 bytes = 153.
    expectFormatError(() => parseMD2(bytes, { maxDecodedBytes: 152 }), "OUTPUT_LIMIT");
    expect(parseMD2(bytes, { maxDecodedBytes: 153 }).frames).toHaveLength(3);
    expect(parseMD2(bytes, { maxDecodedBytes: Number.MAX_SAFE_INTEGER }).frames).toHaveLength(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid decoded budget %s",
    (maxDecodedBytes) => {
      expectFormatError(() => parseMD2(triangleMD2(), { maxDecodedBytes }), "INVALID_LIMIT", /maxDecodedBytes/);
    }
  );

  it("keeps input, sample, vertex, and frame limits independent", () => {
    const bytes = triangleMD2();
    expect(bytes.byteLength).toBe(196);
    expect(parseMD2(bytes, { maxBytes: 196, maxDecodedBytes: 114 }).frames).toHaveLength(2);
    expectFormatError(() => parseMD2(bytes, { maxBytes: 195, maxDecodedBytes: 114 }), "INPUT_LIMIT");
    expectFormatError(() => parseMD2(bytes, { maxSamples: 5, maxDecodedBytes: 114 }), "SAMPLE_LIMIT");
    expectFormatError(() => parseMD2(bytes, { maxVertices: 2, maxDecodedBytes: 114 }), "COUNT_LIMIT");
    expectFormatError(() => parseMD2(bytes, { maxFrames: 1, maxDecodedBytes: 114 }), "COUNT_LIMIT");
  });

  it("accepts an ArrayBuffer and a Uint8Array with a nonzero byte offset", () => {
    const bytes = triangleMD2();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const backing = new Uint8Array(bytes.byteLength + 17);
    backing.set(bytes, 9);
    const view = backing.subarray(9, 9 + bytes.byteLength);
    const parsedBuffer = parseMD2(buffer, { maxDecodedBytes: 114 });
    const parsedView = parseMD2(view, { maxDecodedBytes: 114 });
    expect(Array.from(parsedView.vertexIndices)).toEqual(Array.from(parsedBuffer.vertexIndices));
    expect(Array.from(parsedView.frames[1]!.positions)).toEqual(Array.from(parsedBuffer.frames[1]!.positions));
  });

  it("checks the decoded budget before reading triangle indices", () => {
    const bytes = triangleMD2();
    new DataView(bytes.buffer).setUint16(80, 3, true);
    expectFormatError(() => parseMD2(bytes, { maxDecodedBytes: 113 }), "OUTPUT_LIMIT");
    expectFormatError(() => parseMD2(bytes, { maxDecodedBytes: 114 }), "INDEX_RANGE");
  });

  it("preserves loader constructor and per-call replacement semantics", () => {
    const bytes = triangleMD2();
    const loader = new MD2Loader({ maxDecodedBytes: 113 });
    expectFormatError(() => loader.parse(bytes), "OUTPUT_LIMIT");
    expect(loader.parse(bytes, { maxDecodedBytes: 114 }).frames).toHaveLength(2);
    expect(loader.parse(bytes, {}).frames).toHaveLength(2);
  });

  it("forwards the budget through the opt-in adapter loader", async () => {
    const bytes = triangleMD2();
    const url = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
    const request = { url, type: "md2" };
    const rejecting = createMD2FormatAdapter({ maxBytes: 196, maxDecodedBytes: 113 });
    await expect(rejecting.loader.load(request, new LoadContext())).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
    const accepting = createMD2FormatAdapter({ maxBytes: 196, maxDecodedBytes: 114 });
    const asset = await accepting.loader.load(request, new LoadContext());
    expect(asset.frames).toHaveLength(2);
  });
});
