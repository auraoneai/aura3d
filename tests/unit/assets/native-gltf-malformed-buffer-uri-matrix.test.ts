/**
 * S5-WP07-07: invalid-URI and malformed-buffer matrix for the glTF loader.
 *
 * Every document below is authored by hand against the glTF 2.0 / GLB 2.0
 * specification (buffers, bufferViews, accessors, data URIs, chunk layout).
 * Each malformed case must reject with a stable message, before any transport
 * for URI-policy failures, and without echoing the offending URI text.
 */
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

// One triangle: three VEC3 float positions, 36 bytes.
const FOUR_FLOATS = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const BASE64 = FOUR_FLOATS.toString("base64");

function documentWith(buffer: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asset: { version: "2.0" },
    buffers: [buffer],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    ...extra
  };
}

const dataUrl = (document: unknown) => `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;

async function loadJson(document: unknown, url?: string) {
  const loader = new GLTFLoader();
  if (url === undefined) return loader.load({ url: dataUrl(document), type: "gltf" }, new LoadContext());
  return loader.load({ url, type: "gltf" }, new LoadContext());
}

function pad4(bytes: Uint8Array, fill: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
}

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

/** Assemble GLB bytes from explicit chunks; header fields can be overridden to author defects. */
function glb(chunks: readonly { readonly type: number; readonly data: Uint8Array }[], header: { magic?: number; version?: number; length?: number } = {}): ArrayBuffer {
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, header.magic ?? 0x46546c67, true);
  view.setUint32(4, header.version ?? 2, true);
  view.setUint32(8, header.length ?? total, true);
  let offset = 12;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.byteLength, true);
    view.setUint32(offset + 4, chunk.type, true);
    out.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.byteLength;
  }
  return out.buffer;
}

const jsonChunk = (document: unknown) => ({ type: JSON_TYPE, data: pad4(new TextEncoder().encode(JSON.stringify(document)), 0x20) });
const binChunk = (bytes: Uint8Array) => ({ type: BIN_TYPE, data: pad4(bytes, 0) });
const glbDocument = documentWith({ byteLength: 36 });

async function loadGlb(bytes: ArrayBuffer) {
  return new GLTFLoader().load({ url: `data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`, type: "glb", format: "glb" }, new LoadContext());
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("glTF malformed embedded buffers", () => {
  it("accepts the well-formed baseline so every rejection below is caused by its single defect", async () => {
    const asset = await loadJson(documentWith({ byteLength: 36, uri: `data:application/octet-stream;base64,${BASE64}` }));
    expect(asset.meshes).toHaveLength(1);
    const glbAsset = await loadGlb(glb([jsonChunk(glbDocument), binChunk(FOUR_FLOATS)]));
    expect(glbAsset.meshes).toHaveLength(1);
  });

  it.each([
    ["missing comma separator", { byteLength: 36, uri: `data:application/octet-stream;base64${BASE64}` }, /comma separator/],
    ["wrong media type", { byteLength: 36, uri: `data:image/png;base64,${BASE64}` }, /media type/],
    ["illegal base64 alphabet", { byteLength: 36, uri: "data:application/octet-stream;base64,AAAA*AAA" }, /base64 payload is malformed/],
    ["non-terminal padding", { byteLength: 36, uri: "data:application/octet-stream;base64,AA==AAAA" }, /base64 payload is malformed/],
    ["impossible base64 length", { byteLength: 36, uri: "data:application/octet-stream;base64,AAAAA" }, /base64 payload is malformed/],
    ["malformed percent-encoding", { byteLength: 36, uri: "data:application/octet-stream;base64,%ZZAAAA" }, /valid URI encoding/],
    ["decoded payload shorter than byteLength", { byteLength: 72, uri: `data:application/octet-stream;base64,${BASE64}` }, /declares 72 bytes but loaded 36/],
    ["decoded payload longer than byteLength", { byteLength: 24, uri: `data:application/octet-stream;base64,${BASE64}` }, /declares 24 bytes but loaded 36/],
    ["negative byteLength", { byteLength: -1, uri: `data:application/octet-stream;base64,${BASE64}` }, /byteLength must be a non-negative integer/],
    ["fractional byteLength", { byteLength: 35.5, uri: `data:application/octet-stream;base64,${BASE64}` }, /byteLength must be a non-negative integer/],
    ["missing byteLength", { uri: `data:application/octet-stream;base64,${BASE64}` }, /byteLength must be a non-negative integer/],
    ["non-string uri", { byteLength: 36, uri: 42 }, /uri must be a string/],
    ["no uri and no GLB BIN chunk", { byteLength: 36 }, /missing a uri and no GLB BIN chunk/]
  ])("rejects a buffer with %s", async (_label, buffer, message) => {
    await expect(loadJson(documentWith(buffer))).rejects.toThrow(message);
  });

  it.each([
    ["bufferView past the end of its buffer", { bufferViews: [{ buffer: 0, byteOffset: 8, byteLength: 36 }] }, /exceeds buffer 0/],
    ["bufferView referencing a missing buffer", { bufferViews: [{ buffer: 3, byteOffset: 0, byteLength: 36 }] }, /Missing glTF buffer 3/],
    ["negative bufferView offset", { bufferViews: [{ buffer: 0, byteOffset: -4, byteLength: 36 }] }, /byteOffset must be a non-negative integer/],
    ["unaligned byteStride", { bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, byteStride: 6 }] }, /byteStride must be a 4-byte aligned/],
    ["accessor past the end of its bufferView", { accessors: [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 4, min: [0, 0, 0], max: [1, 1, 0] }] }, /accessor 0/i]
  ])("rejects %s", async (_label, extra, message) => {
    const document = documentWith({ byteLength: 36, uri: `data:application/octet-stream;base64,${BASE64}` }, extra);
    await expect(loadJson(document)).rejects.toThrow(message);
  });
});

describe("GLB container defects", () => {
  const valid = () => [jsonChunk(glbDocument), binChunk(FOUR_FLOATS)];
  it.each([
    ["truncated header", () => { const bytes = new Uint8Array(12); new DataView(bytes.buffer).setUint32(0, 0x46546c67, true); return bytes.buffer; }, /too small/],
    ["wrong magic", () => glb(valid(), { magic: 0x12345678 }), /content does not match declared glb format|Invalid GLB magic/],
    ["unsupported container version", () => glb(valid(), { version: 1 }), /Unsupported GLB version: 1/],
    ["header length disagreeing with the byte count", () => glb(valid(), { length: 64 }), /GLB length mismatch/],
    ["chunk length past the end of the file", () => {
      const bytes = new Uint8Array(glb(valid()));
      new DataView(bytes.buffer).setUint32(12, 1 << 20, true);
      return bytes.buffer;
    }, /Malformed GLB chunk length/],
    ["truncated chunk header", () => {
      const whole = new Uint8Array(glb(valid()));
      const cut = whole.slice(0, whole.byteLength - FOUR_FLOATS.byteLength - 4);
      new DataView(cut.buffer).setUint32(8, cut.byteLength, true);
      return cut.buffer;
    }, /Malformed GLB chunk header/],
    ["BIN chunk before the JSON chunk", () => glb([binChunk(FOUR_FLOATS), jsonChunk(glbDocument)]), /first chunk must be the JSON chunk/],
    ["no JSON chunk at all", () => glb([binChunk(FOUR_FLOATS)]), /first chunk must be the JSON chunk/],
    ["a second JSON chunk", () => glb([jsonChunk(glbDocument), binChunk(FOUR_FLOATS), jsonChunk(glbDocument)]), /exactly one JSON chunk/],
    ["a second BIN chunk", () => glb([jsonChunk(glbDocument), binChunk(FOUR_FLOATS), binChunk(FOUR_FLOATS)]), /BIN chunk must directly follow/],
    ["unparsable JSON chunk", () => glb([{ type: JSON_TYPE, data: pad4(new TextEncoder().encode("{\"asset\":"), 0x20) }, binChunk(FOUR_FLOATS)]), /Invalid GLB JSON chunk/],
    ["JSON chunk that is not an object", () => glb([{ type: JSON_TYPE, data: pad4(new TextEncoder().encode("null"), 0x20) }]), /Invalid GLB JSON chunk/],
    ["BIN chunk shorter than buffer 0", () => glb([jsonChunk(documentWith({ byteLength: 72 })), binChunk(FOUR_FLOATS)]), /declares 72 bytes but GLB BIN chunk has 36/]
  ])("rejects %s", async (_label, build, message) => {
    await expect(loadGlb(build())).rejects.toThrow(message);
  });

  it("skips chunks of unknown type, as the container specification requires", async () => {
    const unknown = { type: 0x5a5a5a5a, data: new Uint8Array(8) };
    const asset = await loadGlb(glb([jsonChunk(glbDocument), binChunk(FOUR_FLOATS), unknown]));
    expect(asset.meshes).toHaveLength(1);
  });
});

describe("glTF invalid dependency URIs", () => {
  const documentUrl = "https://assets.example.test/models/scene.gltf";
  const secret = "token=do-not-echo";

  function stubDocumentFetch(document: unknown) {
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input) === documentUrl) return new Response(JSON.stringify(document), { headers: { "content-type": "model/gltf+json" } });
      return new Response(FOUR_FLOATS);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each([
    ["javascript: scheme", `javascript:alert(1)//${secret}`, /scheme javascript: is not allowed/],
    ["file: scheme from a network document", `file:///etc/passwd?${secret}`, /scheme file: is not allowed/],
    ["ftp: scheme", `ftp://assets.example.test/a.bin?${secret}`, /scheme ftp: is not allowed/],
    ["unparsable authority", `http://[::1/a.bin?${secret}`, /not a valid URI reference/],
    ["empty string", "", /missing a uri|non-empty/],
    ["whitespace only", "   ", /non-empty string/]
  ])("refuses an external buffer with %s before any buffer transport and without echoing it", async (_label, uri, message) => {
    const fetchMock = stubDocumentFetch(documentWith({ byteLength: 36, uri }));
    const failure = await loadJson(undefined, documentUrl).then(() => undefined, (error: unknown) => error as Error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toMatch(message);
    expect(failure!.message).not.toContain("do-not-echo");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([documentUrl]);
  });

  it("refuses a relative buffer reference inside a data-URL document", async () => {
    await expect(loadJson(documentWith({ byteLength: 36, uri: "relative.bin" }))).rejects.toThrow(/relative uri cannot be resolved from a data URL document/);
  });

  it("resolves a relative buffer against its document and accepts a correctly sized response", async () => {
    const fetchMock = stubDocumentFetch(documentWith({ byteLength: 36, uri: "buffers/a%20b.bin" }));
    const asset = await loadJson(undefined, documentUrl);
    expect(asset.meshes).toHaveLength(1);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([documentUrl, "https://assets.example.test/models/buffers/a%20b.bin"]);
  });

  it("rejects an external buffer whose response length disagrees with byteLength, and HTTP failures", async () => {
    stubDocumentFetch(documentWith({ byteLength: 40, uri: "short.bin" }));
    await expect(loadJson(undefined, documentUrl)).rejects.toThrow(/declares 40 bytes but loaded 36/);
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => String(input) === documentUrl
      ? new Response(JSON.stringify(documentWith({ byteLength: 36, uri: "missing.bin" })))
      : new Response("not found", { status: 404 })));
    await expect(loadJson(undefined, documentUrl)).rejects.toThrow(/glTF buffer request failed with 404/);
  });

  it.each([
    ["javascript: scheme", "javascript:void(0)", /not allowed/],
    ["non-string uri", 7, /uri must be a non-empty string/],
    ["unparsable authority", "http://[::1/a.png", /not a valid URI reference/]
  ])("refuses an image with %s", async (_label, uri, message) => {
    const document = documentWith({ byteLength: 36, uri: `data:application/octet-stream;base64,${BASE64}` }, { images: [{ uri }] });
    const fetchMock = stubDocumentFetch(document);
    // Image URIs are validated at load (shape) and resolved before transport (scheme/parse).
    const integrity = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(document)));
    const digest = `sha256-${Buffer.from(integrity).toString("hex")}`;
    await expect(new GLTFLoader().load({ url: documentUrl, type: "gltf", integrity: { version: 1, digest } }, new LoadContext())).rejects.toThrow(message);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([documentUrl]);
  });
});
