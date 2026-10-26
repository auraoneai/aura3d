/**
 * Aura Links 3D — pure swing mathematics (no engine imports).
 *
 * Drives the rigged `linksGolferAthleteMeshy` GLB through a REAL golf swing:
 * takeaway → full backswing (club above the shoulders) → accelerating
 * downswing → clubhead striking the ball at the bottom of the arc → full
 * follow-through, with BOTH hands on the grip.
 *
 * HOW IT WORKS
 *   The swing is authored as a hand trajectory: the right palm ("grip")
 *   position and the club shaft direction `d`, per key, in the shot-local
 *   frame (origin at the ball, +Z toward the target, golfer stands at +X
 *   facing -X; the character's lead/left side faces +Z).
 *
 *   Each frame the right arm is solved so that the palm lands exactly on the
 *   grip AND the club shaft (rigidly attached to the forearm via
 *   `animation.attach`) points exactly along `d`. Because the club head is
 *   `grip + d * CLUB_REACH`, the impact key places the clubhead ON the ball
 *   exactly, and the top key places it above the shoulders exactly.
 *
 *   The elbow is solved from three constraints (|E-S| = upper-arm length,
 *   |G-E| = forearm length, shaft/palm angle = the calibrated wrist angle β).
 * The two plane constraints intersect in a line; the line ∩ unit sphere gives
 *   two elbow candidates and the pole vector picks the natural one. When the
 *   authored wrist angle is momentarily unreachable the solve degrades
 *   gracefully (the club direction stays exact; only the elbow drifts).
 *
 * Bind pose (GLB model space, identity rotations — verified against the GLB):
 *   Hips (0, .937, 0) → Spine (+.150) → Chest (+.262) → Head (+.225)
 *   Chest → L/R UpperArm (±.200, +.112, 0) → Forearm (±.050, -.250, .010)
 *   Model faces +Z (toward the ball); character left = +X (= shot +Z).
 *
 * All units metres/radians. Deterministic: no randomness, no state.
 */

export type V3 = [number, number, number];
export type Quat = { readonly x: number; readonly y: number; readonly z: number; readonly w: number };

/* ------------------------------------------------------------------ *
 *  Vector + quaternion helpers                                        *
 * ------------------------------------------------------------------ */

export const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const vLen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const vDist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** component of `a` orthogonal to unit `n` */
const ortho = (a: V3, n: V3): V3 => vSub(a, vScale(n, vDot(a, n)));

export const qIdentity: Quat = { x: 0, y: 0, z: 0, w: 1 };
export const qMul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
export const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const qX = (a: number): Quat => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
export const qY = (a: number): Quat => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
export const qZ = (a: number): Quat => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
export const qRotate = (q: Quat, v: V3): V3 => {
  // v' = v + w·t + q_vec×t with t = 2·(q_vec×v) — classic quaternion rotation
  const tx = 2 * (q.y * v[2] - q.z * v[1]);
  const ty = 2 * (q.z * v[0] - q.x * v[2]);
  const tz = 2 * (q.x * v[1] - q.y * v[0]);
  return [
    v[0] + q.w * tx + (q.y * tz - q.z * ty),
    v[1] + q.w * ty + (q.z * tx - q.x * tz),
    v[2] + q.w * tz + (q.x * ty - q.y * tx)
  ];
};
export const qFromTo = (from: V3, to: V3): Quat => {
  const f = unit(from);
  const t = unit(to);
  const d = vDot(f, t);
  if (d < -0.999999) {
    const axis: V3 = Math.abs(f[0]) < 0.9 ? [0, -f[2], f[1]] : [-f[1], f[0], 0];
    const u = unit(axis);
    return { x: u[0], y: u[1], z: u[2], w: 0 };
  }
  const c = vCross(f, t);
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w) || 1;
  return { x: c[0] / l, y: c[1] / l, z: c[2] / l, w: w / l };
};
/** quaternion whose rotation maps orthonormal frame (b1,b2) onto (t1,t2) */
export const qFromFrame = (b1: V3, b2: V3, t1: V3, t2: V3): Quat => {
  const bi = unit(b1);
  const bj = unit(ortho(b2, bi));
  const bk = vCross(bi, bj);
  const ti = unit(t1);
  const tj = unit(ortho(t2, ti));
  const tk = vCross(ti, tj);
  // R = T · Bᵀ (row-major frames), then matrix → quaternion
  const m: number[][] = [
    [ti[0] * bi[0] + tj[0] * bj[0] + tk[0] * bk[0], ti[0] * bi[1] + tj[0] * bj[1] + tk[0] * bk[1], ti[0] * bi[2] + tj[0] * bj[2] + tk[0] * bk[2]],
    [ti[1] * bi[0] + tj[1] * bj[0] + tk[1] * bk[0], ti[1] * bi[1] + tj[1] * bj[1] + tk[1] * bk[1], ti[1] * bi[2] + tj[1] * bj[2] + tk[1] * bk[2]],
    [ti[2] * bi[0] + tj[2] * bj[0] + tk[2] * bk[0], ti[2] * bi[1] + tj[2] * bj[1] + tk[2] * bk[1], ti[2] * bi[2] + tj[2] * bj[2] + tk[2] * bk[2]]
  ];
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { x: (m[2][1] - m[1][2]) * s, y: (m[0][2] - m[2][0]) * s, z: (m[1][0] - m[0][1]) * s, w: 0.25 / s };
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    return { x: 0.25 * s, y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s, w: (m[2][1] - m[1][2]) / s };
  }
  if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    return { x: (m[0][1] + m[1][0]) / s, y: 0.25 * s, z: (m[1][2] + m[2][1]) / s, w: (m[0][2] - m[2][0]) / s };
  }
  const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
  return { x: (m[0][2] + m[2][0]) / s, y: (m[1][2] + m[2][1]) / s, z: 0.25 * s, w: (m[1][0] - m[0][1]) / s };
};
/** three.js XYZ-intrinsic Euler ↔ quaternion (matches engine quatFromEulerXYZ) */
export const quatFromEulerXYZ = (x: number, y: number, z: number): Quat => {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3
  };
};
export const eulerXYZFromQuat = (q: Quat): V3 => {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const x = q.x / n, y = q.y / n, z = q.z / n, w = q.w / n;
  const m13 = 2 * (x * z + y * w);
  const pitch = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    const roll = Math.atan2(2 * (x * w - y * z), 1 - 2 * (x * x + y * y));
    const yaw = Math.atan2(2 * (z * w - x * y), 1 - 2 * (y * y + z * z));
    return [pitch, yaw, roll];
  }
  // gimbal neighbourhood — fold into x
  return [Math.atan2(2 * (x * w - y * z), 1 - 2 * (x * x + y * y)) , 0, 0];
};

/* ------------------------------------------------------------------ *
 *  Skeleton constants (GLB model space, bind)                        *
 * ------------------------------------------------------------------ */

export const RIG = {
  hipsBind: [0, 0.937, 0] as V3,
  tSpine: [0, 0.150, 0] as V3,
  tChest: [0, 0.262, 0] as V3,
  tHead: [0, 0.225, 0] as V3,
  tShoulderL: [0.199, 0.112, 0.001] as V3,
  tShoulderR: [-0.201, 0.112, 0.001] as V3,
  tForearmL: [0.050, -0.250, 0.010] as V3,
  tForearmR: [-0.050, -0.250, 0.010] as V3,
  /** calibrated palm point in each forearm's bone space (no hand bones) */
  palmR: [-0.117, -0.245, 0.137] as V3,
  palmL: [0.117, -0.245, 0.137] as V3
};
export const UPPER_ARM_LEN = vLen(RIG.tForearmR); // 0.255
export const FOREARM_PALM_LEN = vLen(RIG.palmR); // 0.304
export const BIND_UPPER_R = unit(RIG.tForearmR);
export const BIND_UPPER_L = unit(RIG.tForearmL);
export const BIND_PALM_R = unit(RIG.palmR);
export const BIND_PALM_L = unit(RIG.palmL);

/**
 * Shaft direction in RIGHT-forearm bone space — the wrist-cock calibration.
 * Makes an angle WRIST_BETA with the palm bind direction, tilted in the
 * palm/down plane so the club leaves the hand like a real grip.
 */
export const WRIST_BETA = 0.92; // rad ≈ 53° palm→shaft (rigid golf grip)
export const SHAFT_BIND_R: V3 = (() => {
  const e1 = BIND_PALM_R;
  const e2 = unit(ortho([0, -1, 0], e1));
  return unit(vAdd(vScale(e1, Math.cos(WRIST_BETA)), vScale(e2, Math.sin(WRIST_BETA))));
})();

/** club geometry, palm → head-centre (the rendered club head is exactly here) */
export const CLUB_REACH = 0.88;
/** left palm sits this far up the shaft from the right palm (stacked grip) */
export const GRIP_SPAN = 0.105;
/** pole vectors (model space) that pick the natural elbow of the two solutions */
const POLE_R: V3 = [-0.62, -0.72, 0.10];
const POLE_L: V3 = [0.55, -0.80, 0.12];

/* ------------------------------------------------------------------ *
 *  Root placement — GLB model space ↔ shot-local frame               *
 * ------------------------------------------------------------------ */

export interface RootFrame {
  /** stance centre in shot-local space (y relative to the ball ground) */
  readonly c: V3;
  /** uniform GLB→shot scale (targetHeight fit) */
  readonly s: number;
  /** rotation about +Y taking model space into shot space (-π/2) */
  readonly yaw: number;
}

/** shot-local stance of a right-handed golfer: 0.52 m behind the ball line */
export const STANCE_SHOT: V3 = [0.52, 0, -0.02];
export const HERO_FIT_SCALE = 1.84 / 1.897; // targetHeight / GLB bounds height

export const makeRoot = (stanceGroundDy: number, s: number = HERO_FIT_SCALE): RootFrame => ({
  c: [STANCE_SHOT[0], stanceGroundDy, STANCE_SHOT[2]],
  s,
  yaw: -Math.PI / 2
});

export const toShot = (r: RootFrame, p: V3): V3 => {
  const c = Math.cos(r.yaw);
  const sn = Math.sin(r.yaw);
  const x = p[0] * c + p[2] * sn;
  const z = -p[0] * sn + p[2] * c;
  return [r.c[0] + x * r.s, r.c[1] + p[1] * r.s, r.c[2] + z * r.s];
};
export const toModel = (r: RootFrame, p: V3): V3 => {
  const c = Math.cos(-r.yaw);
  const sn = Math.sin(-r.yaw);
  const dx = (p[0] - r.c[0]) / r.s;
  const dy = (p[1] - r.c[1]) / r.s;
  const dz = (p[2] - r.c[2]) / r.s;
  return [dx * c + dz * sn, dy, -dx * sn + dz * c];
};
export const dirToModel = (r: RootFrame, d: V3): V3 => {
  const c = Math.cos(-r.yaw);
  const sn = Math.sin(-r.yaw);
  return [d[0] * c + d[2] * sn, d[1], -d[0] * sn + d[2] * c];
};

/* ------------------------------------------------------------------ *
 *  Swing trajectory — keyframes in shot-local space                  *
 * ------------------------------------------------------------------ */

/** ball centre in shot-local space (it sits on the tee spot) */
export const BALL_SHOT: V3 = [0, 0.09, 0.008];

export interface SwingKey {
  /** right-palm grip point (shot-local); derived from the ball for ADDR/IMPACT */
  readonly grip: V3;
  /** unit shaft direction, grip → clubhead */
  readonly dir: V3;
  /** torso wind-up: + backswing coil / - follow-through */
  readonly coil: number;
  /** extra spine flex (rad) over the address flex */
  readonly flex: number;
  /** lateral spine side-bend (rad), + leans the lead shoulder down */
  readonly bend: number;
  /** hips height offset (model, m) — knee flex / extension */
  readonly hipY: number;
}

const keyAtBall = (dir: V3, rest: Omit<SwingKey, "grip" | "dir">): SwingKey => {
  const d = unit(dir);
  // the club is rigid in MODEL space (palm→head = CLUB_REACH); shot-local
  // distances shrink by the hero fit scale, so derive the grip accordingly
  return { ...rest, dir: d, grip: vSub(BALL_SHOT, vScale(d, CLUB_REACH * HERO_FIT_SCALE)) };
};

const K_ADDR = keyAtBall([-0.37, -0.92, -0.03], { coil: 0.05, flex: 0, bend: 0.02, hipY: -0.02 });
const K_TAKE: SwingKey = { grip: [0.37, 0.92, -0.11], dir: unit([-0.08, -0.84, -0.54]), coil: 0.18, flex: 0.0, bend: 0.03, hipY: -0.025 };
const K_TOP: SwingKey = { grip: [0.36, 1.46, -0.52], dir: unit([-0.07, 0.50, -0.86]), coil: 0.88, flex: 0.02, bend: 0.10, hipY: -0.03 };
const K_LAG: SwingKey = { grip: [0.40, 1.06, -0.20], dir: unit([-0.14, -0.60, -0.79]), coil: 0.46, flex: 0.04, bend: 0.02, hipY: -0.025 };
const K_IMPACT = keyAtBall([-0.33, -0.93, -0.08], { coil: 0.10, flex: 0.10, bend: -0.05, hipY: -0.02 });
const K_THRU: SwingKey = { grip: [0.39, 1.05, 0.28], dir: unit([-0.05, 0.26, 0.97]), coil: -0.5, flex: -0.08, bend: -0.12, hipY: -0.01 };
const K_FINISH: SwingKey = { grip: [0.44, 1.36, 0.22], dir: unit([0.10, 0.80, 0.59]), coil: -1.05, flex: -0.16, bend: -0.24, hipY: -0.005 };

/** putting pendulum — compact arc, same solve; impact at the ball exactly */
const KP_ADDR = keyAtBall([-0.33, -0.94, -0.02], { coil: 0.04, flex: 0.08, bend: 0.02, hipY: -0.08 });
const KP_BACK: SwingKey = { grip: [0.33, 0.86, -0.16], dir: unit([-0.05, -0.86, -0.51]), coil: 0.06, flex: 0.08, bend: 0.02, hipY: -0.08 };
const KP_IMPACT = keyAtBall([-0.36, -0.92, -0.1], { coil: 0.02, flex: 0.08, bend: 0.0, hipY: -0.08 });
const KP_THRU: SwingKey = { grip: [0.31, 0.86, 0.14], dir: unit([-0.3, -0.9, 0.32]), coil: 0.0, flex: 0.08, bend: 0.0, hipY: -0.08 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mixKey = (a: SwingKey, b: SwingKey, t: number): SwingKey => ({
  grip: [lerp(a.grip[0], b.grip[0], t), lerp(a.grip[1], b.grip[1], t), lerp(a.grip[2], b.grip[2], t)],
  dir: unit([lerp(a.dir[0], b.dir[0], t), lerp(a.dir[1], b.dir[1], t), lerp(a.dir[2], b.dir[2], t)]),
  coil: lerp(a.coil, b.coil, t),
  flex: lerp(a.flex, b.flex, t),
  bend: lerp(a.bend, b.bend, t),
  hipY: lerp(a.hipY, b.hipY, t)
});
/** piecewise-smooth key interpolation; `ease` warps the segment parameter */
const segKey = (keys: readonly SwingKey[], u: number, ease: (t: number) => number = smoothstep): SwingKey => {
  const f = Math.max(0, Math.min(1, u)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  return mixKey(keys[i]!, keys[i + 1]!, ease(f - i));
};

/** swing phases the route drives; t ∈ [0,1] inside the phase */
export type SwingPosePhase =
  | "address" | "idle"
  | "backswing" | "top" | "downswing" | "follow"
  | "putt-address" | "putt-back" | "putt-through";

const easeDown = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 1.7); // accelerating
const easeFollow = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 1.6); // decelerating

export function evaluateSwing(phase: SwingPosePhase, t: number): SwingKey {
  switch (phase) {
    case "backswing": return segKey([K_ADDR, K_TAKE, K_TOP], t);
    case "top": return segKey([K_TOP, K_TOP], 0);
    case "downswing": return segKey([K_TOP, K_LAG, K_IMPACT], t, easeDown);
    case "follow": return segKey([K_IMPACT, K_THRU, K_FINISH], t, easeFollow);
    case "putt-address": return segKey([KP_ADDR, KP_ADDR], 0);
    case "idle": case "address": return segKey([K_ADDR, K_ADDR], 0);
    case "putt-back": return segKey([KP_ADDR, KP_BACK], t);
    case "putt-through": return segKey([KP_BACK, KP_IMPACT, KP_THRU], t, easeDown);
  }
}

/** base address spine flex split across Hips/Spine/Chest (rad, + = forward over the ball) */
export const FLEX_SPLIT = { hips: 0.30, spine: 0.19, chest: 0.12 };

/** golfer leg bind (GLB model space): thigh/shin lengths and hip-joint offsets from Hips */
export const LEG = {
  thigh: 0.4123,
  shin: 0.3373,
  hipJointL: [0.1143, -0.0375, 0] as V3,
  hipJointR: [-0.1624, -0.0375, 0] as V3,
  /** hips sit this much lower (m) than the standing bind: the knee-flex crouch */
  crouch: 0.012,
  /** hips sit this far behind the ankle line (m): hinge at the hips, not a lean from the feet */
  hipsBack: 0.03
};
const BIND_ANKLE_Y = RIG.hipsBind[1] + LEG.hipJointL[1] - LEG.thigh - LEG.shin;
const ANKLE_L: V3 = [RIG.hipsBind[0] + LEG.hipJointL[0], BIND_ANKLE_Y, 0];
const ANKLE_R: V3 = [RIG.hipsBind[0] + LEG.hipJointR[0], BIND_ANKLE_Y, 0];
const DOWN: V3 = [0, -1, 0];
const KNEE_POLE: V3 = [0, 0, 1];

/** two-bone leg IK onto a planted ankle; knees bend toward +Z (the facing direction) */
function solveLeg(hip: V3, ankle: V3): { thighW: Quat; shinW: Quat; knee: V3; flexRad: number; miss: number } {
  const toA = vSub(ankle, hip);
  const maxD = LEG.thigh + LEG.shin - 1e-4;
  const minD = Math.abs(LEG.thigh - LEG.shin) + 1e-4;
  const d = Math.min(maxD, Math.max(minD, vLen(toA)));
  const dir = unit(toA);
  const cosA = (LEG.thigh * LEG.thigh + d * d - LEG.shin * LEG.shin) / (2 * LEG.thigh * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const perp = unit(ortho(KNEE_POLE, dir));
  const thighDir = unit(vAdd(vScale(dir, Math.cos(a)), vScale(perp, Math.sin(a))));
  const knee = vAdd(hip, vScale(thighDir, LEG.thigh));
  const reach = vAdd(hip, vScale(dir, d));
  const shinDir = unit(vSub(reach, knee));
  const cosK = (LEG.thigh * LEG.thigh + LEG.shin * LEG.shin - d * d) / (2 * LEG.thigh * LEG.shin);
  return {
    thighW: qFromTo(DOWN, thighDir),
    shinW: qFromTo(DOWN, shinDir),
    knee,
    flexRad: Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK))),
    miss: vDist(ankle, reach)
  };
}

/* ------------------------------------------------------------------ *
 *  Pose solve — keyframe → skeleton local rotations + club telemetry  *
 * ------------------------------------------------------------------ */

export interface SolvedSwing {
  /** local bone rotations for setAnimationPose (overlay mode) */
  readonly bones: Readonly<Record<string, Quat>>;
  /** Hips local position (model space) */
  readonly hipsPos: V3;
  /** world (shot-local) club telemetry */
  readonly clubHead: V3;
  readonly grip: V3;
  readonly shaftDir: V3;
  readonly leftPalm: V3;
  readonly rightElbowShot: V3;
  readonly shoulderRShot: V3;
  readonly shoulderLShot: V3;
  /** right-forearm world rotation (model space) — attach calibration input */
  readonly rightForearmWorld: Quat;
  /** right-forearm joint position (model space) — attach calibration input */
  readonly rightElbowModel: V3;
  /** diagnostics for the trace */
  readonly reachR: number;
  readonly reachL: number;
  readonly wristError: number;
  /** posture read-outs for the acceptance trace and the unit tests */
  readonly posture: GolferPosture;
}

export interface GolferPosture {
  /** angle of hips→head from vertical (deg): the spine tilt a viewer sees */
  readonly spineTiltDeg: number;
  /** lateral part of the spine tilt (deg, shot-local side bend) */
  readonly sideBendDeg: number;
  /** thigh angle from vertical (deg) */
  readonly thighTiltDeg: number;
  /** knee flexion (deg), mean of both legs */
  readonly kneeFlexDeg: number;
  /** horizontal distance head → ball (m, shot-local) */
  readonly headOverBallM: number;
  /** horizontal drift of the planted ankles from the bind stance (m, model space) */
  readonly ankleDriftM: number;
}

/**
 * Solve the full golfer pose for one trajectory key.
 * `root` places the skeleton in the shot frame; the key's grip/dir are
 * shot-local. Everything else (spine coil/flex, IK) is authored in model
 * space and reported back in shot-local for telemetry.
 */
export function solveSwing(key: SwingKey, root: RootFrame, breathe = 0): SolvedSwing {
  const flex = { ...FLEX_SPLIT };
  const flexScale = 1 + key.flex;
  const coilH = -key.coil * 0.40;
  const coilS = -key.coil * 0.30;
  const coilC = -key.coil * 0.45;
  const side = key.bend;

  const hipsLocal = qMul(qMul(qX(flex.hips * flexScale), qY(coilH)), qZ(side * 0.5));
  const spineLocal = qMul(qMul(qX(flex.spine * flexScale), qY(coilS)), qZ(side * 0.3));
  const chestLocal = qMul(qMul(qX(flex.chest * flexScale + breathe), qY(coilC)), qZ(side * 0.2));
  // head counter-rotates so the eyes stay on the ball through the coil
  const headLocal = qMul(qX(-0.62 * (flex.hips + flex.spine + flex.chest) * flexScale * 0.55), qY(-coilC * 0.8));

  // forward kinematics (model space)
  const hipsW = hipsLocal;
  const spineW = qMul(hipsW, spineLocal);
  const chestW = qMul(spineW, chestLocal);
  const headW = qMul(chestW, headLocal);
  const hipsPos = vAdd(RIG.hipsBind, [0, key.hipY - LEG.crouch, -LEG.hipsBack + 0.02 * (flexScale - 1)]);
  const spinePos = vAdd(hipsPos, qRotate(hipsW, RIG.tSpine));
  const chestPos = vAdd(spinePos, qRotate(spineW, RIG.tChest));
  const headPos = vAdd(chestPos, qRotate(chestW, RIG.tHead)); // eslint-disable-line @typescript-eslint/no-unused-vars
  const shoulderR = vAdd(chestPos, qRotate(chestW, RIG.tShoulderR));
  const shoulderL = vAdd(chestPos, qRotate(chestW, RIG.tShoulderL));

  // legs: planted ankles at the bind stance, knees bent toward the facing direction.
  // The legs are children of Hips, so the hip hinge must be cancelled in their local rotations.
  const hipJointL = vAdd(hipsPos, qRotate(hipsW, LEG.hipJointL));
  const hipJointR = vAdd(hipsPos, qRotate(hipsW, LEG.hipJointR));
  const legL = solveLeg(hipJointL, ANKLE_L);
  const legR = solveLeg(hipJointR, ANKLE_R);
  const hipsInv = qConj(hipsW);

  // targets into model space
  const gripM = toModel(root, key.grip);
  const dirM = dirToModel(root, key.dir);

  // ---- right arm: exact palm + shaft solve --------------------------------
  const { elbow, foreWorld, wristError } = solveTrailArm(shoulderR, gripM, dirM);
  const upperWorld = qFromTo(BIND_UPPER_R, unit(vSub(elbow, shoulderR)));
  const upperLocalR = qMul(qConj(chestW), upperWorld);
  const foreLocalR = qMul(qConj(upperWorld), foreWorld);

  // ---- left arm: palm IK onto the shaft, a hand-span up from the right ----
  const leftPalmM = vSub(gripM, vScale(dirM, GRIP_SPAN));
  const elbowL = solveElbowPole(shoulderL, leftPalmM, POLE_L);
  const upperWorldL = qFromTo(BIND_UPPER_L, unit(vSub(elbowL, shoulderL)));
  const foreWorldL = qFromTo(BIND_PALM_L, unit(vSub(leftPalmM, elbowL)));
  const upperLocalL = qMul(qConj(chestW), upperWorldL);
  const foreLocalL = qMul(qConj(upperWorldL), foreWorldL);

  // club head (exactly what the engine's bone attachment will render)
  const headM = vAdd(gripM, qRotate(foreWorld, vScale(SHAFT_BIND_R, CLUB_REACH)));
  const clubHead = toShot(root, headM);
  const leftPalmShot = toShot(root, vAdd(elbowL, qRotate(foreWorldL, RIG.palmL)));

  const headShot = toShot(root, headPos);
  const spineVec = vSub(headPos, hipsPos);
  const spineTiltDeg = (Math.acos(Math.max(-1, Math.min(1, spineVec[1] / vLen(spineVec)))) * 180) / Math.PI;
  const sideBendDeg = (Math.atan2(Math.abs(spineVec[0]), spineVec[1]) * 180) / Math.PI;
  const thighVec = vSub(legL.knee, hipJointL);
  const thighTiltDeg = (Math.acos(Math.max(-1, Math.min(1, -thighVec[1] / vLen(thighVec)))) * 180) / Math.PI;
  const posture: GolferPosture = {
    spineTiltDeg,
    sideBendDeg,
    thighTiltDeg,
    kneeFlexDeg: ((legL.flexRad + legR.flexRad) / 2) * (180 / Math.PI),
    headOverBallM: Math.hypot(headShot[0] - BALL_SHOT[0], headShot[2] - BALL_SHOT[2]),
    ankleDriftM: Math.max(legL.miss, legR.miss)
  };

  return {
    posture,
    bones: {
      Root: qIdentity,
      Hips: hipsLocal,
      Spine: spineLocal,
      Chest: chestLocal,
      Head: headLocal,
      LeftUpperLeg: qMul(hipsInv, legL.thighW),
      LeftLowerLeg: qMul(qConj(legL.thighW), legL.shinW),
      LeftFoot: qConj(legL.shinW),
      RightUpperLeg: qMul(hipsInv, legR.thighW),
      RightLowerLeg: qMul(qConj(legR.thighW), legR.shinW),
      RightFoot: qConj(legR.shinW),
      RightUpperArm: upperLocalR,
      RightForearm: foreLocalR,
      LeftUpperArm: upperLocalL,
      LeftForearm: foreLocalL
    },
    hipsPos,
    clubHead,
    grip: key.grip,
    shaftDir: key.dir,
    leftPalm: leftPalmShot,
    rightElbowShot: toShot(root, elbow),
    shoulderRShot: toShot(root, shoulderR),
    shoulderLShot: toShot(root, shoulderL),
    rightForearmWorld: foreWorld,
    rightElbowModel: elbow,
    reachR: vDist(gripM, shoulderR),
    reachL: vDist(leftPalmM, shoulderL),
    wristError
  };
}

/**
 * Trail-arm elbow: E with |E-S| = L1, |G-E| = |palmR| and the shaft/palm
 * angle equal to WRIST_BETA. Two plane constraints → line → sphere pick.
 * The returned forearm rotation maps (BIND_PALM_R, SHAFT_BIND_R) exactly onto
 * (unit(G-E), dir), so the attached club follows the authored shaft line.
 */
function solveTrailArm(S: V3, G: V3, d: V3): { elbow: V3; foreWorld: Quat; wristError: number } {
  const L1 = UPPER_ARM_LEN;
  const L2 = FOREARM_PALM_LEN;
  let w = vSub(S, G);
  let D = vLen(w);
  if (D < 1e-4) { w = [0, 1, 0]; D = 1; }
  w = vScale(w, 1 / D);
  // |E - S| = L1 with E = G + L2·u and w = unit(S - G):
  //   L2² - 2·L2·D·(u·w) + D² = L1²  →  u·w = (L2² + D² - L1²) / (2·L2·D)
  const c1 = Math.max(-1, Math.min(1, (L2 * L2 + D * D - L1 * L1) / (2 * L2 * D)));
  const c2 = -vDot(BIND_PALM_R, SHAFT_BIND_R); // u·d for angle(d, -u) = WRIST_BETA
  // stable orthonormal basis {w, n2, n̂}: u = c1·w + β·n2 + γ·n̂
  const m = vDot(w, d);
  const n2raw = vSub(d, vScale(w, m));
  const n2len = vLen(n2raw);
  const n2 = n2len > 1e-5 ? vScale(n2raw, 1 / n2len) : ortho([0, 1, 0], w);
  const beta = n2len > 1e-5 ? (c2 - c1 * m) / n2len : 0;
  let nHat = vCross(w, n2);
  const nl = vLen(nHat);
  nHat = nl > 1e-6 ? vScale(nHat, 1 / nl) : ortho([0, 0, 1], w);
  const gammaSq = Math.max(0, 1 - c1 * c1 - beta * beta);
  const gamma = Math.sqrt(gammaSq);
  const uA = vAdd(vAdd(vScale(w, c1), vScale(n2, beta)), vScale(nHat, gamma));
  const uB = vAdd(vAdd(vScale(w, c1), vScale(n2, beta)), vScale(nHat, -gamma));
  const shoulderToGrip = unit(vSub(G, S));
  const pick = (u: V3): number => vDot(unit(ortho(vSub(vAdd(G, vScale(u, L2)), S), shoulderToGrip)), POLE_R);
  const u = gammaSq > 0 && pick(uA) >= pick(uB) ? uA : gammaSq > 0 ? uB : unit(vAdd(vScale(w, c1), vScale(n2, beta)));
  const elbow = vAdd(G, vScale(u, L2));
  const a = unit(vSub(G, elbow));
  const foreWorld = qFromFrame(BIND_PALM_R, SHAFT_BIND_R, a, d);
  const rendered = qRotate(foreWorld, SHAFT_BIND_R);
  const wristError = Math.acos(Math.max(-1, Math.min(1, vDot(rendered, unit(d)))));
  return { elbow, foreWorld, wristError };
}

/** classic 2-bone elbow with a pole (lead arm reaching down the shaft) */
function solveElbowPole(shoulder: V3, palm: V3, pole: V3): V3 {
  const L1 = UPPER_ARM_LEN;
  const L2 = FOREARM_PALM_LEN;
  const raw = vDist(shoulder, palm) || 1;
  const D = Math.max(1e-4, Math.min(raw, L1 + L2 - 1e-4));
  const u = unit(vSub(palm, shoulder));
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = ortho(pole, u);
  const pl = vLen(p);
  const pn = pl > 1e-6 ? vScale(p, 1 / pl) : ortho([0, 1, 0], u);
  return vAdd(vAdd(shoulder, vScale(u, a)), vScale(pn, h));
}

/* ------------------------------------------------------------------ *
 *  Club parts + bone-attach offsets (calibrated once at address)      *
 * ------------------------------------------------------------------ */

export interface ClubPartSpec {
  readonly id: string;
  /** centre along the palm→butt→head axis, metres from the palm (neg = butt side) */
  readonly along: number;
  /** quaternion in club space (extra twist for the head's face aim) */
  readonly faceAim: boolean;
}

/** the three primitive club parts, laid out along the shaft axis */
export const CLUB_PARTS: readonly ClubPartSpec[] = [
  { id: "golfer-club-grip", along: -0.07, faceAim: false }, // grip spans butt(-0.22)..(+0.08)
  { id: "golfer-club-shaft", along: 0.44, faceAim: false }, // shaft spans +0.02..+0.86: it runs 6 cm up into the grip (ends +0.08) so there is never a gap, and into the head
  { id: "golfer-club-head", along: 0.88, faceAim: true }    // head centre at the sweet spot
];

export interface AttachOffset {
  readonly id: string;
  readonly position: V3;
  readonly rotation: V3; // euler XYZ (three.js convention, matches engine)
}

/**
 * Bone-space offsets for `animation.attach`, calibrated from the address
 * frame. `foreWorld0`/`elbow0` come from `solveSwing(addressKey, root)`;
 * `targetHint` is the shot-local direction the club face should aim at
 * address (down the fairway).
 */
export function clubAttachOffsets(
  foreWorld0: Quat,
  elbow0: V3,
  grip0Shot: V3,
  dir0Shot: V3,
  root: RootFrame
): readonly AttachOffset[] {
  const inv = qConj(foreWorld0);
  const gripM = toModel(root, grip0Shot);
  const dirM = dirToModel(root, dir0Shot);
  // club face aims down the fairway at address (+Z shot → +X model)
  const faceM = ortho(dirToModel(root, [0, 0, 1]), dirM);
  const faceLen = vLen(faceM);
  const face = faceLen > 1e-4 ? vScale(faceM, 1 / faceLen) : ortho([1, 0, 0], dirM);
  return CLUB_PARTS.map((part) => {
    const centre = vAdd(gripM, vScale(dirM, part.along));
    const quat = part.faceAim
      ? qFromFrame([0, 1, 0], [0, 0, 1], dirM, face)
      : qFromTo([0, 1, 0], dirM);
    const pos = qRotate(inv, vSub(centre, elbow0));
    const rot = qMul(inv, quat);
    return { id: part.id, position: pos, rotation: eulerXYZFromQuat(rot) };
  });
}
