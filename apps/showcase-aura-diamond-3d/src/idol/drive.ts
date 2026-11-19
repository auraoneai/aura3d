/**
 * Aura Diamond 3D: which Idol athlete each game actor wears, and the per-frame bridge from the game's 14-bone matrices
 * (computeBaseballBoneMatrices, rig space) to the Idol skeleton pose and the cap / helmet socket.
 * Pure (no engine imports) so the scene builder, main.ts and the unit tests share it.
 */
import { BASEBALL_ACTOR_FIT, BASEBALL_FIT_GROUND_N, computeBaseballBoneMatrices } from "../art/proceduralModels";
import { RIG } from "../batter-pose";
import { idolPoseFromGame, prepareIdolRig, qMul, qRot, type GameBone, type GameRigFrame, type IdolPoseResult, type PreparedIdolRig, type Q, type V3 } from "./athlete";
import { IDOL_ATHLETE_BINDS } from "./bind.generated";

export const IDOL_ATHLETE_KEYS = ["diaIdolFielderA", "diaIdolFielderB", "diaIdolBatterA", "diaIdolCatcher"] as const;
export type IdolAthleteKey = (typeof IDOL_ATHLETE_KEYS)[number];

/**
 * Home whites for the fielding side (two faces alternate round the diamond), the catcher in his gear, road greys for the
 * batting side (batter, runners, base coaches). Team colour stays on the caps and helmets main.ts tints per club.
 */
export function idolKeyForActor(id: string): IdolAthleteKey {
  if (id === "f-c") return "diaIdolCatcher";
  if (id === "batter" || id.startsWith("runner-") || id.startsWith("coach-")) return "diaIdolBatterA";
  const fielders = ["pitcher", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"];
  return fielders.indexOf(id) % 2 === 0 ? "diaIdolFielderA" : "diaIdolFielderB";
}

/** `?idol=0` keeps the procedural athletes (QA A/B and a fallback); on by default. */
export function idolAthletesEnabled(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get("idol") !== "0";
}

const GAME_BONES: readonly GameBone[] = [
  "Hips", "Spine", "Chest", "Head", "LeftUpperArm", "LeftForearm", "RightUpperArm", "RightForearm",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"
];

function quatFromMat4(m: readonly number[]): Q {
  const m00 = m[0]!, m11 = m[5]!, m22 = m[10]!;
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m[6]! - m[9]!) / s; y = (m[8]! - m[2]!) / s; z = (m[1]! - m[4]!) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m[6]! - m[9]!) / s; x = 0.25 * s; y = (m[4]! + m[1]!) / s; z = (m[8]! + m[2]!) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m[8]! - m[2]!) / s; x = (m[4]! + m[1]!) / s; y = 0.25 * s; z = (m[9]! + m[6]!) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m[1]! - m[4]!) / s; x = (m[8]! + m[2]!) / s; y = (m[9]! + m[6]!) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

const toActor = (m: readonly number[], local: readonly number[] = [0, 0, 0]): V3 => {
  const x = m[0]! * local[0]! + m[4]! * local[1]! + m[8]! * local[2]! + m[12]!;
  const y = m[1]! * local[0]! + m[5]! * local[1]! + m[9]! * local[2]! + m[13]!;
  const z = m[2]! * local[0]! + m[6]! * local[1]! + m[10]! * local[2]! + m[14]!;
  return [(x + BASEBALL_FIT_GROUND_N[0]) * BASEBALL_ACTOR_FIT, (y + BASEBALL_FIT_GROUND_N[1]) * BASEBALL_ACTOR_FIT, (z + BASEBALL_FIT_GROUND_N[2]) * BASEBALL_ACTOR_FIT];
};

/** The game rig in actor space from its rig-space bone matrices (the space the Idol model sits in under the actor node). */
export function gameFrameFromMats(mats: Readonly<Record<string, readonly number[]>>): GameRigFrame {
  const pos = {} as Record<GameBone, V3>;
  const rot = {} as Record<GameBone, Q>;
  for (const b of GAME_BONES) {
    pos[b] = toActor(mats[b]!);
    rot[b] = quatFromMat4(mats[b]!);
  }
  return { pos, rot, palmL: toActor(mats.LeftForearm!, RIG.palmL), palmR: toActor(mats.RightForearm!, RIG.palmR) };
}

const prepared = new Map<string, PreparedIdolRig>();
export function preparedIdolRig(key: IdolAthleteKey): PreparedIdolRig {
  let rig = prepared.get(key);
  if (!rig) {
    const bind = IDOL_ATHLETE_BINDS[key];
    if (!bind) throw new Error(`Idol athlete bind table missing for ${key}`);
    rig = prepareIdolRig(bind, gameFrameFromMats(computeBaseballBoneMatrices()));
    prepared.set(key, rig);
  }
  return rig;
}

/** Finger closure (radians per finger joint): the batter wraps both hands round the handle, everyone else rests them. */
export const IDOL_GRIP = { bat: { left: 1.15, right: 1.15 }, relaxed: { left: 0.35, right: 0.35 } } as const;

export function idolPoseForActor(
  key: IdolAthleteKey,
  mats: Readonly<Record<string, readonly number[]>>,
  grip: { readonly left: number; readonly right: number } = IDOL_GRIP.relaxed,
  /** take the palm targets from these matrices instead (the batter: clip body, grip-solve palms) */
  palmMats?: Readonly<Record<string, readonly number[]>>
): IdolPoseResult {
  const frame = gameFrameFromMats(mats);
  const palms = palmMats ? gameFrameFromMats(palmMats) : frame;
  return idolPoseFromGame(preparedIdolRig(key), { ...frame, palmL: palms.palmL, palmR: palms.palmR }, grip);
}

/* ------------------------------------------------------------------ */
/* Caps and helmets on the Idol head                                   */
/* ------------------------------------------------------------------ */

/** Shell sizes of the three procedural headgear specs (art/proceduralModels.ts): rim half-width, half-depth, crown height. */
const HEADGEAR = {
  cap: { rx: 0.103, rz: 0.112, top: 0.106 },
  helmet: { rx: 0.11, rz: 0.119, top: 0.108 },
  catcher: { rx: 0.106, rz: 0.114, top: 0.106 }
} as const;

export function headgearKind(id: string): keyof typeof HEADGEAR {
  return id === "batter" || id.startsWith("runner-") ? "helmet" : id === "f-c" ? "catcher" : "cap";
}

export interface IdolHeadgearFit {
  /** uniform scale of the cap node so its rim clears the Idol head */
  readonly scale: number;
  /** cap origin relative to the Idol head joint, model space at bind */
  readonly offset: V3;
}

/** Scale and seat the procedural cap / helmet so its rim clears the Idol head band and its crown sits just over the hair. */
export function idolHeadgearFit(key: IdolAthleteKey, kind: keyof typeof HEADGEAR): IdolHeadgearFit {
  const bind = IDOL_ATHLETE_BINDS[key]!;
  const g = HEADGEAR[kind];
  const h = bind.head;
  const scale = Math.max(1, (h.bandWidth / 2 + 0.008) / g.rx, (h.bandDepth / 2 + 0.008) / g.rz);
  const head = bind.joints.find((j) => j.name === bind.roles.head)!.pos;
  const origin: V3 = [h.bandCentre[0]!, h.crownY + 0.01 - g.top * scale, h.bandCentre[2]! + 0.006 * scale];
  return { scale: Math.round(scale * 1000) / 1000, offset: [origin[0] - head[0]!, origin[1] - head[1]!, origin[2] - head[2]!] };
}

/** Cap / helmet world transform for an Idol actor: model-space socket from the pose, then the actor's yaw and position. */
export function idolHeadgearWorld(pose: IdolPoseResult, fit: IdolHeadgearFit, actorPos: V3, actorYaw: number): { position: V3; quaternion: Q } {
  const local = qRot(pose.headDelta, fit.offset);
  const p: V3 = [pose.headPos[0] + local[0], pose.headPos[1] + local[1], pose.headPos[2] + local[2]];
  const c = Math.cos(actorYaw), s = Math.sin(actorYaw);
  const yawQ: Q = [0, Math.sin(actorYaw / 2), 0, Math.cos(actorYaw / 2)];
  return {
    position: [actorPos[0] + p[0] * c + p[2] * s, actorPos[1] + p[1], actorPos[2] - p[0] * s + p[2] * c],
    quaternion: qMul(yawQ, pose.headDelta)
  };
}
