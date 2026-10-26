/** Copy-on-write GLB editing for the skin repair tools: append accessors, replace primitive attributes, repack the binary. */
import type { GlbData, GltfJson } from "./gltf.js";

const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export class GlbEditor {
  readonly json: GltfJson;
  bin: Buffer;

  constructor(source: GlbData) {
    this.json = JSON.parse(JSON.stringify(source.json)) as GltfJson;
    this.bin = Buffer.from(source.bin);
  }

  /** Appends a typed array as a new buffer view + accessor and returns the accessor index. */
  addAccessor(values: ArrayLike<number>, componentType: 5123 | 5125 | 5126, type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4", target: 34962 | 34963 | undefined, bounds = false): number {
    const comps = NCOMP[type] ?? 1;
    const count = Math.floor(values.length / comps);
    const size = SIZE[componentType] ?? 4;
    const pad = (4 - (this.bin.length % 4)) % 4;
    if (pad) this.bin = Buffer.concat([this.bin, Buffer.alloc(pad)]);
    const offset = this.bin.length;
    const buf = Buffer.alloc(values.length * size);
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? 0;
      if (componentType === 5126) buf.writeFloatLE(v, i * 4);
      else if (componentType === 5123) buf.writeUInt16LE(v, i * 2);
      else buf.writeUInt32LE(v, i * 4);
    }
    this.bin = Buffer.concat([this.bin, buf]);
    this.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    const accessor: GltfJson["accessors"][number] = { bufferView: this.json.bufferViews.length - 1, componentType, count, type };
    if (bounds && comps === 3) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i += 1) for (let a = 0; a < 3; a += 1) { const v = values[i * 3 + a] ?? 0; min[a] = Math.min(min[a] as number, v); max[a] = Math.max(max[a] as number, v); }
      accessor.min = min; accessor.max = max;
    }
    this.json.accessors.push(accessor);
    return this.json.accessors.length - 1;
  }

  primitive(meshIndex: number, primitiveIndex: number): NonNullable<GltfJson["meshes"]>[number]["primitives"][number] {
    const prim = this.json.meshes?.[meshIndex]?.primitives[primitiveIndex];
    if (!prim) throw new Error(`primitive ${meshIndex}/${primitiveIndex} does not exist`);
    return prim;
  }

  /** Repacks the binary chunk without accessors, buffer views and bytes no primitive, animation or skin references any more. */
  finish(): GlbData {
    return compactGlb({ json: this.json, bin: this.bin });
  }
}

export function compactGlb(glb: GlbData): GlbData {
  const json = JSON.parse(JSON.stringify(glb.json)) as GltfJson;
  const used = new Set<number>();
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
    for (const v of Object.values(p.attributes)) used.add(v);
    if (p.indices !== undefined) used.add(p.indices);
    for (const t of p.targets ?? []) for (const v of Object.values(t)) used.add(v);
  }
  for (const an of json.animations ?? []) for (const sm of an.samplers) { used.add(sm.input); used.add(sm.output); }
  for (const sk of json.skins ?? []) if (sk.inverseBindMatrices !== undefined) used.add(sk.inverseBindMatrices);
  const keepOther = new Set<number>();
  // Accessors referenced from elsewhere (images use bufferViews directly, not accessors) are left alone: only the accessor table is compacted.
  const order = [...used].sort((a, b) => a - b);
  const map = new Map(order.map((old, i) => [old, i]));
  const accessors = order.map((old) => ({ ...(json.accessors[old] as GltfJson["accessors"][number]) }));
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = map.get(p.attributes[k] as number) as number;
    if (p.indices !== undefined) p.indices = map.get(p.indices) as number;
    for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = map.get(t[k] as number) as number;
  }
  for (const an of json.animations ?? []) for (const sm of an.samplers) { sm.input = map.get(sm.input) as number; sm.output = map.get(sm.output) as number; }
  for (const sk of json.skins ?? []) if (sk.inverseBindMatrices !== undefined) sk.inverseBindMatrices = map.get(sk.inverseBindMatrices) as number;
  json.accessors = accessors;
  void keepOther;

  const parts: Buffer[] = [];
  const views: GltfJson["bufferViews"] = [];
  let offset = 0;
  const push = (bytes: Buffer, extra: Partial<GltfJson["bufferViews"][number]>): number => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    parts.push(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra });
    offset += bytes.length;
    return views.length - 1;
  };
  // Buffer views used by images (and anything else that is not an accessor) must survive: copy them first and remap.
  const viewMap = new Map<number, number>();
  const copyView = (index: number): number => {
    const known = viewMap.get(index);
    if (known !== undefined) return known;
    const bv = json.bufferViews[index] as GltfJson["bufferViews"][number];
    const start = bv.byteOffset ?? 0;
    const created = push(glb.bin.subarray(start, start + bv.byteLength), { ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), ...(bv.target ? { target: bv.target } : {}) });
    viewMap.set(index, created);
    return created;
  };
  const images = (json.images ?? []) as { bufferView?: number }[];
  for (const image of images) if (image.bufferView !== undefined) image.bufferView = copyView(image.bufferView);
  for (const a of accessors) {
    if (a.bufferView === undefined) continue;
    const bv = json.bufferViews[a.bufferView] as GltfJson["bufferViews"][number];
    if (bv.byteStride) {
      a.bufferView = copyView(a.bufferView);
    } else {
      const len = a.count * (SIZE[a.componentType] ?? 4) * (NCOMP[a.type] ?? 1);
      const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      a.bufferView = push(glb.bin.subarray(start, start + len), bv.target ? { target: bv.target } : {});
      delete a.byteOffset;
    }
  }
  json.bufferViews = views;
  const bin = Buffer.concat(parts);
  json.buffers[0] = { ...(json.buffers[0] ?? {}), byteLength: bin.length };
  return { json, bin };
}
