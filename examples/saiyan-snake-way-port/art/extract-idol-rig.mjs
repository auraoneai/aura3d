#!/usr/bin/env node
// Serpentine Sky Run: bakes the skeleton of each rigged Idol runner GLB into art/idolRig.data.ts.
//   node examples/saiyan-snake-way-port/art/extract-idol-rig.mjs <key>=<path/to/key.glb> [...]
// Idol bones are unnamed (bone_0..bone_N), so the humanoid slots (hips, spine chain, neck, head, upper/fore arm,
// thigh/shin) are found from the hierarchy and the T-pose rest positions in scene space (the GLB faces +Z, +Y up,
// so the runner's left is +X). The runtime (art/idolRunner.ts) drives those slots from poseHero's segment frames.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const here = dirname(fileURLToPath(import.meta.url));

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qnorm = (q) => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n); };
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** Column-major 4x4 multiply. */
function m4mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function m4inv3(m) {
  // inverse of the upper 3x3 (column-major in, column-major 3x3 out)
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a; // a_ij = column i, row j
  const det = a00 * (a11 * a22 - a21 * a12) - a10 * (a01 * a22 - a21 * a02) + a20 * (a01 * a12 - a11 * a02);
  const inv = [
    (a11 * a22 - a21 * a12) / det, (a21 * a02 - a01 * a22) / det, (a01 * a12 - a11 * a02) / det,
    (a20 * a12 - a10 * a22) / det, (a00 * a22 - a20 * a02) / det, (a10 * a02 - a00 * a12) / det,
    (a10 * a21 - a20 * a11) / det, (a20 * a01 - a00 * a21) / det, (a00 * a11 - a10 * a01) / det
  ];
  return inv;
}
/** Rotation quaternion of a column-major 4x4 with uniform scale. */
function quatOf(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = r;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return qnorm(q);
}

async function extract(key, file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error(`${file}: no skin`);
  const joints = skin.listJoints();
  const jointSet = new Set(joints);
  const parentOf = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const world = (n) => n.getWorldMatrix();
  // Topological order: parents before children (depth-first from joints whose parent is not a joint).
  const order = [];
  const visit = (n) => { order.push(n); for (const c of n.listChildren()) if (jointSet.has(c)) visit(c); };
  for (const j of joints) if (!jointSet.has(parentOf.get(j))) visit(j);
  const index = new Map(order.map((n, i) => [n, i]));
  const pos = (n) => { const m = world(n); return [m[12], m[13], m[14]]; };
  const bones = order.map((n) => {
    const p = parentOf.get(n);
    return { name: n.getName(), parent: jointSet.has(p) ? index.get(p) : -1, restLocal: qnorm(n.getRotation()).map(r6), restWorld: quatOf(world(n)).map(r6), pos: pos(n).map(r6) };
  });
  const rootParent = parentOf.get(order[0]);
  const rootParentWorld = rootParent ? quatOf(world(rootParent)).map(r6) : [0, 0, 0, 1];
  const children = (i) => bones.map((b, k) => (b.parent === i ? k : -1)).filter((k) => k >= 0);

  // Hips: the root joint (or the first joint with three or more children: two legs and a spine).
  let hips = 0;
  while (children(hips).length === 1) hips = children(hips)[0];
  const kids = children(hips);
  if (kids.length < 3) throw new Error(`${key}: hips ${bones[hips].name} has ${kids.length} children`);
  // Spine: the child that goes up; legs: the two that go down (left = +x).
  const up = kids.reduce((a, b) => (bones[b].pos[1] > bones[a].pos[1] ? b : a));
  const legs = kids.filter((k) => k !== up).sort((a, b) => bones[a].pos[1] - bones[b].pos[1]).slice(0, 2).sort((a, b) => bones[b].pos[0] - bones[a].pos[0]);
  const chainDown = (start, n) => { const out = [start]; let c = start; for (let i = 1; i < n; i++) { const k = children(c); if (!k.length) break; c = k.reduce((a, b) => (bones[b].pos[1] < bones[a].pos[1] ? b : a)); out.push(c); } return out; };
  const [thighL, shinL] = chainDown(legs[0], 2);
  const [thighR, shinR] = chainDown(legs[1], 2);
  // Spine chain: walk up until a joint branches into three (neck + two clavicles/shoulders).
  const spine = [];
  let c = up;
  while (children(c).length === 1) { spine.push(c); c = children(c)[0]; }
  spine.push(c);
  const chest = c;
  const top = children(chest);
  if (top.length < 3) throw new Error(`${key}: chest ${bones[chest].name} has ${top.length} children`);
  const neck = top.reduce((a, b) => (Math.abs(bones[b].pos[0]) < Math.abs(bones[a].pos[0]) ? b : a));
  const neckChildren = children(neck);
  const head = neckChildren.length ? neckChildren[0] : neck;
  // Arms: follow each side branch outwards; the upper arm is the joint after which the chain runs mostly along x.
  const armChain = (start) => { const out = [start]; let k = start; while (children(k).length >= 1 && out.length < 6) { k = children(k).reduce((a, b) => (Math.abs(bones[b].pos[0]) > Math.abs(bones[a].pos[0]) ? b : a)); out.push(k); } return out; };
  const sides = top.filter((k) => k !== neck).sort((a, b) => bones[b].pos[0] - bones[a].pos[0]);
  const arm = (start) => {
    const ch = armChain(start);
    // shoulder pivot = joint with the largest gap to the next joint among the first three (clavicles are short)
    const len = (i) => (i + 1 < ch.length ? Math.hypot(...bones[ch[i + 1]].pos.map((v, d) => v - bones[ch[i]].pos[d])) : 0);
    let u = 0;
    if (ch.length >= 4 && len(0) < 0.6 * len(1)) u = 1;
    return { upper: ch[u], fore: ch[u + 1], hand: ch[u + 2] ?? ch[u + 1], chain: ch };
  };
  const armL = arm(sides[0]);
  const armR = arm(sides[sides.length - 1]);
  const dir = (a, b) => { const d = bones[b].pos.map((v, k) => v - bones[a].pos[k]); const n = Math.hypot(...d) || 1; return d.map((v) => r6(v / n)); };
  const hipsNode = order[hips];
  const hipsParent = parentOf.get(hipsNode);
  const parentLinearInv = m4inv3(hipsParent ? world(hipsParent) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).map(r6);
  const slots = {
    hips, spine: spine, neck, head,
    upperL: armL.upper, foreL: armL.fore, upperR: armR.upper, foreR: armR.fore,
    thighL, shinL, thighR, shinR
  };
  const restDir = {
    upperL: dir(armL.upper, armL.fore), foreL: dir(armL.fore, armL.hand), upperR: dir(armR.upper, armR.fore), foreR: dir(armR.fore, armR.hand),
    thighL: dir(thighL, shinL), shinL: dir(shinL, children(shinL)[0] ?? shinL), thighR: dir(thighR, shinR), shinR: dir(shinR, children(shinR)[0] ?? shinR)
  };
  const summary = { key, bones: bones.length, hips: bones[hips].name, hipsHeight: bones[hips].pos[1], spine: spine.map((i) => bones[i].name), neck: bones[neck].name, head: bones[head].name, armL: armL.chain.map((i) => bones[i].name), armR: armR.chain.map((i) => bones[i].name), legs: [thighL, shinL, thighR, shinR].map((i) => bones[i].name) };
  console.error(JSON.stringify(summary));
  return {
    key,
    bones: bones.map(({ name, parent, restLocal, restWorld }) => ({ name, parent, restLocal, restWorld })),
    rootParentWorld,
    slots,
    restDir,
    hips: { restTranslation: hipsNode.getTranslation().map(r6), parentLinearInv, restHeight: bones[hips].pos[1] }
  };
}

const pairs = process.argv.slice(2).map((a) => a.split("="));
const rigs = {};
for (const [key, file] of pairs) rigs[key] = await extract(key, file);
const out = join(here, "idolRig.data.ts");
writeFileSync(out, `// Generated by art/extract-idol-rig.mjs from the admitted Idol runner GLBs; do not edit by hand.\n` +
  `import type { IdolRig } from "./idolRunner";\n\n` +
  `export const IDOL_RIGS: Readonly<Record<string, IdolRig>> = ${JSON.stringify(rigs)};\n`);
console.error(`wrote ${out}`);
