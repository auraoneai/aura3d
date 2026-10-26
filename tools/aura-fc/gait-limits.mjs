// Joint-range probe for the Aura FC athlete clips: hip flexion/abduction, knee flexion and thigh axial twist per clip (degrees).
import { readGlb, localPose, forward, clipDuration, qrot, qmul, qconj } from "./glb.mjs";

const DEG = 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const LEGS = { Left: ["LeftUpperLeg", "LeftLowerLeg", "LeftFoot"], Right: ["RightUpperLeg", "RightLowerLeg", "RightFoot"] };

function legAngles(fk, rest, names) {
  const [hn, kn, an] = names.map((n) => fk.id(n));
  const thigh = unit(sub(fk.pos[kn], fk.pos[hn]));
  const shin = unit(sub(fk.pos[an], fk.pos[kn]));
  const rThigh = unit(sub(rest.pos[kn], rest.pos[hn]));
  // sagittal (Y-Z plane, forward +Z): flexion positive when the knee is in front of the hip
  const flex = Math.atan2(thigh[2], -thigh[1]) * DEG - Math.atan2(rThigh[2], -rThigh[1]) * DEG;
  const abd = Math.atan2(thigh[0], -thigh[1]) * DEG - Math.atan2(rThigh[0], -rThigh[1]) * DEG;
  const knee = Math.acos(Math.max(-1, Math.min(1, dot(thigh, shin)))) * DEG;
  // knee must bend backward: the shin swings behind the thigh in the sagittal plane
  const shinBack = Math.atan2(shin[2], -shin[1]) - Math.atan2(thigh[2], -thigh[1]);
  const delta = qmul(fk.rot[hn], qconj(rest.rot[hn]));
  const s = dot(delta, rThigh);
  let twist = 2 * Math.atan2(s, delta[3]) * DEG;
  if (twist > 180) twist -= 360; if (twist < -180) twist += 360;
  return { flex, abd, knee, kneeForward: shinBack > 1e-3 && knee > 3, twist };
}

/** Min/max of each joint quantity over `samples` poses of each clip. */
export function gaitLimits(glb, clips = ["Walk_Loop", "Run", "Sprint_Loop"], samples = 48) {
  const rest = forward(glb, localPose(glb, null, 0));
  const out = {};
  for (const name of clips) {
    const anim = glb.json.animations.find((a) => a.name === name);
    if (!anim) continue;
    const dur = clipDuration(glb, anim);
    const acc = { hipFlexMin: 1e9, hipFlexMax: -1e9, abdMax: 0, kneeMax: 0, kneeForwardFrames: 0, twistMax: 0 };
    for (let k = 0; k < samples; k++) {
      const fk = forward(glb, localPose(glb, anim, (dur * k) / samples));
      for (const side of Object.keys(LEGS)) {
        const a = legAngles(fk, rest, LEGS[side]);
        acc.hipFlexMin = Math.min(acc.hipFlexMin, a.flex); acc.hipFlexMax = Math.max(acc.hipFlexMax, a.flex);
        acc.abdMax = Math.max(acc.abdMax, Math.abs(a.abd)); acc.kneeMax = Math.max(acc.kneeMax, a.knee);
        if (a.kneeForward) acc.kneeForwardFrames++; acc.twistMax = Math.max(acc.twistMax, Math.abs(a.twist));
      }
    }
    out[name] = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  }
  return out;
}

if (process.argv[1]?.endsWith("gait-limits.mjs") && process.argv[2]) {
  console.log(JSON.stringify(gaitLimits(readGlb(process.argv[2]), process.argv[3]?.split(",")), null, 1));
}
