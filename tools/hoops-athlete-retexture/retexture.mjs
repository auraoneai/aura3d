#!/usr/bin/env node
// The athlete GLB's UVs tear across the whole atlas (single triangles span hundreds of texels), so no texture repaint can
// fix its shard artefacts. This tool paints the mesh by body region instead (jersey, shorts, skin, hair, sock, shoe, sole)
// into four material primitives (kit, shorts, skin, dark) from the mesh's own skin weights, drops the base-colour, normal and
// metal/rough textures, and leaves the skeleton and clips untouched. Four draws per athlete, no texture memory.
// (The engine ignores glTF COLOR_0 on this skinned path, so vertex colours render white.)
// Usage: node tools/hoops-athlete-retexture/retexture.mjs <in.glb> <out-dir> <name> [config.json | inline-json]
// Optional config (defaults reproduce the basketball athletes): { palette: {jersey,shorts,skin,hair,sock,shoe,sole,trim,cap},
//   legs: "shorts" | "pants", sleeves: "short" | "long", sockHeight: 0.13, shoeGroup: "kit" | "dark",
//   headCap: false | true (paint the top of the head as a cap/helmet group), capFraction: 0.45,
//   heightRules: true | false (false = classify by joint only, for crouched or posed bind poses) }
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const [, , inFile, outDir, name, configArg] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: retexture.mjs <in.glb> <out-dir> <name>"); process.exit(2); }

const BASE_PALETTE = {
  jersey: [236, 236, 230], shorts: [52, 58, 74], skin: [168, 108, 78], hair: [30, 24, 20],
  sock: [232, 232, 226], shoe: [236, 236, 230], sole: [40, 42, 48], trim: [220, 120, 40], cap: [28, 44, 84]
};
const CONFIG = configArg ? JSON.parse(configArg.trim().startsWith("{") ? configArg : readFileSync(configArg, "utf8")) : {};
const PALETTE = { ...BASE_PALETTE, ...(CONFIG.palette ?? {}) };
const LEGS = CONFIG.legs ?? "shorts";
const SLEEVES = CONFIG.sleeves ?? "short";
const SOCK_H = CONFIG.sockHeight ?? 0.13;
const HEAD_CAP = CONFIG.headCap ?? false;
const CAP_FRACTION = CONFIG.capFraction ?? 0.45;
const HEIGHT_RULES = CONFIG.heightRules ?? true;

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const skin = root.listSkins()[0];
const jointNames = skin.listJoints().map((j) => j.getName());
const pos = prim.getAttribute("POSITION");
const uv = prim.getAttribute("TEXCOORD_0");
const jts = prim.getAttribute("JOINTS_0");
const wts = prim.getAttribute("WEIGHTS_0");
const idxAcc = prim.getIndices();
const n = pos.getCount();
const P = new Float32Array(n * 3), UV = new Float32Array(n * 2);
for (let i = 0; i < n; i += 1) { const p = pos.getElement(i, []); P.set(p, i * 3); const t = uv.getElement(i, []); UV.set(t, i * 2); }
const idx = idxAcc ? Array.from(idxAcc.getArray()) : Array.from({ length: n }, (_, i) => i);

let ymin = Infinity, ymax = -Infinity;
for (let i = 0; i < n; i += 1) { ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]); }
const H = ymax - ymin;

const dom = new Array(n);
for (let i = 0; i < n; i += 1) {
  const j = jts.getElement(i, []), w = wts.getElement(i, []);
  const sums = new Map();
  for (let k = 0; k < 4; k += 1) sums.set(j[k], (sums.get(j[k]) ?? 0) + w[k]);
  let best = j[0], bw = -1;
  for (const [id, sum] of sums) if (sum > bw) { bw = sum; best = id; }
  dom[i] = jointNames[best] ?? "Root";
}

// head extents for the hair cap
let hy0 = Infinity, hy1 = -Infinity;
for (let i = 0; i < n; i += 1) if (dom[i] === "Head") { hy0 = Math.min(hy0, P[i * 3 + 1]); hy1 = Math.max(hy1, P[i * 3 + 1]); }

function classify(i) {
  const j = dom[i];
  const y = P[i * 3 + 1];
  const h = (y - ymin) / H;
  if (j === "Head") return HEAD_CAP ? (y > hy1 - (hy1 - hy0) * CAP_FRACTION ? "cap" : "skin") : y > hy1 - (hy1 - hy0) * 0.4 ? "hair" : "skin";
  if (j === "Chest" || j === "Spine") return HEIGHT_RULES && h > 0.835 ? "skin" : "jersey";
  if (j === "Hips") return "shorts";
  if (j.endsWith("UpperLeg")) return !HEIGHT_RULES || h > 0.4 ? "shorts" : "skin";
  if (j.endsWith("LowerLeg")) return HEIGHT_RULES && h < SOCK_H ? "sock" : LEGS === "pants" ? "shorts" : "skin";
  if (j.endsWith("Foot")) return HEIGHT_RULES && h < 0.018 ? "sole" : "shoe";
  if (j.endsWith("UpperArm")) return !HEIGHT_RULES || h > 0.74 ? "jersey" : "skin";
  if (j.endsWith("Forearm")) return SLEEVES === "long" ? "jersey" : "skin";
  return "skin";
}
const cls = new Array(n);
for (let i = 0; i < n; i += 1) cls[i] = classify(i);

const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
// Four material groups keep it to four draws per athlete: white kit (jersey, socks, shoes), shorts, skin, dark (hair, soles).
const GROUP = { jersey: "kit", sock: "kit", shoe: CONFIG.shoeGroup ?? "kit", trim: "kit", shorts: "shorts", skin: "skin", hair: "dark", sole: "dark", cap: "cap" };
const GROUP_COLOR = { kit: PALETTE.jersey, shorts: PALETTE.shorts, skin: PALETTE.skin, dark: PALETTE.hair, cap: PALETTE.cap };
const groupOf = (v) => GROUP[cls[v]];
const buffer = root.listBuffers()[0];
const srcAttrs = ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"].filter((k) => prim.getAttribute(k));
const srcArrays = Object.fromEntries(srcAttrs.map((k) => [k, { acc: prim.getAttribute(k), size: prim.getAttribute(k).getElementSize() }]));
const tris = { kit: [], shorts: [], skin: [], dark: [], cap: [] };
for (let t = 0; t < idx.length; t += 3) {
  const votes = {};
  for (let k = 0; k < 3; k += 1) { const g = groupOf(idx[t + k]); votes[g] = (votes[g] ?? 0) + 1; }
  const g = Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
  tris[g].push(idx[t], idx[t + 1], idx[t + 2]);
}
const oldMaterial = prim.getMaterial();
const toDispose = [oldMaterial.getBaseColorTexture(), oldMaterial.getNormalTexture(), oldMaterial.getMetallicRoughnessTexture()].filter(Boolean);
const stats = {};
for (const [g, list] of Object.entries(tris)) {
  if (list.length === 0) continue;
  const remap = new Map();
  const order = [];
  const newIdx = new Uint32Array(list.length);
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    let m = remap.get(v);
    if (m === undefined) { m = order.length; remap.set(v, m); order.push(v); }
    newIdx[i] = m;
  }
  const np = doc.createPrimitive().setMode(4);
  np.setIndices(doc.createAccessor(`${name}-${g}-idx`).setType("SCALAR").setArray(newIdx).setBuffer(buffer));
  for (const k of srcAttrs) {
    const { acc, size } = srcArrays[k];
    const Arr = acc.getArray().constructor;
    const out = new Arr(order.length * size);
    const tmp = [];
    for (let i = 0; i < order.length; i += 1) { acc.getElement(order[i], tmp); for (let c = 0; c < size; c += 1) out[i * size + c] = tmp[c]; }
    const na = doc.createAccessor(`${name}-${g}-${k}`).setType(acc.getType()).setArray(out).setBuffer(buffer).setNormalized(acc.getNormalized());
    np.setAttribute(k, na);
  }
  const c = GROUP_COLOR[g];
  const mat = doc.createMaterial(`${name}-${g}`).setBaseColorFactor([lin(c[0]), lin(c[1]), lin(c[2]), 1]).setRoughnessFactor(g === "skin" ? 0.62 : 0.78).setMetallicFactor(0).setDoubleSided(true);
  np.setMaterial(mat);
  mesh.addPrimitive(np);
  stats[g] = { triangles: list.length / 3, vertices: order.length };
}
mesh.removePrimitive(prim);
prim.dispose();
oldMaterial.dispose();
for (const t of toDispose) t.dispose();
for (const t of root.listTextures()) t.dispose();
const png = Buffer.alloc(0);

const glb = await io.writeBinary(doc);
const hash = createHash("sha256").update(glb).digest("hex");
mkdirSync(outDir, { recursive: true });
const file = `${name}.${hash.slice(0, 8)}.glb`;
writeFileSync(path.join(outDir, file), glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, regions: Object.fromEntries(Object.keys(PALETTE).map((k) => [k, cls.filter((c) => c === k).length])), groups: stats, verts: n, inputBytes: readFileSync(inFile).length }));
