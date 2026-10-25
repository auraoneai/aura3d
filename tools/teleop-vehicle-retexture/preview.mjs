#!/usr/bin/env node
// Software preview of a single-mesh GLB, one colour per region class, as a PNG sheet (side, front, top, three-quarter).
// Usage: node preview.mjs <in.glb> <classifier.mjs> <out.png>
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { NodeIO } from "@gltf-transform/core";

const [, , inFile, classifierFile, outFile] = process.argv;
const { classify, PREVIEW_COLORS } = await import(new URL(classifierFile, `file://${process.cwd()}/`).href);
const doc = await new NodeIO().read(inFile);
const prims = doc.getRoot().listMeshes()[0].listPrimitives();
const W = 480, H = 320;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const tris = [];
for (const p of prims) {
  const pos = p.getAttribute("POSITION").getArray(), nor = p.getAttribute("NORMAL")?.getArray(), idx = p.getIndices().getArray();
  for (let i = 0; i < idx.length; i += 3) {
    const v = [0, 1, 2].map((k) => idx[i + k] * 3);
    const c = [0, 1, 2].map((a) => (pos[v[0] + a] + pos[v[1] + a] + pos[v[2] + a]) / 3);
    const ny = nor ? (nor[v[0] + 1] + nor[v[1] + 1] + nor[v[2] + 1]) / 3 : 0;
    tris.push({ p: v.map((o) => [pos[o], pos[o + 1], pos[o + 2]]), cls: classify(c[0], c[1], c[2], ny) });
  }
}

const views = [
  { name: "side", f: ([x, y, z]) => [z, y, x], flipX: true },
  { name: "front", f: ([x, y, z]) => [x, y, z], flipX: false },
  { name: "top", f: ([x, y, z]) => [x, z, -y], flipX: false },
  { name: "34", f: ([x, y, z]) => { const a = 0.6; return [x * Math.cos(a) + z * Math.sin(a), y + 0.25 * (-x * Math.sin(a) + z * Math.cos(a)), -x * Math.sin(a) + z * Math.cos(a)]; }, flipX: false }
];
const out = Buffer.alloc(W * 2 * H * 2 * 3, 24);
views.forEach((view, vi) => {
  const proj = tris.map((t) => ({ cls: t.cls, q: t.p.map(view.f) }));
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (const t of proj) for (const q of t.q) { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }
  const s = Math.min((W - 20) / (mxx - mnx), (H - 20) / (mxy - mny));
  const ox = (W - (mxx - mnx) * s) / 2, oy = (H - (mxy - mny) * s) / 2;
  const zb = new Float32Array(W * H).fill(-1e9);
  const buf = Buffer.alloc(W * H * 3, 24);
  for (const t of proj) {
    const col = PREVIEW_COLORS[t.cls] ?? [255, 0, 255];
    const sp = t.q.map((q) => [ox + (view.flipX ? mxx - q[0] : q[0] - mnx) * s, H - (oy + (q[1] - mny) * s), q[2]]);
    const minX = Math.max(0, Math.floor(Math.min(...sp.map((a) => a[0])))), maxX = Math.min(W - 1, Math.ceil(Math.max(...sp.map((a) => a[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...sp.map((a) => a[1])))), maxY = Math.min(H - 1, Math.ceil(Math.max(...sp.map((a) => a[1]))));
    const [a, b, c] = sp, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      if (z <= zb[y * W + x]) continue;
      zb[y * W + x] = z; const o = (y * W + x) * 3; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2];
    }
  }
  const bx = (vi % 2) * W, by = Math.floor(vi / 2) * H;
  for (let y = 0; y < H; y++) buf.copy(out, ((by + y) * W * 2 + bx) * 3, y * W * 3, (y + 1) * W * 3);
});
writeFileSync(outFile, png(W * 2, H * 2, out));
const counts = {}; for (const t of tris) counts[t.cls] = (counts[t.cls] ?? 0) + 1;
console.log(JSON.stringify(counts));
