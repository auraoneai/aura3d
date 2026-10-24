// Minimal GLB reader / skeleton FK / animation writer for the Aura FC athlete rigs (no dependencies).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export const qaxis = (axis, angle) => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; };
export const qrot = (q, v) => {
  const u = [q[0], q[1], q[2]], s = q[3];
  const c1 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const t = [2 * c1[0], 2 * c1[1], 2 * c1[2]];
  const c2 = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  return [v[0] + s * t[0] + c2[0], v[1] + s * t[1] + c2[1], v[2] + s * t[2] + c2[2]];
};
/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export function qalign(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]]; const l = Math.hypot(...c); return [c[0] / l, c[1] / l, c[2] / l, 0]; }
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((x) => -x); d = -d; }
  if (d > 0.9995) return qnorm(a.map((x, i) => x + (b[i] - x) * t));
  const th = Math.acos(d), s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return a.map((x, i) => x * w1 + b[i] * w2);
}

export function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString("utf8"));
  const binLen = b.readUInt32LE(20 + jl);
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + binLen);
  return { json, bin: Buffer.from(bin) };
}

export function accessor(glb, i) {
  const a = glb.json.accessors[i];
  const bv = glb.json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const data = new Float32Array(a.count * n);
  for (let k = 0; k < data.length; k++) data[k] = glb.bin.readFloatLE(off + k * 4);
  return { data, n, count: a.count };
}

export function nodeIndex(glb) {
  const nodes = glb.json.nodes;
  const names = nodes.map((n) => n.name);
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((nd, i) => (nd.children || []).forEach((c) => { parent[c] = i; }));
  return { nodes, names, parent, id: (name) => names.indexOf(name) };
}

export function clipDuration(glb, anim) {
  return Math.max(...anim.samplers.map((s) => accessor(glb, s.input).data.at(-1)));
}

function sampleTrack(inp, out, n, t) {
  const times = inp.data;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1);
  const u = times[j] > times[i] ? Math.min(1, Math.max(0, (t - times[i]) / (times[j] - times[i]))) : 0;
  const A = Array.from(out.data.slice(i * n, i * n + n)), B = Array.from(out.data.slice(j * n, j * n + n));
  return n === 4 ? slerp(A, B, u) : A.map((x, k) => x + (B[k] - x) * u);
}

/** Local TRS for every node at time t of a glTF animation (rest pose where untracked). */
export function localPose(glb, anim, t) {
  const ni = nodeIndex(glb);
  const trs = ni.nodes.map((n) => ({ t: [...(n.translation || [0, 0, 0])], r: [...(n.rotation || [0, 0, 0, 1])] }));
  if (anim) {
    for (const ch of anim.channels) {
      const s = anim.samplers[ch.sampler];
      const v = sampleTrack(accessor(glb, s.input), accessor(glb, s.output), ch.target.path === "rotation" ? 4 : 3, t);
      if (ch.target.path === "translation") trs[ch.target.node].t = v;
      else if (ch.target.path === "rotation") trs[ch.target.node].r = v;
    }
  }
  return trs;
}

/** Forward kinematics (unit scale): world position + rotation per node. */
export function forward(glb, trs) {
  const ni = nodeIndex(glb);
  const pos = new Array(ni.nodes.length), rot = new Array(ni.nodes.length);
  const visit = (i) => {
    if (pos[i]) return;
    const p = ni.parent[i];
    if (p < 0) { pos[i] = [...trs[i].t]; rot[i] = [...trs[i].r]; return; }
    visit(p);
    const o = qrot(rot[p], trs[i].t);
    pos[i] = [pos[p][0] + o[0], pos[p][1] + o[1], pos[p][2] + o[2]];
    rot[i] = qmul(rot[p], trs[i].r);
  };
  for (let i = 0; i < ni.nodes.length; i++) visit(i);
  return { pos, rot, ...ni };
}

/** Append LINEAR animations to a GLB (returns a new {json, bin}). */
export function withAnimations(glb, clips) {
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const pushBuffer = (floats, count, type, extra = {}) => {
    const pad = (4 - (bin.length % 4)) % 4;
    if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    const buf = Buffer.alloc(floats.length * 4);
    floats.forEach((v, k) => buf.writeFloatLE(v, k * 4));
    const byteOffset = bin.length;
    bin = Buffer.concat([bin, buf]);
    json.bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, count, type, ...extra });
    return json.accessors.length - 1;
  };
  const existing = new Set((json.animations || []).map((a) => a.name));
  json.animations ||= [];
  for (const clip of clips) {
    if (existing.has(clip.name)) json.animations.splice(json.animations.findIndex((a) => a.name === clip.name), 1);
    const input = pushBuffer(clip.times, clip.times.length, "SCALAR", { min: [clip.times[0]], max: [clip.times.at(-1)] });
    const samplers = [], channels = [];
    for (const tr of clip.tracks) {
      const out = pushBuffer(tr.values.flat(), tr.values.length, tr.path === "rotation" ? "VEC4" : "VEC3");
      samplers.push({ input, output: out, interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: tr.node, path: tr.path } });
    }
    json.animations.push({ name: clip.name, samplers, channels });
  }
  json.buffers[0].byteLength = bin.length;
  return { json, bin };
}

export function writeGlb(path, glb) {
  let js = Buffer.from(JSON.stringify(glb.json), "utf8");
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  let bin = glb.bin;
  bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([head, jh, js, bh, bin]);
  writeFileSync(path, out);
  return { bytes: out.length, sha256: createHash("sha256").update(out).digest("hex") };
}
