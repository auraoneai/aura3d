// Foot height / forward position of the hero's Walk clip by forward kinematics: when does each heel strike (phase 0..1)?
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const anim = doc.getRoot().listAnimations().find((a) => a.getName() === "Walk");
const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const slerp = (a, b, t) => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; const s = d < 0 ? -1 : 1; d *= s; const o = a.map((v, i) => v * (1 - t) + b[i] * s * t); const l = Math.hypot(...o); return o.map((v) => v / l); };
const sample = (ch, t) => { const T = ch.getSampler().getInput(), O = ch.getSampler().getOutput(), n = T.getCount(); const w = ch.getTargetPath() === "rotation" ? 4 : 3;
  let i = 0; while (i < n - 2 && T.getElement(i + 1, []) [0] <= t) i++; const t0 = T.getElement(i, [])[0], t1 = T.getElement(Math.min(n - 1, i + 1), [])[0]; const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = O.getElement(i, []), b = O.getElement(Math.min(n - 1, i + 1), []); return w === 4 ? slerp(a, b, u) : a.map((v, k) => v + (b[k] - v) * u); };
const dur = 1.0667, rows = [];
for (let k = 0; k < 64; k++) {
  const t = (k / 64) * dur;
  for (const ch of anim.listChannels()) { const nd = ch.getTargetNode(), p = ch.getTargetPath(), v = sample(ch, t); if (p === "rotation") nd.setRotation(v); else if (p === "translation") nd.setTranslation(v); else nd.setScale(v); }
  const wp = (n) => nodes.get(n).getWorldTranslation();
  const L = wp("LeftFoot"), R = wp("RightFoot"), H = wp("Hips");
  rows.push({ ph: k / 64, ly: L[1], ry: R[1], lz: L[2], rz: R[2], hy: H[1], hx: H[0] });
}
const minAt = (key) => rows.reduce((m, r) => (r[key] < m[key] ? r : m)).ph;
console.log("left foot lowest at phase", minAt("ly").toFixed(3), "right foot lowest at", minAt("ry").toFixed(3));
console.log("hips y range", Math.min(...rows.map((r) => r.hy)).toFixed(3), Math.max(...rows.map((r) => r.hy)).toFixed(3), "hips lateral range", Math.min(...rows.map((r) => r.hx)).toFixed(3), Math.max(...rows.map((r) => r.hx)).toFixed(3));
console.log("hips y min at", minAt("hy").toFixed(3));
for (const r of rows.filter((_, i) => i % 4 === 0)) console.log(r.ph.toFixed(3), "Ly", r.ly.toFixed(3), "Ry", r.ry.toFixed(3), "Lz", r.lz.toFixed(3), "Rz", r.rz.toFixed(3), "Hy", r.hy.toFixed(3), "Hx", r.hx.toFixed(3));
