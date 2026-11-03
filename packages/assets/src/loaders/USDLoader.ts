import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset, type GLTFLoaderDiagnostics } from "../GLTFLoader";
import { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";

/** Limits apply before geometry, archive, and generated-buffer allocation. */
export interface USDLoaderLimits {
  readonly maxFileBytes?: number;
  readonly maxExpandedBytes?: number;
  readonly maxArchiveEntries?: number;
  readonly maxPrims?: number;
  readonly maxVertices?: number;
  readonly maxFaceIndices?: number;
  readonly maxTokens?: number;
}

/** USD stage evaluation is linear by default; held mode is a runtime choice. */
export interface USDLoaderOptions {
  /** Pass held when the originating stage is evaluated with held interpolation. */
  readonly interpolation?: "linear" | "held";
}

export interface USDDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

/** USD inputs use authored stage units; the emitted glTF scene is in metres and Y-up. */
export interface USDAsset extends GLTFAsset {
  readonly usdDiagnostics: readonly USDDiagnostic[];
}

export class USDImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "USDImportError";
  }
}

const DEFAULT_LIMITS = {
  maxFileBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 128 * 1024 * 1024,
  maxArchiveEntries: 256,
  maxPrims: 100_000,
  maxVertices: 1_000_000,
  maxFaceIndices: 6_000_000,
  maxTokens: 4_000_000
} as const;
type Limits = { [K in keyof typeof DEFAULT_LIMITS]: number };
type Scalar = number | string | boolean | null;
type Value = Scalar | Value[] | { [key: string]: Value };
interface Prim { type: string; name: string; path: string; properties: Map<string, Value>; children: Prim[] }
interface Token { kind: "word" | "string" | "number" | "asset" | "path" | "symbol" | "newline"; value: string }
interface Stage { metadata: Map<string, Value>; prims: Prim[] }
interface ParsedUSD { stage: Stage; diagnostics: USDDiagnostic[] }
interface Archive { root: string; files: Map<string, Uint8Array> }
interface MutableNode { name: string; children?: number[]; mesh?: number; camera?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extensions?: Record<string, unknown> }
interface BufferView { buffer: 0; byteOffset: number; byteLength: number }

/**
 * Independently authored bounded USD importer. Supports USDA stages and stored
 * USDZ archives. Binary crate layers, composition arcs, and unsupported shading
 * or geometry schemas produce explicit diagnostics/errors rather than pretending
 * to have been imported. Returned assets use the same GLTF render-resource and
 * disposal path as other Aura3D models.
 */
export class USDLoader implements AssetLoader<USDAsset> {
  readonly type = "usd";
  private readonly innerAssets = new WeakMap<USDAsset, GLTFAsset>();
  private readonly limits: Limits;
  private readonly interpolation: "linear" | "held";
  constructor(private readonly gltfLoader = new GLTFLoader(), limits: USDLoaderLimits = {}, options: USDLoaderOptions = {}) {
    this.limits = validatedLimits(limits);
    if (options.interpolation !== undefined && options.interpolation !== "linear" && options.interpolation !== "held") {
      fail("USD_INTERPOLATION_UNSUPPORTED", "stage interpolation must be linear or held");
    }
    this.interpolation = options.interpolation ?? "linear";
  }

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === "usd" || request.type === "usda" || request.type === "usdz" || /\.(?:usd|usda|usdz)(?:[?#]|$)/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<USDAsset> {
    context.throwIfAborted(request.url);
    const signal = context.signalFor(request.signal);
    const sourceOptions = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const options = { ...sourceOptions, maxBytes: Math.min(sourceOptions.maxBytes ?? this.limits.maxFileBytes, this.limits.maxFileBytes) };
    const bytes = new Uint8Array(await fetchBytes(request.url, signal, (progress) => request.onProgress?.({
      url: request.url, phase: "document", loadedBytes: progress.loaded, totalBytes: progress.total
    }), options));
    checkSize(bytes.length, this.limits.maxFileBytes, "USD_FILE_LIMIT");
    context.throwIfAborted(request.url);
    const archive = isZip(bytes) ? unpackUSDZ(bytes, this.limits) : undefined;
    const stageBytes = archive ? archive.files.get(archive.root)! : bytes;
    const parsed = parseUSDA(stageBytes, this.limits);
    const conversion = await convertStage(parsed, this.limits, this.interpolation, async (path) => {
      if (archive) {
        const key = archivePath(joinArchivePath(archive.root, path));
        const embedded = archive.files.get(key);
        if (!embedded) fail("USD_DEPENDENCY_MISSING", `USDZ dependency ${key} is absent`);
        return embedded;
      }
      const url = resolveRelative(request.url, path, context);
      const dependencyOptions = context.child(request.url, undefined, sourceOptions).requestOptionsFor(url);
      const boundedOptions = { ...dependencyOptions, maxBytes: Math.min(dependencyOptions.maxBytes ?? this.limits.maxFileBytes, this.limits.maxFileBytes) };
      const fetched = new Uint8Array(await fetchBytes(url, signal, undefined, boundedOptions));
      checkSize(fetched.length, this.limits.maxFileBytes, "USD_DEPENDENCY_LIMIT");
      return fetched;
    });
    context.throwIfAborted(request.url);
    const gltfUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(conversion))}`;
    // The generated, trusted in-memory document is distinct from the admitted
    // source bytes and must not inherit the source document's expected digest.
    const inner = await this.gltfLoader.load({ url: gltfUrl, type: "gltf", signal }, new LoadContext({ signal }));
    const features = [...new Set([...inner.loaderDiagnostics.features, "usd", archive ? "usdz-stored" : "usda"])].sort();
    const diagnostics: GLTFLoaderDiagnostics = {
      ...inner.loaderDiagnostics,
      features,
      unsupportedFeatures: [...new Set([...inner.loaderDiagnostics.unsupportedFeatures, ...parsed.diagnostics.map((d) => d.code)])]
    };
    const asset: USDAsset = {
      url: request.url,
      get disposed() { return inner.disposed; },
      loaderDiagnostics: diagnostics,
      usdDiagnostics: parsed.diagnostics,
      images: inner.images, textures: inner.textures, materials: inner.materials,
      materialVariants: inner.materialVariants, scenes: inner.scenes, defaultScene: inner.defaultScene,
      meshes: inner.meshes, cameras: inner.cameras, lights: inner.lights, skins: inner.skins, animations: inner.animations,
      createScene: (options) => inner.createScene(options),
      toJSON: () => ({ ...inner.toJSON(), url: request.url, loaderDiagnostics: diagnostics })
    };
    this.innerAssets.set(asset, inner);
    return asset;
  }

  dispose(asset: USDAsset): void {
    this.gltfLoader.dispose(this.innerAssets.get(asset) ?? asset);
  }
}

function validatedLimits(overrides: USDLoaderLimits): Limits {
  const result = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fffffff) fail("USD_INVALID_LIMIT", `${name} must be a positive bounded integer`);
  }
  return result;
}
function fail(code: string, message: string): never { throw new USDImportError(code, message); }
function checkSize(size: number, limit: number, code: string): void { if (size > limit) fail(code, `${size} exceeds limit ${limit}`); }
function isZip(bytes: Uint8Array): boolean { return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4; }
function archivePath(path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\") || /^(?:[a-z]+:|[A-Za-z]:)/i.test(path)) fail("USD_ARCHIVE_PATH", `invalid archive path ${path}`);
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail("USD_ARCHIVE_PATH", `invalid archive path ${path}`);
  return parts.join("/");
}
function joinArchivePath(root: string, path: string): string {
  // Disallow traversal even when it would remain inside the archive. This keeps
  // archive dependencies unambiguous across ZIP readers and operating systems.
  archivePath(path);
  const parent = root.includes("/") ? root.slice(0, root.lastIndexOf("/") + 1) : "";
  return parent + path;
}
function resolveRelative(root: string, dependency: string, context: LoadContext): string {
  if (!dependency || dependency.includes("\0")) fail("USD_DEPENDENCY_PATH", "invalid dependency path");
  try { return new URL(dependency, root).toString(); } catch { return context.resolve(dependency); }
}

/** USDZ specifies uncompressed ZIP members. Compressed/ZIP64/encrypted archives are refused. */
function unpackUSDZ(bytes: Uint8Array, limits: Limits): Archive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, Uint8Array>();
  const localEntries = new Map<string, { offset: number; size: number; crc: number; flags: number }>();
  let offset = 0, total = 0, root = "";
  const requireBytes = (count: number): void => { if (count < 0 || offset + count > bytes.length) fail("USD_ARCHIVE_TRUNCATED", "truncated ZIP member"); };
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const localOffset = offset;
    requireBytes(30);
    const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true), compressed = view.getUint32(offset + 18, true), size = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    if ((flags & 0x09) !== 0 || method !== 0 || compressed !== size || size === 0xffffffff) fail("USD_ARCHIVE_UNSUPPORTED", "USDZ must use unencrypted, stored, non-ZIP64 members with known sizes");
    offset += 30;
    requireBytes(nameLength + extraLength + size);
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + nameLength)); } catch { return fail("USD_ARCHIVE_PATH", "ZIP entry name is not UTF-8"); }
    name = archivePath(name);
    if (files.has(name)) fail("USD_ARCHIVE_DUPLICATE", `duplicate entry ${name}`);
    offset += nameLength + extraLength;
    const data = bytes.subarray(offset, offset + size);
    if (crc32(data) !== crc) fail("USD_ARCHIVE_CRC", `checksum mismatch for ${name}`);
    total += size;
    checkSize(total, limits.maxExpandedBytes, "USD_ARCHIVE_LIMIT");
    if (files.size >= limits.maxArchiveEntries) fail("USD_ARCHIVE_LIMIT", "too many archive entries");
    files.set(name, data);
    localEntries.set(name, { offset: localOffset, size, crc, flags });
    if (!root) root = name;
    offset += size;
  }
  if (!root || offset + 4 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) fail("USD_ARCHIVE_TRUNCATED", "missing ZIP central directory");
  const directoryStart = offset;
  const centralNames = new Set<string>();
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    requireBytes(46);
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true), compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const disk = view.getUint16(offset + 34, true), localOffset = view.getUint32(offset + 42, true);
    offset += 46; requireBytes(nameLength + extraLength + commentLength);
    let name: string;
    try { name = archivePath(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + nameLength))); }
    catch (error) { if (error instanceof USDImportError) throw error; return fail("USD_ARCHIVE_PATH", "central entry name is not UTF-8"); }
    const local = localEntries.get(name);
    if (!local || centralNames.has(name) || disk !== 0 || flags !== local.flags || method !== 0 || compressed !== size || size !== local.size || crc !== local.crc || localOffset !== local.offset) {
      fail("USD_ARCHIVE_DIRECTORY", `central directory does not match local entry ${name}`);
    }
    centralNames.add(name); offset += nameLength + extraLength + commentLength;
  }
  const directorySize = offset - directoryStart;
  requireBytes(22);
  if (view.getUint32(offset, true) !== 0x06054b50 || view.getUint16(offset + 4, true) !== 0 || view.getUint16(offset + 6, true) !== 0 ||
      view.getUint16(offset + 8, true) !== files.size || view.getUint16(offset + 10, true) !== files.size || centralNames.size !== files.size ||
      view.getUint32(offset + 12, true) !== directorySize || view.getUint32(offset + 16, true) !== directoryStart ||
      offset + 22 + view.getUint16(offset + 20, true) !== bytes.length) {
    fail("USD_ARCHIVE_DIRECTORY", "invalid end-of-central-directory record");
  }
  if (!/\.(?:usd|usda|usdc)$/i.test(root)) fail("USD_ARCHIVE_ROOT", "first USDZ member must be a USD layer");
  return { root, files };
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseUSDA(bytes: Uint8Array, limits: Limits): ParsedUSD {
  if (bytes.length >= 8 && new TextDecoder().decode(bytes.subarray(0, 8)) === "PXR-USDC") fail("USD_CRATE_UNSUPPORTED", "binary USD crate layers require a crate decoder");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail("USD_ENCODING", "USDA must be UTF-8"); }
  if (!/^\s*#usda\s+1\.0(?:\s|$)/.test(text)) fail("USD_HEADER", "expected #usda 1.0 header");
  const tokens = lex(text, limits.maxTokens);
  const parser = new USDAParser(tokens, limits);
  return { stage: parser.stage(), diagnostics: parser.diagnostics };
}
function lex(text: string, maxTokens: number): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  const numberPattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const wordPattern = /[A-Za-z_][A-Za-z0-9_:.-]*/y;
  const push = (kind: Token["kind"], value: string): void => { if (tokens.length >= maxTokens) fail("USD_TOKEN_LIMIT", "too many tokens"); tokens.push({ kind, value }); };
  while (cursor < text.length) {
    const ch = text[cursor]!;
    if (ch === "#") { while (cursor < text.length && text[cursor] !== "\n") cursor++; continue; }
    if (ch === "\r" || ch === "\n") { if (ch === "\r" && text[cursor + 1] === "\n") cursor++; cursor++; push("newline", "\n"); continue; }
    if (/\s/.test(ch)) { cursor++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch; cursor++; let value = "", closed = false;
      while (cursor < text.length) {
        const c = text[cursor++]!;
        if (c === quote) { closed = true; break; }
        if (c === "\\") {
          if (cursor >= text.length) fail("USD_SYNTAX", "truncated string escape");
          const escaped = text[cursor++]!; value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else value += c;
      }
      if (!closed) fail("USD_SYNTAX", "unterminated string");
      push("string", value); continue;
    }
    if (ch === "@" || ch === "<") {
      const end = ch === "@" ? "@" : ">"; const start = ++cursor;
      while (cursor < text.length && text[cursor] !== end) cursor++;
      if (cursor >= text.length) fail("USD_SYNTAX", `unterminated ${ch} reference`);
      push(ch === "@" ? "asset" : "path", text.slice(start, cursor)); cursor++; continue;
    }
    numberPattern.lastIndex = cursor;
    const number = numberPattern.exec(text);
    if (number) { push("number", number[0]); cursor += number[0].length; continue; }
    wordPattern.lastIndex = cursor;
    const word = wordPattern.exec(text);
    if (word) { push("word", word[0]); cursor += word[0].length; continue; }
    if ("{}()[]=,:;".includes(ch)) { push("symbol", ch); cursor++; continue; }
    fail("USD_SYNTAX", `unexpected character ${JSON.stringify(ch)} at ${cursor}`);
  }
  return tokens;
}

class USDAParser {
  private index = 0;
  private primCount = 0;
  readonly diagnostics: USDDiagnostic[] = [];
  constructor(private readonly tokens: readonly Token[], private readonly limits: Limits) {}
  private peek(): Token | undefined { return this.tokens[this.index]; }
  private take(): Token { return this.tokens[this.index++] ?? fail("USD_SYNTAX", "unexpected end of file"); }
  private skipNewlines(): void { while (this.peek()?.kind === "newline" || this.peek()?.value === ";") this.index++; }
  private expect(value: string): void { if (this.take().value !== value) fail("USD_SYNTAX", `expected ${value}`); }
  stage(): Stage {
    this.skipNewlines();
    const metadata = this.peek()?.value === "(" ? this.assignments("(", ")", "stage") : new Map<string, Value>();
    const prims: Prim[] = [];
    while (this.peek()) {
      this.skipNewlines();
      if (!this.peek()) break;
      if (["def", "over", "class"].includes(this.peek()!.value)) prims.push(this.prim("", 0));
      else fail("USD_SYNTAX", `unexpected stage token ${this.peek()!.value}`);
    }
    return { metadata, prims };
  }
  private prim(parent: string, depth: number): Prim {
    if (depth > 256 || ++this.primCount > this.limits.maxPrims) fail("USD_PRIM_LIMIT", "prim count or hierarchy depth exceeded");
    const specifier = this.take().value;
    let type = this.take();
    let name: Token;
    if (type.kind === "string") { name = type; type = { kind: "word", value: "Scope" }; } else name = this.take();
    if (type.kind !== "word" || name.kind !== "string" || !name.value || name.value.includes("/")) fail("USD_SYNTAX", "invalid prim declaration");
    const path = `${parent}/${name.value}`;
    if (specifier !== "def") this.diagnostics.push({ code: "USD_COMPOSITION_UNSUPPORTED", message: `${specifier} composition is not resolved`, path });
    this.skipNewlines();
    if (this.peek()?.value === "(") {
      const metadata = this.assignments("(", ")", path);
      for (const key of ["references", "payload", "inherits", "specializes", "variantSelections"]) {
        if (metadata.has(key)) this.diagnostics.push({ code: "USD_COMPOSITION_UNSUPPORTED", message: `${key} composition is not resolved`, path });
      }
    }
    this.skipNewlines(); this.expect("{");
    const properties = new Map<string, Value>(), children: Prim[] = [];
    while (true) {
      this.skipNewlines();
      if (!this.peek()) fail("USD_SYNTAX", `unterminated prim ${path}`);
      if (this.peek()!.value === "}") { this.take(); break; }
      if (["def", "over", "class"].includes(this.peek()!.value)) children.push(this.prim(path, depth + 1));
      else this.assignment(properties, path);
    }
    return { type: type.value, name: name.value, path, properties, children };
  }
  private assignments(open: string, close: string, path: string): Map<string, Value> {
    this.expect(open); const values = new Map<string, Value>();
    while (true) {
      this.skipNewlines();
      if (!this.peek()) fail("USD_SYNTAX", `unterminated ${open}`);
      if (this.peek()!.value === close) { this.take(); return values; }
      this.assignment(values, path);
    }
  }
  private assignment(target: Map<string, Value>, path: string): void {
    const header: Token[] = [];
    while (this.peek() && this.peek()!.kind !== "newline" && this.peek()!.value !== "=" && this.peek()!.value !== "}" && this.peek()!.value !== ")" && this.peek()!.value !== ";") header.push(this.take());
    if (this.peek()?.value !== "=") {
      if (header.length === 0) fail("USD_SYNTAX", `unexpected ${this.peek()?.value ?? "end"}`);
      this.diagnostics.push({ code: "USD_DECLARATION_UNSUPPORTED", message: `ignored declaration ${header.map((t) => t.value).join(" ")}`, path });
      return;
    }
    this.take(); this.skipNewlines();
    const key = [...header].reverse().find((t) => t.kind === "word")?.value;
    if (!key) fail("USD_SYNTAX", "assignment has no property name");
    if (target.has(key)) fail("USD_DUPLICATE_PROPERTY", `duplicate ${key} at ${path}`);
    target.set(key, this.value(0));
    // Per-property metadata is parsed for syntax but currently not interpreted.
    this.skipNewlines();
    if (this.peek()?.value === "(") {
      const metadata = this.assignments("(", ")", path);
      const interpolation = metadata.get("interpolation");
      if (interpolation !== undefined) target.set(`${key}.__interpolation`, interpolation);
    }
  }
  private value(depth: number): Value {
    if (depth > 256) fail("USD_NESTING_LIMIT", "value nesting exceeded");
    this.skipNewlines(); const token = this.take();
    if (token.kind === "number") { const n = Number(token.value); if (!Number.isFinite(n)) fail("USD_NUMBER", "non-finite number"); return n; }
    if (token.kind === "string" || token.kind === "asset" || token.kind === "path") return token.value;
    if (token.kind === "word") return token.value === "true" ? true : token.value === "false" ? false : token.value === "None" ? null : token.value;
    if (token.value === "[" || token.value === "(") {
      const close = token.value === "[" ? "]" : ")"; const result: Value[] = [];
      while (true) {
        this.skipNewlines(); if (!this.peek()) fail("USD_SYNTAX", `unterminated ${token.value}`);
        if (this.peek()!.value === close) { this.take(); return result; }
        if (this.peek()!.value === ",") { this.take(); continue; }
        result.push(this.value(depth + 1));
      }
    }
    if (token.value === "{") {
      const result: { [key: string]: Value } = Object.create(null) as { [key: string]: Value };
      while (true) {
        this.skipNewlines(); if (!this.peek()) fail("USD_SYNTAX", "unterminated dictionary");
        if (this.peek()!.value === "}") { this.take(); return result; }
        if (this.peek()!.value === ",") { this.take(); continue; }
        const keyToken = this.take();
        const key = keyToken.kind === "number" ? String(Number(keyToken.value)) : keyToken.value;
        this.expect(":");
        if (Object.prototype.hasOwnProperty.call(result, key)) fail("USD_SYNTAX", `duplicate dictionary key ${key}`);
        result[key] = this.value(depth + 1);
      }
    }
    return fail("USD_SYNTAX", `unexpected value ${token.value}`);
  }
}

class GLTFBuffer {
  readonly views: BufferView[] = [];
  readonly accessors: Record<string, unknown>[] = [];
  private readonly chunks: Uint8Array[] = [];
  private size = 0;
  addFloat(values: readonly number[], type: "SCALAR" | "VEC2" | "VEC3" | "VEC4", bounds = false): number {
    const components = type === "SCALAR" ? 1 : Number(type.slice(3));
    if (values.length % components !== 0 || values.some((v) => !Number.isFinite(v) || Math.abs(v) > 3.4028234e38)) fail("USD_NUMBER", "invalid accessor values");
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    const accessor: Record<string, unknown> = { bufferView: this.append(bytes), componentType: 5126, count: values.length / components, type };
    if (bounds && values.length) {
      const min = Array<number>(components).fill(Infinity), max = Array<number>(components).fill(-Infinity);
      values.forEach((value, index) => { const axis = index % components; min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value); });
      accessor.min = min; accessor.max = max;
    }
    this.accessors.push(accessor); return this.accessors.length - 1;
  }
  addIndices(values: readonly number[]): number {
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    values.forEach((value, index) => { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) fail("USD_INDEX", "invalid vertex index"); view.setUint32(index * 4, value, true); });
    this.accessors.push({ bufferView: this.append(bytes), componentType: 5125, count: values.length, type: "SCALAR" });
    return this.accessors.length - 1;
  }
  private append(bytes: Uint8Array): number {
    const padding = (4 - this.size % 4) % 4;
    if (padding) { this.chunks.push(new Uint8Array(padding)); this.size += padding; }
    const index = this.views.length;
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.length }); this.chunks.push(bytes); this.size += bytes.length;
    return index;
  }
  data(): Uint8Array {
    const output = new Uint8Array(this.size); let offset = 0;
    for (const chunk of this.chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
}

async function convertStage(parsed: ParsedUSD, limits: Limits, interpolation: "linear" | "held", readDependency: (path: string) => Promise<Uint8Array>): Promise<Record<string, unknown>> {
  const { stage, diagnostics } = parsed;
  const byPath = new Map<string, Prim>();
  const walk = (prim: Prim): void => {
    if (byPath.has(prim.path)) fail("USD_DUPLICATE_PRIM", `duplicate prim ${prim.path}`);
    byPath.set(prim.path, prim); prim.children.forEach(walk);
  };
  stage.prims.forEach(walk);
  if (stage.metadata.has("subLayers")) diagnostics.push({ code: "USD_COMPOSITION_UNSUPPORTED", message: "Sublayer composition is not resolved" });
  const up = stringValue(stage.metadata.get("upAxis")) ?? "Y";
  if (up !== "Y" && up !== "Z") fail("USD_UP_AXIS", `unsupported upAxis ${up}`);
  const units = numberValue(stage.metadata.get("metersPerUnit"), 0.01);
  const rate = numberValue(stage.metadata.get("timeCodesPerSecond"), numberValue(stage.metadata.get("framesPerSecond"), 24));
  if (units <= 0 || rate <= 0) fail("USD_STAGE_METADATA", "metersPerUnit and timeCodesPerSecond must be positive");
  const authoredStart = numberValue(stage.metadata.get("startTimeCode"), 0);
  let start = authoredStart;
  for (const prim of byPath.values()) {
    for (const [key, value] of prim.properties) {
      if (!key.endsWith(".timeSamples") || !value || Array.isArray(value) || typeof value !== "object") continue;
      for (const sample of Object.keys(value)) {
        const time = Number(sample);
        if (!Number.isFinite(time)) fail("USD_ANIMATION", `invalid time sample ${sample}`);
        start = Math.min(start, time);
      }
    }
  }
  if (start < authoredStart) diagnostics.push({ code: "USD_TIME_ORIGIN_SHIFTED", message: `Timeline origin shifted from ${authoredStart} to ${start} to represent earlier USD samples` });
  const buffer = new GLTFBuffer();
  const nodes: MutableNode[] = [], meshes: Record<string, unknown>[] = [], materials: Record<string, unknown>[] = [], cameras: Record<string, unknown>[] = [], lights: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [], textures: Record<string, unknown>[] = [];
  const samplers: Record<string, unknown>[] = [], channels: Record<string, unknown>[] = [];
  // Axis-angle tracks can need extra quaternion keys to retain full turns.
  // Bound the generated keys across the stage, not just per animated node.
  const rotationKeyBudget = { remaining: Math.min(65_536, Math.floor(limits.maxExpandedBytes / 32)) };
  const materialIndices = new Map<string, number>(), textureIndices = new Map<string, number>();
  const doubleSidedMaterials = new Map<string, number>();
  let textureBytes = 0, vertexBudget = 0, indexBudget = 0;

  async function textureIndex(path: string): Promise<number> {
    const existing = textureIndices.get(path); if (existing !== undefined) return existing;
    if (textureIndices.size >= limits.maxArchiveEntries) fail("USD_DEPENDENCY_LIMIT", "too many texture dependencies");
    const bytes = await readDependency(path); textureBytes += bytes.length;
    checkSize(textureBytes, limits.maxExpandedBytes, "USD_DEPENDENCY_LIMIT");
    const mime = validateImage(bytes);
    const image = images.length; images.push({ uri: `data:${mime};base64,${base64(bytes)}`, name: path });
    const index = textures.length; textures.push({ source: image, name: path }); textureIndices.set(path, index); return index;
  }
  for (const prim of byPath.values()) {
    if (prim.type !== "Material") continue;
    const shader = findPreviewShader(prim, byPath);
    if (!shader) { diagnostics.push({ code: "USD_MATERIAL_UNSUPPORTED", message: "Material has no UsdPreviewSurface", path: prim.path }); continue; }
    const prop = shader.properties;
    const color = tuple(prop.get("inputs:diffuseColor"), 3, [0.18, 0.18, 0.18], "diffuseColor").map((value) => unit(value, "diffuseColor"));
    const opacity = unit(numberValue(prop.get("inputs:opacity"), 1), "opacity");
    const roughness = unit(numberValue(prop.get("inputs:roughness"), 0.5), "roughness");
    const metallic = unit(numberValue(prop.get("inputs:metallic"), 0), "metallic");
    const pbr: Record<string, unknown> = { baseColorFactor: [...color, opacity], metallicFactor: metallic, roughnessFactor: roughness };
    const textureRef = stringValue(prop.get("inputs:diffuseColor.connect"));
    if (textureRef) {
      const textureShader = byPath.get(textureRef.split(".outputs:", 1)[0]!);
      const file = textureShader && stringValue(textureShader.properties.get("inputs:file"));
      if (textureShader && stringValue(textureShader.properties.get("info:id")) === "UsdUVTexture" && file) {
        pbr.baseColorTexture = { index: await textureIndex(file) };
        // Connected inputs replace the authored/default preview color; glTF's
        // factor multiplies the texture instead of acting as a fallback.
        const scale = tuple(textureShader.properties.get("inputs:scale"), 4, [1, 1, 1, 1], "texture scale");
        if (scale.some((value) => value < 0 || value > 1)) {
          diagnostics.push({ code: "USD_TEXTURE_SCALE_UNSUPPORTED", message: "Texture scale outside glTF factor range is not represented", path: textureShader.path });
          pbr.baseColorFactor = [1, 1, 1, opacity];
        } else pbr.baseColorFactor = [scale[0], scale[1], scale[2], opacity];
        const bias = tuple(textureShader.properties.get("inputs:bias"), 4, [0, 0, 0, 0], "texture bias");
        if (bias.some((value) => value !== 0)) diagnostics.push({ code: "USD_TEXTURE_BIAS_UNSUPPORTED", message: "Texture bias is not represented", path: textureShader.path });
        const st = stringValue(textureShader.properties.get("inputs:st.connect"));
        if (st) {
          const reader = byPath.get(st.split(".outputs:", 1)[0]!);
          const variable = reader && stringValue(reader.properties.get("inputs:varname"));
          if (!reader || stringValue(reader.properties.get("info:id")) !== "UsdPrimvarReader_float2" || (variable && variable !== "st")) {
            diagnostics.push({ code: "USD_TEXCOORD_UNSUPPORTED", message: "Texture coordinate graph is not a primvar reader for st", path: textureShader.path });
          }
        }
      } else diagnostics.push({ code: "USD_SHADER_CONNECTION_UNSUPPORTED", message: "Unsupported diffuse color shader connection", path: shader.path });
    }
    const threshold = numberValue(prop.get("inputs:opacityThreshold"), 0);
    const emissive = tuple(prop.get("inputs:emissiveColor"), 3, [0, 0, 0], "emissiveColor").map((value) => unit(value, "emissiveColor"));
    const material: Record<string, unknown> = { name: prim.name, pbrMetallicRoughness: pbr, emissiveFactor: emissive };
    if (threshold > 0) { material.alphaMode = "MASK"; material.alphaCutoff = unit(threshold, "opacityThreshold"); }
    else if (opacity < 1) material.alphaMode = "BLEND";
    materialIndices.set(prim.path, materials.length); materials.push(material);
    for (const key of prop.keys()) {
      if (key.endsWith(".connect") && key !== "inputs:diffuseColor.connect") diagnostics.push({ code: "USD_SHADER_CONNECTION_UNSUPPORTED", message: `${key} is not translated`, path: shader.path });
    }
  }

  const addPrim = (prim: Prim, inheritedMaterial?: string): number | undefined => {
    if (prim.type === "Material" || prim.type === "Shader" || prim.type === "GeomSubset") return undefined;
    if (stringValue(prim.properties.get("visibility")) === "invisible") return undefined;
    const supported = new Set(["Scope", "Xform", "Mesh", "Camera", "DistantLight", "SphereLight"]);
    if (!supported.has(prim.type)) diagnostics.push({ code: "USD_PRIM_UNSUPPORTED", message: `Prim type ${prim.type} is not translated`, path: prim.path });
    const currentMaterial = stringValue(prim.properties.get("material:binding")) ?? inheritedMaterial;
    const node: MutableNode = { name: prim.name };
    const nodeIndex = nodes.length; nodes.push(node);
    applyTransform(prim, node, nodeIndex, buffer, samplers, channels, rate, start, diagnostics, rotationKeyBudget, interpolation);
    if (prim.type === "Mesh") {
      const geometry = buildMesh(prim, currentMaterial, materialIndices, materials, doubleSidedMaterials, buffer, limits, diagnostics);
      vertexBudget += geometry.vertices; indexBudget += geometry.indices;
      checkSize(vertexBudget, limits.maxVertices, "USD_VERTEX_LIMIT"); checkSize(indexBudget, limits.maxFaceIndices * 3, "USD_INDEX_LIMIT");
      node.mesh = meshes.length; meshes.push(geometry.mesh);
    } else if (prim.type === "Camera") {
      const projection = stringValue(prim.properties.get("projection")) ?? "perspective";
      const horizontal = numberValue(prim.properties.get("horizontalAperture"), 20.955), vertical = numberValue(prim.properties.get("verticalAperture"), 20.955);
      const clip = tuple(prim.properties.get("clippingRange"), 2, [1, 1_000_000], "clippingRange");
      if (horizontal <= 0 || vertical <= 0 || clip[0]! <= 0 || clip[1]! <= clip[0]!) fail("USD_CAMERA", `invalid camera at ${prim.path}`);
      let camera: Record<string, unknown>;
      if (projection === "perspective") {
        const focal = numberValue(prim.properties.get("focalLength"), 50); if (focal <= 0) fail("USD_CAMERA", "focalLength must be positive");
        camera = { name: prim.name, type: "perspective", perspective: { yfov: 2 * Math.atan(vertical / (2 * focal)), aspectRatio: horizontal / vertical, znear: clip[0]! * units, zfar: clip[1]! * units } };
      } else if (projection === "orthographic") camera = { name: prim.name, type: "orthographic", orthographic: { xmag: horizontal * 0.05 * units, ymag: vertical * 0.05 * units, znear: clip[0]! * units, zfar: clip[1]! * units } };
      else return fail("USD_CAMERA", `unsupported projection ${projection}`);
      node.camera = cameras.length; cameras.push(camera);
    } else if (prim.type === "DistantLight" || prim.type === "SphereLight") {
      const intensity = numberValue(prim.properties.get("inputs:intensity"), 1) * Math.pow(2, numberValue(prim.properties.get("inputs:exposure"), 0));
      const color = tuple(prim.properties.get("inputs:color"), 3, [1, 1, 1], "light color");
      if (!Number.isFinite(intensity) || intensity < 0 || color.some((n) => n < 0)) fail("USD_LIGHT", `invalid light at ${prim.path}`);
      node.extensions = { KHR_lights_punctual: { light: lights.length } };
      lights.push({ name: prim.name, type: prim.type === "DistantLight" ? "directional" : "point", intensity, color });
      diagnostics.push({ code: "USD_LIGHT_UNIT_APPROXIMATION", message: "USD light intensity is mapped without physical unit conversion", path: prim.path });
    }
    const children = prim.children.map((child) => addPrim(child, currentMaterial)).filter((n): n is number => n !== undefined);
    if (children.length) node.children = children;
    return nodeIndex;
  };
  const roots = stage.prims.map((prim) => addPrim(prim)).filter((n): n is number => n !== undefined);
  if (!roots.length) fail("USD_EMPTY_STAGE", "stage contains no scene prims");
  // Conversion root preserves authoring-space transforms while bringing stage
  // coordinates to glTF metres/Y-up (USD is right-handed, as is glTF).
  const root: MutableNode = { name: "USD stage units and axis", scale: [units, units, units], children: roots };
  if (up === "Z") root.rotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const rootIndex = nodes.length; nodes.push(root);
  const data = buffer.data();
  const doc: Record<string, unknown> = {
    asset: { version: "2.0", generator: "Aura3D USDA importer" },
    scenes: [{ nodes: [rootIndex] }], scene: 0, nodes, meshes, materials, cameras, images, textures,
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(data)}`, byteLength: data.length }],
    bufferViews: buffer.views, accessors: buffer.accessors
  };
  if (lights.length) { doc.extensionsUsed = ["KHR_lights_punctual"]; doc.extensions = { KHR_lights_punctual: { lights } }; }
  if (samplers.length) doc.animations = [{ name: "USD stage animation", samplers, channels }];
  return doc;
}

function findPreviewShader(material: Prim, byPath: ReadonlyMap<string, Prim>): Prim | undefined {
  const connection = stringValue(material.properties.get("outputs:surface.connect"));
  const connected = connection && byPath.get(connection.split(".outputs:", 1)[0]!);
  if (connected && stringValue(connected.properties.get("info:id")) === "UsdPreviewSurface") return connected;
  return material.children.find((child) => child.type === "Shader" && stringValue(child.properties.get("info:id")) === "UsdPreviewSurface");
}
function stringValue(value: Value | undefined): string | undefined { return typeof value === "string" ? value : undefined; }
function numberValue(value: Value | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) fail("USD_NUMBER", "expected a finite number");
  return value;
}
function unit(value: number, name: string): number { if (value < 0 || value > 1) fail("USD_MATERIAL", `${name} must be in [0, 1]`); return value; }
function tuple(value: Value | undefined, size: number, fallback: number[], label: string): number[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== size || value.some((n) => typeof n !== "number" || !Number.isFinite(n))) fail("USD_VALUE", `${label} requires ${size} finite values`);
  return value as number[];
}
function tuples(value: Value | undefined, size: number, label: string): number[][] {
  if (!Array.isArray(value)) fail("USD_GEOMETRY", `${label} must be an array`);
  return value.map((entry) => tuple(entry, size, [], label));
}
function integers(value: Value | undefined, label: string): number[] {
  if (!Array.isArray(value) || value.some((n) => typeof n !== "number" || !Number.isSafeInteger(n))) fail("USD_GEOMETRY", `${label} must be an integer array`);
  return value as number[];
}
function base64(bytes: Uint8Array): string {
  let binary = ""; const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) binary += String.fromCharCode(...bytes.subarray(i, i + block));
  return btoa(binary);
}
function validateImage(bytes: Uint8Array): "image/png" | "image/jpeg" {
  let width = 0, height = 0;
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) fail("USD_IMAGE", "invalid PNG header");
    width = view.getUint32(16); height = view.getUint32(20);
    if (!width || !height || width * height > 16_777_216) fail("USD_IMAGE_LIMIT", "PNG dimensions exceed the pixel limit");
    let offset = 8, hasData = false, hasEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), end = offset + 12 + length;
      if (!Number.isSafeInteger(end) || end > bytes.length) fail("USD_IMAGE", "truncated PNG chunk");
      const type = view.getUint32(offset + 4);
      if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) fail("USD_IMAGE", "PNG chunk checksum mismatch");
      if (type === 0x49444154) hasData = true;
      if (type === 0x49454e44) {
        if (length !== 0 || end !== bytes.length) fail("USD_IMAGE", "invalid PNG end chunk");
        hasEnd = true; break;
      }
      offset = end;
    }
    if (!hasData || !hasEnd) fail("USD_IMAGE", "PNG is missing image data or end chunk");
    return "image/png";
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 3 < bytes.length) {
      if (bytes[i++] !== 0xff) fail("USD_IMAGE", "invalid JPEG marker");
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > bytes.length) break;
      const length = (bytes[i]! << 8) | bytes[i + 1]!;
      if (length < 2 || i + length > bytes.length) fail("USD_IMAGE", "truncated JPEG segment");
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) fail("USD_IMAGE", "truncated JPEG frame");
        height = (bytes[i + 3]! << 8) | bytes[i + 4]!; width = (bytes[i + 5]! << 8) | bytes[i + 6]!; break;
      }
      i += length;
    }
    if (!width || !height || width * height > 16_777_216) fail("USD_IMAGE_LIMIT", "missing or excessive JPEG dimensions");
    return "image/jpeg";
  }
  return fail("USD_IMAGE_UNSUPPORTED", "only PNG and JPEG texture dependencies are supported");
}

function buildMesh(prim: Prim, inheritedMaterial: string | undefined, materialIndices: ReadonlyMap<string, number>, materials: Record<string, unknown>[], doubleSidedMaterials: Map<string, number>, buffer: GLTFBuffer, limits: Limits, diagnostics: USDDiagnostic[]): { mesh: Record<string, unknown>; vertices: number; indices: number } {
  const prop = prim.properties;
  const points = tuples(prop.get("points"), 3, "points");
  const counts = integers(prop.get("faceVertexCounts"), "faceVertexCounts"), refs = integers(prop.get("faceVertexIndices"), "faceVertexIndices");
  if (!points.length || !counts.length) fail("USD_GEOMETRY", `${prim.path} has no polygon geometry`);
  checkSize(points.length, limits.maxVertices, "USD_VERTEX_LIMIT"); checkSize(refs.length, limits.maxFaceIndices, "USD_INDEX_LIMIT");
  if (counts.some((n) => n < 3) || counts.reduce((a, n) => a + n, 0) !== refs.length) fail("USD_GEOMETRY", `invalid face counts in ${prim.path}`);
  if (refs.some((n) => n < 0 || n >= points.length)) fail("USD_INDEX", `point index outside bounds in ${prim.path}`);
  const normalValues = prop.has("normals") ? tuples(prop.get("normals"), 3, "normals") : undefined;
  const uvValues = prop.has("primvars:st") ? tuples(prop.get("primvars:st"), 2, "primvars:st") : undefined;
  const uvIndices = prop.has("primvars:st:indices") ? integers(prop.get("primvars:st:indices"), "primvars:st:indices") : undefined;
  const colorValues = prop.has("primvars:displayColor") ? tuples(prop.get("primvars:displayColor"), 3, "primvars:displayColor") : undefined;
  const colorIndices = prop.has("primvars:displayColor:indices") ? integers(prop.get("primvars:displayColor:indices"), "primvars:displayColor:indices") : undefined;
  const normalInterpolation = stringValue(prop.get("normals.__interpolation"));
  const uvInterpolation = stringValue(prop.get("primvars:st.__interpolation"));
  const colorInterpolation = stringValue(prop.get("primvars:displayColor.__interpolation"));
  if (uvIndices?.some((n) => n < 0 || n >= (uvValues?.length ?? 0))) fail("USD_INDEX", `UV index outside bounds in ${prim.path}`);
  if (colorIndices?.some((n) => n < 0 || n >= (colorValues?.length ?? 0))) fail("USD_INDEX", `color index outside bounds in ${prim.path}`);
  const holes = new Set(prop.has("holeIndices") ? integers(prop.get("holeIndices"), "holeIndices") : []);
  if ([...holes].some((n) => n < 0 || n >= counts.length)) fail("USD_INDEX", `hole index outside bounds in ${prim.path}`);
  const orientation = stringValue(prop.get("orientation")) ?? "rightHanded";
  if (orientation !== "rightHanded" && orientation !== "leftHanded") fail("USD_GEOMETRY", `invalid orientation ${orientation}`);
  const leftHanded = orientation === "leftHanded";
  const scheme = stringValue(prop.get("subdivisionScheme")) ?? "catmullClark";
  if (scheme !== "none") diagnostics.push({ code: "USD_SUBDIVISION_UNSUPPORTED", message: `${scheme} subdivision imported as its polygon cage`, path: prim.path });
  const faceMaterials = Array<string | undefined>(counts.length).fill(inheritedMaterial);
  for (const subset of prim.children.filter((child) => child.type === "GeomSubset")) {
    const subsetMaterial = stringValue(subset.properties.get("material:binding"));
    const subsetFaces = integers(subset.properties.get("indices"), "GeomSubset indices");
    if (stringValue(subset.properties.get("elementType")) && stringValue(subset.properties.get("elementType")) !== "face") {
      diagnostics.push({ code: "USD_SUBSET_UNSUPPORTED", message: "Only face material subsets are translated", path: subset.path }); continue;
    }
    for (const face of subsetFaces) { if (face < 0 || face >= counts.length) fail("USD_INDEX", `subset face index outside bounds in ${subset.path}`); faceMaterials[face] = subsetMaterial ?? inheritedMaterial; }
  }
  interface Group { positions: number[]; normals: number[]; texcoords: number[]; colors: number[]; indices: number[] }
  const groups = new Map<string, Group>();
  let corner = 0, totalVertices = 0, totalIndices = 0;
  for (let face = 0; face < counts.length; face++) {
    const count = counts[face]!;
    if (holes.has(face)) { corner += count; continue; }
    const materialPath = faceMaterials[face] ?? "";
    let group = groups.get(materialPath);
    if (!group) { group = { positions: [], normals: [], texcoords: [], colors: [], indices: [] }; groups.set(materialPath, group); }
    const base = group.positions.length / 3;
    for (let local = 0; local < count; local++) {
      const pointIndex = refs[corner + local]!, position = points[pointIndex]!;
      group.positions.push(...position);
      if (normalValues) group.normals.push(...attributeAt(normalValues, undefined, normalInterpolation, pointIndex, corner + local, face, points.length, refs.length, counts.length, "normals"));
      if (uvValues) group.texcoords.push(...attributeAt(uvValues, uvIndices, uvInterpolation, pointIndex, corner + local, face, points.length, refs.length, counts.length, "UV"));
      if (colorValues && !materialPath) group.colors.push(...attributeAt(colorValues, colorIndices, colorInterpolation, pointIndex, corner + local, face, points.length, refs.length, counts.length, "displayColor").map((value) => unit(value, "displayColor")));
    }
    for (let local = 1; local < count - 1; local++) {
      group.indices.push(base, base + (leftHanded ? local + 1 : local), base + (leftHanded ? local : local + 1));
    }
    totalVertices += count; totalIndices += (count - 2) * 3;
    checkSize(totalVertices, limits.maxVertices, "USD_VERTEX_LIMIT");
    checkSize(totalIndices, limits.maxFaceIndices * 3, "USD_INDEX_LIMIT");
    corner += count;
  }
  if (!totalIndices) fail("USD_GEOMETRY", `mesh ${prim.path} has no visible faces`);
  const primitives: Record<string, unknown>[] = [];
  for (const [materialPath, group] of groups) {
    if (!group.normals.length) group.normals = generatedNormals(group.positions, group.indices);
    const attributes: Record<string, number> = { POSITION: buffer.addFloat(group.positions, "VEC3", true), NORMAL: buffer.addFloat(group.normals, "VEC3") };
    if (group.texcoords.length) attributes.TEXCOORD_0 = buffer.addFloat(group.texcoords, "VEC2");
    if (group.colors.length) attributes.COLOR_0 = buffer.addFloat(group.colors, "VEC3");
    const primitive: Record<string, unknown> = { attributes, indices: buffer.addIndices(group.indices) };
    if (materialPath) {
      const material = materialIndices.get(materialPath);
      if (material === undefined) diagnostics.push({ code: "USD_MATERIAL_MISSING", message: `Unresolved material ${materialPath}`, path: prim.path });
      else primitive.material = material;
    }
    if (prop.get("doubleSided") === true) {
      const key = String(primitive.material ?? "default");
      let material = doubleSidedMaterials.get(key);
      if (material === undefined) {
        material = materials.length;
        materials.push({ ...(typeof primitive.material === "number" ? materials[primitive.material] : {}), doubleSided: true });
        doubleSidedMaterials.set(key, material);
      }
      primitive.material = material;
    }
    primitives.push(primitive);
  }
  return { mesh: { name: prim.name, primitives }, vertices: totalVertices, indices: totalIndices };
}
function attributeAt(values: number[][], indices: number[] | undefined, interpolation: string | undefined, point: number, corner: number, face: number, pointCount: number, cornerCount: number, faceCount: number, label: string): number[] {
  const logicalCount = indices?.length ?? values.length;
  let index: number;
  switch (interpolation) {
    case "constant": index = 0; break;
    case "uniform": index = face; break;
    case "vertex": case "varying": index = point; break;
    case "faceVarying": index = corner; break;
    case undefined:
      index = logicalCount === pointCount ? point : logicalCount === cornerCount ? corner : logicalCount === faceCount ? face : logicalCount === 1 ? 0 : -1; break;
    default: return fail("USD_INTERPOLATION_UNSUPPORTED", `${label} interpolation ${interpolation} is not supported`);
  }
  if (indices) index = indices[index] ?? -1;
  if (index < 0 || index >= values.length) fail("USD_GEOMETRY", `${label} interpolation/index count is inconsistent`);
  return values[index]!;
}
function generatedNormals(positions: number[], indices: number[]): number[] {
  const normals = Array<number>(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const offset of [a, b, c]) { normals[offset]! += x; normals[offset + 1]! += y; normals[offset + 2]! += z; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (length > 1e-12) { normals[i]! /= length; normals[i + 1]! /= length; normals[i + 2]! /= length; }
    else { normals[i] = 0; normals[i + 1] = 0; normals[i + 2] = 1; }
  }
  return normals;
}

interface AxisRotationPlan { readonly times: number[]; readonly values: number[]; readonly resampled: boolean }

function axisRotation(op: string, degrees: number): number[] {
  // Reducing whole quaternion turns avoids unnecessary trigonometric loss for
  // large, but otherwise bounded, authored angles. The sign is retained over
  // 360 degrees so adjacent generated keys preserve the intended arc.
  const halfAngle = (degrees % 720) * Math.PI / 360;
  const sine = Math.sin(halfAngle), cosine = Math.cos(halfAngle);
  return [op.endsWith("X") ? sine : 0, op.endsWith("Y") ? sine : 0, op.endsWith("Z") ? sine : 0, cosine];
}

/**
 * Convert linearly interpolated single-axis degrees into bounded quaternion
 * segments. Subdividing to at most 90 degrees preserves direction and complete
 * turns when the glTF runtime chooses the shortest quaternion arc. Conversion
 * still uses float32 keyframes and the runtime's quaternion interpolation.
 * Held interpolation instead retains only the original keys and uses STEP.
 * Returning undefined retains the existing explicitly diagnosed static path.
 */
function planAxisRotation(
  op: string, samples: Value, rate: number, start: number, remaining: number, interpolation: "linear" | "held"
): AxisRotationPlan | undefined {
  if (!samples || Array.isArray(samples) || typeof samples !== "object") fail("USD_ANIMATION", `invalid samples for ${op}`);
  const keys = Object.keys(samples).map(Number).sort((a, b) => a - b);
  if (!keys.length || keys.some((key, i) => !Number.isFinite(key) || (i > 0 && key <= keys[i - 1]!))) fail("USD_ANIMATION", `invalid sample times for ${op}`);
  const angles = keys.map((key) => {
    const value = samples[String(key)];
    if (typeof value !== "number" || !Number.isFinite(value)) fail("USD_ANIMATION", `invalid angle for ${op}`);
    return value;
  });
  // Extremely large authored angles lose meaningful fractional precision and
  // may otherwise expand a tiny input into an unbounded output.
  if (angles.some((angle) => Math.abs(angle) > 1_000_000_000)) return undefined;
  const steps: number[] = [];
  let count = 1;
  for (let index = 1; index < keys.length; index++) {
    const segments = interpolation === "held" ? 1 : Math.max(1, Math.ceil(Math.abs(angles[index]! - angles[index - 1]!) / 90));
    if (!Number.isSafeInteger(segments) || segments > remaining || count + segments > remaining) return undefined;
    steps.push(segments); count += segments;
  }
  if (count > remaining) return undefined;
  const times: number[] = [], values: number[] = [];
  const append = (authoredTime: number, degrees: number): boolean => {
    const time = (authoredTime - start) / rate;
    const rounded = Math.fround(time);
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(rounded) || (times.length && rounded <= Math.fround(times[times.length - 1]!))) return false;
    const next = axisRotation(op, degrees);
    // Numerical range reduction may choose an equivalent opposite quaternion.
    // Keep adjacent keys in the same hemisphere without changing the rotation.
    if (values.length) {
      const offset = values.length - 4;
      const dot = next.reduce((sum, value, index) => sum + value * values[offset + index]!, 0);
      if (dot < 0) for (let index = 0; index < 4; index++) next[index] = -next[index]!;
    }
    times.push(time); values.push(...next); return true;
  };
  if (!append(keys[0]!, angles[0]!)) return undefined;
  for (let index = 1; index < keys.length; index++) {
    const count = steps[index - 1]!;
    for (let segment = 1; segment <= count; segment++) {
      const t = segment / count;
      // Use the authored endpoints directly; arithmetic cancellation must not
      // move a key or replace its exact value at a discontinuity.
      const time = segment === count ? keys[index]! : keys[index - 1]! + (keys[index]! - keys[index - 1]!) * t;
      const angle = segment === count ? angles[index]! : angles[index - 1]! + (angles[index]! - angles[index - 1]!) * t;
      if (!append(time, angle)) return undefined;
    }
  }
  return { times, values, resampled: times.length > keys.length };
}

function applyTransform(prim: Prim, node: MutableNode, nodeIndex: number, buffer: GLTFBuffer, samplers: Record<string, unknown>[], channels: Record<string, unknown>[], rate: number, start: number, diagnostics: USDDiagnostic[], rotationKeyBudget: { remaining: number }, interpolation: "linear" | "held"): void {
  const prop = prim.properties;
  const orderValue = prop.get("xformOpOrder");
  const order = orderValue ?? [];
  if (orderValue === undefined && [...prop.keys()].some((key) => key.startsWith("xformOp:"))) {
    diagnostics.push({ code: "USD_TRANSFORM_ORDER_MISSING", message: "Transform operations without xformOpOrder are not applied", path: prim.path });
  }
  if (!Array.isArray(order) || order.some((value) => typeof value !== "string")) fail("USD_TRANSFORM", `invalid xformOpOrder at ${prim.path}`);
  let matrix = identity();
  const ops = order as string[];
  const slot = (op: string): number => op === "xformOp:translate" ? 0 : op === "xformOp:scale" ? 2
    : op === "xformOp:orient" || /^xformOp:rotate[XYZ]$/.test(op) ? 1 : -1;
  let canAnimate = ops.every((op, index) => slot(op) >= 0 && (index === 0 || slot(ops[index - 1]!) < slot(op)));
  for (const op of ops) {
    if (op === "!resetXformStack!") { diagnostics.push({ code: "USD_RESET_TRANSFORM_UNSUPPORTED", message: "resetXformStack requires parent-independent world transforms", path: prim.path }); continue; }
    const value = prop.get(op);
    if (value === undefined) {
      if (prop.has(`${op}.timeSamples`)) {
        // A sampled attribute's earliest value is its fallback at initial time.
        const sampled = prop.get(`${op}.timeSamples`);
        if (sampled && !Array.isArray(sampled) && typeof sampled === "object") {
          const first = Object.keys(sampled).map(Number).sort((a, b) => a - b)[0];
          if (first !== undefined) matrix = multiply(matrix, operation(op, sampled[String(first)]!, prim.path));
        }
      } else fail("USD_TRANSFORM", `missing ${op} at ${prim.path}`);
    } else matrix = multiply(matrix, operation(op, value, prim.path));
  }
  const animated = ops.filter((op) => prop.has(`${op}.timeSamples`));
  const rotationOp = ops.find((op) => slot(op) === 1);
  const axisOp = rotationOp && /^xformOp:rotate[XYZ]$/.test(rotationOp) ? rotationOp : undefined;
  let axisPlan: AxisRotationPlan | undefined;
  let unsupportedReason = "Animated ordered transform stack cannot be represented as glTF TRS";
  if (canAnimate && axisOp && animated.includes(axisOp)) {
    axisPlan = planAxisRotation(axisOp, prop.get(`${axisOp}.timeSamples`)!, rate, start, rotationKeyBudget.remaining, interpolation);
    if (!axisPlan) {
      canAnimate = false;
      unsupportedReason = "Single-axis rotation cannot preserve its motion within float32 timing, angle, or generated-key limits";
    }
  }
  if (animated.length && canAnimate) {
    const reportTimeRounding = (op: string, times: readonly number[]): void => {
      if (times.some((time) => Math.fround(time) !== time)) {
        diagnostics.push({ code: "USD_ANIMATION_TIME_QUANTIZED", message: `${op} key times were rounded to float32 seconds; held changes may move by that rounding`, path: prim.path });
      }
    };
    const defaultFor = (op: string): Value => op.endsWith("scale") ? [1, 1, 1] : op.endsWith("orient") ? [1, 0, 0, 0] : [0, 0, 0];
    const initial = (op: string): Value => {
      if (prop.has(op)) return prop.get(op)!;
      const sampled = prop.get(`${op}.timeSamples`);
      if (sampled && !Array.isArray(sampled) && typeof sampled === "object") {
        const key = Object.keys(sampled).map(Number).sort((a, b) => a - b)[0];
        if (key !== undefined) return sampled[String(key)]!;
      }
      return defaultFor(op);
    };
    node.translation = tuple(initial("xformOp:translate"), 3, [0, 0, 0], "translate");
    node.scale = tuple(initial("xformOp:scale"), 3, [1, 1, 1], "scale");
    node.rotation = axisOp ? axisRotation(axisOp, numberValue(initial(axisOp), 0)) : quaternion(initial("xformOp:orient"));
    for (const op of animated) {
      if (op === axisOp && axisPlan) {
        rotationKeyBudget.remaining -= axisPlan.times.length;
        reportTimeRounding(op, axisPlan.times);
        const input = buffer.addFloat(axisPlan.times, "SCALAR", true), output = buffer.addFloat(axisPlan.values, "VEC4");
        const sampler = samplers.length; samplers.push({ input, output, interpolation: interpolation === "held" ? "STEP" : "LINEAR" }); channels.push({ sampler, target: { node: nodeIndex, path: "rotation" } });
        if (axisPlan.resampled) diagnostics.push({ code: "USD_ROTATION_RESAMPLED", message: "Single-axis rotation was subdivided into bounded quaternion segments to preserve turns", path: prim.path });
        continue;
      }
      const samples = prop.get(`${op}.timeSamples`);
      if (!samples || Array.isArray(samples) || typeof samples !== "object") fail("USD_ANIMATION", `invalid samples for ${op}`);
      const keys = Object.keys(samples).map(Number).sort((a, b) => a - b);
      if (!keys.length || keys.some((key, i) => !Number.isFinite(key) || (i > 0 && key <= keys[i - 1]!))) fail("USD_ANIMATION", `invalid sample times for ${op}`);
      const times = keys.map((key) => (key - start) / rate);
      if (times.some((time) => time < 0)) fail("USD_ANIMATION", `sample occurs before stage start for ${op}`);
      if (times.some((time, index) => !Number.isFinite(Math.fround(time)) || (index > 0 && Math.fround(time) <= Math.fround(times[index - 1]!)))) fail("USD_ANIMATION", `sample times cannot be represented as distinct glTF floats for ${op}`);
      reportTimeRounding(op, times);
      const path = op === "xformOp:translate" ? "translation" : op === "xformOp:scale" ? "scale" : "rotation";
      const values = keys.flatMap((key) => path === "rotation" ? quaternion(samples[String(key)]!) : tuple(samples[String(key)], 3, [], op));
      const input = buffer.addFloat(times, "SCALAR", true), output = buffer.addFloat(values, path === "rotation" ? "VEC4" : "VEC3");
      const sampler = samplers.length; samplers.push({ input, output, interpolation: interpolation === "held" ? "STEP" : "LINEAR" }); channels.push({ sampler, target: { node: nodeIndex, path } });
    }
  } else {
    if (ops.length) node.matrix = matrix;
    if (animated.length) diagnostics.push({ code: "USD_ANIMATION_UNSUPPORTED", message: unsupportedReason, path: prim.path });
  }
  for (const key of prop.keys()) if (key.endsWith(".timeSamples") && !ops.some((op) => `${op}.timeSamples` === key)) diagnostics.push({ code: "USD_ANIMATION_UNSUPPORTED", message: `Animated property ${key} is not translated`, path: prim.path });
}
function identity(): number[] { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function multiply(a: number[], b: number[]): number[] {
  const c = Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) c[column * 4 + row]! += a[k * 4 + row]! * b[column * 4 + k]!;
  return c;
}
function quaternion(value: Value): number[] {
  if (!Array.isArray(value)) fail("USD_TRANSFORM", "orientation requires quaternion");
  const parts = value.length === 2 && Array.isArray(value[1]) ? [value[0], ...value[1]] : value;
  if (parts.length !== 4 || parts.some((v) => typeof v !== "number" || !Number.isFinite(v))) fail("USD_TRANSFORM", "invalid quaternion");
  const [w, x, y, z] = parts as number[]; const length = Math.hypot(w!, x!, y!, z!);
  if (length < 1e-12) fail("USD_TRANSFORM", "zero-length quaternion");
  return [x! / length, y! / length, z! / length, w! / length];
}
function rotation(q: number[]): number[] {
  const [x, y, z, w] = q as [number, number, number, number];
  return [1 - 2 * (y*y + z*z), 2 * (x*y + z*w), 2 * (x*z - y*w), 0,
    2 * (x*y - z*w), 1 - 2 * (x*x + z*z), 2 * (y*z + x*w), 0,
    2 * (x*z + y*w), 2 * (y*z - x*w), 1 - 2 * (x*x + y*y), 0, 0, 0, 0, 1];
}
function operation(op: string, value: Value, path: string): number[] {
  const result = identity();
  if (op === "xformOp:translate") { const v = tuple(value, 3, [], op); result[12] = v[0]!; result[13] = v[1]!; result[14] = v[2]!; return result; }
  if (op === "xformOp:scale") { const v = tuple(value, 3, [], op); result[0] = v[0]!; result[5] = v[1]!; result[10] = v[2]!; return result; }
  if (op === "xformOp:orient") return rotation(quaternion(value));
  if (op === "xformOp:transform") {
    if (!Array.isArray(value) || value.length !== 4) fail("USD_TRANSFORM", `invalid matrix at ${path}`);
    // USD matrices are serialized as rows with row vectors; their flattened
    // row-major representation equals the transposed glTF column-major matrix.
    return value.flatMap((row) => tuple(row, 4, [], op));
  }
  const axisMatch = /^xformOp:rotate([XYZ])$/.exec(op);
  if (axisMatch) {
    const angle = numberValue(value, 0) * Math.PI / 360, axis = axisMatch[1];
    return rotation([axis === "X" ? Math.sin(angle) : 0, axis === "Y" ? Math.sin(angle) : 0, axis === "Z" ? Math.sin(angle) : 0, Math.cos(angle)]);
  }
  if (op === "xformOp:rotateXYZ") {
    const v = tuple(value, 3, [], op); let matrix = identity();
    // Authored XYZ rotations act on X, then Y, then Z.
    for (const [i, axis] of ["X", "Y", "Z"].entries()) matrix = multiply(operation(`xformOp:rotate${axis}`, v[i]!, path), matrix);
    return matrix;
  }
  return fail("USD_TRANSFORM_UNSUPPORTED", `unsupported transform op ${op} at ${path}`);
}
