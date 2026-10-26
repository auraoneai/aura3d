/**
 * Adds a short skin neck tube to a rebuilt athlete GLB whose head floats above the collar: a ring tube from just inside the
 * collar cap up into the base of the head, weighted Chest -> Head with a smooth ramp, UV/material of the skin. Purely additive
 * (appends vertices and triangles to the skin primitive), so palms, head bone and every other vertex stay where they were.
 *
 *   tsx --tsconfig tsconfig.base.json tools/aura-athletes/add-neck.ts <in.glb> <out.glb> [--palette]
 *
 * --palette: one palette primitive (Hoops, Diamond, Links): skin = cell 1 row 0, kit = cell 2. Otherwise FC: primitives named skin and kit.
 */
import { GlbEditor } from "../../packages/aura3d-cli/src/skin/glbEdit.ts";
import { buildHierarchy, loadSkins, readAccessor, readGlbFile, writeGlbFile } from "../../packages/aura3d-cli/src/skin/gltf.ts";
import sharp from "sharp";

type V = [number, number, number];
const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) throw new Error("usage: add-neck.ts in.glb out.glb [--palette]");
const palette = process.argv.includes("--palette");
const glb = readGlbFile(inPath);
const skin = loadSkins(glb, buildHierarchy(glb))[0]!;
const J = (n: string): number => skin.jointNames.indexOf(n);
const chestJ = J("Chest"), headJ = J("Head");
const dom = (p: (typeof skin.primitives)[number], v: number): number => { let bj = 0, bw = -1; p.joints[v]!.forEach((j, k) => { if (p.weights[v]![k]! > bw) { bw = p.weights[v]![k]!; bj = j; } }); return bj; };

let texW = 80, texH = 3;
if (palette) {
  const img = glb.json.images?.[0];
  const bv = glb.json.bufferViews[img!.bufferView!]!;
  const m = await sharp(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)).metadata();
  texW = m.width!; texH = m.height!;
}
const primJson = (p: (typeof skin.primitives)[number]) => glb.json.meshes![p.meshIndex]!.primitives[p.primitiveIndex]!;
const uvOf = (p: (typeof skin.primitives)[number]): number[][] => (primJson(p).attributes.TEXCOORD_0 !== undefined ? (readAccessor(glb, primJson(p).attributes.TEXCOORD_0 as number).rows as number[][]) : []);

let skinPrim: (typeof skin.primitives)[number];
const headPts: V[] = [], collarPts: V[] = [];
let skinUV: number[] | null = null;
const uvList: number[][][] = skin.primitives.map(uvOf);
if (palette) {
  skinPrim = skin.primitives[0]!;
  const uv = uvList[0]!;
  const cell = (v: number): number => Math.min(7, Math.floor((uv[v]![0]! * texW) / 10));
  const row = (v: number): number => Math.min(texH - 1, Math.floor(uv[v]![1]! * texH));
  for (let v = 0; v < skinPrim.pos.length; v += 1) {
    const p = skinPrim.pos[v] as V;
    if (cell(v) === 1 && row(v) === 0 && dom(skinPrim, v) === headJ) { headPts.push(p); skinUV ??= uv[v]!; }
    if (cell(v) === 2 && dom(skinPrim, v) !== headJ) collarPts.push(p);
  }
} else {
  skinPrim = skin.primitives.find((p) => p.materialName?.endsWith("-skin"))!;
  const kitPrim = skin.primitives.find((p) => p.materialName?.endsWith("-kit"))!;
  for (let v = 0; v < skinPrim.pos.length; v += 1) if (dom(skinPrim, v) === headJ) headPts.push(skinPrim.pos[v] as V);
  for (let v = 0; v < kitPrim.pos.length; v += 1) collarPts.push(kitPrim.pos[v] as V);
  skinUV = uvList[skin.primitives.indexOf(skinPrim)]?.[0] ?? null;
}

// centre line: x of the body, from the head's lowest skin verts and the collar cap's highest verts
const hy = headPts.map((p) => p[1]).sort((a, b) => a - b);
const headMinY = hy[Math.floor(hy.length * 0.01)]!;
const headRing = headPts.filter((p) => p[1] < headMinY + 0.035 && Math.abs(p[0]) < 0.12);
const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
const q = (a: number[], f: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * f)]!; };
const headC: V = [(q(headRing.map((p) => p[0]), 0.05) + q(headRing.map((p) => p[0]), 0.95)) / 2, headMinY, (q(headRing.map((p) => p[2]), 0.1) + q(headRing.map((p) => p[2]), 0.9)) / 2];
const headRx = (q(headRing.map((p) => p[0]), 0.95) - q(headRing.map((p) => p[0]), 0.05)) / 2;
const collarCands = collarPts.filter((p) => Math.abs(p[0] - headC[0]) < 0.12 && p[1] > headMinY - 0.2 && p[1] < headMinY);
const collarTop = Math.max(...collarCands.map((p) => p[1]));
const collarRing = collarCands.filter((p) => p[1] > collarTop - 0.02);
const collarC: V = [mean(collarRing.map((p) => p[0])), collarTop, mean(collarRing.map((p) => p[2]))];
const collarRx = (Math.max(...collarRing.map((p) => p[0])) - Math.min(...collarRing.map((p) => p[0]))) / 2;
console.log(JSON.stringify({ headMinY, headC, headRx, collarTop, collarC, collarRx, gap: +(headMinY - collarTop).toFixed(3), headRing: headRing.length, collarRing: collarRing.length }));

const yBot = collarTop - 0.03, yTop = headMinY + 0.035;
const rBot = Math.min(0.065, Math.max(0.04, collarRx * 0.7)), rTop = Math.min(0.065, Math.max(0.04, headRx * 0.85));
const RINGS = Number(process.env.NECK_RINGS ?? 10), NS = 20, ZK = 0.9;
const smooth = (a: number, b: number, t: number): number => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const P: number[] = [], N: number[] = [], U: number[] = [], Jn: number[] = [], Wn: number[] = [], I: number[] = [];
const base = skinPrim.pos.length;
for (let i = 0; i <= RINGS; i += 1) {
  const t = i / RINGS, y = yBot + (yTop - yBot) * t;
  const ct = smooth(0, 1, t);
  const c: V = [collarC[0] + (headC[0] - collarC[0]) * ct, y, collarC[2] + (headC[2] - collarC[2]) * ct];
  const r = rBot + (rTop - rBot) * ct;
  const wH = smooth(0.2, 0.95, t);
  for (let k = 0; k < NS; k += 1) {
    const a = (k / NS) * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
    P.push(c[0] + cx * r, y, c[2] + sz * r * ZK);
    const nn = Math.hypot(cx, sz / ZK); N.push(cx / nn, 0, sz / ZK / nn);
    U.push(...(skinUV ?? [0, 0]));
    Jn.push(chestJ, headJ, 0, 0); Wn.push(1 - wH, wH, 0, 0);
  }
}
for (let i = 0; i < RINGS; i += 1) for (let k = 0; k < NS; k += 1) {
  const a = base + i * NS + k, b = base + i * NS + ((k + 1) % NS), c = base + (i + 1) * NS + k, d = base + (i + 1) * NS + ((k + 1) % NS);
  I.push(a, c, b, b, c, d);
}

const ed = new GlbEditor(glb);
const pj = ed.primitive(skinPrim.meshIndex, skinPrim.primitiveIndex);
const rd = (acc: number): number[][] => readAccessor(glb, acc).rows as number[][];
const flat = (rows: number[][], n: number): number[] => rows.flatMap((r) => Array.from({ length: n }, (_, k) => r[k] ?? 0));
const oldIdx = readAccessor(glb, primJson(skinPrim).indices as number).rows.map((r) => (r as number[])[0]!);
const hasUV = primJson(skinPrim).attributes.TEXCOORD_0 !== undefined;
pj.attributes.POSITION = ed.addAccessor([...flat(rd(primJson(skinPrim).attributes.POSITION as number), 3), ...P], 5126, "VEC3", 34962, true);
pj.attributes.NORMAL = ed.addAccessor([...flat(rd(primJson(skinPrim).attributes.NORMAL as number), 3), ...N], 5126, "VEC3", 34962);
if (hasUV) pj.attributes.TEXCOORD_0 = ed.addAccessor([...flat(rd(primJson(skinPrim).attributes.TEXCOORD_0 as number), 2), ...U], 5126, "VEC2", 34962);
pj.attributes.JOINTS_0 = ed.addAccessor([...flat(skinPrim.joints as number[][], 4), ...Jn], 5123, "VEC4", 34962);
pj.attributes.WEIGHTS_0 = ed.addAccessor([...flat(skinPrim.weights as number[][], 4), ...Wn], 5126, "VEC4", 34962);
const total = base + P.length / 3;
pj.indices = ed.addAccessor([...oldIdx, ...I], total > 65535 ? 5125 : 5123, "SCALAR", 34963);
const { bytes } = writeGlbFile(outPath, ed.finish());
console.log(`wrote ${outPath} (${bytes} bytes), +${P.length / 3} vertices, +${I.length / 3} triangles; tube y ${yBot.toFixed(3)}..${yTop.toFixed(3)} r ${rBot.toFixed(3)}..${rTop.toFixed(3)}`);
