#!/usr/bin/env node
// Extracts the skin skeleton of Idol rigged GLBs (unnamed bone_N joints) into a typed constant for `idolRig.ts`:
// bones in parent-first order with rest local TRS, the root's non-joint parent transform, and the semantic map
// (hips, spine, neck, head, arm and leg chains) found by hierarchy and rest positions (model space: +Y up, faces +Z,
// the character's left is +X).
//   node examples/ninja-runner-port/art/idol-rig-extract.mjs <out.ts> <key>=<path.glb> [...]
import { readFileSync, writeFileSync } from "node:fs";

const [out, ...pairs] = process.argv.slice(2);
if (!out || pairs.length === 0) { console.error("usage: idol-rig-extract.mjs <out.ts> key=file.glb ..."); process.exit(2); }

const qmul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qrot = (q, v) => { const [x, y, z, w] = q; const tx = 2*(y*v[2]-z*v[1]), ty = 2*(z*v[0]-x*v[2]), tz = 2*(x*v[1]-y*v[0]); return [v[0]+w*tx+(y*tz-z*ty), v[1]+w*ty+(z*tx-x*tz), v[2]+w*tz+(x*ty-y*tx)]; };
const r = (v) => Math.round(v * 1e5) / 1e5;

function extract(file) {
  const buf = readFileSync(file);
  const gl = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  const nodes = gl.nodes;
  const parent = new Map();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const skin = gl.skins[0];
  const joints = new Set(skin.joints);
  const wcache = new Map();
  const world = (i) => {
    if (i === undefined) return { p: [0, 0, 0], q: [0, 0, 0, 1], s: 1 };
    if (wcache.has(i)) return wcache.get(i);
    const n = nodes[i], p = world(parent.get(i));
    const t = n.translation ?? [0, 0, 0], s = (n.scale ?? [1, 1, 1])[0];
    const o = qrot(p.q, t.map((v) => v * p.s));
    const res = { p: [p.p[0] + o[0], p.p[1] + o[1], p.p[2] + o[2]], q: qmul(p.q, n.rotation ?? [0, 0, 0, 1]), s: p.s * s };
    wcache.set(i, res);
    return res;
  };
  // parent-first order over the joint forest
  const roots = skin.joints.filter((j) => !joints.has(parent.get(j)));
  if (roots.length !== 1) throw new Error(`${file}: expected one skeleton root, found ${roots.length}`);
  const order = [];
  const visit = (i) => { order.push(i); for (const c of nodes[i].children ?? []) if (joints.has(c)) visit(c); };
  visit(roots[0]);
  const idx = new Map(order.map((n, k) => [n, k]));
  const rootParent = world(parent.get(roots[0]));
  const bones = order.map((n) => ({ name: nodes[n].name ?? `node_${n}`, parent: parent.has(n) && joints.has(parent.get(n)) ? idx.get(parent.get(n)) : -1,
    t: (nodes[n].translation ?? [0, 0, 0]).map(r), q: (nodes[n].rotation ?? [0, 0, 0, 1]).map(r) }));
  const P = order.map((n) => world(n).p);
  const kids = (k) => bones.map((b, j) => (b.parent === k ? j : -1)).filter((j) => j >= 0);
  const chainDown = (k) => { const c = [k]; for (;;) { const ks = kids(c[c.length - 1]); if (ks.length !== 1) break; c.push(ks[0]); } return c; };
  // hips: the first joint (from the root) with two children below it on either side and one above
  let hips = 0;
  for (let k = 0; k < bones.length; k++) {
    const ks = kids(k);
    const below = ks.filter((j) => P[j][1] < P[k][1] - 0.01 || subtreeMinY(j) < P[k][1] - 0.3);
    if (ks.length >= 3 && below.length >= 2) { hips = k; break; }
  }
  function subtreeMinY(k) { let m = P[k][1]; for (const j of kids(k)) m = Math.min(m, subtreeMinY(j)); return m; }
  function subtreeMaxY(k) { let m = P[k][1]; for (const j of kids(k)) m = Math.max(m, subtreeMaxY(j)); return m; }
  const hk = kids(hips);
  const legs = hk.filter((j) => subtreeMinY(j) < P[hips][1] - 0.3).sort((a, b) => P[b][0] - P[a][0]);
  const spineStart = hk.filter((j) => !legs.includes(j)).sort((a, b) => subtreeMaxY(b) - subtreeMaxY(a))[0];
  if (legs.length < 2 || spineStart === undefined) throw new Error(`${file}: could not find legs/spine under hips ${hips}`);
  // spine: follow single children up to the chest (3+ children: neck + two arms)
  const spine = [];
  let c = spineStart;
  for (;;) { spine.push(c); const ks = kids(c); if (ks.length !== 1) break; c = ks[0]; }
  const chest = spine[spine.length - 1];
  const ck = kids(chest);
  const neckRoot = ck.slice().sort((a, b) => Math.abs(P[a][0]) - Math.abs(P[b][0]) || P[b][1] - P[a][1])[0];
  const arms = ck.filter((j) => j !== neckRoot).sort((a, b) => P[b][0] - P[a][0]);
  if (arms.length < 2) throw new Error(`${file}: chest ${chest} has ${ck.length} children`);
  const neckChain = chainDown(neckRoot);
  // head: the joint whose subtree reaches highest along the neck chain (last single-child link)
  const head = neckChain.length > 1 ? neckChain[neckChain.length - (neckChain.length > 2 ? 2 : 1)] : neckChain[0];
  const neck = neckChain.slice(0, neckChain.indexOf(head));
  const height = Math.max(...P.map((p) => p[1]));
  const armChain = (root) => {
    const ch = chainDown(root);
    // the upper arm is the first link longer than ~8.5% of the joint height (clavicles are short); then forearm, hand
    const seg = (k) => (ch[k + 1] === undefined ? 0 : Math.hypot(...P[ch[k + 1]].map((v, i) => v - P[ch[k]][i])));
    let up = ch.findIndex((_, k) => seg(k) > 0.085 * height);
    if (up < 0) up = 0;
    const upper = ch[up], fore = ch[up + 1] ?? upper, hand = ch[up + 2] ?? fore;
    return [up > 0 ? ch[up - 1] : -1, upper, fore, hand];
  };
  const legChain = (root) => { const ch = chainDown(root); return [ch[0], ch[1] ?? ch[0], ch[2] ?? ch[1] ?? ch[0], ch[3] ?? -1]; };
  const map = { hips, spine, neck, head, armL: armChain(arms[0]), armR: armChain(arms[arms.length - 1]), legL: legChain(legs[0]), legR: legChain(legs[legs.length - 1]) };
  return { bones, rootQ: rootParent.q.map(r), rootP: rootParent.p.map(r), rootS: r(rootParent.s), map,
    info: { hipsY: r(P[hips][1]), headY: r(P[head][1]), topJointY: r(height), handLX: r(P[map.armL[3]][0]), handRX: r(P[map.armR[3]][0]) } };
}

const rigs = {};
for (const pair of pairs) {
  const [key, file] = pair.split("=");
  rigs[key] = extract(file);
  console.log(key, JSON.stringify(rigs[key].map), JSON.stringify(rigs[key].info), `${rigs[key].bones.length} bones`);
}
const body = Object.entries(rigs).map(([k, v]) => `  ${k}: ${JSON.stringify({ bones: v.bones, rootQ: v.rootQ, rootP: v.rootP, rootS: v.rootS, map: v.map })}`).join(",\n");
writeFileSync(out, `// Generated by art/idol-rig-extract.mjs from the Idol rigged GLBs: do not edit by hand.\nimport type { IdolRigData } from "./idolRig";\n\nexport const IDOL_RIGS = {\n${body}\n} satisfies Record<string, IdolRigData>;\n`);
