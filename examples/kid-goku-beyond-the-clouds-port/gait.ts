/**
 * Planted-foot run gait for the hero. The Meshy run clip plants a foot at about 3.3 m/s but the sim moves the kid at 14.5 m/s
 * (up to ~19 m/s boosted), so no clip speed-up can stop the slide. This module drives both legs by two-bone IK instead: each
 * stance foot is pinned to a ground point while the hips travel over it, cadence follows ground speed, the swing foot returns on an
 * arc and the hips lean and dip. Output is a bone overlay (hips position+rotation, both legs) for `setAnimationPose`.
 * Pure TypeScript, no engine imports; the geometry comes from the hero skeleton (`legcycle.ts`, generated from the GLB).
 */
import { HERO_RIG, LEG_CLIPS, LEG_SAMPLES, type Q4 } from "./legcycle";
import { CONTACT_PHASE } from "./locomotion";

type V3 = [number, number, number];
type Q = [number, number, number, number];

const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a: V3): V3 => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = (a: Q): Q => [-a[0], -a[1], -a[2], a[3]];
const qnorm = (a: Q): Q => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };
export function qrot(q: Q, v: V3): V3 {
  const t = vscale(vcross([q[0], q[1], q[2]], v), 2);
  return vadd(vadd(v, vscale(t, q[3])), vcross([q[0], q[1], q[2]], t));
}
function fromTo(a: V3, b: V3): Q {
  const d = vdot(a, b);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? vcross(a, [1, 0, 0]) : vcross(a, [0, 1, 0]); const n = vnorm(ax); return [n[0], n[1], n[2], 0]; }
  const c = vcross(a, b);
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let c = b;
  if (d < 0) { c = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, a[3] + (c[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return [a[0] * w1 + c[0] * w2, a[1] * w1 + c[1] * w2, a[2] * w1 + c[2] * w2, a[3] * w1 + c[3] * w2];
}
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export type Side = "left" | "right";
const NAMES = {
  left: { up: "LeftUpLeg", leg: "LeftLeg", foot: "LeftFoot" },
  right: { up: "RightUpLeg", leg: "RightLeg", foot: "RightFoot" }
} as const;

/** Hero node fit: the model is scaled so its mesh is `targetHeight` tall. Metres per skeleton node unit. */
export const HERO_TARGET_HEIGHT = 1.5;
export const UNIT = HERO_RIG.armatureScale * (HERO_TARGET_HEIGHT / HERO_RIG.meshHeight);
const rigT = (n: keyof typeof HERO_RIG.nodes): V3 => HERO_RIG.nodes[n].t as unknown as V3;
/** The Meshy skeleton is not symmetric (left and right leg lengths differ by about 1 cm at the hero's size), so every solve uses its own side's bone lengths. */
export const LEG_LENGTHS: Readonly<Record<"left" | "right", { readonly thigh: number; readonly shin: number }>> = {
  left: { thigh: vlen(rigT("LeftLeg")) * UNIT, shin: vlen(rigT("LeftFoot")) * UNIT },
  right: { thigh: vlen(rigT("RightLeg")) * UNIT, shin: vlen(rigT("RightFoot")) * UNIT }
};
export const LEG_REACH = Math.min(LEG_LENGTHS.left.thigh + LEG_LENGTHS.left.shin, LEG_LENGTHS.right.thigh + LEG_LENGTHS.right.shin);
/** +1 when the model faces +Z (glTF front), which is where the knees bend. */
const FORWARD: V3 = [0, 0, 1];

const sampleQ = (frames: readonly Q4[], phase: number): Q => {
  const p = (((phase % 1) + 1) % 1) * LEG_SAMPLES;
  const k = Math.floor(p), f = p - k;
  return slerp(frames[k % LEG_SAMPLES] as Q, frames[(k + 1) % LEG_SAMPLES] as Q, f);
};
const sampleT = (frames: readonly (readonly [number, number, number])[], phase: number): V3 => {
  const p = (((phase % 1) + 1) % 1) * LEG_SAMPLES;
  const k = Math.floor(p), f = p - k;
  const a = frames[k % LEG_SAMPLES]!, b = frames[(k + 1) % LEG_SAMPLES]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

export interface GaitBoneTransform {
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
}
export interface GaitPose { readonly bones: Record<string, GaitBoneTransform>; readonly mode: "overlay" }

export interface GaitParams {
  /** Steps per second (alternating feet) at a ground speed. */
  readonly cadence: number;
  /** Seconds one leg takes for a full cycle. */
  readonly cycle: number;
  /** Seconds a foot stays planted. */
  readonly stance: number;
  /** Stance half-length: how far the planted ankle sits ahead of and behind the hips. */
  readonly excursion: number;
  /** Hip joint height above the floor at touchdown (m). */
  readonly hipHeight: number;
  /** Forward lean of the hips (rad). */
  readonly lean: number;
}

/** Clip phase at which the clip's left foot lands; the clip is sampled at gait phase plus this so its arms and hips agree with the gait's left touchdown. */
export const CLIP_TOUCHDOWN_LEFT = CONTACT_PHASE.run.left;

/** Smallest interior knee angle (thigh to shin) the gait allows, in radians. */
const MAX_KNEE_FLEX = (38 * Math.PI) / 180;

/** Ankle joint height above the floor when a foot is planted, from the rest pose (m). */
export const ANKLE_HEIGHT = 0.1;
const GRAVITY = 9.81;

/** Tuning knobs (exported so the probe can sweep them): stance excursion cap, the straight-up/straight-down seconds around lift-off and touchdown, and the horizontal reach kept for them. */
export const TUNE = { eCap: 0.34, pause: 0.006, reach: 0.45, lift0: 0.12, liftV: 0.012, dipBase: 0.045 };

export function gaitParams(speed: number): GaitParams {
  const v = Math.max(0, speed);
  const cadence = clamp(2.8 + 0.085 * v, 2.8, 4.6);
  const cycle = 2 / cadence;
  const eCap = Math.max(0.08, Math.min(TUNE.eCap, TUNE.reach - v * TUNE.pause));
  const stance = Math.min((2 * eCap) / Math.max(v, 1e-3), 0.46 * cycle);
  const excursion = (v * stance) / 2;
  const hipHeight = ANKLE_HEIGHT + Math.sqrt(Math.max(0.01, (0.955 * LEG_REACH) ** 2 - excursion * excursion));
  const lean = clamp(0.012 * v, 0, 0.26);
  return { cadence, cycle, stance, excursion, hipHeight, lean };
}

/** Where a leg's ankle should be, relative to the hero origin, at a leg phase (0..1, 0 = touchdown) and the lateral hip offset. Returns [z ahead, y above floor]. */
export function ankleTarget(p: GaitParams, v: number, legPhase: number): { z: number; y: number; planted: boolean } {
  const stanceFrac = p.stance / p.cycle;
  if (legPhase < stanceFrac) {
    const u = legPhase / stanceFrac;
    return { z: p.excursion - 2 * p.excursion * u, y: ANKLE_HEIGHT, planted: true };
  }
  const w = (legPhase - stanceFrac) / (1 - stanceFrac);
  const tsw = (1 - stanceFrac) * p.cycle;
  // world-frame swing: the foot rises straight up for `pause` seconds, travels with zero world speed at both ends, then drops straight down,
  // so the planted-height window is never crossed while the foot still moves over the ground
  const stride = v * p.cycle;
  const t = w * tsw;
  const u = clamp((t - TUNE.pause) / Math.max(1e-3, tsw - 2 * TUNE.pause), 0, 1);
  const s = u * u * u * (u * (u * 6 - 15) + 10);
  const worldZ = p.excursion + stride * s;
  const bodyZ = v * (p.stance + t);
  const lift = clamp(TUNE.lift0 + TUNE.liftV * v, TUNE.lift0, 0.34);
  const y = ANKLE_HEIGHT + lift * Math.pow(Math.max(0, Math.sin(Math.PI * w)), 0.5);
  return { z: worldZ - bodyZ, y, planted: false };
}

/** Hip joint height above the floor over a step (stance dip, small flight arc). */
export function hipHeightAt(p: GaitParams, stepPhase: number): number {
  const stepT = p.cycle / 2;
  const ds = Math.min(0.95, p.stance / stepT);
  const dip = clamp(TUNE.dipBase + 0.0015 * (p.excursion * 2 / Math.max(p.stance, 1e-3)), TUNE.dipBase, 0.085);
  if (stepPhase < ds) return p.hipHeight - dip * Math.sin((Math.PI * stepPhase) / ds);
  const w = (stepPhase - ds) / (1 - ds);
  const tf = (1 - ds) * stepT;
  const arc = Math.min(0.05, (GRAVITY * tf * tf) / 8);
  return p.hipHeight + arc * 4 * w * (1 - w);
}

interface LegSolve { up: Q; leg: Q; foot: Q; kneeWorld: V3; ankleWorld: V3; reached: boolean }

function solveLeg(side: Side, clipPhase: number, hipsT: V3, hipsR: Q, target: V3, clip: "run" | "walk"): LegSolve {
  const names = NAMES[side];
  const c = LEG_CLIPS[clip];
  const upT = vscale(rigT(names.up as keyof typeof HERO_RIG.nodes), UNIT);
  const qUp = sampleQ(c.bones[names.up as "LeftUpLeg"], clipPhase), qLeg = sampleQ(c.bones[names.leg as "LeftLeg"], clipPhase);
  const qFoot = sampleQ(c.feet[names.foot as "LeftFoot"], clipPhase);
  const pHip = vadd(hipsT, qrot(hipsR, upT));
  const a1 = vnorm(rigT(names.leg as keyof typeof HERO_RIG.nodes));
  const a2 = vnorm(rigT(names.foot as keyof typeof HERO_RIG.nodes));
  const delta = vsub(target, pHip);
  const dist = vlen(delta);
  const { thigh: THIGH, shin: SHIN } = LEG_LENGTHS[side];
  const reach = THIGH + SHIN;
  // a knee folds to about 40 degrees at most (heel toward the buttock), so the swing foot never gets closer to the hip than that allows
  const minD = Math.sqrt(THIGH * THIGH + SHIN * SHIN - 2 * THIGH * SHIN * Math.cos(MAX_KNEE_FLEX));
  const d = clamp(dist, Math.max(Math.abs(THIGH - SHIN) + 1e-4, minD), reach * 0.9995);
  const u = vscale(delta, 1 / (dist || 1));
  const cosA = clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  let w = vsub(FORWARD, vscale(u, vdot(FORWARD, u)));
  if (vlen(w) < 1e-6) w = [0, 0, 1];
  w = vnorm(w);
  const knee = vadd(pHip, vscale(vadd(vscale(u, cosA), vscale(w, sinA)), THIGH));
  const ankle = vadd(pHip, vscale(u, d));
  const d1 = vnorm(vsub(knee, pHip)), d2 = vnorm(vsub(ankle, knee));
  const refUpWorld = qmul(hipsR, qUp);
  const upWorld = qmul(fromTo(qrot(refUpWorld, a1), d1), refUpWorld);
  const refLegWorld = qmul(upWorld, qLeg);
  const legWorld = qmul(fromTo(qrot(refLegWorld, a2), d2), refLegWorld);
  const clipHipsR = sampleQ(c.hipsR, clipPhase);
  const clipFootWorld = qmul(qmul(qmul(clipHipsR, qUp), qLeg), qFoot);
  return {
    up: qnorm(qmul(qinv(hipsR), upWorld)),
    leg: qnorm(qmul(qinv(upWorld), legWorld)),
    foot: qnorm(qmul(qinv(legWorld), clipFootWorld)),
    kneeWorld: knee,
    ankleWorld: ankle,
    reached: dist <= reach * 0.9995
  };
}

export interface GaitState {
  readonly pose: GaitPose | undefined;
  readonly params: GaitParams;
  /** Weight of the planted gait against the clip (0 = clip only). */
  readonly weight: number;
  /** Leg cycles completed, fractional. */
  readonly phase: number;
}

/** Bone names the overlay writes. */
export const GAIT_BONES = ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"] as const;

const obj = (q: Q): GaitBoneTransform["rotation"] => ({ x: q[0], y: q[1], z: q[2], w: q[3] });

/** World pose of the planted gait at a leg-cycle phase and ground speed, as a bone overlay. The clip's own hips motion and foot roll are sampled at the same cycle position. */
export function plantedGaitPose(speed: number, phase: number, weight = 1, clip: "run" | "walk" = "run"): GaitPose | undefined {
  if (weight <= 0) return undefined;
  const v = Math.max(0, speed);
  const p = gaitParams(v);
  const phL = ((phase % 1) + 1) % 1, phR = (phL + 0.5) % 1;
  const stepPhase = (phL * 2) % 1;
  const clipPhase = phL + CLIP_TOUCHDOWN_LEFT;
  const hipsClipT = sampleT(LEG_CLIPS[clip].hipsT, clipPhase);
  const hipsClipR = sampleQ(LEG_CLIPS[clip].hipsR, clipPhase);
  const lean = qnorm([Math.sin(p.lean / 2), 0, 0, Math.cos(p.lean / 2)]);
  const hipsR = qmul(lean, hipsClipR);
  const Hj = hipHeightAt(p, stepPhase);
  const hipsOffset = qrot(hipsR, vscale(rigT("LeftUpLeg"), UNIT));
  const hipsT: V3 = [hipsClipT[0]! * UNIT, Hj - hipsOffset[1], hipsClipT[2]! * UNIT];
  const sides: Side[] = ["left", "right"];
  const bones: Record<string, GaitBoneTransform> = {};
  const clipHips = LEG_CLIPS[clip];
  for (const side of sides) {
    const leg = side === "left" ? phL : phR;
    const t = ankleTarget(p, v, leg);
    // the lateral ankle position is the hip's rest offset, not the swaying hip: a planted foot must not follow the hips sideways
    const tgt: V3 = [rigT(NAMES[side].up as keyof typeof HERO_RIG.nodes)[0] * UNIT, t.y, t.z];
    const s = solveLeg(side, clipPhase, hipsT, hipsR, tgt, clip);
    const names = NAMES[side];
    const clipUp = sampleQ(clipHips.bones[names.up as "LeftUpLeg"], clipPhase), clipLeg = sampleQ(clipHips.bones[names.leg as "LeftLeg"], clipPhase), clipFoot = sampleQ(clipHips.feet[names.foot as "LeftFoot"], clipPhase);
    bones[names.up] = { rotation: obj(slerp(clipUp, s.up, weight)) };
    bones[names.leg] = { rotation: obj(slerp(clipLeg, s.leg, weight)) };
    bones[names.foot] = { rotation: obj(slerp(clipFoot, s.foot, weight)) };
  }
  const hipsPosCm: V3 = [hipsClipT[0]! + (hipsT[0] / UNIT - hipsClipT[0]!) * weight, hipsClipT[1]! + (hipsT[1] / UNIT - hipsClipT[1]!) * weight, hipsClipT[2]! + (hipsT[2] / UNIT - hipsClipT[2]!) * weight];
  bones.Hips = { position: { x: hipsPosCm[0], y: hipsPosCm[1], z: hipsPosCm[2] }, rotation: obj(slerp(hipsClipR, hipsR, weight)) };
  return { bones, mode: "overlay" };
}

/** Cadence-driven gait phase and the blend weight against the clip for the current ground speed. */
export function gaitWeight(speed: number): number { return smooth(2.2, 4.2, speed); }

export function advanceGaitPhase(phase: number, speed: number, dt: number): number {
  const p = gaitParams(speed);
  return phase + dt / p.cycle;
}

/** Number of foot touchdowns between two phases: left at phase 0, right at 0.5. */
export function gaitTouchdowns(from: number, to: number): { left: number; right: number } {
  const count = (at: number): number => Math.floor(to - at + 1e-9) - Math.floor(from - at + 1e-9);
  return { left: Math.max(0, count(0)), right: Math.max(0, count(0.5)) };
}
