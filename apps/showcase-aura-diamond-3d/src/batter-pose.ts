export type Vec3 = [number, number, number];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/* ================================================================== *
 * Batter rig + swing pose system                                     *
 *                                                                    *
 * The bat is SOCKETED to the batter's right forearm bone through the *
 * engine's `animation.attach` (engine owns the bat transform while   *
 * attached). The stance and swing are driven by an OVERLAY pose on   *
 * top of the Idle_Loop clip: two-bone IK places both hands on the   *
 * bat knob (right hand at the knob, left hand stacked just above),  *
 * and a forearm twist solves so the socketed bat sweeps the         *
 * authored arc — load, stride, rotation through the zone at contact *
 * height, follow-through wrapping around the torso.                 *
 * ================================================================== */

/** diamondAthlete bind skeleton, actor-local (+x = character's LEFT, +z = toward the pitcher). */
export const RIG = {
  chestBind: [0, 0.3973, 0] as Vec3,
  /** Shoulder offsets from the Chest bone (bind local translations). */
  shoulderR: [-0.2, 0.1465, 0] as Vec3,
  shoulderL: [0.2, 0.1465, 0] as Vec3,
  /** Grip point in FOREARM bone space: where the hand's skinned vertices (distance from the elbow above 0.34 m in bind) actually centre in pose (CPU skin of the solved poses, mean over stance, swing and follow-through); it sits about 5 cm nearer the elbow than the bind-pose centroid because the hand weights blend with neighbouring joints. */
  palmR: [-0.158, -0.296, 0.06] as Vec3,
  palmL: [0.158, -0.296, 0.06] as Vec3,
  /** Bind bone directions (shoulder→elbow, elbow→palm), unit length. */
  bindDirUA: [0, 0, 1] as Vec3,
  bindDirFA: [0, 0, 1] as Vec3,
  /** The left arm's bind directions are the mirror (x flipped) of the right arm's. */
  bindDirUAL: [0, 0, 1] as Vec3,
  bindDirFAL: [0, 0, 1] as Vec3,
  upperArm: 0.2555,
  foreHand: Math.hypot(0.158, 0.296, 0.06),
  /** Hips bind-local translation under Root (stride shifts add onto this). */
  hipsBind: [0, 0.93706, 0] as Vec3
};
(() => {
  const n = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  RIG.bindDirUA = n([-0.05, -0.25, 0.01]);
  RIG.bindDirFA = n([-0.158, -0.296, 0.06]);
  RIG.bindDirUAL = n([0.05, -0.25, 0.01]);
  RIG.bindDirFAL = n([0.158, -0.296, 0.06]);
})();

/** Node fit scale for the 1.88 m athletes (raw GLB height 1.903 m). */
export const ACTOR_FIT = 1.88 / 1.903;
/** Bat GLB is horizontal along X (knob at -X, barrel at +X), fitted to 1.02 m. */
export const BAT_FIT = 1.02 / 1.903;
/** The fit's grounding shift in actor units: the batter node sits on the ground and the model's lowest vertex sits on the node, so skeleton y 0 (the hips) is the GLB's Root offset above it. */
/** Where gloves and the mitt sit in LEFT FOREARM bone space (tuned by eye against the original palm estimate; unchanged by the measured grip point). */
export const GLOVE_ATTACH_POS: Vec3 = [0.147, -0.265, 0.157];
export const FIT_GROUND_N: Vec3 = [0, 0.952, 0];
/** Bat length / knob offset in ACTOR units (bone space scales by ACTOR_FIT). */
export const BAT_LEN = 1.02 / ACTOR_FIT;
export const KNOB_HALF = 0.9515 * BAT_FIT / ACTOR_FIT;
/** Sweet spot sits ~72% up the barrel from the knob. */
export const SWEET_SPOT = 0.72 * BAT_LEN;
/** How much of the outgoing direction comes from the bat's face and swing instead of the timing model (0 to 1). */
export const BAT_PHYSICS_WEIGHT = 0.5;
/** The bat can move the ball at most this far (degrees) from the timing model, so a noisy swing never turns a perfect hit into a roller. */
export const BAT_SPRAY_MAX_DELTA_DEG = 14;
export const BAT_LAUNCH_MAX_DELTA_DEG = 9;
/** Swing timeline (normalised t 0→1): load → stride → contact at 0.5 → follow-through. */
export const SWING_TOTAL = 1.0;
export const SWING_CONTACT_T = 0.5;
/** Bat/forearm angle fixed by the socket calibration; set from the stance below. */
export let BAT_CONE_COS = 0.5527;

/* ---------- Tiny quat helpers (x, y, z, w tuples) ---------- */
export type Quat = [number, number, number, number];
export const Q_ID: Quat = [0, 0, 0, 1];
export const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const qMul = (a: Quat, b: Quat): Quat => {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
};
export const qConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export const qAxis = (axis: Vec3, angle: number): Quat => {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = angle / 2;
  const s = Math.sin(h);
  return qNorm([(axis[0] / l) * s, (axis[1] / l) * s, (axis[2] / l) * s, Math.cos(h)]);
};
export const qRot = (q: Quat, v: Vec3): Vec3 => {
  const t: Vec3 = [2 * (q[1] * v[2] - q[2] * v[1]), 2 * (q[2] * v[0] - q[0] * v[2]), 2 * (q[0] * v[1] - q[1] * v[0])];
  const c: Vec3 = [q[1] * t[2] - q[2] * t[1], q[2] * t[0] - q[0] * t[2], q[0] * t[1] - q[1] * t[0]];
  return [v[0] + t[0] * q[3] + c[0], v[1] + t[1] * q[3] + c[1], v[2] + t[2] * q[3] + c[2]];
};
/** Robust rotation taking normalized vector a to normalized vector b. */
export const qFromTo = (a: Vec3, b: Vec3): Quat => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.99999) return Q_ID;
  if (d < -0.99999) {
    const axis: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const alt = Math.hypot(axis[0], axis[2]) < 1e-6 ? ([0, 0, 1] as Vec3) : ([1, 0, 0] as Vec3);
    const c: Vec3 = [a[1] * alt[2] - a[2] * alt[1], a[2] * alt[0] - a[0] * alt[2], a[0] * alt[1] - a[1] * alt[0]];
    return qAxis(c, Math.PI);
  }
  return qNorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
};
/** Quat → XYZ-intrinsic Euler radians (engine `eulerXYZFromQuat` convention). */
export const qToEulerXYZ = (q: Quat): Vec3 => {
  const [x, y, z, w] = qNorm(q);
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
/** Quat → Euler radians for the engine's default node rotation order "ZYX" (matrix Rz·Ry·Rx), which `setRotation(x, y, z)` on a route node uses. */
export const qToEulerZYX = (q: Quat): Vec3 => {
  const [x, y, z, w] = qNorm(q);
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
export const unit3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const rotY = (angle: number, v: Vec3): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

/** One swing keyframe: knob target, bat direction, chest yaw, hips shift, elbow pole. */
export interface SwingKey {
  readonly t: number;
  readonly K: Vec3;
  readonly D: Vec3;
  readonly phi: number;
  readonly hip: Vec3;
}

/** Stance: hands a fist in front of the back shoulder at chin height, bat leaning up and back behind the head. */
export const STANCE_KEY: SwingKey = {
  t: 0,
  K: [-0.08, 0.58, 0.4],
  D: unit3([0.2, 0.5, -0.84]),
  phi: 0.2,
  hip: [0, 0, 0]
};
/** Contact bat direction (toward the plate, level, slightly pitcher-side). */
export const CONTACT_DIR: Vec3 = unit3([-0.99, -0.06, 0.12]);
/** Elbow poles: arms hang naturally; the contact pole comes from the per-swing solve. */
export const POLE_STANCE_R: Vec3 = unit3([-0.3, -1, -0.3]);
export const POLE_STANCE_L: Vec3 = unit3([0.3, -1, -0.3]);
/** Left hand stacks just above the right on the knob. */
export const GRIP_SPREAD = 0.09;
/** Batter stance yaw — right-handed box, right (back) shoulder toward the catcher. */
export const BATTER_YAW = Math.PI - 0.35;

/** The engine's AnimationPose reads `{x,y,z}` / `{x,y,z,w}` objects: arrays would leave every bone untouched. */
export function poseBonesForEngine(bones: Record<string, { position?: Vec3; rotation?: Quat }>): Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> {
  const out: Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> = {};
  for (const [name, b] of Object.entries(bones)) {
    out[name] = {
      ...(b.position ? { position: { x: b.position[0], y: b.position[1], z: b.position[2] } } : {}),
      ...(b.rotation ? { rotation: { x: b.rotation[0], y: b.rotation[1], z: b.rotation[2], w: b.rotation[3] } } : {})
    };
  }
  return out;
}

/** Two-bone IK: elbow position for shoulder→target with an elbow-hint pole. */
export function solveTwoBone(shoulder: Vec3, target: Vec3, pole: Vec3, l1: number, l2: number): Vec3 {
  const to: Vec3 = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  const dRaw = Math.hypot(to[0], to[1], to[2]);
  const d = clamp(dRaw, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const n: Vec3 = dRaw < 1e-6 ? [0, 0, 1] : [to[0] / dRaw, to[1] / dRaw, to[2] / dRaw];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole[0] * n[0] + pole[1] * n[1] + pole[2] * n[2];
  let b: Vec3 = [pole[0] - n[0] * pd, pole[1] - n[1] * pd, pole[2] - n[2] * pd];
  const bl = Math.hypot(b[0], b[1], b[2]);
  b = bl < 1e-5 ? unit3([n[1], n[2], n[0]]) : [b[0] / bl, b[1] / bl, b[2] / bl];
  return [shoulder[0] + n[0] * a + b[0] * h, shoulder[1] + n[1] * a + b[1] * h, shoulder[2] + n[2] * a + b[2] * h];
}

/** Elbow for shoulder→target with the hint pole rotated by `gamma` about the shoulder→target axis (the elbow's circle of solutions). */
function orbitElbow(shoulder: Vec3, target: Vec3, pole: Vec3, l1: number, l2: number, gamma: number): Vec3 {
  const e0 = solveTwoBone(shoulder, target, pole, l1, l2);
  if (gamma === 0) return e0;
  const to: Vec3 = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  const n = unit3(to);
  // Rotate the elbow's offset from the shoulder→target line about that line (Rodrigues).
  const r: Vec3 = [e0[0] - shoulder[0], e0[1] - shoulder[1], e0[2] - shoulder[2]];
  const rn = r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
  const along: Vec3 = [n[0] * rn, n[1] * rn, n[2] * rn];
  const perp: Vec3 = [r[0] - along[0], r[1] - along[1], r[2] - along[2]];
  const cr: Vec3 = [n[1] * perp[2] - n[2] * perp[1], n[2] * perp[0] - n[0] * perp[2], n[0] * perp[1] - n[1] * perp[0]];
  const c = Math.cos(gamma);
  const sn = Math.sin(gamma);
  return [
    shoulder[0] + along[0] + perp[0] * c + cr[0] * sn,
    shoulder[1] + along[1] + perp[1] * c + cr[1] * sn,
    shoulder[2] + along[2] + perp[2] * c + cr[2] * sn
  ];
}

/** Socket rotation (bone space) calibrated so the stance reads bat-up-over-the-shoulder. */
export function stanceAttachQuat(): Quat {
  const sr = rotY(STANCE_KEY.phi, RIG.shoulderR);
  const shoulder = [RIG.chestBind[0] + sr[0], RIG.chestBind[1] + sr[1], RIG.chestBind[2] + sr[2]] as Vec3;
  const elbow = solveTwoBone(shoulder, STANCE_KEY.K, POLE_STANCE_R, RIG.upperArm, RIG.foreHand);
  const faDir = unit3([STANCE_KEY.K[0] - elbow[0], STANCE_KEY.K[1] - elbow[1], STANCE_KEY.K[2] - elbow[2]]);
  const qFa = qFromTo(RIG.bindDirFA, faDir);
  return qMul(qConj(qFa), qFromTo([1, 0, 0], STANCE_KEY.D));
}

/** Fixed socket constants: bone-space offset TRS placing the KNOB at the right palm. */
export const BAT_ATTACH_ROT: Quat = stanceAttachQuat();
BAT_CONE_COS = (() => {
  const sr = rotY(STANCE_KEY.phi, RIG.shoulderR);
  const shoulder: Vec3 = [RIG.chestBind[0] + sr[0], RIG.chestBind[1] + sr[1], RIG.chestBind[2] + sr[2]];
  const elbow = solveTwoBone(shoulder, STANCE_KEY.K, POLE_STANCE_R, RIG.upperArm, RIG.foreHand);
  const fa = unit3([STANCE_KEY.K[0] - elbow[0], STANCE_KEY.K[1] - elbow[1], STANCE_KEY.K[2] - elbow[2]]);
  return fa[0] * STANCE_KEY.D[0] + fa[1] * STANCE_KEY.D[1] + fa[2] * STANCE_KEY.D[2];
})();
export const BAT_ATTACH_EULER: Vec3 = qToEulerXYZ(BAT_ATTACH_ROT);
export const BAT_ATTACH_POS: Vec3 = [
  RIG.palmR[0] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[0],
  RIG.palmR[1] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[1],
  RIG.palmR[2] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[2]
];

/** Twist (radians) about `axis` that rolls the rotated grip axis `a` onto `d`, compared as azimuths about `axis` and unwrapped against `prev`. */
function azimuthTwistAxis(a: Vec3, axis: Vec3, d: Vec3, prev: number): number {
  const aDot = a[0] * axis[0] + a[1] * axis[1] + a[2] * axis[2];
  const dDot = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
  const aPerp: Vec3 = [a[0] - axis[0] * aDot, a[1] - axis[1] * aDot, a[2] - axis[2] * aDot];
  const dPerp: Vec3 = [d[0] - axis[0] * dDot, d[1] - axis[1] * dDot, d[2] - axis[2] * dDot];
  const cr: Vec3 = [aPerp[1] * dPerp[2] - aPerp[2] * dPerp[1], aPerp[2] * dPerp[0] - aPerp[0] * dPerp[2], aPerp[0] * dPerp[1] - aPerp[1] * dPerp[0]];
  let tau = Math.atan2(cr[0] * axis[0] + cr[1] * axis[1] + cr[2] * axis[2], aPerp[0] * dPerp[0] + aPerp[1] * dPerp[1] + aPerp[2] * dPerp[2]);
  while (tau - prev > Math.PI) tau -= 2 * Math.PI;
  while (tau - prev < -Math.PI) tau += 2 * Math.PI;
  return tau;
}

function azimuthTwist(qZeroTwist: Quat, axis: Vec3, d: Vec3, prev: number): number {
  return azimuthTwistAxis(qRot(qZeroTwist, [1, 0, 0]), axis, d, prev);
}

export interface PoseSolve {
  readonly bones: {
    Hips: { position: Vec3 };
    Spine: { rotation: Quat };
    Chest: { rotation: Quat };
    RightUpperArm: { rotation: Quat };
    RightForearm: { rotation: Quat };
    LeftUpperArm: { rotation: Quat };
    LeftForearm: { rotation: Quat };
  };
  readonly tau: number;
  readonly qFa: Quat;
  readonly elbow: Vec3;
  readonly batDir: Vec3;
  readonly sweetActor: Vec3;
  readonly tipActor: Vec3;
  readonly palmActor: Vec3;
  readonly chestActor: Vec3;
  readonly shoulderActor: Vec3;
  readonly shoulderLActor: Vec3;
  readonly elbowL: Vec3;
  readonly palmLActor: Vec3;
  readonly targetL: Vec3;
  readonly tauL: number;
  readonly gamma: number;
  /** Elbow flexion in radians (0 = straight), right and left. */
  readonly flexR: number;
  readonly flexL: number;
}

/**
 * Solve the batter pose for (knob target K, bat direction D, chest yaw phi,
 * hips shift). Both arms IK onto the knob (right hand at the knob, left hand
 * GRIP_SPREAD up the bat); a forearm twist rotates the socketed bat onto D.
 */
export function solveBatterPose(K: Vec3, D: Vec3, phi: number, hip: Vec3, poleR: Vec3, prevTau: number, prevTauL = 0, prevGamma = 0): PoseSolve {
  const chest: Vec3 = [RIG.chestBind[0] + hip[0], RIG.chestBind[1] + hip[1], RIG.chestBind[2] + hip[2]];
  const sr = rotY(phi, RIG.shoulderR);
  const sl = rotY(phi, RIG.shoulderL);
  const shRt: Vec3 = [chest[0] + sr[0], chest[1] + sr[1], chest[2] + sr[2]];
  const shLt: Vec3 = [chest[0] + sl[0], chest[1] + sl[1], chest[2] + sl[2]];

  // Swing the right elbow around its circle of solutions until the forearm sits at the grip's fixed angle to the wanted bat direction D, so the bat points
  // where the animation asked and the left hand can follow it; prefer the elbow position nearest the previous frame's.
  let gamma = prevGamma;
  let bestCost = Infinity;
  for (let i = 0; i < 96; i++) {
    const g = -Math.PI + (2 * Math.PI * i) / 96;
    const e = orbitElbow(shRt, K, poleR, RIG.upperArm, RIG.foreHand, g);
    const f = unit3([K[0] - e[0], K[1] - e[1], K[2] - e[2]]);
    const cosA = f[0] * D[0] + f[1] * D[1] + f[2] * D[2];
    let dg = g - prevGamma;
    while (dg > Math.PI) dg -= 2 * Math.PI;
    while (dg < -Math.PI) dg += 2 * Math.PI;
    const cost = (cosA - BAT_CONE_COS) * (cosA - BAT_CONE_COS) + 0.004 * dg * dg;
    if (cost < bestCost) {
      bestCost = cost;
      gamma = g;
    }
  }
  const eR = orbitElbow(shRt, K, poleR, RIG.upperArm, RIG.foreHand, gamma);
  const faDir = unit3([K[0] - eR[0], K[1] - eR[1], K[2] - eR[2]]);
  const qUaR = qFromTo(RIG.bindDirUA, unit3([eR[0] - shRt[0], eR[1] - shRt[1], eR[2] - shRt[2]]));
  const qFaZt = qFromTo(RIG.bindDirFA, faDir);
  // Twist about the forearm axis so the socketed bat lands on D (exact azimuth
  // alignment of the perpendicular projections), unwrapped against prevTau.
  const tau = azimuthTwist(qMul(qFaZt, BAT_ATTACH_ROT), faDir, D, prevTau);
  const qFa = qMul(qAxis(faDir, tau), qFaZt);
  const batDir = qRot(qMul(qFa, BAT_ATTACH_ROT), [1, 0, 0]);
  const palmOff = qRot(qFa, RIG.palmR);
  const palm: Vec3 = [eR[0] + palmOff[0], eR[1] + palmOff[1], eR[2] + palmOff[2]];

  // The top hand grips the bat where the bat really is (palm + the socketed bat's own direction), not where D asked for it.
  const targetL: Vec3 = [palm[0] + batDir[0] * GRIP_SPREAD, palm[1] + batDir[1] * GRIP_SPREAD, palm[2] + batDir[2] * GRIP_SPREAD];
  const eL = solveTwoBone(shLt, targetL, POLE_STANCE_L, RIG.upperArm, RIG.foreHand);
  const faDirL = unit3([targetL[0] - eL[0], targetL[1] - eL[1], targetL[2] - eL[2]]);
  const qFaLZt = qFromTo(RIG.bindDirFAL, faDirL);
  // Left hand: the mirror of the right hand's grip axis, rolled onto the bat the same way.
  const gripR = qRot(BAT_ATTACH_ROT, [1, 0, 0]);
  const gripL: Vec3 = [-gripR[0], gripR[1], gripR[2]];
  const tauL = azimuthTwistAxis(qRot(qFaLZt, gripL), faDirL, batDir, prevTauL);
  const qFaL = qMul(qAxis(faDirL, tauL), qFaLZt);

  const qChest = qAxis([0, 1, 0], phi);
  const qUaL = qFromTo(RIG.bindDirUAL, unit3([eL[0] - shLt[0], eL[1] - shLt[1], eL[2] - shLt[2]]));
  const palmLOff = qRot(qFaL, RIG.palmL);
  const palmL: Vec3 = [eL[0] + palmLOff[0], eL[1] + palmLOff[1], eL[2] + palmLOff[2]];
  const flex = (sh: Vec3, el: Vec3, hand: Vec3): number => {
    const ua = unit3([el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]]);
    const fa = unit3([hand[0] - el[0], hand[1] - el[1], hand[2] - el[2]]);
    return Math.acos(clamp(ua[0] * fa[0] + ua[1] * fa[1] + ua[2] * fa[2], -1, 1));
  };
  return {
    bones: {
      Hips: { position: [RIG.hipsBind[0] + hip[0], RIG.hipsBind[1] + hip[1], RIG.hipsBind[2] + hip[2]] },
      // Pin the spine so the chest FK the socket was calibrated against is exact.
      Spine: { rotation: Q_ID },
      Chest: { rotation: qChest },
      RightUpperArm: { rotation: qMul(qConj(qChest), qUaR) },
      RightForearm: { rotation: qMul(qConj(qUaR), qFa) },
      LeftUpperArm: { rotation: qMul(qConj(qChest), qUaL) },
      LeftForearm: { rotation: qMul(qConj(qUaL), qFaL) }
    },
    tau,
    qFa,
    elbow: eR,
    chestActor: chest,
    shoulderActor: shRt,
    shoulderLActor: shLt,
    elbowL: eL,
    palmLActor: palmL,
    targetL,
    tauL,
    gamma,
    flexR: flex(shRt, eR, palm),
    flexL: flex(shLt, eL, palmL),
    batDir,
    palmActor: palm,
    sweetActor: [palm[0] + batDir[0] * SWEET_SPOT, palm[1] + batDir[1] * SWEET_SPOT, palm[2] + batDir[2] * SWEET_SPOT],
    tipActor: [palm[0] + batDir[0] * BAT_LEN, palm[1] + batDir[1] * BAT_LEN, palm[2] + batDir[2] * BAT_LEN]
  };
}

/** Per-swing contact configuration: sweet spot EXACTLY on the ball, on the cone. */
export interface ContactConfig {
  readonly K: Vec3;
  readonly pole: Vec3;
  readonly phi: number;
  readonly hipY: number;
  /** Sideways hip lunge toward the plate (actor -x) for pitches off the plate. */
  readonly hipX: number;
  readonly dir: Vec3;
}

/** Farthest the grip point is asked to be from the shoulder (the arm stays slightly bent). */
const MAX_GRIP_REACH = 0.58;
const FLEX_MIN = (22 * Math.PI) / 180;
const FLEX_MAX = (142 * Math.PI) / 180;
const flexViolation = (f: number): number => Math.max(0, FLEX_MIN - f) + Math.max(0, f - FLEX_MAX);

/**
 * Search the bat direction mix and chest yaw for the contact pose that puts the sweet spot on the ball with both hands on the
 * handle, both elbows bent inside a believable range, and the forearm at the grip's angle to the bat (the solver turns the
 * elbow to satisfy that). Low pitches drop the hips (knee bend). A ball outside the batter's reach gets the closest pose.
 */
export function buildContactConfig(ballActor: Vec3, hipY: number): ContactConfig {
  const toBall = unit3([ballActor[0] - RIG.chestBind[0], ballActor[1] - RIG.chestBind[1], ballActor[2] - RIG.chestBind[2]]);
  let best: { score: number; cfg: ContactConfig } | null = null;
  for (const mix of [0, 0.2, 0.4, 0.6]) {
    const dir = unit3([CONTACT_DIR[0] * (1 - mix) + toBall[0] * mix, CONTACT_DIR[1] * (1 - mix) + toBall[1] * mix, CONTACT_DIR[2] * (1 - mix) + toBall[2] * mix]);
    const Kball: Vec3 = [ballActor[0] - dir[0] * SWEET_SPOT, ballActor[1] - dir[1] * SWEET_SPOT, ballActor[2] - dir[2] * SWEET_SPOT];
    for (let pg = 0; pg <= 36 * 4 + 3; pg++) {
      const phi = -1.35 + (1.65 * (pg % 37)) / 36;
      const hipX = [0, -0.1, -0.2, -0.3][Math.floor(pg / 37)]!;
      const hip: Vec3 = [hipX, hipY, 0.1];
      // A ball past the arms' reach gets the farthest comfortable grip point on the line to it (the bat falls short of the ball).
      const sr = rotY(phi, RIG.shoulderR);
      const S: Vec3 = [RIG.chestBind[0] + hip[0] + sr[0], RIG.chestBind[1] + hip[1] + sr[1], RIG.chestBind[2] + hip[2] + sr[2]];
      const dS = Math.hypot(Kball[0] - S[0], Kball[1] - S[1], Kball[2] - S[2]);
      const k = dS > MAX_GRIP_REACH ? MAX_GRIP_REACH / dS : 1;
      const K: Vec3 = [S[0] + (Kball[0] - S[0]) * k, S[1] + (Kball[1] - S[1]) * k, S[2] + (Kball[2] - S[2]) * k];
      const pose = solveBatterPose(K, dir, phi, hip, POLE_STANCE_R, 0, 0, 0);
      const reachR = Math.hypot(pose.palmActor[0] - K[0], pose.palmActor[1] - K[1], pose.palmActor[2] - K[2]);
      const reachL = Math.hypot(pose.palmLActor[0] - pose.targetL[0], pose.palmLActor[1] - pose.targetL[1], pose.palmLActor[2] - pose.targetL[2]);
      const batErr = Math.acos(clamp(pose.batDir[0] * dir[0] + pose.batDir[1] * dir[1] + pose.batDir[2] * dir[2], -1, 1));
      const score = 20 * reachR + 20 * reachL + 2 * batErr + 3 * (flexViolation(pose.flexR) + flexViolation(pose.flexL)) + 0.05 * Math.abs(phi + 0.6) + 0.1 * mix + 0.8 * Math.abs(hipX) + 3 * Math.hypot(K[0] - Kball[0], K[1] - Kball[1], K[2] - Kball[2]);
      if (!best || score < best.score) best = { score, cfg: { K, pole: POLE_STANCE_R, phi, hipY, hipX, dir } };
    }
  }
  return best!.cfg;
}

/** Hands position in the actor frame from a chest-local offset: keeps the arms' reach valid while the chest turns. */
function handsAt(phi: number, hip: Vec3, local: Vec3): Vec3 {
  const r = rotY(phi, local);
  return [RIG.chestBind[0] + hip[0] + r[0], RIG.chestBind[1] + hip[1] + r[1], RIG.chestBind[2] + hip[2] + r[2]];
}

/** Chest-local hand offset of the stance (what the keys below move relative to). */
const STANCE_LOCAL: Vec3 = rotY(-STANCE_KEY.phi, [STANCE_KEY.K[0] - RIG.chestBind[0], STANCE_KEY.K[1] - RIG.chestBind[1], STANCE_KEY.K[2] - RIG.chestBind[2]]);
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Swing keyframes with the per-swing contact config spliced in at t=0.5. */
export function swingKeys(c: ContactConfig | null): SwingKey[] {
  const contact: SwingKey = c
    ? { t: SWING_CONTACT_T, K: c.K, D: c.dir, phi: c.phi, hip: [c.hipX, c.hipY, 0.1] }
    : { t: SWING_CONTACT_T, K: [-0.24, 0.16, 0.22], D: CONTACT_DIR, phi: -0.6, hip: [0, -0.03, 0.1] };
  const loadHip: Vec3 = [0, 0, -0.04];
  const strideHip: Vec3 = [0, -0.015, 0.1];
  const throughHip: Vec3 = [contact.hip[0] * 0.5, contact.hip[1], 0.1];
  const finishHip: Vec3 = [0, -0.02, 0.1];
  return [
    { t: 0, K: STANCE_KEY.K, D: STANCE_KEY.D, phi: STANCE_KEY.phi, hip: [0, 0, 0] },
    { t: 0.26, K: handsAt(0.62, loadHip, add3(STANCE_LOCAL, [-0.03, 0.02, -0.07])), D: unit3([0.1, 0.62, -0.78]), phi: 0.62, hip: loadHip },
    { t: 0.4, K: handsAt(0.45, strideHip, add3(STANCE_LOCAL, [-0.02, -0.08, -0.04])), D: unit3([0, 0.35, -0.94]), phi: 0.45, hip: strideHip },
    contact,
    { t: 0.62, K: handsAt(-0.95, throughHip, add3(STANCE_LOCAL, [0.08, -0.22, 0.02])), D: unit3([-0.55, 0.1, 0.83]), phi: -0.95, hip: throughHip },
    { t: 0.85, K: handsAt(-1.55, finishHip, add3(STANCE_LOCAL, [0.2, 0.0, 0.0])), D: unit3([0.55, 0.72, -0.42]), phi: -1.55, hip: finishHip },
    { t: 1, K: handsAt(-1.55, finishHip, add3(STANCE_LOCAL, [0.2, 0.0, 0.0])), D: unit3([0.55, 0.72, -0.42]), phi: -1.55, hip: finishHip }
  ];
}

export function sampleSwing(t: number, contactCfg: ContactConfig | null): { K: Vec3; D: Vec3; phi: number; hip: Vec3; pole: Vec3 } {
  const keys = swingKeys(contactCfg);
  const finish = keys[keys.length - 1]!;
  const pick = (t01: number) => {
    for (let i = 0; i < keys.length - 1; i++) {
      if (t01 >= keys[i]!.t && t01 <= keys[i + 1]!.t) {
        const a = keys[i]!;
        const b = keys[i + 1]!;
        const raw = (t01 - a.t) / (b.t - a.t || 1);
        // The bat is at full speed when it meets the ball: accelerate into the contact key and leave it decelerating (smoothstep would stop the bat dead there).
        const u = b.t === SWING_CONTACT_T ? raw * raw : a.t === SWING_CONTACT_T ? 1 - (1 - raw) * (1 - raw) : smoothstep(raw);
        return {
          K: [lerp(a.K[0], b.K[0], u), lerp(a.K[1], b.K[1], u), lerp(a.K[2], b.K[2], u)] as Vec3,
          D: unit3([lerp(a.D[0], b.D[0], u), lerp(a.D[1], b.D[1], u), lerp(a.D[2], b.D[2], u)]),
          phi: lerp(a.phi, b.phi, u),
          hip: [lerp(a.hip[0], b.hip[0], u), lerp(a.hip[1], b.hip[1], u), lerp(a.hip[2], b.hip[2], u)] as Vec3
        };
      }
    }
    return { K: finish.K, D: finish.D, phi: finish.phi, hip: finish.hip };
  };
  const s = pick(clamp(t, 0, 1));
  // Blend the elbow pole toward the calibrated contact pole around contact.
  const cp = contactCfg?.pole ?? POLE_STANCE_R;
  const w = clamp(smoothstep((t - 0.28) / 0.16) * (1 - smoothstep((t - 0.62) / 0.16)), 0, 1);
  return { ...s, pole: unit3([lerp(POLE_STANCE_R[0], cp[0], w), lerp(POLE_STANCE_R[1], cp[1], w), lerp(POLE_STANCE_R[2], cp[2], w)]) };
}

export interface PoseTarget {
  readonly K: Vec3;
  readonly D: Vec3;
  readonly phi: number;
  readonly hip: Vec3;
  readonly pole: Vec3;
}

/** The pose target for this frame: the swing sample, the recovery blend back to stance, or the idle stance sway. */
export function sampleBatterTarget(drive: { active: boolean; t: number; recover: number; contact: ContactConfig | null }, now: number): PoseTarget {
  let sampled: PoseTarget = sampleSwing(drive.active ? drive.t : 0, drive.contact);
  if (drive.active && drive.recover > 0) {
    // Blend the high finish back down into the stance.
    const stance = sampleSwing(0, drive.contact);
    const u = smoothstep(drive.recover);
    sampled = {
      K: [lerp(sampled.K[0], stance.K[0], u), lerp(sampled.K[1], stance.K[1], u), lerp(sampled.K[2], stance.K[2], u)] as Vec3,
      D: unit3([lerp(sampled.D[0], stance.D[0], u), lerp(sampled.D[1], stance.D[1], u), lerp(sampled.D[2], stance.D[2], u)]),
      phi: lerp(sampled.phi, stance.phi, u),
      hip: [lerp(sampled.hip[0], stance.hip[0], u), lerp(sampled.hip[1], stance.hip[1], u), lerp(sampled.hip[2], stance.hip[2], u)] as Vec3,
      pole: stance.pole
    };
  }
  if (!drive.active) {
    // Stance idle life: a subtle sway of the hands and chest.
    sampled = {
      ...sampled,
      K: [sampled.K[0] + 0.006 * Math.sin(now * 1.3 + 1), sampled.K[1] + 0.009 * Math.sin(now * 1.7), sampled.K[2] + 0.005 * Math.sin(now * 1.1)] as Vec3,
      phi: sampled.phi + 0.016 * Math.sin(now * 0.9)
    };
  }
  return sampled;
}
