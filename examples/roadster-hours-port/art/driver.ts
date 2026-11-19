/**
 * Saltwind Highway driver (GPU QA F2, Nov 2026): under the Idol roadster body the procedural driver parts were skipped, so the
 * car drove itself. The driver is now a rigged Idol racer (`IDOL_DRIVER`, rig: true, T-pose, tools/idol/specs/
 * saltwind-highway.json) seated in the left seat of the Idol cockpit, its bones driven every frame through the shared
 * humanoid driver (apps/showcase-port-shared/idol/humanoid.ts) from this procedural seated-driving pose:
 * - seated (thighs forward along the footwell, shins down to the pedals, back against the seat);
 * - both hands on the steering wheel rim (the driver's two-bone IK lands each palm on its grip), the grips turning with
 *   the wheel, which turns with the steering input (STEER_RATIO x the front-wheel angle);
 * - head turns into the turn, the torso sways against the cornering load, chassis buzz with speed, breathing on a clock.
 * Pure (no engine imports): tests/unit/roadster-hours-port/driver.test.ts drives it with the real Idol skeleton.
 *
 * Frames: "chassis" is the car-body group's frame (origin ROADSTER_HALF_H above the road, front -Z, right +X). The Idol body
 * sits in it at IDOL_HERO_BODY_* (GLB +Z front, turned by pi). The driver model faces +Z (canonical humanoid frame, the
 * character's left = +X) and its node turns by pi too, so model +X (left) lands on chassis -X (the car's left).
 */
import { eulerZYX, quatAxisAngle, quatMul, type HumanoidPoseInput, type Quat, type Vec3 } from "@aura3d/engine/animation";
import { IDOL_HERO_BODY_SCALE, IDOL_HERO_BODY_Y, IDOL_HERO_BODY_Z } from "./idol";

/** Admitted key of the rigged driver. */
export const IDOL_DRIVER = "swDriver";
/** Driver standing height (m). */
export const DRIVER_HEIGHT = 1.75;

/** GLB point of the Idol roadster body -> chassis frame (car-body group: model at IDOL_HERO_BODY_*, turned by pi). */
export function bodyGlbToChassis(p: Vec3): Vec3 {
  return [-p[0] * IDOL_HERO_BODY_SCALE[0], p[1] * IDOL_HERO_BODY_SCALE[1] + IDOL_HERO_BODY_Y, -p[2] * IDOL_HERO_BODY_SCALE[2] + IDOL_HERO_BODY_Z];
}

/**
 * Cockpit landmarks measured on swRoadsterBodyB (GLB frame, +Z front, y = 0 road; top/side views + vertex columns):
 * left seat centre x +0.39, cushion top y 0.44 at z -0.6, seat back at z -1.0; dash top y ~0.9 at z -0.05.
 */
export const COCKPIT_GLB = {
  hip: [0.39, 0.53, -0.72] as Vec3,
  wheelCentre: [0.39, 0.83, -0.24] as Vec3
};
/** Steering wheel radius (m) and its tilt (rad): the rim face points back at the driver and up by this much. */
export const STEERING_WHEEL_RADIUS = 0.19;
export const STEERING_WHEEL_TILT = 0.5;
/** Steering wheel turn per radian of front-wheel steer (a quick racing rack: full lock 0.42 rad -> 1.47 rad of wheel). */
export const STEER_RATIO = 3.5;
/** Grip angles on the rim (rad from 12 o'clock toward the right): left hand at ten to two, right at two. */
export const GRIP_ANGLE = 1.05;

export interface DriverSeatFrame {
  /** Seated hip joint (chassis frame). */
  readonly hip: Vec3;
  /** Steering wheel centre (chassis frame). */
  readonly wheelCentre: Vec3;
}

export function driverSeatFrame(): DriverSeatFrame {
  return { hip: bodyGlbToChassis(COCKPIT_GLB.hip), wheelCentre: bodyGlbToChassis(COCKPIT_GLB.wheelCentre) };
}

/** Steering wheel turn (rad, + = turned left, counter-clockwise as the driver sees it) for a front-wheel steer yaw. */
export function steeringWheelAngle(steerYaw: number): number {
  return steerYaw * STEER_RATIO;
}

/**
 * Point on the steering wheel rim (chassis frame) at angle `a` from 12 o'clock toward the driver's right, with the wheel
 * turned by `turn`. The rim plane is spanned by the car's right (+X) and the wheel's tilted up (0, cos t, -sin t).
 */
export function rimPoint(frame: DriverSeatFrame, a: number, turn: number): Vec3 {
  const ang = a - turn;
  const t = STEERING_WHEEL_TILT;
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, Math.cos(t), -Math.sin(t)];
  const s = Math.sin(ang) * STEERING_WHEEL_RADIUS, c = Math.cos(ang) * STEERING_WHEEL_RADIUS;
  return [frame.wheelCentre[0] + s * u[0] + c * v[0], frame.wheelCentre[1] + s * u[1] + c * v[1], frame.wheelCentre[2] + s * u[2] + c * v[2]];
}

/** Chassis grips for both hands: left hand (car's left, -X) at -GRIP_ANGLE, right at +GRIP_ANGLE. */
export function gripPoints(frame: DriverSeatFrame, turn: number): { readonly left: Vec3; readonly right: Vec3 } {
  return { left: rimPoint(frame, -GRIP_ANGLE, turn), right: rimPoint(frame, GRIP_ANGLE, turn) };
}

/** Chassis position of the driver node so its rest hip joint lands on the seated hip. */
export function driverNodePosition(hipHeight: number, scale: number, frame: DriverSeatFrame): Vec3 {
  return [frame.hip[0], frame.hip[1] - hipHeight * scale, frame.hip[2]];
}

/** Chassis point -> driver model space (node at `node`, turned by pi about Y, uniform `scale`). */
export function chassisToDriverModel(p: Vec3, node: Vec3, scale: number): Vec3 {
  return [-(p[0] - node[0]) / scale, (p[1] - node[1]) / scale, -(p[2] - node[2]) / scale];
}

export interface DriverState {
  /** Front-wheel steer yaw (rad, + = left), as drawn on the wheels. */
  readonly steerYaw: number;
  /** Forward speed (m/s). */
  readonly speed: number;
  /** Lateral acceleration proxy (-1..1, + = pushed toward the car's right), e.g. the steer input times speed. */
  readonly load?: number;
  readonly boosting?: boolean;
  /** Running clock (s). */
  readonly time: number;
  /** Not racing (menu, countdown, finished): relaxed, looking ahead. */
  readonly idle?: boolean;
}

const rx = (a: number): Quat => quatAxisAngle([1, 0, 0], a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Head turn (rad) per radian of front-wheel steer, and its cap. */
export const HEAD_TURN_GAIN = 1.6;
/** Torso sway (rad) at full cornering load. */
export const TORSO_SWAY = 0.16;

/**
 * Seated legs (world pitch of thigh and shin; foot pitch relative to the shin). A classic roadster's driver sits nearly on
 * the floor with the legs stretched forward: GPU QA (Nov 18) caught the old shins-down pose (shin -0.45) pushing the feet
 * 0.2 m through the floor pan, visible under the car on every jump. driver.test.ts keeps every leg joint above the floor.
 */
export const DRIVER_LEGS = { thighWorld: -1.48, shinWorld: -1.35, foot: 0.35 };

/** The driver's canonical joint pose for one frame (`hipHeight` model units, `scale` chassis metres per model unit). */
export function driverPose(s: DriverState, hipHeight: number, scale: number, frame: DriverSeatFrame): HumanoidPoseInput {
  const idle = Boolean(s.idle);
  const t = s.time;
  const speed01 = clamp(s.speed / 60, 0, 1);
  const buzz = idle ? 0 : 0.012 * speed01 * Math.sin(t * 29);
  const breath = 0.04 * Math.sin(t * 1.9);
  const boost = s.boosting && !idle ? 1 : 0;
  // seat recline (negative pitch leans back), chest comes forward a touch on boost
  const hipsPitch = -0.12;
  const spinePitch = 0.08 + breath * 0.4 + 0.06 * boost;
  const chestPitch = 0.1 + breath + buzz + 0.04 * boost;
  // cornering load sways the torso to the outside; the head turns into the turn and stays level
  const load = clamp(s.load ?? 0, -1, 1);
  const sway = load * TORSO_SWAY;
  const headYaw = clamp(s.steerYaw * HEAD_TURN_GAIN, -0.7, 0.7) + 0.05 * Math.sin(t * 0.7);
  const headPitch = -(hipsPitch + spinePitch + chestPitch) * 0.9 + 0.05 + buzz;
  // legs: thighs and shins stretched forward along the low footwell to the pedals (DRIVER_LEGS)
  const { thighWorld, shinWorld, foot } = DRIVER_LEGS;
  const thigh = thighWorld - hipsPitch, shin = shinWorld - thighWorld;
  const rotations: HumanoidPoseInput["rotations"] = {
    hips: rx(hipsPitch),
    spine: quatMul(rx(spinePitch), quatAxisAngle([0, 0, 1], sway * 0.5)),
    chest: quatMul(rx(chestPitch), quatAxisAngle([0, 0, 1], sway * 0.5)),
    neck: eulerZYX(headPitch * 0.4, headYaw * 0.4, -sway * 0.4),
    head: eulerZYX(headPitch * 0.6, headYaw * 0.6, -sway * 0.6),
    leftUpperLeg: eulerZYX(thigh, 0, -0.1),
    rightUpperLeg: eulerZYX(thigh, 0, 0.1),
    leftLowerLeg: rx(shin),
    rightLowerLeg: rx(shin),
    leftFoot: rx(foot),
    rightFoot: rx(foot),
    // arms reach forward to the wheel; the IK below bends them so the palms land on the grips
    leftUpperArm: eulerZYX(-0.95, 0, 0.22),
    rightUpperArm: eulerZYX(-0.95, 0, -0.22),
    leftLowerArm: rx(-0.7),
    rightLowerArm: rx(-0.7)
  };
  const node = driverNodePosition(hipHeight, scale, frame);
  const grips = gripPoints(frame, steeringWheelAngle(s.steerYaw));
  return {
    rotations,
    handTargets: {
      // the character's left hand (model +X) takes the car's left grip (chassis -X)
      left: chassisToDriverModel(grips.left, node, scale),
      right: chassisToDriverModel(grips.right, node, scale)
    }
  };
}

/**
 * World transform of the driver node (a TOP-LEVEL node: a rigged runtime node nested in a moving group renders in world
 * space, ignoring its parent): vehicle pose (carP, chassis attitude Ry(yaw) Rz(roll) Rx(pitch), as composeChassisEuler)
 * x seat offset (driverNodePosition) x Ry(pi) (model +Z facing -> chassis -Z), at uniform `scale` (normalized.sceneScale).
 */
export function driverWorldTransform(
  carP: Vec3,
  attitude: { readonly yaw: number; readonly pitch: number; readonly roll: number },
  hipHeight: number,
  scale: number,
  frame: DriverSeatFrame = driverSeatFrame()
): { readonly position: [number, number, number]; readonly rotation: [number, number, number]; readonly scale: number } {
  const q = quatMulR(quatEulerZYX(0, attitude.yaw, 0), quatMulR(quatEulerZYX(0, 0, attitude.roll), quatEulerZYX(attitude.pitch, 0, 0)));
  const local = driverNodePosition(hipHeight, scale, frame);
  const o = rotQ(q, local);
  return { position: [carP[0] + o[0], carP[1] + o[1], carP[2] + o[2]], rotation: toEulerZYX(quatMulR(q, quatEulerZYX(0, Math.PI, 0))), scale };
}

type Q4 = readonly [number, number, number, number];
function quatEulerZYX(rx: number, ry: number, rz: number): Q4 {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2), cy = Math.cos(ry / 2), sy = Math.sin(ry / 2), cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  // q = qz * qy * qx
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}
function quatMulR(a: Q4, b: Q4): Q4 {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
function rotQ(q: Q4, v: Vec3): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0]);
  return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)];
}
function toEulerZYX(q: Q4): [number, number, number] {
  const [x, y, z, w] = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z);
  const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
  const cy = Math.hypot(m00, m10);
  const ry = Math.atan2(-m20, cy);
  return cy > 1e-7 ? [Math.atan2(m21, m22), ry, Math.atan2(m10, m00)] : [0, ry, Math.atan2(-m01, m11)];
}
