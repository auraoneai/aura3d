/**
 * Idol mocap pass (render layer only): every Idol actor (hero and its forms, shadow clones, foot soldiers, oni brutes,
 * casters, scouts) plays text-to-motion clips captured on fal.ai (`tools/idol/motion.mjs`, spec
 * tools/idol/motion-specs/shadowstep-gauntlet.json -> apps/showcase-ninja-runner-port/src/motion.generated.ts) through the
 * shared animator (`apps/showcase-port-shared/idol/motion.ts`, cross-fades on real frame time). The sim still picks the
 * game clip and its time exactly as before; this module only maps that choice onto a captured clip:
 *
 * - locomotion (run / dash) is driven by DISTANCE travelled (`locomotionTime`), so planted feet do not skate at any sim
 *   speed; the hero's jump follows the sim's ballistic arc (`airTime`, gravity 25 m/s^2); scrubbed clips (attacks, hit,
 *   death) keep the sim's progress fraction; idle / guard loops free-run.
 * - the canonical humanoid pose (local rotations, hips offset) becomes the model-space segment rotations the existing
 *   Idol rig driver (`idolRig.ts`) solves, so weapon / orb / scarf sockets keep reading the posed skeleton.
 */
import {
  createHumanoidAnimator,
  humanoidAirTime as airTime,
  humanoidLocomotionTime as locomotionTime,
  quatMul,
  quatPow,
  type HumanoidAnimator as MotionAnimator,
  type HumanoidMotionRequest as MotionRequest,
  type HumanoidPoseInput,
  type HumanoidRole,
  type Quat as HQuat
} from "@aura3d/engine/animation";
import { MOTION_CLIPS, type MotionClipName } from "../../../apps/showcase-ninja-runner-port/src/motion.generated";
import type { CharacterId } from "../models";
import type { IdolSegmentPose, Quat, V3 } from "./idolRig";

/** What the world knows about the actor this frame (all render-side; nothing feeds back into the sim). */
export interface IdolMotionContext {
  /** Course distance of the actor (m); only its frame-to-frame change is used. */
  readonly travel: number;
  /** Frame time (s). */
  readonly dt: number;
  /** Height above the ground and vertical speed (hero jump sync). */
  readonly y?: number;
  readonly vy?: number;
  /** Hero shadow-step dash. */
  readonly dash?: boolean;
}

/** The sim's choice for the slot: game clip, its time and length (`ProceduralNinjaActor.__clip`). */
export interface GameClipState { readonly clip: string; readonly time: number; readonly duration: number }

const GRAVITY = -25;
const isHeroLike = (id: CharacterId): boolean => id === "hero" || id === "sage";

/** Game clip -> captured clip for a character. */
export function motionClipFor(id: CharacterId, clip: string, dash = false): MotionClipName | null {
  switch (clip) {
    // Every runner (hero, its forms, clones, every enemy; dashing too) runs on the captured sprint, played by distance so
    // the stance foot stays planted, and straightened by `uprightRun`. The captured "Dash" (a face-down lunge with both
    // arms thrown up behind) read on the real GPU as every figure kneeling with its arms up in a V; it is not used.
    case "run": return "Run";
    case "jump": return "Jump";
    case "slide": return "Slide";
    case "idle": return isHeroLike(id) ? "Idle" : "Guard";
    case "hit": return "Hit";
    case "death": return "Death";
    case "punch": return id === "brute" ? "Smash" : "Slash";
    case "sword": return isHeroLike(id) ? "Throw" : "Slash";
    case "jab": return "Jab";
    case "throw": return "Throw";
    case "cast": case "block": return "Cast"; // "block" is the caster's attack clip on a borrowed soldier rig
    default: return null;
  }
}

/** Seconds into the captured clip's take-off (the crouch before leaving the ground). */
const takeoffOf = (c: MotionClipName): number => Math.max(0, Number(MOTION_CLIPS[c].meta?.lowTime ?? MOTION_CLIPS[c].meta?.apexTime ?? 0.6) * (MOTION_CLIPS[c].meta?.lowTime !== undefined ? 1 : 0.55));

/** Final touches on the animator output: the captured jump's own 1.7 m hip rise is dropped (the sim lifts the body). */
export function finishMotionPose(clip: MotionClipName, p: HumanoidPoseInput): HumanoidPoseInput {
  if (clip !== "Jump" || !p.hipsOffset || p.hipsOffset[1] <= 0) return p;
  return { ...p, hipsOffset: [p.hipsOffset[0], 0, p.hipsOffset[2]] };
}

/** Most a running torso leans forward from upright (rad): a sprint lean, like the procedural run's 0.39 rad body pitch. */
export const RUN_MAX_LEAN = 0.4;
/** Lowest an upper arm may point while running: tucked cleanly down-and-in (~35 deg below horizontal, not airplane-wide). */
export const RUN_ARM_MAX_Y = -0.58;
/** Maximum outward lateral component (|dir.x|) of a running upper arm so runners keep arms near ribs instead of T-pose splay. */
export const RUN_ARM_MAX_OUT = 0.34;
/** Highest a forearm may point while running (direction y): a pumping hand stays below the shoulder. */
export const RUN_FOREARM_MAX_Y = 0.08;

const rotV = (q: readonly number[], v: readonly number[]): V3 => {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
};
const mul = (a: readonly number[], b: readonly number[]): Quat => [
  a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
  a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
  a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
  a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!
];
/** Shortest rotation taking unit `f` onto unit `t`. */
function fromTo(f: V3, t: V3): Quat {
  const d = f[0] * t[0] + f[1] * t[1] + f[2] * t[2];
  const c: V3 = [f[1] * t[2] - f[2] * t[1], f[2] * t[0] - f[0] * t[2], f[0] * t[1] - f[1] * t[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** A runner's head (and neck) faces the way it runs: limits on its yaw / pitch (down +) / roll against travel (rad). */
export const RUN_HEAD_YAW = (10 * Math.PI) / 180;
export const RUN_HEAD_PITCH = (8 * Math.PI) / 180;
export const RUN_HEAD_ROLL = (5 * Math.PI) / 180;
/**
 * The head built from its own captured direction, not carried by the torso correction: the clip's head stays near
 * forward while its chest twists +-35 deg, so un-twisting the chest and applying the same turn to the head swung the
 * head +-35 deg the other way (the owner's "rotating her head so much"). Its yaw, pitch and roll against travel are
 * scaled down and pass through smooth caps (+-10 / +-8 / +-5 deg).
 */
export function stableHead(head: Quat): Quat {
  const f = rotV(head, [0, 0, 1]), u = rotV(head, [0, 1, 0]);
  const yaw = Math.atan2(f[0], f[2]), pitch = Math.atan2(-f[1], Math.hypot(f[0], f[2])), roll = Math.atan2(-u[0], u[1]);
  return mul(qAxisY(softCap(yaw * 0.5, RUN_HEAD_YAW)), mul(qAxisX(softCap(pitch * 0.2, RUN_HEAD_PITCH)), qAxisZ(softCap(roll * 0.4, RUN_HEAD_ROLL))));
}

/** Gains on the captured sprint's torso / hips twist (yaw), side roll and forward lean while running. */
export const RUN_TORSO_YAW_GAIN = 0.23;
export const RUN_TORSO_ROLL_GAIN = 0.35;
export const RUN_HIPS_YAW_GAIN = 0.6;
export const RUN_HIPS_ROLL_GAIN = 0.5;
export const RUN_LEAN_GAIN = 0.45;
const qAxisX = (a: number): Quat => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qAxisY = (a: number): Quat => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qAxisZ = (a: number): Quat => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
/** Smooth symmetric compressor: ~identity for small |x|, approaching +-cap. */
export const softCap = (x: number, cap: number): number => cap * Math.tanh(x / cap);
/** Smooth one-sided limit: identity up to 60% of `cap`, then eases toward `cap` (C1 continuous). */
export function softLimit(x: number, cap: number): number {
  const knee = cap * 0.6;
  return x <= knee ? x : knee + (cap - knee) * Math.tanh((x - knee) / (cap - knee));
}
/** `dir` eased down (about the horizontal axis through it) so its y stays under `maxY` (soft knee 0.2 below); null when clear. */
function lowerTo(dir: V3, maxY: number): Quat | null {
  const ty = softLimit(dir[1] - (maxY - 0.2), 0.2) + (maxY - 0.2);
  if (dir[1] <= ty + 1e-9) return null;
  const h = Math.hypot(dir[0], dir[2]);
  const k = Math.sqrt(Math.max(0, 1 - ty * ty));
  const t: V3 = h > 1e-6 ? [(dir[0] / h) * k, ty, (dir[2] / h) * k] : [0, ty, -k];
  return fromTo(dir, t);
}

/** Pulls an arm direction inward toward the body's sagittal plane (sideSign = +1 left / -1 right) so it never splays like a scarecrow. */
function tuckArmOut(dir: V3, sideSign: 1 | -1, maxOut: number, maxY: number): Quat | null {
  const out = dir[0] * sideSign;
  const clampedOut = out > maxOut ? maxOut : out < -0.22 ? -0.22 : out;
  const clampedY = Math.min(dir[1], maxY);
  if (Math.abs(clampedOut - out) < 1e-4 && clampedY >= dir[1] - 1e-4) return null;
  const tx = clampedOut * sideSign;
  const ty = clampedY;
  const rem = Math.max(0, 1 - tx * tx - ty * ty);
  const tz = (dir[2] >= 0 ? 1 : -1) * Math.sqrt(rem);
  const len = Math.hypot(tx, ty, tz) || 1;
  return fromTo(dir, [tx / len, ty / len, tz / len]);
}

/**
 * Rebuilds the torso (and pelvis) directly from bounded yaw/lean/roll (zero Euler-cancellation flips even when a
 * captured HY-Motion clip somersaults upside-down), then carries the arms smoothly by the delta `bodyNew * conj(bodyOld)`.
 */
function stabilizeTorso(
  seg: IdolSegmentPose,
  opts: { readonly maxLean: number; readonly leanGain: number; readonly maxRoll: number; readonly rollGain: number; readonly yawGain: number; readonly targetLean?: number }
): IdolSegmentPose {
  const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
  const up = rotV(seg.body, [0, 1, 0]), fw = rotV(seg.body, [0, 0, 1]);
  const rawLean = Math.atan2(up[2], Math.max(0.25, Math.abs(up[1])));
  const rawRoll = Math.atan2(-up[0], Math.max(0.25, Math.abs(up[1])));
  const rawYaw = Math.atan2(fw[0], fw[2]);
  const nextLean = opts.targetLean !== undefined
    ? opts.targetLean + softCap(rawLean * opts.leanGain, opts.maxLean)
    : softCap(rawLean * opts.leanGain, opts.maxLean);
  const nextRoll = softCap(rawRoll * opts.rollGain, opts.maxRoll);
  const nextYaw = softCap(rawYaw * opts.yawGain, 0.52);
  const nextBody = mul(qAxisY(nextYaw), mul(qAxisX(nextLean), qAxisZ(nextRoll)));
  const R = mul(nextBody, conj(seg.body));
  const out: IdolSegmentPose = {
    ...seg,
    body: nextBody,
    head: stableHead(seg.head),
    armL: mul(R, seg.armL),
    foreL: mul(R, seg.foreL),
    armR: mul(R, seg.armR),
    foreR: mul(R, seg.foreR)
  };
  if (seg.pelvis) {
    const pu = rotV(seg.pelvis, [0, 1, 0]), pf = rotV(seg.pelvis, [0, 0, 1]);
    const pLean = opts.targetLean !== undefined
      ? opts.targetLean * 0.65 + softCap(Math.atan2(pu[2], Math.max(0.25, Math.abs(pu[1]))) * 0.35, opts.maxLean)
      : softCap(Math.atan2(pu[2], Math.max(0.25, Math.abs(pu[1]))) * 0.45, opts.maxLean);
    const pRoll = softCap(Math.atan2(-pu[0], Math.max(0.25, Math.abs(pu[1]))) * opts.rollGain, opts.maxRoll);
    const pYaw = softCap(Math.atan2(pf[0], pf[2]) * opts.yawGain, 0.45);
    out.pelvis = mul(qAxisY(pYaw), mul(qAxisX(pLean), qAxisZ(pRoll)));
  }
  return out;
}

/** Keeps thighs aligned toward the forward/back stride plane so characters don't crab-splay sideways. */
function tidyLegs(seg: IdolSegmentPose, maxLegOut: number): IdolSegmentPose {
  const fixLeg = (leg: Quat, shin: Quat, foot: Quat, sideSign: 1 | -1): [Quat, Quat, Quat] => {
    const d = rotV(leg, [0, -1, 0]);
    const out = d[0] * sideSign;
    if (out <= maxLegOut && out >= -0.15) return [leg, shin, foot];
    const tx = Math.max(-0.15, Math.min(maxLegOut, out)) * sideSign;
    const rem = Math.max(0, 1 - tx * tx);
    const h = Math.hypot(d[1], d[2]) || 1;
    const scale = Math.sqrt(rem) / h;
    const q = fromTo(d, [tx, d[1] * scale, d[2] * scale]);
    return [mul(q, leg), mul(q, shin), mul(q, foot)];
  };
  const [legL, shinL, footL] = fixLeg(seg.legL, seg.shinL, seg.footL, 1);
  const [legR, shinR, footR] = fixLeg(seg.legR, seg.shinR, seg.footR, -1);
  return { ...seg, legL, shinL, footL, legR, shinR, footR };
}

/**
 * Straightens a captured running pose (model-space segment rotations, `segmentsFromHumanoid`): the torso pitches to at
 * most `RUN_MAX_LEAN` forward, each upper arm tucks close to the ribs (`|x| <= RUN_ARM_MAX_OUT`, `y <= RUN_ARM_MAX_Y`)
 * so runners pump front-to-back instead of splaying sideways like scarecrows, and each forearm stays below the shoulder.
 */
export function uprightRun(seg: IdolSegmentPose): IdolSegmentPose {
  const up = rotV(seg.body, [0, 1, 0]), fw = rotV(seg.body, [0, 0, 1]);
  const lean = Math.atan2(up[2], up[1]), roll = Math.atan2(-up[0], up[1]), yaw = Math.atan2(fw[0], fw[2]);
  const R = mul(qAxisZ(roll * (RUN_TORSO_ROLL_GAIN - 1)), mul(qAxisY(yaw * (RUN_TORSO_YAW_GAIN - 1)), qAxisX(softLimit(lean * RUN_LEAN_GAIN, RUN_MAX_LEAN) - lean)));
  const out = { ...seg, body: mul(R, seg.body), head: stableHead(seg.head), armL: mul(R, seg.armL), foreL: mul(R, seg.foreL), armR: mul(R, seg.armR), foreR: mul(R, seg.foreR) };
  if (seg.pelvis) {
    const pu = rotV(seg.pelvis, [0, 1, 0]), pf = rotV(seg.pelvis, [0, 0, 1]);
    const pr = Math.atan2(-pu[0], pu[1]), py = Math.atan2(pf[0], pf[2]);
    out.pelvis = mul(qAxisZ(pr * (RUN_HIPS_ROLL_GAIN - 1)), mul(qAxisY(py * (RUN_HIPS_YAW_GAIN - 1)), seg.pelvis));
  }
  const arm = (upper: Quat, fore: Quat, sideSign: 1 | -1): [Quat, Quat] => {
    const c = tuckArmOut(rotV(upper, [0, -1, 0]), sideSign, RUN_ARM_MAX_OUT, RUN_ARM_MAX_Y);
    if (c) { upper = mul(c, upper); fore = mul(c, fore); }
    const f = lowerTo(rotV(fore, [0, -1, 0]), RUN_FOREARM_MAX_Y);
    if (f) fore = mul(f, fore);
    // Keep forearm tucked slightly inward too so hands swing neatly at waist height.
    const fi = tuckArmOut(rotV(fore, [0, -1, 0]), sideSign, 0.36, RUN_FOREARM_MAX_Y);
    if (fi) fore = mul(fi, fore);
    return [upper, fore];
  };
  const [armL, foreL] = arm(out.armL, out.foreL, 1), [armR, foreR] = arm(out.armR, out.foreR, -1);
  return { ...out, armL, foreL, armR, foreR };
}

/**
 * Sanitizes non-run HY-Motion clips (`Jump`, `Slide`, `Slash`, `Throw`, `Jab`, `Smash`, `Cast`, `Hit`, `Idle`, `Guard`)
 * so every hero, clone, and enemy NPC keeps an athletic, upright shinobi silhouette with tucked limbs instead of
 * upside-down somersaults, sideways bike-crash flops, or scarecrow T-pose arms.
 */
export function sanitizeActionClip(clip: MotionClipName, seg: IdolSegmentPose): IdolSegmentPose {
  if (clip === "Death") return seg;
  if (clip === "Jump") {
    let out = stabilizeTorso(seg, { maxLean: 0.32, leanGain: 0.35, maxRoll: 0.14, rollGain: 0.25, yawGain: 0.35, targetLean: 0.16 });
    const aL = tuckArmOut(rotV(out.armL, [0, -1, 0]), 1, 0.42, -0.45);
    const aR = tuckArmOut(rotV(out.armR, [0, -1, 0]), -1, 0.42, -0.45);
    let foreL = aL ? mul(aL, out.foreL) : out.foreL;
    let foreR = aR ? mul(aR, out.foreR) : out.foreR;
    const fL = lowerTo(rotV(foreL, [0, -1, 0]), 0.12);
    const fR = lowerTo(rotV(foreR, [0, -1, 0]), 0.12);
    if (fL) foreL = mul(fL, foreL);
    if (fR) foreR = mul(fR, foreR);
    out = {
      ...out,
      armL: aL ? mul(aL, out.armL) : out.armL,
      foreL,
      armR: aR ? mul(aR, out.armR) : out.armR,
      foreR
    };
    return tidyLegs(out, 0.26);
  }
  if (clip === "Slide") {
    // Sleek low shinobi crouch/baseball slide leaning cleanly back (-32 deg), never rolling 69 deg sideways onto the road.
    let out = stabilizeTorso(seg, { maxLean: 0.32, leanGain: 0.35, maxRoll: 0.16, rollGain: 0.22, yawGain: 0.4, targetLean: -0.52 });
    const aL = tuckArmOut(rotV(out.armL, [0, -1, 0]), 1, 0.44, -0.28);
    const aR = tuckArmOut(rotV(out.armR, [0, -1, 0]), -1, 0.44, -0.28);
    out = {
      ...out,
      armL: aL ? mul(aL, out.armL) : out.armL,
      foreL: aL ? mul(aL, out.foreL) : out.foreL,
      armR: aR ? mul(aR, out.armR) : out.armR,
      foreR: aR ? mul(aR, out.foreR) : out.foreR
    };
    return tidyLegs(out, 0.28);
  }
  // Combat & idle clips (`Slash`, `Throw`, `Jab`, `Smash`, `Cast`, `Hit`, `Idle`, `Guard`):
  // keep upright heroic/enemy posture (never 107-136 deg upside-down twists) and rein in scarecrow arm/leg splay.
  const maxLean = clip === "Hit" ? 0.38 : 0.32;
  const maxRoll = clip === "Hit" ? 0.24 : 0.2;
  let out = stabilizeTorso(seg, { maxLean, leanGain: 0.38, maxRoll, rollGain: 0.3, yawGain: 0.55 });
  const maxArmY = clip === "Idle" || clip === "Guard" ? -0.55 : clip === "Smash" || clip === "Slash" ? 0.42 : 0.15;
  const maxOutL = clip === "Idle" || clip === "Guard" ? 0.34 : 0.48;
  const maxOutR = clip === "Idle" || clip === "Guard" ? 0.34 : 0.52;
  const aL = tuckArmOut(rotV(out.armL, [0, -1, 0]), 1, maxOutL, maxArmY);
  const aR = tuckArmOut(rotV(out.armR, [0, -1, 0]), -1, maxOutR, maxArmY);
  out = {
    ...out,
    armL: aL ? mul(aL, out.armL) : out.armL,
    foreL: aL ? mul(aL, out.foreL) : out.foreL,
    armR: aR ? mul(aR, out.armR) : out.armR,
    foreR: aR ? mul(aR, out.foreR) : out.foreR
  };
  return tidyLegs(out, 0.28);
}

export interface SlotMotion {
  readonly anim: MotionAnimator<MotionClipName>;
  walked: number;
  /** Distance the run cycle has been played over (`walked`, held to the cadence cap at speed). */
  stride: number;
  /** Smoothed ground speed (m/s) and whether the cadence cap is holding the cycle back (feet slide; no hips lock). */
  speed: number;
  capped: boolean;
  /** 1 = the cycle follows the planted stance foot (slow, uncapped), 0 = uniform rate (capped, feet glide); eased. */
  plant: number;
  lastTravel: number | null;
  /** Sideways hip shift (model units) holding the stance foot where it landed, and that foot's last raw x. */
  lockX: number;
  lockFoot: number;
  lockPrevX: number;
}
/**
 * Distance -> clip-time table of a locomotion clip measured on one drawn body: over the loop, how far the lower
 * (stance) foot slides back in model space. Playing the clip at the time this table gives for the distance covered keeps
 * that foot where it landed on THIS body's legs (the clip's own ground speed is measured on the capture skeleton).
 */
export interface StrideTable { readonly times: number[]; readonly dist: number[]; readonly cycle: number; readonly steps: number }
export function buildStrideTable(duration: number, footAt: (time: number) => { readonly l: V3; readonly r: V3 }, steps = 120): StrideTable {
  const times: number[] = [], dist: number[] = [0];
  let prev: { readonly l: V3; readonly r: V3 } | null = null;
  let footfalls = 0, lastLeft: boolean | null = null;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * duration;
    const f = footAt(t);
    times.push(t);
    const lower = f.l[1] <= f.r[1];
    if (lastLeft !== null && lower !== lastLeft) footfalls++;
    lastLeft = lower;
    if (prev) {
      const left = f.l[1] <= f.r[1];
      const back = (left ? prev.l[2] : prev.r[2]) - (left ? f.l[2] : f.r[2]);
      dist.push(dist[dist.length - 1]! + Math.max(0, back));
    }
    prev = { l: [...f.l] as V3, r: [...f.r] as V3 };
  }
  return { times, dist, cycle: dist[dist.length - 1]!, steps: Math.max(1, footfalls) };
}
export function strideTableTime(tab: StrideTable, distance: number): number {
  if (!(tab.cycle > 1e-6)) return 0;
  const x = ((distance % tab.cycle) + tab.cycle) % tab.cycle;
  let k = 0;
  while (k < tab.dist.length - 2 && tab.dist[k + 1]! < x) k++;
  const span = tab.dist[k + 1]! - tab.dist[k]!;
  return tab.times[k]! + (tab.times[k + 1]! - tab.times[k]!) * (span > 1e-9 ? (x - tab.dist[k]!) / span : 0);
}

/**
 * Run cadence cap (steps a second). The captured sprint steps ~1.1 m on these bodies, so holding the stance foot planted
 * at the runner's 18-25 m/s meant ~18 steps a second: legs, hips and the clip's torso counter-twist vibrating at
 * 9 Hz (the owner's "shaking back and forth"). The cycle now never steps faster than a fast human cadence; above
 * `RUN_CADENCE_MAX x step length` (~3.3 m/s) the feet glide under the body instead, which the chase camera hides.
 */
export const RUN_CADENCE_MIN = 2.6;
export const RUN_CADENCE_MAX = 3.0;
export const runCadence = (speed: number): number => RUN_CADENCE_MIN + (RUN_CADENCE_MAX - RUN_CADENCE_MIN) * Math.max(0, Math.min(1, (speed - 2) / 18));

export const createSlotMotion = (): SlotMotion => ({ anim: createHumanoidAnimator(MOTION_CLIPS), walked: 0, stride: 0, speed: 0, capped: false, plant: 1, lastTravel: null, lockX: 0, lockFoot: -1, lockPrevX: 0 });

/**
 * The animator request for this frame. `hipHeight` is the drawn body's hip height in metres (rig hips x node scale).
 * Locomotion accumulates the distance the actor actually covered (enemies run toward the hero, i.e. down the course).
 */
export function motionRequest(
  st: SlotMotion, id: CharacterId, game: GameClipState, ctx: IdolMotionContext, hipHeight: number,
  strideTime?: (clip: MotionClipName, metres: number) => number,
  stepLength?: (clip: MotionClipName) => number
): MotionRequest<MotionClipName> | null {
  const clip = motionClipFor(id, game.clip, ctx.dash);
  if (!clip) return null;
  const moved = st.lastTravel === null ? 0 : Math.abs(ctx.travel - st.lastTravel);
  st.lastTravel = ctx.travel;
  const step = moved < 4 ? moved : 0; // a slot re-assigned to another entity is a cut, not a stride
  st.walked += step;
  if (ctx.dt > 1e-4) st.speed += (step / ctx.dt - st.speed) * (1 - Math.exp(-ctx.dt * 8));
  const c = MOTION_CLIPS[clip];
  const frac = game.duration > 0 ? Math.max(0, Math.min(1, game.time / game.duration)) : 0;
  switch (clip) {
    case "Run": case "Dash": {
      const len = stepLength ? stepLength(clip) : 0;
      const capDist = len > 0 ? runCadence(st.speed) * len * Math.max(0, ctx.dt) : Infinity;
      st.capped = step > capDist + 1e-6;
      const ratio = len > 0 ? st.speed / (runCadence(st.speed) * len) : 0;
      st.plant += (Math.max(0, Math.min(1, 1 - (ratio - 1) / 0.5)) - st.plant) * (1 - Math.exp(-Math.max(0, ctx.dt) * 4));
      st.stride += Math.min(step, capDist);
      return { clip, time: strideTime ? strideTime(clip, st.stride) : locomotionTime(c, st.stride, hipHeight) };
    }
    case "Jump":
      if (ctx.y !== undefined && ctx.vy !== undefined && (ctx.y > 0.01 || ctx.vy > 0)) return { clip, time: airTime(c, ctx.y, ctx.vy, GRAVITY, takeoffOf(clip)), loop: false };
      return { clip, time: frac * c.duration, loop: false };
    case "Idle": case "Guard":
      return { clip, rate: 1 };
    case "Slide":
      return { clip, rate: 1, loop: false, fade: 0.12 };
    default:
      return { clip, time: frac * c.duration, loop: false, fade: 0.1 };
  }
}

const CHAINS: readonly (readonly HumanoidRole[])[] = [
  ["hips", "spine", "chest", "neck", "head"],
  ["chest", "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"],
  ["chest", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"],
  ["hips", "leftUpperLeg", "leftLowerLeg", "leftFoot"],
  ["hips", "rightUpperLeg", "rightLowerLeg", "rightFoot"]
];
const LEG_ROLES: readonly HumanoidRole[] = ["leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];
const ID: HQuat = [0, 0, 0, 1];

/** Model-space rotation of every role (canonical frame: rest arms and legs hanging, facing +Z, left = +X). */
export function humanoidGlobals(p: HumanoidPoseInput, legScale = 1): Record<HumanoidRole, HQuat> {
  const local = (r: HumanoidRole): HQuat => {
    const q = p.rotations[r] ?? ID;
    return legScale !== 1 && LEG_ROLES.includes(r) ? quatPow(q, legScale) : q;
  };
  const g = { hips: local("hips") } as Record<HumanoidRole, HQuat>;
  for (const chain of CHAINS) for (let k = 1; k < chain.length; k++) g[chain[k]!] = quatMul(g[chain[k - 1]!], local(chain[k]!));
  return g;
}

/** Captured pose -> the Idol rig driver's segment pose (hips offset in units of rest hip height). */
export function segmentsFromHumanoid(p: HumanoidPoseInput, legScale = 1): IdolSegmentPose {
  const g = humanoidGlobals(p, legScale);
  const q = (r: HumanoidRole): Quat => [...g[r]] as Quat;
  const off = p.hipsOffset ?? [0, 0, 0];
  return {
    pelvis: q("hips"), body: q("chest"), head: q("head"),
    armL: q("leftUpperArm"), foreL: q("leftLowerArm"),
    armR: q("rightUpperArm"), foreR: q("rightLowerArm"),
    legL: q("leftUpperLeg"), shinL: q("leftLowerLeg"), footL: q("leftFoot"),
    legR: q("rightUpperLeg"), shinR: q("rightLowerLeg"), footR: q("rightFoot"),
    hipsOffset: [off[0] * legScale, off[1], off[2] * legScale] as V3
  };
}
