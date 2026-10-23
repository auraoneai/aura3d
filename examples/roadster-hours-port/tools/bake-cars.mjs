#!/usr/bin/env node
// Bakes CC0 car GLBs (assets/library/vehicles/road, Quaternius + Kenney, see PORTING-NOTES.md) into compact
// material-group geometry (paint / trim / glass / lights) normalised into the unit box [-0.5, 0.5]^3, with the
// vehicle's front at -Z (the sim's convention: cabs lead at negative z). Output: ../cars.baked.ts
// Usage: node examples/roadster-hours-port/tools/bake-cars.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const SOURCES = [
  { key: "sportsCar", file: "assets/library/vehicles/road/quaternius-sports-car.glb", paint: [0] },
  { key: "sedan", file: "assets/library/vehicles/road/quaternius-car.glb", paint: [0] },
  { key: "taxi", file: "assets/library/vehicles/road/quaternius-taxi.glb", paint: [0] },
  { key: "hatch", file: "assets/library/vehicles/road/kenney-race-car-red.glb", paint: [1] }
];

function parseGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let off = 12, json, bin;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin };
}

const COMP = { 5120: [1, Int8Array], 5121: [1, Uint8Array], 5122: [2, Int16Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(g, index) {
  const a = g.json.accessors[index], view = g.json.bufferViews[a.bufferView];
  const [size, Arr] = COMP[a.componentType], n = NCOMP[a.type], stride = view.byteStride || size * n;
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
    const o = base + i * stride + c * size;
    let v;
    switch (a.componentType) {
      case 5126: v = dv.getFloat32(o, true); break;
      case 5125: v = dv.getUint32(o, true); break;
      case 5123: v = dv.getUint16(o, true); break;
      case 5122: v = dv.getInt16(o, true); break;
      case 5121: v = dv.getUint8(o); break;
      default: v = dv.getInt8(o);
    }
    out[i * n + c] = v;
  }
  void Arr;
  return out;
}

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0, (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0, (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
}

const GROUPS = ["paint", "trim", "glass", "head", "tail"];
function classify(materialName, materialIndex, paintIdx) {
  const n = (materialName || "").toLowerCase();
  if (paintIdx.includes(materialIndex)) return "paint";
  if (/window|glass/.test(n)) return "glass";
  if (/head/.test(n)) return "head";
  if (/tail|brake/.test(n)) return "tail";
  return "trim";
}

function bake(src) {
  const g = parseGlb(resolve(root, src.file));
  const world = new Array(g.json.nodes.length).fill(null);
  const visit = (i, parent) => { const m = mul(parent, nodeMatrix(g.json.nodes[i])); world[i] = m; for (const c of g.json.nodes[i].children || []) visit(c, m); };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const s of g.json.scenes[g.json.scene || 0].nodes) visit(s, I);
  const acc = Object.fromEntries(GROUPS.map((k) => [k, { p: [], n: [], i: [] }]));
  g.json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined || !world[ni]) return;
    const m = world[ni];
    for (const prim of g.json.meshes[node.mesh].primitives) {
      const matName = g.json.materials?.[prim.material]?.name;
      const grp = acc[classify(matName, prim.material, src.paint)];
      const pos = readAccessor(g, prim.attributes.POSITION), nor = prim.attributes.NORMAL !== undefined ? readAccessor(g, prim.attributes.NORMAL) : null;
      const idx = prim.indices !== undefined ? readAccessor(g, prim.indices) : Array.from({ length: pos.length / 3 }, (_v, k) => k);
      const baseIndex = grp.p.length / 3;
      for (let v = 0; v < pos.length / 3; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        grp.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        if (nor) {
          const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
          const tx = m[0] * nx + m[4] * ny + m[8] * nz, ty = m[1] * nx + m[5] * ny + m[9] * nz, tz = m[2] * nx + m[6] * ny + m[10] * nz;
          const l = Math.hypot(tx, ty, tz) || 1;
          grp.n.push(tx / l, ty / l, tz / l);
        } else grp.n.push(0, 1, 0);
      }
      for (const k of idx) grp.i.push(baseIndex + k);
    }
  });
  // union bounds over every group, then find the long horizontal axis -> Z, front (headlights) -> -Z
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const k of GROUPS) for (let v = 0; v < acc[k].p.length; v += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], acc[k].p[v + c]); hi[c] = Math.max(hi[c], acc[k].p[v + c]); }
  const ext = hi.map((h, c) => h - lo[c]);
  const lenAxis = ext[0] > ext[2] ? 0 : 2, widAxis = lenAxis === 0 ? 2 : 0;
  let frontSign = 1;
  const headP = acc.head.p, tailP = acc.tail.p;
  const centroid = (arr) => { if (!arr.length) return 0; let sum = 0; for (let v = 0; v < arr.length; v += 3) sum += arr[v + lenAxis] - (lo[lenAxis] + hi[lenAxis]) / 2; return sum / (arr.length / 3); };
  if (headP.length) frontSign = centroid(headP) >= 0 ? 1 : -1; else if (tailP.length) frontSign = centroid(tailP) >= 0 ? -1 : 1;
  const ctr = lo.map((l, c) => (l + hi[c]) / 2);
  const out = { key: src.key, source: src.file, size: [ext[widAxis], ext[1], ext[lenAxis]], groups: {} };
  // Proper rotation (no mirroring, winding preserved): forward F -> -Z, up stays +Y, right = F x up.
  const fx = lenAxis === 0 ? frontSign : 0, fz = lenAxis === 2 ? frontSign : 0;
  const rot = (x, y, z) => [-fz * x + fx * z, y, -(fx * x + fz * z)];
  const remap = (x, y, z) => {
    const r = rot(x - ctr[0], y - ctr[1], z - ctr[2]);
    return [r[0] / ext[widAxis], r[1] / ext[1], r[2] / ext[lenAxis]];
  };
  for (const k of GROUPS) {
    const a = acc[k];
    if (!a.p.length) continue;
    const vc = a.p.length / 3;
    const P = new Int16Array(vc * 3), N = new Int8Array(vc * 3);
    for (let v = 0; v < vc; v++) {
      const [x, y, z] = remap(a.p[v * 3], a.p[v * 3 + 1], a.p[v * 3 + 2]);
      P[v * 3] = Math.round(Math.max(-1, Math.min(1, x * 2)) * 32767); P[v * 3 + 1] = Math.round(Math.max(-1, Math.min(1, y * 2)) * 32767); P[v * 3 + 2] = Math.round(Math.max(-1, Math.min(1, z * 2)) * 32767);
      const nrm = rot(a.n[v * 3], a.n[v * 3 + 1], a.n[v * 3 + 2]);
      N[v * 3] = Math.round(nrm[0] * 127); N[v * 3 + 1] = Math.round(nrm[1] * 127); N[v * 3 + 2] = Math.round(nrm[2] * 127);
    }
    if (vc > 65535) throw new Error(`${src.key}.${k}: ${vc} vertices exceed Uint16 indices`);
    const I16 = Uint16Array.from(a.i);
    out.groups[k] = { vertices: vc, indices: I16.length, p: Buffer.from(P.buffer).toString("base64"), n: Buffer.from(N.buffer).toString("base64"), i: Buffer.from(I16.buffer).toString("base64") };
  }
  return out;
}

const baked = SOURCES.map(bake);
const body = baked.map((b) => `  ${b.key}: ${JSON.stringify(b)}`).join(",\n");
const total = baked.reduce((n, b) => n + Object.values(b.groups).reduce((m, g) => m + g.p.length + g.n.length + g.i.length, 0), 0);
writeFileSync(resolve(here, "../cars.baked.ts"), `/* GENERATED by tools/bake-cars.mjs from CC0 models (Quaternius via poly.pizza, Kenney racing kit); do not edit. */\nexport interface BakedGroup { vertices: number; indices: number; p: string; n: string; i: string }\nexport interface BakedCar { key: string; source: string; size: [number, number, number]; groups: Partial<Record<"paint" | "trim" | "glass" | "head" | "tail", BakedGroup>> }\nexport const BAKED_CARS: Record<"sportsCar" | "sedan" | "taxi" | "hatch", BakedCar> = {\n${body}\n} as never;\n`);
console.log(baked.map((b) => `${b.key}: size ${b.size.map((x) => +x.toFixed(2))} groups ${Object.entries(b.groups).map(([k, g]) => `${k}:${g.vertices}v/${g.indices / 3}t`).join(" ")}`).join("\n"));
console.log(`total base64 bytes ${total}`);
