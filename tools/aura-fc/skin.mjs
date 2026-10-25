// Skinned-mesh analysis and repair for the Aura FC athlete GLBs (no dependencies).
//
// The Meshy auto-rig leaves bridging triangles between body parts that move independently (left thigh to right thigh across
// the shorts seam, hand to hip). In a stride they stretch into the pale "sail" flaps seen at the hips. `triangleStretch`
// measures, for every triangle, its worst edge stretch (posed length / rest length) over sampled poses of the given clips;
// `dropStretched` writes a copy of the GLB whose index buffer omits triangles stretched past a limit.
import { readGlb, withAnimations, writeGlb, localPose, forward, qrot, clipDuration } from "./glb.mjs";

const SAMPLE_CLIPS = ["Ready", "Walk_Loop", "Run", "Sprint_Loop", "KickTap", "KickPass", "KickShot", "Jump_Loop", "Attack", "Crouch_Idle_Loop"];
const COMPONENT_SIZE = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readRows(glb, accessorIndex) {
  const a = glb.json.accessors[accessorIndex], bv = glb.json.bufferViews[a.bufferView];
  const n = COMPONENTS[a.type], sz = COMPONENT_SIZE[a.componentType];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * sz;
  const rows = [];
  for (let k = 0; k < a.count; k++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const o = off + k * stride + c * sz;
      row.push(a.componentType === 5126 ? glb.bin.readFloatLE(o) : a.componentType === 5123 ? glb.bin.readUInt16LE(o) : a.componentType === 5121 ? glb.bin.readUInt8(o) : glb.bin.readUInt32LE(o));
    }
    rows.push(row);
  }
  return { rows, componentType: a.componentType };
}

const matFrom = (p, q) => { const x = qrot(q, [1, 0, 0]), y = qrot(q, [0, 1, 0]), z = qrot(q, [0, 0, 1]); return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1]; };
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function loadSkinnedMesh(glb, primIndex = 0) {
  const { json } = glb;
  const prim = json.meshes[0].primitives[primIndex];
  const pos = readRows(glb, prim.attributes.POSITION).rows;
  const joints = readRows(glb, prim.attributes.JOINTS_0).rows;
  const wd = readRows(glb, prim.attributes.WEIGHTS_0);
  const weights = wd.rows.map((r) => (wd.componentType === 5126 ? r : r.map((x) => x / (wd.componentType === 5123 ? 65535 : 255))));
  const indices = readRows(glb, prim.indices).rows.map((r) => r[0]);
  const skin = json.skins[0];
  const ia = json.accessors[skin.inverseBindMatrices], bi = json.bufferViews[ia.bufferView], oi = (bi.byteOffset || 0) + (ia.byteOffset || 0);
  const ibm = skin.joints.map((_, k) => Array.from({ length: 16 }, (_, i) => glb.bin.readFloatLE(oi + (k * 16 + i) * 4)));
  return { prim, pos, joints, weights, indices, skin, ibm, jointNames: skin.joints.map((j) => json.nodes[j].name) };
}

/** Linear-blend-skinned vertex positions for a pose (forward-kinematics result). */
export function skinnedPositions(mesh, fk) {
  const M = mesh.skin.joints.map((jn, k) => mul(matFrom(fk.pos[jn], fk.rot[jn]), mesh.ibm[k]));
  return mesh.pos.map((v, i) => {
    const r = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[i][k];
      if (!w) continue;
      const m = M[mesh.joints[i][k]];
      r[0] += w * (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]);
      r[1] += w * (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]);
      r[2] += w * (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
    }
    return r;
  });
}

/** Worst edge stretch per triangle over `samples` poses of every clip in `clips` (Float32Array, one value per triangle). */
export function triangleStretch(glb, mesh = loadSkinnedMesh(glb), clips = SAMPLE_CLIPS, samples = 14) {
  const { indices, pos } = mesh;
  const nTri = indices.length / 3;
  const worst = new Float32Array(nTri);
  for (const name of clips) {
    const anim = glb.json.animations.find((a) => a.name === name);
    if (!anim) continue;
    const dur = clipDuration(glb, anim);
    for (let s = 0; s < samples; s++) {
      const out = skinnedPositions(mesh, forward(glb, localPose(glb, anim, (dur * s) / samples)));
      for (let t = 0; t < nTri; t++) {
        let r = 0;
        for (let e = 0; e < 3; e++) {
          const a = indices[t * 3 + e], b = indices[t * 3 + ((e + 1) % 3)];
          r = Math.max(r, dist(out[a], out[b]) / Math.max(dist(pos[a], pos[b]), 0.004));
        }
        if (r > worst[t]) worst[t] = r;
      }
    }
  }
  return worst;
}

/** Copy of the GLB without triangles whose worst stretch exceeds `limit`; returns {glb, removed, total}. */
export function dropStretched(glb, limit = 4) {
  const mesh = loadSkinnedMesh(glb);
  const stretch = triangleStretch(glb, mesh);
  const keep = [];
  for (let t = 0; t < stretch.length; t++) if (stretch[t] <= limit) keep.push(mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]);
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const wide = mesh.pos.length > 65535;
  const buf = Buffer.alloc(keep.length * (wide ? 4 : 2));
  keep.forEach((v, i) => (wide ? buf.writeUInt32LE(v, i * 4) : buf.writeUInt16LE(v, i * 2)));
  const pad = (4 - (bin.length % 4)) % 4;
  if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
  const byteOffset = bin.length;
  bin = Buffer.concat([bin, buf]);
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, target: 34963 });
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: wide ? 5125 : 5123, count: keep.length, type: "SCALAR" });
  json.meshes[0].primitives[0].indices = json.accessors.length - 1;
  json.buffers[0].byteLength = bin.length;
  return { glb: { json, bin }, removed: stretch.length - keep.length / 3, total: stretch.length, stretch };
}


/**
 * Soften the skin weights around the bridging triangles: vertices of triangles stretched past `threshold` (and `rings` rings
 * of neighbours) take `blend` of their neighbours' weights for `iterations` rounds, so the thigh-to-thigh and hand-to-hip
 * patches deform as one continuous surface instead of a plane stretched between two rigid parts. Weights outside the patch are
 * untouched; the result keeps the four strongest influences per vertex.
 */
export function smoothBridgeWeights(glb, { threshold = 1.5, rings = 4, iterations = 30, blend = 0.8 } = {}) {
  const mesh = loadSkinnedMesh(glb);
  const stretch = triangleStretch(glb, mesh);
  const nV = mesh.pos.length;
  const adj = Array.from({ length: nV }, () => new Set());
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    adj[a].add(b).add(c); adj[b].add(a).add(c); adj[c].add(a).add(b);
  }
  let region = new Set();
  for (let t = 0; t < stretch.length; t++) if (stretch[t] > threshold) for (let k = 0; k < 3; k++) region.add(mesh.indices[t * 3 + k]);
  for (let r = 0; r < rings; r++) { const next = new Set(region); for (const v of region) for (const n of adj[v]) next.add(n); region = next; }
  const dense = mesh.weights.map((w, i) => { const m = new Map(); for (let k = 0; k < 4; k++) if (w[k] > 0) m.set(mesh.joints[i][k], (m.get(mesh.joints[i][k]) || 0) + w[k]); return m; });
  for (let it = 0; it < iterations; it++) {
    const next = dense.map((m) => new Map(m));
    for (const v of region) {
      const avg = new Map(); const nb = [...adj[v]];
      for (const n of nb) for (const [j, w] of dense[n]) avg.set(j, (avg.get(j) || 0) + w / nb.length);
      const m = new Map();
      for (const [j, w] of dense[v]) m.set(j, (1 - blend) * w);
      for (const [j, w] of avg) m.set(j, (m.get(j) || 0) + blend * w);
      next[v] = m;
    }
    for (let i = 0; i < nV; i++) dense[i] = next[i];
  }
  const J = new Uint16Array(nV * 4), W = new Float32Array(nV * 4);
  for (let i = 0; i < nV; i++) {
    const top = [...dense[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
    for (let k = 0; k < 4; k++) { J[i * 4 + k] = top[k]?.[0] ?? 0; W[i * 4 + k] = top[k] ? top[k][1] / sum : 0; }
  }
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const push = (arr, componentType, bytes) => {
    const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    const off = bin.length; const buf = Buffer.alloc(arr.length * bytes);
    arr.forEach((v, i) => (componentType === 5126 ? buf.writeFloatLE(v, i * 4) : buf.writeUInt16LE(v, i * 2)));
    bin = Buffer.concat([bin, buf]);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target: 34962 });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: nV, type: "VEC4" });
    return json.accessors.length - 1;
  };
  const prim = json.meshes[0].primitives[0];
  prim.attributes.JOINTS_0 = push(J, 5123, 2);
  prim.attributes.WEIGHTS_0 = push(W, 5126, 4);
  json.buffers[0].byteLength = bin.length;
  return { glb: { json, bin }, regionVertices: region.size, vertices: nV };
}

if (process.argv[1] && process.argv[1].endsWith("skin.mjs") && process.argv[2]) {
  // usage: node tools/aura-fc/skin.mjs <in.glb> <out.glb>            smooth the skin weights around the bridging triangles
  //        node tools/aura-fc/skin.mjs <in.glb> <out.glb> --drop 4   instead drop triangles stretched past 4x
  const glb = readGlb(process.argv[2]);
  if (process.argv[4] === "--drop") {
    const r = dropStretched(glb, Number(process.argv[5] ?? 4));
    console.log(JSON.stringify({ mode: "drop", removedTriangles: r.removed, totalTriangles: r.total, ...writeGlb(process.argv[3], r.glb) }));
  } else {
    const r = smoothBridgeWeights(glb);
    console.log(JSON.stringify({ mode: "smooth", smoothedVertices: r.regionVertices, vertices: r.vertices, ...writeGlb(process.argv[3], r.glb) }));
  }
}
export { withAnimations };
