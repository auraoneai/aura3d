/**
 * Stride-synced locomotion for the hero. The Meshy run clip plants a foot at about 3.3 m/s of ground speed at 1x, but the run
 * sim moves the kid at 14.5 m/s, so a clip played only faster slides. This maps sim speed to a cadence (clip rate, capped so the
 * legs never strobe) and a stride gain that widens the leg swing, and builds the leg-bone overlay pose for it.
 * Pure TypeScript: no engine imports. Candidate for promotion once the library stride helper lands.
 */
import { LEG_BONES, LEG_CLIPS, LEG_SAMPLES, type LegBone } from "./legcycle";

type Quat = readonly [number, number, number, number];
export type LocoClip = "run" | "walk";

/** Planted-foot ground speed of each clip at rate 1, in metres per second at the hero's 1.5 m target height (measured from the GLB with forward kinematics). */
export const CLIP_FOOT_SPEED: Readonly<Record<LocoClip, number>> = { run: 3.31, walk: 0.96 };
/** Clip phase (0..1) at which each foot touches down. */
export const CONTACT_PHASE: Readonly<Record<LocoClip, { left: number; right: number }>> = { run: { left: 0.375, right: 0.828 }, walk: { left: 0.328, right: 0.047 } };
export const MAX_RATE = 1.8;
export const MAX_GAIN = 1.8;

export interface Gait { readonly rate: number; readonly gain: number; readonly footSpeed: number; readonly slideRatio: number }

/** Cadence and stride gain for a ground speed. footSpeed is the planted-foot speed the legs deliver; slideRatio is the share of ground speed the feet still slide (0 = planted). */
export function gaitFor(clip: LocoClip, speed: number): Gait {
  const f = CLIP_FOOT_SPEED[clip];
  const v = Math.max(0, speed);
  const rate = Math.min(MAX_RATE, Math.max(0.35, v / f));
  const gain = v > 0 ? Math.min(MAX_GAIN, Math.max(1, v / (f * rate))) : 1;
  const footSpeed = f * rate * gain;
  const slideRatio = v > 1e-6 ? Math.max(0, 1 - footSpeed / v) : 0;
  return { rate, gain, footSpeed, slideRatio };
}

const qdot = (a: Quat, b: Quat): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qnorm = (a: readonly number[]): Quat => { const l = Math.hypot(a[0]!, a[1]!, a[2]!, a[3]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l, a[3]! / l]; };
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = (a: Quat): Quat => [-a[0], -a[1], -a[2], a[3]];
function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = qdot(a, b), c = b;
  if (d < 0) { c = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, a[3] + (c[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return [a[0] * w1 + c[0] * w2, a[1] * w1 + c[1] * w2, a[2] * w1 + c[2] * w2, a[3] * w1 + c[3] * w2];
}
/** q^k for a unit quaternion (scales the rotation angle about its axis). */
function qpow(q: Quat, k: number): Quat {
  const w = Math.min(1, Math.max(-1, q[3]));
  const half = Math.acos(w), s = Math.sin(half);
  if (s < 1e-7) return [0, 0, 0, 1];
  const ax = [q[0] / s, q[1] / s, q[2] / s], nh = half * k, ns = Math.sin(nh);
  return [ax[0]! * ns, ax[1]! * ns, ax[2]! * ns, Math.cos(nh)];
}

const MEANS = new Map<string, Quat>();
function meanOf(clip: LocoClip, bone: LegBone): Quat {
  const key = `${clip}:${bone}`;
  let m = MEANS.get(key);
  if (m) return m;
  const frames = LEG_CLIPS[clip].bones[bone];
  const ref = frames[0] as Quat;
  const acc = [0, 0, 0, 0];
  for (const f of frames) { const s = qdot(f as Quat, ref) < 0 ? -1 : 1; for (let i = 0; i < 4; i++) acc[i]! += s * f[i]!; }
  m = qnorm(acc);
  MEANS.set(key, m);
  return m;
}

/** The clip's own local rotation of a leg bone at a phase (0..1), looped. */
export function legRotationAt(clip: LocoClip, bone: LegBone, phase: number): Quat {
  const frames = LEG_CLIPS[clip].bones[bone];
  const p = ((phase % 1) + 1) % 1 * LEG_SAMPLES;
  const k = Math.floor(p), f = p - k;
  return slerp(frames[k % LEG_SAMPLES] as Quat, frames[(k + 1) % LEG_SAMPLES] as Quat, f);
}

/** Leg rotation with the swing about the cycle mean scaled by `gain` (gain 1 returns the clip's own pose). */
export function widenedLegRotation(clip: LocoClip, bone: LegBone, phase: number, gain: number): Quat {
  const q = legRotationAt(clip, bone, phase);
  if (gain === 1) return q;
  const mean = meanOf(clip, bone);
  let delta = qmul(qinv(mean), q);
  if (delta[3] < 0) delta = [-delta[0], -delta[1], -delta[2], -delta[3]];
  return qnorm(qmul(mean, qpow(delta, gain)));
}

/** Overlay pose (leg bones only) for an animation pose with mode "overlay"; the clip keeps driving every other bone. */
export function legOverlayPose(clip: LocoClip, phase: number, gain: number): { readonly bones: Record<string, { readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } }>; readonly mode: "overlay" } {
  const bones: Record<string, { readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } }> = {};
  for (const bone of LEG_BONES) {
    const q = widenedLegRotation(clip, bone, phase, gain);
    bones[bone] = { rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } };
  }
  return { bones, mode: "overlay" };
}

/** Number of foot touchdowns between two clip phases (cycles may wrap), for footstep dust and sound. */
export function touchdowns(clip: LocoClip, from: number, to: number): { left: number; right: number } {
  const c = CONTACT_PHASE[clip];
  const count = (at: number): number => Math.floor(to - at + 1e-9) - Math.floor(from - at + 1e-9);
  return { left: Math.max(0, count(c.left)), right: Math.max(0, count(c.right)) };
}
