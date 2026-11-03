/* Format references used for this independent implementation:
 * ISO/ASTM 52915 (AMF): https://www.iso.org/standard/74640.html
 * Autodesk 3D Studio format, revision 0.91: https://paulbourke.net/dataformats/3ds/
 * ISO/IEC 14772-1 (VRML97): https://www.web3d.org/documents/specifications/14772/V2.0/part1/nodesRef.html
 * LDraw file and MPD: https://www.ldraw.org/article/218.html and https://www.ldraw.org/article/47.html
 * Google KML/KMZ models: https://developers.google.com/kml/documentation/models
 */
import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";
import { ColladaLoader } from "./ColladaLoader";
import { read3MFPackageEntries, type Model3MFArchiveLimits } from "./Model3MFLoader";

/** These importers are explicitly registered. Limits include generated data and
 * referenced documents, not just the root file. No external library is fetched. */
export interface LegacySceneOptions extends Model3MFArchiveLimits {
  readonly maxFileBytes?: number;
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxDependencies?: number;
  readonly maxDependencyBytes?: number;
}
export interface LegacySceneImport {
  readonly format: "amf" | "3ds" | "vrml" | "ldraw";
  readonly gltf: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly string[];
  readonly dependencies: readonly string[];
}
export interface LoadedLegacySceneAsset extends GLTFAsset {
  readonly legacyScene: { readonly format: string; readonly diagnostics: readonly string[]; readonly dependencies: readonly string[] };
}

const DEFAULTS = { maxFileBytes: 32 * 1024 * 1024, maxVertices: 250_000, maxTriangles: 250_000,
  maxNodes: 20_000, maxDepth: 64, maxDependencies: 128, maxDependencyBytes: 32 * 1024 * 1024 };
function limits(options: LegacySceneOptions) {
  const out = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, options[key as keyof typeof DEFAULTS] ?? DEFAULTS[key as keyof typeof DEFAULTS]])) };
  for (const [key, value] of Object.entries(out)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULTS[key as keyof typeof DEFAULTS]) throw new RangeError(`LEGACY_LIMIT: ${key} exceeds the supported bound`);
  }
  return out;
}
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw signal.reason ?? new DOMException("Legacy asset import aborted", "AbortError"); }
function inputBytes(input: string | ArrayBuffer | Uint8Array, max: number): Uint8Array {
  if (typeof input === "string" && input.length > max) throw new RangeError("LEGACY_FILE_LIMIT: document too large");
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > max) throw new RangeError("LEGACY_FILE_LIMIT: document too large");
  return bytes;
}
function utf8(bytes: Uint8Array): string { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); } catch { throw new Error("LEGACY_UTF8: invalid UTF-8"); } }
function num(value: string | number | undefined, label: string): number {
  if (value === undefined || value === "" || !Number.isFinite(Number(value)) || !Number.isFinite(Math.fround(Number(value)))) throw new Error(`LEGACY_NUMBER: invalid ${label}`);
  return Number(value);
}
function uint(value: string | number | undefined, label: string): number {
  const n = num(value, label); if (!Number.isSafeInteger(n) || n < 0) throw new Error(`LEGACY_INDEX: invalid ${label}`); return n;
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }
function xmlDecode(text: string): string {
  return text.replace(/&([^;]*);|&/g, (_match, entity: string | undefined) => {
    const known: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity && Object.hasOwn(known, entity)) return known[entity]!;
    if (entity && /^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
    }
    throw new Error("LEGACY_XML: invalid or undeclared entity");
  });
}
function xml(input: string, options: LegacySceneOptions): XmlNode {
  const bound = limits(options); const stack: XmlNode[] = []; let root: XmlNode | undefined, pos = 0, count = 0;
  while (pos < input.length) {
    checkAbort(options.signal);
    const next = input.indexOf("<", pos); const end = next < 0 ? input.length : next;
    const text = input.slice(pos, end);
    if (stack.length) stack[stack.length - 1]!.text += xmlDecode(text); else if (text.trim()) throw new Error("LEGACY_XML: text outside root");
    pos = end; if (pos === input.length) break;
    if (input.startsWith("<!--", pos)) { const close = input.indexOf("-->", pos + 4); if (close < 0) throw new Error("LEGACY_XML: unterminated comment"); pos = close + 3; continue; }
    if (input.startsWith("<?", pos)) { const close = input.indexOf("?>", pos + 2); if (close < 0) throw new Error("LEGACY_XML: unterminated instruction"); pos = close + 2; continue; }
    if (input.startsWith("<!", pos)) throw new Error("LEGACY_XML: DTD, entities and declarations are unsupported");
    pos++; const closing = input[pos] === "/"; if (closing) pos++;
    const match = /^[A-Za-z_][\w.:-]*/.exec(input.slice(pos)); if (!match) throw new Error("LEGACY_XML: invalid element");
    const name = match[0]; pos += name.length;
    if (closing) {
      while (/\s/.test(input[pos] ?? "")) pos++;
      if (input[pos++] !== ">" || stack.pop()?.name !== name) throw new Error("LEGACY_XML: mismatched closing tag");
      continue;
    }
    const node: XmlNode = { name, attrs: Object.create(null) as Record<string, string>, children: [], text: "" };
    let closed = false, ended = false, attributeCount = 0;
    while (pos < input.length) {
      const before = pos; while (/\s/.test(input[pos] ?? "")) pos++;
      if (input.startsWith("/>", pos)) { pos += 2; closed = true; ended = true; break; }
      if (input[pos] === ">") { pos++; ended = true; break; }
      if (before === pos) throw new Error("LEGACY_XML: missing attribute whitespace");
      if (++attributeCount > 128) throw new RangeError("LEGACY_XML_LIMIT: too many attributes");
      const attribute = /^[A-Za-z_][\w.:-]*/.exec(input.slice(pos))?.[0];
      if (!attribute || Object.hasOwn(node.attrs, attribute)) throw new Error("LEGACY_XML: invalid or duplicate attribute");
      pos += attribute.length; while (/\s/.test(input[pos] ?? "")) pos++;
      if (input[pos++] !== "=") throw new Error("LEGACY_XML: missing attribute equals");
      while (/\s/.test(input[pos] ?? "")) pos++; const quote = input[pos++];
      if (quote !== '"' && quote !== "'") throw new Error("LEGACY_XML: unquoted attribute");
      const close = input.indexOf(quote, pos); if (close < 0 || input.slice(pos, close).includes("<")) throw new Error("LEGACY_XML: invalid attribute");
      node.attrs[attribute] = xmlDecode(input.slice(pos, close)); pos = close + 1;
    }
    if (!ended) throw new Error("LEGACY_XML: unfinished tag");
    if (++count > bound.maxNodes * 32) throw new RangeError("LEGACY_XML_LIMIT: too many elements");
    if (stack.length) stack[stack.length - 1]!.children.push(node); else if (root) throw new Error("LEGACY_XML: multiple roots"); else root = node;
    if (!closed) { stack.push(node); if (stack.length > bound.maxDepth) throw new RangeError("LEGACY_XML_LIMIT: nesting too deep"); }
  }
  if (!root || stack.length) throw new Error("LEGACY_XML: incomplete document");
  return root;
}
function local(node: XmlNode): string { return node.name.slice(node.name.lastIndexOf(":") + 1); }
function children(node: XmlNode | undefined, name: string): XmlNode[] { return node?.children.filter((child) => local(child) === name) ?? []; }
function child(node: XmlNode | undefined, name: string): XmlNode | undefined { return children(node, name)[0]; }
function required(node: XmlNode | undefined, name: string): XmlNode { const result = child(node, name); if (!result) throw new Error(`LEGACY_XML: missing ${name}`); return result; }
function value(node: XmlNode | undefined, name: string): string { return required(node, name).text.trim(); }
function all(node: XmlNode, name: string): XmlNode[] { const out: XmlNode[] = [], pending = [node]; while (pending.length) { const next = pending.pop()!; if (local(next) === name) out.push(next); for(const entry of next.children) pending.push(entry); } return out; }

interface Mesh { name: string; positions: number[]; indices: number[]; texcoords?: number[]; material?: number }
interface SceneNode { name?: string; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }
interface Material { name?: string; color: number[]; doubleSided?: boolean }
class SceneBuilder {
  meshes: Mesh[] = []; nodes: SceneNode[] = []; roots: number[] = []; materials: Material[] = []; diagnostics = new Set<string>(); dependencies = new Set<string>();
  vertices = 0; triangles = 0; readonly bounds: ReturnType<typeof limits>;
  constructor(readonly format: LegacySceneImport["format"], readonly options: LegacySceneOptions) { this.bounds = limits(options); }
  addMesh(mesh: Mesh): number {
    this.vertices += mesh.positions.length / 3; this.triangles += mesh.indices.length / 3;
    if (this.vertices > this.bounds.maxVertices || this.triangles > this.bounds.maxTriangles) throw new RangeError("LEGACY_GEOMETRY_LIMIT: too many vertices or triangles");
    if (!mesh.positions.length || mesh.positions.length % 3 || !mesh.indices.length || mesh.indices.length % 3 || mesh.positions.some((n) => !Number.isFinite(n) || !Number.isFinite(Math.fround(n))) || mesh.indices.some((n) => !Number.isInteger(n) || n < 0 || n >= mesh.positions.length / 3)) throw new Error("LEGACY_GEOMETRY: invalid mesh");
    this.meshes.push(mesh); return this.meshes.length - 1;
  }
  addNode(node: SceneNode, root = true): number { if (this.nodes.length >= this.bounds.maxNodes) throw new RangeError("LEGACY_NODE_LIMIT: too many nodes"); this.nodes.push(node); const index = this.nodes.length - 1; if (root) this.roots.push(index); return index; }
  result(): LegacySceneImport {
    if (!this.meshes.length) throw new Error(`${this.format.toUpperCase()}_GEOMETRY: no supported triangles`);
    const bytes: number[] = [], views: object[] = [], accessors: object[] = [];
    const append = (data: number[], kind: "VEC3" | "VEC2" | "SCALAR", integer = false): number => {
      while (bytes.length % 4) bytes.push(0);
      const array = new ArrayBuffer(data.length * 4), view = new DataView(array);
      data.forEach((n, i) => integer ? view.setUint32(i * 4, n, true) : view.setFloat32(i * 4, n, true));
      const index = views.length; views.push({ buffer: 0, byteOffset: bytes.length, byteLength: array.byteLength }); for (const byte of new Uint8Array(array)) bytes.push(byte);
      const width = kind === "VEC3" ? 3 : kind === "VEC2" ? 2 : 1;
      const extrema = kind === "VEC3" && !integer ? { min: [0,1,2].map((a) => data.reduce((m, n, i) => i % 3 === a ? Math.min(m, n) : m, Infinity)), max: [0,1,2].map((a) => data.reduce((m, n, i) => i % 3 === a ? Math.max(m, n) : m, -Infinity)) } : {};
      accessors.push({ bufferView: index, componentType: integer ? 5125 : 5126, count: data.length / width, type: kind, ...extrema }); return accessors.length - 1;
    };
    const meshes = this.meshes.map((mesh) => {
      const attributes: Record<string, number> = { POSITION: append(mesh.positions, "VEC3") };
      if (mesh.texcoords) attributes.TEXCOORD_0 = append(mesh.texcoords, "VEC2");
      return { name: mesh.name, primitives: [{ attributes, indices: append(mesh.indices, "SCALAR", true), ...(mesh.material === undefined ? {} : { material: mesh.material }) }] };
    });
    const data = Uint8Array.from(bytes);
    return { format: this.format, diagnostics: [...this.diagnostics], dependencies: [...this.dependencies], gltf: {
      asset: { version: "2.0", generator: "Aura3D legacy import" }, buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${base64(data)}` }],
      bufferViews: views, accessors, meshes, nodes: this.nodes, scenes: [{ nodes: this.roots }], scene: 0,
      materials: this.materials.map((m) => ({ name: m.name, doubleSided: m.doubleSided ?? false, pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: 0, roughnessFactor: 1 }, ...(m.color[3]! < 1 ? { alphaMode: "BLEND" } : {}) }))
    } };
  }
}

/** ISO/ASTM 52915: plain XML or a ZIP containing one AMF document. Mesh
 * coordinates are converted from the declared unit and Z-up into metres/Y-up.
 * Curved triangles, constellations and texture/vertex colours are not guessed. */
export async function parseAMF(input: string | ArrayBuffer | Uint8Array, options: LegacySceneOptions = {}): Promise<LegacySceneImport> {
  const bound = limits(options); checkAbort(options.signal); let bytes = inputBytes(input, bound.maxFileBytes);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = await read3MFPackageEntries(bytes, { ...options, maxArchiveBytes: Math.min(options.maxArchiveBytes ?? bound.maxFileBytes, bound.maxFileBytes), maxEntryBytes: Math.min(options.maxEntryBytes ?? bound.maxFileBytes, bound.maxFileBytes), maxExpandedBytes: Math.min(options.maxExpandedBytes ?? bound.maxDependencyBytes, bound.maxDependencyBytes), maxEntries: Math.min(options.maxEntries ?? 2048, 2048), maxCompressionRatio: Math.min(options.maxCompressionRatio ?? 1000, 1000) });
    const candidates = [...entries].filter(([name]) => /\.amf$/i.test(name));
    if (candidates.length !== 1) throw new Error("AMF_ARCHIVE: expected exactly one AMF document");
    bytes = candidates[0]![1];
    if (bytes.length > bound.maxFileBytes) throw new RangeError("AMF_FILE_LIMIT: document too large");
  }
  const root = xml(utf8(bytes), options); if (local(root) !== "amf") throw new Error("AMF_HEADER: expected amf root");
  if (root.attrs.version && !/^1(?:\.[012])?$/.test(root.attrs.version)) throw new Error("AMF_UNSUPPORTED_VERSION: unsupported format version");
  const units: Record<string, number> = { millimeter: .001, meter: 1, micron: .000001, inch: .0254, feet: .3048 };
  const unit = root.attrs.unit ?? "millimeter"; const scale = units[unit]; if (!scale) throw new Error(`AMF_UNSUPPORTED_UNIT: ${unit}`);
  if (children(root, "constellation").length) throw new Error("AMF_UNSUPPORTED_CONSTELLATION: instance placement is not yet represented");
  const scene = new SceneBuilder("amf", options);
  if (all(root, "metadata").length) scene.diagnostics.add("AMF_UNSUPPORTED_METADATA");
  if (children(root, "texture").length) scene.diagnostics.add("AMF_UNSUPPORTED_TEXTURE");
  const materialMap = new Map<string, number>();
  const colorOf = (element: XmlNode | undefined): number[] | undefined => {
    const color = child(element, "color"); if (!color) return undefined;
    const rgba = ["r", "g", "b"].map((x) => num(value(color, x), x)); rgba.push(child(color, "a") ? num(value(color, "a"), "alpha") : 1);
    if (rgba.some((n) => n < 0 || n > 1)) throw new RangeError("AMF_COLOR: components outside [0,1]"); return rgba;
  };
  for (const material of children(root, "material")) {
    const id = material.attrs.id; if (!id || materialMap.has(id)) throw new Error("AMF_MATERIAL: missing or duplicate id");
    if (children(material, "composite").length) scene.diagnostics.add("AMF_UNSUPPORTED_COMPOSITE_MATERIAL");
    materialMap.set(id, scene.materials.length); scene.materials.push({ name: id, color: colorOf(material) ?? [1,1,1,1] });
  }
  const ids = new Set<string>();
  for (const object of children(root, "object")) {
    checkAbort(options.signal); const id = object.attrs.id; if (!id || ids.has(id)) throw new Error("AMF_OBJECT: missing or duplicate id"); ids.add(id);
    const mesh = required(object, "mesh"), vertices = children(required(mesh, "vertices"), "vertex");
    if (vertices.length > bound.maxVertices) throw new RangeError("AMF_GEOMETRY_LIMIT: too many vertices");
    const positions: number[] = [];
    for (const vertex of vertices) {
      const coords = required(vertex, "coordinates"), x = num(value(coords, "x"), "x"), y = num(value(coords, "y"), "y"), z = num(value(coords, "z"), "z");
      positions.push(x * scale, z * scale, y === 0 ? 0 : -y * scale);
      if (child(vertex, "normal")) scene.diagnostics.add("AMF_UNSUPPORTED_CURVED_SURFACE_NORMAL");
      if (child(vertex, "color")) scene.diagnostics.add("AMF_UNSUPPORTED_VERTEX_COLOR");
    }
    for (const [volumeIndex, volume] of children(mesh, "volume").entries()) {
      const indices: number[] = [];
      for (const tri of children(volume, "triangle")) {
        const values = ["v1","v2","v3"].map((key) => uint(value(tri, key), key));
        if (new Set(values).size !== 3 || values.some((i) => i >= vertices.length)) throw new Error("AMF_INDEX: invalid triangle");
        indices.push(...values);
        if (child(tri, "color")) scene.diagnostics.add("AMF_UNSUPPORTED_TRIANGLE_COLOR");
        if (child(tri, "texmap")) scene.diagnostics.add("AMF_UNSUPPORTED_TEXTURE");
        if (indices.length / 3 > bound.maxTriangles) throw new RangeError("AMF_GEOMETRY_LIMIT: too many triangles");
      }
      if (!indices.length) continue;
      let material = volume.attrs.materialid === undefined ? undefined : materialMap.get(volume.attrs.materialid);
      if (volume.attrs.materialid !== undefined && material === undefined) throw new Error("AMF_MATERIAL: unknown material reference");
      const color = colorOf(volume) ?? colorOf(object);
      if (color) { material = scene.materials.length; scene.materials.push({ name: `volume-${volumeIndex}`, color }); }
      const index = scene.addMesh({ name: `${id}:${volumeIndex}`, positions: [...positions], indices, material }); scene.addNode({ name: `${id}:${volumeIndex}`, mesh: index });
    }
    if (children(mesh, "edge").length) scene.diagnostics.add("AMF_UNSUPPORTED_CURVED_EDGES");
  }
  return scene.result();
}

/** Autodesk 3D Studio chunk format (revision 0.91). Geometry and UVs are
 * supported; animation, local-coordinate chunks and material maps are explicit
 * diagnostics. The file has no dependable physical unit, so 1 unit = 1 metre. */
export function parse3DS(input: ArrayBuffer | Uint8Array, options: LegacySceneOptions = {}): LegacySceneImport {
  checkAbort(options.signal); const bound = limits(options), bytes = inputBytes(input, bound.maxFileBytes), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scene = new SceneBuilder("3ds", options); scene.diagnostics.add("3DS_UNIT_ASSUMED_METERS");
  interface ObjectData { name: string; positions: number[]; faces: number[]; uv?: number[]; groups: Map<string, number[]> }
  const objects: ObjectData[] = [], materials = new Map<string, number>(); let chunkCount=0;
  const ensure = (at: number, size: number, end: number) => { if (at < 0 || size < 0 || at + size > end) throw new Error("3DS_TRUNCATED: chunk exceeds parent"); };
  const stringAt = (at: number, end: number): [string, number] => {
    let finish = at; while (finish < end && bytes[finish] !== 0) finish++;
    if (finish === end) throw new Error("3DS_TRUNCATED: missing string terminator");
    return [new TextDecoder("windows-1252").decode(bytes.subarray(at, finish)), finish + 1];
  };
  const chunks = (start: number, end: number, depth: number, fn: (id: number, begin: number, finish: number) => void): void => {
    if (depth > bound.maxDepth) throw new RangeError("3DS_DEPTH_LIMIT: nesting too deep");
    for (let at = start; at < end;) {
      checkAbort(options.signal); if(++chunkCount>bound.maxNodes*32)throw new RangeError("3DS_CHUNK_LIMIT: too many chunks"); ensure(at, 6, end); const id = view.getUint16(at, true), size = view.getUint32(at + 2, true);
      if (size < 6 || at + size > end) throw new Error("3DS_TRUNCATED: invalid chunk length");
      fn(id, at + 6, at + size); at += size;
    }
  };
  const parseMaterial = (start: number, end: number): void => {
    let name = "", color = [1,1,1,1];
    chunks(start, end, 3, (id, begin, finish) => {
      if (id === 0xa000) [name] = stringAt(begin, finish);
      else if (id === 0xa020) chunks(begin, finish, 4, (colorId, from, to) => {
        if (colorId === 0x0010 || colorId === 0x0013) { ensure(from, 12, to); color = [view.getFloat32(from,true), view.getFloat32(from+4,true), view.getFloat32(from+8,true),1]; }
        else if (colorId === 0x0011 || colorId === 0x0012) { ensure(from, 3, to); color = [bytes[from]!/255,bytes[from+1]!/255,bytes[from+2]!/255,1]; }
        else scene.diagnostics.add(`3DS_UNSUPPORTED_COLOR_CHUNK_${colorId.toString(16)}`);
      });
      else if ([0xa200,0xa210,0xa220,0xa230,0xa33a].includes(id)) scene.diagnostics.add("3DS_UNSUPPORTED_TEXTURE_MAP");
      else scene.diagnostics.add(`3DS_UNSUPPORTED_MATERIAL_CHUNK_${id.toString(16)}`);
    });
    if (!name || materials.has(name) || color.some((x) => !Number.isFinite(x) || x < 0 || x > 1)) throw new Error("3DS_MATERIAL: invalid or duplicate material");
    if(materials.size>=bound.maxNodes)throw new RangeError("3DS_MATERIAL_LIMIT: too many materials");
    materials.set(name, scene.materials.length); scene.materials.push({ name, color, doubleSided: true });
  };
  const parseObject = (start: number, end: number) => {
    const [name, after] = stringAt(start, end), object: ObjectData = { name, positions: [], faces: [], groups: new Map() }; objects.push(object);
    if (objects.length > bound.maxNodes) throw new RangeError("3DS_NODE_LIMIT: too many objects");
    let sawMesh=false;
    chunks(after, end, 3, (id, begin, finish) => {
      if (id === 0x4100) { if(sawMesh)throw new Error("3DS_DUPLICATE: repeated object mesh"); sawMesh=true; }
      if (id !== 0x4100) { scene.diagnostics.add(`3DS_UNSUPPORTED_OBJECT_CHUNK_${id.toString(16)}`); return; }
      const seen=new Set<number>();
      chunks(begin, finish, 4, (meshId, from, to) => {
        if ([0x4110,0x4120,0x4140].includes(meshId)) { if(seen.has(meshId))throw new Error("3DS_DUPLICATE: repeated geometry chunk"); seen.add(meshId); }
        if (meshId === 0x4110) {
          ensure(from, 2, to); const count = view.getUint16(from,true); ensure(from + 2, count * 12, to);
          if (count > bound.maxVertices) throw new RangeError("3DS_GEOMETRY_LIMIT: too many vertices");
          for (let i = 0; i < count; i++) { const p = from + 2 + i * 12; const y=view.getFloat32(p+4,true); object.positions.push(view.getFloat32(p,true),view.getFloat32(p+8,true),y===0?0:-y); }
        } else if (meshId === 0x4120) {
          ensure(from,2,to); const count = view.getUint16(from,true); ensure(from+2,count*8,to);
          if (count > bound.maxTriangles) throw new RangeError("3DS_GEOMETRY_LIMIT: too many faces");
          for (let i=0;i<count;i++) { const p=from+2+i*8; object.faces.push(view.getUint16(p,true),view.getUint16(p+2,true),view.getUint16(p+4,true)); }
          chunks(from+2+count*8,to,5,(sub, p, q) => {
            if (sub !== 0x4130) { scene.diagnostics.add(`3DS_UNSUPPORTED_FACE_CHUNK_${sub.toString(16)}`); return; }
            const [material, afterName] = stringAt(p,q); ensure(afterName,2,q); const n=view.getUint16(afterName,true); ensure(afterName+2,n*2,q);
            if (object.groups.has(material)) throw new Error("3DS_MATERIAL: duplicate face group");
            const faces = Array.from({length:n},(_,i)=>view.getUint16(afterName+2+i*2,true));
            if (faces.some((face)=>face>=count)) throw new Error("3DS_INDEX: material face out of range"); object.groups.set(material,faces);
          });
        } else if (meshId === 0x4140) {
          ensure(from,2,to); const count=view.getUint16(from,true); ensure(from+2,count*8,to); object.uv=[];
          for(let i=0;i<count;i++) object.uv.push(view.getFloat32(from+2+i*8,true),view.getFloat32(from+6+i*8,true));
        } else if (meshId === 0x4160) scene.diagnostics.add("3DS_UNSUPPORTED_LOCAL_COORDINATE_SYSTEM");
        else scene.diagnostics.add(`3DS_UNSUPPORTED_MESH_CHUNK_${meshId.toString(16)}`);
      });
    });
  };
  ensure(0,6,bytes.length); if (view.getUint16(0,true)!==0x4d4d || view.getUint32(2,true)!==bytes.length) throw new Error("3DS_HEADER: invalid main chunk");
  chunks(6,bytes.length,1,(id,begin,finish)=>{
    if (id===0x3d3d) chunks(begin,finish,2,(part,from,to)=>{ if(part===0x4000) parseObject(from,to); else if(part===0xafff) parseMaterial(from,to); else scene.diagnostics.add(`3DS_UNSUPPORTED_EDITOR_CHUNK_${part.toString(16)}`); });
    else if(id!==0x0002) scene.diagnostics.add(`3DS_UNSUPPORTED_MAIN_CHUNK_${id.toString(16)}`);
  });
  for (const object of objects) {
    if (object.faces.some((n)=>n>=object.positions.length/3)) throw new Error("3DS_INDEX: face vertex out of range");
    if (object.uv && (object.uv.length !== object.positions.length/3*2 || object.uv.some((n)=>!Number.isFinite(n)))) throw new Error("3DS_UV: coordinate count or value invalid");
    const assigned=new Set<number>();
    for (const [name, faces] of object.groups) {
      const material=materials.get(name); if(material===undefined) throw new Error("3DS_MATERIAL: unknown material reference");
      const indices:number[]=[]; for(const face of faces) { if(assigned.has(face)) throw new Error("3DS_MATERIAL: overlapping face groups"); assigned.add(face); indices.push(...object.faces.slice(face*3,face*3+3)); }
      if(indices.length) { const mesh=scene.addMesh({name:object.name,positions:[...object.positions],indices,texcoords:object.uv,material}); scene.addNode({name:object.name,mesh}); }
    }
    const remaining:number[]=[]; for(let i=0;i<object.faces.length/3;i++) if(!assigned.has(i)) remaining.push(...object.faces.slice(i*3,i*3+3));
    if(remaining.length) { const mesh=scene.addMesh({name:object.name,positions:object.positions,indices:remaining,texcoords:object.uv}); scene.addNode({name:object.name,mesh}); }
  }
  return scene.result();
}

interface VrNode { kind: string; fields: Record<string, VrValue> }
type VrValue = number | string | boolean | number[] | VrNode | VrNode[] | null;
/** A deliberately narrow VRML97 reader; unhandled field grammars fail closed. */
export function parseVRML(input: string | ArrayBuffer | Uint8Array, options: LegacySceneOptions = {}): LegacySceneImport {
  checkAbort(options.signal); const bound=limits(options), text=utf8(inputBytes(input,bound.maxFileBytes));
  if(!/^#VRML V2\.0 utf8(?:\r?\n|$)/.test(text)) throw new Error("VRML_HEADER: expected VRML V2.0 utf8");
  const tokens: string[]=[]; const lexer=/\s+|#[^\r\n]*|[,\[\]{}]|"(?:[^"\\]|\\.)*"|[^\s,\[\]{}#]+/gy; let at=0;
  while(at<text.length) { lexer.lastIndex=at; const match=lexer.exec(text); if(!match) throw new Error("VRML_SYNTAX: invalid token"); at=lexer.lastIndex; const token=match[0]; if(!/^\s|^#|^,$/.test(token)) tokens.push(token); if(tokens.length>bound.maxVertices*20+bound.maxNodes*40) throw new RangeError("VRML_TOKEN_LIMIT: too many tokens"); }
  const definitions=new Map<string,VrNode>(); let cursor=0, count=0;
  const peek=()=>tokens[cursor]; const take=()=>{ const x=tokens[cursor++]; if(x===undefined) throw new Error("VRML_TRUNCATED: unexpected end"); return x; };
  const expect=(s:string)=>{ if(take()!==s) throw new Error(`VRML_SYNTAX: expected ${s}`); };
  const scalar=()=>num(take(),"VRML number");
  const vector=(size:number)=>Array.from({length:size},scalar);
  const boolean=()=>{const v=take();if(v!=="TRUE"&&v!=="FALSE")throw new Error("VRML_SYNTAX: expected boolean");return v==="TRUE";};
  const list=()=>{const result:number[]=[];expect("[");while(peek()!=="]") { result.push(scalar()); if(result.length>Math.max(bound.maxVertices*3,bound.maxTriangles*4))throw new RangeError("VRML_LIST_LIMIT: too many values"); }expect("]");return result;};
  const fields:Record<string,Record<string,string>>={
    Group:{children:"nodes",bboxCenter:"v3",bboxSize:"v3"}, Transform:{children:"nodes",translation:"v3",rotation:"v4",scale:"v3",center:"v3",scaleOrientation:"v4",bboxCenter:"v3",bboxSize:"v3"},
    Shape:{appearance:"node",geometry:"node"}, Appearance:{material:"node",texture:"node",textureTransform:"node"},
    Material:{diffuseColor:"v3",emissiveColor:"v3",specularColor:"v3",ambientIntensity:"n",shininess:"n",transparency:"n"},
    IndexedFaceSet:{coord:"node",coordIndex:"list",ccw:"bool",solid:"bool",convex:"bool",creaseAngle:"n",color:"node",colorIndex:"list",colorPerVertex:"bool",normal:"node",normalIndex:"list",normalPerVertex:"bool",texCoord:"node",texCoordIndex:"list"},
    Coordinate:{point:"list"}, Normal:{vector:"list"}, Color:{color:"list"}, TextureCoordinate:{point:"list"}
  };
  const node=(depth:number):VrNode|null=>{
    if(depth>bound.maxDepth) throw new RangeError("VRML_DEPTH_LIMIT: nesting too deep"); checkAbort(options.signal);
    let name=take(), def:string|undefined;
    if(name==="NULL")return null;
    if(name==="USE") { const id=take(), found=definitions.get(id); if(!found)throw new Error(`VRML_USE: unknown or cyclic DEF ${id}`); return found; }
    if(name==="DEF") { def=take(); if(definitions.has(def))throw new Error("VRML_DEF: duplicate definition"); name=take(); }
    const grammar=fields[name]; if(!grammar)throw new Error(`VRML_UNSUPPORTED_NODE: ${name}`);
    if(++count>bound.maxNodes)throw new RangeError("VRML_NODE_LIMIT: too many nodes");
    expect("{"); const result:VrNode={kind:name,fields:{}};
    while(peek()!=="}") {
      const key=take(), type=grammar[key]; if(!type)throw new Error(`VRML_UNSUPPORTED_FIELD: ${name}.${key}`);
      if(Object.hasOwn(result.fields,key))throw new Error("VRML_SYNTAX: duplicate field");
      if(type==="node") result.fields[key]=node(depth+1);
      else if(type==="nodes") { const values:VrNode[]=[]; if(peek()==="[") { take(); while(peek()!=="]") {const n=node(depth+1);if(n)values.push(n);} expect("]"); } else { const n=node(depth+1);if(n)values.push(n); } result.fields[key]=values; }
      else if(type==="list")result.fields[key]=list(); else if(type==="bool")result.fields[key]=boolean(); else if(type==="n")result.fields[key]=scalar(); else result.fields[key]=vector(type==="v3"?3:4);
    }
    expect("}"); if(def)definitions.set(def,result); return result;
  };
  const roots:VrNode[]=[]; while(cursor<tokens.length){const n=node(0);if(n)roots.push(n);}
  const scene=new SceneBuilder("vrml",options);
  const asNode=(v:VrValue|undefined):VrNode|undefined => v && typeof v==="object" && !Array.isArray(v) ? v : undefined;
  const asNums=(v:VrValue|undefined, fallback:number[]):number[]=>Array.isArray(v) && v.every((n)=>typeof n==="number") ? v as number[] : fallback;
  const visit=(n:VrNode, depth:number):number|undefined=>{
    if(depth>bound.maxDepth)throw new RangeError("VRML_DEPTH_LIMIT: nesting too deep"); checkAbort(options.signal);
    if(n.kind==="Group"||n.kind==="Transform") {
      const center=asNums(n.fields.center,[0,0,0]), so=asNums(n.fields.scaleOrientation,[0,0,1,0]);
      if(center.some((v)=>v!==0)||so[3]!==0)throw new Error("VRML_UNSUPPORTED_TRANSFORM: center or scaleOrientation");
      const rotation=asNums(n.fields.rotation,[0,0,1,0]), len=Math.hypot(...rotation.slice(0,3));
      if(len===0 && rotation[3]!==0)throw new Error("VRML_TRANSFORM: zero rotation axis");
      const h=rotation[3]!/2, factor=len ? Math.sin(h)/len : 0;
      const out:SceneNode={name:n.kind,translation:asNums(n.fields.translation,[0,0,0]),rotation:[rotation[0]!*factor,rotation[1]!*factor,rotation[2]!*factor,Math.cos(h)],scale:asNums(n.fields.scale,[1,1,1]),children:[]};
      const index=scene.addNode(out,false);
      for(const c of (Array.isArray(n.fields.children)? n.fields.children:[]) as VrNode[]) {const childIndex=visit(c,depth+1);if(childIndex!==undefined)out.children!.push(childIndex);}
      return index;
    }
    if(n.kind!=="Shape")throw new Error(`VRML_UNSUPPORTED_ROOT: ${n.kind}`);
    const geometry=asNode(n.fields.geometry); if(!geometry || geometry.kind!=="IndexedFaceSet")throw new Error("VRML_UNSUPPORTED_GEOMETRY: expected IndexedFaceSet");
    const coord=asNode(geometry.fields.coord); if(!coord || coord.kind!=="Coordinate")throw new Error("VRML_GEOMETRY: Coordinate required");
    const positions=asNums(coord.fields.point,[]), coordIndex=asNums(geometry.fields.coordIndex,[]);
    if(positions.length%3 || positions.length/3>bound.maxVertices)throw new Error("VRML_GEOMETRY: invalid coordinate count");
    if(geometry.fields.convex===false)throw new Error("VRML_UNSUPPORTED_CONCAVE_FACE: convex FALSE");
    for(const field of ["color","normal","texCoord"])if(geometry.fields[field] || geometry.fields[`${field}Index`])scene.diagnostics.add(`VRML_UNSUPPORTED_${field.toUpperCase()}`);
    if(geometry.fields.creaseAngle && geometry.fields.creaseAngle!==0)scene.diagnostics.add("VRML_UNSUPPORTED_CREASE_ANGLE");
    const indices:number[]=[], face:number[]=[];
    const flush=()=>{if(!face.length)return;if(face.length<3)throw new Error("VRML_GEOMETRY: face has fewer than three vertices");
      for(let i=1;i+1<face.length;i++) { if(geometry.fields.ccw===false) indices.push(face[0]!,face[i+1]!,face[i]!);else indices.push(face[0]!,face[i]!,face[i+1]!); if(indices.length/3>bound.maxTriangles)throw new RangeError("VRML_GEOMETRY_LIMIT: too many faces"); } face.length=0;};
    for(const i of coordIndex) {if(i===-1)flush();else if(!Number.isSafeInteger(i)||i<0||i>=positions.length/3)throw new Error("VRML_INDEX: coordinate outside array");else face.push(i);} flush();
    let material:number|undefined; const appearance=asNode(n.fields.appearance);
    if(appearance) {
      if(appearance.kind!=="Appearance")throw new Error("VRML_APPEARANCE: expected Appearance");
      if(appearance.fields.texture || appearance.fields.textureTransform)scene.diagnostics.add("VRML_UNSUPPORTED_TEXTURE");
      const mat=asNode(appearance.fields.material);
      if(mat) {
        if(mat.kind!=="Material")throw new Error("VRML_MATERIAL: expected Material");
        const diffuse=asNums(mat.fields.diffuseColor,[.8,.8,.8]), alpha=1-(typeof mat.fields.transparency==="number"?mat.fields.transparency:0);
        if([...diffuse,alpha].some((x)=>x<0||x>1))throw new RangeError("VRML_MATERIAL: color out of range");
        if(mat.fields.emissiveColor||mat.fields.specularColor||mat.fields.shininess||mat.fields.ambientIntensity)scene.diagnostics.add("VRML_UNSUPPORTED_MATERIAL_PROPERTIES");
        material=scene.materials.length;scene.materials.push({color:[...diffuse,alpha],doubleSided:geometry.fields.solid===false});
      }
    }
    if(material===undefined && geometry.fields.solid===false){material=scene.materials.length;scene.materials.push({color:[1,1,1,1],doubleSided:true});}
    const mesh=scene.addMesh({name:"VRML shape",positions:[...positions],indices,material}); return scene.addNode({name:"Shape",mesh},false);
  };
  for(const root of roots) {const index=visit(root,0);if(index!==undefined)scene.roots.push(index);}
  return scene.result();
}

export interface LDrawImportOptions extends LegacySceneOptions {
  readonly baseUrl?: string;
  /** Caller-supplied resolver for the standalone parser. The loader uses the
   * scoped LoadContext policy and verifies external bytes before decoding. */
  readonly resolveDependency?: (name: string, containingDocument: string | undefined, signal?: AbortSignal) => Promise<{ readonly url: string; readonly text: string }>;
}
/** LDraw lines 1, 3 and 4, including MPD embedded files and nested external
 * parts. The remaining line/meta types are reported instead of invented. */
export async function parseLDraw(input: string | ArrayBuffer | Uint8Array, options: LDrawImportOptions = {}): Promise<LegacySceneImport> {
  checkAbort(options.signal); const bound=limits(options), root=utf8(inputBytes(input,bound.maxFileBytes)), scene=new SceneBuilder("ldraw",options);
  scene.diagnostics.add("LDRAW_UNIT_0_4MM_APPROXIMATION");
  scene.diagnostics.add("LDRAW_APPROXIMATE_BUILTIN_PALETTE");
  const palette:Record<string,number[]>={"0":[.051,.051,.051],"1":[0,.333,.749],"2":[.145,.478,.239],"4":[.769,.102,.035],"7":[.627,.647,.655],"14":[.969,.804,.184],"15":[.957,.957,.957]};
  const files=new Map<string,{text:string;url:string|undefined}>(), loaded=new Map<string,{text:string;url:string|undefined}>();
  let bytesTotal=0, faces=0, vertices=0, instances=0;
  const split=(source:string, url:string|undefined):{entry:string;text:string}=>{
    const lines=source.split(/\r\n|\n|\r/); let current:string|undefined, first:string|undefined, part:string[]=[]; const sections:Array<[string,string]>=[];
    const save=()=>{if(current!==undefined){if(sections.length>=bound.maxDependencies)throw new RangeError("LDRAW_DEPENDENCY_LIMIT: too many MPD sections");sections.push([current,part.join("\n")]);}};
    for(const line of lines) {
      const file=/^\s*0\s+FILE\s+(.+?)\s*$/i.exec(line);
      if(file){save();current=file[1]!.replace(/\\/g,"/").toLowerCase();first??=current;part=[];continue;}
      if(/^\s*0\s+NOFILE\s*$/i.test(line)){save();current=undefined;part=[];continue;}
      if(current!==undefined)part.push(line);
    }
    if(current!==undefined)save();
    if(!first)return {entry:"",text:source};
    for(const [name,body] of sections){if(files.has(name))throw new Error("LDRAW_MPD: duplicate embedded file");files.set(name,{text:body,url});}
    return {entry:first,text:files.get(first)!.text};
  };
  const start=split(root,options.baseUrl);
  const meshByColor=new Map<string,{positions:number[];indices:number[]}>();
  // Row-major affine matrices; points are column vectors.
  const identity=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const multiply=(a:number[],b:number[])=>Array.from({length:16},(_,i)=>{const row=Math.floor(i/4),col=i%4;return a[row*4]!*b[col]!+a[row*4+1]!*b[4+col]!+a[row*4+2]!*b[8+col]!+a[row*4+3]!*b[12+col]!;});
  const color=(raw:string,current:string)=>raw==="16"?current:raw;
  const group=(key:string)=>{let g=meshByColor.get(key);if(!g){g={positions:[],indices:[]};meshByColor.set(key,g);}return g;};
  const process=async(source:string,url:string|undefined,matrix:number[],currentColor:string,stack:Set<string>,depth:number):Promise<void>=>{
    if(depth>bound.maxDepth)throw new RangeError("LDRAW_DEPTH_LIMIT: nested references too deep");
    if(++instances>bound.maxNodes)throw new RangeError("LDRAW_NODE_LIMIT: too many expanded part instances");
    for(const line of source.split(/\r\n|\n|\r/)) {
      checkAbort(options.signal); const words=line.trim().split(/\s+/); if(!words[0])continue;
      const type=words[0];
      if(type==="0") {if(/^!(?:TEXMAP|COLOUR|DATA)$/i.test(words[1]??"") || /^(?:BFC|!:)$/i.test(words[1]??""))scene.diagnostics.add(`LDRAW_UNSUPPORTED_META_${(words[1]??"").replace(/\W/g,"").toUpperCase()}`);continue;}
      if(type==="1") {
        if(words.length<15)throw new Error("LDRAW_SYNTAX: malformed subfile reference");
        const data=words.slice(2,14).map((v)=>num(v,"subfile transform")); const rawName=words.slice(14).join(" ").replace(/\\/g,"/");
        if(!rawName || /^(?:\/|[a-z][\w+.-]*:)/i.test(rawName) || rawName.includes("%") || rawName.split("/").some((s)=>s===".."||s==="."||s===""))throw new Error("LDRAW_DEPENDENCY_PATH: invalid subfile name");
        const key=rawName.toLowerCase(); const localFile=files.get(key); let part=localFile;
        if(!part) {
          if(!options.resolveDependency)throw new Error(`LDRAW_DEPENDENCY_REQUIRED: ${rawName}`);
          const cacheKey=`${url??""}\n${key}`; part=loaded.get(cacheKey);
          if(!part) {
            if(loaded.size>=bound.maxDependencies)throw new RangeError("LDRAW_DEPENDENCY_LIMIT: too many files");
            const result=await options.resolveDependency(rawName,url,options.signal);checkAbort(options.signal);
            const encoded=inputBytes(result.text,bound.maxFileBytes);bytesTotal+=encoded.length;if(bytesTotal>bound.maxDependencyBytes)throw new RangeError("LDRAW_DEPENDENCY_LIMIT: total bytes exceeded");
            if(/^\s*0\s+FILE\s+/im.test(result.text))throw new Error("LDRAW_UNSUPPORTED_NESTED_MPD: external MPD requires explicit import");
            part={text:result.text,url:result.url};loaded.set(cacheKey,part);scene.dependencies.add(result.url);
          }
        }
        const identityKey=localFile ? `mpd:${key}` : `url:${part.url}`;
        if(stack.has(identityKey))throw new Error("LDRAW_DEPENDENCY_CYCLE: recursive part");
        const [x,y,z,a,b,c,d,e,f,g,h,i]=data; const childMatrix=[a!,b!,c!,x!, d!,e!,f!,y!, g!,h!,i!,z!, 0,0,0,1];
        const next=new Set(stack);next.add(identityKey);await process(part.text,part.url,multiply(matrix,childMatrix),color(words[1]!,currentColor),next,depth+1);
      } else if(type==="3"||type==="4") {
        const pointCount=type==="3"?3:4;if(words.length!==2+pointCount*3)throw new Error("LDRAW_SYNTAX: invalid polygon");
        const numbers=words.slice(2).map((v)=>num(v,"polygon coordinate")), out=group(color(words[1]!,currentColor));
        vertices+=pointCount;faces+=pointCount-2;if(vertices>bound.maxVertices||faces>bound.maxTriangles)throw new RangeError("LDRAW_GEOMETRY_LIMIT: expanded geometry exceeds limit");
        const offset=out.positions.length/3;
        for(let j=0;j<pointCount;j++) {const x=numbers[j*3]!,y=numbers[j*3+1]!,z=numbers[j*3+2]!;
          const px=matrix[0]!*x+matrix[1]!*y+matrix[2]!*z+matrix[3]!,py=matrix[4]!*x+matrix[5]!*y+matrix[6]!*z+matrix[7]!,pz=matrix[8]!*x+matrix[9]!*y+matrix[10]!*z+matrix[11]!;
          out.positions.push(px*.0004,-py*.0004,-pz*.0004);
        }
        out.indices.push(offset,offset+1,offset+2);if(pointCount===4)out.indices.push(offset,offset+2,offset+3);
      } else if(type==="2"||type==="5")scene.diagnostics.add("LDRAW_UNSUPPORTED_LINES");
      else scene.diagnostics.add(`LDRAW_UNSUPPORTED_LINE_TYPE_${type}`);
    }
  };
  await process(start.text,options.baseUrl,identity,"7",new Set(start.entry?[`mpd:${start.entry}`]:[]),0);
  for(const [key,mesh] of meshByColor){
    let rgb=palette[key];if(/^0x2[0-9a-f]{6}$/i.test(key)){const n=parseInt(key.slice(3),16);rgb=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
    if(!rgb){scene.diagnostics.add(`LDRAW_UNSUPPORTED_COLOR_${key}`);rgb=[.8,.8,.8];}
    const index=scene.materials.length;scene.materials.push({name:`LDraw ${key}`,color:[...rgb,1],doubleSided:true});
    const meshIndex=scene.addMesh({name:`LDraw ${key}`,positions:mesh.positions,indices:mesh.indices,material:index});scene.addNode({name:`LDraw ${key}`,mesh:meshIndex});
  }
  return scene.result();
}

function archivePath(base: string, raw: string): string {
  if (!raw || /^(?:\/|[a-z][\w+.-]*:)/i.test(raw) || raw.includes("\\") || /[?#\0]/.test(raw)) throw new Error("KMZ_DEPENDENCY_PATH: external or invalid reference");
  let decoded: string; try { decoded=decodeURIComponent(raw); } catch { throw new Error("KMZ_DEPENDENCY_PATH: invalid encoding"); }
  if (decoded.includes("\\") || decoded.includes("\0") || decoded.startsWith("/") || /^[a-z][\w+.-]*:/i.test(decoded)) throw new Error("KMZ_DEPENDENCY_PATH: invalid decoded path");
  const parts=base.split("/").slice(0,-1);
  for(const p of decoded.split("/")){if(p===""||p===".")continue;if(p===".."){if(!parts.length)throw new Error("KMZ_DEPENDENCY_PATH: escapes archive");parts.pop();}else parts.push(p);}
  return parts.join("/");
}

export interface KMZImport { readonly kmlPath: string; readonly modelPath: string; readonly diagnostics: readonly string[]; readonly modelSource: string; readonly resources: ReadonlyMap<string, Uint8Array>; readonly aliases: ReadonlyMap<string, string> }
/** A single KML Model is resolved strictly inside its verified KMZ package. */
export async function parseKMZ(input: ArrayBuffer | Uint8Array, options: LegacySceneOptions = {}): Promise<KMZImport> {
  checkAbort(options.signal); const bound=limits(options), bytes=inputBytes(input,bound.maxFileBytes);
  const entries=await read3MFPackageEntries(bytes,{...options,maxArchiveBytes:Math.min(bound.maxFileBytes,options.maxArchiveBytes??bound.maxFileBytes),maxEntryBytes:Math.min(bound.maxFileBytes,options.maxEntryBytes??bound.maxFileBytes),maxExpandedBytes:Math.min(bound.maxDependencyBytes,options.maxExpandedBytes??bound.maxDependencyBytes),maxEntries:Math.min(options.maxEntries??2048,2048),maxCompressionRatio:Math.min(options.maxCompressionRatio??1000,1000)});
  const kmls=[...entries.keys()].filter((name)=>/\.kml$/i.test(name));
  if(kmls.length!==1)throw new Error("KMZ_DOCUMENT: expected exactly one KML document");
  const kmlPath=kmls[0]!, root=xml(utf8(entries.get(kmlPath)!),options);
  if(local(root)!=="kml")throw new Error("KMZ_DOCUMENT: expected kml root");
  const models=all(root,"Model"); if(models.length!==1)throw new Error("KMZ_UNSUPPORTED_MODELS: exactly one Model required");
  const model=models[0]!, link=child(model,"Link")??child(model,"Url"), href=value(link,"href");
  const modelPath=archivePath(kmlPath,href), source=entries.get(modelPath);
  if(!source || !/\.dae$/i.test(modelPath))throw new Error("KMZ_MODEL: referenced Collada model is missing");
  const diagnostics:string[]=[];
  if(child(model,"Location"))diagnostics.push("KMZ_UNSUPPORTED_GEOGRAPHIC_LOCATION");
  if(child(model,"Orientation"))diagnostics.push("KMZ_UNSUPPORTED_MODEL_ORIENTATION");
  if(child(model,"Scale"))diagnostics.push("KMZ_UNSUPPORTED_MODEL_SCALE");
  if(all(root,"NetworkLink").length)diagnostics.push("KMZ_UNSUPPORTED_NETWORK_LINK");
  for(const feature of ["Point","LineString","LinearRing","Polygon","GroundOverlay","ScreenOverlay","PhotoOverlay","Track","MultiTrack"]) {
    if(all(root,feature).length)diagnostics.push(`KMZ_UNSUPPORTED_${feature.toUpperCase()}`);
  }
  const aliases=new Map<string,string>();
  for(const alias of children(child(model,"ResourceMap"),"Alias")) {
    const from=value(alias,"sourceHref"), target=archivePath(kmlPath,value(alias,"targetHref"));
    if(aliases.has(from))throw new Error("KMZ_RESOURCE_MAP: duplicate source");
    if(!entries.has(target))throw new Error("KMZ_RESOURCE_MAP: target not found");
    aliases.set(from,target);
  }
  return { kmlPath,modelPath,modelSource:utf8(source),diagnostics,resources:entries,aliases };
}

abstract class LegacyLoader implements AssetLoader<LoadedLegacySceneAsset> {
  abstract readonly type: string;
  protected abstract readonly extensions: readonly string[];
  private readonly inner=new GLTFLoader(); private readonly owned=new WeakMap<LoadedLegacySceneAsset,GLTFAsset>();
  constructor(protected readonly options: LegacySceneOptions = {}) {}
  canLoad(request: AssetLoadRequest):boolean {
    const type=(request.format??request.type??"").toLowerCase();
    return type===this.type || this.extensions.includes(type) || this.extensions.some((ext)=>new RegExp(`\\.${ext}(?:[?#]|$)`,"i").test(request.url));
  }
  protected abstract parseBytes(bytes:Uint8Array,options:LegacySceneOptions,request:AssetLoadRequest,context:LoadContext):Promise<LegacySceneImport>;
  async load(request:AssetLoadRequest,context:LoadContext):Promise<LoadedLegacySceneAsset> {
    const bound=limits(this.options), signal=new LoadContext({signal:context.signalFor(request.signal)}).signalFor(this.options.signal);
    checkAbort(signal);context.throwIfAborted(request.url);
    const policy=mergeAssetRequestOptions(context.requestOptionsFor(request.url),request), url=context.resolve(request.url);
    const bytes=new Uint8Array(await fetchBytes(url,signal,(p)=>request.onProgress?.({url:request.url,phase:"document",loadedBytes:p.loaded,...(p.total===undefined?{}:{totalBytes:p.total})}),{...policy,maxBytes:Math.min(bound.maxFileBytes,policy.maxBytes??bound.maxFileBytes)}));
    checkAbort(signal);const parsed=await this.parseBytes(bytes,{...this.options,signal}, {...request,url},context);checkAbort(signal);
    const synthetic=`data:model/gltf+json,${encodeURIComponent(JSON.stringify(parsed.gltf))}`, inner=await this.inner.load({url:synthetic,type:"gltf",signal},new LoadContext({signal}));
    if(signal?.aborted){this.inner.dispose(inner);checkAbort(signal);}
    const loaderDiagnostics={...inner.loaderDiagnostics,features:[...inner.loaderDiagnostics.features,`${this.type}-native-import`],unsupportedFeatures:[...inner.loaderDiagnostics.unsupportedFeatures,...parsed.diagnostics]};
    const wrapper:LoadedLegacySceneAsset={...inner,url:request.url,legacyScene:{format:parsed.format,diagnostics:parsed.diagnostics,dependencies:parsed.dependencies},get disposed(){return inner.disposed;},loaderDiagnostics,createScene:(opts)=>inner.createScene(opts),toJSON:()=>({...inner.toJSON(),url:request.url,loaderDiagnostics})};
    this.owned.set(wrapper,inner);
    try {request.onProgress?.({url:request.url,phase:"complete",loadedBytes:bytes.length,totalBytes:bytes.length});} catch(error){this.owned.delete(wrapper);this.inner.dispose(inner);throw error;}
    return wrapper;
  }
  dispose(asset:LoadedLegacySceneAsset):void {this.inner.dispose(this.owned.get(asset)??asset);this.owned.delete(asset);}
}
export class AMFLoader extends LegacyLoader { readonly type="amf";protected readonly extensions=["amf"]; protected parseBytes(bytes:Uint8Array,options:LegacySceneOptions):Promise<LegacySceneImport>{return parseAMF(bytes,options);} }
export class TDSLoader extends LegacyLoader { readonly type="3ds";protected readonly extensions=["3ds"]; protected async parseBytes(bytes:Uint8Array,options:LegacySceneOptions):Promise<LegacySceneImport>{return parse3DS(bytes,options);} }
export class VRMLLoader extends LegacyLoader { readonly type="vrml";protected readonly extensions=["wrl","vrml"]; protected async parseBytes(bytes:Uint8Array,options:LegacySceneOptions):Promise<LegacySceneImport>{return parseVRML(bytes,options);} }
export class LDrawLoader extends LegacyLoader {
  readonly type="ldraw";protected readonly extensions=["ldr","mpd","dat"];
  protected parseBytes(bytes:Uint8Array,options:LegacySceneOptions,request:AssetLoadRequest,context:LoadContext):Promise<LegacySceneImport>{
    const root=request.url;let baseUrl:string;try{baseUrl=new URL(".",root).toString();}catch{baseUrl=root.slice(0,root.lastIndexOf("/")+1);}
    const settings=mergeAssetRequestOptions(context.requestOptionsFor(root),request), policyContext=new LoadContext({...settings,baseUrl,documentUrl:root,signal:options.signal}); let dependencyBytes=0;
    return parseLDraw(bytes,{...options,baseUrl:root,resolveDependency:async(name,containing,signal)=>{
      let url:string;try{url=new URL(name,containing??root).toString();}catch{throw new Error("LDRAW_DEPENDENCY_REQUIRED: references require an absolute source URL");}
      const dependencyPolicy=policyContext.requestOptionsFor(url), bound=limits(options);const maxBytes=Math.min(dependencyPolicy.maxBytes??bound.maxFileBytes,bound.maxFileBytes,bound.maxDependencyBytes-dependencyBytes);
      if(maxBytes<=0)throw new RangeError("LDRAW_DEPENDENCY_LIMIT: total bytes exceeded");
      const result=await fetchBytes(url,signal,undefined,{...dependencyPolicy,maxBytes});checkAbort(signal); dependencyBytes+=result.byteLength;
      return {url,text:utf8(new Uint8Array(result))};
    }});
  }
}

/** KMZ delegates verified archive-local Collada to the existing scene loader. */
export class KMZLoader implements AssetLoader<LoadedLegacySceneAsset> {
  readonly type="kmz";private readonly inner=new ColladaLoader();private readonly owned=new WeakMap<LoadedLegacySceneAsset,GLTFAsset>();
  constructor(private readonly options:LegacySceneOptions={}){}
  canLoad(request:AssetLoadRequest):boolean{return request.type==="kmz"||request.format==="kmz"||/\.kmz(?:[?#]|$)/i.test(request.url);}
  async load(request:AssetLoadRequest,context:LoadContext):Promise<LoadedLegacySceneAsset>{
    const bound=limits(this.options),signal=new LoadContext({signal:context.signalFor(request.signal)}).signalFor(this.options.signal),policy=mergeAssetRequestOptions(context.requestOptionsFor(request.url),request);
    checkAbort(signal);const bytes=await fetchBytes(context.resolve(request.url),signal,(p)=>request.onProgress?.({url:request.url,phase:"document",loadedBytes:p.loaded,...(p.total===undefined?{}:{totalBytes:p.total})}),{...policy,maxBytes:Math.min(bound.maxFileBytes,policy.maxBytes??bound.maxFileBytes)});
    const parsed=await parseKMZ(new Uint8Array(bytes),{...this.options,signal});checkAbort(signal);
    const dataUri=(uri:string):string=>{
      if(uri.startsWith("data:"))return uri;
      const path=parsed.aliases.get(uri)??archivePath(parsed.modelPath,uri),resource=parsed.resources.get(path);
      if(!resource)throw new Error(`KMZ_DEPENDENCY: archive entry not found: ${path}`);
      const mime=/\.png$/i.test(path)?"image/png":/\.jpe?g$/i.test(path)?"image/jpeg":undefined;
      if(!mime)throw new Error("KMZ_UNSUPPORTED_DEPENDENCY: only embedded PNG/JPEG textures are supported");
      return `data:${mime};base64,${base64(resource)}`;
    };
    const inner=await this.inner.parse(parsed.modelSource,{baseUrl:`archive://kmz/${parsed.modelPath}`,maxBytes:Math.min(bound.maxFileBytes,32*1024*1024),maxVertices:bound.maxVertices,resolveDependency:dataUri},new LoadContext({signal}));
    if(signal?.aborted){this.inner.dispose(inner);checkAbort(signal);}
    const loaderDiagnostics={...inner.loaderDiagnostics,features:[...inner.loaderDiagnostics.features,"kmz-native-import"],unsupportedFeatures:[...inner.loaderDiagnostics.unsupportedFeatures,...parsed.diagnostics]};
    const wrapper:LoadedLegacySceneAsset={...inner,url:request.url,legacyScene:{format:"kmz",diagnostics:parsed.diagnostics,dependencies:[]},get disposed(){return inner.disposed;},loaderDiagnostics,createScene:(opts)=>inner.createScene(opts),toJSON:()=>({...inner.toJSON(),url:request.url,loaderDiagnostics})};
    this.owned.set(wrapper,inner);
    try {request.onProgress?.({url:request.url,phase:"complete",loadedBytes:bytes.byteLength,totalBytes:bytes.byteLength});} catch(error){this.owned.delete(wrapper);this.inner.dispose(inner);throw error;}
    return wrapper;
  }
  dispose(asset:LoadedLegacySceneAsset):void{this.inner.dispose(this.owned.get(asset)??asset);this.owned.delete(asset);}
}
