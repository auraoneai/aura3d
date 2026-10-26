/**
 * Dependency-free glTF/GLB access for the skin tools: accessor reads, node hierarchy, animation sampling, forward
 * kinematics and linear-blend skinning. Rows are plain number arrays; models are small enough that this stays fast.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseGlbChunks } from "../admission/glb.js";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
/** Column-major 4x4. */
export type Mat4 = number[];

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}
export interface GltfAnimation {
  name?: string;
  samplers: { input: number; output: number; interpolation?: string }[];
  channels: { sampler: number; target: { node?: number; path: string } }[];
}
export interface GltfJson {
  asset?: { generator?: string; version?: string };
  accessors: { bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string; min?: number[]; max?: number[]; sparse?: unknown }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  buffers: { byteLength: number; uri?: string }[];
  nodes: GltfNode[];
  skins?: { joints: number[]; inverseBindMatrices?: number; skeleton?: number; name?: string }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number; targets?: Record<string, number>[] }[] }[];
  materials?: { name?: string }[];
  animations?: GltfAnimation[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  [key: string]: unknown;
}
export interface GlbData {
  json: GltfJson;
  bin: Buffer;
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function parseGlb(buffer: Buffer): GlbData {
  const { json, bin } = parseGlbChunks(buffer);
  return { json: json as unknown as GltfJson, bin: Buffer.from(bin ?? Buffer.alloc(0)) };
}

export function readGlbFile(path: string): GlbData {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a binary glTF (.glb). Skin tools read .glb files.`);
  return parseGlb(buffer);
}

export function writeGlbFile(path: string, glb: GlbData): { bytes: number } {
  let js = Buffer.from(JSON.stringify(glb.json), "utf8");
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat([glb.bin, Buffer.alloc((4 - (glb.bin.length % 4)) % 4)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(js.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([head, jh, js, bh, bin]);
  writeFileSync(path, out);
  return { bytes: out.length };
}

/** Reads an accessor into rows of numbers (normalized integer accessors are converted to floats). */
export function readAccessor(glb: GlbData, index: number): { rows: number[][]; componentType: number; count: number; components: number } {
  const accessor = glb.json.accessors[index];
  if (!accessor) throw new Error(`accessor ${index} does not exist`);
  const components = COMPONENTS[accessor.type] ?? 1;
  const size = COMPONENT_SIZE[accessor.componentType] ?? 4;
  const rows: number[][] = [];
  if (accessor.bufferView === undefined) {
    for (let k = 0; k < accessor.count; k += 1) rows.push(new Array<number>(components).fill(0));
    return { rows, componentType: accessor.componentType, count: accessor.count, components };
  }
  const view = glb.json.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`bufferView ${accessor.bufferView} does not exist`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * size;
  const normalized = accessor.normalized === true;
  for (let k = 0; k < accessor.count; k += 1) {
    const row: number[] = [];
    for (let c = 0; c < components; c += 1) {
      const at = offset + k * stride + c * size;
      let value: number;
      switch (accessor.componentType) {
        case 5126: value = glb.bin.readFloatLE(at); break;
        case 5123: value = glb.bin.readUInt16LE(at); if (normalized) value /= 65535; break;
        case 5121: value = glb.bin.readUInt8(at); if (normalized) value /= 255; break;
        case 5125: value = glb.bin.readUInt32LE(at); break;
        case 5122: value = glb.bin.readInt16LE(at); if (normalized) value = Math.max(value / 32767, -1); break;
        case 5120: value = glb.bin.readInt8(at); if (normalized) value = Math.max(value / 127, -1); break;
        default: throw new Error(`unsupported accessor componentType ${accessor.componentType}`);
      }
      row.push(value);
    }
    rows.push(row);
  }
  return { rows, componentType: accessor.componentType, count: accessor.count, components };
}

// ---- quaternion / matrix helpers (glTF xyzw, column-major) ----
export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qrot(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const s = q[3];
  const c1: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const t: Vec3 = [2 * c1[0], 2 * c1[1], 2 * c1[2]];
  const c2: Vec3 = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  return [v[0] + s * t[0] + c2[0], v[1] + s * t[1] + c2[1], v[2] + s * t[2] + c2[2]];
}
/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export function qalign(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    const ax: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const c: Vec3 = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]];
    const l = Math.hypot(c[0], c[1], c[2]);
    return [c[0] / l, c[1] / l, c[2] / l, 0];
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d);
  const s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s;
  const w2 = Math.sin(t * th) / s;
  return [a[0] * w1 + bb[0] * w2, a[1] * w1 + bb[1] * w2, a[2] * w1 + bb[2] * w2, a[3] * w1 + bb[3] * w2];
}
export function composeTrs(t: number[], r: number[], s: number[]): Mat4 {
  const [x, y, z, w] = r as Quat;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0] ?? 1, sy = s[1] ?? 1, sz = s[2] ?? 1;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0] ?? 0, t[1] ?? 0, t[2] ?? 0, 1
  ];
}
export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
    o[c * 4 + r] = sum;
  }
  return o;
}
export const transformPoint = (m: Mat4, p: Vec3): Vec3 => [
  (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0),
  (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0),
  (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0)
];

// ---- hierarchy, poses, forward kinematics ----
export interface Hierarchy {
  nodes: GltfNode[];
  names: string[];
  parent: number[];
  /** Node index by name (first match). */
  id(name: string): number;
}
export function buildHierarchy(glb: GlbData): Hierarchy {
  const nodes = glb.json.nodes ?? [];
  const names = nodes.map((n, i) => n.name ?? `node${i}`);
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { parent[c] = i; }));
  return { nodes, names, parent, id: (name) => names.indexOf(name) };
}

export interface Trs { t: number[]; r: number[]; s: number[] }
export function restTrs(node: GltfNode): Trs {
  if (node.matrix) {
    const m = node.matrix;
    const sx = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0) || 1;
    const sy = Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0) || 1;
    const sz = Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0) || 1;
    const r00 = (m[0] ?? 0) / sx, r10 = (m[1] ?? 0) / sx, r20 = (m[2] ?? 0) / sx;
    const r01 = (m[4] ?? 0) / sy, r11 = (m[5] ?? 0) / sy, r21 = (m[6] ?? 0) / sy;
    const r02 = (m[8] ?? 0) / sz, r12 = (m[9] ?? 0) / sz, r22 = (m[10] ?? 0) / sz;
    const trace = r00 + r11 + r22;
    let q: Quat;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      q = [(r21 - r12) / s, (r02 - r20) / s, (r10 - r01) / s, 0.25 * s];
    } else if (r00 > r11 && r00 > r22) {
      const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
      q = [0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s];
    } else if (r11 > r22) {
      const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
      q = [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s];
    } else {
      const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
      q = [(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s];
    }
    return { t: [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0], r: qnorm(q), s: [sx, sy, sz] };
  }
  return { t: [...(node.translation ?? [0, 0, 0])], r: [...(node.rotation ?? [0, 0, 0, 1])], s: [...(node.scale ?? [1, 1, 1])] };
}

interface SamplerData { times: number[]; values: number[][]; interpolation: string }
const samplerCache = new WeakMap<GlbData, Map<string, SamplerData>>();
function samplerData(glb: GlbData, anim: GltfAnimation, samplerIndex: number): SamplerData {
  let cache = samplerCache.get(glb);
  if (!cache) { cache = new Map(); samplerCache.set(glb, cache); }
  const sampler = anim.samplers[samplerIndex];
  if (!sampler) throw new Error(`animation sampler ${samplerIndex} missing`);
  const key = `${sampler.input}:${sampler.output}`;
  let data = cache.get(key);
  if (!data) {
    data = { times: readAccessor(glb, sampler.input).rows.map((r) => r[0] ?? 0), values: readAccessor(glb, sampler.output).rows, interpolation: sampler.interpolation ?? "LINEAR" };
    cache.set(key, data);
  }
  return data;
}

export function clipDuration(glb: GlbData, anim: GltfAnimation): number {
  let max = 0;
  for (const sampler of anim.samplers) {
    const times = samplerData(glb, anim, anim.samplers.indexOf(sampler)).times;
    max = Math.max(max, times[times.length - 1] ?? 0);
  }
  return max;
}

function sampleChannel(data: SamplerData, path: string, t: number): number[] {
  const { times, values, interpolation } = data;
  const cubic = interpolation === "CUBICSPLINE";
  const pick = (i: number): number[] => (cubic ? values[i * 3 + 1] : values[i]) ?? [];
  let i = 0;
  while (i < times.length - 1 && (times[i + 1] ?? 0) <= t) i += 1;
  const j = Math.min(i + 1, times.length - 1);
  const a = pick(i);
  if (interpolation === "STEP" || j === i) return a;
  const t0 = times[i] ?? 0, t1 = times[j] ?? 0;
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const b = pick(j);
  if (path === "rotation") return slerp(a as Quat, b as Quat, u);
  return a.map((x, k) => x + ((b[k] ?? x) - x) * u);
}

/** Local TRS for every node at time t of an animation (rest pose where untracked). */
export function localPose(glb: GlbData, anim: GltfAnimation | null, t: number, hierarchy = buildHierarchy(glb)): Trs[] {
  const trs = hierarchy.nodes.map(restTrs);
  if (anim) {
    for (const channel of anim.channels) {
      const node = channel.target.node;
      if (node === undefined || !trs[node]) continue;
      const path = channel.target.path;
      if (path !== "translation" && path !== "rotation" && path !== "scale") continue;
      const value = sampleChannel(samplerData(glb, anim, channel.sampler), path, t);
      const slot = trs[node];
      if (path === "translation") slot.t = value;
      else if (path === "rotation") slot.r = value;
      else slot.s = value;
    }
  }
  return trs;
}

export interface WorldPose { world: Mat4[]; pos: Vec3[] }
/** Forward kinematics: world matrix and position per node. */
export function forward(trs: Trs[], hierarchy: Hierarchy): WorldPose {
  const world: Mat4[] = new Array<Mat4>(trs.length);
  const visit = (i: number): Mat4 => {
    const cached = world[i];
    if (cached) return cached;
    const local = composeTrs(trs[i]?.t ?? [0, 0, 0], trs[i]?.r ?? [0, 0, 0, 1], trs[i]?.s ?? [1, 1, 1]);
    const p = hierarchy.parent[i] ?? -1;
    const m = p < 0 ? local : mat4Mul(visit(p), local);
    world[i] = m;
    return m;
  };
  for (let i = 0; i < trs.length; i += 1) visit(i);
  return { world, pos: world.map((m) => [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0] as Vec3) };
}

// ---- skinned meshes ----
export interface SkinnedPrimitive {
  meshIndex: number;
  primitiveIndex: number;
  skinIndex: number;
  materialName: string;
  pos: Vec3[];
  joints: number[][];
  weights: number[][];
  indices: number[];
}
export interface SkinInfo {
  index: number;
  joints: number[];
  ibm: Mat4[];
  jointNames: string[];
  primitives: SkinnedPrimitive[];
}

/** Finds every skinned triangle primitive and its skin data (nodes with both `mesh` and `skin`). */
export function loadSkins(glb: GlbData, hierarchy = buildHierarchy(glb)): SkinInfo[] {
  const out = new Map<number, SkinInfo>();
  const seenMeshSkin = new Set<string>();
  for (const node of hierarchy.nodes) {
    if (node.mesh === undefined || node.skin === undefined) continue;
    const key = `${node.mesh}:${node.skin}`;
    if (seenMeshSkin.has(key)) continue;
    seenMeshSkin.add(key);
    const skin = glb.json.skins?.[node.skin];
    const mesh = glb.json.meshes?.[node.mesh];
    if (!skin || !mesh) continue;
    let info = out.get(node.skin);
    if (!info) {
      const ibm: Mat4[] = skin.inverseBindMatrices !== undefined
        ? readAccessor(glb, skin.inverseBindMatrices).rows
        : skin.joints.map(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      info = { index: node.skin, joints: skin.joints, ibm, jointNames: skin.joints.map((j) => hierarchy.names[j] ?? `joint${j}`), primitives: [] };
      out.set(node.skin, info);
    }
    mesh.primitives.forEach((prim, primitiveIndex) => {
      if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined || prim.attributes.JOINTS_0 === undefined || prim.attributes.WEIGHTS_0 === undefined) return;
      const pos = readAccessor(glb, prim.attributes.POSITION).rows as Vec3[];
      const joints = readAccessor(glb, prim.attributes.JOINTS_0).rows;
      const weights = readAccessor(glb, prim.attributes.WEIGHTS_0).rows;
      const indices = prim.indices !== undefined ? readAccessor(glb, prim.indices).rows.map((r) => r[0] ?? 0) : pos.map((_, i) => i);
      info.primitives.push({
        meshIndex: node.mesh as number,
        primitiveIndex,
        skinIndex: node.skin as number,
        materialName: prim.material !== undefined ? glb.json.materials?.[prim.material]?.name ?? `material${prim.material}` : "default",
        pos, joints, weights, indices
      });
    });
  }
  return [...out.values()];
}

/** Linear-blend-skinned vertex positions for a world pose. */
export function skinnedPositions(skin: SkinInfo, prim: SkinnedPrimitive, pose: WorldPose): Vec3[] {
  const matrices = skin.joints.map((joint, k) => mat4Mul(pose.world[joint] ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], skin.ibm[k] ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  return prim.pos.map((v, i) => {
    const r: Vec3 = [0, 0, 0];
    const w = prim.weights[i] ?? [];
    const j = prim.joints[i] ?? [];
    for (let k = 0; k < 4; k += 1) {
      const wk = w[k] ?? 0;
      if (!wk) continue;
      const m = matrices[j[k] ?? 0];
      if (!m) continue;
      const p = transformPoint(m, v);
      r[0] += wk * p[0]; r[1] += wk * p[1]; r[2] += wk * p[2];
    }
    return r;
  });
}

export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vlen = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const vdist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Bind-pose world position of every joint of a skin: the translation of the inverse of its inverse-bind matrix. */
export function jointBindPositions(skin: SkinInfo): Vec3[] {
  return skin.ibm.map((m) => {
    const a = m[0] ?? 1, b = m[4] ?? 0, c = m[8] ?? 0, d = m[1] ?? 0, e = m[5] ?? 1, f = m[9] ?? 0, g = m[2] ?? 0, h = m[6] ?? 0, i = m[10] ?? 1;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return [0, 0, 0] as Vec3;
    const inv = [
      (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
      (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
      (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det
    ];
    const t: Vec3 = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
    return [-(inv[0]! * t[0] + inv[1]! * t[1] + inv[2]! * t[2]), -(inv[3]! * t[0] + inv[4]! * t[1] + inv[5]! * t[2]), -(inv[6]! * t[0] + inv[7]! * t[1] + inv[8]! * t[2])] as Vec3;
  });
}
