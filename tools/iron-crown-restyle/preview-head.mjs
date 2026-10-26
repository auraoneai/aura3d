#!/usr/bin/env node
// Front and three-quarter close-up of a fighter's head from the bind pose (face texture sampled through the mesh UVs).
// Usage: node tools/iron-crown-restyle/preview-head.mjs <in.glb> <out.png>
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const [, , inFile, outFile] = process.argv;
const doc = await new NodeIO().read(inFile);
const root = doc.getRoot();
const prims = root.listMeshes()[0].listPrimitives();
const headNode = root.listSkins()[0].listJoints().find((j) => j.getName() === "Head");
const hw = headNode.getWorldTranslation();
const W = 420, H = 420;
const faceTexs = new Map();
for (const p of prims) {
  const t = p.getMaterial()?.getBaseColorTexture();
  if (t && !faceTexs.has(t)) faceTexs.set(t, await sharp(Buffer.from(t.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, rgb) { const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); }
const angles = [0, 0.7];
const out = Buffer.alloc(W * angles.length * H * 3, 30);
angles.forEach((ang, vi) => {
  const buf = Buffer.alloc(W * H * 3, 30), zb = new Float32Array(W * H).fill(-1e9);
  const ca = Math.cos(ang), sa = Math.sin(ang), s = 1.7 * (H / 2) / 0.35;
  const toScreen = (p) => { const x = (p[0] - hw[0]) * ca + (p[2] - hw[2]) * sa, z = -(p[0] - hw[0]) * sa + (p[2] - hw[2]) * ca; return [W / 2 + x * s, H * 0.66 - (p[1] - hw[1]) * s, z]; };
  for (const p of prims) {
    const mat = p.getMaterial(), tex = mat?.getBaseColorTexture(), img = tex ? faceTexs.get(tex) : null, bf = mat?.getBaseColorFactor() ?? [0.7, 0.7, 0.7, 1];
    const pos = p.getAttribute("POSITION"), uv = p.getAttribute("TEXCOORD_0"), idx = p.getIndices().getArray();
    for (let i = 0; i < idx.length; i += 3) {
      const v = [idx[i], idx[i + 1], idx[i + 2]], P = v.map((k) => pos.getElement(k, [])), U = v.map((k) => (uv ? uv.getElement(k, []) : [0, 0]));
      const sp = P.map(toScreen);
      if (Math.min(...sp.map((a) => a[1])) > H || Math.max(...sp.map((a) => a[1])) < 0) continue;
      const [a, b, c] = sp, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * a[2] + l2 * b[2] + l3 * c[2]; if (z <= zb[y * W + x]) continue; zb[y * W + x] = z;
        let r = bf[0] * 255, g = bf[1] * 255, bl = bf[2] * 255;
        if (img) { const u = l1 * U[0][0] + l2 * U[1][0] + l3 * U[2][0], w = l1 * U[0][1] + l2 * U[1][1] + l3 * U[2][1]; const tx = Math.min(img.info.width - 1, Math.max(0, Math.floor(u * img.info.width))), ty = Math.min(img.info.height - 1, Math.max(0, Math.floor(w * img.info.height))); const o = (ty * img.info.width + tx) * 4; r *= img.data[o] / 255; g *= img.data[o + 1] / 255; bl *= img.data[o + 2] / 255; }
        const o2 = (y * W + x) * 3; buf[o2] = r; buf[o2 + 1] = g; buf[o2 + 2] = bl;
      }
    }
  }
  for (let y = 0; y < H; y++) buf.copy(out, (y * W * angles.length + vi * W) * 3, y * W * 3, (y + 1) * W * 3);
});
writeFileSync(outFile, png(W * angles.length, H, out));
