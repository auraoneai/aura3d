/**
 * Aura Diamond 3D: motion-captured-quality athletes. Text-to-motion clips from fal `fal-ai/hunyuan-motion`
 * (tools/idol/motion-specs/aura-diamond-3d.json -> motion.generated.ts, canonical HumanoidClips: arms-down rest, facing +Z,
 * left +X) drive the game's 14-bone baseball rig, which in turn drives the Idol GLB (drive.ts) — so the bat grip, gloves,
 * mitt and caps keep riding the same rig, and the sim's timing stays exact:
 *   - pitcher: set between pitches; the windup (sim phaseT 0 .. WINDUP_RELEASE_T) is time-warped onto the clip's last
 *     PITCH_WINDUP_SPAN s before its release (the throwing hand's fastest frame), so the release lands on the sim's release;
 *   - fielders: ready crouch, the catch, the crow-hop throw (catcher too); runners: lead-off crouch and the sprint;
 *   - base coaches: idle; the catcher: the squat with the glove up;
 *   - batter (batterMotion): stance and swing on the legs, hips and (half) torso, warped so the clip's contact frame lands on
 *     the sim's SWING_CONTACT_T; the arms stay the grip solve so the bat and contact stay exact.
 * Every state switch cross-fades (PoseSmoother). Pure maths (no engine imports).
 */
import { BASEBALL_ACTOR_FIT, BASEBALL_BIND_T, computeBaseballBoneMatrices, type BaseballBoneName, type BaseballPoseBonesInput } from "../art/proceduralModels";
import { RIG, SWING_CONTACT_T } from "../batter-pose";
import { WINDUP_RELEASE_T } from "../rules";
import {
  ARM_ROLES,
  createHumanoidAnimator,
  layerHumanoidPose,
  sampleHumanoidClip,
  type HumanoidAnimator,
  type HumanoidClip,
  type HumanoidPoseInput,
  type HumanoidRole
} from "@aura3d/engine/animation";
import { MOTION_CLIPS } from "./motion.generated";

type Q = [number, number, number, number];
type V3 = [number, number, number];
const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q: Q): Q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qRot = (q: Q, v: V3): V3 => {
  const u: V3 = [q[0], q[1], q[2]];
  const c = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const t = c(u, v).map((x) => 2 * x) as V3;
  const r = c(u, t);
  return [v[0] + q[3] * t[0] + r[0], v[1] + q[3] * t[1] + r[1], v[2] + q[3] * t[2] + r[2]];
};
export function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d = Math.abs(d);
  if (d > 0.9995) return qNorm([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]);
  const th = Math.acos(d), sn = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / sn, wb = (Math.sin(t * th) / sn) * s;
  return qNorm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb]);
}
const qFromTo = (a: V3, b: V3): Q => {
  const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1;
  const u: V3 = [a[0] / la, a[1] / la, a[2] / la], v: V3 = [b[0] / lb, b[1] / lb, b[2] / lb];
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.999999) return [1, 0, 0, 0];
  return qNorm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0], 1 + d]);
};
const yawQ = (a: number): Q => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

export type MocapClipKey = keyof typeof MOTION_CLIPS;

/** canonical role -> game bone (neck folds into the head, shoulders into the upper arms, hands into the forearms) */
const ROLE_OF: Readonly<Record<BaseballBoneName, HumanoidRole>> = {
  Hips: "hips", Spine: "spine", Chest: "chest", Head: "head",
  LeftUpperArm: "leftUpperArm", LeftForearm: "leftLowerArm", RightUpperArm: "rightUpperArm", RightForearm: "rightLowerArm",
  LeftUpperLeg: "leftUpperLeg", LeftLowerLeg: "leftLowerLeg", LeftFoot: "leftFoot", RightUpperLeg: "rightUpperLeg", RightLowerLeg: "rightLowerLeg", RightFoot: "rightFoot"
};
const CANON_PARENT: Readonly<Record<HumanoidRole, HumanoidRole | null>> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftShoulder: "chest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "chest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg"
};
const GAME_PARENT: Readonly<Record<BaseballBoneName, BaseballBoneName | null>> = {
  Hips: null, Spine: "Hips", Chest: "Spine", Head: "Chest", LeftUpperArm: "Chest", LeftForearm: "LeftUpperArm", RightUpperArm: "Chest", RightForearm: "RightUpperArm",
  LeftUpperLeg: "Hips", LeftLowerLeg: "LeftUpperLeg", LeftFoot: "LeftLowerLeg", RightUpperLeg: "Hips", RightLowerLeg: "RightUpperLeg", RightFoot: "RightLowerLeg"
};
const ORDER = Object.keys(ROLE_OF) as BaseballBoneName[];

interface Prepared { readonly align: ReadonlyMap<BaseballBoneName, Q>; readonly hipHeight: number }
let prepared: Prepared | null = null;
/** limb alignments: the game's hanging-limb bind directions onto the canonical rest (every limb straight down) */
function prepare(): Prepared {
  if (prepared) return prepared;
  const m = computeBaseballBoneMatrices();
  const gp = (b: BaseballBoneName): V3 => [m[b]![12]!, m[b]![13]!, m[b]![14]!];
  const palm = (b: "LeftForearm" | "RightForearm", off: readonly number[]): V3 => {
    const M = m[b]!;
    return [M[0]! * off[0]! + M[4]! * off[1]! + M[8]! * off[2]! + M[12]!, M[1]! * off[0]! + M[5]! * off[1]! + M[9]! * off[2]! + M[13]!, M[2]! * off[0]! + M[6]! * off[1]! + M[10]! * off[2]! + M[14]!];
  };
  const down: V3 = [0, -1, 0];
  const align = new Map<BaseballBoneName, Q>([
    ["LeftUpperArm", qFromTo(sub(gp("LeftForearm"), gp("LeftUpperArm")), down)],
    ["LeftForearm", qFromTo(sub(palm("LeftForearm", RIG.palmL), gp("LeftForearm")), down)],
    ["RightUpperArm", qFromTo(sub(gp("RightForearm"), gp("RightUpperArm")), down)],
    ["RightForearm", qFromTo(sub(palm("RightForearm", RIG.palmR), gp("RightForearm")), down)],
    ["LeftUpperLeg", qFromTo(sub(gp("LeftLowerLeg"), gp("LeftUpperLeg")), down)],
    ["LeftLowerLeg", qFromTo(sub(gp("LeftFoot"), gp("LeftLowerLeg")), down)],
    ["RightUpperLeg", qFromTo(sub(gp("RightLowerLeg"), gp("RightUpperLeg")), down)],
    ["RightLowerLeg", qFromTo(sub(gp("RightFoot"), gp("RightLowerLeg")), down)]
  ]);
  // rest hip height above the soles, rig units (the canonical hips offset is in hip heights)
  prepared = { align, hipHeight: (BASEBALL_BIND_T.Hips[1]! + BASEBALL_BIND_T.Root[1]! + 0.952) };
  return prepared;
}

const clipOf = (key: MocapClipKey): HumanoidClip => MOTION_CLIPS[key] as HumanoidClip;

/** game-rig pose of a canonical pose, turned by `yaw` about +Y (only the root changes) */
function canonicalToGame(rotations: Partial<Record<HumanoidRole, readonly number[]>>, hipsOffsetY: number, yaw: number): BaseballPoseBonesInput {
  const p = prepare();
  const globals = new Map<HumanoidRole, Q>();
  const globalOf = (role: HumanoidRole): Q => {
    const hit = globals.get(role);
    if (hit) return hit;
    const parent = CANON_PARENT[role];
    const local = (rotations[role] ?? [0, 0, 0, 1]) as Q;
    const g = qNorm(parent ? qMul(globalOf(parent), local) : qMul(yawQ(yaw), local));
    globals.set(role, g);
    return g;
  };
  const world = new Map<BaseballBoneName, Q>();
  const out: Record<string, { rotation: Q; position?: V3 }> = {};
  for (const bone of ORDER) {
    const g = qNorm(qMul(globalOf(ROLE_OF[bone]), p.align.get(bone) ?? [0, 0, 0, 1]));
    world.set(bone, g);
    const parent = GAME_PARENT[bone];
    out[bone] = { rotation: parent ? qNorm(qMul(qConj(world.get(parent)!), g)) : g };
  }
  const hip = BASEBALL_BIND_T.Hips;
  out.Hips!.position = [hip[0]!, hip[1]! + hipsOffsetY * p.hipHeight, hip[2]!];
  return out as unknown as BaseballPoseBonesInput;
}

/** The game-rig pose of a clip at `time` s (looping or clamped), turned by the clip's heading fix plus `extraYaw`. */
export function mocapGamePose(key: MocapClipKey, time: number, loop: boolean, extraYaw = 0): BaseballPoseBonesInput {
  const pose = sampleHumanoidClip(clipOf(key), time, { loop });
  return canonicalToGame(pose.rotations as Partial<Record<HumanoidRole, readonly number[]>>, pose.hipsOffset?.[1] ?? 0, clipFacts(key).yaw + extraYaw);
}

/* ------------------------------------------------------------------ */
/* timing and heading facts, measured once per clip on the game rig     */
/* ------------------------------------------------------------------ */
interface ClipFacts { readonly yaw: number; readonly releaseTime: number; readonly contactTime: number }
const facts = new Map<MocapClipKey, ClipFacts>();
const palmsAt = (key: MocapClipKey, t: number, yaw: number) => {
  const pose = sampleHumanoidClip(clipOf(key), t, { loop: false });
  const m = computeBaseballBoneMatrices(canonicalToGame(pose.rotations as Partial<Record<HumanoidRole, readonly number[]>>, pose.hipsOffset?.[1] ?? 0, yaw));
  const at = (b: "LeftForearm" | "RightForearm", off: readonly number[]): V3 => {
    const M = m[b]!;
    return [M[0]! * off[0]! + M[4]! * off[1]! + M[8]! * off[2]! + M[12]!, M[1]! * off[0]! + M[5]! * off[1]! + M[9]! * off[2]! + M[13]!, M[2]! * off[0]! + M[6]! * off[1]! + M[10]! * off[2]! + M[14]!];
  };
  return { l: at("LeftForearm", RIG.palmL), r: at("RightForearm", RIG.palmR) };
};
/** Release (throws: the right hand's fastest frame) / contact (swing: both hands fastest); throws face their release along +Z. */
export function clipFacts(key: MocapClipKey): ClipFacts {
  const hit = facts.get(key);
  if (hit) return hit;
  const c = clipOf(key);
  facts.set(key, { yaw: 0, releaseTime: 0, contactTime: 0 }); // re-entrancy guard while measuring
  const dt = 1 / c.fps;
  let best = -1, bestT = 0, dir: V3 = [0, 0, 1];
  let prev = palmsAt(key, 0, 0);
  for (let t = dt; t <= c.duration + 1e-6; t += dt) {
    const cur = palmsAt(key, t, 0);
    const vr = sub(cur.r, prev.r), vl = sub(cur.l, prev.l);
    const speed = key === "Swing" ? Math.hypot(...vr) + Math.hypot(...vl) : Math.hypot(...vr);
    if (speed > best) { best = speed; bestT = t; dir = key === "Swing" ? [vr[0] + vl[0], 0, vr[2] + vl[2]] : [vr[0], 0, vr[2]]; }
    prev = cur;
  }
  // throws: turn the release direction onto +Z (toward home / the target); other clips keep their converted heading
  const f: ClipFacts = { yaw: key === "Pitch" || key === "Throw" ? -Math.atan2(dir[0], dir[2]) : 0, releaseTime: bestT, contactTime: bestT };
  facts.set(key, f);
  return f;
}

/* ------------------------------------------------------------------ */
/* which clip plays for a game state                                     */
/* ------------------------------------------------------------------ */
/** Seconds of the pitching clip that the sim's windup (0 .. WINDUP_RELEASE_T) is warped onto, ending at the release. */
export const PITCH_WINDUP_SPAN = 0.85;
/** Seconds of the swing clip warped onto the sim's swing clock before and after contact. */
export const SWING_PRE = 0.55;
export const SWING_POST = 0.6;

export interface MotionRequest {
  readonly id: string;
  readonly role: string;
  readonly clip: string;
  /** seconds since the actor entered this clip (sim phase time for the pitcher) */
  readonly localT: number;
  readonly speed: number;
  /** the game's procedural pose for the same request (the fallback for states with no clip) */
  readonly procedural: BaseballPoseBonesInput;
}

/** Which clip plays for a (non-batting) game state; null keeps the procedural solve. */
export function mocapClipFor(role: string, clip: string): MocapClipKey | null {
  if (clip === "Sprint_Loop") return "Sprint";
  if (role === "pitcher") return clip === "Telegraph" || clip === "Release" ? "Pitch" : "PitchSet";
  if (clip === "Release") return "Throw";
  if (clip === "Contest") return "Catch";
  if (role === "coach") return "CoachIdle";
  if (role === "catcher") return "CatcherSquat";
  if (role === "runner") return "Leadoff";
  if (role === "infielder" || role === "outfielder") return "Ready";
  return null;
}

const phaseOf = (id: string): number => ((id.charCodeAt(id.length - 1) || 0) % 7) / 7;

/** The pose for one (non-batting) actor this frame: a clip where one fits the state, otherwise the procedural solve. */
export function diamondMotionPose(r: MotionRequest): BaseballPoseBonesInput {
  const key = mocapClipFor(r.role, r.clip);
  if (!key) return r.procedural;
  const c = clipOf(key);
  if (key === "Pitch") {
    const rel = clipFacts("Pitch").releaseTime;
    if (r.clip === "Telegraph") {
      const u = Math.min(1, Math.max(0, r.localT / WINDUP_RELEASE_T));
      return mocapGamePose("Pitch", rel - PITCH_WINDUP_SPAN * (1 - u), false);
    }
    return mocapGamePose("Pitch", rel + r.localT, false);
  }
  if (key === "Throw") {
    // the throw's release a short wind-up after the request starts
    const rel = clipFacts("Throw").releaseTime;
    return mocapGamePose("Throw", Math.max(0, rel - 0.35) + r.localT * r.speed, false);
  }
  if (key === "Catch") return mocapGamePose("Catch", r.localT, false);
  if (key === "Sprint") return mocapGamePose("Sprint", r.localT * Math.max(0.6, r.speed / 1.45) + phaseOf(r.id) * c.duration, true);
  return mocapGamePose(key, r.localT + phaseOf(r.id) * c.duration, true);
}

/* ------------------------------------------------------------------ */
/* batter: clip body under the grip solve                               */
/* ------------------------------------------------------------------ */
const LOWER: readonly BaseballBoneName[] = ["LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"];
const TORSO: readonly BaseballBoneName[] = ["Spine", "Chest", "Head"];
/** share of the clip in the batter's torso (the rest is the solve, so the grip stays in reach of the shoulders) */
export const BATTER_TORSO_SHARE = 0.5;
/** the follow-through hands the torso back to the solve (the clip's finish turns the shoulders past the solved grip's reach) */
export function batterTorsoShare(swinging: boolean, swingT: number): number {
  if (!swinging || swingT <= SWING_CONTACT_T) return BATTER_TORSO_SHARE;
  return BATTER_TORSO_SHARE * Math.max(0, 1 - (swingT - SWING_CONTACT_T) / 0.25);
}

/** Swing clip time for the sim's swing clock (0..1, contact at SWING_CONTACT_T): the clip's contact frame lands on contact. */
export function swingClipTime(swingT: number): number {
  const tc = clipFacts("Swing").contactTime;
  const c = clipOf("Swing");
  const pre = Math.min(SWING_PRE, tc), post = Math.min(SWING_POST, c.duration - tc);
  return swingT <= SWING_CONTACT_T ? tc - pre * (1 - swingT / SWING_CONTACT_T) : tc + post * ((swingT - SWING_CONTACT_T) / (1 - SWING_CONTACT_T));
}

/**
 * The batter's displayed pose: legs, hips (rotation and height) and half the torso from the stance / swing clip, turned by
 * `yaw` (the heading that lines the clip's stance up with the solve's), the arms from the grip solve.
 */
export function batterMotion(solve: BaseballPoseBonesInput, opts: { readonly swinging: boolean; readonly swingT: number; readonly stanceT: number; readonly yaw: number; readonly torsoShare?: number }): BaseballPoseBonesInput {
  const clip = opts.swinging ? mocapGamePose("Swing", swingClipTime(opts.swingT), false, opts.yaw) : mocapGamePose("BatStance", opts.stanceT, true, opts.yaw);
  const s = solve as unknown as Record<string, { rotation: Q; position?: V3 }>;
  const m = clip as unknown as Record<string, { rotation: Q; position?: V3 }>;
  const out: Record<string, { rotation: Q; position?: V3 }> = { ...s };
  for (const b of LOWER) out[b] = m[b]!;
  // hips: the clip's turn and height, the solve's footprint
  out.Hips = { rotation: m.Hips!.rotation, position: [s.Hips?.position?.[0] ?? BASEBALL_BIND_T.Hips[0]!, m.Hips!.position![1], s.Hips?.position?.[2] ?? BASEBALL_BIND_T.Hips[2]!] };
  // torso: world-space blend so the arms (solve locals under the chest) keep their solved world orientation
  const worldOf = (src: Record<string, { rotation: Q }>, b: BaseballBoneName): Q => {
    let q = src[b]!.rotation;
    let p = GAME_PARENT[b];
    while (p) { q = qMul(src[p]!.rotation, q); p = GAME_PARENT[p]; }
    return qNorm(q);
  };
  const wSolve = new Map<BaseballBoneName, Q>(), wOut = new Map<BaseballBoneName, Q>();
  for (const b of ["Hips", ...TORSO, "LeftUpperArm", "RightUpperArm"] as BaseballBoneName[]) wSolve.set(b, worldOf(s, b));
  wOut.set("Hips", out.Hips.rotation);
  for (const b of TORSO) {
    const target = qSlerp(wSolve.get(b)!, worldOf(m, b), opts.torsoShare ?? batterTorsoShare(opts.swinging, opts.swingT));
    wOut.set(b, target);
    out[b] = { rotation: qNorm(qMul(qConj(wOut.get(GAME_PARENT[b]!)!), target)) };
  }
  // the arms keep the solve's WORLD orientation (the Idol palm IK then lands them on the solve's grip)
  for (const b of ["LeftUpperArm", "RightUpperArm"] as BaseballBoneName[]) out[b] = { rotation: qNorm(qMul(qConj(wOut.get("Chest")!), wSolve.get(b)!)) };
  return out as unknown as BaseballPoseBonesInput;
}

/** Heading (yaw) that turns the stance clip's hips forward onto a solved pose's hips forward (both game-rig poses). */
export function headingFix(solve: BaseballPoseBonesInput): number {
  const s = (solve as unknown as Record<string, { rotation: Q }>).Hips!.rotation;
  const m = (mocapGamePose("BatStance", 0, true) as unknown as Record<string, { rotation: Q }>).Hips!.rotation;
  const fs = qRot(s, [0, 0, 1]), fm = qRot(m, [0, 0, 1]);
  return Math.atan2(fs[0], fs[2]) - Math.atan2(fm[0], fm[2]);
}

/** 5.7.2: direct `@aura3d/engine/animation` animator over Diamond's generated clips + upper-body arm-role layering helper. */
export function createDiamondHumanoidAnimator(): HumanoidAnimator<MocapClipKey> {
  return createHumanoidAnimator(MOTION_CLIPS as Readonly<Record<MocapClipKey, HumanoidClip>>);
}

/** Layer an upper-body arm pose (e.g. bat grip / throw) over a canonical base body pose using `ARM_ROLES`. */
export function layerDiamondArms(base: HumanoidPoseInput, arms: HumanoidPoseInput): HumanoidPoseInput {
  return layerHumanoidPose(base, arms, ARM_ROLES);
}

/**
 * Cross-fades each actor from its last shown pose into a new state's pose over `blend` seconds whenever its state key
 * changes, backed by `@aura3d/engine/animation`'s `createHumanoidAnimator` cross-fade timing, while returning exact
 * target references once settled (preserving `createTwoHandGrip` bat-contact parity).
 */
export class PoseSmoother {
  private readonly animators = new Map<string, { animator: HumanoidAnimator<MocapClipKey>; lastNow: number; key: string; settledAt: number; shown: Record<string, { rotation: Q; position?: V3 }>; from: Record<string, { rotation: Q; position?: V3 }> | null; start: number }>();
  constructor(private readonly blend = 0.18) {}
  apply(id: string, stateKey: string, target: BaseballPoseBonesInput, now: number): BaseballPoseBonesInput {
    const tgt = target as unknown as Record<string, { rotation?: Q; position?: V3 }>;
    const full = (): Record<string, { rotation: Q; position?: V3 }> =>
      Object.fromEntries(ORDER.map((b) => [b, { rotation: (tgt[b]?.rotation ?? [0, 0, 0, 1]) as Q, ...(tgt[b]?.position ? { position: [...tgt[b]!.position!] as V3 } : {}) }]));
    let st = this.animators.get(id);
    if (!st) {
      const animator = createDiamondHumanoidAnimator();
      st = { animator, lastNow: now, key: stateKey, settledAt: now, shown: full(), from: null, start: now };
      this.animators.set(id, st);
      return target;
    }
    const dt = Math.max(0, now - st.lastNow);
    st.lastNow = now;
    if (st.key !== stateKey) {
      st.from = st.shown;
      st.start = now;
      st.key = stateKey;
      st.animator.update(dt, { pose: { rotations: {} }, key: stateKey, fade: this.blend });
    } else {
      st.animator.update(dt, { pose: { rotations: {} }, key: stateKey, fade: this.blend });
    }
    const u = st.from ? Math.min(1, Math.max(0, (now - st.start) / this.blend)) : 1;
    if (u >= 1) {
      st.from = null;
      st.shown = full();
      return target;
    }
    const k = u * u * (3 - 2 * u);
    const out: Record<string, { rotation: Q; position?: V3 }> = {};
    for (const bone of ORDER) {
      const from = st.from![bone]!;
      const to = tgt[bone];
      const rotation = qSlerp(from.rotation, (to?.rotation ?? [0, 0, 0, 1]) as Q, k);
      const fp = from.position ?? (bone === "Hips" ? ([...BASEBALL_BIND_T.Hips] as V3) : undefined);
      const tp = to?.position ?? (bone === "Hips" ? ([...BASEBALL_BIND_T.Hips] as V3) : undefined);
      out[bone] = { rotation, ...(fp && tp ? { position: [0, 1, 2].map((i) => fp[i]! + (tp[i]! - fp[i]!) * k) as V3 } : {}) };
    }
    st.shown = out;
    return out as unknown as BaseballPoseBonesInput;
  }
}

/** Seconds of game time per rig unit: exported for tests (the hips offset scale). */
export const HIP_HEIGHT_METRES = (): number => prepare().hipHeight * BASEBALL_ACTOR_FIT;
