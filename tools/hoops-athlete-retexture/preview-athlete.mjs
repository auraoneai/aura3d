#!/usr/bin/env node
// CPU preview of a rigged athlete GLB in its bind pose: flat colours from the palette strip (UV cell) or the named material,
// Lambert shading, orthographic. Sheet = per input: front, side, face close-up, hips close-up.
// Usage: node preview-athlete.mjs <out.png> <in.glb> [<in2.glb> ...]
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const [, , outFile, ...inputs] = process.argv;
const T = 300; // tile size
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgb) { const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); }

async function load(file) {
  const doc = await new NodeIO().read(file);
  const tris = [];
  for (const prim of doc.getRoot().listMeshes()[0].listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL"), uv = prim.getAttribute("TEXCOORD_0");
    const mat = prim.getMaterial();
    const tex = mat?.getBaseColorTexture();
    let dec = null;
    if (tex && uv) dec = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const factor = mat ? mat.getBaseColorFactor().slice(0, 3).map((c) => Math.round(255 * Math.pow(c, 1 / 2.2))) : [200, 200, 200];
    const idx = prim.getIndices().getArray();
    for (let i = 0; i < idx.length; i += 3) {
      const v = [0, 1, 2].map((k) => idx[i + k]);
      const p = v.map((a) => pos.getElement(a, []));
      const n = v.map((a) => nor.getElement(a, []));
      let col = factor;
      if (dec) {
        const u = uv.getElement(v[0], []);
        const x = Math.min(dec.info.width - 1, Math.floor(u[0] * dec.info.width)), y = Math.min(dec.info.height - 1, Math.floor(u[1] * dec.info.height));
        const o = (y * dec.info.width + x) * 3; col = [dec.data[o], dec.data[o + 1], dec.data[o + 2]];
      }
      tris.push({ p, n, col });
    }
  }
  return tris;
}

function render(tris, view, box) {
  // view: "front" looks down -z (x right, y up); "side" looks down -x (z right, y up); box = [cx, cy, halfH] in model units
  const buf = Buffer.alloc(T * T * 3, 36);
  const zb = new Float32Array(T * T).fill(-1e9);
  const s = T / (2 * box[2]);
  const proj = (p) => (view === "front" ? [(p[0] - box[0]) * s + T / 2, T / 2 - (p[1] - box[1]) * s, p[2]] : [(p[2] - box[0]) * s + T / 2, T / 2 - (p[1] - box[1]) * s, p[0]]);
  for (const t of tris) {
    const q = t.p.map(proj);
    const ny = [0, 1, 2].reduce((a, k) => a + (view === "front" ? t.n[k][2] : t.n[k][0]), 0) / 3;
    if (ny < -0.2) continue; // back face
    const shade = 0.55 + 0.45 * Math.max(0, ny);
    const minx = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]))), maxx = Math.min(T - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]))), maxy = Math.min(T - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
    const d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const a = ((q[1][1] - q[2][1]) * (x + 0.5 - q[2][0]) + (q[2][0] - q[1][0]) * (y + 0.5 - q[2][1])) / d;
      const b = ((q[2][1] - q[0][1]) * (x + 0.5 - q[2][0]) + (q[0][0] - q[2][0]) * (y + 0.5 - q[2][1])) / d;
      const c = 1 - a - b;
      if (a < -0.001 || b < -0.001 || c < -0.001) continue;
      const z = a * q[0][2] + b * q[1][2] + c * q[2][2];
      const zz = view === "front" ? z : z;
      if (zz <= zb[y * T + x]) continue;
      zb[y * T + x] = zz;
      const o = (y * T + x) * 3;
      buf[o] = Math.min(255, t.col[0] * shade); buf[o + 1] = Math.min(255, t.col[1] * shade); buf[o + 2] = Math.min(255, t.col[2] * shade);
    }
  }
  return buf;
}

const rows = [];
for (const f of inputs) {
  const tris = await load(f);
  let ymin = 1e9, ymax = -1e9;
  for (const t of tris) for (const p of t.p) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  const H = ymax - ymin, cy = (ymin + ymax) / 2;
  rows.push([
    render(tris, "front", [0, cy, H * 0.56]),
    render(tris, "side", [0, cy, H * 0.56]),
    render(tris, "front", [0, ymax - H * 0.07, H * 0.075]),
    render(tris, "front", [0, ymin + H * 0.5, H * 0.14]),
  ]);
}
const W = T * 4, Hh = T * rows.length;
const out = Buffer.alloc(W * Hh * 3);
rows.forEach((tiles, r) => tiles.forEach((tile, c) => { for (let y = 0; y < T; y++) tile.copy(out, ((r * T + y) * W + c * T) * 3, y * T * 3, (y + 1) * T * 3); }));
writeFileSync(outFile, png(W, Hh, out));
console.log("wrote", outFile, `${W}x${Hh}`);
