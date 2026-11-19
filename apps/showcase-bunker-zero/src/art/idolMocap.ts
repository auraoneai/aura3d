/**
 * Generated-motion enemy animation for the Idol guard, gunner and Warden (owner: "real motion, not frozen"; no Meshy).
 *
 * Clips (idol-mocap.ts): fal.ai text-to-motion (fal-ai/hunyuan-motion through tools/idol/motion.mjs, spec
 * tools/idol/motion-specs/bunker-zero.json, baked by apps/showcase-iron-crown/scripts/bake-idol-motion.mjs): a rifle
 * soldier's idle, alert scan, patrol walk, run, aimed burst with recoil, shot-hit stagger and shot-death collapse, and a
 * heavy brute's idle, stomp and two-fist slam for the Warden. The sim state picks the clip (crossfade 0.15 s), the sim
 * owns position (root travel removed), and the two-handed gun hold is solved on top of this pose by the arm IK in
 * idolModels.ts (the recoil reaches the chest and head).
 */
import { MOCAP_BIND_DIRS, MOCAP_CLIPS, MOCAP_FPS, MOCAP_ROLES } from "./idol-mocap";
import { idolBind, qConj, qFromTo, qMul, qNorm, qRot, qSlerp, type HumanoidDrive, type IdolSkeleton, type Q, type V3 } from "./idolHumanoid";

export type MocapRole = (typeof MOCAP_ROLES)[number];
/** A pose already expressed as humanoid drive rotations for one skeleton (role -> world rotation), plus hips offset. */
export interface EnemyMocapPose {
  readonly rot: Readonly<Record<MocapRole, Q>>;
  readonly hips: V3;
}

interface Clip {
  readonly name: string;
  readonly duration: number;
  readonly frames: number;
  readonly source: string;
  readonly q: Float32Array;
  readonly h: Float32Array;
}

let decoded: Map<string, Clip> | null = null;
function clips(): Map<string, Clip> {
  if (decoded) return decoded;
  decoded = new Map();
  const nq = MOCAP_ROLES.length * 4;
  for (const c of MOCAP_CLIPS) {
    const bin = atob(c.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer, 0, bytes.byteLength / 2);
    const all = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) all[i] = (i16[i]! / 32767) * 2;
    decoded.set(c.name, { name: c.name, duration: c.duration, frames: c.frames, source: c.source, q: all.subarray(0, c.frames * nq), h: all.subarray(c.frames * nq) });
  }
  return decoded;
}

export function enemyMocapClipNames(): readonly string[] {
  return [...clips().keys()];
}

export function enemyMocapDuration(name: string): number {
  return clips().get(name)!.duration;
}

const constCache = new WeakMap<IdolSkeleton, Map<string, Record<MocapRole, Q>>>();

/** Per source, per role: K so that drive = sourceWorldDelta * K (Idol bind direction turned onto the source's). */
function constants(skel: IdolSkeleton, source: string): Record<MocapRole, Q> {
  let bySource = constCache.get(skel);
  if (!bySource) constCache.set(skel, (bySource = new Map()));
  const hit = bySource.get(source);
  if (hit) return hit;
  const b = idolBind(skel);
  const ro = skel.roles;
  const dir = (a: number, c: number): V3 => {
    const p = b.worldT[a]!, q = b.worldT[c]!;
    return [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  };
  const headChild = skel.joints.findIndex((j) => j.parent === ro.head);
  const idolDirs: Record<MocapRole, V3> = {
    hips: dir(ro.hips, ro.spine[0] ?? ro.chest),
    chest: dir(ro.chest, ro.neck >= 0 ? ro.neck : ro.head),
    head: headChild >= 0 ? dir(ro.head, headChild) : dir(ro.neck >= 0 ? ro.neck : ro.chest, ro.head),
    upperArmL: dir(ro.upperArmL, ro.forearmL), forearmL: dir(ro.forearmL, ro.handL), handL: dir(ro.forearmL, ro.handL),
    upperArmR: dir(ro.upperArmR, ro.forearmR), forearmR: dir(ro.forearmR, ro.handR), handR: dir(ro.forearmR, ro.handR),
    thighL: dir(ro.thighL, ro.shinL), shinL: dir(ro.shinL, ro.footL), footL: ro.toeL >= 0 ? dir(ro.footL, ro.toeL) : dir(ro.shinL, ro.footL),
    thighR: dir(ro.thighR, ro.shinR), shinR: dir(ro.shinR, ro.footR), footR: ro.toeR >= 0 ? dir(ro.footR, ro.toeR) : dir(ro.shinR, ro.footR)
  };
  const pre: Partial<Record<MocapRole, Q>> = {
    upperArmL: b.armDownL, forearmL: b.armDownL, handL: b.armDownL,
    upperArmR: b.armDownR, forearmR: b.armDownR, handR: b.armDownR,
    thighL: b.legDownL, shinL: b.legDownL, footL: b.legDownL,
    thighR: b.legDownR, shinR: b.legDownR, footR: b.legDownR
  };
  const src = MOCAP_BIND_DIRS[source]!;
  const out = {} as Record<MocapRole, Q>;
  for (const role of MOCAP_ROLES) {
    const sd = role === "footL" && ro.toeL < 0 ? src.shinL : role === "footR" && ro.toeR < 0 ? src.shinR : src[role];
    const c = qFromTo(idolDirs[role], sd);
    const p = pre[role];
    out[role] = qNorm(p ? qMul(c, qConj(p)) : c);
  }
  bySource.set(source, out);
  return out;
}

/** Sample a clip at t seconds (looped or clamped), retargeted onto this skeleton. */
export function sampleEnemyMocap(skel: IdolSkeleton, name: string, t: number, loop: boolean): EnemyMocapPose {
  const c = clips().get(name);
  if (!c) throw new Error(`BUNKER_ZERO_MOCAP_CLIP_MISSING: ${name}`);
  const time = loop ? ((t % c.duration) + c.duration) % c.duration : Math.max(0, Math.min(c.duration, t));
  const fpos = Math.min(c.frames - 1, time * MOCAP_FPS);
  const f0 = Math.floor(fpos);
  const f1 = loop ? (f0 + 1) % c.frames : Math.min(c.frames - 1, f0 + 1);
  const u = fpos - f0;
  const k = constants(skel, c.source);
  const nq = MOCAP_ROLES.length * 4;
  const rot = {} as Record<MocapRole, Q>;
  MOCAP_ROLES.forEach((role, r) => {
    const a = f0 * nq + r * 4, b = f1 * nq + r * 4;
    const d = qSlerp([c.q[a]!, c.q[a + 1]!, c.q[a + 2]!, c.q[a + 3]!], [c.q[b]!, c.q[b + 1]!, c.q[b + 2]!, c.q[b + 3]!], u);
    rot[role] = qNorm(qMul(qNorm(d), k[role]));
  });
  const h0 = f0 * 3, h1 = f1 * 3;
  return { rot, hips: [c.h[h0]! + (c.h[h1]! - c.h[h0]!) * u, c.h[h0 + 1]! + (c.h[h1 + 1]! - c.h[h0 + 1]!) * u, c.h[h0 + 2]! + (c.h[h1 + 2]! - c.h[h0 + 2]!) * u] };
}

export function blendEnemyMocap(a: EnemyMocapPose, b: EnemyMocapPose, w: number): EnemyMocapPose {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const rot = {} as Record<MocapRole, Q>;
  for (const role of MOCAP_ROLES) rot[role] = qSlerp(a.rot[role], b.rot[role], w);
  return { rot, hips: [a.hips[0] + (b.hips[0] - a.hips[0]) * w, a.hips[1] + (b.hips[1] - a.hips[1]) * w, a.hips[2] + (b.hips[2] - a.hips[2]) * w] };
}

/** Sim state -> clip for the rifle and minigun soldiers (the gun IK owns their arms while alive). */
export const ENEMY_STATE_CLIP: Readonly<Record<string, string>> = {
  idle: "idle",
  patrol: "walk",
  alert: "alert",
  chase: "run",
  attack: "fire",
  pain: "hit",
  dead: "death"
};

/** The Warden (no gun, arms from the clip): a heavy brute's idle, stomp and two-fist slam. */
export const BOSS_STATE_CLIP: Readonly<Record<string, string>> = {
  idle: "bruteIdle",
  patrol: "bruteWalk",
  alert: "bruteIdle",
  chase: "bruteWalk",
  attack: "bruteSmash",
  pain: "hit",
  dead: "death"
};

export const ENEMY_MOCAP_CROSSFADE = 0.15;

interface BlendState {
  clip: string;
  since: number;
  from: EnemyMocapPose | null;
  last: EnemyMocapPose | null;
}
const blends = new Map<string, BlendState>();

/** Clip time for a state: loops run on the sim clock (phase-offset per enemy); one-shots on the state's age. */
export function enemyClipTime(state: string, time: number, stateT: number, phase: number, kind?: string): { clip: string; t: number; loop: boolean } {
  const map = kind === "boss" ? BOSS_STATE_CLIP : ENEMY_STATE_CLIP;
  const clip = map[state] ?? map.idle!;
  if (clip === "hit") return { clip, t: Math.min(stateT * 1.6, enemyMocapDuration(clip) * 0.8), loop: false };
  if (clip === "death") return { clip, t: stateT, loop: false };
  if (clip === "bruteSmash") return { clip, t: stateT, loop: true };
  // The Warden's chase is the stomp played faster.
  if (kind === "boss" && state === "chase") return { clip, t: (time + phase) * 1.5, loop: true };
  return { clip, t: time + phase, loop: true };
}

/** The enemy's mocap pose this frame, with a 0.15 s crossfade when the clip changes. */
export function enemyMocapPose(skel: IdolSkeleton, id: string, state: string, time: number, stateT: number, phase: number, kind?: string): EnemyMocapPose {
  const sc = enemyClipTime(state, time, stateT, phase, kind);
  const pose = sampleEnemyMocap(skel, sc.clip, sc.t, sc.loop);
  let b = blends.get(id);
  if (!b) blends.set(id, (b = { clip: sc.clip, since: time, from: null, last: null }));
  if (b.clip !== sc.clip) {
    b.from = b.last;
    b.clip = sc.clip;
    b.since = time;
  }
  const w = (time - b.since) / ENEMY_MOCAP_CROSSFADE;
  const out = b.from && w >= 0 && w < 1 ? blendEnemyMocap(b.from, pose, w) : pose;
  b.last = out;
  return out;
}

// ---- joint limits (same rules as Iron Crown's idolMocap.ts) -------------------------------------------------------
// Idol's auto-rig binds shoulder, armpit and chest to a few bones, so arms raised toward vertical tear the armpit, and
// generated wrists can twist past what a single-bone forearm skins. Clip rotations are world deltas from a rest pose with
// identity rotations, so the limits work directly on them (rest frame: the bone axis is its bind direction).
const MAX_ARM_ELEVATION = (100 * Math.PI) / 180;
const FOREARM_TWIST = (75 * Math.PI) / 180, HAND_TWIST = (60 * Math.PI) / 180, HAND_SWING = (70 * Math.PI) / 180;
const SMPL_DIRS = MOCAP_BIND_DIRS.smpl!;

function axisAngle(axis: V3, angle: number): Q {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function limitJoint(parent: Q, child: Q, axis: V3, maxTwist: number, maxSwing: number): Q {
  const r = qNorm(qMul(qConj(parent), child));
  const d = r[0] * axis[0] + r[1] * axis[1] + r[2] * axis[2];
  let twist: Q = qNorm([axis[0] * d, axis[1] * d, axis[2] * d, r[3]]);
  if (twist[3] < 0) twist = [-twist[0], -twist[1], -twist[2], -twist[3]];
  let swing = qNorm(qMul(r, qConj(twist)));
  if (swing[3] < 0) swing = [-swing[0], -swing[1], -swing[2], -swing[3]];
  const clampQ = (q: Q, max: number): Q => {
    const a = 2 * Math.acos(Math.min(1, q[3]));
    if (a <= max) return q;
    const n = Math.hypot(q[0], q[1], q[2]) || 1;
    return axisAngle([q[0] / n, q[1] / n, q[2] / n], max);
  };
  return qNorm(qMul(parent, qMul(clampQ(swing, maxSwing), clampQ(twist, maxTwist))));
}

/** Clamp upper-arm elevation (whole arm turned back toward the body) and forearm / wrist twist. */
export function limitEnemyArms(p: EnemyMocapPose): EnemyMocapPose {
  const rot = { ...p.rot } as Record<MocapRole, Q>;
  const down = qRot(rot.chest, [0, -1, 0]);
  for (const [upper, fore, hand] of [["upperArmL", "forearmL", "handL"], ["upperArmR", "forearmR", "handR"]] as const) {
    const dir = qRot(rot[upper], SMPL_DIRS[upper]);
    const angle = Math.acos(Math.max(-1, Math.min(1, dir[0] * down[0] + dir[1] * down[1] + dir[2] * down[2])));
    if (angle > MAX_ARM_ELEVATION) {
      let axis: V3 = [dir[1] * down[2] - dir[2] * down[1], dir[2] * down[0] - dir[0] * down[2], dir[0] * down[1] - dir[1] * down[0]];
      const n = Math.hypot(...axis);
      axis = n > 1e-6 ? [axis[0] / n, axis[1] / n, axis[2] / n] : qRot(rot.chest, upper === "upperArmL" ? [0, 0, -1] : [0, 0, 1]);
      const corr = axisAngle(axis, angle - MAX_ARM_ELEVATION);
      rot[upper] = qNorm(qMul(corr, rot[upper]));
      rot[fore] = qNorm(qMul(corr, rot[fore]));
      rot[hand] = qNorm(qMul(corr, rot[hand]));
    }
    rot[fore] = limitJoint(rot[upper], rot[fore], SMPL_DIRS[fore], FOREARM_TWIST, Math.PI);
    rot[hand] = limitJoint(rot[fore], rot[hand], SMPL_DIRS[hand], HAND_TWIST, HAND_SWING);
  }
  return { rot, hips: p.hips };
}

/** Humanoid drive from a mocap pose (arms limited; sourceHipsY 1: the hips offset is in hips-heights). */
export function enemyMocapDrive(pose: EnemyMocapPose): HumanoidDrive {
  const p = limitEnemyArms(pose);
  const r = p.rot;
  return {
    hips: r.hips, chest: r.chest, head: r.head,
    upperArmL: r.upperArmL, forearmL: r.forearmL, handL: r.handL,
    upperArmR: r.upperArmR, forearmR: r.forearmR, handR: r.handR,
    thighL: r.thighL, shinL: r.shinL, footL: r.footL,
    thighR: r.thighR, shinR: r.shinR, footR: r.footR,
    hipsOffset: p.hips,
    sourceHipsY: 1
  };
}
