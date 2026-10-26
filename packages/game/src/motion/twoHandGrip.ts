/**
 * Two-handed grip: a held object (bat, club, racket, staff, sword, tool) with a bottom hand at its grip point and a top hand a fixed
 * spread up its axis. Two-bone IK puts both drawn palms on the handle, a forearm twist rolls the object onto the wanted direction,
 * and the elbow swings around its circle of solutions until the forearm sits at the grip's own angle to that direction.
 *
 * Pure maths, no engine calls and no wall clock: the game feeds a pose target per fixed step and applies the returned bone
 * rotations (`poseBonesForEngine`) and object transform itself. All vectors are in the actor's local frame (+Y up). The "R" hand
 * is the bottom hand (at the grip point), "L" the top hand; a left-handed stance uses `mirrorTwoHandGripRig`.
 */

export type GripVec3 = [number, number, number];
export type GripQuat = [number, number, number, number];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const GRIP_Q_ID: GripQuat = [0, 0, 0, 1];

export const gripQNorm = (q: GripQuat): GripQuat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const gripQMul = (a: GripQuat, b: GripQuat): GripQuat => {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
};
export const gripQConj = (q: GripQuat): GripQuat => [-q[0], -q[1], -q[2], q[3]];
export const gripQAxis = (axis: GripVec3, angle: number): GripQuat => {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = angle / 2;
  const s = Math.sin(h);
  return gripQNorm([(axis[0] / l) * s, (axis[1] / l) * s, (axis[2] / l) * s, Math.cos(h)]);
};
export const gripQRot = (q: GripQuat, v: GripVec3): GripVec3 => {
  const t: GripVec3 = [2 * (q[1] * v[2] - q[2] * v[1]), 2 * (q[2] * v[0] - q[0] * v[2]), 2 * (q[0] * v[1] - q[1] * v[0])];
  const c: GripVec3 = [q[1] * t[2] - q[2] * t[1], q[2] * t[0] - q[0] * t[2], q[0] * t[1] - q[1] * t[0]];
  return [v[0] + t[0] * q[3] + c[0], v[1] + t[1] * q[3] + c[1], v[2] + t[2] * q[3] + c[2]];
};
/** Robust rotation taking normalized vector a to normalized vector b. */
export const gripQFromTo = (a: GripVec3, b: GripVec3): GripQuat => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.99999) return GRIP_Q_ID;
  if (d < -0.99999) {
    const axis: GripVec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const alt = Math.hypot(axis[0], axis[2]) < 1e-6 ? ([0, 0, 1] as GripVec3) : ([1, 0, 0] as GripVec3);
    const c: GripVec3 = [a[1] * alt[2] - a[2] * alt[1], a[2] * alt[0] - a[0] * alt[2], a[0] * alt[1] - a[1] * alt[0]];
    return gripQAxis(c, Math.PI);
  }
  return gripQNorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
};
/** Quaternion to XYZ-intrinsic Euler radians (the engine's `eulerXYZFromQuat` convention). */
export const gripQToEulerXYZ = (q: GripQuat): GripVec3 => {
  const [x, y, z, w] = gripQNorm(q);
  const m13 = 2 * (x * z + y * w);
  const pitch = Math.asin(clamp(m13, -1, 1));
  if (Math.abs(m13) >= 0.9999999) {
    const m32 = 2 * (y * z + x * w);
    const m22 = 2 * (x * x + w * w);
    return [Math.atan2(m32, m22), pitch, 0];
  }
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m23 = 2 * (y * z - x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  return [Math.atan2(-m23, m33), pitch, Math.atan2(-m12, m11)];
};
/** Quaternion to Euler radians for the engine's default node rotation order "ZYX" (matrix Rz*Ry*Rx), which `setRotation(x, y, z)` on a route node uses. Applying XYZ angles to a ZYX node tilts the object the wrong way. */
export const gripQToEulerZYX = (q: GripQuat): GripVec3 => {
  const [x, y, z, w] = gripQNorm(q);
  const m11 = 1 - 2 * (y * y + z * z);
  const m21 = 2 * (x * y + z * w);
  const m31 = 2 * (x * z - y * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const m12 = 2 * (x * y - z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const ry = Math.asin(clamp(-m31, -1, 1));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), ry, Math.atan2(m21, m11)];
  return [0, ry, Math.atan2(-m12, m22)];
};
export const gripUnit = (v: GripVec3): GripVec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Rotate about +Y (positive angle turns +X toward -Z, the chest-yaw convention of the solver). */
export const gripRotY = (angle: number, v: GripVec3): GripVec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

/** Two-bone IK: elbow position for shoulder to target with an elbow-hint pole direction; targets past the arm's reach are clamped to it. */
export function solveGripTwoBone(shoulder: GripVec3, target: GripVec3, pole: GripVec3, l1: number, l2: number): GripVec3 {
  const to: GripVec3 = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  const dRaw = Math.hypot(to[0], to[1], to[2]);
  const d = clamp(dRaw, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const n: GripVec3 = dRaw < 1e-6 ? [0, 0, 1] : [to[0] / dRaw, to[1] / dRaw, to[2] / dRaw];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole[0] * n[0] + pole[1] * n[1] + pole[2] * n[2];
  let b: GripVec3 = [pole[0] - n[0] * pd, pole[1] - n[1] * pd, pole[2] - n[2] * pd];
  const bl = Math.hypot(b[0], b[1], b[2]);
  b = bl < 1e-5 ? gripUnit([n[1], n[2], n[0]]) : [b[0] / bl, b[1] / bl, b[2] / bl];
  return [shoulder[0] + n[0] * a + b[0] * h, shoulder[1] + n[1] * a + b[1] * h, shoulder[2] + n[2] * a + b[2] * h];
}

/** Elbow for shoulder to target with the hint pole rotated by `gamma` about the shoulder-to-target axis (the elbow's circle of solutions). */
export function orbitGripElbow(shoulder: GripVec3, target: GripVec3, pole: GripVec3, l1: number, l2: number, gamma: number): GripVec3 {
  const e0 = solveGripTwoBone(shoulder, target, pole, l1, l2);
  if (gamma === 0) return e0;
  const to: GripVec3 = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  const n = gripUnit(to);
  const r: GripVec3 = [e0[0] - shoulder[0], e0[1] - shoulder[1], e0[2] - shoulder[2]];
  const rn = r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
  const along: GripVec3 = [n[0] * rn, n[1] * rn, n[2] * rn];
  const perp: GripVec3 = [r[0] - along[0], r[1] - along[1], r[2] - along[2]];
  const cr: GripVec3 = [n[1] * perp[2] - n[2] * perp[1], n[2] * perp[0] - n[0] * perp[2], n[0] * perp[1] - n[1] * perp[0]];
  const c = Math.cos(gamma);
  const sn = Math.sin(gamma);
  return [
    shoulder[0] + along[0] + perp[0] * c + cr[0] * sn,
    shoulder[1] + along[1] + perp[1] * c + cr[1] * sn,
    shoulder[2] + along[2] + perp[2] * c + cr[2] * sn
  ];
}

/** Twist (radians) about `axis` that rolls the rotated grip axis `a` onto `d`, compared as azimuths about `axis` and unwrapped against `prev`. */
export function gripAzimuthTwist(a: GripVec3, axis: GripVec3, d: GripVec3, prev: number): number {
  const aDot = a[0] * axis[0] + a[1] * axis[1] + a[2] * axis[2];
  const dDot = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
  const aPerp: GripVec3 = [a[0] - axis[0] * aDot, a[1] - axis[1] * aDot, a[2] - axis[2] * aDot];
  const dPerp: GripVec3 = [d[0] - axis[0] * dDot, d[1] - axis[1] * dDot, d[2] - axis[2] * dDot];
  const cr: GripVec3 = [aPerp[1] * dPerp[2] - aPerp[2] * dPerp[1], aPerp[2] * dPerp[0] - aPerp[0] * dPerp[2], aPerp[0] * dPerp[1] - aPerp[1] * dPerp[0]];
  let tau = Math.atan2(cr[0] * axis[0] + cr[1] * axis[1] + cr[2] * axis[2], aPerp[0] * dPerp[0] + aPerp[1] * dPerp[1] + aPerp[2] * dPerp[2]);
  while (tau - prev > Math.PI) tau -= 2 * Math.PI;
  while (tau - prev < -Math.PI) tau += 2 * Math.PI;
  return tau;
}

export interface TwoHandGripBoneNames {
  readonly hips: string;
  readonly spine: string;
  readonly chest: string;
  readonly rightUpperArm: string;
  readonly rightForearm: string;
  readonly leftUpperArm: string;
  readonly leftForearm: string;
}

export const DEFAULT_GRIP_BONE_NAMES: TwoHandGripBoneNames = {
  hips: "Hips",
  spine: "Spine",
  chest: "Chest",
  rightUpperArm: "RightUpperArm",
  rightForearm: "RightForearm",
  leftUpperArm: "LeftUpperArm",
  leftForearm: "LeftForearm"
};

/** The body half of the rig: bind skeleton measurements in the actor's local frame (+X = the character's left, +Z forward). */
export interface TwoHandGripBodyRig {
  /** Chest bone position at bind (hip shifts add onto it). */
  readonly chestBind: GripVec3;
  /** Shoulder offsets from the chest bone at bind. */
  readonly shoulderR: GripVec3;
  readonly shoulderL: GripVec3;
  /** Grip point in FOREARM bone space: where the drawn hand's skinned vertices actually centre in pose (measure it with the CPU skin of the solved poses, not the bind-pose centroid). */
  readonly palmR: GripVec3;
  readonly palmL: GripVec3;
  /** Bind bone directions (shoulder to elbow, elbow to palm), unit length; the left arm's are the mirror of the right's. */
  readonly bindDirUA: GripVec3;
  readonly bindDirFA: GripVec3;
  readonly bindDirUAL: GripVec3;
  readonly bindDirFAL: GripVec3;
  /** Upper arm length and elbow-to-palm length. */
  readonly upperArm: number;
  readonly foreHand: number;
  /** Hips bone translation at bind (hip shifts add onto it). */
  readonly hipsBind: GripVec3;
  /** Elbow hint for the top arm (hangs down and slightly back). */
  readonly poleL: GripVec3;
  readonly boneNames?: TwoHandGripBoneNames;
}

/** Everything the solver needs: the body, the object's calibrated socket and the grip geometry. */
export interface TwoHandGripRig extends TwoHandGripBodyRig {
  /** Rotation of the object's local grip axis (+X from the grip point toward the far end) in forearm bone space at the calibration stance. */
  readonly socketRot: GripQuat;
  /** Cosine of the angle between the forearm and the object axis at the calibration stance; the elbow orbits until the forearm sits at it. */
  readonly coneCos: number;
  /** How far up the object's axis the top hand grips (metres in actor units). */
  readonly gripSpread: number;
  /** Object length from the grip point and the sweet-spot distance along it (for `sweetPoint` and `tipPoint`). */
  readonly objectLength: number;
  readonly sweetSpot: number;
}

/** One pose target: the grip point, the object's direction, chest yaw, hip shift and the elbow hint of the bottom arm. */
export interface TwoHandGripTarget {
  readonly K: GripVec3;
  readonly D: GripVec3;
  readonly phi: number;
  readonly hip: GripVec3;
  readonly pole: GripVec3;
}

export interface TwoHandGripPrev {
  readonly tau?: number;
  readonly tauL?: number;
  readonly gamma?: number;
}

export interface TwoHandGripBone {
  position?: GripVec3;
  rotation?: GripQuat;
}

export interface TwoHandGripPose {
  /** Bone transforms keyed by the rig's bone names; feed them to `poseBonesForEngine`. */
  readonly bones: Readonly<Record<string, TwoHandGripBone>>;
  readonly tau: number;
  readonly tauL: number;
  readonly gamma: number;
  readonly qFa: GripQuat;
  /** Object orientation in the actor frame (forearm rotation times the socket): its +X is `objectDir`. */
  readonly objectRot: GripQuat;
  readonly objectDir: GripVec3;
  /** The bottom palm (the object's grip point), the top palm and the top hand's target. */
  readonly palm: GripVec3;
  readonly palmL: GripVec3;
  readonly targetL: GripVec3;
  readonly elbow: GripVec3;
  readonly elbowL: GripVec3;
  readonly chest: GripVec3;
  readonly shoulder: GripVec3;
  readonly shoulderL: GripVec3;
  readonly sweetPoint: GripVec3;
  readonly tipPoint: GripVec3;
  /** Elbow flexion in radians (0 = straight). */
  readonly flexR: number;
  readonly flexL: number;
}

export interface SolveTwoHandGripOptions {
  /** 0 to 1: the top hand lets go and relaxes toward its rest position (follow-through of a one-handed finish). Default 0. */
  readonly release?: number;
}

const flexOf = (sh: GripVec3, el: GripVec3, hand: GripVec3): number => {
  const ua = gripUnit([el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]]);
  const fa = gripUnit([hand[0] - el[0], hand[1] - el[1], hand[2] - el[2]]);
  return Math.acos(clamp(ua[0] * fa[0] + ua[1] * fa[1] + ua[2] * fa[2], -1, 1));
};

/** Where the relaxed top hand hangs (actor frame), relative to its shoulder: down the arm, slightly forward. */
export function relaxedTopHand(rig: TwoHandGripBodyRig, shoulderL: GripVec3): GripVec3 {
  const reach = (rig.upperArm + rig.foreHand) * 0.85;
  return [shoulderL[0] + 0.04, shoulderL[1] - reach, shoulderL[2] + 0.1];
}

/**
 * Calibrate the object socket from a stance: the rotation that puts the object's axis along `stanceDir` while the bottom hand holds `stanceK`
 * with the given elbow hint, and the forearm-to-axis cosine the elbow orbit then holds for every other pose.
 */
export function calibrateGripSocket(
  body: TwoHandGripBodyRig,
  stance: { readonly K: GripVec3; readonly D: GripVec3; readonly phi: number; readonly pole: GripVec3 }
): { socketRot: GripQuat; coneCos: number } {
  const sr = gripRotY(stance.phi, body.shoulderR);
  const shoulder: GripVec3 = [body.chestBind[0] + sr[0], body.chestBind[1] + sr[1], body.chestBind[2] + sr[2]];
  const elbow = solveGripTwoBone(shoulder, stance.K, stance.pole, body.upperArm, body.foreHand);
  const faDir = gripUnit([stance.K[0] - elbow[0], stance.K[1] - elbow[1], stance.K[2] - elbow[2]]);
  const qFa = gripQFromTo(body.bindDirFA, faDir);
  const socketRot = gripQMul(gripQConj(qFa), gripQFromTo([1, 0, 0], stance.D));
  const coneCos = faDir[0] * stance.D[0] + faDir[1] * stance.D[1] + faDir[2] * stance.D[2];
  return { socketRot, coneCos };
}

/**
 * Solve one pose. The bottom hand IKs onto `K`; the elbow is swung round its circle of solutions until the forearm sits at the grip's
 * fixed angle to the wanted object direction `D` (preferring the elbow nearest the previous frame's, `prev.gamma`); a forearm twist rolls
 * the socketed object onto `D`; the top hand then IKs onto the point `gripSpread` up the object's real axis and rolls onto it the same way.
 */
export function solveTwoHandGrip(rig: TwoHandGripRig, target: TwoHandGripTarget, prev: TwoHandGripPrev = {}, options: SolveTwoHandGripOptions = {}): TwoHandGripPose {
  const { K, D, phi, hip, pole: poleR } = target;
  const prevTau = prev.tau ?? 0;
  const prevTauL = prev.tauL ?? 0;
  const prevGamma = prev.gamma ?? 0;
  const names = rig.boneNames ?? DEFAULT_GRIP_BONE_NAMES;
  const chest: GripVec3 = [rig.chestBind[0] + hip[0], rig.chestBind[1] + hip[1], rig.chestBind[2] + hip[2]];
  const sr = gripRotY(phi, rig.shoulderR);
  const sl = gripRotY(phi, rig.shoulderL);
  const shRt: GripVec3 = [chest[0] + sr[0], chest[1] + sr[1], chest[2] + sr[2]];
  const shLt: GripVec3 = [chest[0] + sl[0], chest[1] + sl[1], chest[2] + sl[2]];

  let gamma = prevGamma;
  let bestCost = Infinity;
  for (let i = 0; i < 96; i++) {
    const g = -Math.PI + (2 * Math.PI * i) / 96;
    const e = orbitGripElbow(shRt, K, poleR, rig.upperArm, rig.foreHand, g);
    const f = gripUnit([K[0] - e[0], K[1] - e[1], K[2] - e[2]]);
    const cosA = f[0] * D[0] + f[1] * D[1] + f[2] * D[2];
    let dg = g - prevGamma;
    while (dg > Math.PI) dg -= 2 * Math.PI;
    while (dg < -Math.PI) dg += 2 * Math.PI;
    const cost = (cosA - rig.coneCos) * (cosA - rig.coneCos) + 0.004 * dg * dg;
    if (cost < bestCost) {
      bestCost = cost;
      gamma = g;
    }
  }
  const eR = orbitGripElbow(shRt, K, poleR, rig.upperArm, rig.foreHand, gamma);
  const faDir = gripUnit([K[0] - eR[0], K[1] - eR[1], K[2] - eR[2]]);
  const qUaR = gripQFromTo(rig.bindDirUA, gripUnit([eR[0] - shRt[0], eR[1] - shRt[1], eR[2] - shRt[2]]));
  const qFaZt = gripQFromTo(rig.bindDirFA, faDir);
  const tau = gripAzimuthTwist(gripQRot(gripQMul(qFaZt, rig.socketRot), [1, 0, 0]), faDir, D, prevTau);
  const qFa = gripQMul(gripQAxis(faDir, tau), qFaZt);
  const objectRot = gripQMul(qFa, rig.socketRot);
  const objectDir = gripQRot(objectRot, [1, 0, 0]);
  const palmOff = gripQRot(qFa, rig.palmR);
  const palm: GripVec3 = [eR[0] + palmOff[0], eR[1] + palmOff[1], eR[2] + palmOff[2]];

  // The top hand grips the object where it really is (palm plus the socketed object's own direction), not where D asked for it.
  const gripped: GripVec3 = [palm[0] + objectDir[0] * rig.gripSpread, palm[1] + objectDir[1] * rig.gripSpread, palm[2] + objectDir[2] * rig.gripSpread];
  const release = clamp(options.release ?? 0, 0, 1);
  let targetL = gripped;
  if (release > 0) {
    const rest = relaxedTopHand(rig, shLt);
    const u = smoothstep(release);
    targetL = [lerp(gripped[0], rest[0], u), lerp(gripped[1], rest[1], u), lerp(gripped[2], rest[2], u)];
  }
  const eL = solveGripTwoBone(shLt, targetL, rig.poleL, rig.upperArm, rig.foreHand);
  const faDirL = gripUnit([targetL[0] - eL[0], targetL[1] - eL[1], targetL[2] - eL[2]]);
  const qFaLZt = gripQFromTo(rig.bindDirFAL, faDirL);
  // Top hand: the mirror of the bottom hand's grip axis, rolled onto the object the same way (free-hanging when released).
  const gripR = gripQRot(rig.socketRot, [1, 0, 0]);
  const gripL: GripVec3 = [-gripR[0], gripR[1], gripR[2]];
  const tauL = release >= 1 ? prevTauL : gripAzimuthTwist(gripQRot(qFaLZt, gripL), faDirL, objectDir, prevTauL);
  const qFaL = gripQMul(gripQAxis(faDirL, tauL), qFaLZt);

  const qChest = gripQAxis([0, 1, 0], phi);
  const qUaL = gripQFromTo(rig.bindDirUAL, gripUnit([eL[0] - shLt[0], eL[1] - shLt[1], eL[2] - shLt[2]]));
  const palmLOff = gripQRot(qFaL, rig.palmL);
  const palmL: GripVec3 = [eL[0] + palmLOff[0], eL[1] + palmLOff[1], eL[2] + palmLOff[2]];
  const bones: Record<string, TwoHandGripBone> = {
    [names.hips]: { position: [rig.hipsBind[0] + hip[0], rig.hipsBind[1] + hip[1], rig.hipsBind[2] + hip[2]] },
    // Pin the spine so the chest forward kinematics the socket was calibrated against is exact.
    [names.spine]: { rotation: GRIP_Q_ID },
    [names.chest]: { rotation: qChest },
    [names.rightUpperArm]: { rotation: gripQMul(gripQConj(qChest), qUaR) },
    [names.rightForearm]: { rotation: gripQMul(gripQConj(qUaR), qFa) },
    [names.leftUpperArm]: { rotation: gripQMul(gripQConj(qChest), qUaL) },
    [names.leftForearm]: { rotation: gripQMul(gripQConj(qUaL), qFaL) }
  };
  return {
    bones,
    tau,
    tauL,
    gamma,
    qFa,
    objectRot,
    objectDir,
    palm,
    palmL,
    targetL,
    elbow: eR,
    elbowL: eL,
    chest,
    shoulder: shRt,
    shoulderL: shLt,
    sweetPoint: [palm[0] + objectDir[0] * rig.sweetSpot, palm[1] + objectDir[1] * rig.sweetSpot, palm[2] + objectDir[2] * rig.sweetSpot],
    tipPoint: [palm[0] + objectDir[0] * rig.objectLength, palm[1] + objectDir[1] * rig.objectLength, palm[2] + objectDir[2] * rig.objectLength],
    flexR: flexOf(shRt, eR, palm),
    flexL: flexOf(shLt, eL, palmL)
  };
}

/** The same grip for the mirror-image stance (left-handed batter, golfer, hitter): x is flipped and the two arms swap roles. */
export function mirrorTwoHandGripBodyRig(rig: TwoHandGripBodyRig): TwoHandGripBodyRig {
  const m = (v: GripVec3): GripVec3 => [-v[0], v[1], v[2]];
  const n = rig.boneNames ?? DEFAULT_GRIP_BONE_NAMES;
  return {
    ...rig,
    chestBind: m(rig.chestBind),
    shoulderR: m(rig.shoulderL),
    shoulderL: m(rig.shoulderR),
    palmR: m(rig.palmL),
    palmL: m(rig.palmR),
    bindDirUA: m(rig.bindDirUAL),
    bindDirFA: m(rig.bindDirFAL),
    bindDirUAL: m(rig.bindDirUA),
    bindDirFAL: m(rig.bindDirFA),
    poleL: m(rig.poleL),
    boneNames: {
      ...n,
      rightUpperArm: n.leftUpperArm,
      rightForearm: n.leftForearm,
      leftUpperArm: n.rightUpperArm,
      leftForearm: n.rightForearm
    }
  };
}

/** The engine's animation pose reads `{x,y,z}` and `{x,y,z,w}` objects: tuple arrays would leave every bone untouched. */
export function twoHandGripBonesForEngine(
  bones: Readonly<Record<string, { position?: readonly number[]; rotation?: readonly number[] }>>
): Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> {
  const out: Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> = {};
  for (const [name, b] of Object.entries(bones)) {
    out[name] = {
      ...(b.position ? { position: { x: b.position[0]!, y: b.position[1]!, z: b.position[2]! } } : {}),
      ...(b.rotation ? { rotation: { x: b.rotation[0]!, y: b.rotation[1]!, z: b.rotation[2]!, w: b.rotation[3]! } } : {})
    };
  }
  return out;
}

export interface TwoHandGripState {
  readonly tau: number;
  readonly tauL: number;
  readonly gamma: number;
  readonly release: number;
  readonly steps: number;
  readonly pose: TwoHandGripPose | null;
}

export interface TwoHandGrip {
  readonly rig: TwoHandGripRig;
  /** Solve one fixed step, carrying the elbow and twist continuity between steps. `release` (0 to 1) lets the top hand go. */
  step(target: TwoHandGripTarget, release?: number): TwoHandGripPose;
  state(): TwoHandGripState;
  /** Forget the continuity (a new swing from the stance). */
  reset(): void;
}

export function createTwoHandGrip(rig: TwoHandGripRig): TwoHandGrip {
  let tau = 0;
  let tauL = 0;
  let gamma = 0;
  let release = 0;
  let steps = 0;
  let pose: TwoHandGripPose | null = null;
  return {
    rig,
    step(target, rel = 0) {
      release = clamp(rel, 0, 1);
      pose = solveTwoHandGrip(rig, target, { tau, tauL, gamma }, { release });
      tau = pose.tau;
      tauL = pose.tauL;
      gamma = pose.gamma;
      steps += 1;
      return pose;
    },
    state: () => ({ tau, tauL, gamma, release, steps, pose }),
    reset() {
      tau = 0;
      tauL = 0;
      gamma = 0;
      release = 0;
      steps = 0;
      pose = null;
    }
  };
}

/** Where the drawn palm centres: the mean of the hand's skinned vertices (a flat xyz array or a list of points). Use it so grip is measured against what the screen shows. */
export function handCentroid(vertices: ArrayLike<number> | ReadonlyArray<readonly [number, number, number]>): GripVec3 {
  const flat = vertices.length > 0 && typeof (vertices as ArrayLike<unknown>)[0] === "number";
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  if (flat) {
    const f = vertices as ArrayLike<number>;
    for (let i = 0; i + 2 < f.length; i += 3) {
      x += f[i]!;
      y += f[i + 1]!;
      z += f[i + 2]!;
      n += 1;
    }
  } else {
    for (const p of vertices as ReadonlyArray<readonly [number, number, number]>) {
      x += p[0];
      y += p[1];
      z += p[2];
      n += 1;
    }
  }
  return n === 0 ? [0, 0, 0] : [x / n, y / n, z / n];
}

export interface GripSample {
  /** Label used to group samples ("stance", "load", "swing", "follow-through"). */
  readonly phase?: string;
  /** The object's grip point (the knob of a bat, the butt of a club) and its unit axis toward the far end; `length` is the handle length the top hand may use. */
  readonly knob: readonly [number, number, number];
  readonly axis: readonly [number, number, number];
  readonly length?: number;
  /** Palm positions: from the solver, or from `handCentroid` of the CPU-skinned hand vertices. */
  readonly bottomPalm: readonly [number, number, number];
  readonly topPalm: readonly [number, number, number];
}

export interface GripLimits {
  /** Bottom palm to the grip point. Default 0.06 m. */
  readonly knobToBottomPalm: number;
  /** Top palm to the object axis. Default 0.06 m. */
  readonly topPalmToAxis: number;
  /** Phases allowed the looser tail limit (follow-through). */
  readonly tailPhases: readonly string[];
  /** The looser limit for those phases. Default 0.08 m. */
  readonly tail: number;
}

export const DEFAULT_GRIP_LIMITS: GripLimits = { knobToBottomPalm: 0.06, topPalmToAxis: 0.06, tailPhases: ["follow-through"], tail: 0.08 };

export interface GripPhaseReport {
  readonly phase: string;
  readonly samples: number;
  readonly knobToBottomPalmMax: number;
  readonly knobToBottomPalmP95: number;
  readonly topPalmToAxisMax: number;
  readonly topPalmToAxisP95: number;
  /** Top palm distance along the axis from the knob (should sit about `gripSpread`, inside the handle). */
  readonly topAlongMin: number;
  readonly topAlongMax: number;
  readonly limit: number;
  readonly ok: boolean;
}

export interface GripReport {
  readonly samples: number;
  readonly phases: readonly GripPhaseReport[];
  readonly knobToBottomPalmMax: number;
  readonly topPalmToAxisMax: number;
  readonly ok: boolean;
  readonly failures: readonly string[];
}

const p95 = (xs: number[]): number => (xs.length === 0 ? Number.NaN : [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!);

/** Per-phase grip numbers for a recorded plate appearance, round of golf, tennis point or sword exchange: palms against the object's axis. */
export function measureGrip(samples: readonly GripSample[], limits: Partial<GripLimits> = {}): GripReport {
  const lim: GripLimits = { ...DEFAULT_GRIP_LIMITS, ...limits };
  const groups = new Map<string, { k: number[]; a: number[]; along: number[] }>();
  for (const s of samples) {
    const phase = s.phase ?? "all";
    const g = groups.get(phase) ?? { k: [], a: [], along: [] };
    groups.set(phase, g);
    const ax = gripUnit([s.axis[0], s.axis[1], s.axis[2]]);
    g.k.push(Math.hypot(s.bottomPalm[0] - s.knob[0], s.bottomPalm[1] - s.knob[1], s.bottomPalm[2] - s.knob[2]));
    const rel: GripVec3 = [s.topPalm[0] - s.knob[0], s.topPalm[1] - s.knob[1], s.topPalm[2] - s.knob[2]];
    const along = rel[0] * ax[0] + rel[1] * ax[1] + rel[2] * ax[2];
    const perp: GripVec3 = [rel[0] - ax[0] * along, rel[1] - ax[1] * along, rel[2] - ax[2] * along];
    g.a.push(Math.hypot(perp[0], perp[1], perp[2]));
    g.along.push(along);
  }
  const phases: GripPhaseReport[] = [];
  const failures: string[] = [];
  for (const [phase, g] of groups) {
    const limit = lim.tailPhases.includes(phase) ? lim.tail : Math.max(lim.knobToBottomPalm, lim.topPalmToAxis);
    const kLimit = lim.tailPhases.includes(phase) ? lim.tail : lim.knobToBottomPalm;
    const aLimit = lim.tailPhases.includes(phase) ? lim.tail : lim.topPalmToAxis;
    const kMax = Math.max(...g.k);
    const aMax = Math.max(...g.a);
    const ok = kMax <= kLimit && aMax <= aLimit;
    if (kMax > kLimit) failures.push(`${phase}: bottom palm ${kMax.toFixed(3)} m from the grip point > ${kLimit} m`);
    if (aMax > aLimit) failures.push(`${phase}: top palm ${aMax.toFixed(3)} m from the object axis > ${aLimit} m`);
    phases.push({
      phase,
      samples: g.k.length,
      knobToBottomPalmMax: kMax,
      knobToBottomPalmP95: p95(g.k),
      topPalmToAxisMax: aMax,
      topPalmToAxisP95: p95(g.a),
      topAlongMin: Math.min(...g.along),
      topAlongMax: Math.max(...g.along),
      limit,
      ok
    });
  }
  if (samples.length === 0) failures.push("no grip samples");
  return {
    samples: samples.length,
    phases,
    knobToBottomPalmMax: phases.length === 0 ? Number.NaN : Math.max(...phases.map((p) => p.knobToBottomPalmMax)),
    topPalmToAxisMax: phases.length === 0 ? Number.NaN : Math.max(...phases.map((p) => p.topPalmToAxisMax)),
    ok: failures.length === 0,
    failures
  };
}
