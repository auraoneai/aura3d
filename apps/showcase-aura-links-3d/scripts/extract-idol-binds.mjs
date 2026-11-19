#!/usr/bin/env node
// Writes src/game/idolBinds.ts: the bind pose of every rigged Idol GLB the game drives (golfer variants + caddie), read from
// the normalised GLBs in assets/idol/ (the same files tools/idol/admit.sh hashed into public/aura-assets). Per joint: name,
// parent joint, world position / rotation / uniform scale in GLB space (metres, faces +Z) and the smallest-variance axis of
// the vertices it dominates (the palm normal for hand joints). Idol bones are unnamed (bone_0..), so roles are assigned at
// runtime from this table by src/game/idolHumanoid.ts (hierarchy + rest positions).
// Run: node apps/showcase-aura-links-3d/scripts/extract-idol-binds.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(appDir, "src/game/idolBinds.ts");
export const IDOL_RIG_KEYS = [
  "linksIdolGolferBlue", "linksIdolGolferRed", "linksIdolGolferWhite",
  "linksIdolGolferNavy", "linksIdolGolferOrange"
];

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qrot = (q, v) => {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]), ty = 2 * (q[2] * v[0] - q[0] * v[2]), tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [v[0] + q[3] * tx + (q[1] * tz - q[2] * ty), v[1] + q[3] * ty + (q[2] * tx - q[0] * tz), v[2] + q[3] * tz + (q[0] * ty - q[1] * tx)];
};

function pcaAxis(pts) {
  if (pts.length < 8) return null;
  const m = [0, 0, 0];
  for (const q of pts) for (let k = 0; k < 3; k++) m[k] += q[k] / pts.length;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) A[a][c] += ((q[a] - m[a]) * (q[c] - m[c])) / pts.length;
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
    if (Math.abs(A[p][q]) < 1e-14) continue;
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
    const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) { const kp = A[k][p], kq = A[k][q]; A[k][p] = c * kp - s * kq; A[k][q] = s * kp + c * kq; }
    for (let k = 0; k < 3; k++) { const pk = A[p][k], qk = A[q][k]; A[p][k] = c * pk - s * qk; A[q][k] = s * pk + c * qk; }
    for (let k = 0; k < 3; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
  }
  let best = 0;
  for (let i = 1; i < 3; i++) if (A[i][i] < A[best][best]) best = i;
  const v = [V[0][best], V[1][best], V[2][best]];
  // sign convention: palms of a T-pose face down (-Y) or forward (+Z)
  const ax = v.map(Math.abs);
  const s = ax[1] >= ax[2] && ax[1] >= ax[0] ? (v[1] > 0 ? -1 : 1) : ax[2] >= ax[0] ? (v[2] < 0 ? -1 : 1) : 1;
  return v.map((x) => x * s);
}

async function bindOf(path) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(path);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  if (!skin) throw new Error(`${path}: no skin`);
  const joints = skin.listJoints();
  const jointSet = new Set(joints);
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const cache = new Map();
  const world = (n) => {
    if (cache.has(n)) return cache.get(n);
    const t = n.getTranslation(), r = n.getRotation(), s = n.getScale();
    const p = parentOf.has(n) ? world(parentOf.get(n)) : { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: 1 };
    const wp = qrot(p.rot, [t[0] * p.scale, t[1] * p.scale, t[2] * p.scale]);
    const res = { pos: [p.pos[0] + wp[0], p.pos[1] + wp[1], p.pos[2] + wp[2]], rot: qmul(p.rot, r), scale: p.scale * s[0] };
    cache.set(n, res);
    return res;
  };
  // vertices each joint dominates (bind pose = mesh space; the skinned mesh node sits under the same normalised root)
  const owned = joints.map(() => []);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
    if (!P || !J || !W) continue;
    const meshNode = root.listNodes().find((n) => n.getMesh() === mesh);
    const mw = meshNode ? world(meshNode) : { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: 1 };
    const p = [], j = [], w = [];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p); J.getElement(i, j); W.getElement(i, w);
      let bi = 0;
      for (let k = 1; k < 4; k++) if (w[k] > w[bi]) bi = k;
      if (w[bi] < 0.6) continue;
      const v = qrot(mw.rot, [p[0] * mw.scale, p[1] * mw.scale, p[2] * mw.scale]);
      owned[j[bi]]?.push([v[0] + mw.pos[0], v[1] + mw.pos[1], v[2] + mw.pos[2]]);
    }
  }
  const r6 = (x) => Math.round(x * 1e6) / 1e6 + 0;
  const rows = joints.map((n, i) => {
    const w = world(n);
    const par = parentOf.get(n);
    const row = { name: n.getName(), parent: jointSet.has(par) ? par.getName() : null, pos: w.pos.map(r6), rot: w.rot.map(r6), scale: r6(w.scale) };
    if (!jointSet.has(par) && par) { const pw = world(par); row.parentWorld = { pos: pw.pos.map(r6), rot: pw.rot.map(r6), scale: r6(pw.scale) }; }
    const ax = pcaAxis(owned[i]);
    if (ax) row.axis = ax.map((x) => Math.round(x * 1e4) / 1e4 + 0);
    return row;
  });
  const names = new Set(rows.map((r) => r.name));
  if (names.size !== rows.length) throw new Error(`${path}: duplicate joint names`);
  const clips = root.listAnimations().map((a) => a.getName());
  return { rows, clips };
}

const entries = [];
for (const key of IDOL_RIG_KEYS) {
  const glb = resolve(appDir, `assets/idol/${key}.glb`);
  if (!existsSync(glb)) { console.warn(`skip ${key}: ${glb} missing`); continue; }
  const { rows, clips } = await bindOf(glb);
  entries.push(`  ${key}: {\n    clips: ${JSON.stringify(clips)},\n    joints: [\n${rows.map((r) => `      ${JSON.stringify(r)}`).join(",\n")}\n    ]\n  }`);
}
const caddieGlb = resolve(appDir, "assets/idol/linksIdolCaddie.glb");
const caddie = await bindOf(caddieGlb);
const caddieEntry = `{\n  clips: ${JSON.stringify(caddie.clips)},\n  joints: [\n${caddie.rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}`;
const text = `// Generated by apps/showcase-aura-links-3d/scripts/extract-idol-binds.mjs from assets/idol/*.glb - do not edit by hand.
// Bind pose (world position / rotation / uniform scale, GLB space, metres, facing +Z) of every rigged Idol golfer and the caddie.
import type { IdolRigBind } from "./idolHumanoid";

export const IDOL_BINDS: Readonly<Record<string, IdolRigBind>> = {
${entries.join(",\n")}
};

/** the Idol caddie (its idle clip barely moves, so the game drives its bones: game/caddieIdle.ts) */
export const IDOL_CADDIE_BIND: IdolRigBind = ${caddieEntry};
`;
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== text) { console.error("src/game/idolBinds.ts is stale"); process.exit(1); }
  console.log("idolBinds.ts is current");
} else {
  writeFileSync(out, text);
  console.log(`wrote ${out} (${entries.length} rigs)`);
}
