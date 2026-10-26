#!/usr/bin/env node
// Splits a textured Meshy vehicle into flat PBR region materials (veh-body, veh-trim, veh-glass, veh-tyre, veh-rim, veh-light) by
// sampling its base-colour texture at each triangle's centroid, drops the textures, and recomputes creased smooth normals so a flat
// colour does not pick up the generator's noisy per-vertex normals. Geometry, scale and origin are unchanged.
// Usage: node flatten.mjs <in.glb> <out.glb> [bodyR,G,B 0-1 linear]
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
const sharp = require("sharp");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const [inp, out, bodyArg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const tex = prim.getMaterial().getBaseColorTexture();
const { data: T, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const sample = (u, v) => {
  const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width)));
  const y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height)));
  const o = (y * info.width + x) * info.channels;
  return [T[o], T[o + 1], T[o + 2]];
};
const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices();
const bodyColor = bodyArg ? bodyArg.split(",").map(Number) : [0.82, 0.84, 0.86];
const MATERIALS = {
  body: { color: [...bodyColor, 1], metallic: 0.25, roughness: 0.38 },
  trim: { color: [0.06, 0.55, 0.5, 1], metallic: 0.2, roughness: 0.4 },
  glass: { color: [0.02, 0.035, 0.05, 1], metallic: 0.05, roughness: 0.3 },
  tyre: { color: [0.012, 0.012, 0.014, 1], metallic: 0, roughness: 0.92 },
  rim: { color: [0.55, 0.57, 0.6, 1], metallic: 0.6, roughness: 0.35 },
  light: { color: [1, 0.95, 0.8, 1], metallic: 0, roughness: 0.3, emissive: [0.9, 0.85, 0.6] }
};
const WHEELS = (process.env.WHEELS ?? "-0.621,0.146;0.722,0.146").split(";").map((w) => w.split(",").map(Number)); // [z, y] of each wheel centre
const WHEEL_R = Number(process.env.WHEEL_R ?? 0.185);
const INTERIOR_Y = Number(process.env.INTERIOR_Y ?? 0.5); // faces above this height that look inward (the cabin interior seen through the window openings) are painted as dark glass
const classify = (p, rgb, n) => {
  const [r, g, b] = rgb;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  if (Math.abs(p[0]) > 0.22) for (const [wz, wy] of WHEELS) { const d = Math.hypot(p[2] - wz, p[1] - wy); if (d < WHEEL_R) return d < 0.1 ? "rim" : "tyre"; }
  if (p[1] > INTERIOR_Y && n && n[0] * p[0] + n[2] * p[2] * 0.3 < -0.04) return "glass";
  if (luma < 75) return "glass";
  if (luma < 125 && g >= r + 12) return "glass";
  if (sat > 0.3 && g > r + 25 && b > r + 15 && luma > 110) return "trim";
  return "body";
};
const vert = (i) => { const n = nor.getElement(i, [0, 1, 0]); return { p: pos.getElement(i, [0, 0, 0]), n, uv: uv.getElement(i, [0, 0]) }; };
const nor = prim.getAttribute("NORMAL");
const mid = (a, b) => ({ p: [0, 1, 2].map((k) => (a.p[k] + b.p[k]) / 2), n: [0, 1, 2].map((k) => (a.n[k] + b.n[k]) / 2), uv: [(a.uv[0] + b.uv[0]) / 2, (a.uv[1] + b.uv[1]) / 2] });
const cls = (v) => classify(v.p, sample(v.uv[0], v.uv[1]), v.n);
const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 3);
const tris = [];
function emit(a, b, c, depth) {
  const cen = { p: [0, 1, 2].map((k) => (a.p[k] + b.p[k] + c.p[k]) / 3), n: a.n, uv: [(a.uv[0] + b.uv[0] + c.uv[0]) / 3, (a.uv[1] + b.uv[1] + c.uv[1]) / 3] };
  const cs = [cls(a), cls(b), cls(c), cls(cen)];
  const coarse = cs.includes("tyre") || cs.includes("rim");
  if (depth < MAX_DEPTH && !coarse && !(cs[0] === cs[1] && cs[1] === cs[2] && cs[2] === cs[3])) {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
    return;
  }
  tris.push([a.p, b.p, c.p, cs[3]]);
}
for (let t = 0; t < idx.getCount(); t += 3) emit(vert(idx.getScalar(t)), vert(idx.getScalar(t + 1)), vert(idx.getScalar(t + 2)), 0);
const CREASE = Math.cos((Number(process.env.CREASE ?? 55) * Math.PI) / 180);
const key = (p) => `${Math.round(p[0] * 2e4)},${Math.round(p[1] * 2e4)},${Math.round(p[2] * 2e4)}`;
const faceN = tris.map(([a, b, c]) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const area = Math.hypot(n[0], n[1], n[2]);
  return { n: area > 0 ? [n[0] / area, n[1] / area, n[2] / area] : [0, 1, 0], area };
});
const atKey = new Map();
tris.forEach((t, fi) => { for (let k = 0; k < 3; k++) { const kk = key(t[k]); (atKey.get(kk) ?? atKey.set(kk, []).get(kk)).push(fi); } });
const groups = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, { p: [], n: [], ind: [], map: new Map() }]));
tris.forEach((t, fi) => {
  const g = groups[t[3]];
  for (let k = 0; k < 3; k++) {
    const p = t[k];
    const own = faceN[fi].n;
    let nx = 0, ny = 0, nz = 0;
    for (const fj of atKey.get(key(p))) {
      const o = faceN[fj];
      if (o.n[0] * own[0] + o.n[1] * own[1] + o.n[2] * own[2] < CREASE) continue;
      nx += o.n[0] * o.area; ny += o.n[1] * o.area; nz += o.n[2] * o.area;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const nn = [nx / l, ny / l, nz / l];
    const mk = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}|${nn[0].toFixed(3)},${nn[1].toFixed(3)},${nn[2].toFixed(3)}`;
    let i = g.map.get(mk);
    if (i === undefined) { i = g.p.length / 3; g.map.set(mk, i); g.p.push(p[0], p[1], p[2]); g.n.push(nn[0], nn[1], nn[2]); }
    g.ind.push(i);
  }
});
for (const old of mesh.listPrimitives()) { mesh.removePrimitive(old); old.dispose(); }
const buffer = root.listBuffers()[0];
const counts = {};
for (const [name, g] of Object.entries(groups)) {
  if (!g.p.length) continue;
  const spec = MATERIALS[name];
  const mat = doc.createMaterial(`veh-${name}`).setBaseColorFactor(spec.color).setMetallicFactor(spec.metallic).setRoughnessFactor(spec.roughness).setDoubleSided(false);
  if (spec.emissive) mat.setEmissiveFactor(spec.emissive);
  const n = g.p.length / 3;
  const ind = n < 65535 ? new Uint16Array(g.ind) : new Uint32Array(g.ind);
  mesh.addPrimitive(doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.p)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.n)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(ind).setBuffer(buffer))
    .setMaterial(mat));
  counts[name] = g.ind.length / 3;
}
await doc.transform(prune());
await io.write(out, doc);
console.log(JSON.stringify(counts));
