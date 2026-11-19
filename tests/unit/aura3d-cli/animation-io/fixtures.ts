/**
 * Synthetic humanoid fixtures for `aura3d animation import`: a named T-pose skeleton (metres, Y up, facing +Z, left = +X),
 * BVH and ASCII FBX writers for it, and a skinned-GLB builder (one rigid box per bone) for any joint table — the named
 * skeleton or Idol's unnamed pilot rig (tests/unit/idol-humanoid/pilotSkeleton.ts).
 */
import { PILOT_BONES } from "../../idol-humanoid/pilotSkeleton";

export type V3 = [number, number, number];
export type Q = [number, number, number, number];

export interface FixtureBone {
  readonly name: string;
  readonly parent: number;
  readonly t: V3;
  readonly r?: Q;
}

/** Named humanoid, metres, T-pose. Ends (HeadEnd, *HandEnd, *ToeEnd) are leaf joints / BVH End Sites. */
export const HUMANOID: readonly FixtureBone[] = (() => {
  const out: FixtureBone[] = [];
  const add = (name: string, parent: string | null, t: V3) => out.push({ name, parent: parent === null ? -1 : out.findIndex((b) => b.name === parent), t });
  add("Hips", null, [0, 0.95, 0]);
  add("Spine", "Hips", [0, 0.1, 0]);
  add("Chest", "Spine", [0, 0.15, 0]);
  add("Neck", "Chest", [0, 0.2, 0]);
  add("Head", "Neck", [0, 0.1, 0]);
  add("HeadEnd", "Head", [0, 0.15, 0]);
  for (const [side, s] of [["Left", 1], ["Right", -1]] as const) {
    add(`${side}Shoulder`, "Chest", [0.05 * s, 0.15, 0]);
    add(`${side}Arm`, `${side}Shoulder`, [0.1 * s, 0, 0]);
    add(`${side}ForeArm`, `${side}Arm`, [0.28 * s, 0, 0]);
    add(`${side}Hand`, `${side}ForeArm`, [0.25 * s, 0, 0]);
    add(`${side}HandEnd`, `${side}Hand`, [0.08 * s, 0, 0]);
  }
  for (const [side, s] of [["Left", 1], ["Right", -1]] as const) {
    add(`${side}UpLeg`, "Hips", [0.09 * s, -0.05, 0]);
    add(`${side}Leg`, `${side}UpLeg`, [0, -0.42, 0]);
    add(`${side}Foot`, `${side}Leg`, [0, -0.42, 0]);
    add(`${side}ToeBase`, `${side}Foot`, [0, -0.05, 0.12]);
    add(`${side}ToeEnd`, `${side}ToeBase`, [0, 0, 0.05]);
  }
  return out;
})();

/** Idol pilot rig (28 unnamed bones, raw output facing +X) as fixture bones. */
export const PILOT: readonly FixtureBone[] = (() => {
  const parent = new Array<number>(PILOT_BONES.length).fill(-1);
  PILOT_BONES.forEach(([children], i) => children.forEach((c) => { parent[c] = i; }));
  return PILOT_BONES.map(([, t, r], i) => ({ name: `bone_${i}`, parent: parent[i]!, t: [t[0]!, t[1]!, t[2]!] as V3, r: [r[0]!, r[1]!, r[2]!, r[3]!] as Q }));
})();

export const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qaxis = (axis: V3, deg: number): Q => { const h = (deg * Math.PI) / 360, l = Math.hypot(...axis); return [(axis[0] / l) * Math.sin(h), (axis[1] / l) * Math.sin(h), (axis[2] / l) * Math.sin(h), Math.cos(h)]; };
export function qrot(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Rotate a whole skeleton about Y (so it faces another axis); only root/parent-relative offsets turn. */
export function turned(bones: readonly FixtureBone[], deg: number): FixtureBone[] {
  const q = qaxis([0, 1, 0], deg);
  return bones.map((b) => ({ ...b, t: qrot(q, b.t) }));
}

/** Euler (degrees) per joint per frame; `rot[frame][joint]` = [z, x, y] applied in BVH ZXY channel order. */
export type BvhRot = Record<string, [number, number, number]>;

/** A BVH (centimetres) of `bones` with per-frame ZXY Euler rotations (missing = 0) and a root position track. */
export function bvhText(bones: readonly FixtureBone[], frames: readonly BvhRot[], fps = 30, rootTravel: V3 = [0, 0, 0]): string {
  const cm = (v: V3) => v.map((x) => (x * 100).toFixed(4)).join(" ");
  const kids = bones.map((_, i) => bones.map((b, j) => (b.parent === i ? j : -1)).filter((j) => j >= 0));
  const isEnd = (i: number) => kids[i]!.length === 0;
  const order: number[] = [];
  const lines: string[] = ["HIERARCHY"];
  const emit = (i: number, depth: number) => {
    const pad = "  ".repeat(depth);
    const b = bones[i]!;
    if (isEnd(i)) { lines.push(`${pad}End Site`, `${pad}{`, `${pad}  OFFSET ${cm(b.t)}`, `${pad}}`); return; }
    order.push(i);
    lines.push(`${pad}${depth === 0 ? "ROOT" : "JOINT"} ${b.name}`, `${pad}{`, `${pad}  OFFSET ${cm(depth === 0 ? [0, 0, 0] : b.t)}`,
      `${pad}  CHANNELS ${depth === 0 ? "6 Xposition Yposition Zposition " : "3 "}Zrotation Xrotation Yrotation`);
    for (const k of kids[i]!) emit(k, depth + 1);
    lines.push(`${pad}}`);
  };
  emit(0, 0);
  lines.push("MOTION", `Frames: ${frames.length}`, `Frame Time: ${(1 / fps).toFixed(6)}`);
  frames.forEach((fr, f) => {
    const u = frames.length > 1 ? f / (frames.length - 1) : 0;
    const vals: number[] = [];
    for (const i of order) {
      const b = bones[i]!;
      if (b.parent < 0) vals.push(...[b.t[0] + rootTravel[0] * u, b.t[1] + rootTravel[1] * u, b.t[2] + rootTravel[2] * u].map((x) => x * 100));
      const [z, x, y] = fr[b.name] ?? [0, 0, 0];
      vals.push(z, x, y);
    }
    lines.push(vals.map((v) => v.toFixed(4)).join(" "));
  });
  return `${lines.join("\n")}\n`;
}

/** An ASCII FBX 7.4 skeleton (LimbNodes, centimetres) with one AnimationStack of Euler XYZ rotation curves. */
export function fbxText(bones: readonly FixtureBone[], keys: readonly { readonly time: number; readonly rot: BvhRot }[], stack = "Take 001"): string {
  const id = (i: number) => 1000 + i;
  const objects: string[] = [];
  const conns: string[] = [];
  bones.forEach((b, i) => {
    const t = b.t.map((x) => (x * 100).toFixed(4)).join(",");
    objects.push(` Model: ${id(i)}, "Model::${b.name}", "LimbNode" {\n  Properties70: {\n   P: "Lcl Translation", "Lcl Translation", "", "A", ${t}\n  }\n }`);
    if (b.parent >= 0) conns.push(` C: "OO", ${id(i)},${id(b.parent)}`);
  });
  objects.push(` AnimationStack: 5000, "AnimStack::${stack}", "" { }`, ` AnimationLayer: 5001, "AnimLayer::Base", "" { }`);
  conns.push(` C: "OO", 5001,5000`);
  const animated = [...new Set(keys.flatMap((k) => Object.keys(k.rot)))];
  let next = 6000;
  const ticks = (s: number) => Math.round(s * 46186158000);
  for (const name of animated) {
    const bone = bones.findIndex((b) => b.name === name);
    const cn = next++;
    objects.push(` AnimationCurveNode: ${cn}, "AnimCurveNode::R", "" { }`);
    conns.push(` C: "OO", ${cn},5001`, ` C: "OP", ${cn},${id(bone)}, "Lcl Rotation"`);
    for (const [axis, comp] of [["X", 1], ["Y", 2], ["Z", 0]] as const) {
      const cv = next++;
      const times = keys.map((k) => ticks(k.time)).join(",");
      const values = keys.map((k) => (k.rot[name]?.[comp] ?? 0).toFixed(4)).join(",");
      objects.push(` AnimationCurve: ${cv}, "AnimCurve::", "" {\n  KeyTime: *${keys.length} { a: ${times} }\n  KeyValueFloat: *${keys.length} { a: ${values} }\n }`);
      conns.push(` C: "OP", ${cv},${cn}, "d|${axis}"`);
    }
  }
  return `FBXHeaderExtension: {\n FBXVersion: 7400\n}\nGlobalSettings: {\n Properties70: {\n  P: "UnitScaleFactor", "double", "Number", "", 1\n }\n}\nObjects: {\n${objects.join("\n")}\n}\nConnections: {\n${conns.join("\n")}\n}\n`;
}

export interface RigOptions {
  /** Wrap the skeleton (and mesh) under an `auraRoot` with this yaw (degrees), uniform scale and translation. */
  readonly root?: { readonly yaw?: number; readonly scale?: number; readonly translation?: V3 };
  /** Clips already in the file (name -> duration), animating the first bone's rotation. */
  readonly clips?: Readonly<Record<string, number>>;
}

/** A skinned GLB of `bones`: one rigid box per bone (bone -> first child), weight 1, inverse bind matrices from the rest pose. */
export function buildRigGlb(bones: readonly FixtureBone[], opts: RigOptions = {}): Buffer {
  const n = bones.length;
  const rootQ = qaxis([0, 1, 0], opts.root?.yaw ?? 0), rootS = opts.root?.scale ?? 1, rootT = opts.root?.translation ?? [0, 0, 0];
  const wrap = opts.root !== undefined;
  // world rest transforms
  const W: { t: V3; r: Q; s: number }[] = [];
  bones.forEach((b, i) => {
    const p = b.parent >= 0 ? W[b.parent]! : wrap ? { t: rootT, r: rootQ, s: rootS } : { t: [0, 0, 0] as V3, r: [0, 0, 0, 1] as Q, s: 1 };
    const v = qrot(p.r, b.t);
    W[i] = { t: [p.t[0] + v[0] * p.s, p.t[1] + v[1] * p.s, p.t[2] + v[2] * p.s], r: qmul(p.r, b.r ?? [0, 0, 0, 1]), s: p.s };
  });
  const mat = (x: { t: V3; r: Q; s: number }): number[] => {
    const [qx, qy, qz, qw] = x.r, s = x.s;
    return [
      (1 - 2 * (qy * qy + qz * qz)) * s, 2 * (qx * qy + qz * qw) * s, 2 * (qx * qz - qy * qw) * s, 0,
      2 * (qx * qy - qz * qw) * s, (1 - 2 * (qx * qx + qz * qz)) * s, 2 * (qy * qz + qx * qw) * s, 0,
      2 * (qx * qz + qy * qw) * s, 2 * (qy * qz - qx * qw) * s, (1 - 2 * (qx * qx + qy * qy)) * s, 0,
      x.t[0], x.t[1], x.t[2], 1
    ];
  };
  const inv = (x: { t: V3; r: Q; s: number }): number[] => {
    const ri: Q = [-x.r[0], -x.r[1], -x.r[2], x.r[3]];
    const t = qrot(ri, [-x.t[0] / x.s, -x.t[1] / x.s, -x.t[2] / x.s]);
    return mat({ t, r: ri, s: 1 / x.s }).map((v, k) => (k >= 12 && k < 15 ? t[k - 12]! : v));
  };
  // Boxes
  const pos: number[] = [], jnt: number[] = [], wgt: number[] = [], idx: number[] = [];
  bones.forEach((b, i) => {
    const child = bones.findIndex((c) => c.parent === i);
    const a = W[i]!.t, e = child >= 0 ? W[child]!.t : a;
    const len = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    if (len < 1e-4) return;
    const r = Math.max(0.01, len * 0.12) * (wrap ? 1 : 1);
    const base = pos.length / 3;
    for (const end of [a, e]) for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      // box around the segment, padded on the two axes most perpendicular to it
      const d: V3 = [(e[0] - a[0]) / len, (e[1] - a[1]) / len, (e[2] - a[2]) / len];
      const up: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u: V3 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
      const ul = Math.hypot(...u); const uu: V3 = [u[0] / ul, u[1] / ul, u[2] / ul];
      const w: V3 = [d[1] * uu[2] - d[2] * uu[1], d[2] * uu[0] - d[0] * uu[2], d[0] * uu[1] - d[1] * uu[0]];
      pos.push(end[0] + (uu[0] * dx + w[0] * dz) * r, end[1] + (uu[1] * dx + w[1] * dz) * r, end[2] + (uu[2] * dx + w[2] * dz) * r);
      jnt.push(i, 0, 0, 0); wgt.push(1, 0, 0, 0);
    }
    const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    for (const [p, q, s, t] of quads) idx.push(base + p!, base + q!, base + s!, base + p!, base + s!, base + t!);
  });
  const chunks: Buffer[] = [];
  const views: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  let off = 0;
  const push = (buf: Buffer, acc: Record<string, unknown>) => {
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
    chunks.push(buf); off += buf.length;
    accessors.push({ bufferView: views.length - 1, ...acc });
    return accessors.length - 1;
  };
  const f32 = (a: number[]) => Buffer.from(new Float32Array(a).buffer);
  const vmin = [0, 1, 2].map((k) => Math.min(...pos.filter((_, j) => j % 3 === k)));
  const vmax = [0, 1, 2].map((k) => Math.max(...pos.filter((_, j) => j % 3 === k)));
  const P = push(f32(pos), { componentType: 5126, count: pos.length / 3, type: "VEC3", min: vmin, max: vmax });
  const J = push(Buffer.from(new Uint16Array(jnt).buffer), { componentType: 5123, count: jnt.length / 4, type: "VEC4" });
  const Wt = push(f32(wgt), { componentType: 5126, count: wgt.length / 4, type: "VEC4" });
  const I = push(Buffer.from(new Uint32Array(idx).buffer), { componentType: 5125, count: idx.length, type: "SCALAR" });
  const IBM = push(f32(W.flatMap(inv)), { componentType: 5126, count: n, type: "MAT4" });
  const off0 = wrap ? 1 : 0;
  const nodes: Record<string, unknown>[] = [];
  if (wrap) nodes.push({ name: "auraRoot", rotation: rootQ, scale: [rootS, rootS, rootS], translation: rootT, children: [1] });
  bones.forEach((b, i) => {
    const children = bones.map((c, j) => (c.parent === i ? j + off0 : -1)).filter((j) => j >= 0);
    nodes.push({ name: b.name, translation: b.t, ...(b.r ? { rotation: b.r } : {}), ...(children.length ? { children } : {}) });
  });
  nodes.push({ name: "body", mesh: 0, skin: 0 });
  const animations: Record<string, unknown>[] = [];
  for (const [name, dur] of Object.entries(opts.clips ?? {})) {
    const input = push(f32([0, dur]), { componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [dur] });
    const r0 = bones[1]?.r ?? [0, 0, 0, 1];
    const output = push(f32([...r0, ...r0]), { componentType: 5126, count: 2, type: "VEC4" });
    animations.push({ name, samplers: [{ input, output, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: off0 + 1, path: "rotation" } }] });
  }
  const json = {
    asset: { version: "2.0", generator: "aura3d animation-io test fixture" },
    scene: 0,
    scenes: [{ nodes: wrap ? [0, nodes.length - 1] : [0, nodes.length - 1] }],
    nodes,
    meshes: [{ name: "body", primitives: [{ attributes: { POSITION: P, JOINTS_0: J, WEIGHTS_0: Wt }, indices: I, mode: 4 }] }],
    skins: [{ joints: bones.map((_, i) => i + off0), inverseBindMatrices: IBM }],
    accessors, bufferViews: views, buffers: [{ byteLength: off }],
    ...(animations.length ? { animations } : {})
  };
  let text = Buffer.from(JSON.stringify(json));
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  let bin = Buffer.concat(chunks);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + text.length + 8 + bin.length, 8);
  head.writeUInt32LE(text.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, text, bh, bin]);
}
