// Cuts the bridging triangles a skinned athlete GLB stretches in play (thigh to thigh across the crotch, hand to hip).
// For every skinned primitive, a triangle whose worst edge stretch (posed length / rest length) over sampled poses of the
// played clips exceeds `limit` is removed from the index buffer; vertices, weights, UVs and animations are untouched.
//   node tools/aura-fc/bridge-cut.mjs <in.glb> <out.glb> [--limit 1.6] [--clips Run,Sprint_Loop,...] [--samples 12] [--sliver 0.1 [--thin 0.1] [--sliver-materials shorts]] [--keep-stretch skin]
// `--sliver E` also removes rest-pose spikes from the primitives whose material matches `--sliver-materials` (default shorts; on skin and kit
// it opens holes in thighs and sleeves): triangles with an edge over E metres and an area under `--thin` of that edge squared (Meshy leaves
// thin 15 to 65 cm flaps at the hems that read as shards once a leg swings). Default clips are every animation in the file, so no pose the game can play stretches past the limit.
import { readGlb, writeGlb } from "./glb.mjs";
import { loadSkinnedMesh, triangleStretch } from "./skin.mjs";

/** Drops accessors and buffer views nothing references any more (the replaced index buffers) and repacks the binary chunk. */
export function compact(glb) {
  const json = JSON.parse(JSON.stringify(glb.json));
  const usedAcc = new Set();
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    for (const v of Object.values(p.attributes)) usedAcc.add(v);
    if (p.indices !== undefined) usedAcc.add(p.indices);
    for (const t of p.targets ?? []) for (const v of Object.values(t)) usedAcc.add(v);
  }
  for (const an of json.animations ?? []) for (const sm of an.samplers) { usedAcc.add(sm.input); usedAcc.add(sm.output); }
  for (const sk of json.skins ?? []) if (sk.inverseBindMatrices !== undefined) usedAcc.add(sk.inverseBindMatrices);
  const accOrder = [...usedAcc].sort((x, y) => x - y);
  const accMap = new Map(accOrder.map((old, i) => [old, i]));
  const accessors = accOrder.map((old) => ({ ...json.accessors[old] }));
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
    if (p.indices !== undefined) p.indices = accMap.get(p.indices);
    for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
  }
  for (const an of json.animations ?? []) for (const sm of an.samplers) { sm.input = accMap.get(sm.input); sm.output = accMap.get(sm.output); }
  for (const sk of json.skins ?? []) if (sk.inverseBindMatrices !== undefined) sk.inverseBindMatrices = accMap.get(sk.inverseBindMatrices);
  json.accessors = accessors;
  const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const parts = [];
  const views = [];
  let offset = 0;
  const push = (bytes, extra) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    parts.push(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra });
    offset += bytes.length;
    return views.length - 1;
  };
  const shared = new Map();
  for (const a of accessors) {
    if (a.bufferView === undefined) continue;
    const bv = json.bufferViews[a.bufferView];
    if (bv.byteStride) {
      if (!shared.has(a.bufferView)) shared.set(a.bufferView, push(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), { byteStride: bv.byteStride, ...(bv.target ? { target: bv.target } : {}) }));
      a.bufferView = shared.get(a.bufferView);
    } else {
      const len = a.count * SIZE[a.componentType] * NCOMP[a.type];
      const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      a.bufferView = push(glb.bin.subarray(start, start + len), bv.target ? { target: bv.target } : {});
      delete a.byteOffset;
    }
  }
  json.bufferViews = views;
  const bin = Buffer.concat(parts);
  json.buffers[0].byteLength = bin.length;
  return { json, bin };
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function triArea(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}
/** Rest-pose spike: longer than `edge` (metres) with area under `thin` of its longest edge squared (equilateral is 0.43), or 1.5x longer and under 2x `thin`, or 0.6x as long and a needle under 0.5x `thin`. */
function isSliver(mesh, t, edge, thin) {
  const A = mesh.pos[mesh.indices[t * 3]], B = mesh.pos[mesh.indices[t * 3 + 1]], C = mesh.pos[mesh.indices[t * 3 + 2]];
  const L = Math.max(dist3(A, B), dist3(B, C), dist3(C, A));
  const q = triArea(A, B, C) / (L * L);
  return (L > edge && q < thin) || (L > edge * 1.5 && q < thin * 2) || (L > edge * 0.6 && q < thin * 0.5);
}

export function cutBridges(glb, { limit = 1.6, clips, samples = 12, sliverEdge = 0, sliverThin = 0.1, sliverMaterials = /shorts/, keepMaterials = null } = {}) {
  const names = clips ?? glb.json.animations.map((a) => a.name);
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const report = [];
  json.meshes[0].primitives.forEach((prim, pi) => {
    if (prim.attributes.JOINTS_0 === undefined) return;
    const mesh = loadSkinnedMesh(glb, pi);
    const stretch = triangleStretch(glb, mesh, names, samples);
    if (keepMaterials?.test(json.materials[prim.material]?.name ?? "")) stretch.fill(0);
    const keep = [];
    let slivers = 0;
    for (let t = 0; t < stretch.length; t++) if (stretch[t] <= limit && !(sliverEdge && sliverMaterials.test(json.materials[prim.material]?.name ?? "") && isSliver(mesh, t, sliverEdge, sliverThin) && ++slivers)) keep.push(mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]);
    const removed = stretch.length - keep.length / 3;
    report.push({ primitive: pi, material: json.materials[prim.material]?.name, triangles: stretch.length, removed, slivers, maxBefore: +Math.max(...stretch).toFixed(2) });
    if (!removed) return;
    const wide = mesh.pos.length > 65535;
    const buf = Buffer.alloc(keep.length * (wide ? 4 : 2));
    keep.forEach((v, i) => (wide ? buf.writeUInt32LE(v, i * 4) : buf.writeUInt16LE(v, i * 2)));
    const pad = (4 - (bin.length % 4)) % 4;
    if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: buf.length, target: 34963 });
    bin = Buffer.concat([bin, buf]);
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: wide ? 5125 : 5123, count: keep.length, type: "SCALAR" });
    prim.indices = json.accessors.length - 1;
  });
  json.buffers[0].byteLength = bin.length;
  return { glb: compact({ json, bin }), report };
}

if (process.argv[1]?.endsWith("bridge-cut.mjs") && process.argv[3]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const r = cutBridges(readGlb(process.argv[2]), { limit: Number(arg("--limit", 1.6)), clips: arg("--clips")?.split(","), samples: Number(arg("--samples", 12)), sliverEdge: Number(arg("--sliver", 0)), sliverThin: Number(arg("--thin", 0.1)), sliverMaterials: new RegExp(arg("--sliver-materials", "shorts")), keepMaterials: arg("--keep-stretch") ? new RegExp(arg("--keep-stretch")) : null });
  console.log(JSON.stringify({ report: r.report, ...writeGlb(process.argv[3], r.glb) }));
}
