// Idol athlete bind tables for Aura Diamond 3D.
//   node apps/showcase-aura-diamond-3d/scripts/idol-bind.mjs <key> [<key> ...]
// Reads apps/showcase-aura-diamond-3d/assets/idol/<key>.glb (normalised: metres, grounded, facing +Z) and writes
// src/idol/bind.generated.ts: every skin joint's model-space bind position and rotation, its parent, the humanoid role map
// (Idol bones are unnamed bone_N, so roles come from the hierarchy and rest positions), and a few CPU-skinned measurements
// (palm centroids, head crown, sole height) the runtime retarget and the cap fit need.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keys = process.argv.slice(2);
if (keys.length === 0) { console.error("usage: idol-bind.mjs <key> [...]"); process.exit(2); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/* ---- small column-major mat4 / quat helpers ---- */
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
function decompose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = r;
  const tr = m00 + m11 + m22; let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w);
  return { t: [m[12], m[13], m[14]], q: [x / l, y / l, z / l, w / l], s: (sx + sy + sz) / 3 };
}
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

async function bindFor(key) {
  const file = join(app, "assets/idol", `${key}.glb`);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const world = new Map();
  const parentOf = new Map();
  const walk = (node, parentM, parent) => {
    const m = mul(parentM, node.getMatrix());
    world.set(node, m); parentOf.set(node, parent);
    for (const c of node.listChildren()) walk(c, m, node);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of scene.listChildren()) walk(n, I, null);
  const skin = root.listSkins()[0];
  if (!skin) throw new Error(`${key}: no skin`);
  const jointNodes = skin.listJoints();
  const jointSet = new Set(jointNodes);
  const jName = (n) => n.getName();
  const joints = jointNodes.map((n) => {
    const d = decompose(world.get(n));
    const p = parentOf.get(n);
    return { node: n, name: jName(n), parent: p && jointSet.has(p) ? jName(p) : null, pos: d.t, rot: d.q, scale: d.s, children: n.listChildren().filter((c) => jointSet.has(c)) };
  });
  const byNode = new Map(joints.map((j) => [j.node, j]));
  const rootJoints = joints.filter((j) => !j.parent);
  if (rootJoints.length !== 1) throw new Error(`${key}: expected one root joint, got ${rootJoints.length}`);
  const rootParent = parentOf.get(rootJoints[0].node);
  const rp = rootParent ? decompose(world.get(rootParent)) : { t: [0, 0, 0], q: [0, 0, 0, 1], s: 1 };

  /* ---- CPU skin: bind-pose vertex positions with their dominant joint ---- */
  const ibm = skin.getInverseBindMatrices()?.getArray();
  const verts = []; // [x,y,z,jointIndex]
  for (const meshNode of [...world.keys()].filter((n) => n.getMesh() && n.getSkin() === skin)) {
    for (const prim of meshNode.getMesh().listPrimitives()) {
      const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
      if (!P || !J || !W) continue;
      const pv = [], jv = [], wv = [];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, pv); J.getElement(i, jv); W.getElement(i, wv);
        let best = 0; for (let k = 1; k < 4; k++) if (wv[k] > wv[best]) best = k;
        const ji = jv[best];
        const jm = world.get(jointNodes[ji]);
        const ib = ibm ? Array.from(ibm.slice(ji * 16, ji * 16 + 16)) : I;
        const v = xf(mul(jm, ib), pv);
        verts.push([v[0], v[1], v[2], ji, wv[best]]);
      }
    }
  }
  const jIndex = new Map(jointNodes.map((n, i) => [n, i]));

  /* ---- humanoid roles from hierarchy + rest positions ---- */
  const descCount = (j) => j.children.reduce((s, c) => s + 1 + descCount(byNode.get(c)), 0);
  const chainFrom = (j) => { const out = [j]; let c = j; while (c.children.length > 0) { c = byNode.get([...c.children].sort((a, b) => descCount(byNode.get(b)) - descCount(byNode.get(a)))[0]); out.push(c); } return out; };
  // hips: the first joint (from the root) that splits into an upward chain and two downward legs
  let hips = rootJoints[0];
  while (hips.children.length < 3 && hips.children.length > 0) hips = byNode.get(hips.children[0]);
  if (hips.children.length < 3) throw new Error(`${key}: no hips split`);
  const hk = hips.children.map((c) => byNode.get(c));
  const up = hk.reduce((a, b) => (b.pos[1] > a.pos[1] ? b : a));
  const legs = hk.filter((j) => j !== up && j.pos[1] < hips.pos[1] + 0.02);
  const legL = legs.reduce((a, b) => (b.pos[0] > a.pos[0] ? b : a));
  const legR = legs.reduce((a, b) => (b.pos[0] < a.pos[0] ? b : a));
  // spine chain up to the joint that splits into neck + two arms
  const spine = [];
  let s = up;
  while (s && s.children.length < 3) { spine.push(s); s = s.children.length ? byNode.get(s.children.reduce((a, b) => (byNode.get(b).pos[1] > byNode.get(a).pos[1] ? b : a))) : null; }
  if (!s) throw new Error(`${key}: no chest split`);
  spine.push(s);
  const chest = s;
  const ck = chest.children.map((c) => byNode.get(c));
  const neckRoot = ck.reduce((a, b) => (Math.abs(b.pos[0]) < Math.abs(a.pos[0]) && b.pos[1] >= a.pos[1] - 0.05 ? b : a));
  const armL = ck.filter((j) => j !== neckRoot).reduce((a, b) => (b.pos[0] > a.pos[0] ? b : a));
  const armR = ck.filter((j) => j !== neckRoot).reduce((a, b) => (b.pos[0] < a.pos[0] ? b : a));
  const neckChain = chainFrom(neckRoot);
  // head: the joint whose bound vertices reach the crown; neck = everything before it
  const crownOf = (j) => verts.filter((v) => v[3] === jIndex.get(j.node)).reduce((m, v) => Math.max(m, v[1]), -1e9);
  const headIdx = neckChain.length === 1 ? 0 : neckChain.reduce((bi, j, i) => (crownOf(j) > crownOf(neckChain[bi]) + 1e-4 ? i : bi), 0);
  const head = neckChain[headIdx];
  const neck = neckChain.slice(0, headIdx);
  const armChain = (start) => {
    const c = chainFrom(start);
        // (a short first link, under 12 cm, is the clavicle: the upper arm is several times longer)
    const clav = c.length >= 4 && len(sub(c[1].pos, c[0].pos)) < 0.12 ? c[0] : null;
    const rest = clav ? c.slice(1) : c;
    return { clavicle: clav?.name ?? null, upper: rest[0].name, fore: rest[1].name, hand: rest[2].name };
  };
  const legChain = (start) => { const c = chainFrom(start); return { thigh: c[0].name, shin: c[1].name, foot: c[2].name, toe: c[3]?.name ?? null }; };
  const roles = {
    hips: hips.name,
    spine: spine.map((j) => j.name),
    neck: neck.map((j) => j.name),
    head: head.name,
    armL: armChain(armL), armR: armChain(armR),
    legL: legChain(legL), legR: legChain(legR)
  };
  const J = (name) => joints.find((j) => j.name === name);
  const centroid = (names) => {
    const ids = new Set(names.map((n) => jIndex.get(J(n).node)));
    const vs = verts.filter((v) => ids.has(v[3]));
    const c = vs.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / Math.max(1, vs.length));
    return { c, vs };
  };
  const handDesc = (name) => { const out = [name]; const go = (j) => j.children.forEach((c) => { out.push(byNode.get(c).name); go(byNode.get(c)); }); go(J(name)); return out; };
  const palm = (arm) => { const { c } = centroid(handDesc(arm.hand)); return sub(c, J(arm.hand).pos); };
  const headDesc = (() => { const out = [head.name]; const go = (j) => j.children.forEach((c) => { out.push(byNode.get(c).name); go(byNode.get(c)); }); go(head); return out; })();
  const headVs = centroid(headDesc).vs;
  const crown = headVs.reduce((m, v) => Math.max(m, v[1]), -1e9);
  const hx = headVs.map((v) => v[0]), hz = headVs.map((v) => v[2]);
  const top = headVs.filter((v) => v[1] > crown - 0.06);
  const crownCentre = top.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / Math.max(1, top.length));
  // the band a cap's sweatband sits on: 5-10 cm under the crown, above the ears
  const band = headVs.filter((v) => v[1] < crown - 0.05 && v[1] > crown - 0.1);
  const bx = band.map((v) => v[0]), bz = band.map((v) => v[2]);
  const bandCentre = [(Math.max(...bx) + Math.min(...bx)) / 2, crown - 0.075, (Math.max(...bz) + Math.min(...bz)) / 2];
  const soleY = verts.reduce((m, v) => Math.min(m, v[1]), 1e9);
  return {
    key,
    rootParent: { pos: rp.t.map(r6), rot: rp.q.map(r6), scale: r6(rp.s) },
    jointScale: r6(joints[0].scale),
    joints: joints.map((j) => ({ name: j.name, parent: j.parent, pos: j.pos.map(r6), rot: j.rot.map(r6) })),
    roles,
    palmL: palm(roles.armL).map(r6),
    palmR: palm(roles.armR).map(r6),
    head: { crownY: r6(crown), crownCentre: crownCentre.map(r6), width: r6(Math.max(...hx) - Math.min(...hx)), depth: r6(Math.max(...hz) - Math.min(...hz)),
      bandCentre: bandCentre.map(r6), bandWidth: r6(Math.max(...bx) - Math.min(...bx)), bandDepth: r6(Math.max(...bz) - Math.min(...bz)) },
    soleY: r6(soleY),
    height: r6(verts.reduce((m, v) => Math.max(m, v[1]), -1e9)),
    lengths: {
      upperArm: r6(len(sub(J(roles.armL.fore).pos, J(roles.armL.upper).pos))),
      foreArm: r6(len(sub(J(roles.armL.hand).pos, J(roles.armL.fore).pos))),
      thigh: r6(len(sub(J(roles.legL.shin).pos, J(roles.legL.thigh).pos))),
      shin: r6(len(sub(J(roles.legL.foot).pos, J(roles.legL.shin).pos)))
    }
  };
}

const out = [];
for (const key of keys) out.push(await bindFor(key));
const header = `// GENERATED by apps/showcase-aura-diamond-3d/scripts/idol-bind.mjs from assets/idol/<key>.glb — do not edit by hand.\n` +
  `// Model-space (metres, +Y up, facing +Z) bind pose of each Idol athlete's skin joints, its humanoid role map and CPU-skinned\n// measurements (palm centroid offsets from the hand joint, head crown, sole height).\n`;
const body = `import type { IdolAthleteBind } from "./athlete";\n\nexport const IDOL_ATHLETE_BINDS: Readonly<Record<string, IdolAthleteBind>> = ${JSON.stringify(Object.fromEntries(out.map((b) => [b.key, b])), null, 1)};\n`;
writeFileSync(join(app, "src/idol/bind.generated.ts"), header + body);
for (const b of out) console.log(b.key, JSON.stringify({ roles: b.roles, palmL: b.palmL, head: b.head, soleY: b.soleY, height: b.height, lengths: b.lengths, joints: b.joints.length }));
