import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { createGLTFFormatAdapter, type FormatAdapter, type FormatMetadata } from "../FormatRegistry";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import type { LoadContext } from "../LoadContext";
import { loadNativeMeshAsset, readMeshAssetBytes, type MeshImportLimits, type NativeMeshData } from "./MeshFormatLoaders";

/** MagicaVoxel coordinates and translations are integer voxel units, Z-up. */
export interface VoxelModel {
  readonly size: readonly [number, number, number];
  /** Packed [x, y, z, paletteIndex] quadruples, in file order. */
  readonly voxels: Uint8Array;
}
export interface VoxelVolume {
  readonly size: readonly [number, number, number];
  /** X is fastest, then Y, then Z. Zero is empty; 1..255 index the palette. */
  readonly indices: Uint8Array;
  /** 256 RGBA entries; entry zero is transparent. */
  readonly palette: Uint8Array;
}
export interface VoxTransformNode {
  readonly kind: "transform";
  readonly id: number;
  readonly attributes: Readonly<Record<string, string>>;
  readonly child: number;
  readonly layer: number;
  readonly frames: readonly Readonly<Record<string, string>>[];
}
export interface VoxGroupNode {
  readonly kind: "group";
  readonly id: number;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly number[];
}
export interface VoxShapeNode {
  readonly kind: "shape";
  readonly id: number;
  readonly attributes: Readonly<Record<string, string>>;
  readonly models: readonly { readonly id: number; readonly attributes: Readonly<Record<string, string>> }[];
}
export type VoxNode = VoxTransformNode | VoxGroupNode | VoxShapeNode;
export interface VoxAssetData {
  readonly version: number;
  readonly models: readonly VoxelModel[];
  readonly palette: Uint8Array;
  readonly nodes: readonly VoxNode[];
  readonly layers: Readonly<Record<number, Readonly<Record<string, string>>>>;
  readonly materials: Readonly<Record<number, Readonly<Record<string, string>>>>;
  /** Exposed faces converted from Z-up to glTF's Y-up axes, with transforms baked. */
  readonly mesh: NativeMeshData;
  readonly diagnostics: readonly string[];
}
interface Limits extends Required<MeshImportLimits> { readonly maxVoxelCount: number; readonly maxNodes: number }
export interface VoxelImportLimits extends MeshImportLimits {
  readonly maxVoxelCount?: number;
  readonly maxNodes?: number;
}

/** Bounds and static-frame selection for an opt-in VOX model adapter. */
export interface VOXFormatAdapterOptions extends VoxelImportLimits {
  /** Select one source frame while loading; the resulting scene is static. */
  readonly frame?: number;
}
function limitsOf(value: VoxelImportLimits): Limits {
  const limits: Limits = { maxFileBytes: value.maxFileBytes ?? 64 * 1024 * 1024, maxElements: value.maxElements ?? 2_000_000, maxListItems: value.maxListItems ?? 12_000_000, maxOutputBytes: value.maxOutputBytes ?? 256 * 1024 * 1024, maxVoxelCount: value.maxVoxelCount ?? 1_000_000, maxNodes: value.maxNodes ?? 100_000 };
  for (const [name, amount] of Object.entries(limits)) if (!Number.isSafeInteger(amount) || amount < 1) throw new Error(`VOX_INVALID_LIMIT: ${name} must be a positive safe integer`);
  return limits;
}
function checkSize(size: readonly number[]): asserts size is readonly [number, number, number] {
  if (size.length !== 3 || size.some((axis) => !Number.isSafeInteger(axis) || axis < 1 || axis > 256)) throw new Error("VOX_SIZE: each dimension must be an integer from 1 to 256");
}
function defaultPalette(): Uint8Array {
  const palette = new Uint8Array(1024);
  const levels = [255, 204, 153, 102, 51, 0];
  let slot = 1;
  for (const red of levels) for (const green of levels) for (const blue of levels) {
    if (red === 0 && green === 0 && blue === 0) continue;
    palette.set([red, green, blue, 255], slot++ * 4);
  }
  const shades = [238, 221, 187, 170, 136, 119, 85, 68, 34, 17];
  for (const component of [0, 1, 2, 3]) for (const shade of shades) {
    const rgb = [0, 0, 0];
    if (component === 3) rgb.fill(shade); else rgb[component] = shade;
    palette.set([...rgb, 255], slot++ * 4);
  }
  return palette;
}
type Transform = { readonly rotation: readonly number[]; readonly translation: readonly [number, number, number] };
const IDENTITY: Transform = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
function vector(matrix: readonly number[], value: readonly number[]): [number, number, number] {
  return [matrix[0]! * value[0]! + matrix[1]! * value[1]! + matrix[2]! * value[2]!, matrix[3]! * value[0]! + matrix[4]! * value[1]! + matrix[5]! * value[2]!, matrix[6]! * value[0]! + matrix[7]! * value[1]! + matrix[8]! * value[2]!];
}
function compose(a: Transform, b: Transform): Transform {
  const m = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) for (let k = 0; k < 3; k += 1) m[row * 3 + col] += a.rotation[row * 3 + k]! * b.rotation[k * 3 + col]!;
  const t = vector(a.rotation, b.translation);
  return { rotation: m, translation: [t[0] + a.translation[0], t[1] + a.translation[1], t[2] + a.translation[2]] };
}
function parseTransform(frame: Readonly<Record<string, string>>): Transform {
  let translation: [number, number, number] = [0, 0, 0];
  if (frame._t !== undefined) {
    const parts = frame._t.trim().split(/\s+/);
    if (parts.length !== 3 || parts.some((part) => !/^[+-]?\d+$/.test(part))) throw new Error("VOX_TRANSFORM: invalid translation");
    const values = parts.map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || Math.abs(value) > 1_000_000_000)) throw new Error("VOX_TRANSFORM: translation out of range");
    translation = values as [number, number, number];
  }
  let rotation = IDENTITY.rotation;
  if (frame._r !== undefined) {
    if (!/^\d+$/.test(frame._r)) throw new Error("VOX_TRANSFORM: invalid rotation");
    const code = Number(frame._r);
    if (!Number.isSafeInteger(code) || code < 0 || code > 127) throw new Error("VOX_TRANSFORM: rotation out of range");
    const a = code & 3, b = code >> 2 & 3;
    if (a > 2 || b > 2 || a === b) throw new Error("VOX_TRANSFORM: invalid rotation axes");
    const c = 3 - a - b;
    const m = new Array<number>(9).fill(0);
    m[a] = code & 16 ? -1 : 1;
    m[3 + b] = code & 32 ? -1 : 1;
    m[6 + c] = code & 64 ? -1 : 1;
    rotation = m;
  }
  return { rotation, translation };
}
function toYUp(value: readonly number[]): [number, number, number] { return [value[0]!, value[2]!, -value[1]!]; }
const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
] as const;
interface ModelInstance { readonly model: VoxelModel; readonly transform: Transform; readonly centered: boolean }
function buildMesh(instances: readonly ModelInstance[], palette: Uint8Array, limits: Limits): NativeMeshData {
  let inputVoxels = 0, faceCount = 0;
  const occupancies = new WeakMap<VoxelModel, Map<number, number>>();
  const prepared = instances.map((instance) => {
    inputVoxels += instance.model.voxels.length / 4;
    if (inputVoxels > limits.maxVoxelCount) throw new Error("VOX_VOXEL_LIMIT: instantiated voxel count exceeds maxVoxelCount");
    let occupancy = occupancies.get(instance.model);
    if (!occupancy) {
      occupancy = new Map<number, number>();
      for (let i = 0; i < instance.model.voxels.length; i += 4) occupancy.set(instance.model.voxels[i]! | instance.model.voxels[i + 1]! << 8 | instance.model.voxels[i + 2]! << 16, instance.model.voxels[i + 3]!);
      occupancies.set(instance.model, occupancy);
    }
    return { ...instance, occupancy };
  });
  const isExposed = (occupancy: Map<number, number>, x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= 256 || y < 0 || y >= 256 || z < 0 || z >= 256) return true;
    const neighbor = occupancy.get(x | y << 8 | z << 16);
    return neighbor === undefined || palette[neighbor * 4 + 3]! < 255;
  };
  for (const { model, occupancy } of prepared) {
    for (let i = 0; i < model.voxels.length; i += 4) {
      const x = model.voxels[i]!, y = model.voxels[i + 1]!, z = model.voxels[i + 2]!;
      for (const face of FACES) if (isExposed(occupancy, x + face.normal[0], y + face.normal[1], z + face.normal[2])) {
        faceCount += 1;
        if (faceCount * 4 > limits.maxElements || faceCount * 6 > limits.maxListItems || faceCount * 184 > limits.maxOutputBytes) throw new Error("VOX_ALLOCATION_LIMIT: generated surfaces exceed import limits");
      }
    }
  }
  const positions = new Float32Array(faceCount * 12), normals = new Float32Array(faceCount * 12), colors = new Float32Array(faceCount * 16), indices = new Uint32Array(faceCount * 6);
  let faceIndex = 0;
  for (const { model, transform, centered, occupancy } of prepared) {
    const det = transform.rotation[0]! * (transform.rotation[4]! * transform.rotation[8]! - transform.rotation[5]! * transform.rotation[7]!) - transform.rotation[1]! * (transform.rotation[3]! * transform.rotation[8]! - transform.rotation[5]! * transform.rotation[6]!) + transform.rotation[2]! * (transform.rotation[3]! * transform.rotation[7]! - transform.rotation[4]! * transform.rotation[6]!);
    for (let i = 0; i < model.voxels.length; i += 4) {
      const x = model.voxels[i]!, y = model.voxels[i + 1]!, z = model.voxels[i + 2]!, color = model.voxels[i + 3]!;
      for (const face of FACES) {
        if (!isExposed(occupancy, x + face.normal[0], y + face.normal[1], z + face.normal[2])) continue;
        const base = faceIndex * 4;
        const normal = toYUp(vector(transform.rotation, face.normal));
        for (let vertex = 0; vertex < 4; vertex += 1) {
          const corner = face.corners[vertex]!;
          const local = [x + corner[0] - (centered ? model.size[0] / 2 : 0), y + corner[1] - (centered ? model.size[1] / 2 : 0), z + corner[2] - (centered ? model.size[2] / 2 : 0)];
          const p = vector(transform.rotation, local);
          positions.set(toYUp([p[0] + transform.translation[0], p[1] + transform.translation[1], p[2] + transform.translation[2]]), (base + vertex) * 3);
          normals.set(normal, (base + vertex) * 3);
          colors.set([palette[color * 4]! / 255, palette[color * 4 + 1]! / 255, palette[color * 4 + 2]! / 255, palette[color * 4 + 3]! / 255], (base + vertex) * 4);
        }
        indices.set(det < 0 ? [base, base + 2, base + 1, base, base + 3, base + 2] : [base, base + 1, base + 2, base, base + 2, base + 3], faceIndex * 6);
        faceIndex += 1;
      }
    }
  }
  return { positions, normals, colors, indices, topology: "triangles", diagnostics: faceCount ? [] : ["VOX scene contains no visible occupied voxels"] };
}

/** Convert a dense voxel volume to exposed triangle surfaces. */
export function voxelVolumeToMesh(volume: VoxelVolume, options: VoxelImportLimits = {}): NativeMeshData {
  const limits = limitsOf(options);
  checkSize(volume.size);
  const count = volume.size[0] * volume.size[1] * volume.size[2];
  if (count !== volume.indices.length || volume.palette.length !== 1024) throw new Error("VOX_VOLUME: dimensions, indices, or palette length do not agree");
  const voxels: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const color = volume.indices[i]!;
    if (!color) continue;
    if (voxels.length / 4 >= limits.maxVoxelCount) throw new Error("VOX_VOXEL_LIMIT: volume exceeds maxVoxelCount");
    const x = i % volume.size[0], y = Math.floor(i / volume.size[0]) % volume.size[1], z = Math.floor(i / (volume.size[0] * volume.size[1]));
    voxels.push(x, y, z, color);
  }
  return buildMesh([{ model: { size: volume.size, voxels: Uint8Array.from(voxels) }, transform: IDENTITY, centered: false }], volume.palette, limits);
}

/** Parse a bounded MagicaVoxel 150/200 file including model, palette and scene chunks. */
export function parseVOX(input: ArrayBuffer | Uint8Array, options: VoxelImportLimits & { readonly frame?: number } = {}): VoxAssetData {
  const limits = limitsOf(options);
  const frame = options.frame ?? 0;
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("VOX_FRAME: frame must be a non-negative safe integer");
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > limits.maxFileBytes) throw new Error("VOX_FILE_LIMIT: input exceeds maxFileBytes");
  if (bytes.length < 20 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "VOX ") throw new Error("VOX_HEADER: missing VOX magic");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== 150 && version !== 200) throw new Error(`VOX_VERSION: unsupported version ${version}`);
  const idAt = (offset: number): string => new TextDecoder().decode(bytes.subarray(offset, offset + 4));
  if (idAt(8) !== "MAIN") throw new Error("VOX_HEADER: missing MAIN chunk");
  const mainContent = view.getUint32(12, true), mainChildren = view.getUint32(16, true);
  if (mainContent !== 0 || 20 + mainChildren !== bytes.length) throw new Error("VOX_CHUNK: invalid MAIN boundaries");
  const models: VoxelModel[] = [];
  const nodes: VoxNode[] = [];
  const layers: Record<number, Readonly<Record<string, string>>> = Object.create(null) as Record<number, Readonly<Record<string, string>>>;
  const materials: Record<number, Readonly<Record<string, string>>> = Object.create(null) as Record<number, Readonly<Record<string, string>>>;
  const diagnostics: string[] = [];
  let palette = defaultPalette(), paletteSeen = false, pack: number | undefined;
  let pendingSize: [number, number, number] | undefined;
  let totalVoxels = 0;
  const nodeIds = new Set<number>();
  class Cursor {
    offset: number;
    constructor(start: number, readonly end: number) { this.offset = start; }
    uint(): number { if (this.offset + 4 > this.end) throw new Error("VOX_TRUNCATED: incomplete integer"); const value = view.getUint32(this.offset, true); this.offset += 4; return value; }
    int(): number { if (this.offset + 4 > this.end) throw new Error("VOX_TRUNCATED: incomplete integer"); const value = view.getInt32(this.offset, true); this.offset += 4; return value; }
    string(): string {
      const length = this.uint();
      if (length > MAX_DICTIONARY_STRING_BYTES || this.offset + length > this.end) throw new Error("VOX_DICTIONARY: string exceeds chunk bounds or limit");
      let result: string;
      try { result = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(this.offset, this.offset + length)); } catch { throw new Error("VOX_DICTIONARY: invalid UTF-8"); }
      this.offset += length;
      return result;
    }
    dictionary(): Readonly<Record<string, string>> {
      const count = this.uint();
      if (count > 4096 || count * 8 > this.end - this.offset) throw new Error("VOX_DICTIONARY: invalid entry count");
      const dictionary: Record<string, string> = Object.create(null) as Record<string, string>;
      for (let i = 0; i < count; i += 1) {
        const key = this.string(), value = this.string();
        if (Object.hasOwn(dictionary, key)) throw new Error("VOX_DICTIONARY: duplicate key");
        dictionary[key] = value;
      }
      return dictionary;
    }
    done(): void { if (this.offset !== this.end) throw new Error("VOX_CHUNK: unexpected content bytes"); }
  }
  const addNode = (node: VoxNode): void => {
    if (node.id < 0 || nodeIds.has(node.id)) throw new Error("VOX_SCENE: invalid or duplicate node id");
    if (nodes.length >= limits.maxNodes) throw new Error("VOX_NODE_LIMIT: too many nodes");
    nodeIds.add(node.id); nodes.push(node);
  };
  const readChunks = (start: number, end: number, depth: number): void => {
    if (depth > 32) throw new Error("VOX_CHUNK: nesting limit exceeded");
    let offset = start;
    while (offset < end) {
      if (offset + 12 > end) throw new Error("VOX_TRUNCATED: incomplete chunk header");
      const id = idAt(offset), content = view.getUint32(offset + 4, true), children = view.getUint32(offset + 8, true);
      const contentStart = offset + 12, contentEnd = contentStart + content, childEnd = contentEnd + children;
      if (!Number.isSafeInteger(childEnd) || contentEnd > end || childEnd > end) throw new Error("VOX_TRUNCATED: chunk exceeds parent bounds");
      const cursor = new Cursor(contentStart, contentEnd);
      switch (id) {
        case "PACK": {
          if (pack !== undefined) throw new Error("VOX_CHUNK: duplicate PACK");
          pack = cursor.uint(); cursor.done();
          if (pack > limits.maxNodes) throw new Error("VOX_NODE_LIMIT: model count exceeds limit");
          break;
        }
        case "SIZE": {
          if (pendingSize) throw new Error("VOX_MODEL: SIZE without preceding XYZI");
          pendingSize = [cursor.uint(), cursor.uint(), cursor.uint()]; cursor.done(); checkSize(pendingSize); break;
        }
        case "XYZI": {
          if (!pendingSize) throw new Error("VOX_MODEL: XYZI requires SIZE");
          const count = cursor.uint();
          if ((totalVoxels += count) > limits.maxVoxelCount || count * 4 !== cursor.end - cursor.offset) throw new Error("VOX_VOXEL_LIMIT: invalid or excessive voxel count");
          const voxels = bytes.slice(cursor.offset, cursor.end);
          const occupied = new Set<number>();
          for (let i = 0; i < voxels.length; i += 4) {
            const x = voxels[i]!, y = voxels[i + 1]!, z = voxels[i + 2]!, color = voxels[i + 3]!;
            if (x >= pendingSize[0] || y >= pendingSize[1] || z >= pendingSize[2] || color === 0) throw new Error("VOX_MODEL: voxel lies outside its bounds or uses empty palette index");
            const key = x | y << 8 | z << 16;
            if (occupied.has(key)) throw new Error("VOX_MODEL: duplicate voxel coordinate");
            occupied.add(key);
          }
          if (models.length >= limits.maxNodes) throw new Error("VOX_NODE_LIMIT: too many models");
          models.push({ size: pendingSize, voxels }); pendingSize = undefined; break;
        }
        case "RGBA": {
          if (paletteSeen || content !== 1024) throw new Error("VOX_PALETTE: invalid or duplicate RGBA");
          palette = new Uint8Array(1024);
          palette.set(bytes.subarray(contentStart, contentStart + 1020), 4);
          paletteSeen = true; break;
        }
        case "nTRN": {
          const nodeId = cursor.int(), attributes = cursor.dictionary(), child = cursor.int();
          if (cursor.int() !== -1) throw new Error("VOX_SCENE: nTRN reserved id must be -1");
          const layer = cursor.int(), count = cursor.uint();
          if (count < 1 || count > limits.maxNodes) throw new Error("VOX_NODE_LIMIT: invalid transform frame count");
          const frames: Readonly<Record<string, string>>[] = [];
          for (let i = 0; i < count; i += 1) { const data = cursor.dictionary(); parseTransform(data); if (data._f !== undefined && !/^\d+$/.test(data._f)) throw new Error("VOX_FRAME: invalid frame index"); frames.push(data); }
          cursor.done(); addNode({ kind: "transform", id: nodeId, attributes, child, layer, frames }); break;
        }
        case "nGRP": {
          const nodeId = cursor.int(), attributes = cursor.dictionary(), count = cursor.uint();
          if (count > limits.maxNodes || count * 4 > cursor.end - cursor.offset) throw new Error("VOX_NODE_LIMIT: invalid group child count");
          const childrenIds: number[] = [];
          for (let i = 0; i < count; i += 1) childrenIds.push(cursor.int());
          cursor.done(); addNode({ kind: "group", id: nodeId, attributes, children: childrenIds }); break;
        }
        case "nSHP": {
          const nodeId = cursor.int(), attributes = cursor.dictionary(), count = cursor.uint();
          if (count < 1 || count > limits.maxNodes) throw new Error("VOX_NODE_LIMIT: invalid shape model count");
          const refs: Array<{ id: number; attributes: Readonly<Record<string, string>> }> = [];
          for (let i = 0; i < count; i += 1) { const modelId = cursor.int(), data = cursor.dictionary(); if (data._f !== undefined && !/^\d+$/.test(data._f)) throw new Error("VOX_FRAME: invalid model frame"); refs.push({ id: modelId, attributes: data }); }
          cursor.done(); addNode({ kind: "shape", id: nodeId, attributes, models: refs }); break;
        }
        case "LAYR": {
          const layer = cursor.int(), data = cursor.dictionary();
          if (layer < 0 || Object.hasOwn(layers, layer) || cursor.int() !== -1) throw new Error("VOX_SCENE: invalid layer");
          cursor.done(); layers[layer] = data; break;
        }
        case "MATL": {
          const material = cursor.int(), data = cursor.dictionary();
          if (material < 1 || material > 255 || Object.hasOwn(materials, material)) throw new Error("VOX_MATERIAL: invalid material id");
          cursor.done(); materials[material] = data;
          diagnostics.push(`VOX material ${material} metadata retained; physical material properties are not mapped to rendering`); break;
        }
        default: diagnostics.push(`VOX chunk ${JSON.stringify(id)} was not interpreted`);
      }
      if (children) readChunks(contentEnd, childEnd, depth + 1);
      offset = childEnd;
    }
    if (offset !== end) throw new Error("VOX_CHUNK: invalid chunk boundary");
  };
  readChunks(20, bytes.length, 0);
  if (pendingSize) throw new Error("VOX_MODEL: missing XYZI after SIZE");
  if (!models.length) throw new Error("VOX_MODEL: no model chunks");
  if (pack !== undefined && pack !== models.length) throw new Error("VOX_MODEL: PACK count does not match models");
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const referenced = new Set<number>();
  for (const node of nodes) {
    if (node.kind === "shape") {
      for (const ref of node.models) if (!Number.isInteger(ref.id) || ref.id < 0 || ref.id >= models.length) throw new Error("VOX_SCENE: shape references missing model");
    } else {
      const children = node.kind === "group" ? node.children : [node.child];
      for (const child of children) { if (!byId.has(child)) throw new Error("VOX_SCENE: node references missing child"); referenced.add(child); }
    }
  }
  const active = new Set<number>(), visited = new Set<number>();
  const validateGraph = (node: VoxNode, depth: number): void => {
    if (depth > 256 || active.has(node.id)) throw new Error("VOX_SCENE: cyclic or excessively deep graph");
    if (visited.has(node.id)) return;
    active.add(node.id);
    const children = node.kind === "group" ? node.children : node.kind === "transform" ? [node.child] : [];
    for (const child of children) validateGraph(byId.get(child)!, depth + 1);
    active.delete(node.id); visited.add(node.id);
  };
  for (const node of nodes) validateGraph(node, 0);
  const instances: ModelInstance[] = [];
  const choose = <T>(entries: readonly T[], attrs: (entry: T) => Readonly<Record<string, string>>): T => {
    let chosen = entries[0]!, chosenTime = -1;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!, time = attrs(entry)._f === undefined ? i : Number(attrs(entry)._f);
      if (!Number.isSafeInteger(time) || time < 0) throw new Error("VOX_FRAME: frame index exceeds safe range");
      if (time <= frame && time >= chosenTime) { chosen = entry; chosenTime = time; }
    }
    return chosen;
  };
  let visits = 0;
  const visit = (node: VoxNode, transform: Transform, depth: number): void => {
    if (++visits > limits.maxNodes) throw new Error("VOX_NODE_LIMIT: too many instantiated scene nodes");
    if (depth > 256) throw new Error("VOX_SCENE: scene depth limit exceeded");
    if (node.attributes._hidden === "1") return;
    if (node.kind === "transform") {
      if (layers[node.layer]?._hidden === "1") return;
      const selected = choose(node.frames, (entry) => entry);
      if (selected._hidden !== "1") visit(byId.get(node.child)!, compose(transform, parseTransform(selected)), depth + 1);
    } else if (node.kind === "group") {
      for (const child of node.children) visit(byId.get(child)!, transform, depth + 1);
    } else {
      const selected = choose(node.models, (entry) => entry.attributes);
      if (selected.attributes._hidden !== "1") {
        if (instances.length >= limits.maxNodes) throw new Error("VOX_NODE_LIMIT: too many model instances");
        instances.push({ model: models[selected.id]!, transform, centered: true });
      }
    }
  };
  if (nodes.length) for (const node of nodes) { if (!referenced.has(node.id)) visit(node, IDENTITY, 0); }
  else for (const model of models) instances.push({ model, transform: IDENTITY, centered: false });
  const mesh = buildMesh(instances, palette, limits);
  return { version, models, palette, nodes, layers, materials, mesh, diagnostics };
}
const MAX_DICTIONARY_STRING_BYTES = 1024 * 1024;

interface LoadedVOXVersion {
  readonly version: string;
  readonly converter: GLTFLoader;
}

// A version claim is meaningful only for the exact loader and asset produced
// from the same fetched bytes. This is not a public field callers can forge.
const loadedVOXVersions = new WeakMap<object, WeakMap<GLTFAsset, LoadedVOXVersion>>();

export class VOXLoader implements AssetLoader<GLTFAsset> {
  readonly type = "vox";
  private readonly owned = new WeakMap<GLTFAsset, (asset: GLTFAsset) => void>();
  constructor(private readonly gltfLoader = new GLTFLoader(), private readonly limits: VoxelImportLimits & { readonly frame?: number } = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return request.type === "vox" || /\.vox(?:[?#]|$)/i.test(request.url); }
  parse(input: ArrayBuffer | Uint8Array): VoxAssetData { return parseVOX(input, this.limits); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    // Capture both policy containers and parse settings before I/O: the same
    // source identity and limits must apply for the whole load.
    const capturedRequest = { ...request, ...mergeAssetRequestOptions({}, request) };
    const capturedLimits: VOXFormatAdapterOptions = {
      maxFileBytes: this.limits.maxFileBytes,
      maxElements: this.limits.maxElements,
      maxListItems: this.limits.maxListItems,
      maxOutputBytes: this.limits.maxOutputBytes,
      maxVoxelCount: this.limits.maxVoxelCount,
      maxNodes: this.limits.maxNodes,
      frame: this.limits.frame
    };
    const parser = this.parse;
    const converter = this.gltfLoader;
    const converterLoad = converter.load;
    const disposeConverted = converter.dispose.bind(converter);
    // The mesh bridge only needs load/dispose. Bind both now so changes during
    // the fetch cannot substitute a different converter after certification.
    const converterSnapshot = { load: converterLoad.bind(converter), dispose: disposeConverted } as unknown as GLTFLoader;
    const nativeAtStart = converterLoad === nativeGLTFLoad && hasNativeVOXMethods(this, converter);
    const bytes = await readMeshAssetBytes(capturedRequest, context, limitsOf(capturedLimits).maxFileBytes);
    // Preserve custom parser overrides for unversioned loads, but never use
    // one as proof of the file version. The native path parses these exact
    // fetched bytes with the settings captured before I/O.
    const parsed = parser === nativeVOXParse ? parseVOX(bytes, capturedLimits) : parser.call(this, bytes);
    const asset = await loadNativeMeshAsset({ ...parsed.mesh, diagnostics: [...parsed.mesh.diagnostics, ...parsed.diagnostics] }, "vox", capturedRequest.url, converterSnapshot, context, capturedRequest.signal);
    try {
      context.throwIfAborted(capturedRequest.url);
      if (capturedRequest.signal?.aborted) throw capturedRequest.signal.reason ?? new Error("Asset load aborted");
      capturedRequest.onProgress?.({ url: capturedRequest.url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
      // A completion callback may synchronously cancel or dispose its owner.
      context.throwIfAborted(capturedRequest.url);
      if (capturedRequest.signal?.aborted) throw capturedRequest.signal.reason ?? new Error("Asset load aborted");
      this.owned.set(asset, disposeConverted);
      if (nativeAtStart && this.gltfLoader === converter && hasNativeVOXMethods(this, converter)) {
        let versions = loadedVOXVersions.get(this);
        if (!versions) { versions = new WeakMap(); loadedVOXVersions.set(this, versions); }
        versions.set(asset, { version: String(parsed.version), converter });
      }
      return asset;
    } catch (error) {
      disposeConverted(asset);
      throw error;
    }
  }
  dispose(asset: GLTFAsset): void {
    const dispose = this.owned.get(asset);
    if (dispose) {
      this.owned.delete(asset);
      loadedVOXVersions.get(this)?.delete(asset);
      dispose(asset);
    }
  }
}

// Captured once rather than trusting later replacements as provenance. A loader
// override may still serve unversioned requests. This in-process check is not
// a tamper-proof boundary against arbitrary code modifying loader methods.
const nativeVOXLoad = VOXLoader.prototype.load;
const nativeVOXParse = VOXLoader.prototype.parse;
const nativeGLTFLoad = GLTFLoader.prototype.load;

function hasNativeVOXMethods(loader: VOXLoader, converter: GLTFLoader): boolean {
  return loader.load === nativeVOXLoad && loader.parse === nativeVOXParse && converter.load === nativeGLTFLoad;
}

/**
 * Opt in to bounded, static VOX model imports in one app's FormatRegistry.
 * Parsed model instances are flattened to a glTF-shaped mesh; the frame is
 * selected at load time and is not a live animation. The 32 MiB limit matches
 * the native mesh render bridge even when callers request a larger budget.
 */
export function createVOXFormatAdapter(options: VOXFormatAdapterOptions = {}): FormatAdapter<GLTFAsset> {
  const configured: VOXFormatAdapterOptions = {
    maxFileBytes: options.maxFileBytes,
    maxElements: options.maxElements,
    maxListItems: options.maxListItems,
    maxOutputBytes: options.maxOutputBytes,
    maxVoxelCount: options.maxVoxelCount,
    maxNodes: options.maxNodes,
    frame: options.frame
  };
  // Validate before clamping: NaN, infinity, non-numbers and unsafe values
  // must remain invalid rather than being coerced into an apparently safe cap.
  limitsOf(configured);
  if (configured.frame !== undefined && (!Number.isSafeInteger(configured.frame) || configured.frame < 0)) {
    throw new Error("VOX_FRAME: frame must be a non-negative safe integer");
  }
  const captured = { ...configured, maxOutputBytes: Math.min(configured.maxOutputBytes ?? 32 * 1024 * 1024, 32 * 1024 * 1024) };
  const loader = new VOXLoader(undefined, captured);
  const adapter = createGLTFFormatAdapter("vox", ["vox"], loader, undefined, Object.freeze(["150", "200"]));
  return {
    ...adapter,
    validateLoadedAsset(asset: GLTFAsset, metadata: Readonly<FormatMetadata> | undefined, actualLoader: AssetLoader<GLTFAsset>): void {
      if (metadata?.version === undefined) return;
      const proof = loadedVOXVersions.get(actualLoader)?.get(asset);
      if (!(actualLoader instanceof VOXLoader) || !proof || !hasNativeVOXMethods(actualLoader, proof.converter)) {
        throw new Error("VOX_VERSION_UNVERIFIED: loaded asset has no matching native loader provenance");
      }
      if (proof.version !== metadata.version) {
        throw new Error(`VOX_VERSION_MISMATCH: expected ${metadata.version}, loaded ${proof.version}`);
      }
    }
  };
}
