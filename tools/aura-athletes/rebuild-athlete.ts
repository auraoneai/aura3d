/**
 * Rebuilds a palette athlete (Hoops, Diamond, Links body) in the straight pose its skeleton assumes, like the FC fix:
 * thigh, shin, shorts or pants, socks, sleeves, arm tubes and hands are new tubes with smooth weights; head, hair, torso
 * jersey, eyes and shoes keep their geometry (shoes straightened). Region comes from the palette cell each vertex samples.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/aura-athletes/rebuild-athlete.ts \
 *     --kind hoops|diamond --in <orig.glb> --base <rigged.glb for skeleton/image/material> --out <out.glb> [--keep-frame]
 *
 * The shared Meshy skeleton puts the feet at y = -0.952 in the Hoops/Diamond files and at y = 0 in the Links file; the FC rebuild
 * works with the feet at 0, so the input is lifted for the rebuild and lowered again (unless --keep-frame).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlbEditor } from "../../packages/aura3d-cli/src/skin/glbEdit.ts";
import { buildHierarchy, loadSkins, readAccessor, readGlbFile, writeGlbFile } from "../../packages/aura3d-cli/src/skin/gltf.ts";
// @ts-expect-error plain JS modules
import { readGlb as fcRead, writeGlb as fcWrite } from "../aura-fc/glb.mjs";
// @ts-expect-error plain JS modules
import { rebuildLegs } from "../aura-fc/rebuild-legs.mjs";
// @ts-expect-error plain JS modules
import { rebuildArms } from "../aura-fc/rebuild-arms.mjs";
// @ts-expect-error plain JS modules
import { cutBridges } from "../aura-fc/bridge-cut.mjs";

type V = [number, number, number];
const args = process.argv.slice(2);
const opt = (n: string, d?: string): string | undefined => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const kind = opt("--kind", "hoops") as "hoops" | "diamond";
const inPath = opt("--in") as string, basePath = opt("--base") as string, outPath = opt("--out") as string;
if (!inPath || !basePath || !outPath) throw new Error("usage: --kind hoops|diamond --in orig.glb --base rigged.glb --out out.glb [--keep-frame]");

// palette cell -> FC material, per athlete
// cell index (u) and row (v) of the palette strip: cells 1 and 7 hold the face detail by row (row 1 = brows/mouth and eye whites, row 2 = pupils)
const CELL_MAT: Record<string, string[]> = {
  hoops: ["dark", "skin", "kit", "shorts", "skin", "socks", "dark", "skin"],
  diamond: ["dark", "skin", "kit", "shorts", "shorts", "socks", "dark", "skin"]
};
const matOf = (cell: number, row: number): string => ((cell === 1 && row === 1) || (cell === 7 && row >= 1) ? "eyes" : CELL_MAT[kind]![cell]!);
const LEG_SKIN_CELL = kind === "hoops" ? 4 : 1;
const MATS = ["kit", "skin", "shorts", "socks", "dark", "eyes"];

const orig = readGlbFile(inPath);
const skin = loadSkins(orig, buildHierarchy(orig))[0]!;
const prim = skin.primitives[0]!;
const json0 = orig.json.meshes![prim.meshIndex]!.primitives[prim.primitiveIndex]!;
const nrm = readAccessor(orig, json0.attributes.NORMAL as number).rows as V[];
const uv = readAccessor(orig, json0.attributes.TEXCOORD_0 as number).rows;
const img = orig.json.images![0]!;
const bv = orig.json.bufferViews[img.bufferView!]!;
const imgBytes = orig.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
const texW = imgBytes.readUInt32BE(16);
const texH = imgBytes.readUInt32BE(20);
const cellOf = (v: number): number => Math.min(7, Math.floor((uv[v]![0]! * texW) / 10));
const rowOf = (v: number): number => Math.min(texH - 1, Math.floor(uv[v]![1]! * texH));

// lift the file to the FC frame (feet at 0)
const rootNode = orig.json.nodes.find((n: { name?: string }) => n.name === "Root");
const lift = rootNode?.translation ? -rootNode.translation[1] : 0;

// 1. split by class into the FC multi-material layout
const ed = new GlbEditor(orig);
const meshJson = ed.json.meshes![prim.meshIndex]!;
const dominant = (v: number): number => { let bj = 0, bw = -1; prim.joints[v]!.forEach((j, k) => { if (prim.weights[v]![k]! > bw) { bw = prim.weights[v]![k]!; bj = j; } }); return bj; };
void dominant;
const triMat = new Map<string, number[]>(MATS.map((m) => [m, []]));
for (let t = 0; t < prim.indices.length; t += 3) {
  const ids = [prim.indices[t]!, prim.indices[t + 1]!, prim.indices[t + 2]!];
  const tally = new Map<string, number>();
  for (const v of ids) { const m = matOf(cellOf(v), rowOf(v)); tally.set(m, (tally.get(m) ?? 0) + 1); }
  const mat = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  triMat.get(mat)!.push(...ids);
}
// the old jersey shell is ragged where the arms were bound (holes show the dark inside), so it is replaced by a clean tube that follows
// the measured torso profile (half width and depth per height) on the straight skeleton axis; the FC arm rebuild adds sleeves and caps
const jointIdx = (n: string): number => skin.jointNames.indexOf(n);
const hipsJ = jointIdx("Hips"), spineJ = jointIdx("Spine"), chestJ = jointIdx("Chest");
const boneName = (v: number): string => skin.jointNames[dominant(v)] ?? "";
const torsoVerts: number[] = [];
for (const v of new Set(triMat.get("kit")!)) if (/^(Hips|Spine|Chest)$/.test(boneName(v))) torsoVerts.push(v);
const midX = 0;
const yMin = Math.min(...torsoVerts.map((v) => prim.pos[v]![1] + lift)), yMax = Math.max(...torsoVerts.map((v) => prim.pos[v]![1] + lift));
const BAND = 0.03;
const bands: { y: number; rx: number; rz: number; zc: number }[] = [];
for (let y = yMin; y <= yMax + 1e-6; y += BAND) {
  const pts = torsoVerts.map((v) => prim.pos[v]!).filter((p) => Math.abs(p[1] + lift - y) < BAND / 2 + 0.01 && Math.abs(p[0] - midX) < 0.3);
  if (pts.length < 12) continue;
  const xs = pts.map((p) => Math.abs(p[0] - midX)).sort((a, b) => a - b), zs = pts.map((p) => p[2]).sort((a, b) => a - b);
  bands.push({ y, rx: xs[Math.floor(xs.length * 0.93)]!, rz: (zs[Math.floor(zs.length * 0.97)]! - zs[Math.floor(zs.length * 0.03)]!) / 2, zc: (zs[Math.floor(zs.length * 0.97)]! + zs[Math.floor(zs.length * 0.03)]!) / 2 });
}
const smoothBands = bands.map((b, i) => { const a = bands[Math.max(0, i - 1)]!, c = bands[Math.min(bands.length - 1, i + 1)]!; return { y: b.y, rx: Math.min(0.205, (a.rx + 2 * b.rx + c.rx) / 4), rz: (a.rz + 2 * b.rz + c.rz) / 4, zc: 0 }; });
console.log("torso profile (y, half width, half depth):", smoothBands.filter((_, i) => i % 3 === 0).map((b) => `${b.y.toFixed(2)}:${b.rx.toFixed(3)}/${b.rz.toFixed(3)}`).join(" "));
const hipsZ = (orig.json.nodes.find((n: { name?: string }) => n.name === "Hips")?.translation?.[2] ?? 0);
const sm = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tube = { P: [] as number[], N: [] as number[], J: [] as number[], W: [] as number[], I: [] as number[] };
{
  const NSEG = 28; const rings: { y: number; rx: number; rz: number }[] = smoothBands.map((b) => ({ y: b.y, rx: b.rx, rz: b.rz }));
  // close the top into the neck over the last rings
  const top = rings[rings.length - 1]!;
  for (const [dy, rxN, rzN] of [[0.02, 0.1, 0.085], [0.04, 0.075, 0.065]] as [number, number, number][]) rings.push({ y: top.y + dy, rx: Math.min(top.rx, rxN), rz: Math.min(top.rz, rzN) });
  rings.forEach((r) => {
    const wH = 1 - sm(0.95, 1.2, r.y), wC = sm(1.2, 1.4, r.y), wS = 1 - wH - wC;
    for (let k = 0; k < NSEG; k += 1) {
      const a = (k / NSEG) * Math.PI * 2;
      tube.P.push(midX + Math.cos(a) * r.rx, r.y, hipsZ + Math.sin(a) * r.rz);
      tube.N.push(Math.cos(a), 0, Math.sin(a));
      const pr: [number, number][] = [[hipsJ, wH], [spineJ, wS], [chestJ, wC]];
      for (let q = 0; q < 4; q += 1) { tube.J.push(pr[q]?.[0] ?? 0); tube.W.push(pr[q]?.[1] ?? 0); }
    }
  });
  for (let i = 0; i < rings.length - 1; i += 1) for (let k = 0; k < NSEG; k += 1) {
    const a = i * NSEG + k, b = i * NSEG + ((k + 1) % NSEG), c = (i + 1) * NSEG + k, d = (i + 1) * NSEG + ((k + 1) % NSEG);
    tube.I.push(a, c, b, b, c, d);
  }
}
const newPrims: typeof meshJson.primitives = [];
const materials: { name: string }[] = [];
for (const mat of MATS) {
  const tri = mat === "kit" ? [] : triMat.get(mat)!;
  if (tri.length === 0 && mat !== "kit") continue;
  const remap = new Map<number, number>();
  const P: number[] = [], N: number[] = [], J: number[] = [], W: number[] = [], I: number[] = [];
  for (const v of tri) {
    if (!remap.has(v)) {
      remap.set(v, remap.size);
      P.push(prim.pos[v]![0], prim.pos[v]![1] + lift, prim.pos[v]![2]);
      N.push(...nrm[v]!);
      for (let k = 0; k < 4; k += 1) { J.push(prim.joints[v]![k] ?? 0); W.push(prim.weights[v]![k] ?? 0); }
    }
    I.push(remap.get(v)!);
  }
  if (mat === "kit") { P.push(...tube.P); N.push(...tube.N); J.push(...tube.J); W.push(...tube.W); I.push(...tube.I); }
  materials.push({ name: mat });
  newPrims.push({
    attributes: {
      POSITION: ed.addAccessor(P, 5126, "VEC3", 34962, true),
      NORMAL: ed.addAccessor(N, 5126, "VEC3", 34962),
      JOINTS_0: ed.addAccessor(J, 5123, "VEC4", 34962),
      WEIGHTS_0: ed.addAccessor(W, 5126, "VEC4", 34962)
    },
    indices: ed.addAccessor(I, P.length / 3 > 65535 ? 5125 : 5123, "SCALAR", 34963),
    material: materials.length - 1,
    mode: 4
  } as never);
}
meshJson.primitives = newPrims;
ed.json.materials = materials as never;
if (rootNode) { const r = ed.json.nodes.find((n: { name?: string }) => n.name === "Root"); if (r?.translation) r.translation[1] += lift; }
const work = mkdtempSync(join(tmpdir(), "rebuild-athlete-"));
const stage = join(work, "stage.glb");
writeGlbFile(stage, ed.finish());

// 2. FC rebuild: legs, then arms, then drop any residual stretched triangle
const legOpts = kind === "diamond" ? { hemY: 0.14, sockTop: 0.27, sockBottom: 0.13 } : { sockTop: 0.27, sockBottom: 0.13 };
const legs = rebuildLegs(fcRead(stage), legOpts);
// the games solve the hand onto a calibrated palm point in forearm bone space: place the rebuilt hand there (right palm x,y,z; left mirrors x)
const palmArg = opt("--palm");
const palmShift: Record<string, [number, number, number]> = { Left: [0, 0, 0], Right: [0, 0, 0] };
const palmWorld = (side: "Left" | "Right"): number[] | null => {
  if (!palmArg) return null;
  const [px, py, pz] = palmArg.split(",").map(Number) as [number, number, number];
  const local = side === "Right" ? [px, py, pz] : [-px, py, pz];
  const loc = [local[0]! + palmShift[side]![0], local[1]! + palmShift[side]![1], local[2]! + palmShift[side]![2]];
  const m = skin.ibm[skin.jointNames.indexOf(`${side}Forearm`)]!;
  const d = [loc[0]! - m[12]!, loc[1]! - m[13]!, loc[2]! - m[14]!];
  const w = [m[0]! * d[0]! + m[1]! * d[1]! + m[2]! * d[2]!, m[4]! * d[0]! + m[5]! * d[1]! + m[6]! * d[2]!, m[8]! * d[0]! + m[9]! * d[1]! + m[10]! * d[2]!];
  return [w[0]!, w[1]! + lift, w[2]!];
};
const palms = palmArg ? { Left: palmWorld("Left"), Right: palmWorld("Right") } : null;
const arms = rebuildArms(legs.glb, { capSleeves: true, palms });
const clips = (orig.json.animations ?? []).map((a: { name?: string }) => a.name as string);
const cut = args.includes("--no-cut") ? { glb: arms.glb, report: [] } : cutBridges(arms.glb, { limit: 1.6, clips, samples: 10, keepMaterials: null });
const rebuilt = join(work, "rebuilt.glb");
fcWrite(rebuilt, cut.glb);
console.log(JSON.stringify({ legs: legs.report, arms: arms.report, cut: cut.report }));

// 3. merge the rebuilt primitives into one palette primitive and write it into the base rig
const rb = readGlbFile(rebuilt);
const rskin = loadSkins(rb, buildHierarchy(rb))[0]!;
const base = readGlbFile(basePath);
const baseEd = new GlbEditor(base);
const Pn: number[] = [], Nn: number[] = [], Un: number[] = [], Jn: number[] = [], Wn: number[] = [], In: number[] = [];
const cellU = (c: number): number => ((c * 10 + 5) / texW);
// old vertices keep their authored UV: match by x/y (the rebuild only shears z), new tube vertices get a flat class cell
const grid = new Map<string, { z: number; u: number; v: number; x: number; y: number; m: string }[]>();
const gk = (x: number, y: number): string => `${Math.round(x / 0.002)},${Math.round(y / 0.002)}`;
for (let v = 0; v < prim.pos.length; v += 1) { const x = prim.pos[v]![0], y = prim.pos[v]![1] + lift; const k = gk(x, y); (grid.get(k) ?? grid.set(k, []).get(k)!).push({ z: prim.pos[v]![2], u: uv[v]![0]!, v: uv[v]![1]!, x, y, m: matOf(cellOf(v), rowOf(v)) }); }
const findOld = (p: number[], mat: string): { u: number; v: number } | null => {
  let best: { u: number; v: number } | null = null, bd = 1e9;
  const cx = Math.round(p[0]! / 0.002), cy = Math.round(p[1]! / 0.002);
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (const c of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
    const d = Math.hypot(c.x - p[0]!, c.y - p[1]!) * 20 + Math.abs(c.z - p[2]!);
    if (c.m === mat && d < bd && Math.hypot(c.x - p[0]!, c.y - p[1]!) < 0.0015 && Math.abs(c.z - p[2]!) < 0.12) { bd = d; best = { u: c.u, v: c.v }; }
  }
  return best;
};
const lower = args.includes("--keep-frame") ? 0 : lift;
const rbPrims = rb.json.meshes![rskin.primitives[0]!.meshIndex]!.primitives;
for (const sp of rskin.primitives) {
  const norms = readAccessor(rb, rbPrims[sp.primitiveIndex]!.attributes.NORMAL as number).rows as V[];
  const baseIdx = Pn.length / 3;
  for (let v = 0; v < sp.pos.length; v += 1) {
    const mat = sp.materialName;
    let bj = 0, bw = -1; sp.joints[v]!.forEach((j, k) => { if (sp.weights[v]![k]! > bw) { bw = sp.weights[v]![k]!; bj = j; } });
    const bone = rskin.jointNames[bj] ?? "";
    let cell = 2;
    if (mat === "kit") cell = 2;
    else if (mat === "shorts") cell = 3;
    else if (mat === "socks") cell = 5;
    else if (mat === "eyes") cell = 7;
    else if (mat === "dark") cell = /Head/.test(bone) ? 0 : 6;
    else if (mat === "skin") cell = /Leg|Foot/.test(bone) ? LEG_SKIN_CELL : 1;
    Pn.push(sp.pos[v]![0], sp.pos[v]![1] - lower, sp.pos[v]![2]);
    Nn.push(...(norms[v] ?? [0, 1, 0]));
    const old = mat === "kit" && false ? null : (mat === "shorts" || mat === "socks" ? null : findOld([sp.pos[v]![0], sp.pos[v]![1], sp.pos[v]![2]], mat));
    if (old) Un.push(old.u, old.v); else Un.push(cellU(cell), mat === "skin" && cell === 1 ? 0.5 / texH : 0.5);
    for (let k = 0; k < 4; k += 1) { Jn.push(sp.joints[v]![k] ?? 0); Wn.push(sp.weights[v]![k] ?? 0); }
  }
  for (const i of sp.indices) In.push(i + baseIdx);
}
const bp = baseEd.primitive(0, 0);
bp.attributes.POSITION = baseEd.addAccessor(Pn, 5126, "VEC3", 34962, true);
bp.attributes.NORMAL = baseEd.addAccessor(Nn, 5126, "VEC3", 34962);
bp.attributes.TEXCOORD_0 = baseEd.addAccessor(Un, 5126, "VEC2", 34962);
bp.attributes.JOINTS_0 = baseEd.addAccessor(Jn, 5123, "VEC4", 34962);
bp.attributes.WEIGHTS_0 = baseEd.addAccessor(Wn, 5126, "VEC4", 34962);
bp.indices = baseEd.addAccessor(In, Pn.length / 3 > 65535 ? 5125 : 5123, "SCALAR", 34963);
const { bytes } = writeGlbFile(outPath, baseEd.finish());
console.log(`wrote ${outPath} (${bytes} bytes), ${Pn.length / 3} vertices, ${In.length / 3} triangles, lift ${lift}`);
