// Bake KickTap / KickPass / KickShot clips into the Aura FC athlete GLBs with analytic two-bone leg IK.
// The GLBs' own Shoot/Attack clips contain no kicking motion (right foot travels 0.28 m at 1 m/s), so the game
// drove procedural kit boxes through a real swing while the visible legs barely moved. These clips move the
// real skeleton: plant foot fixed, right boot swings back, accelerates through the ball and follows through.
//
// usage: node tools/aura-fc/bake-kick.mjs <in.glb> <out.glb> [report.json]
import { writeFileSync } from "node:fs";
import {
  readGlb, writeGlb, withAnimations, forward, localPose, nodeIndex,
  qmul, qconj, qaxis, qalign, qnorm, qrot
} from "./glb.mjs";

export const CLIP_SECONDS = 0.6;
export const CONTACT_FRAC = 0.74;               // must equal KICK_CONTACT_FRAC in sim.ts
export const FPS = 60;
export const VARIANTS = { KickTap: 0.55, KickPass: 0.8, KickShot: 1.0 };
// Ball centre in model space at the kick: sim FOOT_AHEAD 0.34 m / FOOT_SIDE 0.14 m over the 1.174 model scale.
export const BALL_MODEL = [-0.119, 0.179, 0.29];
export const BALL_RADIUS_MODEL = 0.179;
export const TOE_POINT = [0, -0.07, 0.27];       // boot-tip point in the foot bone frame (measured from the skinned mesh)
const L1 = 0.412, L2 = 0.337;                    // thigh / shin lengths
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const HIP_R = [-0.162, -0.037, 0], HIP_L = [0.114, -0.037, 0];

function hermite(keys, u) {
  // keys: [{u, v:[...]}] cardinal spline with finite-difference tangents
  let k = 0;
  while (k < keys.length - 2 && keys[k + 1].u <= u) k++;
  const a = keys[k], b = keys[k + 1];
  const tan = (i) => {
    const p = keys[Math.max(0, i - 1)], n = keys[Math.min(keys.length - 1, i + 1)];
    const du = n.u - p.u || 1;
    return keys[i].v.map((_, c) => (n.v[c] - p.v[c]) / du);
  };
  const h = b.u - a.u, s = Math.min(1, Math.max(0, (u - a.u) / h));
  const m0 = tan(k), m1 = tan(k + 1);
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return a.v.map((_, c) => h00 * a.v[c] + h10 * h * m0[c] + h01 * b.v[c] + h11 * h * m1[c]);
}

function kickKeys(amp) {
  const c = CONTACT_FRAC;
  return {
    ankleR: [
      { u: 0, v: [-0.163, 0.151, 0.0] },
      { u: 0.34, v: [-0.17, 0.3 + 0.12 * amp, -(0.14 + 0.26 * amp)] },
      { u: 0.6, v: [-0.15, 0.28, -(0.12 + 0.22 * amp)] },
      { u: 0.7, v: [-0.13, 0.29, -0.12] },
      { u: c, v: [-0.12, 0.3, -0.025] },
      { u: 0.78, v: [-0.11, 0.33, 0.07] },
      { u: 1.0, v: [-0.1, 0.5, 0.3 + 0.16 * amp] }
    ],
    pitchR: [{ u: 0, v: [0] }, { u: 0.32, v: [0.5 + 0.1 * amp] }, { u: c, v: [0.44] }, { u: 1, v: [0.7] }],
    ankleL: [{ u: 0, v: [0.114, 0.151, 0.1] }, { u: 1, v: [0.114, 0.151, 0.1] }],
    hips: [
      { u: 0, v: [0, 0.937, 0] },
      { u: 0.32, v: [0.0, 0.937 - 0.02, -0.01] },
      { u: c, v: [0.03, 0.937 - 0.045, 0.04] },
      { u: 1, v: [0.02, 0.937 - 0.03, 0.06] }
    ],
    hipYaw: [{ u: 0, v: [0] }, { u: 0.32, v: [-0.3 * amp] }, { u: c, v: [0.22 * amp] }, { u: 1, v: [0.35 * amp] }],
    hipPitch: [{ u: 0, v: [0] }, { u: 0.32, v: [-0.06] }, { u: c, v: [0.14] }, { u: 1, v: [0.18] }],
    spinePitch: [{ u: 0, v: [0] }, { u: 0.32, v: [-0.04] }, { u: c, v: [0.1] }, { u: 1, v: [0.1] }],
    // arms: [abduction, swing (negative = forward)]
    armL: [{ u: 0, v: [0.25, 0] }, { u: 0.32, v: [0.4, 0.3] }, { u: c, v: [0.6, -0.5] }, { u: 1, v: [0.45, -0.3] }],
    armR: [{ u: 0, v: [-0.25, 0] }, { u: 0.32, v: [-0.35, -0.45] }, { u: c, v: [-0.45, 0.5] }, { u: 1, v: [-0.4, 0.3] }],
    foreL: [{ u: 0, v: [-0.15] }, { u: 1, v: [-0.3] }],
    foreR: [{ u: 0, v: [-0.15] }, { u: 1, v: [-0.5] }]
  };
}

function twoBone(hip, ankle, pole) {
  let d = Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1], ankle[2] - hip[2]);
  const max = (L1 + L2) * 0.9995;
  const dir = [(ankle[0] - hip[0]) / d, (ankle[1] - hip[1]) / d, (ankle[2] - hip[2]) / d];
  if (d > max) { d = max; ankle = [hip[0] + dir[0] * d, hip[1] + dir[1] * d, hip[2] + dir[2] * d]; }
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const dp = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2];
  let pp = [pole[0] - dir[0] * dp, pole[1] - dir[1] * dp, pole[2] - dir[2] * dp];
  const pl = Math.hypot(...pp) || 1; pp = pp.map((x) => x / pl);
  const knee = [hip[0] + dir[0] * a + pp[0] * h, hip[1] + dir[1] * a + pp[1] * h, hip[2] + dir[2] * a + pp[2] * h];
  return { knee, ankle, clamped: d >= max - 1e-9 };
}
const norm3 = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function solveFrame(ni, keys, u) {
  const q = {};
  const hv = hermite(keys.hips, u);
  const hipPos = [hv[0], hv[1], hv[2]];
  const yaw = hermite(keys.hipYaw, u)[0], pitch = hermite(keys.hipPitch, u)[0];
  const Rh = qmul(qaxis(Y, yaw), qaxis(X, pitch));
  q.Hips = Rh;
  const spineP = hermite(keys.spinePitch, u)[0];
  q.Spine = qaxis(X, spineP);
  q.Chest = qmul(qaxis(Y, -0.5 * yaw), qaxis(X, spineP * 0.5));
  const legs = {};
  for (const [side, hipOff, ankleKey, pitchKey] of [["Right", HIP_R, keys.ankleR, keys.pitchR], ["Left", HIP_L, keys.ankleL, null]]) {
    const hip = add3(hipPos, qrot(Rh, hipOff));
    const ankle = hermite(ankleKey, u);
    const ik = twoBone(hip, ankle, Z);
    const thighW = qalign([0, -1, 0], norm3(sub3(ik.knee, hip)));
    const shinW = qalign([0, -1, 0], norm3(sub3(ik.ankle, ik.knee)));
    const footPitch = pitchKey ? hermite(pitchKey, u)[0] : 0;
    const footW = qaxis(X, footPitch);
    q[`${side}UpperLeg`] = qmul(qconj(Rh), thighW);
    q[`${side}LowerLeg`] = qmul(qconj(thighW), shinW);
    q[`${side}Foot`] = qmul(qconj(shinW), footW);
    legs[side] = { hip, knee: ik.knee, ankle: ik.ankle, target: ankle, clamped: ik.clamped };
  }
  const chestW = qmul(qmul(Rh, q.Spine), q.Chest);
  for (const [side, k1, k2] of [["Left", keys.armL, keys.foreL], ["Right", keys.armR, keys.foreR]]) {
    const [abd, swing] = hermite(k1, u);
    const upperW = qmul(chestW, qmul(qaxis(Z, abd), qaxis(X, swing)));
    q[`${side}UpperArm`] = qmul(qconj(chestW), upperW);
    q[`${side}Forearm`] = qaxis(X, hermite(k2, u)[0]);
  }
  return { q, hipPos, legs };
}

export function bakeClips(inPath) {
  const glb = readGlb(inPath);
  const ni = nodeIndex(glb);
  const frames = Math.round(CLIP_SECONDS * FPS) + 1;
  const times = Array.from({ length: frames }, (_, k) => +(k / FPS).toFixed(6));
  const boneNames = ["Hips", "Spine", "Chest", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot", "LeftUpperArm", "LeftForearm", "RightUpperArm", "RightForearm"];
  const clips = [];
  const report = {};
  for (const [name, amp] of Object.entries(VARIANTS)) {
    const keys = kickKeys(amp);
    const perFrame = [];
    for (let k = 0; k < frames; k++) perFrame.push(solveFrame(ni, keys, k / (frames - 1)));
    const tracks = [];
    for (const b of boneNames) {
      let prev = null;
      const values = perFrame.map((f) => {
        let v = qnorm(f.q[b]);
        if (prev && v[0] * prev[0] + v[1] * prev[1] + v[2] * prev[2] + v[3] * prev[3] < 0) v = v.map((x) => -x);
        prev = v; return v;
      });
      tracks.push({ node: ni.id(b), path: "rotation", values });
    }
    tracks.push({ node: ni.id("Hips"), path: "translation", values: perFrame.map((f) => f.hipPos) });
    clips.push({ name, times, tracks });
    report[name] = measure(glb, ni, { name, times, tracks }, perFrame);
  }
  return { glb, clips, report };
}

/** FK check + contact / drift numbers from the baked tracks themselves. */
function measure(glb, ni, clip, perFrame) {
  const trsAt = (k) => {
    const trs = ni.nodes.map((n) => ({ t: [...(n.translation || [0, 0, 0])], r: [...(n.rotation || [0, 0, 0, 1])] }));
    for (const tr of clip.tracks) trs[tr.node][tr.path === "rotation" ? "r" : "t"] = tr.values[k];
    return forward(glb, trs);
  };
  const frames = clip.times.length;
  const kc = Math.round(CONTACT_FRAC * (frames - 1));
  const tip = (f) => add3(f.pos[ni.id("RightFoot")], qrot(f.rot[ni.id("RightFoot")], TOE_POINT));
  const fk = [];
  let maxIkErr = 0, maxLeftDrift = 0, clamped = 0;
  const left0 = trsAt(0).pos[ni.id("LeftFoot")];
  for (let k = 0; k < frames; k++) {
    const f = trsAt(k);
    fk.push(f);
    const a = f.pos[ni.id("RightFoot")], t = perFrame[k].legs.Right.ankle;
    maxIkErr = Math.max(maxIkErr, Math.hypot(a[0] - t[0], a[1] - t[1], a[2] - t[2]));
    const l = f.pos[ni.id("LeftFoot")];
    maxLeftDrift = Math.max(maxLeftDrift, Math.hypot(l[0] - left0[0], l[1] - left0[1], l[2] - left0[2]));
    if (perFrame[k].legs.Right.clamped) clamped++;
  }
  const dt = 1 / FPS;
  const v = (k) => { const a = tip(fk[k - 1]), b = tip(fk[k + 1]); return [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt), (b[2] - a[2]) / (2 * dt)]; };
  const tipC = tip(fk[kc]), vC = v(kc);
  const horiz = Math.atan2(vC[0], vC[2]) * 180 / Math.PI;       // yaw of the swing velocity vs model forward (+z)
  const elev = Math.atan2(vC[1], Math.hypot(vC[0], vC[2])) * 180 / Math.PI;
  const speeds = []; for (let k = 1; k < frames - 1; k++) speeds.push(Math.hypot(...v(k)));
  const toBall = Math.hypot(tipC[0] - BALL_MODEL[0], tipC[1] - BALL_MODEL[1], tipC[2] - BALL_MODEL[2]);
  const minY = Math.min(...fk.map((f) => Math.min(f.pos[ni.id("RightFoot")][1], f.pos[ni.id("LeftFoot")][1])));
  const kneeAngle = (f) => {
    const h = f.pos[ni.id("RightUpperLeg")], kn = f.pos[ni.id("RightLowerLeg")], an = f.pos[ni.id("RightFoot")];
    const a = norm3(sub3(h, kn)), b = norm3(sub3(an, kn));
    return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
  };
  const stride = fk.map((f) => f.pos[ni.id("RightFoot")][2]);
  return {
    amp: VARIANTS[clip.name], contactFrame: kc, contactTimeFrac: kc / (frames - 1),
    ikMaxErrorM: +maxIkErr.toFixed(6), clampedFrames: clamped,
    contactTipToBallCenterM: +toBall.toFixed(4), ballRadiusM: BALL_RADIUS_MODEL,
    contactTipSpeedModelUnitsPerSec: +Math.hypot(...vC).toFixed(3), peakTipSpeed: +Math.max(...speeds).toFixed(3),
    contactSwingYawDeg: +horiz.toFixed(2), contactSwingElevationDeg: +elev.toFixed(2),
    plantFootMaxDriftModelUnits: +maxLeftDrift.toFixed(6), lowestAnkleY: +minY.toFixed(4),
    kneeInteriorAtContactDeg: +kneeAngle(fk[kc]).toFixed(1), backswingAnkleZ: +Math.min(...stride).toFixed(3), followThroughAnkleZ: +Math.max(...stride).toFixed(3)
  };
}

if (process.argv[1] && process.argv[1].endsWith("bake-kick.mjs") && process.argv[2] && process.argv[3]) {
  const { glb, clips, report } = bakeClips(process.argv[2]);
  const out = withAnimations(glb, clips);
  const w = writeGlb(process.argv[3], out);
  const summary = { input: process.argv[2], output: process.argv[3], ...w, clips: report };
  if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
