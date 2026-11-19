#!/usr/bin/env node
// Bake fal.ai text-to-motion clips (tools/idol/motion.mjs -> fal-ai/hunyuan-motion, SMPL 22 joints, 30 fps) into the
// skeleton-independent form the Idol fighters (Iron Crown) and enemies (Bunker Zero) play: per frame and humanoid role,
// the bone's WORLD rotation delta from the SMPL rest pose (a T-pose with identity rest rotations, facing +Z, its left
// = +X) plus the rest bind direction of that bone, and the hips offset in hips-heights with the clip's net travel removed.
// The game turns each Idol bone onto the source bind direction, then applies the delta (idolMocap.ts), so one bake drives
// every Idol body.
//
//   node apps/showcase-iron-crown/scripts/bake-idol-motion.mjs <out.ts> <ic|bz> <motion-spec.json> <Key[=alias][@contact]> ...
//
// contact modes (time stored as `contact`, the frame the game's hit lands on):
//   hand   furthest either wrist gets from the chest      handFirst  first strike within 8% of that (combos)
//   footHigh  highest either foot gets
//   down   fastest downward wrist speed (slams, chops)    none      0
// `span` is a key interval per clip: jumps [take-off, landing], crouch/guard/block [0, settled], others [0, duration].
// Format ic: MOCAP_BIND_DIRS is one role map and clips carry `contact`/`span`; format bz: MOCAP_BIND_DIRS is keyed by
// source ("smpl") and clips carry `source`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const [out, format, specPath, ...items] = process.argv.slice(2);
if (!out || !["ic", "bz"].includes(format) || !specPath || !items.length) {
  console.error("usage: bake-idol-motion.mjs <out.ts> <ic|bz> <motion-spec.json> <Key[=alias][@contact]> ...");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(resolve(root, specPath), "utf8"));
const FPS = 30;
const SMPL = ["pelvis", "L_hip", "R_hip", "spine1", "L_knee", "R_knee", "spine2", "L_ankle", "R_ankle", "spine3", "L_foot", "R_foot",
  "neck", "L_collar", "R_collar", "head", "L_shoulder", "R_shoulder", "L_elbow", "R_elbow", "L_wrist", "R_wrist"];
const PARENT = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19];
const J = (n) => SMPL.indexOf(n);
// role -> [joint whose rotation drives it, bind direction as a chain of child joints from that joint]
const ROLES = {
  hips: ["pelvis", ["spine1", "spine2", "spine3"]], chest: ["spine3", ["neck"]], head: ["head", null],
  upperArmL: ["L_shoulder", ["L_elbow"]], forearmL: ["L_elbow", ["L_wrist"]], handL: ["L_wrist", null],
  upperArmR: ["R_shoulder", ["R_elbow"]], forearmR: ["R_elbow", ["R_wrist"]], handR: ["R_wrist", null],
  thighL: ["L_hip", ["L_knee"]], shinL: ["L_knee", ["L_ankle"]], footL: ["L_ankle", ["L_foot"]],
  thighR: ["R_hip", ["R_knee"]], shinR: ["R_knee", ["R_ankle"]], footR: ["R_ankle", ["R_foot"]]
};
const ROLE_NAMES = Object.keys(ROLES);

const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qConj = (a) => [-a[0], -a[1], -a[2], a[3]];
const qNorm = (a) => { const n = Math.hypot(...a) || 1; return a.map((v) => v / n); };
const qRot = (q, v) => { const p = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q)); return [p[0], p[1], p[2]]; };
const qYaw = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const slerp = (a, b, t) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = b.map((v) => -v); d = -d; } if (d > 0.9995) return qNorm(a.map((v, i) => v + (b[i] - v) * t)); const th = Math.acos(d), s = Math.sin(th); return a.map((v, i) => v * Math.sin((1 - t) * th) / s + b[i] * Math.sin(t * th) / s); };

/** HY-Motion rot6d: a 3x2 matrix flattened row-major (columns (v0,v2,v4) and (v1,v3,v5)), Gram-Schmidt -> quaternion. */
function rot6dToQuat(v) {
  const a1 = [v[0], v[2], v[4]], a2 = [v[1], v[3], v[5]];
  const n1 = Math.hypot(...a1) || 1, b1 = a1.map((x) => x / n1);
  const d = b1[0] * a2[0] + b1[1] * a2[1] + b1[2] * a2[2];
  const u = [a2[0] - d * b1[0], a2[1] - d * b1[1], a2[2] - d * b1[2]];
  const n2 = Math.hypot(...u) || 1, b2 = u.map((x) => x / n2);
  const b3 = [b1[1] * b2[2] - b1[2] * b2[1], b1[2] * b2[0] - b1[0] * b2[2], b1[0] * b2[1] - b1[1] * b2[0]];
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [...b1, ...b2, ...b3];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  return qNorm(q);
}

let bindDirs = null;
const clips = [];
for (const item of items) {
  const [, key, alias, contactMode] = item.match(/^([^=@]+)(?:=([^@]+))?(?:@(\w+))?$/);
  const def = spec.clips.find((c) => c.key === key);
  if (!def) throw new Error(`${key}: not in ${specPath}`);
  const dict = JSON.parse(readFileSync(join(root, "artifacts/idol/motion", spec.game, key, "motion.json"), "utf8"));
  const r6 = dict.rot6d[0], tr = dict.transl[0], kp = dict.keypoints3d[0];
  const total = r6.length;
  const [w0, w1] = def.window ?? [0, (total - 1) / FPS];
  const f0 = Math.max(0, Math.round(w0 * FPS)), f1 = Math.min(total - 1, Math.round(w1 * FPS));
  const G = [];
  for (let f = 0; f < total; f++) {
    const L = r6[f].map(rot6dToQuat);
    const g = new Array(SMPL.length);
    for (let j = 0; j < SMPL.length; j++) g[j] = PARENT[j] < 0 ? L[j] : qNorm(qMul(g[PARENT[j]], L[j]));
    G.push(g);
  }
  // Rest offsets (parent frame == world at rest: every SMPL rest rotation is identity), averaged over the clip.
  const rest = SMPL.map(() => [0, 0, 0]);
  for (let j = 1; j < SMPL.length; j++) {
    const p = PARENT[j];
    for (let f = 0; f < total; f++) {
      const o = qRot(qConj(G[f][p]), [kp[f][j][0] - kp[f][p][0], kp[f][j][1] - kp[f][p][1], kp[f][j][2] - kp[f][p][2]]);
      for (let k = 0; k < 3; k++) rest[j][k] += o[k] / total;
    }
  }
  if (!bindDirs) {
    bindDirs = {};
    for (const [role, [joint, chain]] of Object.entries(ROLES)) {
      let d;
      if (chain) d = chain.reduce((acc, c) => acc.map((v, k) => v + rest[J(c)][k]), [0, 0, 0]);
      else if (role === "head") d = rest[J("head")];
      else d = rest[J(joint)]; // hand: along the forearm (elbow -> wrist)
      const l = Math.hypot(...d);
      bindDirs[role] = d.map((v) => Math.round((v / l) * 1e4) / 1e4);
    }
  }
  const hipH = -(rest[J("L_hip")][1] + rest[J("L_knee")][1] + rest[J("L_ankle")][1] + rest[J("L_foot")][1]);
  // Face +Z: remove the clip's mean heading (or its first heading when the clip turns on purpose).
  const yawOf = (f) => { const fw = qRot(G[f][0], [0, 0, 1]); return Math.atan2(fw[0], fw[2]); };
  let sx = 0, sz = 0;
  for (let f = f0; f <= f1; f++) { const y = yawOf(f); sx += Math.sin(y); sz += Math.cos(y); }
  const heading = def.faceForward === false ? yawOf(f0) : Math.atan2(sx, sz);
  const unYaw = qYaw(-heading);
  const world = (f, j) => qRot(unYaw, [kp[f][j][0] + tr[f][0], kp[f][j][1] + tr[f][1], kp[f][j][2] + tr[f][2]]);
  let ground = Infinity;
  for (let f = f0; f <= f1; f++) for (const n of ["L_ankle", "R_ankle", "L_foot", "R_foot"]) ground = Math.min(ground, world(f, J(n))[1]);
  const footLift = (f) => Math.min(...["L_ankle", "R_ankle", "L_foot", "R_foot"].map((n) => world(f, J(n))[1])) - ground;

  let frames = [];
  for (let f = f0; f <= f1; f++) {
    const rot = ROLE_NAMES.map((role) => { const d = qNorm(qMul(unYaw, G[f][J(ROLES[role][0])])); return d[3] < 0 ? d.map((v) => -v) : d; });
    const p = world(f, 0);
    frames.push({ rot, hips: [p[0] / hipH, (p[1] - ground) / hipH - 1, p[2] / hipH] });
  }
  // Root motion off: remove net horizontal travel (the sim owns position); keep bob, sway and lunge.
  const a = frames[0].hips, b = frames[frames.length - 1].hips;
  frames.forEach((fr, i) => { const u = frames.length > 1 ? i / (frames.length - 1) : 0; fr.hips = [fr.hips[0] - (a[0] + (b[0] - a[0]) * u), fr.hips[1], fr.hips[2] - (a[2] + (b[2] - a[2]) * u)]; });
  if (def.loop) {
    // Seamless loop: cross-fade the last 0.2 s into the start.
    const k = Math.max(1, Math.min(Math.floor(frames.length / 3), Math.round(0.2 * FPS)));
    const n = frames.length;
    const looped = [];
    for (let j = 0; j < n - k; j++) {
      if (j < k) { const x = frames[n - k + j], y = frames[j], w = j / k; looped.push({ rot: x.rot.map((q, r) => slerp(q, y.rot[r], w)), hips: x.hips.map((v, c) => v + (y.hips[c] - v) * w) }); }
      else looped.push(frames[j]);
    }
    frames = looped;
  }
  // Timing facts (seconds from the window start).
  const n = frames.length;
  const dur = (n - 1) / FPS;
  let contact = 0;
  if (contactMode === "hand" || contactMode === "handFirst") {
    const reach = [];
    for (let i = 0; i < n; i++) { const c = world(f0 + i, J("spine3")); reach.push(Math.max(...["L_wrist", "R_wrist"].map((w) => { const p = world(f0 + i, J(w)); return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); }))); }
    const max = Math.max(...reach);
    let i = reach.indexOf(max);
    if (contactMode === "handFirst") { i = reach.findIndex((r, k) => r >= 0.92 * max && (k + 1 >= n || r >= reach[k + 1])); }
    contact = i / FPS;
  } else if (contactMode === "footHigh") {
    let best = -Infinity;
    for (let i = 0; i < n; i++) for (const ft of ["L_foot", "R_foot", "L_ankle", "R_ankle"]) { const y = world(f0 + i, J(ft))[1]; if (y > best) { best = y; contact = i / FPS; } }
  } else if (contactMode === "down") {
    // fastest downward wrist speed after the wrist's highest point (the wind-up)
    const wy = (i) => Math.max(world(f0 + i, J("L_wrist"))[1], world(f0 + i, J("R_wrist"))[1]);
    let top = 0; for (let i = 0; i < n; i++) if (wy(i) > wy(top)) top = i;
    let best = 0;
    for (let i = top + 1; i < n; i++) for (const w of ["L_wrist", "R_wrist"]) { const v = (world(f0 + i - 1, J(w))[1] - world(f0 + i, J(w))[1]) * FPS; if (v > best) { best = v; contact = i / FPS; } }
  }
  let span = [0, dur];
  // settled: the first frame after which the pose's angular speed stays under 25% of its peak for 0.2 s (holds)
  const settle = () => {
    const sp = frames.map((fr, i) => (i ? fr.rot.reduce((a, q, r) => { const p = frames[i - 1].rot[r]; return a + 2 * Math.acos(Math.min(1, Math.abs(q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] * p[3]))); }, 0) : 0));
    const peak = Math.max(...sp), hold = Math.round(0.2 * FPS);
    const start = sp.indexOf(peak);
    for (let i = start; i + hold < n; i++) if (sp.slice(i, i + hold).every((v) => v < 0.25 * peak)) return i / FPS;
    return dur * 0.5;
  };
  if (/jump/i.test(alias ?? key)) {
    const air = []; for (let i = 0; i < n; i++) if (footLift(f0 + i) > 0.15 * hipH) air.push(i / FPS);
    if (air.length) span = [air[0], air[air.length - 1]];
    for (const fr of frames) fr.hips[1] = Math.min(fr.hips[1], 0); // the sim owns the jump height; keep the crouches
  } else if (/crouch|guard|block/i.test(alias ?? key)) {
    span = [0, settle()];
  }
  const values = [];
  for (const fr of frames) for (const q of fr.rot) values.push(...q);
  for (const fr of frames) values.push(...fr.hips);
  const q16 = new Int16Array(values.length);
  for (let i = 0; i < values.length; i++) q16[i] = Math.round(Math.max(-1, Math.min(1, values[i] / 2)) * 32767);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const entry = { name: alias ?? key, duration: r3(dur), frames: n };
  if (format === "ic") Object.assign(entry, { contact: r3(contact), span: span.map(r3) });
  else Object.assign(entry, { source: "smpl", contact: r3(contact), span: span.map(r3) });
  entry.data = Buffer.from(q16.buffer).toString("base64");
  clips.push(entry);
  console.log(`${key}${alias ? `=${alias}` : ""}: ${n} frames, ${dur.toFixed(2)} s, contact ${contact.toFixed(2)}, span ${span.map((v) => v.toFixed(2)).join("-")}, hipH ${hipH.toFixed(3)}`);
}

const dirsType = "Readonly<Record<(typeof MOCAP_ROLES)[number], readonly [number, number, number]>>";
const text = `// Generated by apps/showcase-iron-crown/scripts/bake-idol-motion.mjs from ${specPath} — do not edit by hand.
// Text-to-motion clips generated for this project on fal.ai (fal-ai/hunyuan-motion through tools/idol/motion.mjs; prompts,
// request ids and provenance under artifacts/idol/motion/${spec.game}/<key>/). No third-party motion source.
// Per frame: ${ROLE_NAMES.length} role world-rotation deltas from the SMPL rest pose (x, y, z, w), then the hips offset in
// hips-heights (x, y, z) with the clip's net travel removed. Values are int16 / 32767 * 2, little-endian, base64.

export const MOCAP_FPS = ${FPS};
export const MOCAP_ROLES = ${JSON.stringify(ROLE_NAMES)} as const;
/** Source bind direction of each role's bone (unit vector; +Z forward, +X the body's left). */
export const MOCAP_BIND_DIRS: ${format === "ic" ? dirsType : `Readonly<Record<string, ${dirsType}>>`} = ${JSON.stringify(format === "ic" ? bindDirs : { smpl: bindDirs })};
export const MOCAP_CLIPS: readonly { readonly name: string; readonly duration: number; readonly frames: number;${format === "bz" ? " readonly source: string;" : ""} readonly contact: number; readonly span: readonly [number, number]; readonly data: string }[] = ${JSON.stringify(clips)};
`;
writeFileSync(resolve(root, out), text);
console.log("wrote", out, (text.length / 1024).toFixed(0), "KB");
