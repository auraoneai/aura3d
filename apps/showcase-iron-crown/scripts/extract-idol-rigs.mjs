#!/usr/bin/env node
// Reads rigged Idol GLBs (unnamed bones bone_0..bone_N) and writes a typed module with each skeleton's bind data and a
// humanoid role map found from hierarchy + rest positions, so the game can drive the bones from its own joint poses
// without parsing the GLB at runtime.
//   node apps/showcase-iron-crown/scripts/extract-idol-rigs.mjs <out.ts> <exportName> <key>=<file.glb> [...]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [out, exportName, ...pairs] = process.argv.slice(2);
if (!out || !exportName || pairs.length === 0) {
  console.error("usage: extract-idol-rigs.mjs <out.ts> <exportName> key=file.glb ...");
  process.exit(2);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const r5 = (v) => Math.round(v * 1e5) / 1e5;

function decompose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  // column-major 3x3 -> quaternion
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = r;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  const n = Math.hypot(...q);
  return { t: [m[12], m[13], m[14]], r: q.map((v) => v / n), s: (sx + sy + sz) / 3 };
}

/** Idol rigs are stored unscaled; the scene node applies <key>.idol.json normalized.sceneScale (1 for older files). */
function sceneScaleOf(file) {
  const prov = file.replace(/\.glb$/, ".idol.json");
  return existsSync(prov) ? (JSON.parse(readFileSync(prov, "utf8")).normalized?.sceneScale ?? 1) : 1;
}

async function extract(key, file) {
  const doc = await io.read(file);
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error(`${key}: no skin`);
  const joints = skin.listJoints();
  const index = new Map(joints.map((j, i) => [j, i]));
  const parentOf = joints.map((j) => { const p = j.getParentNode(); return p && index.has(p) ? index.get(p) : -1; });
  const roots = parentOf.map((p, i) => (p < 0 ? i : -1)).filter((i) => i >= 0);
  if (roots.length !== 1) throw new Error(`${key}: expected one root joint, got ${roots.length}`);
  const root = roots[0];
  const rootParent = joints[root].getParentNode();
  const S = sceneScaleOf(file);
  // Everything below is in the scene's model space: the GLB scaled by the node's sceneScale about the origin.
  const scaled = (d) => ({ t: d.t.map((v) => v * S), r: d.r, s: d.s * S });
  const rootParentWorld = scaled(rootParent ? decompose(rootParent.getWorldMatrix()) : { t: [0, 0, 0], r: [0, 0, 0, 1], s: 1 });
  const world = joints.map((j) => scaled(decompose(j.getWorldMatrix())));
  const pos = world.map((w) => w.t);
  const children = joints.map((_, i) => parentOf.map((p, k) => (p === i ? k : -1)).filter((k) => k >= 0));
  const subtree = (i) => [i, ...children[i].flatMap(subtree)];
  const minY = (i) => Math.min(...subtree(i).map((k) => pos[k][1]));
  const maxY = (i) => Math.max(...subtree(i).map((k) => pos[k][1]));
  const maxAbsX = (i) => Math.max(...subtree(i).map((k) => Math.abs(pos[k][0])));
  const dist = (a, b) => Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1], pos[a][2] - pos[b][2]);

  // hips: first joint (from the root) that branches into an upward spine and two downward legs.
  let hips = root;
  while (children[hips].length === 1) hips = children[hips][0];
  const hipKids = [...children[hips]];
  const legs = hipKids.filter((c) => minY(c) < pos[hips][1] - 0.2 * (pos[hips][1] - Math.min(...pos.map((p) => p[1])) + 1e-6))
    .sort((a, b) => minY(a) - minY(b)).slice(0, 2);
  const spineStart = hipKids.filter((c) => !legs.includes(c)).sort((a, b) => maxY(b) - maxY(a))[0];
  if (legs.length !== 2 || spineStart === undefined) throw new Error(`${key}: could not split hips (${hipKids.length} children)`);
  const legOf = (side) => legs.find((c) => Math.sign(pos[subtree(c).sort((a, b) => pos[a][1] - pos[b][1])[0]][0]) === side) ?? legs[side > 0 ? 0 : 1];
  const followLowest = (start) => { const chain = [start]; let cur = start; while (children[cur].length) { cur = [...children[cur]].sort((a, b) => minY(a) - minY(b))[0]; chain.push(cur); } return chain; };

  // spine: go up until the joint that branches into arms (two children reaching far out in |x|).
  const spine = [spineStart];
  let chest = spineStart;
  for (;;) {
    const kids = children[chest];
    const wide = kids.filter((c) => maxAbsX(c) > 0.25 * (maxY(root) - Math.min(...pos.map((p) => p[1]))));
    if (wide.length >= 2) break;
    if (kids.length === 0) throw new Error(`${key}: spine ended without arms`);
    chest = [...kids].sort((a, b) => maxY(b) - maxY(a))[0];
    spine.push(chest);
  }
  const chestKids = children[chest];
  const armRoots = chestKids.filter((c) => maxAbsX(c) > 0.25 * (maxY(root) - Math.min(...pos.map((p) => p[1]))));
  const neckStart = chestKids.filter((c) => !armRoots.includes(c)).sort((a, b) => maxY(b) - maxY(a))[0];
  const headChain = [];
  if (neckStart !== undefined) { let cur = neckStart; headChain.push(cur); while (children[cur].length) { cur = [...children[cur]].sort((a, b) => maxY(b) - maxY(a))[0]; headChain.push(cur); } }
  const armChain = (side) => {
    const start = armRoots.find((c) => Math.sign(pos[subtree(c).sort((a, b) => Math.abs(pos[b][0]) - Math.abs(pos[a][0]))[0]][0]) === side);
    if (start === undefined) throw new Error(`${key}: no ${side > 0 ? "left" : "right"} arm`);
    const chain = [start]; let cur = start;
    while (children[cur].length) { cur = [...children[cur]].sort((a, b) => maxAbsX(b) - maxAbsX(a))[0]; chain.push(cur); }
    // upper arm = start of the two longest consecutive segments.
    let best = 0, bestLen = -1;
    for (let i = 0; i + 2 < chain.length; i++) { const l = dist(chain[i], chain[i + 1]) + dist(chain[i + 1], chain[i + 2]); if (l > bestLen) { bestLen = l; best = i; } }
    return { clavicles: chain.slice(0, best), upperArm: chain[best], forearm: chain[best + 1], hand: chain[best + 2] };
  };
  const legChain = (side) => {
    const c = followLowest(legOf(side));
    let best = 0, bestLen = -1;
    for (let i = 0; i + 2 < c.length; i++) { const l = dist(c[i], c[i + 1]) + dist(c[i + 1], c[i + 2]); if (l > bestLen) { bestLen = l; best = i; } }
    return { thigh: c[best], shin: c[best + 1], foot: c[best + 2], toe: c[best + 3] ?? -1 };
  };
  const L = armChain(1), R = armChain(-1), LL = legChain(1), LR = legChain(-1);
  const roles = {
    hips, spine: spine.slice(0, -1), chest, neck: headChain.length > 1 ? headChain[0] : -1, head: headChain.length > 1 ? headChain[1] : (headChain[0] ?? -1),
    clavicleL: L.clavicles.at(-1) ?? -1, upperArmL: L.upperArm, forearmL: L.forearm, handL: L.hand,
    clavicleR: R.clavicles.at(-1) ?? -1, upperArmR: R.upperArm, forearmR: R.forearm, handR: R.hand,
    thighL: LL.thigh, shinL: LL.shin, footL: LL.foot, toeL: LL.toe, thighR: LR.thigh, shinR: LR.shin, footR: LR.foot, toeR: LR.toe
  };
  const bind = joints.map((j, i) => ({ name: j.getName(), parent: parentOf[i], t: j.getTranslation().map(r5), r: j.getRotation().map(r5), s: r5((j.getScale()[0] + j.getScale()[1] + j.getScale()[2]) / 3) }));
  const P = (i) => (i >= 0 ? pos[i].map((v) => v.toFixed(3)).join(",") : "-");
  console.log(`${key}: ${joints.length} joints  hips ${P(hips)}  chest ${P(chest)}  head ${P(roles.head)}  handL ${P(L.hand)}  handR ${P(R.hand)}  footL ${P(LL.foot)}  footR ${P(LR.foot)}  spine ${roles.spine.length}`);
  return { joints: bind, rootParent: { t: rootParentWorld.t.map(r5), r: rootParentWorld.r.map(r5), s: r5(rootParentWorld.s) }, roles, sceneScale: r5(S) };
}

const rigs = {};
const scales = {};
for (const pair of pairs) {
  const [key, file] = pair.split("=");
  scales[key] = Math.round(sceneScaleOf(file) * 1e5) / 1e5;
  try { rigs[key] = await extract(key, file); } catch (e) { console.log(`${key}: no humanoid role map (${e.message}); scale only`); }
}
const body = `// Generated by apps/showcase-iron-crown/scripts/extract-idol-rigs.mjs from the rigged Idol GLBs — do not edit by hand.
// Bind pose (local TRS per joint, parent index), the world transform of the root joint's parent, and the humanoid role
// map found from hierarchy and rest positions (Idol bones are unnamed).
import type { IdolSkeleton } from "./idolHumanoid";

export const ${exportName}: Readonly<Record<string, IdolSkeleton>> = ${JSON.stringify(rigs)};

/** Scene-node scale of every rigged Idol model (the GLBs are stored at unit height so skinning is not scaled). */
export const ${exportName}_SCENE_SCALE: Readonly<Record<string, number>> = ${JSON.stringify(scales)};
`;
writeFileSync(out, body);
console.log(`wrote ${out} (${Object.keys(rigs).length} rigs)`);
