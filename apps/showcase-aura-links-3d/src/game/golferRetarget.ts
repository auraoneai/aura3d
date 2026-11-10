/**
 * Aura Links 3D: retarget of the procedural swing onto the Meshy golfer rig (links_golfer_player, 24 joints).
 *
 * The swing (swingMath.ts) is solved on a "virtual" skeleton: the original athlete's 15 bones, whose bind rotations are all
 * identity. The Meshy rig is a T-pose humanoid whose bones have arbitrary bind orientations and different proportions. This
 * module does two things:
 *
 *   1. `meshyProfile()` builds a `SkeletonProfile` from the Meshy bind pose (golferSkeleton.ts), so the solve uses the Meshy
 *      rig's real shoulder, arm, torso and leg lengths. The virtual chain Hips - Spine - Chest - Head maps onto the real
 *      Hips / Spine02 / Spine / Head (Spine01 shares Spine02's rotation, neck and the shoulder joints share the chest's), so the
 *      virtual joint offsets equal the real ones and the real hand ends up exactly where the solve puts the palm.
 *   2. `retargetSolved()` turns the solved world rotation DELTAS (relative to the virtual bind) into the Meshy bones' local
 *      rotations: world = delta * bindWorld, local = conj(parentWorld) * world. The Hips also carries its position (the
 *      Armature node scales its children by 0.01, so the local value is in centimetres).
 *
 * Pure (no engine imports) so the mapping, the forward kinematics and the posture are unit tested offline.
 */
import { GOLFER_ARMATURE_SCALE, GOLFER_BIND, type GolferBindJoint } from "./golferSkeleton";
import {
  qConj, qMul, qRotate, unit, vAdd, vLen, vScale, vSub,
  type Quat, type SkeletonProfile, type SolvedDeltas, type SolvedSwing, type V3
} from "./swingMath";

/** `targetHeight` the game gives the golfer (m) */
export const GOLFER_TARGET_HEIGHT = 1.84;
/** height of the Meshy GLB (m): the asset bounds row and the mesh accessor max y */
export const MESHY_GLB_HEIGHT = 1.82;
/** the palm sits this far past the Meshy hand joint (m), along the forearm */
export const PALM_PAST_HAND = 0.08;

/** original athlete bone -> Meshy bone that carries it ("Root" has no Meshy counterpart: the Armature node is the root) */
export const ATHLETE_TO_MESHY: Readonly<Record<string, string | null>> = {
  Root: null,
  Hips: "Hips",
  Spine: "Spine02",
  Chest: "Spine",
  Head: "Head",
  LeftUpperLeg: "LeftUpLeg",
  LeftLowerLeg: "LeftLeg",
  LeftFoot: "LeftFoot",
  RightUpperLeg: "RightUpLeg",
  RightLowerLeg: "RightLeg",
  RightFoot: "RightFoot",
  LeftUpperArm: "LeftArm",
  LeftForearm: "LeftForeArm",
  RightUpperArm: "RightArm",
  RightForearm: "RightForeArm"
};

/** every Meshy bone the pose writes, with the solved delta that drives it (null = keeps its bind orientation) */
export const MESHY_DRIVE: Readonly<Record<string, keyof SolvedDeltas | null>> = {
  Hips: "hips",
  Spine02: "spine",
  Spine01: "spine",
  Spine: "chest",
  neck: "chest",
  Head: "head",
  LeftShoulder: "chest",
  RightShoulder: "chest",
  LeftArm: "upperArmL",
  LeftForeArm: "foreArmL",
  LeftHand: "foreArmL",
  RightArm: "upperArmR",
  RightForeArm: "foreArmR",
  RightHand: "foreArmR",
  LeftUpLeg: "thighL",
  LeftLeg: "shinL",
  LeftFoot: null,
  LeftToeBase: null,
  RightUpLeg: "thighR",
  RightLeg: "shinR",
  RightFoot: "footR",
  RightToeBase: "footR"
};

const bindByName = new Map<string, GolferBindJoint>(GOLFER_BIND.map((j) => [j.name, j]));
const joint = (name: string): GolferBindJoint => {
  const j = bindByName.get(name);
  if (!j) throw new Error(`golferRetarget: joint "${name}" is not in the Meshy golfer bind table`);
  return j;
};
const P = (name: string): V3 => [...joint(name).pos] as V3;
const Q = (name: string): Quat => {
  const r = joint(name).rot;
  return { x: r[0], y: r[1], z: r[2], w: r[3] };
};
const qNormalize = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const s = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  if (dot > 0.9995) {
    return qNormalize({
      x: a.x + (b.x * s - a.x) * t,
      y: a.y + (b.y * s - a.y) * t,
      z: a.z + (b.z * s - a.z) * t,
      w: a.w + (b.w * s - a.w) * t
    });
  }
  const theta = Math.acos(dot);
  const sinT = Math.sin(theta) || 1;
  const wa = Math.sin((1 - t) * theta) / sinT;
  const wb = (Math.sin(t * theta) / sinT) * s;
  return qNormalize({
    x: a.x * wa + b.x * wb,
    y: a.y * wa + b.y * wb,
    z: a.z * wa + b.z * wb,
    w: a.w * wa + b.w * wb
  });
};

/** hand joint to palm point, from the forearm joint: the same direction, PALM_PAST_HAND longer */
const palmFrom = (fore: string, hand: string): V3 => {
  const v = vSub(P(hand), P(fore));
  return vScale(v, (vLen(v) + PALM_PAST_HAND) / vLen(v));
};

/**
 * Tuning of the Meshy profile (what the Meshy rig needs that the original athlete did not): the legs are nearly straight at
 * bind, so the knee flex comes from lowering the hips; the torso is shorter than the athlete's, so the spine flexes a little less.
 */
export const MESHY_TUNING = { crouch: 0.012, hipsBack: -0.02, hipsSide: 0.05, flexScale: 1.25 };

let cachedProfile: SkeletonProfile | undefined;

/** the Meshy golfer's proportions as a swing-solve skeleton (GLB model space, metres) */
export function meshyProfile(): SkeletonProfile {
  if (cachedProfile) return cachedProfile;
  const fit = GOLFER_TARGET_HEIGHT / MESHY_GLB_HEIGHT;
  const oldFit = 1.84 / 1.897;
  const hips = P("Hips");
  const spine = P("Spine");
  const legSide = (up: string, leg: string, foot: string) => ({
    thigh: vLen(vSub(P(leg), P(up))),
    shin: vLen(vSub(P(foot), P(leg))),
    thighBind: unit(vSub(P(leg), P(up))),
    shinBind: unit(vSub(P(foot), P(leg)))
  });
  const l = legSide("LeftUpLeg", "LeftLeg", "LeftFoot");
  const r = legSide("RightUpLeg", "RightLeg", "RightFoot");
  cachedProfile = {
    id: "links_golfer_player",
    rig: {
      hipsBind: hips,
      tSpine: vSub(P("Spine02"), hips),
      tChest: vSub(spine, P("Spine02")),
      tHead: vSub(P("Head"), spine),
      tShoulderL: vSub(P("LeftArm"), spine),
      tShoulderR: vSub(P("RightArm"), spine),
      tForearmL: vSub(P("LeftForeArm"), P("LeftArm")),
      tForearmR: vSub(P("RightForeArm"), P("RightArm")),
      palmL: palmFrom("LeftForeArm", "LeftHand"),
      palmR: palmFrom("RightForeArm", "RightHand")
    },
    leg: {
      thighL: l.thigh, shinL: l.shin, thighR: r.thigh, shinR: r.shin,
      hipJointL: vSub(P("LeftUpLeg"), hips), hipJointR: vSub(P("RightUpLeg"), hips),
      thighBindL: l.thighBind, shinBindL: l.shinBind, thighBindR: r.thighBind, shinBindR: r.shinBind,
      ankleL: P("LeftFoot"), ankleR: P("RightFoot"), toeL: P("LeftToeBase"), toeR: P("RightToeBase"),
      crouch: MESHY_TUNING.crouch, hipsBack: MESHY_TUNING.hipsBack, hipsSide: MESHY_TUNING.hipsSide
    },
    fitScale: fit,
    clubScale: oldFit / fit,
    flexScale: MESHY_TUNING.flexScale,
    anatomic: true,
    palmNormalBind: [0, 0, 1]
  };
  return cachedProfile;
}

export interface MeshyBonePose {
  readonly rotation: Quat;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The overlay pose for the Meshy skeleton from one solved swing: local rotations for every bone in MESHY_DRIVE, plus the Hips
 * local position (centimetres, the Armature scale folded out).
 */
export function retargetSolved(solved: Pick<SolvedSwing, "deltas" | "hipsPos">): Record<string, MeshyBonePose> {
  const world = new Map<string, Quat>();
  const deltaOf = (name: string): Quat | undefined => {
    if (name === "Spine01") return qSlerp(solved.deltas.spine, solved.deltas.chest, 0.18);
    if (name === "neck") return qSlerp(solved.deltas.chest, solved.deltas.head, 0.5);
    const key = MESHY_DRIVE[name];
    return key ? solved.deltas[key] : undefined;
  };
  const worldOf = (name: string): Quat => {
    const hit = world.get(name);
    if (hit) return hit;
    const delta = deltaOf(name);
    const w = qNormalize(delta ? qMul(delta, Q(name)) : Q(name));
    world.set(name, w);
    return w;
  };
  const out: Record<string, MeshyBonePose> = {};
  for (const name of Object.keys(MESHY_DRIVE)) {
    const parent = joint(name).parent;
    const local = parent ? qNormalize(qMul(qConj(worldOf(parent)), worldOf(name))) : worldOf(name);
    out[name] = { rotation: local };
  }
  const inv = 1 / GOLFER_ARMATURE_SCALE;
  out.Hips = {
    rotation: out.Hips!.rotation,
    position: { x: solved.hipsPos[0] * inv, y: solved.hipsPos[1] * inv, z: solved.hipsPos[2] * inv }
  };
  return out;
}

/**
 * Forward kinematics of a Meshy pose (what the engine's skeleton evaluates): world position and rotation of every joint, in GLB
 * model space (metres). Joints the pose does not write keep their bind local transform.
 */
export function meshyForwardKinematics(pose: Readonly<Record<string, MeshyBonePose>>): Map<string, { pos: V3; rot: Quat }> {
  const out = new Map<string, { pos: V3; rot: Quat }>();
  for (const j of GOLFER_BIND) {
    const bindRot = Q(j.name);
    if (!j.parent) {
      const p = pose[j.name];
      const pos: V3 = p?.position
        ? [p.position.x * GOLFER_ARMATURE_SCALE, p.position.y * GOLFER_ARMATURE_SCALE, p.position.z * GOLFER_ARMATURE_SCALE]
        : P(j.name);
      out.set(j.name, { pos, rot: p?.rotation ?? bindRot });
      continue;
    }
    const parent = out.get(j.parent)!;
    const pb = joint(j.parent);
    const bindLocalT = qRotate(qConj(Q(j.parent)), vSub(P(j.name), [...pb.pos] as V3));
    const localRot = pose[j.name]?.rotation ?? qMul(qConj(Q(j.parent)), bindRot);
    out.set(j.name, { pos: vAdd(parent.pos, qRotate(parent.rot, bindLocalT)), rot: qNormalize(qMul(parent.rot, localRot)) });
  }
  return out;
}
