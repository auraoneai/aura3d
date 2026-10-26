// Flat-material variant of ortho.mjs (no textures). node flat-ortho.mjs <in.glb> <outPrefix> : unlit orthographic views (front, rear, left, right) of the base-colour texture, z-buffered.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const sharp = require("sharp");
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const [inp, outPrefix] = process.argv.slice(2);
const doc = await io.read(inp);
const prims = doc.getRoot().listMeshes()[0].listPrimitives();
const prim = prims[0];
const T = Buffer.alloc(3), TW = 1, TH = 1, TC = 3;
const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices();
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, [0, 0, 0]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
const sz = [0, 1, 2].map((k) => mx[k] - mn[k]);
// view definitions: [horizontal axis, sign, depth axis, depth sign (smaller depth = nearer to camera)]
const views = { front: [0, 1, 2, 1], rear: [0, -1, 2, -1], left: [2, 1, 0, 1], right: [2, -1, 0, -1] };
const S = 900; // px per unit of length
for (const [name, [hAxis, hSign, dAxis, dSign]] of Object.entries(views)) {
  const w = Math.ceil(sz[hAxis] * S) + 20, h = Math.ceil(sz[1] * S) + 20;
  const img = Buffer.alloc(w * h * 3, 235), zb = new Float32Array(w * h).fill(1e9);
  const proj = (p) => [((hSign > 0 ? p[hAxis] - mn[hAxis] : mx[hAxis] - p[hAxis]) * S) + 10, h - 10 - (p[1] - mn[1]) * S, dSign * p[dAxis]];
  for (const pr of prims) {
  const pp = pr.getAttribute("POSITION"), uu = pr.getAttribute("TEXCOORD_0"), ii = pr.getIndices();
  const flatCol = pr.getMaterial().getBaseColorFactor().slice(0, 3).map((c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
  for (let t = 0; t < ii.getCount(); t += 3) {
    const ids = [ii.getScalar(t), ii.getScalar(t + 1), ii.getScalar(t + 2)];
    const P = ids.map((i) => proj(pp.getElement(i, [0, 0, 0])));
    const U = uu ? ids.map((i) => uu.getElement(i, [0, 0])) : [[0, 0], [0, 0], [0, 0]];
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const d = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]); if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((P[1][1] - P[2][1]) * (x + 0.5 - P[2][0]) + (P[2][0] - P[1][0]) * (y + 0.5 - P[2][1])) / d;
      const l2 = ((P[2][1] - P[0][1]) * (x + 0.5 - P[2][0]) + (P[0][0] - P[2][0]) * (y + 0.5 - P[2][1])) / d;
      const l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * P[0][2] + l2 * P[1][2] + l3 * P[2][2]; if (z >= zb[y * w + x]) continue; zb[y * w + x] = z;
      const u = l1 * U[0][0] + l2 * U[1][0] + l3 * U[2][0], v = l1 * U[0][1] + l2 * U[1][1] + l3 * U[2][1];
      const o = (Math.min(TH - 1, Math.max(0, Math.floor(v * TH))) * TW + Math.min(TW - 1, Math.max(0, Math.floor(u * TW)))) * TC;
      const q = (y * w + x) * 3; if (flatCol) { img[q] = flatCol[0]; img[q + 1] = flatCol[1]; img[q + 2] = flatCol[2]; } else { img[q] = T[o]; img[q + 1] = T[o + 1]; img[q + 2] = T[o + 2]; }
    }
  }
  }
  await sharp(img, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${outPrefix}-${name}.png`);
}
console.log(inp.split("/").slice(-2).join("/"), "bbox", mn.map((v) => +v.toFixed(3)).join(","), "->", mx.map((v) => +v.toFixed(3)).join(","));
