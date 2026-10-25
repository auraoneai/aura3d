#!/usr/bin/env node
// CPU rasteriser for audit views: renders front, side and back orthographic views of each GLB in its bind pose using the
// base-colour texture, so a reviewer can see lettering, faces and brand marks that are scattered across a shard atlas.
// Usage: node tools/likeness-audit/render-views.mjs <out.png> <glb> [<glb>...]
import { readFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , outFile, ...files] = process.argv;
if (!outFile || files.length === 0) { console.error("usage: render-views.mjs <out.png> <glb>..."); process.exit(2); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const W = 360, H = 520;

async function loadModel(file) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
  const tris = [];
  const texCache = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0");
      if (!pos) continue;
      const idx = prim.getIndices();
      const mat = prim.getMaterial();
      let tex = null;
      const bt = mat?.getBaseColorTexture();
      if (bt) {
        if (!texCache.has(bt)) {
          const img = Buffer.from(bt.getImage());
          const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          texCache.set(bt, { data, w: info.width, h: info.height });
        }
        tex = texCache.get(bt);
      }
      const factor = mat?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const n = pos.getCount();
      const P = [], U = [];
      for (let i = 0; i < n; i += 1) {
        const p = pos.getElement(i, []);
        P.push([m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]);
        U.push(uv ? uv.getElement(i, []) : [0, 0]);
      }
      const ia = idx ? idx.getArray() : Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i + 2 < ia.length; i += 3) tris.push({ p: [P[ia[i]], P[ia[i + 1]], P[ia[i + 2]]], u: [U[ia[i]], U[ia[i + 1]], U[ia[i + 2]]], tex, factor });
    }
  }
  return tris;
}

function render(tris, view) {
  // view: 0 front (looking down -z), 1 side (looking down -x), 2 back
  const proj = (p) => (view === 0 ? [p[0], p[1], p[2]] : view === 1 ? [-p[2], p[1], p[0]] : [-p[0], p[1], -p[2]]);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const t of tris) for (const p of t.p) { const q = proj(p); minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); }
  const s = Math.min((W - 20) / (maxx - minx || 1), (H - 20) / (maxy - miny || 1));
  const ox = (W - (maxx - minx) * s) / 2, oy = (H - (maxy - miny) * s) / 2;
  const buf = Buffer.alloc(W * H * 3, 0x28);
  const zb = new Float32Array(W * H).fill(-Infinity);
  for (const t of tris) {
    const q = t.p.map((p) => { const r = proj(p); return [ox + (r[0] - minx) * s, H - (oy + (r[1] - miny) * s), r[2]]; });
    const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
    const d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const a = ((q[1][1] - q[2][1]) * (x + 0.5 - q[2][0]) + (q[2][0] - q[1][0]) * (y + 0.5 - q[2][1])) / d;
      const b = ((q[2][1] - q[0][1]) * (x + 0.5 - q[2][0]) + (q[0][0] - q[2][0]) * (y + 0.5 - q[2][1])) / d;
      const c = 1 - a - b;
      if (a < 0 || b < 0 || c < 0) continue;
      const z = a * q[0][2] + b * q[1][2] + c * q[2][2];
      if (z <= zb[y * W + x]) continue;
      zb[y * W + x] = z;
      const enc = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
      let rgb = t.tex ? [t.factor[0] * 255, t.factor[1] * 255, t.factor[2] * 255] : [enc(t.factor[0]), enc(t.factor[1]), enc(t.factor[2])];
      if (t.tex) {
        const u = a * t.u[0][0] + b * t.u[1][0] + c * t.u[2][0], v = a * t.u[0][1] + b * t.u[1][1] + c * t.u[2][1];
        const tx = Math.floor((((u % 1) + 1) % 1) * t.tex.w), ty = Math.floor((((v % 1) + 1) % 1) * t.tex.h);
        const o = (ty * t.tex.w + tx) * 4;
        rgb = [t.tex.data[o] * t.factor[0], t.tex.data[o + 1] * t.factor[1], t.tex.data[o + 2] * t.factor[2]];
      }
      const o2 = (y * W + x) * 3;
      buf[o2] = rgb[0]; buf[o2 + 1] = rgb[1]; buf[o2 + 2] = rgb[2];
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

const rows = [];
for (const f of files) {
  const tris = await loadModel(f);
  const views = [];
  for (let v = 0; v < 3; v += 1) views.push(await render(tris, v));
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * 3}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="14" fill="#fff" font-family="monospace">${path.basename(f)}  (${tris.length} tris)</text></svg>`);
  rows.push(await sharp({ create: { width: W * 3, height: H + 22, channels: 3, background: "#111" } })
    .composite([{ input: label, left: 0, top: 0 }, ...views.map((b, i) => ({ input: b, left: i * W, top: 22 }))]).png().toBuffer());
}
await sharp({ create: { width: W * 3, height: (H + 22) * rows.length, channels: 3, background: "#111" } })
  .composite(rows.map((b, i) => ({ input: b, left: 0, top: i * (H + 22) }))).png().toFile(outFile);
console.log(`${files.length} models -> ${outFile}`);
