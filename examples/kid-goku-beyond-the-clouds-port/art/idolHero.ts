/**
 * Idol wow pass (2026-11): drives the rigged Idol sky-kid hero GLB (`assets.cdSkyKidHero`) from the game's own
 * deterministic articulation (`computeSkyKidHeroPose` in proceduralModels.ts), so every clip the procedural hero had
 * (run gait locked to the planted-foot phase, cloud-surf crouch, pole balance, jump tuck, strike, stumble, cheer, kneel)
 * plays on the high-detail mesh. Render layer only: reads a pose, writes a replace-mode `AnimationPose`.
 *
 * Idol bones are unnamed (`bone_N`); IDOL_HERO_RIG below records the rest skeleton read from the shipped GLB and which
 * bone plays which procedural joint (hierarchy + rest positions). The procedural rig rests with arms and legs hanging
 * straight down; the Idol rig rests in a T-pose, so each limb chain gets a fixed rest correction that swings it down
 * before the procedural joint rotation is applied (world_b = P_joint * C_limb * Rest_b; local = world_parent^-1 * world_b).
 */
import type { SkyKidHeroPose } from "./proceduralModels";

type V3 = readonly [number, number, number];
type Q = readonly [number, number, number, number];

export interface IdolRigBone {
  readonly name: string;
  /** Index of the parent bone in `bones`, or -1 for the skeleton root. */
  readonly parent: number;
  /** Rest local translation and rotation (glTF node TRS, armature units). */
  readonly t: V3;
  readonly r: Q;
}

export type HeroJoint = "pelvis" | "spine" | "torso" | "neck" | "head" | "armL" | "forearmL" | "armR" | "forearmR" | "thighL" | "shinL" | "bootL" | "thighR" | "shinR" | "bootR";

export interface IdolRig {
  readonly bones: readonly IdolRigBone[];
  /** Rotation and uniform scale from the model frame (+Z forward, +Y up, metres) to the skeleton root's parent frame. */
  readonly parentRotation: Q;
  readonly parentScale: number;
  /** Bone index driven by each procedural joint. `spine` takes half the torso bend; `neck` a share of the head turn. */
  readonly joints: Readonly<Partial<Record<HeroJoint, number>>>;
  /** Limb chains that rest in the T-pose and are swung down to the procedural rest: root (shoulder/hip bone) and tip (wrist/ankle bone). */
  readonly limbs: readonly { readonly root: number; readonly tip: number }[];
  /** Procedural pelvis pivot height at rest (metres); the hips bone moves by the pose's pelvis offset from it. */
  readonly restPelvisY: number;
}

const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q: Q, v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const qaxis = (ax: number, ay: number, az: number, angle: number): Q => {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
};
/** Engine "ZYX" Euler order: M = Rz(z) * Ry(y) * Rx(x). */
export const eulerZYX = (e: V3): Q => qmul(qmul(qaxis(0, 0, 1, e[2]), qaxis(0, 1, 0, e[1])), qaxis(1, 0, 0, e[0]));
const qscale = (q: Q, k: number): Q => {
  // slerp(identity, q, k) for a unit quaternion
  const w = Math.max(-1, Math.min(1, q[3]));
  const angle = 2 * Math.acos(Math.abs(w));
  if (angle < 1e-6) return [0, 0, 0, 1];
  const sgn = w < 0 ? -1 : 1;
  const s = Math.sin(angle / 2);
  const a = angle * k;
  const f = Math.sin(a / 2) / s;
  return [q[0] * f * sgn, q[1] * f * sgn, q[2] * f * sgn, Math.cos(a / 2)];
};
/** Shortest-arc rotation taking unit vector `from` onto unit vector `to`. */
const arc = (from: V3, to: V3): Q => {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d < -0.999999) return [0, 0, 1, 0];
  const c: V3 = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]];
  const q: Q = [c[0], c[1], c[2], 1 + d];
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const norm = (v: V3): V3 => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

interface PreparedRig {
  readonly rig: IdolRig;
  /** Rest pose world rotation (skeleton-parent frame) after the limb rest corrections. */
  readonly ref: readonly Q[];
  readonly jointOf: readonly (HeroJoint | undefined)[];
  readonly hips: number;
}

const prepared = new WeakMap<IdolRig, PreparedRig>();

function prepare(rig: IdolRig): PreparedRig {
  const hit = prepared.get(rig);
  if (hit) return hit;
  const n = rig.bones.length;
  const restRot: Q[] = new Array(n);
  const restPos: V3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = rig.bones[i]!;
    if (b.parent < 0) { restRot[i] = b.r; restPos[i] = b.t; continue; }
    const pr = restRot[b.parent]!, pp = restPos[b.parent]!;
    const o = qrot(pr, b.t);
    restRot[i] = qmul(pr, b.r);
    restPos[i] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
  }
  // procedural rest: every limb hangs straight down in the model frame
  const down = norm(qrot(qinv(rig.parentRotation), [0, -1, 0]));
  const correction: (Q | undefined)[] = new Array(n).fill(undefined);
  for (const limb of rig.limbs) {
    const a = restPos[limb.root]!, b = restPos[limb.tip]!;
    const c = arc(norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), down);
    const stack = [limb.root];
    while (stack.length) {
      const i = stack.pop()!;
      correction[i] = c;
      for (let j = 0; j < n; j++) if (rig.bones[j]!.parent === i) stack.push(j);
    }
  }
  const ref = restRot.map((q, i) => (correction[i] ? qmul(correction[i]!, q) : q));
  const jointOf: (HeroJoint | undefined)[] = new Array(n).fill(undefined);
  for (const [joint, bone] of Object.entries(rig.joints)) if (bone !== undefined) jointOf[bone] = joint as HeroJoint;
  const hips = rig.joints.pelvis ?? 0;
  const p: PreparedRig = { rig, ref, jointOf, hips };
  prepared.set(rig, p);
  return p;
}

export interface IdolBonePose {
  readonly bones: Record<string, { rotation: { x: number; y: number; z: number; w: number }; position?: { x: number; y: number; z: number } }>;
  readonly mode: "replace";
}

/**
 * The full-rig replace pose for one frame of the procedural hero articulation. Pure and allocation-light; the same
 * input always yields the same pose (no state carried between frames).
 */
export function idolHeroPose(rig: IdolRig, pose: SkyKidHeroPose): IdolBonePose {
  const p = prepare(rig);
  const A = rig.parentRotation, Ai = qinv(A);
  const toSkel = (q: Q): Q => qmul(qmul(Ai, q), A);
  const pelvis = eulerZYX(pose.pelvisRot);
  const torsoL = eulerZYX(pose.torsoRot);
  const torso = qmul(pelvis, torsoL);
  const headL = eulerZYX(pose.headRot);
  const armL = qmul(torso, eulerZYX(pose.armLRot));
  const armR = qmul(torso, eulerZYX(pose.armRRot));
  const thighL = qmul(pelvis, eulerZYX(pose.thighLRot));
  const thighR = qmul(pelvis, eulerZYX(pose.thighRRot));
  const shinL = qmul(thighL, eulerZYX(pose.shinLRot));
  const shinR = qmul(thighR, eulerZYX(pose.shinRRot));
  const world: Record<HeroJoint, Q> = {
    pelvis,
    spine: qmul(pelvis, qscale(torsoL, 0.5)),
    torso,
    neck: qmul(torso, qscale(headL, 0.4)),
    head: qmul(torso, headL),
    armL,
    forearmL: qmul(armL, eulerZYX(pose.forearmLRot)),
    armR,
    forearmR: qmul(armR, eulerZYX(pose.forearmRRot)),
    thighL,
    shinL,
    bootL: qmul(shinL, eulerZYX(pose.bootLRot)),
    thighR,
    shinR,
    bootR: qmul(shinR, eulerZYX(pose.bootRRot))
  };
  const n = rig.bones.length;
  const W: Q[] = new Array(n);
  const bones: IdolBonePose["bones"] = {};
  for (let i = 0; i < n; i++) {
    const b = rig.bones[i]!;
    const parentW: Q = b.parent < 0 ? [0, 0, 0, 1] : W[b.parent]!;
    const joint = p.jointOf[i];
    W[i] = joint ? qmul(toSkel(world[joint]), p.ref[i]!) : qmul(parentW, b.r);
    const local = joint ? qmul(qinv(parentW), W[i]!) : b.r;
    const entry: IdolBonePose["bones"][string] = { rotation: { x: local[0], y: local[1], z: local[2], w: local[3] } };
    if (i === p.hips) {
      // the procedural root carries everything under the pelvis pivot, so its offset moves the whole body
      const d = qrot(Ai, [pose.pelvisPos[0], pose.pelvisPos[1] - rig.restPelvisY, pose.pelvisPos[2]]);
      const k = 1 / rig.parentScale;
      entry.position = { x: b.t[0] + d[0] * k, y: b.t[1] + d[1] * k, z: b.t[2] + d[2] * k };
    }
    bones[b.name] = entry;
  }
  return { bones, mode: "replace" };
}
