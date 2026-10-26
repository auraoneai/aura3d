import {
  GRIP_Q_ID,
  calibrateGripSocket,
  gripQAxis,
  gripQConj,
  gripQFromTo,
  gripQMul,
  gripQNorm,
  gripQRot,
  gripQToEulerXYZ,
  gripQToEulerZYX,
  gripRotY,
  gripUnit,
  solveGripTwoBone,
  solveTwoHandGrip,
  twoHandGripBonesForEngine,
  type GripQuat,
  type GripVec3,
  type TwoHandGripBodyRig,
  type TwoHandGripRig
} from "@aura3d/engine/game";

export type Vec3 = GripVec3;
export type Quat = GripQuat;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/* ================================================================== *
 * Batter rig + swing pose system                                     *
 *                                                                    *
 * The grip itself (two-bone IK for both arms, the elbow orbit and    *
 * forearm twist that roll the bat onto the wanted direction, the     *
 * top hand on the handle) is the library's `solveTwoHandGrip`; this  *
 * file holds what is specific to this game: the diamondAthlete bind  *
 * measurements, the stance and swing keyframes and the contact       *
 * search. The bat follows the solver (`objectRot`, `palm`).          *
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

/* ---------- Tiny quat helpers (x, y, z, w tuples), shared with the library ---------- */
export const Q_ID: Quat = GRIP_Q_ID;
export const qNorm = gripQNorm;
export const qMul = gripQMul;
export const qConj = gripQConj;
export const qAxis = gripQAxis;
export const qRot = gripQRot;
export const qFromTo = gripQFromTo;
/** Quat to XYZ-intrinsic Euler radians (engine `eulerXYZFromQuat` convention). */
export const qToEulerXYZ = gripQToEulerXYZ;
/** Quat to Euler radians for the engine's default node rotation order "ZYX", which `setRotation(x, y, z)` on a route node uses. */
export const qToEulerZYX = gripQToEulerZYX;
export const unit3 = gripUnit;
export const rotY = gripRotY;


/** Batter yaw: right-handed box, chest turned toward the plate (the pitcher is on his left), rear shoulder toward the catcher. */
export const BATTER_YAW = Math.PI - 1.0;

/** One swing keyframe: knob target, bat direction, chest yaw, hips shift, elbow pole. */
export interface SwingKey {
  readonly t: number;
  readonly K: Vec3;
  readonly D: Vec3;
  readonly phi: number;
  readonly hip: Vec3;
  /** Front-foot stride 0 to 1 (0 = planted in the stance, 1 = landed forward). */
  readonly stride?: number;
}

/**
 * Ready stance (right-handed batter, chest turned toward the plate, head turned to the pitcher): hands together a fist in front of and above
 * the rear shoulder, rear elbow out at shoulder height, bat upright and tilted back over the rear shoulder. Hands are placed in CHEST-local
 * coordinates (see `handsAt`) so the arms keep their reach while the hips crouch and the chest turns.
 */
export const STANCE_HANDS_LOCAL: Vec3 = [-0.17, 0.22, 0.23];
/** A direction given in WORLD terms (+x toward the plate, -z toward the pitcher) as the actor-frame direction the solver wants. */
export const dirW = (x: number, y: number, z: number): Vec3 => unit3(rotY(-BATTER_YAW, [x, y, z]));
export const STANCE_KEY: SwingKey = {
  t: 0,
  K: [RIG.chestBind[0] + STANCE_HANDS_LOCAL[0], RIG.chestBind[1] + STANCE_HANDS_LOCAL[1], RIG.chestBind[2] + STANCE_HANDS_LOCAL[2]],
  D: dirW(-0.1, 0.92, 0.38),
  phi: 0,
  hip: [-0.05, -0.07, -0.03],
  stride: 0
};
/** Contact bat direction (toward the plate, level, slightly pitcher-side). */
export const CONTACT_DIR: Vec3 = dirW(0.97, -0.06, -0.18);
/** Elbow poles: arms hang naturally; the contact pole comes from the per-swing solve. */
export const POLE_STANCE_R: Vec3 = unit3([-1, 0.1, -0.15]);
export const POLE_STANCE_L: Vec3 = unit3([0.2, -1, 0.35]);
/** Left hand stacks just above the right on the knob. */
export const GRIP_SPREAD = 0.09;

/** The engine's AnimationPose reads `{x,y,z}` / `{x,y,z,w}` objects: arrays would leave every bone untouched. */
export const poseBonesForEngine = twoHandGripBonesForEngine;

/** Two-bone IK: elbow position for shoulder to target with an elbow-hint pole. */
export const solveTwoBone = solveGripTwoBone;

/** The bat's grip rig for the library solver: this game's bind skeleton plus the socket calibrated from the stance. */
const BODY_RIG: TwoHandGripBodyRig = { ...RIG, poleL: POLE_STANCE_L };
const SOCKET = calibrateGripSocket(BODY_RIG, { K: STANCE_KEY.K, D: STANCE_KEY.D, phi: STANCE_KEY.phi, pole: POLE_STANCE_R });

/** Socket rotation (bone space) calibrated so the stance reads bat-up-over-the-shoulder. */
export function stanceAttachQuat(): Quat {
  return calibrateGripSocket(BODY_RIG, { K: STANCE_KEY.K, D: STANCE_KEY.D, phi: STANCE_KEY.phi, pole: POLE_STANCE_R }).socketRot;
}

/** Fixed socket constants: bone-space offset TRS placing the KNOB at the right palm. */
export const BAT_ATTACH_ROT: Quat = SOCKET.socketRot;
BAT_CONE_COS = SOCKET.coneCos;
export const BAT_ATTACH_EULER: Vec3 = qToEulerXYZ(BAT_ATTACH_ROT);
export const BAT_ATTACH_POS: Vec3 = [
  RIG.palmR[0] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[0],
  RIG.palmR[1] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[1],
  RIG.palmR[2] + qRot(BAT_ATTACH_ROT, [KNOB_HALF, 0, 0])[2]
];

const GRIP_RIG: TwoHandGripRig = {
  ...BODY_RIG,
  socketRot: BAT_ATTACH_ROT,
  coneCos: BAT_CONE_COS,
  gripSpread: GRIP_SPREAD,
  objectLength: BAT_LEN,
  sweetSpot: SWEET_SPOT
};

export interface PoseSolve {
  readonly bones: {
    Hips: { position: Vec3; rotation: Quat };
    Spine: { rotation: Quat };
    Head: { rotation: Quat };
    LeftUpperLeg: { rotation: Quat };
    LeftLowerLeg: { rotation: Quat };
    LeftFoot: { rotation: Quat };
    RightUpperLeg: { rotation: Quat };
    RightLowerLeg: { rotation: Quat };
    RightFoot: { rotation: Quat };
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
 * Solve the batter pose for (knob target K, bat direction D, chest yaw phi, hips shift) with the library's two-handed grip: both arms IK
 * onto the knob (right hand at the knob, left hand GRIP_SPREAD up the bat); a forearm twist rotates the socketed bat onto D.
 */
export function solveBatterPose(K: Vec3, D: Vec3, phi: number, hip: Vec3, poleR: Vec3, prevTau: number, prevTauL = 0, prevGamma = 0, stride = 0, lowerBody = true): PoseSolve {
  const p = solveTwoHandGrip(GRIP_RIG, { K, D, phi, hip, pole: poleR }, { tau: prevTau, tauL: prevTauL, gamma: prevGamma });
  // While the batter walks (the clip drives the legs) only the kit's own arms, chest and hips position apply.
  const lower = lowerBody ? lowerBodyBones(phi, hip, stride) : null;
  const bones = (lower ? { ...p.bones, ...lower, Hips: { position: p.bones.Hips!.position, rotation: lower.Hips!.rotation } } : p.bones) as unknown as PoseSolve["bones"];
  return {
    bones,
    tau: p.tau,
    qFa: p.qFa,
    elbow: p.elbow,
    chestActor: p.chest,
    shoulderActor: p.shoulder,
    shoulderLActor: p.shoulderL,
    elbowL: p.elbowL,
    palmLActor: p.palmL,
    targetL: p.targetL,
    tauL: p.tauL,
    gamma: p.gamma,
    flexR: p.flexR,
    flexL: p.flexL,
    batDir: p.objectDir,
    palmActor: p.palm,
    sweetActor: p.sweetPoint,
    tipActor: p.tipPoint
  };
}

/* ---------- Lower body: planted feet, knee bend, hip turn, head on the pitcher ---------- */
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const THIGH = 0.4123083794;
const SHIN = 0.3373432195;
const HIP_JOINT_L: Vec3 = [0.1143178073, -0.0374825799, 0];
const HIP_JOINT_R: Vec3 = [-0.1624494370, -0.0374825799, 0];
/** Hips bone position in the actor frame at bind (the actor frame has the Chest at RIG.chestBind). */
const HIPS_ACTOR_Y = RIG.chestBind[1] - 0.2623780598 - 0.1499303198;
/** Ankle height with the leg straight under the hips. */
const ANKLE_Y = HIPS_ACTOR_Y + HIP_JOINT_L[1] - THIGH - SHIN;
/** Direction to the pitcher in the actor frame (the front foot strides along it). */
export const PITCHER_DIR: Vec3 = dirW(0, 0, -1);
/** Feet point at the plate (perpendicular to the pitch line). */
export const FOOT_YAW = Math.PI / 2 - BATTER_YAW;
/** Head turn that faces the pitcher, relative to the body. */
export const HEAD_FACE = Math.PI - BATTER_YAW;
export const STANCE_FOOT_HALF = 0.21;
export const STRIDE_LEN = 0.3;
const STRIDE_LIFT = 0.1;
const FOOT_CENTRE: Vec3 = [-0.02, 0, 0];
export const FRONT_FOOT_STANCE: Vec3 = [FOOT_CENTRE[0] + PITCHER_DIR[0] * STANCE_FOOT_HALF, ANKLE_Y, FOOT_CENTRE[2] + PITCHER_DIR[2] * STANCE_FOOT_HALF];
export const BACK_FOOT_STANCE: Vec3 = [FOOT_CENTRE[0] - PITCHER_DIR[0] * STANCE_FOOT_HALF, ANKLE_Y, FOOT_CENTRE[2] - PITCHER_DIR[2] * STANCE_FOOT_HALF];

/** Ankle planted at `foot`, pulled in horizontally if the leg cannot reach it. Returns the leg's local bone rotations (hips-relative). */
function legBones(hipsPos: Vec3, qHips: Quat, off: Vec3, foot: Vec3): { qU: Quat; qL: Quat; qF: Quat } {
  const ho = qRot(qHips, off);
  const hj: Vec3 = [hipsPos[0] + ho[0], hipsPos[1] + ho[1], hipsPos[2] + ho[2]];
  const reachMax = 0.985 * (THIGH + SHIN);
  const dv = hj[1] - foot[1];
  const hx = foot[0] - hj[0];
  const hz = foot[2] - hj[2];
  const hMax = Math.sqrt(Math.max(1e-6, reachMax * reachMax - dv * dv));
  const hLen = Math.hypot(hx, hz);
  const k = hLen > hMax ? hMax / hLen : 1;
  const target: Vec3 = [hj[0] + hx * k, foot[1], hj[2] + hz * k];
  const toeDir: Vec3 = [Math.sin(FOOT_YAW), 0, Math.cos(FOOT_YAW)];
  const knee = solveTwoBone(hj, target, toeDir, THIGH, SHIN);
  const down: Vec3 = [0, -1, 0];
  const qUw = qFromTo(down, unit3(sub3(knee, hj)));
  const qLw = qFromTo(down, unit3(sub3(target, knee)));
  return {
    qU: qMul(qConj(qHips), qUw),
    qL: qMul(qConj(qUw), qLw),
    qF: qMul(qConj(qLw), qAxis([0, 1, 0], FOOT_YAW))
  };
}

/** Hips turn, crouch, legs and head for the pose's chest yaw, hip shift and stride. Hips lead the chest turn. */
function lowerBodyBones(phi: number, hip: Vec3, stride: number): Record<string, { position?: Vec3; rotation: Quat }> {
  const hy = 0.65 * phi;
  const qHips = qAxis([0, 1, 0], hy);
  const hipsPos: Vec3 = [hip[0], HIPS_ACTOR_Y + hip[1], hip[2]];
  const s = clamp(stride, 0, 1);
  const lift = STRIDE_LIFT * Math.sin(Math.PI * s);
  const front: Vec3 = [FRONT_FOOT_STANCE[0] + PITCHER_DIR[0] * STRIDE_LEN * s, ANKLE_Y + lift, FRONT_FOOT_STANCE[2] + PITCHER_DIR[2] * STRIDE_LEN * s];
  const L = legBones(hipsPos, qHips, HIP_JOINT_L, front);
  const R = legBones(hipsPos, qHips, HIP_JOINT_R, BACK_FOOT_STANCE);
  const headYaw = clamp(0.88 * HEAD_FACE - phi, -1.15, 1.15);
  return {
    Hips: { rotation: qHips },
    Chest: { rotation: qAxis([0, 1, 0], phi - hy) },
    Head: { rotation: qAxis([0, 1, 0], headYaw) },
    LeftUpperLeg: { rotation: L.qU },
    LeftLowerLeg: { rotation: L.qL },
    LeftFoot: { rotation: L.qF },
    RightUpperLeg: { rotation: R.qU },
    RightLowerLeg: { rotation: R.qL },
    RightFoot: { rotation: R.qF }
  };
}

/** Per-swing contact configuration: sweet spot EXACTLY on the ball, on the cone. */
export interface ContactConfig {
  readonly K: Vec3;
  readonly pole: Vec3;
  readonly phi: number;
  readonly hipY: number;
  /** Hip lunge toward the plate (actor -x) for pitches off the plate. */
  readonly hipX: number;
  /** Forward part of the same lunge (actor +z). */
  readonly hipZ: number;
  readonly dir: Vec3;
}

/** Unit actor-frame direction to the plate (hip lunges follow it). */
const LUNGE_DIR: Vec3 = dirW(1, 0, 0);

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
      const phi = -0.5 + (1.6 * (pg % 37)) / 36;
      const lunge = [0, 0.1, 0.2, 0.3][Math.floor(pg / 37)]!;
      const hipX = LUNGE_DIR[0] * lunge;
      const hipZ = 0.1 + LUNGE_DIR[2] * lunge;
      const hip: Vec3 = [hipX, hipY, hipZ];
      // A ball past the arms' reach gets the farthest comfortable grip point on the line to it (the bat falls short of the ball).
      const sr = rotY(phi, RIG.shoulderR);
      const S: Vec3 = [RIG.chestBind[0] + hip[0] + sr[0], RIG.chestBind[1] + hip[1] + sr[1], RIG.chestBind[2] + hip[2] + sr[2]];
      const dS = Math.hypot(Kball[0] - S[0], Kball[1] - S[1], Kball[2] - S[2]);
      const k = dS > MAX_GRIP_REACH ? MAX_GRIP_REACH / dS : 1;
      const K: Vec3 = [S[0] + (Kball[0] - S[0]) * k, S[1] + (Kball[1] - S[1]) * k, S[2] + (Kball[2] - S[2]) * k];
      const pose = solveBatterPose(K, dir, phi, hip, POLE_STANCE_R, 0, 0, 0, 1);
      const reachR = Math.hypot(pose.palmActor[0] - K[0], pose.palmActor[1] - K[1], pose.palmActor[2] - K[2]);
      const reachL = Math.hypot(pose.palmLActor[0] - pose.targetL[0], pose.palmLActor[1] - pose.targetL[1], pose.palmLActor[2] - pose.targetL[2]);
      const batErr = Math.acos(clamp(pose.batDir[0] * dir[0] + pose.batDir[1] * dir[1] + pose.batDir[2] * dir[2], -1, 1));
      const score = 20 * reachR + 20 * reachL + 2 * batErr + 3 * (flexViolation(pose.flexR) + flexViolation(pose.flexL)) + 0.05 * Math.abs(phi - 0.4) + 0.1 * mix + 0.8 * lunge + 3 * Math.hypot(K[0] - Kball[0], K[1] - Kball[1], K[2] - Kball[2]);
      if (!best || score < best.score) best = { score, cfg: { K, pole: POLE_STANCE_R, phi, hipY, hipX, hipZ, dir } };
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
const STANCE_LOCAL: Vec3 = STANCE_HANDS_LOCAL;
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Swing keyframes with the per-swing contact config spliced in at t=0.5. World terms: the plate is +x, the pitcher -z, the catcher +z.
 * load: coil back, hands back a few cm, front foot lifts, bat 45 to 60 degrees up and back; stride: foot lands, hands still back;
 * slot: hips and shoulders open, hands lead down and forward while the barrel lags behind; contact: bat level in front of the front hip;
 * through: bat whips on round; finish: bat wraps over the front shoulder, hands high beside it.
 */
export function swingKeys(c: ContactConfig | null): SwingKey[] {
  const contact: SwingKey = c
    ? { t: SWING_CONTACT_T, K: c.K, D: c.dir, phi: c.phi, hip: [c.hipX, c.hipY, c.hipZ], stride: 1 }
    : { t: SWING_CONTACT_T, K: handsAt(0.4, [0, -0.1, 0.1], [-0.12, 0.0, 0.5]), D: CONTACT_DIR, phi: 0.4, hip: [0, -0.1, 0.1], stride: 1 };
  const loadHip: Vec3 = [-0.09, -0.08, -0.07];
  const strideHip: Vec3 = [-0.04, -0.09, -0.01];
  const slotHip: Vec3 = [-0.03, -0.1, 0.06];
  const throughHip: Vec3 = [contact.hip[0] * 0.5, contact.hip[1], 0.1 + (contact.hip[2] - 0.1) * 0.5];
  const finishHip: Vec3 = [0.02, -0.07, 0.1];
  const finishLocal: Vec3 = [0.22, 0.26, 0.3];
  return [
    { t: 0, K: handsAt(0, STANCE_KEY.hip, STANCE_LOCAL), D: STANCE_KEY.D, phi: 0, hip: STANCE_KEY.hip, stride: 0 },
    { t: 0.22, K: handsAt(-0.2, loadHip, add3(STANCE_LOCAL, [-0.04, 0.02, -0.07])), D: dirW(-0.25, 0.77, 0.58), phi: -0.2, hip: loadHip, stride: 0.45 },
    { t: 0.34, K: handsAt(-0.1, strideHip, add3(STANCE_LOCAL, [-0.05, 0.0, -0.08])), D: dirW(-0.25, 0.7, 0.66), phi: -0.1, hip: strideHip, stride: 1 },
    { t: 0.43, K: handsAt(0.2, slotHip, add3(STANCE_LOCAL, [-0.02, -0.09, 0.05])), D: dirW(0.1, 0.4, 0.9), phi: 0.2, hip: slotHip, stride: 1 },
    contact,
    { t: 0.62, K: handsAt(1.0, throughHip, add3(STANCE_LOCAL, [0.0, -0.1, 0.1])), D: dirW(-0.6, 0.1, -0.8), phi: 1.0, hip: throughHip, stride: 1 },
    { t: 0.85, K: handsAt(1.5, finishHip, finishLocal), D: dirW(-0.6, 0.0, 0.8), phi: 1.5, hip: finishHip, stride: 1 },
    { t: 1, K: handsAt(1.5, finishHip, finishLocal), D: dirW(-0.6, 0.0, 0.8), phi: 1.5, hip: finishHip, stride: 1 }
  ];
}

/** Chest-local hand offset of a key: interpolated in the turning chest's frame so the hands never cut through the shoulder when the chest rotates fast. */
function localOf(k: SwingKey): Vec3 {
  return rotY(-k.phi, [k.K[0] - RIG.chestBind[0] - k.hip[0], k.K[1] - RIG.chestBind[1] - k.hip[1], k.K[2] - RIG.chestBind[2] - k.hip[2]]);
}

export function sampleSwing(t: number, contactCfg: ContactConfig | null): { K: Vec3; D: Vec3; phi: number; hip: Vec3; pole: Vec3; stride: number; local: Vec3 } {
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
        const la = localOf(a);
        const lb = localOf(b);
        const phi = lerp(a.phi, b.phi, u);
        const hip: Vec3 = [lerp(a.hip[0], b.hip[0], u), lerp(a.hip[1], b.hip[1], u), lerp(a.hip[2], b.hip[2], u)];
        const local: Vec3 = [lerp(la[0], lb[0], u), lerp(la[1], lb[1], u), lerp(la[2], lb[2], u)];
        return {
          K: handsAt(phi, hip, local),
          local,
          D: unit3([lerp(a.D[0], b.D[0], u), lerp(a.D[1], b.D[1], u), lerp(a.D[2], b.D[2], u)]),
          phi,
          hip,
          stride: lerp(a.stride ?? 0, b.stride ?? 0, u)
        };
      }
    }
    return { K: finish.K, local: localOf(finish), D: finish.D, phi: finish.phi, hip: finish.hip, stride: finish.stride ?? 0 };
  };
  const s = pick(clamp(t, 0, 1));
  // Blend the elbow pole toward the calibrated contact pole around contact.
  const cp = contactCfg?.pole ?? POLE_STANCE_R;
  const w = clamp(smoothstep((t - 0.28) / 0.16) * (1 - smoothstep((t - 0.62) / 0.16)), 0, 1);
  return { ...s, pole: unit3([lerp(POLE_STANCE_R[0], cp[0], w), lerp(POLE_STANCE_R[1], cp[1], w), lerp(POLE_STANCE_R[2], cp[2], w)]) };
}

/**
 * The bat direction the arms can actually hold from `K`: the forearm sits at the grip's fixed angle to the bat, so the bat's angle to the
 * shoulder-to-hand line must lie inside the elbow's reachable cone. Targets outside it are rotated to its nearest edge (the swing keys stay
 * readable as bat poses, the solver never folds an arm to chase an impossible direction).
 */
export function feasibleBatDir(K: Vec3, D: Vec3, phi: number, hip: Vec3): Vec3 {
  const sr = rotY(phi, RIG.shoulderR);
  const v: Vec3 = [K[0] - (RIG.chestBind[0] + hip[0] + sr[0]), K[1] - (RIG.chestBind[1] + hip[1] + sr[1]), K[2] - (RIG.chestBind[2] + hip[2] + sr[2])];
  const d = Math.hypot(v[0], v[1], v[2]);
  if (d < 1e-4) return D;
  const u: Vec3 = [v[0] / d, v[1] / d, v[2] / d];
  const alpha = Math.acos(clamp((RIG.foreHand * RIG.foreHand + d * d - RIG.upperArm * RIG.upperArm) / (2 * RIG.foreHand * d), -1, 1));
  const theta = Math.acos(BAT_CONE_COS);
  const margin = 0.06;
  const lo = Math.abs(theta - alpha) + margin;
  const hi = theta + alpha - margin;
  if (hi <= lo) return D;
  const ang = Math.acos(clamp(D[0] * u[0] + D[1] * u[1] + D[2] * u[2], -1, 1));
  if (ang >= lo && ang <= hi) return D;
  const want = clamp(ang, lo, hi);
  const along = D[0] * u[0] + D[1] * u[1] + D[2] * u[2];
  let perp: Vec3 = [D[0] - u[0] * along, D[1] - u[1] * along, D[2] - u[2] * along];
  if (Math.hypot(perp[0], perp[1], perp[2]) < 1e-4) perp = Math.abs(u[1]) < 0.9 ? [-u[2], 0, u[0]] : [1, 0, 0];
  perp = unit3(perp);
  return unit3([u[0] * Math.cos(want) + perp[0] * Math.sin(want), u[1] * Math.cos(want) + perp[1] * Math.sin(want), u[2] * Math.cos(want) + perp[2] * Math.sin(want)]);
}

/** Keep the grip point off the rear shoulder: closer than this folds the elbow flat against the arm. */
const MIN_GRIP_REACH = 0.2;
function keepArmReach(K: Vec3, phi: number, hip: Vec3): Vec3 {
  const sr = rotY(phi, RIG.shoulderR);
  const S: Vec3 = [RIG.chestBind[0] + hip[0] + sr[0], RIG.chestBind[1] + hip[1] + sr[1], RIG.chestBind[2] + hip[2] + sr[2]];
  const v: Vec3 = [K[0] - S[0], K[1] - S[1], K[2] - S[2]];
  const d = Math.hypot(v[0], v[1], v[2]);
  if (d >= MIN_GRIP_REACH) return K;
  const u: Vec3 = d < 1e-4 ? rotY(phi, [0, 0, 1]) : [v[0] / d, v[1] / d, v[2] / d];
  return [S[0] + u[0] * MIN_GRIP_REACH, S[1] + u[1] * MIN_GRIP_REACH, S[2] + u[2] * MIN_GRIP_REACH];
}

export interface PoseTarget {
  readonly K: Vec3;
  readonly D: Vec3;
  readonly phi: number;
  readonly hip: Vec3;
  readonly pole: Vec3;
  readonly stride: number;
}

/** The pose target for this frame: the swing sample, the recovery blend back to stance, or the idle stance sway. */
export function sampleBatterTarget(drive: { active: boolean; t: number; recover: number; contact: ContactConfig | null }, now: number): PoseTarget {
  const drive0 = sampleSwing(drive.active ? drive.t : 0, drive.contact);
  let sampled: PoseTarget = drive0;
  if (drive.active && drive.recover > 0) {
    // Blend the high finish back down into the stance.
    const stance = sampleSwing(0, drive.contact);
    const u = smoothstep(drive.recover);
    const phiB = lerp(sampled.phi, stance.phi, u);
    const hipB: Vec3 = [lerp(sampled.hip[0], stance.hip[0], u), lerp(sampled.hip[1], stance.hip[1], u), lerp(sampled.hip[2], stance.hip[2], u)];
    const localB = [lerp(drive0.local[0], stance.local[0], u), lerp(drive0.local[1], stance.local[1], u), lerp(drive0.local[2], stance.local[2], u)] as Vec3;
    sampled = {
      K: handsAt(phiB, hipB, localB),
      D: unit3([lerp(sampled.D[0], stance.D[0], u), lerp(sampled.D[1], stance.D[1], u), lerp(sampled.D[2], stance.D[2], u)]),
      phi: phiB,
      hip: hipB,
      pole: stance.pole,
      stride: lerp(sampled.stride, stance.stride, u)
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
  const K = keepArmReach(sampled.K, sampled.phi, sampled.hip);
  return { ...sampled, K, D: feasibleBatDir(K, sampled.D, sampled.phi, sampled.hip) };
}
