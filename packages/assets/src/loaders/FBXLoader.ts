import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";

/** Bounded FBX import. Lengths are in metres in the resulting scene. */
export interface FBXImportOptions {
  readonly maxBytes?: number;
  readonly maxNodes?: number;
  readonly maxArrayElements?: number;
  /** Maximum pixels across distinct textures, including embedded images. */
  readonly maxTexturePixels?: number;
  readonly maxTextureDimension?: number;
  readonly signal?: AbortSignal;
}
export interface FBXDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "warning";
}
export interface FBXImportResult {
  readonly gltf: Record<string, unknown>;
  readonly version: number;
  readonly unitInMeters: number;
  readonly dependencies: readonly string[];
  readonly diagnostics: readonly FBXDiagnostic[];
  readonly embeddedTexturePixels: number;
}
export interface FBXAsset extends GLTFAsset {
  readonly fbx: Omit<FBXImportResult, "gltf">;
}

type Value = string | number | boolean | Uint8Array | readonly number[] | readonly string[];
interface Node { name: string; values: Value[]; children: Node[] }
interface Limits { maxBytes: number; maxNodes: number; maxArrayElements: number; maxTexturePixels: number; maxTextureDimension: number; texturePixels: number; nodes: number; elements: number; work: number; signal?: AbortSignal }
interface Link { child: string; parent: string; property: string }
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

const DEFAULT_BYTES = 64 * 1024 * 1024;
const DEFAULT_NODES = 200_000;
const DEFAULT_ELEMENTS = 16_000_000;
const DEFAULT_TEXTURE_PIXELS = 16_777_216;
const DEFAULT_TEXTURE_DIMENSION = 8192;
const FBX_TICKS = 46_186_158_000;
const BINARY_MAGIC = "Kaydara FBX Binary  \0\x1a\0";

function limits(options: FBXImportOptions): Limits {
  const values = [options.maxBytes ?? DEFAULT_BYTES, options.maxNodes ?? DEFAULT_NODES, options.maxArrayElements ?? DEFAULT_ELEMENTS, options.maxTexturePixels ?? DEFAULT_TEXTURE_PIXELS, options.maxTextureDimension ?? DEFAULT_TEXTURE_DIMENSION];
  if (values.some((n) => !Number.isSafeInteger(n) || n <= 0)) throw new Error("FBX_LIMIT_INVALID: limits must be positive safe integers");
  return { maxBytes: values[0]!, maxNodes: values[1]!, maxArrayElements: values[2]!, maxTexturePixels: values[3]!, maxTextureDimension: values[4]!, texturePixels: 0, nodes: 0, elements: 0, work: 0, signal: options.signal };
}
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("FBX import aborted", "AbortError");
}
function chargeNode(limits: Limits): void {
  throwIfAborted(limits.signal);
  if (++limits.nodes > limits.maxNodes) throw new Error("FBX_LIMIT_NODES: node count exceeds limit");
}
function chargeElements(limits: Limits, n: number): void {
  throwIfAborted(limits.signal);
  if (!Number.isSafeInteger(n) || n < 0 || limits.elements + n > limits.maxArrayElements) throw new Error("FBX_LIMIT_ARRAY: element count exceeds limit");
  limits.elements += n;
}
function child(node: Node | undefined, name: string): Node | undefined { return node?.children.find((item) => item.name === name); }
function children(node: Node | undefined, name: string): Node[] { return node?.children.filter((item) => item.name === name) ?? []; }
function text(value: Value | undefined): string { return value === undefined ? "" : String(value); }
function number(value: Value | undefined, label: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n)) throw new Error(`FBX_INVALID_NUMBER: ${label}`);
  return n;
}
function scalar(node: Node | undefined, fallback = ""): string { return node?.values.length ? text(node.values[0]) : fallback; }
function array(node: Node | undefined, label: string): number[] {
  if (!node) return [];
  const value = node.values[0];
  const source: readonly Value[] = Array.isArray(value) ? value : (child(node, "a")?.values ?? node.values);
  if (typeof value === "string" && value.startsWith("*")) {
    const count = Number(value.slice(1));
    if (!Number.isSafeInteger(count) || count < 0 || count !== source.length) throw new Error(`FBX_INVALID_ARRAY: ${label} declared count mismatch`);
  }
  return source.map((entry) => number(entry, label));
}
function property(node: Node | undefined, name: string): Value[] | undefined {
  return children(child(node, "Properties70"), "P").find((p) => text(p.values[0]) === name)?.values.slice(4);
}
function propNumber(node: Node | undefined, name: string, fallback: number): number {
  const p = property(node, name); return p?.length ? number(p[0], name) : fallback;
}
function propVec(node: Node | undefined, name: string, fallback: Vec3): Vec3 {
  const p = property(node, name); return p && p.length >= 3 ? [number(p[0], name), number(p[1], name), number(p[2], name)] : [...fallback];
}
function identifier(node: Node): string { const id = text(node.values[0]); if (!id) throw new Error(`FBX_INVALID_ID: ${node.name}`); return id; }
function cleanName(raw: string): string { return (raw.includes("::") ? raw.slice(raw.indexOf("::") + 2) : raw).replace(/\0.*$/, ""); }

interface Token { kind: "value" | "{" | "}" | ":" | "," | "nl"; value: string }
function tokenize(source: string, limit: Limits): Token[] {
  const result: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (c === "\r" || c === "\n") { if (c === "\r" && source[i + 1] === "\n") i++; result.push({ kind: "nl", value: "" }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === ";") { while (i < source.length && source[i] !== "\r" && source[i] !== "\n") i++; continue; }
    if (c === "{" || c === "}" || c === ":" || c === ",") { result.push({ kind: c, value: c }); i++; continue; }
    if (c === '"') {
      let out = ""; i++; let closed = false;
      while (i < source.length) {
        const x = source[i++]!;
        if (x === '"') { closed = true; break; }
        if (x === "\\" && i < source.length) { const next = source[i]!; if (next === '"' || next === "\\") { out += next; i++; continue; } }
        out += x;
      }
      if (!closed) throw new Error("FBX_ASCII_TRUNCATED: unterminated string");
      result.push({ kind: "value", value: out });
    } else {
      const start = i;
      while (i < source.length && !/[\s{}:,;]/.test(source[i]!)) i++;
      if (i === start) throw new Error("FBX_ASCII_INVALID: unexpected character");
      result.push({ kind: "value", value: source.slice(start, i) });
    }
    if (result.length > limit.maxArrayElements * 3 + limit.maxNodes * 4) throw new Error("FBX_LIMIT_TOKENS: token count exceeds limit");
  }
  return result;
}
function parseAscii(source: string, limit: Limits): Node[] {
  const tokens = tokenize(source, limit); let pos = 0;
  function parseChildren(depth: number, nested: boolean): Node[] {
    if (depth > 128) throw new Error("FBX_LIMIT_DEPTH: nesting exceeds limit");
    const nodes: Node[] = [];
    while (pos < tokens.length) {
      while (tokens[pos]?.kind === "nl" || tokens[pos]?.kind === ",") pos++;
      if (tokens[pos]?.kind === "}") { if (!nested) throw new Error("FBX_ASCII_INVALID: unexpected closing brace"); pos++; return nodes; }
      if (pos >= tokens.length) break;
      const name = tokens[pos++];
      if (name?.kind !== "value" || tokens[pos++]?.kind !== ":") throw new Error("FBX_ASCII_INVALID: expected node and colon");
      chargeNode(limit);
      const values: Value[] = []; let trailingComma = false; let appended = false;
      while (pos < tokens.length) {
        const token = tokens[pos]!;
        if (token.kind === "{") { pos++; const nestedNodes = parseChildren(depth + 1, true); nodes.push({ name: name.value, values, children: nestedNodes }); appended = true; break; }
        if (token.kind === "}") { nodes.push({ name: name.value, values, children: [] }); appended = true; break; }
        if (token.kind === "nl") {
          pos++;
          if (trailingComma) continue;
          nodes.push({ name: name.value, values, children: [] }); appended = true; break;
        }
        if (token.kind === ",") { trailingComma = true; pos++; continue; }
        if (token.kind !== "value") throw new Error("FBX_ASCII_INVALID: unexpected property token");
        trailingComma = false; values.push(token.value); chargeElements(limit, 1); pos++;
      }
      if (!appended) nodes.push({ name: name.value, values, children: [] });
    }
    if (nested) throw new Error("FBX_ASCII_TRUNCATED: unclosed node");
    return nodes;
  }
  return parseChildren(0, false);
}

async function inflate(bytes: Uint8Array, expected: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("FBX_UNSUPPORTED_DEFLATE: DecompressionStream is unavailable");
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = source.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  const abort = (): void => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) { throwIfAborted(signal); const part = await reader.read(); throwIfAborted(signal); if (part.done) break; total += part.value.length; if (total > expected) throw new Error("FBX_INVALID_ARRAY: decompressed data exceeds declared size"); chunks.push(part.value); }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throwIfAborted(signal);
    if (error instanceof Error && error.message.startsWith("FBX_")) throw error;
    throw new Error("FBX_INVALID_DEFLATE: compressed array cannot be decoded", { cause: error });
  } finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
  if (total !== expected) throw new Error("FBX_INVALID_ARRAY: decompressed data length mismatch");
  const result = new Uint8Array(total); let offset = 0; for (const c of chunks) { result.set(c, offset); offset += c.length; } return result;
}
async function parseBinary(bytes: Uint8Array, limit: Limits): Promise<{ nodes: Node[]; version: number }> {
  if (bytes.length < 27) throw new Error("FBX_BINARY_TRUNCATED: missing header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const version = view.getUint32(23, true); const wide = version >= 7500; const header = wide ? 25 : 13;
  if (version < 7000 || version >= 8000) throw new Error(`FBX_UNSUPPORTED_VERSION: ${version}`);
  let offset = 27;
  const requireBytes = (n: number): void => { if (!Number.isSafeInteger(n) || n < 0 || offset + n > bytes.length) throw new Error("FBX_BINARY_TRUNCATED: invalid record length"); };
  const u32 = (): number => { requireBytes(4); const n = view.getUint32(offset, true); offset += 4; return n; };
  const u64 = (): number => { requireBytes(8); const n = view.getBigUint64(offset, true); offset += 8; if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FBX_LIMIT_OFFSET: integer exceeds safe range"); return Number(n); };
  async function propertyValue(end: number): Promise<Value> {
    requireBytes(1); const type = String.fromCharCode(bytes[offset++]!);
    const sizes: Record<string, number> = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 };
    if (type in sizes) {
      const size = sizes[type]!; requireBytes(size); const at = offset; offset += size;
      if (type === "Y") return view.getInt16(at, true);
      if (type === "C") return view.getUint8(at) !== 0;
      if (type === "I") return view.getInt32(at, true);
      if (type === "F") return view.getFloat32(at, true);
      if (type === "D") return view.getFloat64(at, true);
      return view.getBigInt64(at, true).toString();
    }
    if (type === "S" || type === "R") { const length = u32(); requireBytes(length); const data = bytes.subarray(offset, offset + length); offset += length; return type === "S" ? new TextDecoder().decode(data) : data.slice(); }
    const arraySizes: Record<string, number> = { f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 };
    const size = arraySizes[type]; if (!size) throw new Error(`FBX_UNSUPPORTED_PROPERTY: ${type}`);
    const count = u32(), encoding = u32(), length = u32(); chargeElements(limit, count); requireBytes(length);
    const expected = count * size; if (!Number.isSafeInteger(expected) || expected > limit.maxBytes * 4) throw new Error("FBX_LIMIT_ARRAY_BYTES: decoded array exceeds limit");
    const raw = bytes.subarray(offset, offset + length); offset += length;
    const data = encoding === 0 ? raw : encoding === 1 ? await inflate(raw, expected, limit.signal) : (() => { throw new Error(`FBX_UNSUPPORTED_ENCODING: ${encoding}`); })();
    if (data.length !== expected) throw new Error("FBX_INVALID_ARRAY: array byte length mismatch");
    const arrView = new DataView(data.buffer, data.byteOffset, data.byteLength); const result: number[] | string[] = [];
    for (let i = 0; i < count; i++) {
      const at = i * size;
      if (type === "l") (result as string[]).push(arrView.getBigInt64(at, true).toString());
      else (result as number[]).push(type === "d" ? arrView.getFloat64(at, true) : type === "f" ? arrView.getFloat32(at, true) : type === "i" ? arrView.getInt32(at, true) : arrView.getUint8(at));
    }
    if (offset > end) throw new Error("FBX_BINARY_INVALID: property extends beyond record");
    return result;
  }
  async function node(depth: number): Promise<Node | null> {
    if (depth > 128) throw new Error("FBX_LIMIT_DEPTH: nesting exceeds limit"); requireBytes(header);
    const end = wide ? u64() : u32(); const count = wide ? u64() : u32(); const propertyLength = wide ? u64() : u32(); const nameLength = bytes[offset++]!;
    if (end === 0 && count === 0 && propertyLength === 0 && nameLength === 0) return null;
    if (end > bytes.length || end <= offset || count > limit.maxArrayElements) throw new Error("FBX_BINARY_INVALID: invalid node boundary");
    requireBytes(nameLength); const name = new TextDecoder().decode(bytes.subarray(offset, offset + nameLength)); offset += nameLength; chargeNode(limit); chargeElements(limit, count);
    const startProperties = offset; const values: Value[] = [];
    for (let i = 0; i < count; i++) values.push(await propertyValue(end));
    if (offset !== startProperties + propertyLength || offset > end) throw new Error("FBX_BINARY_INVALID: property length mismatch");
    const nested: Node[] = [];
    while (offset < end) { const item = await node(depth + 1); if (!item) break; nested.push(item); }
    if (offset !== end) throw new Error("FBX_BINARY_INVALID: node end mismatch");
    return { name, values, children: nested };
  }
  const nodes: Node[] = []; let terminated = false;
  while (offset + header <= bytes.length) { const item = await node(0); if (!item) { terminated = true; break; } nodes.push(item); }
  if (!terminated) throw new Error("FBX_BINARY_TRUNCATED: missing root terminator");
  return { nodes, version };
}

class BufferBuilder {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;
  readonly views: Array<Record<string, number>> = [];
  readonly accessors: Array<Record<string, unknown>> = [];
  constructor(private readonly limits: Limits) {}
  add(values: readonly number[], width: number, kind: "float" | "ushort" | "uint" = "float", bounds = false): number {
    if (values.length % width !== 0 || values.some((v) => !Number.isFinite(v))) throw new Error("FBX_INVALID_ACCESSOR: invalid values");
    chargeElements(this.limits, values.length);
    const padding = (4 - this.length % 4) % 4;
    if (padding) { this.chunks.push(new Uint8Array(padding)); this.length += padding; }
    const size = kind === "ushort" ? 2 : 4; const bytes = new Uint8Array(values.length * size); const view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) {
      const value = values[i]!;
      if (kind !== "float" && (!Number.isInteger(value) || value < 0 || value > (kind === "ushort" ? 65535 : 4294967295))) throw new Error("FBX_INVALID_ACCESSOR: integer out of range");
      if (kind === "float") { if (!Number.isFinite(Math.fround(value))) throw new Error("FBX_INVALID_ACCESSOR: float32 overflow"); view.setFloat32(i * size, value, true); }
      else if (kind === "ushort") view.setUint16(i * size, value, true); else view.setUint32(i * size, value, true);
    }
    const viewIndex = this.views.length; this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.length }); this.chunks.push(bytes); this.length += bytes.length;
    const accessor: Record<string, unknown> = { bufferView: viewIndex, componentType: kind === "float" ? 5126 : kind === "ushort" ? 5123 : 5125, count: values.length / width, type: width === 1 ? "SCALAR" : width === 16 ? "MAT4" : `VEC${width}` };
    if (bounds && values.length) {
      const min = Array(width).fill(Infinity) as number[], max = Array(width).fill(-Infinity) as number[];
      for (let i = 0; i < values.length; i++) { const axis = i % width; min[axis] = Math.min(min[axis]!, values[i]!); max[axis] = Math.max(max[axis]!, values[i]!); }
      accessor.min = min; accessor.max = max;
    }
    this.accessors.push(accessor); return this.accessors.length - 1;
  }
  bytes(): Uint8Array { const result = new Uint8Array(this.length); let offset = 0; for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; } return result; }
}
function base64(bytes: Uint8Array): string {
  let out = ""; const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) out += String.fromCharCode(...bytes.subarray(i, i + block));
  return btoa(out);
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0;
});
function pngCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff; for (let i = start; i < end; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]!) & 0xff]!; return (crc ^ 0xffffffff) >>> 0;
}
/** Inspect PNG/JPEG structure and dimensions before allowing a decoder to allocate. */
function inspectTexture(bytes: Uint8Array, limits: Limits): { mime: "image/png" | "image/jpeg"; width: number; height: number } {
  const fail = (reason: string): never => { throw new Error(`FBX_INVALID_TEXTURE: ${reason}`); };
  const check = (width: number, height: number): void => {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > limits.maxTextureDimension || height > limits.maxTextureDimension) throw new Error("FBX_LIMIT_TEXTURE_DIMENSION: invalid or oversized texture dimensions");
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || limits.texturePixels + pixels > limits.maxTexturePixels) throw new Error("FBX_LIMIT_TEXTURE_PIXELS: aggregate texture pixels exceed limit");
    limits.texturePixels += pixels;
  };
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8, width = 0, height = 0, foundData = false, ended = false, chunks = 0;
    while (offset < bytes.length) {
      if (++chunks > 100_000 || offset + 12 > bytes.length) fail("truncated or excessive PNG chunks");
      const size = view.getUint32(offset, false); const end = offset + 12 + size;
      if (!Number.isSafeInteger(end) || end > bytes.length) fail("truncated PNG chunk");
      const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (pngCrc(bytes, offset + 4, end - 4) !== view.getUint32(end - 4, false)) fail("PNG checksum mismatch");
      if (offset === 8) {
        if (kind !== "IHDR" || size !== 13) fail("PNG must start with IHDR");
        width = view.getUint32(offset + 8, false); height = view.getUint32(offset + 12, false); check(width, height);
        const bitDepth = bytes[offset + 16]!, colorType = bytes[offset + 17]!;
        const validDepths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!validDepths[colorType]?.includes(bitDepth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20]! > 1) fail("unsupported PNG color, compression, filter, or interlace");
      } else if (kind === "IHDR") fail("duplicate PNG IHDR");
      if (kind === "IDAT") foundData = true;
      if (kind === "IEND") { if (size !== 0 || !foundData) fail("invalid PNG IEND"); ended = true; break; }
      offset = end;
    }
    if (!ended) fail("PNG has no IEND");
    return { mime: "image/png", width, height };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 2, width = 0, height = 0, foundScan = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) fail("malformed JPEG marker");
      while (bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) fail("truncated JPEG marker");
      const marker = bytes[offset++]!;
      if (marker === 0xd9) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail("truncated JPEG segment");
      const length = view.getUint16(offset, false);
      if (length < 2 || offset + length > bytes.length) fail("invalid JPEG segment length");
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || width || height) fail("invalid JPEG frame");
        height = view.getUint16(offset + 3, false); width = view.getUint16(offset + 5, false); check(width, height);
      }
      offset += length;
      if (marker === 0xda) { foundScan = true; break; }
    }
    if (!width || !height || !foundScan) fail("JPEG lacks frame or scan");
    let ended = false; for (; offset + 1 < bytes.length; offset++) if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd9) { ended = true; break; }
    if (!ended) fail("JPEG has no EOI");
    return { mime: "image/jpeg", width, height };
  }
  throw new Error("FBX_UNSUPPORTED_TEXTURE_FORMAT: expected PNG or JPEG bytes");
}
function multiplyQuat(a: Quat, b: Quat): Quat {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function quaternion(degrees: Vec3, order = 0): Quat {
  const sequences = ["XYZ", "XZY", "YZX", "YXZ", "ZXY", "ZYX"];
  if (!Number.isInteger(order) || !sequences[order]) throw new Error(`FBX_UNSUPPORTED_ROTATION_ORDER: ${order}`);
  const parts: Quat[] = degrees.map((degree, axis) => {
    const s = Math.sin(degree * Math.PI / 360), c = Math.cos(degree * Math.PI / 360);
    return axis === 0 ? [s, 0, 0, c] : axis === 1 ? [0, s, 0, c] : [0, 0, s, c];
  });
  let result: Quat = [0, 0, 0, 1]; for (const axis of sequences[order]!) result = multiplyQuat(result, parts["XYZ".indexOf(axis)]!);
  return result;
}
function normalize(v: Vec3): Vec3 { const length = Math.hypot(...v); return length > 1e-20 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 1]; }
function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalize([ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]);
}
/** Project a polygon onto its dominant plane and remove convex ears. */
function triangulate(points: readonly Vec3[], limits: Limits): Array<[number, number, number]> {
  if (points.length === 3) return [[0, 1, 2]];
  if (points.length > 4096) throw new Error("FBX_LIMIT_TRIANGULATION: polygon has too many corners");
  const normal: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!;
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]); normal[1] += (p[2] - q[2]) * (p[0] + q[0]); normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const drop = Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2]) ? 0 : Math.abs(normal[1]) >= Math.abs(normal[2]) ? 1 : 2;
  const projected = points.map((p): [number, number] => drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[0], p[2]] : [p[0], p[1]]);
  const origin = projected[0]!;
  const uv = projected.map((p): [number, number] => [p[0] - origin[0], p[1] - origin[1]]);
  let area = 0, magnitude = 1;
  for (let i = 0; i < uv.length; i++) { const a = uv[i]!, b = uv[(i + 1) % uv.length]!; area += a[0] * b[1] - b[0] * a[1]; magnitude = Math.max(magnitude, Math.abs(a[0]), Math.abs(a[1])); }
  const epsilon = magnitude * magnitude * 1e-12;
  if (Math.abs(area) <= epsilon) throw new Error("FBX_INVALID_MESH: degenerate polygon");
  const winding = Math.sign(area), remaining = points.map((_, i) => i), result: Array<[number, number, number]> = [];
  const cross = (a: readonly number[], b: readonly number[], c: readonly number[]): number => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  while (remaining.length > 3) {
    let removed = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!, b = remaining[i]!, c = remaining[(i + 1) % remaining.length]!;
      if (cross(uv[a]!, uv[b]!, uv[c]!) * winding <= epsilon) continue;
      let occupied = false;
      for (const k of remaining) {
        if (++limits.work > 5_000_000) throw new Error("FBX_LIMIT_TRIANGULATION: import exceeds work limit");
        if (k === a || k === b || k === c) continue;
        if (cross(uv[a]!, uv[b]!, uv[k]!) * winding >= -epsilon && cross(uv[b]!, uv[c]!, uv[k]!) * winding >= -epsilon && cross(uv[c]!, uv[a]!, uv[k]!) * winding >= -epsilon) { occupied = true; break; }
      }
      if (!occupied) { result.push([a, b, c]); remaining.splice(i, 1); removed = true; break; }
    }
    if (!removed) throw new Error("FBX_INVALID_MESH: polygon cannot be triangulated");
  }
  result.push([remaining[0]!, remaining[1]!, remaining[2]!]); return result;
}
interface Layer { mapping: string; reference: string; data: number[]; indices: number[]; width: number }
function layer(node: Node | undefined, dataName: string, indexNames: readonly string[], width: number): Layer | undefined {
  if (!node) return undefined;
  const data = array(child(node, dataName), dataName); if (data.length % width) throw new Error(`FBX_INVALID_LAYER: ${dataName} component count`);
  const indexNode = indexNames.map((name) => child(node, name)).find(Boolean);
  const indices = array(indexNode, `${dataName} index`);
  const mapping = scalar(child(node, "MappingInformationType"), "ByPolygonVertex");
  const reference = scalar(child(node, "ReferenceInformationType"), "Direct");
  if (!["ByPolygonVertex", "ByVertice", "ByVertex", "ByPolygon", "AllSame"].includes(mapping)) throw new Error(`FBX_UNSUPPORTED_MAPPING: ${mapping}`);
  if (!["Direct", "IndexToDirect", "Index"].includes(reference)) throw new Error(`FBX_UNSUPPORTED_REFERENCE: ${reference}`);
  return { mapping, reference, data, indices, width };
}
function layerValue(input: Layer, vertex: number, polygonVertex: number, polygon: number): number[] {
  let index = input.mapping === "AllSame" ? 0 : input.mapping === "ByPolygon" ? polygon : input.mapping === "ByPolygonVertex" ? polygonVertex : vertex;
  if (input.reference !== "Direct") index = input.indices[index] ?? -1;
  if (!Number.isInteger(index) || index < 0 || (index + 1) * input.width > input.data.length) throw new Error("FBX_INVALID_LAYER: attribute index out of range");
  return input.data.slice(index * input.width, (index + 1) * input.width);
}
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = Array(16).fill(0) as number[];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function trs(translation: Vec3 = [0, 0, 0], rotation: Quat = [0, 0, 0, 1], scale: Vec3 = [1, 1, 1]): number[] {
  const [x, y, z, w] = rotation; const [sx, sy, sz] = scale;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    translation[0], translation[1], translation[2], 1
  ];
}
function staticTransform(model: Node, order: number): number[] {
  const translation = propVec(model, "Lcl Translation", [0, 0, 0]), rotation = propVec(model, "Lcl Rotation", [0, 0, 0]), scale = propVec(model, "Lcl Scaling", [1, 1, 1]);
  const rotationOffset = propVec(model, "RotationOffset", [0, 0, 0]), rotationPivot = propVec(model, "RotationPivot", [0, 0, 0]);
  const scaleOffset = propVec(model, "ScalingOffset", [0, 0, 0]), scalePivot = propVec(model, "ScalingPivot", [0, 0, 0]);
  const pre = quaternion(propVec(model, "PreRotation", [0, 0, 0]), order), post = quaternion(propVec(model, "PostRotation", [0, 0, 0]), order);
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  return [trs(translation), trs(rotationOffset), trs(rotationPivot), trs(undefined, pre), trs(undefined, quaternion(rotation, order)), trs(undefined, [-post[0], -post[1], -post[2], post[3]]), trs(neg(rotationPivot)), trs(scaleOffset), trs(scalePivot), trs(undefined, undefined, scale), trs(neg(scalePivot))].reduce(multiply, IDENTITY);
}
function inverse(matrix: readonly number[]): number[] {
  if (matrix.length !== 16 || matrix.some((n) => !Number.isFinite(n))) throw new Error("FBX_INVALID_MATRIX: expected 16 finite values");
  const rows = Array.from({ length: 4 }, (_, r) => [...Array.from({ length: 4 }, (_, c) => matrix[c * 4 + r]!), ...Array.from({ length: 4 }, (_, c) => Number(c === r))]);
  for (let col = 0; col < 4; col++) {
    let pivot = col; for (let r = col + 1; r < 4; r++) if (Math.abs(rows[r]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = r;
    if (Math.abs(rows[pivot]![col]!) < 1e-12) throw new Error("FBX_INVALID_MATRIX: singular bind transform");
    [rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!]; const d = rows[col]![col]!;
    for (let c = 0; c < 8; c++) rows[col]![c] /= d;
    for (let r = 0; r < 4; r++) if (r !== col) { const factor = rows[r]![col]!; for (let c = 0; c < 8; c++) rows[r]![c] -= factor * rows[col]![c]!; }
  }
  return Array.from({ length: 16 }, (_, i) => rows[i % 4]![4 + Math.floor(i / 4)]!);
}
interface SkinData { jointModels: string[]; inverseBind: number[]; influences: Map<number, Array<{ joint: number; weight: number }>> }
function skinForGeometry(geometryId: string, objects: Map<string, Node>, incoming: ReadonlyMap<string, readonly Link[]>, diagnostics: FBXDiagnostic[]): SkinData | undefined {
  const skins = (incoming.get(geometryId) ?? []).filter((l) => text(objects.get(l.child)?.values[2]) === "Skin");
  if (!skins.length) return undefined;
  if (skins.length > 1) throw new Error("FBX_UNSUPPORTED_SKIN: multiple skins per geometry");
  const clusters = (incoming.get(skins[0]!.child) ?? []).filter((l) => text(objects.get(l.child)?.values[2]) === "Cluster");
  if (!clusters.length) throw new Error("FBX_INVALID_SKIN: no clusters");
  if (clusters.length > 1024) throw new Error("FBX_LIMIT_JOINTS: exceeds 1024 joints");
  const result: SkinData = { jointModels: [], inverseBind: [], influences: new Map() };
  for (const clusterLink of clusters) {
    const cluster = objects.get(clusterLink.child)!;
    const bone = (incoming.get(clusterLink.child) ?? []).find((l) => objects.get(l.child)?.name === "Model");
    if (!bone) throw new Error("FBX_INVALID_SKIN: cluster has no joint model");
    const joint = result.jointModels.length; result.jointModels.push(bone.child);
    const indices = array(child(cluster, "Indexes"), "cluster index"), weights = array(child(cluster, "Weights"), "cluster weight");
    if (indices.length !== weights.length) throw new Error("FBX_INVALID_SKIN: index/weight count mismatch");
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]!, weight = weights[i]!;
      if (!Number.isSafeInteger(index) || index < 0 || weight < 0 || !Number.isFinite(weight)) throw new Error("FBX_INVALID_SKIN: invalid influence");
      const list = result.influences.get(index) ?? []; list.push({ joint, weight }); result.influences.set(index, list);
    }
    const meshMatrix = array(child(cluster, "Transform"), "cluster transform"), jointMatrix = array(child(cluster, "TransformLink"), "cluster link transform");
    if (!jointMatrix.length) diagnostics.push({ code: "FBX_MISSING_BIND_MATRIX", message: "Cluster has no TransformLink; identity bind transform used.", severity: "warning" });
    result.inverseBind.push(...multiply(inverse(jointMatrix.length ? jointMatrix : IDENTITY), meshMatrix.length ? meshMatrix : IDENTITY));
  }
  if ([...result.influences.values()].some((entries) => entries.filter((x) => x.weight > 0).length > 4)) diagnostics.push({ code: "FBX_SKIN_INFLUENCES_TRUNCATED", message: "Only the four largest joint influences per control point are retained and normalized.", severity: "warning" });
  return result;
}
interface MeshBuild { primitives: Record<string, unknown>[]; skin?: SkinData }
function buildMesh(geometry: Node, materialIndexes: readonly number[], skin: SkinData | undefined, builder: BufferBuilder, diagnostics: FBXDiagnostic[], limit: Limits): MeshBuild {
  const positions = array(child(geometry, "Vertices"), "vertex"); const polygonIndices = array(child(geometry, "PolygonVertexIndex"), "polygon index");
  if (!positions.length || positions.length % 3 || !polygonIndices.length) throw new Error("FBX_INVALID_MESH: missing positions or polygons");
  if (skin && [...skin.influences.keys()].some((index) => index >= positions.length / 3)) throw new Error("FBX_INVALID_SKIN: cluster references missing vertex");
  if (children(geometry, "LayerElementUV").length > 1) diagnostics.push({ code: "FBX_EXTRA_UV_SETS", message: "Only the first UV set is represented.", severity: "warning" });
  const normals = layer(child(geometry, "LayerElementNormal"), "Normals", ["NormalsIndex", "NormalIndex"], 3);
  const uvs = layer(child(geometry, "LayerElementUV"), "UV", ["UVIndex"], 2);
  const materialsNode = child(geometry, "LayerElementMaterial");
  const materialMapping = scalar(child(materialsNode, "MappingInformationType"), "AllSame");
  if (materialsNode && materialMapping !== "AllSame" && materialMapping !== "ByPolygon") throw new Error(`FBX_UNSUPPORTED_MATERIAL_MAPPING: ${materialMapping}`);
  const polygonMaterials = array(child(materialsNode, "Materials"), "material index");
  const groups = new Map<number, { p: number[]; n: number[]; uv: number[]; joints: number[]; weights: number[] }>();
  let polygon = 0, start = 0;
  for (let cursor = 0; cursor < polygonIndices.length; cursor++) {
    if (!Number.isInteger(polygonIndices[cursor])) throw new Error("FBX_INVALID_MESH: non-integer polygon index");
    if (polygonIndices[cursor]! >= 0) continue;
    const corners: Array<{ vertex: number; position: Vec3; corner: number }> = [];
    for (let c = start; c <= cursor; c++) {
      const raw = polygonIndices[c]!; const index = raw < 0 ? -raw - 1 : raw;
      if (index < 0 || index * 3 + 2 >= positions.length) throw new Error("FBX_INVALID_MESH: polygon references missing vertex");
      corners.push({ vertex: index, position: [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!], corner: c });
    }
    if (corners.length < 3) throw new Error("FBX_INVALID_MESH: polygon has fewer than three vertices");
    const triangles = triangulate(corners.map((corner) => corner.position), limit);
    const slot = polygonMaterials.length ? polygonMaterials[materialMapping === "AllSame" ? 0 : polygon]! : 0;
    if (!Number.isInteger(slot) || slot < 0 || (materialIndexes.length && slot >= materialIndexes.length)) throw new Error("FBX_INVALID_MATERIAL: material index out of range");
    if (!materialIndexes.length && materialsNode && !diagnostics.some((d) => d.code === "FBX_MATERIAL_UNBOUND")) diagnostics.push({ code: "FBX_MATERIAL_UNBOUND", message: "Mesh material indices have no material connected to the model; default material is used.", severity: "warning" });
    const material = materialIndexes[slot] ?? -1;
    const group = groups.get(material) ?? { p: [], n: [], uv: [], joints: [], weights: [] }; groups.set(material, group);
    for (const tri of triangles) {
      const selected = tri.map((index) => corners[index]!); const faceNormal = triangleNormal(selected[0]!.position, selected[1]!.position, selected[2]!.position);
      for (const corner of selected) {
        chargeElements(limit, 6 + (uvs ? 2 : 0) + (skin ? 8 : 0));
        group.p.push(...corner.position); group.n.push(...(normals ? layerValue(normals, corner.vertex, corner.corner, polygon) : faceNormal));
        if (uvs) group.uv.push(...layerValue(uvs, corner.vertex, corner.corner, polygon));
        if (skin) {
          const influences = [...(skin.influences.get(corner.vertex) ?? [])].filter((entry) => entry.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 4);
          const total = influences.reduce((sum, item) => sum + item.weight, 0);
          while (influences.length < 4) influences.push({ joint: 0, weight: 0 });
          if (total === 0) influences[0]!.weight = 1;
          for (const influence of influences) { group.joints.push(influence.joint); group.weights.push(total > 0 ? influence.weight / total : influence.weight); }
        }
      }
    }
    polygon++; start = cursor + 1;
  }
  if (start !== polygonIndices.length) throw new Error("FBX_INVALID_MESH: unterminated polygon");
  if (!groups.size) throw new Error("FBX_INVALID_MESH: no faces");
  const primitives = [...groups].map(([material, group]) => {
    const attributes: Record<string, number> = { POSITION: builder.add(group.p, 3, "float", true), NORMAL: builder.add(group.n, 3) };
    if (group.uv.length) attributes.TEXCOORD_0 = builder.add(group.uv, 2);
    if (skin) { attributes.JOINTS_0 = builder.add(group.joints, 4, "ushort"); attributes.WEIGHTS_0 = builder.add(group.weights, 4); }
    return { attributes, ...(material >= 0 ? { material } : {}), mode: 4 };
  });
  return { primitives, ...(skin ? { skin } : {}) };
}

function connections(nodes: readonly Node[]): Link[] {
  return children(nodes.find((node) => node.name === "Connections"), "C").map((c) => ({ child: text(c.values[1]), parent: text(c.values[2]), property: text(c.values[3]) }));
}
function colorProperty(node: Node, name: string, fallback: Vec3): Vec3 {
  const value = propVec(node, name, fallback); return value.map((n) => Math.max(0, Math.min(1, n))) as Vec3;
}
function compile(nodes: readonly Node[], version: number, limit: Limits): FBXImportResult {
  const objectNode = nodes.find((n) => n.name === "Objects");
  if (!objectNode) throw new Error("FBX_INVALID_DOCUMENT: Objects section missing");
  const objectMap = new Map<string, Node>();
  for (const object of objectNode.children) {
    const id = identifier(object); if (objectMap.has(id)) throw new Error(`FBX_DUPLICATE_ID: ${id}`); objectMap.set(id, object);
  }
  const links = connections(nodes), diagnostics: FBXDiagnostic[] = [], dependencies: string[] = [], builder = new BufferBuilder(limit);
  const incoming = new Map<string, Link[]>(), outgoing = new Map<string, Link[]>();
  for (const link of links) {
    const from = outgoing.get(link.child) ?? []; from.push(link); outgoing.set(link.child, from);
    const to = incoming.get(link.parent) ?? []; to.push(link); incoming.set(link.parent, to);
  }
  const globals = nodes.find((n) => n.name === "GlobalSettings");
  const unitInMeters = propNumber(globals, "UnitScaleFactor", 1) / 100;
  if (!Number.isFinite(unitInMeters) || unitInMeters <= 0 || unitInMeters > 1e6) throw new Error("FBX_INVALID_UNITS: UnitScaleFactor must be positive");
  const coord = propNumber(globals, "CoordAxis", 0), up = propNumber(globals, "UpAxis", 1), front = propNumber(globals, "FrontAxis", 2);
  const cs = propNumber(globals, "CoordAxisSign", 1), us = propNumber(globals, "UpAxisSign", 1), fs = propNumber(globals, "FrontAxisSign", -1);
  if (new Set([coord, up, front]).size !== 3 || [coord, up, front].some((v) => !Number.isInteger(v) || v < 0 || v > 2) || [cs, us, fs].some((v) => v !== 1 && v !== -1)) throw new Error("FBX_INVALID_AXES: invalid axis declaration");
  const rootMatrix = Array(16).fill(0) as number[]; rootMatrix[15] = 1; rootMatrix[coord * 4] = cs * unitInMeters; rootMatrix[up * 4 + 1] = us * unitInMeters; rootMatrix[front * 4 + 2] = -fs * unitInMeters;
  const models = [...objectMap.entries()].filter(([, n]) => n.name === "Model");
  if (!models.length) throw new Error("FBX_INVALID_DOCUMENT: no Model objects");
  const modelIndex = new Map(models.map(([id], i) => [id, i + 1]));
  const modelNodes: Array<Record<string, unknown>> = models.map(([id, n]) => {
    const rotationOrder = propNumber(n, "RotationOrder", 0);
    const extra = ["PreRotation", "PostRotation", "RotationPivot", "RotationOffset", "ScalingPivot", "ScalingOffset"].some((name) => propVec(n, name, [0, 0, 0]).some((v) => v !== 0));
    const animated = (incoming.get(id) ?? []).some((link) => objectMap.get(link.child)?.name === "AnimationCurveNode");
    if (extra && animated) diagnostics.push({ code: "FBX_ANIMATED_PIVOT_APPROXIMATION", message: `Animated pivots or pre/post rotations on ${cleanName(text(n.values[1]))} are not applied.`, severity: "warning" });
    const transform = extra && !animated ? { matrix: staticTransform(n, rotationOrder) } : { translation: propVec(n, "Lcl Translation", [0, 0, 0]), rotation: quaternion(propVec(n, "Lcl Rotation", [0, 0, 0]), rotationOrder), scale: propVec(n, "Lcl Scaling", [1, 1, 1]) };
    return { name: cleanName(text(n.values[1])) || `model-${text(n.values[0])}`, ...transform, children: [] as number[] };
  });
  const parentByModel = new Map<string, string>();
  for (const link of links) if (modelIndex.has(link.child) && modelIndex.has(link.parent)) {
    if (parentByModel.has(link.child)) throw new Error("FBX_INVALID_HIERARCHY: model has multiple parents"); parentByModel.set(link.child, link.parent);
  }
  const checked = new Set<string>();
  for (const [id] of models) {
    const seen = new Set<string>(); let at: string | undefined = id;
    while (at && !checked.has(at)) { if (seen.has(at)) throw new Error("FBX_INVALID_HIERARCHY: model cycle"); seen.add(at); at = parentByModel.get(at); }
    for (const visited of seen) checked.add(visited);
  }
  const roots: number[] = [];
  for (const [id] of models) {
    const index = modelIndex.get(id)!; const parent = parentByModel.get(id);
    if (parent) (modelNodes[modelIndex.get(parent)! - 1]!.children as number[]).push(index); else roots.push(index);
  }
  const materialEntries = [...objectMap.entries()].filter(([, n]) => n.name === "Material");
  const materials = materialEntries.map(([, m]) => {
    const diffuse = colorProperty(m, "DiffuseColor", [0.8, 0.8, 0.8]), factor = Math.max(0, propNumber(m, "DiffuseFactor", 1));
    const transparency = Math.max(0, Math.min(1, propNumber(m, "TransparencyFactor", 0))); const alpha = 1 - transparency;
    const shininess = Math.max(0, propNumber(m, "Shininess", propNumber(m, "ShininessExponent", 20)));
    return { name: cleanName(text(m.values[1])), alphaMode: alpha < 0.999 ? "BLEND" : "OPAQUE", pbrMetallicRoughness: { baseColorFactor: [Math.min(1, diffuse[0] * factor), Math.min(1, diffuse[1] * factor), Math.min(1, diffuse[2] * factor), alpha], metallicFactor: 0, roughnessFactor: Math.sqrt(2 / (shininess + 2)) }, emissiveFactor: colorProperty(m, "EmissiveColor", [0, 0, 0]) } as Record<string, any>;
  });
  const materialIndex = new Map(materialEntries.map(([id], index) => [id, index]));
  const images: Record<string, unknown>[] = [], textures: Record<string, unknown>[] = [];
  for (const link of links) {
    const texture = objectMap.get(link.child), material = materialIndex.get(link.parent);
    if (texture?.name !== "Texture" || material === undefined) continue;
    const videoLink = (incoming.get(link.child) ?? []).find((candidate) => objectMap.get(candidate.child)?.name === "Video");
    const video = videoLink && objectMap.get(videoLink.child);
    const path = scalar(child(texture, "RelativeFilename")) || scalar(child(video, "RelativeFilename")) || scalar(child(texture, "FileName")) || scalar(child(video, "Filename"));
    const content = child(video, "Content")?.values[0];
    let embedded: Uint8Array | undefined;
    if (content instanceof Uint8Array && content.length) embedded = content;
    else if (typeof content === "string" && content) {
      try { const decoded = atob(content.replace(/\s/g, "")); embedded = Uint8Array.from(decoded, (char) => char.charCodeAt(0)); }
      catch { throw new Error("FBX_INVALID_TEXTURE: invalid embedded base64"); }
    }
    const normalized = path.replace(/\\/g, "/");
    let uri: string;
    if (embedded?.length) {
      const image = inspectTexture(embedded, limit);
      uri = `data:${image.mime};base64,${base64(embedded)}`;
    } else {
      if (!path) { diagnostics.push({ code: "FBX_TEXTURE_MISSING_PATH", message: `Texture ${cleanName(text(texture.values[1]))} has no external path.`, severity: "warning" }); continue; }
      if (/^(?:[a-z]:\/|\/|file:)/i.test(normalized)) { diagnostics.push({ code: "FBX_TEXTURE_ABSOLUTE_PATH", message: `Absolute texture path ${normalized} is not portable.`, severity: "warning" }); continue; }
      let decodedPath: string;
      try { decodedPath = decodeURIComponent(normalized).replace(/\\/g, "/"); }
      catch { throw new Error("FBX_INVALID_DEPENDENCY: malformed texture path encoding"); }
      if (decodedPath.includes("\0") || decodedPath.split(/[/?#]/).includes("..")) throw new Error("FBX_INVALID_DEPENDENCY: texture path traversal");
      if (!/\.(?:png|jpe?g)(?:[?#]|$)/i.test(normalized)) { diagnostics.push({ code: "FBX_UNSUPPORTED_TEXTURE_FORMAT", message: `Texture ${normalized} requires a supported image codec.`, severity: "warning" }); continue; }
      uri = normalized; dependencies.push(normalized);
    }
    const textureIndex = textures.length; images.push({ uri }); textures.push({ source: images.length - 1 });
    const target = materials[material]!; const prop = link.property.toLowerCase();
    if (!prop || prop.includes("diffuse") || prop.includes("basecolor")) target.pbrMetallicRoughness.baseColorTexture = { index: textureIndex };
    else if (prop.includes("normal") || prop.includes("bump")) target.normalTexture = { index: textureIndex };
    else if (prop.includes("emissive")) target.emissiveTexture = { index: textureIndex };
    else diagnostics.push({ code: "FBX_UNSUPPORTED_TEXTURE_SLOT", message: `Texture slot ${link.property} is not represented.`, severity: "warning" });
  }
  const meshes: Record<string, unknown>[] = [], skins: Record<string, unknown>[] = [], geometricNodes: Record<string, unknown>[] = [];
  for (const [id, model] of models) {
    const meshLinks = (incoming.get(id) ?? []).filter((link) => objectMap.get(link.child)?.name === "Geometry" && text(objectMap.get(link.child)?.values[2]) === "Mesh");
    if (!meshLinks.length) continue;
    const localMaterials = (incoming.get(id) ?? []).filter((link) => materialIndex.has(link.child)).map((link) => materialIndex.get(link.child)!);
    const primitives: Record<string, unknown>[] = []; let modelSkin: SkinData | undefined, sawUnskinned = false;
    for (const link of meshLinks) {
      const geometry = objectMap.get(link.child)!; const skin = skinForGeometry(link.child, objectMap, incoming, diagnostics);
      if (modelSkin && skin) throw new Error("FBX_UNSUPPORTED_SKIN: multiple skinned geometry objects on one model");
      if ((skin && sawUnskinned) || (!skin && modelSkin)) throw new Error("FBX_UNSUPPORTED_SKIN: mixed skinned and unskinned geometry on one model");
      if (!skin) sawUnskinned = true;
      const mesh = buildMesh(geometry, localMaterials, skin, builder, diagnostics, limit); primitives.push(...mesh.primitives); modelSkin = skin ?? modelSkin;
    }
    const modelNode = modelNodes[modelIndex.get(id)! - 1]!;
    const geoTranslation = propVec(model, "GeometricTranslation", [0, 0, 0]), geoRotation = propVec(model, "GeometricRotation", [0, 0, 0]), geoScale = propVec(model, "GeometricScaling", [1, 1, 1]);
    const hasGeometricTransform = geoTranslation.some((v) => v !== 0) || geoRotation.some((v) => v !== 0) || geoScale.some((v) => v !== 1);
    let target = modelNode;
    if (hasGeometricTransform) {
      target = { name: `${cleanName(text(model.values[1]))}-geometry`, translation: geoTranslation, rotation: quaternion(geoRotation), scale: geoScale };
      (modelNode.children as number[]).push(1 + models.length + geometricNodes.length); geometricNodes.push(target);
    }
    target.mesh = meshes.length; meshes.push({ name: cleanName(text(model.values[1])), primitives });
    if (modelSkin) {
      const joints = modelSkin.jointModels.map((joint) => { const index = modelIndex.get(joint); if (index === undefined) throw new Error("FBX_INVALID_SKIN: missing joint model"); return index; });
      target.skin = skins.length; skins.push({ name: `${cleanName(text(model.values[1]))}-skin`, joints, inverseBindMatrices: builder.add(modelSkin.inverseBind, 16) });
    }
  }
  const animations = buildAnimations(objectMap, incoming, outgoing, modelIndex, builder, diagnostics, limit);
  const unsupported = [...objectMap.values()].filter((n) => ["BlendShape", "BlendShapeChannel", "Shape"].includes(text(n.values[2])));
  if (unsupported.length) diagnostics.push({ code: "FBX_UNSUPPORTED_BLEND_SHAPES", message: "Blend shape deformers are not represented.", severity: "warning" });
  const unsupportedTypes = new Set([...objectMap.values()].filter((node) =>
    (node.name === "Geometry" && text(node.values[2]) !== "Mesh") ||
    (node.name === "NodeAttribute" && ["Camera", "Light"].includes(text(node.values[2])))
  ).map((node) => `${node.name}:${text(node.values[2])}`));
  if (unsupportedTypes.size) diagnostics.push({ code: "FBX_UNSUPPORTED_OBJECTS", message: `Unrepresented FBX objects: ${[...unsupportedTypes].join(", ")}.`, severity: "warning" });
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0", generator: "Aura3D FBX import" },
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(builder.bytes())}`, byteLength: builder.bytes().byteLength }],
    bufferViews: builder.views, accessors: builder.accessors,
    nodes: [{ name: "FBX coordinate and unit conversion", matrix: rootMatrix, children: roots }, ...modelNodes, ...geometricNodes],
    scenes: [{ nodes: [0] }], scene: 0, meshes, materials, images, textures, skins, animations
  };
  return { gltf, version, unitInMeters, dependencies: [...new Set(dependencies)], diagnostics, embeddedTexturePixels: limit.texturePixels };
}

interface Curve { times: number[]; values: number[] }
function sample(curve: Curve | undefined, time: number, fallback: number): number {
  if (!curve?.times.length) return fallback;
  if (time <= curve.times[0]!) return curve.values[0]!;
  const last = curve.times.length - 1; if (time >= curve.times[last]!) return curve.values[last]!;
  let low = 0, high = last;
  while (high - low > 1) { const mid = (low + high) >>> 1; if (curve.times[mid]! <= time) low = mid; else high = mid; }
  const fraction = (time - curve.times[low]!) / (curve.times[high]! - curve.times[low]!);
  return curve.values[low]! + (curve.values[high]! - curve.values[low]!) * fraction;
}
function buildAnimations(objects: Map<string, Node>, incoming: ReadonlyMap<string, readonly Link[]>, outgoing: ReadonlyMap<string, readonly Link[]>, modelIndex: ReadonlyMap<string, number>, builder: BufferBuilder, diagnostics: FBXDiagnostic[], limit: Limits): Record<string, unknown>[] {
  const tracks: Array<{ id: string; node: number; path: "translation" | "rotation" | "scale"; times: number[]; values: number[] }> = [];
  for (const [id, curveNode] of objects) {
    if (curveNode.name !== "AnimationCurveNode") continue;
    const targets = (outgoing.get(id) ?? []).filter((l) => modelIndex.has(l.parent));
    if (targets.length > 1) throw new Error("FBX_UNSUPPORTED_ANIMATION: curve node targets multiple models");
    const targetLink = targets[0];
    if (!targetLink) continue;
    const path = targetLink.property === "Lcl Translation" ? "translation" : targetLink.property === "Lcl Rotation" ? "rotation" : targetLink.property === "Lcl Scaling" ? "scale" : undefined;
    if (!path) { diagnostics.push({ code: "FBX_UNSUPPORTED_ANIMATION_TARGET", message: `Animation target ${targetLink.property} is not represented.`, severity: "warning" }); continue; }
    const model = objects.get(targetLink.parent)!;
    const fallback = propVec(model, targetLink.property, path === "scale" ? [1, 1, 1] : [0, 0, 0]);
    const curves: Array<Curve | undefined> = [undefined, undefined, undefined];
    for (const link of (incoming.get(id) ?? []).filter((l) => objects.get(l.child)?.name === "AnimationCurve")) {
      const axis = /(?:\||^)([XYZ])$/i.exec(link.property)?.[1]?.toUpperCase();
      if (!axis) { diagnostics.push({ code: "FBX_UNSUPPORTED_ANIMATION_COMPONENT", message: `Animation component ${link.property} is not represented.`, severity: "warning" }); continue; }
      const index = "XYZ".indexOf(axis); if (curves[index]) throw new Error("FBX_INVALID_ANIMATION: duplicate component curve");
      const curve = objects.get(link.child)!;
      const times = array(child(curve, "KeyTime"), "animation time").map((v) => v / FBX_TICKS);
      const values = array(child(curve, "KeyValueFloat") ?? child(curve, "KeyValueDouble"), "animation value");
      if (!times.length || times.length !== values.length || times.some((time, i) => i > 0 && time <= times[i - 1]!)) throw new Error("FBX_INVALID_ANIMATION: keys must have matching counts and increasing times");
      const flags = array(child(curve, "KeyAttrFlags"), "animation flags");
      if (flags.some((flag) => (flag & 8) !== 0 || (flag & 2) !== 0)) diagnostics.push({ code: "FBX_ANIMATION_INTERPOLATION_APPROXIMATION", message: "Non-linear or constant FBX key interpolation is sampled linearly.", severity: "warning" });
      curves[index] = { times, values };
    }
    const times = [...new Set(curves.flatMap((curve) => curve?.times ?? []))].sort((a, b) => a - b);
    if (!times.length) continue;
    chargeElements(limit, times.length * (path === "rotation" ? 4 : 3));
    const values: number[] = [];
    const order = propNumber(model, "RotationOrder", 0);
    for (const time of times) {
      const value: Vec3 = [sample(curves[0], time, fallback[0]), sample(curves[1], time, fallback[1]), sample(curves[2], time, fallback[2])];
      values.push(...(path === "rotation" ? quaternion(value, order) : value));
    }
    if (path === "rotation") diagnostics.push({ code: "FBX_ANIMATION_EULER_APPROXIMATION", message: "Euler key values become quaternion keys; interpolation between keys may differ.", severity: "warning" });
    tracks.push({ id, node: modelIndex.get(targetLink.parent)!, path, times, values });
  }
  if (!tracks.length) return [];
  const groups: Array<{ name: string; ids: Set<string> }> = [], assigned = new Set<string>();
  for (const [stackId, stack] of objects) {
    if (stack.name !== "AnimationStack") continue;
    const layers = (incoming.get(stackId) ?? []).filter((link) => objects.get(link.child)?.name === "AnimationLayer");
    if (layers.length > 1) diagnostics.push({ code: "FBX_ANIMATION_LAYERS_SEPARATED", message: "Animation layers are emitted as separate clips; layer blending is not represented.", severity: "warning" });
    for (const layerLink of layers) {
      const layer = objects.get(layerLink.child)!;
      const ids = new Set((incoming.get(layerLink.child) ?? []).filter((link) => objects.get(link.child)?.name === "AnimationCurveNode").map((link) => link.child));
      for (const id of ids) assigned.add(id);
      groups.push({ name: `${cleanName(text(stack.values[1])) || "FBX animation"}${layers.length > 1 ? ` / ${cleanName(text(layer.values[1]))}` : ""}`, ids });
    }
  }
  const orphanIds = tracks.filter((track) => !assigned.has(track.id)).map((track) => track.id);
  if (orphanIds.length) groups.push({ name: "FBX animation", ids: new Set(orphanIds) });
  const clips: Record<string, unknown>[] = [];
  for (const group of groups) {
    const selected = tracks.filter((track) => group.ids.has(track.id)); if (!selected.length) continue;
    const first = selected.reduce((min, track) => Math.min(min, track.times[0]!), Infinity); const shift = first < 0 ? -first : 0;
    const samplers: Record<string, unknown>[] = [], channels: Record<string, unknown>[] = [], targets = new Set<string>();
    for (const track of selected) {
      const key = `${track.node}:${track.path}`;
      if (targets.has(key)) throw new Error("FBX_UNSUPPORTED_ANIMATION: multiple curves target one property in a layer");
      targets.add(key);
      const times = track.times.map((time) => time + shift);
      if (times.some((time, i) => i > 0 && Math.fround(time) <= Math.fround(times[i - 1]!))) throw new Error("FBX_INVALID_ANIMATION: key times collapse at float precision");
      const input = builder.add(times, 1, "float", true), output = builder.add(track.values, track.path === "rotation" ? 4 : 3);
      samplers.push({ input, output, interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: track.node, path: track.path } });
    }
    if (shift) diagnostics.push({ code: "FBX_ANIMATION_TIME_SHIFT", message: `Negative animation time was shifted by ${shift} seconds.`, severity: "warning" });
    clips.push({ name: group.name, samplers, channels });
  }
  return clips;
}

/** Parse FBX 7.x ASCII or binary into a glTF 2.0 document plus loss diagnostics. */
export async function parseFBX(input: string | Uint8Array | ArrayBuffer, options: FBXImportOptions = {}): Promise<FBXImportResult> {
  const limit = limits(options);
  throwIfAborted(limit.signal);
  if (typeof input === "string" && input.length > limit.maxBytes) throw new Error("FBX_LIMIT_BYTES: source exceeds limit");
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > limit.maxBytes) throw new Error("FBX_LIMIT_BYTES: source exceeds limit");
  const magic = String.fromCharCode(...bytes.subarray(0, BINARY_MAGIC.length));
  let nodes: Node[], version: number;
  if (magic === BINARY_MAGIC) { const parsed = await parseBinary(bytes, limit); nodes = parsed.nodes; version = parsed.version; }
  else {
    if (magic.startsWith("Kaydara FBX Binary")) throw new Error("FBX_BINARY_TRUNCATED: incomplete or invalid header");
    let source: string;
    try { source = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (error) { throw new Error("FBX_INVALID_ENCODING: expected UTF-8 ASCII FBX", { cause: error }); }
    if (source.includes("\0")) throw new Error("FBX_UNSUPPORTED_BINARY: unrecognized binary header");
    nodes = parseAscii(source, limit);
    const header = nodes.find((node) => node.name === "FBXHeaderExtension");
    version = number(child(header, "FBXVersion")?.values[0], "FBXVersion");
    if (!Number.isInteger(version) || version < 7000 || version >= 8000) throw new Error(`FBX_UNSUPPORTED_VERSION: ${version}`);
  }
  throwIfAborted(limit.signal);
  return compile(nodes, version, limit);
}

/** Opt in by registering this loader with AssetManager or FormatRegistry. */
export class FBXLoader implements AssetLoader<FBXAsset> {
  readonly type = "fbx";
  private readonly gltfLoader: GLTFLoader;
  private readonly inner = new WeakMap<FBXAsset, GLTFAsset>();
  constructor(private readonly options: FBXImportOptions = {}, gltfLoader = new GLTFLoader()) { this.gltfLoader = gltfLoader; }
  canLoad(request: AssetLoadRequest): boolean { return request.type === "fbx" || /\.fbx(?:[?#]|$)/i.test(request.url); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<FBXAsset> {
    const alreadyScoped = context.dependencyChain.at(-1) === request.url;
    const documentUrl = alreadyScoped ? request.url : context.resolve(request.url);
    const scope = alreadyScoped ? context : context.child(request.url, undefined, request);
    scope.throwIfAborted(documentUrl); const maximum = limits(this.options).maxBytes;
    const signal = new LoadContext({ signal: scope.signalFor(request.signal) }).signalFor(this.options.signal);
    const sourceOptions = mergeAssetRequestOptions(scope.requestOptionsFor(documentUrl), request);
    const maximumBytes = Math.min(maximum, sourceOptions.maxBytes ?? maximum);
    const source = await fetchBytes(documentUrl, signal, ({ loaded, total }) => {
      if (loaded > maximum || (total !== undefined && total > maximum)) throw new Error("FBX_LIMIT_BYTES: source exceeds limit");
      request.onProgress?.({ url: documentUrl, phase: "document", loadedBytes: loaded, ...(total !== undefined ? { totalBytes: total } : {}) });
    }, { ...sourceOptions, maxBytes: maximumBytes });
    scope.throwIfAborted(documentUrl);
    const result = await parseFBX(source, { ...this.options, signal });
    if (result.dependencies.length) {
      if (/^(?:data|blob):/i.test(documentUrl)) throw new Error("FBX_DEPENDENCY_BASE_MISSING: external textures require a document URL");
      const images = result.gltf.images as Array<{ uri: string }>;
      const cached = new Map<string, string>(); let remaining = maximumBytes - source.byteLength;
      const imageLimits = limits(this.options); imageLimits.texturePixels = result.embeddedTexturePixels;
      for (const image of images) {
        const original = image.uri;
        if (original.startsWith("data:")) continue;
        const resolved = scope.resolve(original);
        let data = cached.get(resolved);
        if (!data) {
          if (remaining <= 0) throw new Error("FBX_LIMIT_BYTES: source and dependencies exceed limit");
          const policy = scope.requestOptionsFor(original);
          const imageBytes = await fetchBytes(resolved, signal, ({ loaded, total }) => {
            request.onProgress?.({ url: resolved, phase: "buffer", loadedBytes: loaded, ...(total !== undefined ? { totalBytes: total } : {}) });
          }, { ...policy, maxBytes: Math.min(remaining, policy.maxBytes ?? remaining) });
          remaining -= imageBytes.byteLength;
          const inspected = inspectTexture(new Uint8Array(imageBytes), imageLimits);
          const expectedMime = /\.png(?:[?#]|$)/i.test(original) ? "image/png" : "image/jpeg";
          if (inspected.mime !== expectedMime) throw new Error("FBX_INVALID_TEXTURE: file extension and image type do not match");
          data = `data:${inspected.mime};base64,${base64(new Uint8Array(imageBytes))}`; cached.set(resolved, data);
        }
        image.uri = data;
      }
    }
    const gltf = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(result.gltf))}`;
    // The derived glTF is built only from already verified FBX and dependency bytes;
    // its synthetic data URI must not inherit the FBX document digest.
    const inner = await this.gltfLoader.load({ url: gltf, type: "gltf", signal }, new LoadContext({ signal }));
    if (signal?.aborted) { this.gltfLoader.dispose(inner); throwIfAborted(signal); }
    const metadata = { version: result.version, unitInMeters: result.unitInMeters, dependencies: result.dependencies, diagnostics: result.diagnostics, embeddedTexturePixels: result.embeddedTexturePixels };
    const loaderDiagnostics = {
      ...inner.loaderDiagnostics,
      features: [...new Set([...inner.loaderDiagnostics.features, "fbx", "fbx-native-import"])].sort(),
      unsupportedFeatures: [...inner.loaderDiagnostics.unsupportedFeatures, ...metadata.diagnostics.map((item) => `${item.code}: ${item.message}`)]
    };
    const output: FBXAsset = {
      url: documentUrl,
      get disposed() { return inner.disposed; },
      loaderDiagnostics,
      images: inner.images, textures: inner.textures, materials: inner.materials, materialVariants: inner.materialVariants,
      scenes: inner.scenes, defaultScene: inner.defaultScene, meshes: inner.meshes, cameras: inner.cameras, lights: inner.lights,
      skins: inner.skins, animations: inner.animations, createScene: (options) => inner.createScene(options),
      toJSON: () => ({ ...inner.toJSON(), url: documentUrl, loaderDiagnostics }), fbx: metadata
    };
    this.inner.set(output, inner); return output;
  }
  dispose(asset: FBXAsset): void { this.gltfLoader.dispose(this.inner.get(asset) ?? asset); }
}
