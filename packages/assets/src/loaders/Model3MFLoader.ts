import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";

/** Limits apply before allocation and again while expanding compressed entries. */
export interface Model3MFArchiveLimits {
  readonly maxArchiveBytes?: number;
  readonly maxEntries?: number;
  readonly maxEntryBytes?: number;
  readonly maxExpandedBytes?: number;
  readonly maxCompressionRatio?: number;
  readonly signal?: AbortSignal;
}
export interface Model3MFLimits extends Model3MFArchiveLimits {
  readonly maxXmlElements?: number;
  readonly maxXmlDepth?: number;
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxInstances?: number;
}
export interface Model3MFDiagnostic {
  readonly code: string;
  readonly message: string;
}
export interface Model3MFMaterial {
  readonly name: string;
  readonly color: readonly [number, number, number, number];
}
export interface Model3MFTriangle {
  readonly vertices: readonly [number, number, number];
  readonly propertyId?: number;
  readonly properties: readonly [number, number, number];
}
export interface Model3MFComponent {
  readonly objectId: number;
  /** 3MF 4x3 row-vector affine transform in document units. */
  readonly transform: readonly number[];
}
export interface Model3MFObject {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly triangles: readonly Model3MFTriangle[];
  readonly components: readonly Model3MFComponent[];
}
export interface Model3MFAsset {
  readonly unit: "micron" | "millimeter" | "centimeter" | "inch" | "foot" | "meter";
  readonly metersPerUnit: number;
  readonly modelPath: string;
  readonly objects: readonly Model3MFObject[];
  readonly build: readonly Model3MFComponent[];
  readonly baseMaterials: ReadonlyMap<number, readonly Model3MFMaterial[]>;
  readonly diagnostics: readonly Model3MFDiagnostic[];
  /** The generated, self-contained glTF retains component and build hierarchy. */
  readonly gltf: Readonly<Record<string, unknown>>;
}

const DEFAULT_LIMITS = {
  maxArchiveBytes: 64 * 1024 * 1024,
  maxEntries: 2048,
  maxEntryBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 1000,
  maxXmlElements: 2_000_000,
  maxXmlDepth: 128,
  maxVertices: 1_000_000,
  maxTriangles: 500_000,
  maxInstances: 100_000
} as const;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] as const;
const UNIT_SCALE = { micron: 1e-6, millimeter: 1e-3, centimeter: 1e-2, inch: 0.0254, foot: 0.3048, meter: 1 } as const;

function validatedLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError(`3MF_LIMIT: ${name} must be a positive safe integer`);
  return result;
}
function archiveLimits(options: Model3MFArchiveLimits) {
  return {
    maxArchiveBytes: validatedLimit(options.maxArchiveBytes, DEFAULT_LIMITS.maxArchiveBytes, "maxArchiveBytes"),
    maxEntries: validatedLimit(options.maxEntries, DEFAULT_LIMITS.maxEntries, "maxEntries"),
    maxEntryBytes: validatedLimit(options.maxEntryBytes, DEFAULT_LIMITS.maxEntryBytes, "maxEntryBytes"),
    maxExpandedBytes: validatedLimit(options.maxExpandedBytes, DEFAULT_LIMITS.maxExpandedBytes, "maxExpandedBytes"),
    maxCompressionRatio: validatedLimit(options.maxCompressionRatio, DEFAULT_LIMITS.maxCompressionRatio, "maxCompressionRatio")
  };
}

interface ZipMember { name: string; flags: number; method: number; crc: number; compressed: number; size: number; local: number; }

/**
 * Read a ZIP package without extracting to the filesystem. Supports stored and
 * DEFLATE entries. Rejects ZIP64, encryption, ambiguous paths and corrupt data.
 * The streaming expansion limit is enforced independently of ZIP metadata.
 */
export async function read3MFPackageEntries(input: Uint8Array, options: Model3MFArchiveLimits = {}): Promise<Map<string, Uint8Array>> {
  const limits = archiveLimits(options);
  throwIfAborted(options.signal);
  if (input.byteLength > limits.maxArchiveBytes) throw new RangeError("3MF_ARCHIVE_LIMIT: archive exceeds byte limit");
  if (input.byteLength < 22) throw new Error("3MF_ZIP: truncated archive");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let end = -1;
  const first = Math.max(0, input.length - 65_557);
  for (let offset = input.length - 22; offset >= first; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === input.length) { end = offset; break; }
  }
  if (end < 0) throw new Error("3MF_ZIP: end of central directory not found");
  const disk = view.getUint16(end + 4, true), directoryDisk = view.getUint16(end + 6, true);
  const diskCount = view.getUint16(end + 8, true), count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true), directoryOffset = view.getUint32(end + 16, true);
  if (disk || directoryDisk || diskCount !== count || count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error("3MF_ZIP_UNSUPPORTED: multipart or ZIP64 archive");
  if (count > limits.maxEntries) throw new RangeError("3MF_ARCHIVE_LIMIT: too many entries");
  if (directoryOffset + directorySize !== end || directoryOffset > input.length) throw new Error("3MF_ZIP: invalid central directory bounds");
  const members: ZipMember[] = [];
  const names = new Set<string>();
  let offset = directoryOffset, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("3MF_ZIP: truncated central directory entry");
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true), compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    const startDisk = view.getUint16(offset + 34, true), local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || nameLength === 0) throw new Error("3MF_ZIP: invalid entry bounds or name");
    if (flags & (1 | 0x40 | 0x2000)) throw new Error("3MF_ZIP_UNSUPPORTED: encrypted entry");
    if (flags & (0x10 | 0x20)) throw new Error("3MF_ZIP_UNSUPPORTED: enhanced or patched entry");
    if (method !== 0 && method !== 8) throw new Error(`3MF_ZIP_UNSUPPORTED: compression method ${method}`);
    if (startDisk || compressed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new Error("3MF_ZIP_UNSUPPORTED: multipart or ZIP64 entry");
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(offset + 46, offset + 46 + nameLength)); }
    catch { throw new Error("3MF_ZIP: entry name is not UTF-8"); }
    validateArchivePath(name);
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`3MF_ZIP: duplicate entry ${name}`);
    names.add(key);
    if (size > limits.maxEntryBytes || (compressed === 0 ? size > 0 : size > compressed * limits.maxCompressionRatio)) throw new RangeError(`3MF_ARCHIVE_LIMIT: entry ${name} exceeds expansion limit`);
    expanded += size;
    if (expanded > limits.maxExpandedBytes) throw new RangeError("3MF_ARCHIVE_LIMIT: expanded archive exceeds byte limit");
    members.push({ name, flags, method, crc, compressed, size, local });
    offset = next;
  }
  if (offset !== end) throw new Error("3MF_ZIP: central directory size mismatch");
  const result = new Map<string, Uint8Array>();
  const occupied: Array<[number, number]> = [];
  for (const member of members) {
    throwIfAborted(options.signal);
    const pos = member.local;
    if (pos + 30 > directoryOffset || view.getUint32(pos, true) !== 0x04034b50) throw new Error(`3MF_ZIP: missing local header for ${member.name}`);
    const flags = view.getUint16(pos + 6, true), method = view.getUint16(pos + 8, true);
    const nameLength = view.getUint16(pos + 26, true), extraLength = view.getUint16(pos + 28, true);
    const dataStart = pos + 30 + nameLength + extraLength, dataEnd = dataStart + member.compressed;
    if (dataEnd > directoryOffset || dataStart < pos || flags !== member.flags || method !== member.method) throw new Error(`3MF_ZIP: inconsistent local header for ${member.name}`);
    let localName: string;
    try { localName = new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(pos + 30, pos + 30 + nameLength)); }
    catch { throw new Error("3MF_ZIP: invalid local entry name"); }
    if (localName !== member.name) throw new Error(`3MF_ZIP: local name mismatch for ${member.name}`);
    if (!(flags & 8) && (view.getUint32(pos + 14, true) !== member.crc || view.getUint32(pos + 18, true) !== member.compressed || view.getUint32(pos + 22, true) !== member.size)) throw new Error(`3MF_ZIP: local size or checksum mismatch for ${member.name}`);
    if (occupied.some(([start, endOffset]) => pos < endOffset && dataEnd > start)) throw new Error("3MF_ZIP: overlapping entries");
    occupied.push([pos, dataEnd]);
    const source = input.subarray(dataStart, dataEnd);
    const bytes = method === 0 ? source.slice() : await inflateRaw(source, Math.min(member.size, limits.maxEntryBytes), options.signal);
    if (bytes.length !== member.size || crc32(bytes) !== member.crc) throw new Error(`3MF_ZIP: size or CRC mismatch for ${member.name}`);
    result.set(member.name, bytes);
  }
  return result;
}

function validateArchivePath(name: string): void {
  const path = name.endsWith("/") ? name.slice(0, -1) : name;
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || /^[A-Za-z]:/.test(path) || path.split("/").some((s) => s === "." || s === ".." || s === "") || /%(?:2e|2f|5c)/i.test(path)) {
    throw new Error(`3MF_ZIP_PATH: invalid archive path ${name}`);
  }
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("3MF import aborted", "AbortError");
}
async function inflateRaw(bytes: Uint8Array, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("3MF_ZIP_UNSUPPORTED: DEFLATE decompression is unavailable");
  let stream: TransformStream<Uint8Array, Uint8Array>;
  try { stream = new DecompressionStream("deflate-raw" as CompressionFormat) as TransformStream<Uint8Array, Uint8Array>; }
  catch { throw new Error("3MF_ZIP_UNSUPPORTED: raw DEFLATE decompression is unavailable"); }
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const chunk = await reader.read();
      throwIfAborted(signal);
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) { await reader.cancel(); throw new RangeError("3MF_ARCHIVE_LIMIT: decompressed entry exceeds declared size"); }
      chunks.push(chunk.value);
    }
  } finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ value) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

interface XmlNode { name: string; namespace: string; namespaces: Record<string, string>; attributes: Record<string, string>; children: XmlNode[]; }
function decodeXml(value: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#(?:x[0-9a-f]+|[0-9]+);)/i.test(value)) throw new Error("3MF_XML: invalid entity reference");
  return value.replace(/&([^;]+);/g, (_whole, entity: string) => {
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.prototype.hasOwnProperty.call(predefined, entity)) return predefined[entity]!;
    const match = /^#(?:x([0-9a-f]+)|(\d+))$/i.exec(entity);
    if (!match) throw new Error("3MF_XML: undeclared entity");
    const point = Number.parseInt(match[1] ?? match[2]!, match[1] ? 16 : 10);
    if (!Number.isInteger(point) || point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("3MF_XML: invalid character reference");
    return String.fromCodePoint(point);
  });
}
function localName(name: string): string { return name.slice(name.lastIndexOf(":") + 1); }
function parseXml(bytes: Uint8Array, options: Model3MFLimits): XmlNode {
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\ufeff/, ""); }
  catch { throw new Error("3MF_XML: invalid UTF-8"); }
  const maxElements = validatedLimit(options.maxXmlElements, DEFAULT_LIMITS.maxXmlElements, "maxXmlElements");
  const maxDepth = validatedLimit(options.maxXmlDepth, DEFAULT_LIMITS.maxXmlDepth, "maxXmlDepth");
  let i = 0, count = 0, root: XmlNode | undefined;
  const stack: XmlNode[] = [];
  const xmlName = /^[A-Za-z_][\w.:-]*/;
  while (i < xml.length) {
    const next = xml.indexOf("<", i);
    if (next < 0) { if (!stack.length && xml.slice(i).trim()) throw new Error("3MF_XML: text outside root"); if (stack.length) decodeXml(xml.slice(i)); break; }
    if (!stack.length && xml.slice(i, next).trim()) throw new Error("3MF_XML: text outside root");
    if (stack.length) decodeXml(xml.slice(i, next));
    i = next;
    if (xml.startsWith("<!--", i)) { const end = xml.indexOf("-->", i + 4); if (end < 0) throw new Error("3MF_XML: unfinished comment"); i = end + 3; continue; }
    if (xml.startsWith("<?", i)) { const end = xml.indexOf("?>", i + 2); if (end < 0) throw new Error("3MF_XML: unfinished declaration"); i = end + 2; continue; }
    if (xml.startsWith("<![CDATA[", i)) { if (!stack.length) throw new Error("3MF_XML: CDATA outside root"); const end = xml.indexOf("]]>", i + 9); if (end < 0) throw new Error("3MF_XML: unfinished CDATA"); i = end + 3; continue; }
    if (xml.startsWith("<!", i)) throw new Error("3MF_XML: DTD and declarations are forbidden");
    i++;
    const closing = xml[i] === "/";
    if (closing) i++;
    const nameMatch = xmlName.exec(xml.slice(i));
    if (!nameMatch) throw new Error("3MF_XML: invalid element name");
    const name = nameMatch[0]; i += name.length;
    if (closing) {
      while (/\s/.test(xml[i] ?? "")) i++;
      if (xml[i++] !== ">" || !stack.length || stack.pop()!.name !== name) throw new Error("3MF_XML: mismatched closing element");
      continue;
    }
    const node: XmlNode = {
      name, namespace: "",
      namespaces: Object.assign(Object.create(null) as Record<string, string>, stack[stack.length - 1]?.namespaces ?? {}, { xml: "http://www.w3.org/XML/1998/namespace" }),
      attributes: Object.create(null) as Record<string, string>, children: []
    };
    let selfClosing = false, ended = false;
    while (i < xml.length) {
      const beforeWhitespace = i;
      while (/\s/.test(xml[i] ?? "")) i++;
      if (xml.startsWith("/>", i)) { selfClosing = true; i += 2; ended = true; break; }
      if (xml[i] === ">") { i++; ended = true; break; }
      if (i === beforeWhitespace) throw new Error("3MF_XML: attributes must be separated by whitespace");
      const attrMatch = xmlName.exec(xml.slice(i));
      if (!attrMatch) throw new Error("3MF_XML: invalid attribute");
      const attr = attrMatch[0]; i += attr.length;
      while (/\s/.test(xml[i] ?? "")) i++;
      if (xml[i++] !== "=") throw new Error("3MF_XML: missing attribute equals");
      while (/\s/.test(xml[i] ?? "")) i++;
      const quote = xml[i++];
      if (quote !== '"' && quote !== "'") throw new Error("3MF_XML: unquoted attribute");
      const end = xml.indexOf(quote, i);
      if (end < 0 || xml.slice(i, end).includes("<")) throw new Error("3MF_XML: invalid attribute value");
      if (Object.prototype.hasOwnProperty.call(node.attributes, attr)) throw new Error("3MF_XML: duplicate attribute");
      node.attributes[attr] = decodeXml(xml.slice(i, end)); i = end + 1;
    }
    if (!ended) throw new Error("3MF_XML: unfinished element");
    for (const [key, value] of Object.entries(node.attributes)) {
      if (key === "xmlns") node.namespaces[""] = value;
      else if (key.startsWith("xmlns:")) node.namespaces[key.slice(6)] = value;
    }
    const prefix = node.name.includes(":") ? node.name.split(":")[0]! : "";
    if (prefix && !node.namespaces[prefix]) throw new Error("3MF_XML: undeclared namespace prefix");
    node.namespace = node.namespaces[prefix] ?? "";
    if (++count > maxElements) throw new RangeError("3MF_XML_LIMIT: too many elements");
    if (stack.length) stack[stack.length - 1]!.children.push(node);
    else { if (root) throw new Error("3MF_XML: multiple root elements"); root = node; }
    if (!selfClosing) { stack.push(node); if (stack.length > maxDepth) throw new RangeError("3MF_XML_LIMIT: nesting too deep"); }
  }
  if (stack.length || !root) throw new Error("3MF_XML: incomplete document");
  return root;
}
function child(node: XmlNode, name: string, required = false): XmlNode | undefined {
  const matches = node.children.filter((entry) => localName(entry.name) === name && entry.namespace === node.namespace);
  if (matches.length > 1 || (required && !matches.length)) throw new Error(`3MF_MODEL: expected ${required ? "one" : "at most one"} ${name} element`);
  return matches[0];
}
function children(node: XmlNode, name: string): XmlNode[] { return node.children.filter((entry) => localName(entry.name) === name && entry.namespace === node.namespace); }
function uint(value: string | undefined, label: string, positive = false): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`3MF_MODEL: ${label} must be ${positive ? "a positive" : "a non-negative"} integer`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 0x7fffffff || (positive && n === 0)) throw new Error(`3MF_MODEL: invalid ${label}`);
  return n;
}
function finite(value: string | undefined, label: string): number {
  const text = value?.trim();
  if (text === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`3MF_MODEL: ${label} must be finite`);
  return Number(text);
}
function transform(value: string | undefined): readonly number[] {
  if (value === undefined) return IDENTITY;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 12) throw new Error("3MF_MODEL: transform must contain 12 finite numbers");
  return parts.map((part) => finite(part, "transform"));
}
function color(value: string | undefined): readonly [number, number, number, number] {
  if (!value || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) throw new Error("3MF_MODEL: invalid display color");
  return [Number.parseInt(value.slice(1, 3), 16) / 255, Number.parseInt(value.slice(3, 5), 16) / 255, Number.parseInt(value.slice(5, 7), 16) / 255, value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1];
}
function packageTarget(raw: string, source = ""): string {
  let target: string;
  try { target = decodeURIComponent(raw); } catch { throw new Error("3MF_PATH: invalid percent encoding"); }
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.includes("//") || /[?#\\\0]/.test(target)) throw new Error("3MF_PATH: external or invalid target");
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("3MF_PATH: target escapes package"); parts.pop(); }
    else parts.push(part);
  }
  const path = parts.join("/");
  validateArchivePath(path);
  return path;
}
function entryByPath(entries: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const target = path.toLowerCase();
  for (const [name, data] of entries) if (name.toLowerCase() === target) return data;
  throw new Error(`3MF_MISSING_PART: ${path}`);
}
interface ColorGroup { readonly type: "color"; readonly colors: readonly (readonly [number, number, number, number])[]; }
interface TextureGroup { readonly type: "texture"; readonly textureId: number; readonly coords: readonly (readonly [number, number])[]; }
interface TextureResource { readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg"; readonly name: string; readonly tileU: string; readonly tileV: string; readonly filter: string; }
type PropertyGroup = { readonly type: "base"; readonly materials: readonly Model3MFMaterial[] } | ColorGroup | TextureGroup;

/** Parse a 3MF OPC package and create a self-contained glTF scene description. */
export async function parseModel3MF(input: Uint8Array, options: Model3MFLimits = {}): Promise<Model3MFAsset> {
  const entries = await read3MFPackageEntries(input, options);
  throwIfAborted(options.signal);
  const rels = parseXml(entryByPath(entries, "_rels/.rels"), options);
  if (localName(rels.name) !== "Relationships" || rels.namespace !== "http://schemas.openxmlformats.org/package/2006/relationships") throw new Error("3MF_RELATIONSHIPS: invalid root or namespace");
  const starts = children(rels, "Relationship").filter((rel) => rel.attributes.Type === "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel");
  if (starts.length !== 1) throw new Error("3MF_RELATIONSHIPS: expected exactly one 3D model start part");
  if ((starts[0]!.attributes.TargetMode ?? "Internal").toLowerCase() !== "internal") throw new Error("3MF_RELATIONSHIPS: external model part is forbidden");
  const modelPath = packageTarget(starts[0]!.attributes.Target ?? "");
  const typeDocument = parseXml(entryByPath(entries, "[Content_Types].xml"), options);
  if (localName(typeDocument.name) !== "Types" || typeDocument.namespace !== "http://schemas.openxmlformats.org/package/2006/content-types") throw new Error("3MF_CONTENT_TYPES: invalid root or namespace");
  const defaultTypes = new Map<string, string>(), overrides = new Map<string, string>();
  for (const entry of typeDocument.children) {
    if (entry.namespace !== typeDocument.namespace) continue;
    const kind = localName(entry.name), contentType = entry.attributes.ContentType;
    if (kind !== "Default" && kind !== "Override") continue;
    if (!contentType) throw new Error("3MF_CONTENT_TYPES: content type is required");
    if (kind === "Default") {
      const extension = entry.attributes.Extension?.toLowerCase();
      if (!extension || !/^[a-z0-9]+$/.test(extension) || defaultTypes.has(extension)) throw new Error("3MF_CONTENT_TYPES: invalid or duplicate default");
      defaultTypes.set(extension, contentType.toLowerCase());
    } else {
      const rawName = entry.attributes.PartName;
      if (!rawName?.startsWith("/")) throw new Error("3MF_CONTENT_TYPES: override requires absolute part name");
      const part = packageTarget(rawName).toLowerCase();
      if (overrides.has(part)) throw new Error("3MF_CONTENT_TYPES: duplicate override");
      overrides.set(part, contentType.toLowerCase());
    }
  }
  const contentTypeFor = (path: string): string | undefined => overrides.get(path.toLowerCase()) ?? defaultTypes.get(path.split(".").pop()?.toLowerCase() ?? "");
  if (contentTypeFor(modelPath) !== "application/vnd.ms-package.3dmanufacturing-3dmodel+xml") throw new Error("3MF_CONTENT_TYPES: model content type is missing or invalid");
  const model = parseXml(entryByPath(entries, modelPath), options);
  const core = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
  const materialsNs = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";
  if (localName(model.name) !== "model" || model.namespace !== core) throw new Error("3MF_MODEL: invalid model root or namespace");
  const diagnostics: Model3MFDiagnostic[] = [];
  const required = (model.attributes.requiredextensions ?? "").trim().split(/\s+/).filter(Boolean);
  for (const prefix of required) {
    if (model.namespaces[prefix] !== materialsNs) throw new Error(`3MF_REQUIRED_EXTENSION: unsupported ${prefix}`);
  }
  const requiredNamespaces = new Set(required.map((prefix) => model.namespaces[prefix]));
  const recommended = (model.attributes.recommendedextensions ?? "").trim().split(/\s+/).filter(Boolean);
  for (const prefix of recommended) if (model.namespaces[prefix] !== materialsNs) diagnostics.push({ code: "3MF_RECOMMENDED_EXTENSION_UNSUPPORTED", message: `Recommended extension ${prefix} is unsupported.` });
  const recognizedMaterialNodes = new Set(["colorgroup", "color", "texture2d", "texture2dgroup", "tex2coord"]);
  const unsupported = new Set<string>();
  const pending = [model];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.namespace && node.namespace !== core && !(node.namespace === materialsNs && recognizedMaterialNodes.has(localName(node.name)))) {
      if (requiredNamespaces.has(node.namespace)) throw new Error(`3MF_REQUIRED_EXTENSION: unsupported ${node.name}`);
      if (!unsupported.has(node.name)) { diagnostics.push({ code: "3MF_EXTENSION_UNSUPPORTED", message: `Element ${node.name} is unsupported.` }); unsupported.add(node.name); }
    }
    for (const nested of node.children) pending.push(nested);
  }
  const unit = model.attributes.unit ?? "millimeter";
  if (!Object.prototype.hasOwnProperty.call(UNIT_SCALE, unit)) throw new Error(`3MF_MODEL: unsupported unit ${unit}`);
  const typedUnit = unit as keyof typeof UNIT_SCALE;
  const resources = child(model, "resources", true)!;
  const buildElement = child(model, "build", true)!;
  const groups = new Map<number, PropertyGroup>();
  const baseMaterials = new Map<number, readonly Model3MFMaterial[]>();
  const textures = new Map<number, TextureResource>();
  const ids = new Set<number>();
  const objectNodes: XmlNode[] = [];
  for (const item of resources.children) {
    const kind = localName(item.name);
    const supported = (item.namespace === core && (kind === "basematerials" || kind === "object")) || (item.namespace === materialsNs && ["colorgroup", "texture2d", "texture2dgroup"].includes(kind));
    if (!supported) {
      if (requiredNamespaces.has(item.namespace)) throw new Error(`3MF_REQUIRED_EXTENSION: unsupported ${item.name}`);
      diagnostics.push({ code: "3MF_RESOURCE_UNSUPPORTED", message: `Resource ${item.name} is unsupported.` });
      continue;
    }
    const id = uint(item.attributes.id, `${kind} id`, true);
    if (ids.has(id)) throw new Error(`3MF_MODEL: duplicate resource id ${id}`);
    ids.add(id);
    if (kind === "object") { objectNodes.push(item); continue; }
    if (kind === "basematerials") {
      const values = children(item, "base").map((base): Model3MFMaterial => {
        const name = base.attributes.name;
        if (!name) throw new Error("3MF_MODEL: base material name is required");
        return { name, color: color(base.attributes.displaycolor) };
      });
      if (!values.length) throw new Error("3MF_MODEL: basematerials is empty");
      baseMaterials.set(id, values); groups.set(id, { type: "base", materials: values });
    } else if (kind === "colorgroup") {
      const values = children(item, "color").map((entry) => color(entry.attributes.color));
      if (!values.length) throw new Error("3MF_MODEL: colorgroup is empty");
      groups.set(id, { type: "color", colors: values });
    } else if (kind === "texture2dgroup") {
      const coords = children(item, "tex2coord").map((coord) => [finite(coord.attributes.u, "u"), finite(coord.attributes.v, "v")] as const);
      if (!coords.length) throw new Error("3MF_MODEL: texture2dgroup is empty");
      groups.set(id, { type: "texture", textureId: uint(item.attributes.texid, "texid", true), coords });
    } else {
      const mime = (item.attributes.contenttype ?? "").toLowerCase();
      if (mime !== "image/png" && mime !== "image/jpeg") throw new Error(`3MF_TEXTURE_UNSUPPORTED: ${mime}`);
      const path = packageTarget(item.attributes.path ?? "", modelPath);
      if (contentTypeFor(path) !== mime) throw new Error(`3MF_CONTENT_TYPES: texture content type mismatch for ${path}`);
      const tileU = item.attributes.tilestyleu ?? "wrap", tileV = item.attributes.tilestylev ?? "wrap";
      if (!["wrap", "mirror", "clamp", "none"].includes(tileU) || !["wrap", "mirror", "clamp", "none"].includes(tileV)) throw new Error("3MF_MODEL: invalid texture tile style");
      if (tileU === "none" || tileV === "none") diagnostics.push({ code: "3MF_TEXTURE_TILE_NONE_APPROXIMATED", message: "Texture tile style none is approximated by clamp." });
      const filter = item.attributes.filter;
      if (filter && !["auto", "linear", "nearest"].includes(filter)) throw new Error("3MF_MODEL: invalid texture filter");
      textures.set(id, { bytes: entryByPath(entries, path), mime, name: path, tileU, tileV, filter: filter ?? "auto" });
    }
  }
  const maxVertices = validatedLimit(options.maxVertices, DEFAULT_LIMITS.maxVertices, "maxVertices");
  const maxTriangles = validatedLimit(options.maxTriangles, DEFAULT_LIMITS.maxTriangles, "maxTriangles");
  let totalVertices = 0, totalTriangles = 0;
  const objects: Model3MFObject[] = objectNodes.map((node) => {
    const id = uint(node.attributes.id, "object id", true);
    const name = node.attributes.name ?? `object-${id}`;
    const type = node.attributes.type ?? "model";
    if (!["model", "solidsupport", "support", "other"].includes(type)) throw new Error(`3MF_MODEL: invalid object type ${type}`);
    const mesh = child(node, "mesh"), componentList = child(node, "components");
    if (Boolean(mesh) === Boolean(componentList)) throw new Error(`3MF_MODEL: object ${id} must have exactly one mesh or components`);
    const defaultPid = node.attributes.pid === undefined ? undefined : uint(node.attributes.pid, "pid", true);
    const defaultIndex = node.attributes.pindex === undefined ? 0 : uint(node.attributes.pindex, "pindex");
    if (node.attributes.pindex !== undefined && defaultPid === undefined) throw new Error("3MF_MODEL: pindex requires pid");
    if (componentList && (defaultPid !== undefined || node.attributes.pindex !== undefined)) throw new Error("3MF_MODEL: components cannot define properties");
    let vertices: Array<readonly [number, number, number]> = [], triangles: Model3MFTriangle[] = [], components: Model3MFComponent[] = [];
    if (mesh) {
      const vertexList = child(mesh, "vertices", true)!, triangleList = child(mesh, "triangles", true)!;
      const vertexNodes = children(vertexList, "vertex");
      totalVertices += vertexNodes.length;
      if (!vertexNodes.length || totalVertices > maxVertices) throw new RangeError("3MF_MODEL_LIMIT: empty or excessive vertices");
      vertices = vertexNodes.map((entry) => [finite(entry.attributes.x, "vertex x"), finite(entry.attributes.y, "vertex y"), finite(entry.attributes.z, "vertex z")] as const);
      const triangleNodes = children(triangleList, "triangle");
      totalTriangles += triangleNodes.length;
      if (!triangleNodes.length || totalTriangles > maxTriangles) throw new RangeError("3MF_MODEL_LIMIT: empty or excessive triangles");
      triangles = triangleNodes.map((entry): Model3MFTriangle => {
        const indices = [uint(entry.attributes.v1, "v1"), uint(entry.attributes.v2, "v2"), uint(entry.attributes.v3, "v3")] as const;
        if (indices.some((index) => index >= vertices.length)) throw new Error("3MF_MODEL: triangle vertex index out of range");
        if (new Set(indices).size !== 3) throw new Error("3MF_MODEL: triangle vertex indices must be distinct");
        const propertyId = entry.attributes.pid === undefined ? defaultPid : uint(entry.attributes.pid, "pid", true);
        const p1 = entry.attributes.p1 === undefined ? defaultIndex : uint(entry.attributes.p1, "p1");
        const parsedP2 = entry.attributes.p2 === undefined ? undefined : uint(entry.attributes.p2, "p2");
        const parsedP3 = entry.attributes.p3 === undefined ? undefined : uint(entry.attributes.p3, "p3");
        const hasBoth = parsedP2 !== undefined && parsedP3 !== undefined;
        const p2 = hasBoth ? parsedP2 : p1;
        const p3 = hasBoth ? parsedP3 : p1;
        if (propertyId === undefined && (entry.attributes.p1 !== undefined || entry.attributes.p2 !== undefined || entry.attributes.p3 !== undefined)) throw new Error("3MF_MODEL: triangle properties require pid");
        if (propertyId !== undefined) {
          const group = groups.get(propertyId);
          if (!group) throw new Error(`3MF_PROPERTY_UNSUPPORTED: missing or unsupported property resource ${propertyId}`);
          const length = group.type === "base" ? group.materials.length : group.type === "color" ? group.colors.length : group.coords.length;
          if ([p1, p2, p3].some((value) => value >= length)) throw new Error("3MF_MODEL: property index out of range");
          if (group.type === "base" && (p1 !== p2 || p1 !== p3)) throw new Error("3MF_MODEL: base material gradients are invalid");
        }
        return { vertices: indices, ...(propertyId !== undefined ? { propertyId } : {}), properties: [p1, p2, p3] };
      });
    } else {
      components = children(componentList!, "component").map((entry) => ({ objectId: uint(entry.attributes.objectid, "component objectid", true), transform: transform(entry.attributes.transform) }));
      if (!components.length) throw new Error("3MF_MODEL: empty components");
    }
    return { id, name, type, vertices, triangles, components };
  });
  const build = children(buildElement, "item").map((entry) => ({ objectId: uint(entry.attributes.objectid, "build objectid", true), transform: transform(entry.attributes.transform) }));
  if (!build.length) throw new Error("3MF_MODEL: empty build");
  const maxInstances = validatedLimit(options.maxInstances, DEFAULT_LIMITS.maxInstances, "maxInstances");
  // A triangle expands to three position/normal/color tuples and may also be
  // instanced repeatedly. Bound generated geometry, not just source geometry.
  const maxGeneratedTriangles = Math.min(maxTriangles, Math.floor(archiveLimits(options).maxExpandedBytes / 144));
  throwIfAborted(options.signal);
  const gltf = buildGltf(objects, build, groups, textures, UNIT_SCALE[typedUnit], maxInstances, maxGeneratedTriangles);
  throwIfAborted(options.signal);
  return { unit: typedUnit, metersPerUnit: UNIT_SCALE[typedUnit], modelPath, objects, build, baseMaterials, diagnostics, gltf };
}

type Matrix = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
function matrix3mf(m: readonly number[]): Matrix { return [m[0]!, m[1]!, m[2]!, 0, m[3]!, m[4]!, m[5]!, 0, m[6]!, m[7]!, m[8]!, 0, m[9]!, m[10]!, m[11]!, 1]; }
function matrixMultiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let n = 0; n < 4; n++) out[col * 4 + row] = out[col * 4 + row]! + a[n * 4 + row]! * b[col * 4 + n]!;
  return out as unknown as Matrix;
}
function point(m: Matrix, v: readonly number[]): readonly [number, number, number] {
  return [m[0] * v[0]! + m[4] * v[1]! + m[8] * v[2]! + m[12], m[1] * v[0]! + m[5] * v[1]! + m[9] * v[2]! + m[13], m[2] * v[0]! + m[6] * v[1]! + m[10] * v[2]! + m[14]];
}
function determinant(m: Matrix): number { return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]); }
function srgbToLinear(c: number): number { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function linearColor(c: readonly number[]): number[] { return [srgbToLinear(c[0]!), srgbToLinear(c[1]!), srgbToLinear(c[2]!), c[3]!]; }
function normal(a: readonly number[], b: readonly number[], c: readonly number[]): readonly [number, number, number] {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  const n = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
  const length = Math.hypot(...n);
  return length ? [n[0]! / length, n[1]! / length, n[2]! / length] : [0, 0, 1];
}
function base64(bytes: Uint8Array): string {
  // Chunking avoids exceeding argument limits for real geometry and textures.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function buildGltf(objects: readonly Model3MFObject[], build: readonly Model3MFComponent[], groups: ReadonlyMap<number, PropertyGroup>, textureResources: ReadonlyMap<number, TextureResource>, scale: number, maxInstances: number, maxExpandedTriangles: number): Readonly<Record<string, unknown>> {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const buffers: Uint8Array[] = [], views: object[] = [], accessors: object[] = [];
  const materials: object[] = [], materialKeys = new Map<string, number>();
  const images: object[] = [], textures: object[] = [], samplers: object[] = [], textureKeys = new Map<number, number>();
  const meshes: object[] = [], nodes: Array<{ name: string; children?: number[]; mesh?: number; extras?: object }> = [];
  let bytesLength = 0, instances = 0, triangleCount = 0;
  const append = (values: readonly number[], components: number, min?: number[], max?: number[]): number => {
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    values.forEach((value, index) => {
      if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new RangeError("3MF_MODEL_LIMIT: transformed value exceeds float32 range");
      view.setFloat32(index * 4, value, true);
    });
    const index = views.length; views.push({ buffer: 0, byteOffset: bytesLength, byteLength: bytes.length });
    buffers.push(bytes); bytesLength += bytes.length;
    const accessor = accessors.length;
    accessors.push({ bufferView: index, componentType: 5126, count: values.length / components, type: components === 2 ? "VEC2" : components === 3 ? "VEC3" : "VEC4", ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return accessor;
  };
  const appendIndices = (count: number): number => {
    const bytes = new Uint8Array(count * 4), data = new DataView(bytes.buffer);
    for (let i = 0; i < count; i++) data.setUint32(i * 4, i, true);
    const view = views.length; views.push({ buffer: 0, byteOffset: bytesLength, byteLength: bytes.length });
    buffers.push(bytes); bytesLength += bytes.length;
    const accessor = accessors.length;
    accessors.push({ bufferView: view, componentType: 5125, count, type: "SCALAR" });
    return accessor;
  };
  const materialFor = (group: PropertyGroup | undefined, p1: number): number => {
    const textureId = group?.type === "texture" ? group.textureId : undefined;
    const key = group?.type === "base" ? `base:${group.materials[p1]!.name}:${group.materials[p1]!.color.join(",")}` : textureId !== undefined ? `texture:${textureId}` : group?.type === "color" ? "color" : "default";
    const previous = materialKeys.get(key); if (previous !== undefined) return previous;
    let tex: number | undefined;
    if (textureId !== undefined) {
      const resource = textureResources.get(textureId); if (!resource) throw new Error(`3MF_MODEL: missing texture ${textureId}`);
      tex = textureKeys.get(textureId);
      if (tex === undefined) {
        const image = images.length; images.push({ name: resource.name, uri: `data:${resource.mime};base64,${base64(resource.bytes)}` });
        const wrap = (style: string) => style === "wrap" ? 10497 : style === "mirror" ? 33648 : 33071;
        const sampler = samplers.length; samplers.push({ wrapS: wrap(resource.tileU), wrapT: wrap(resource.tileV), ...(resource.filter === "auto" ? {} : { minFilter: resource.filter === "nearest" ? 9728 : 9729, magFilter: resource.filter === "nearest" ? 9728 : 9729 }) });
        tex = textures.length; textures.push({ source: image, sampler }); textureKeys.set(textureId, tex);
      }
    }
    const base = group?.type === "base" ? group.materials[p1]! : undefined;
    const factor = base ? linearColor(base.color) : [1, 1, 1, 1];
    const index = materials.length;
    materials.push({ name: base?.name || `3MF ${key}`, pbrMetallicRoughness: { baseColorFactor: factor, metallicFactor: 0, roughnessFactor: 1, ...(tex !== undefined ? { baseColorTexture: { index: tex } } : {}) }, alphaMode: (base && base.color[3] < 1) || group?.type === "color" ? "BLEND" : "OPAQUE", doubleSided: false });
    materialKeys.set(key, index);
    return index;
  };
  const createMesh = (object: Model3MFObject, world: Matrix): number => {
    const batches = new Map<string, { material: number; positions: number[]; normals: number[]; colors: number[]; uvs: number[] }>();
    const reverse = determinant(world) < 0;
    triangleCount += object.triangles.length;
    if (triangleCount > maxExpandedTriangles) throw new RangeError("3MF_MODEL_LIMIT: expanded triangles exceed limit");
    for (const triangle of object.triangles) {
      const group = triangle.propertyId === undefined ? undefined : groups.get(triangle.propertyId);
      const material = materialFor(group, triangle.properties[0]);
      const key = `${material}:${group?.type ?? "none"}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material, positions: [], normals: [], colors: [], uvs: [] }; batches.set(key, batch); }
      const order = reverse ? [0, 2, 1] : [0, 1, 2];
      const positions = order.map((i) => point(world, object.vertices[triangle.vertices[i]!]!));
      const n = normal(positions[0]!, positions[1]!, positions[2]!);
      for (let corner = 0; corner < 3; corner++) {
        batch.positions.push(...positions[corner]!); batch.normals.push(...n);
        const property = triangle.properties[order[corner]!]!;
        if (group?.type === "color") batch.colors.push(...linearColor(group.colors[property]!));
        if (group?.type === "texture") { const uv = group.coords[property]!; batch.uvs.push(uv[0], 1 - uv[1]); }
      }
    }
    const primitives = [...batches.values()].map((batch) => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < batch.positions.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis]!, batch.positions[i]!); max[axis] = Math.max(max[axis]!, batch.positions[i]!); }
      const attributes: Record<string, number> = { POSITION: append(batch.positions, 3, min, max), NORMAL: append(batch.normals, 3) };
      if (batch.colors.length) attributes.COLOR_0 = append(batch.colors, 4);
      if (batch.uvs.length) attributes.TEXCOORD_0 = append(batch.uvs, 2);
      return { attributes, indices: appendIndices(batch.positions.length / 3), material: batch.material, mode: 4 };
    });
    const index = meshes.length; meshes.push({ name: object.name, primitives }); return index;
  };
  const addInstance = (instance: Model3MFComponent, parent: Matrix, ancestors: ReadonlySet<number>): number => {
    if (++instances > maxInstances) throw new RangeError("3MF_MODEL_LIMIT: too many component instances");
    if (ancestors.has(instance.objectId)) throw new Error("3MF_MODEL: component cycle");
    if (ancestors.size >= DEFAULT_LIMITS.maxXmlDepth) throw new RangeError("3MF_MODEL_LIMIT: component nesting too deep");
    const object = objectsById.get(instance.objectId);
    if (!object) throw new Error(`3MF_MODEL: missing object ${instance.objectId}`);
    const world = matrixMultiply(parent, matrix3mf(instance.transform));
    const det = determinant(world);
    const axisProduct = Math.hypot(world[0], world[1], world[2]) * Math.hypot(world[4], world[5], world[6]) * Math.hypot(world[8], world[9], world[10]);
    if (!Number.isFinite(det) || !Number.isFinite(axisProduct) || axisProduct === 0 || Math.abs(det) / axisProduct < 1e-12) throw new Error("3MF_MODEL: singular or non-finite transform");
    const index = nodes.length;
    const node: typeof nodes[number] = { name: object.name, extras: { objectId: object.id, type: object.type, sourceTransform: [...instance.transform] } };
    nodes.push(node);
    if (object.triangles.length) node.mesh = createMesh(object, world);
    else {
      const next = new Set(ancestors); next.add(object.id);
      node.children = object.components.map((entry) => addInstance(entry, world, next));
    }
    return index;
  };
  // Source coordinates are Z-up. This converts to Y-up and meters, preserving handedness.
  const convert: Matrix = [scale, 0, 0, 0, 0, 0, -scale, 0, 0, scale, 0, 0, 0, 0, 0, 1];
  const rootNodes = build.map((entry) => addInstance(entry, convert, new Set()));
  const bytes = new Uint8Array(bytesLength); let offset = 0;
  for (const chunk of buffers) { bytes.set(chunk, offset); offset += chunk.length; }
  return {
    asset: { version: "2.0", generator: "Aura3D Model3MFLoader" },
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${base64(bytes)}` }],
    bufferViews: views, accessors, materials, images, textures, samplers, meshes, nodes,
    scenes: [{ name: "3MF build", nodes: rootNodes }], scene: 0
  };
}

export interface LoadedModel3MFAsset extends GLTFAsset {
  readonly model3mf: Model3MFAsset;
}

/** Opt-in transport/runtime adapter for real 3MF packages. */
export class Model3MFLoader implements AssetLoader<LoadedModel3MFAsset> {
  readonly type = "3mf";
  private readonly innerAssets = new WeakMap<LoadedModel3MFAsset, GLTFAsset>();
  constructor(private readonly limits: Model3MFLimits = {}, private readonly gltfLoader = new GLTFLoader()) {}

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === this.type || /\.3mf(?:[?#]|$)/i.test(request.url) || request.url.startsWith("data:model/3mf");
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<LoadedModel3MFAsset> {
    const signal = new LoadContext({ signal: context.signalFor(request.signal) }).signalFor(this.limits.signal);
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxArchiveBytes = archiveLimits(this.limits).maxArchiveBytes;
    if (policy.maxBytes !== undefined && (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 0)) throw new RangeError("Asset maxBytes must be a non-negative safe integer");
    const bytes = await fetchBytes(request.url, signal, (progress) => request.onProgress?.({ url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {}) }), {
      ...policy, maxBytes: Math.min(policy.maxBytes ?? maxArchiveBytes, maxArchiveBytes)
    });
    context.throwIfAborted(request.url);
    if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    const parsed = await parseModel3MF(new Uint8Array(bytes), { ...this.limits, signal });
    if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    // The embedded glTF was generated from already-verified package bytes. It
    // must not inherit the original document's digest as a dependency digest.
    const internalUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(parsed.gltf))}`;
    const inner = await this.gltfLoader.load({ url: internalUrl, type: "gltf", signal }, new LoadContext({ signal }));
    if (signal?.aborted) { this.gltfLoader.dispose(inner); throw signal.reason ?? new DOMException("Asset load aborted", "AbortError"); }
    const loaderDiagnostics = {
      ...inner.loaderDiagnostics,
      features: [...new Set([...inner.loaderDiagnostics.features, "3mf", "3mf-native-import"])].sort(),
      unsupportedFeatures: [...inner.loaderDiagnostics.unsupportedFeatures, ...parsed.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)]
    };
    const result: LoadedModel3MFAsset = {
      url: request.url, model3mf: parsed,
      get disposed() { return inner.disposed; },
      loaderDiagnostics,
      images: inner.images, textures: inner.textures, materials: inner.materials, materialVariants: inner.materialVariants,
      scenes: inner.scenes, defaultScene: inner.defaultScene, meshes: inner.meshes, cameras: inner.cameras, lights: inner.lights,
      skins: inner.skins, animations: inner.animations,
      createScene: (options) => inner.createScene(options),
      toJSON: () => ({ ...inner.toJSON(), url: request.url, loaderDiagnostics })
    };
    this.innerAssets.set(result, inner);
    try {
      request.onProgress?.({ url: request.url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
    } catch (error) {
      this.innerAssets.delete(result);
      this.gltfLoader.dispose(inner);
      throw error;
    }
    return result;
  }

  dispose(asset: LoadedModel3MFAsset): void { this.gltfLoader.dispose(this.innerAssets.get(asset) ?? asset); }
}
