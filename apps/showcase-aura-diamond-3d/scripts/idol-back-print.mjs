// Remove the shirt-back number Idol invents on an unseen jersey back (the reference only shows the front).
//   node apps/showcase-aura-diamond-3d/scripts/idol-back-print.mjs <file.glb> [yMin yMax halfWidth]
// 1. CPU-skin the bind pose, pick the back-facing torso triangles in the band (default 1.05-1.62 m, |x| < 0.26 m) and
//    rasterise them into a UV mask; 2. inside the mask, mark "ink" (pixels far from the band's median cloth colour) and
//    inpaint it with OpenCV (scripts/idol-back-print.py); 3. write the cleaned base colour back into the GLB as JPEG.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [file, y0a, y1a, hwa] = process.argv.slice(2);
const Y0 = Number(y0a ?? 1.05), Y1 = Number(y1a ?? 1.62), HW = Number(hwa ?? 0.26);
const here = dirname(fileURLToPath(import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const world = new Map();
const walk = (n, pm) => { const m = mul(pm, n.getMatrix()); world.set(n, m); n.listChildren().forEach((c) => walk(c, m)); };
scene.listChildren().forEach((n) => walk(n, I));
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const ibm = skin.getInverseBindMatrices().getArray();
const meshNode = [...world.keys()].find((n) => n.getMesh() && n.getSkin());
const prim = meshNode.getMesh().listPrimitives()[0];
const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), UV = prim.getAttribute("TEXCOORD_0");
const n = P.getCount();
const pos = [], uv = [];
const pv = [], jv = [], wv = [], tv = [];
for (let i = 0; i < n; i++) {
  P.getElement(i, pv); J.getElement(i, jv); W.getElement(i, wv); UV.getElement(i, tv);
  let acc = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    if (!wv[k]) continue;
    const m = mul(world.get(joints[jv[k]]), Array.from(ibm.slice(jv[k] * 16, jv[k] * 16 + 16)));
    const p = xf(m, pv);
    acc = [acc[0] + p[0] * wv[k], acc[1] + p[1] * wv[k], acc[2] + p[2] * wv[k]];
  }
  pos.push(acc); uv.push([tv[0], tv[1]]);
}
const idx = prim.getIndices().getArray();
const mat = prim.getMaterial();
const tex = mat.getBaseColorTexture();
const img = sharp(Buffer.from(tex.getImage()));
const { width: TW, height: TH } = await img.metadata();
const mask = new Uint8Array(TW * TH);
let picked = 0;
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
  const A = pos[a], B = pos[b], C = pos[c];
  const cy = (A[1] + B[1] + C[1]) / 3, cx = (A[0] + B[0] + C[0]) / 3;
  if (cy < Y0 || cy > Y1 || Math.abs(cx) > HW) continue;
  const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const nz = e1[0] * e2[1] - e1[1] * e2[0];
  const nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], nz) || 1;
  if (nz / nl > -0.35) continue; // back-facing (-Z) only
  picked++;
  const T = [uv[a], uv[b], uv[c]].map(([u, v]) => [u * TW, v * TH]);
  const minX = Math.max(0, Math.floor(Math.min(...T.map((p) => p[0]))) - 1), maxX = Math.min(TW - 1, Math.ceil(Math.max(...T.map((p) => p[0]))) + 1);
  const minY = Math.max(0, Math.floor(Math.min(...T.map((p) => p[1]))) - 1), maxY = Math.min(TH - 1, Math.ceil(Math.max(...T.map((p) => p[1]))) + 1);
  const area = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[2][0] - T[0][0]) * (T[1][1] - T[0][1]);
  if (Math.abs(area) < 1e-9) continue;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((T[1][0] - px) * (T[2][1] - py) - (T[2][0] - px) * (T[1][1] - py)) / area;
    const w1 = ((T[2][0] - px) * (T[0][1] - py) - (T[0][0] - px) * (T[2][1] - py)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) mask[y * TW + x] = 255;
  }
}
const dir = mkdtempSync(join(tmpdir(), "dia-backprint-"));
await img.png().toFile(join(dir, "base.png"));
await sharp(Buffer.from(mask), { raw: { width: TW, height: TH, channels: 1 } }).png().toFile(join(dir, "mask.png"));
const out = execFileSync("python3", ["-I", join(here, "idol-back-print.py"), join(dir, "base.png"), join(dir, "mask.png"), join(dir, "clean.png")], { encoding: "utf8" });
const clean = await sharp(readFileSync(join(dir, "clean.png"))).jpeg({ quality: 90 }).toBuffer();
tex.setImage(new Uint8Array(clean)).setMimeType("image/jpeg");
await io.write(file, doc);
console.log(`${file}: ${picked} back triangles, ${out.trim()} (work files in ${dir})`);
writeFileSync(join(dir, "README"), `back-print removal for ${file}\n`);
