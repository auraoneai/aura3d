/**
 * Craterline GP moving-parts pass (Nov 2026): the riders are rigged Idol spacesuit racers (`cgRider*`, rig: true, T-pose,
 * tools/idol/specs/craterline-gp.json) seated on rider-less Idol bikes, their bones driven every frame through
 * `@aura3d/engine/animation` (`createHumanoidAnimator` + `HumanoidDriver`) from a procedural racing-tuck pose:
 * - seated tuck (thighs along the tank, shins back to the rear pegs, chest low over the tank, chin up to look down the road);
 * - lean into turns (the upper body rolls further into the bike's drawn lean) and a head turn toward the turn;
 * - a deeper tuck and lower head on boost;
 * - hands on the clip-on bars (the driver's two-bone IK lands each palm on its grip);
 * - a speed-scaled chassis buzz and breathing on a running clock, so the body is never frozen even on a straight.
 * Pure (no renderer imports): tests/unit/strange-orbit-port/idol-rider.test.ts drives it with a real Idol skeleton.
 *
 * Frames: the rider model faces +Z (canonical humanoid frame, left = +X); the rig's bike frame faces +X with +Z on the
 * rider's right (`riderRig`), so the rider node turns +90 degrees about Y (`RIDER_LOCAL_YAW`).
 */
import { createHumanoidAnimator, eulerZYX, quatAxisAngle, quatMul, type HumanoidAnimator, type HumanoidPoseInput, type Quat, type Vec3 } from "@aura3d/engine/animation";

export type RiderKey = "cgRiderCream" | "cgRiderCobalt" | "cgRiderCrimson2";

/** Suit per bike livery (hero Sol / Ciel / Ember, rivals cobalt, crimson, violet, sand, teal). */
export const RIDER_FOR_BIKE: Readonly<Record<string, RiderKey>> = {
  cgBikeAlabasterNR: "cgRiderCream",
  cgBikeCobaltNR: "cgRiderCobalt",
  cgBikeCrimsonNR: "cgRiderCrimson2",
  cgBikeVioletNR: "cgRiderCobalt",
  cgBikeSandNR: "cgRiderCream",
  cgBikeTealNR: "cgRiderCobalt"
};

/** Rider standing height in rig metres (before the rig's own display scale). */
export const RIDER_HEIGHT = 1.62;
/** Seated hip joint height above the saddle top (rig metres). */
export const HIP_ABOVE_SADDLE = 0.09;

/** Where a rider sits on one bike, rig frame (x forward, y up, z = rider's right), from `bikeRiderFrame`. */
export interface RiderSeatFrame {
  readonly saddle: Vec3;
  readonly grips: { readonly left: Vec3; readonly right: Vec3 };
}
/** Rider node local turn: model +Z (facing) -> rig +X (forward). */
export const RIDER_LOCAL_YAW = Math.PI / 2;

export interface RiderPoseState {
  /** Sim lean (rad, the bike's own lean before the drawn gain); sign follows the bike's roll. */
  readonly lean: number;
  /** Heading offset from the track tangent (rad), for the head turn; 0 when unknown. */
  readonly steer?: number;
  readonly boosting: boolean;
  /** Forward speed (m/s). */
  readonly speed: number;
  /** Running clock (s). */
  readonly time: number;
  /** Grid / menu idle: sit up a little, no buzz. */
  readonly menu?: boolean;
}

const rx = (a: number): Quat => quatAxisAngle([1, 0, 0], a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Rig-frame point -> rider model-space point, for a rider node at `node` (rig frame) with uniform `scale`. */
export function rigToRiderModel(p: Vec3, node: Vec3, scale: number): Vec3 {
  // node rotation Ry(+pi/2): model (x, y, z) -> rig (z, y, -x); inverse: rig (X, Y, Z) -> model (-Z, Y, X)
  const d: Vec3 = [(p[0] - node[0]) / scale, (p[1] - node[1]) / scale, (p[2] - node[2]) / scale];
  return [-d[2], d[1], d[0]];
}

/**
 * The rider's canonical joint pose for one frame. `hipHeight` is the Idol body's rest hip height (model units) and
 * `scale` the node scale (rig metres per model unit): they place the grip targets in model space.
 */
export function riderPose(s: RiderPoseState, hipHeight: number, scale: number, frame: RiderSeatFrame): HumanoidPoseInput {
  // The sim's lean tops out at +-0.24 rad (race.ts leanTarget): normalise it so a full-steer turn drives the full racing
  // hang-off below (GPU QA F2: at the raw angles the rider barely changed pose from the chase camera).
  const l = clamp(s.lean / LEAN_FULL, -1, 1);
  const speed01 = clamp(s.speed / 40, 0, 1);
  const menu = Boolean(s.menu);
  const boost = s.boosting && !menu ? 1 : 0;
  const t = s.time;
  // chassis buzz: owner QA (Nov 18, "shaking on top of the head, up and down, jittery" from the start): the old 0.03 rad
  // at 23 rad/s (3.7 Hz) moved the head about 1.5 cm at 3.7 Hz. Now a gentle 2.4 Hz sway of <= RIDER_BUZZ_MAX rad that only
  // fades in between RIDER_BUZZ_FROM and 40 m/s, so the start and slow running are still; breathing always runs
  const buzz = menu ? 0 : riderBuzz(s.speed, t);
  const breath = 0.04 * Math.sin(t * 2.1);
  // boost: a full race tuck (chest flat on the tank, chin down behind the screen); cruising sits a little higher
  const tuck = menu ? 0.55 : 0.85 + BOOST_TUCK * boost;
  const hipsPitch = 0.42 + (menu ? -0.12 : 0) + 0.12 * boost;
  const spinePitch = tuck * 0.45 + breath * 0.5;
  const chestPitch = tuck * 0.45 + breath + buzz;
  // hang off into the turn: hips slide toward the inside, the upper body rolls well past the bike's own lean
  const roll = -l * HANG_OFF_ROLL;
  // head turns into the turn (looking through it) and counter-rolls toward level; heading offset adds a little
  const headYaw = clamp(-l * HEAD_TURN + (s.steer ?? 0) * 0.4, -0.75, 0.75) + 0.04 * Math.sin(t * 0.9);
  const headRoll = l * 0.3;
  const headPitch = -(hipsPitch + spinePitch + chestPitch) * 0.82 + (boost ? -0.18 : 0) + buzz * 0.5;
  // thighs forward along the tank, shins back to the rear pegs (world pitch: thigh -1.2, shin +0.55)
  const thigh = -1.2 - hipsPitch, shin = 0.55 + 1.2;
  const knees = 0.07; // knees in against the tank
  // inside knee out toward the apex (left turn: left knee, +Z roll opens the left thigh)
  const kneeOutL = Math.max(0, l) * KNEE_OUT, kneeOutR = Math.max(0, -l) * KNEE_OUT;
  // arms reach forward-down to the bars (world pitch -0.85), whatever the torso pitch; IK then lands the palms on the grips
  const armPitch = -(hipsPitch + spinePitch + chestPitch) - 0.85;
  const elbowsOut = 0.18 + 0.22 * boost;
  const rotations: HumanoidPoseInput["rotations"] = {
    hips: quatMul(rx(hipsPitch), quatAxisAngle([0, 0, 1], roll * 0.3)),
    spine: quatMul(rx(spinePitch), quatAxisAngle([0, 0, 1], roll * 0.35)),
    chest: quatMul(rx(chestPitch), quatAxisAngle([0, 0, 1], roll * 0.35)),
    neck: eulerZYX(headPitch * 0.4, headYaw * 0.4, headRoll * 0.4),
    head: eulerZYX(headPitch * 0.6, headYaw * 0.6, headRoll * 0.6),
    leftUpperLeg: eulerZYX(thigh, 0, -knees + kneeOutL),
    rightUpperLeg: eulerZYX(thigh, 0, knees - kneeOutR),
    leftLowerLeg: rx(shin),
    rightLowerLeg: rx(shin),
    leftFoot: rx(-0.55),
    rightFoot: rx(-0.55),
    leftUpperArm: eulerZYX(armPitch, 0, elbowsOut),
    rightUpperArm: eulerZYX(armPitch, 0, -elbowsOut),
    leftLowerArm: rx(-0.5 - 0.5 * boost),
    rightLowerArm: rx(-0.5 - 0.5 * boost)
  };
  // seat the hips: the node is placed so the rest hip lands on RIDER_SEAT, and grips are fixed on the bars
  const node = riderNodePosition(hipHeight, scale, frame);
  return {
    rotations,
    // hang-off: hips slide toward the inside of the turn and drop a touch on boost (units of rest hip height)
    hipsOffset: [l * HANG_OFF_SHIFT, -0.04 * boost, 0],
    handTargets: {
      left: rigToRiderModel(frame.grips.left, node, scale),
      right: rigToRiderModel(frame.grips.right, node, scale)
    }
  };
}

/** Rider chassis-buzz amplitude (rad, chest pitch) at top speed, its rate (rad/s, 2.4 Hz) and the speed it fades in from. */
export const RIDER_BUZZ_MAX = 0.012;
export const RIDER_BUZZ_RATE = 15;
export const RIDER_BUZZ_FROM = 12;
/** Chest-pitch buzz (rad) at `speed` m/s and time `t` s: zero below RIDER_BUZZ_FROM, smooth fade-in to 40 m/s. */
export function riderBuzz(speed: number, t: number): number {
  const u = clamp((speed - RIDER_BUZZ_FROM) / (40 - RIDER_BUZZ_FROM), 0, 1);
  return RIDER_BUZZ_MAX * u * u * (3 - 2 * u) * Math.sin(t * RIDER_BUZZ_RATE);
}

/** The sim lean (rad) that counts as a full-steer turn (race.ts clamps its lean target to +-0.24). */
export const LEAN_FULL = 0.24;
/** Upper-body roll (rad) past the bike at a full-steer turn, spread over hips, spine and chest. */
export const HANG_OFF_ROLL = 0.75;
/** Hips slide toward the inside at a full-steer turn (units of rest hip height). */
export const HANG_OFF_SHIFT = 0.14;
/** Head turn (rad) into a full-steer turn. */
export const HEAD_TURN = 0.6;
/** Inside-knee opening (rad) at a full-steer turn. */
export const KNEE_OUT = 0.5;
/** Extra torso tuck on boost. */
export const BOOST_TUCK = 0.45;

/** Rig-frame position of the rider node so its rest hip joint sits just above the saddle. */
export function riderNodePosition(hipHeight: number, scale: number, frame: RiderSeatFrame): Vec3 {
  return [frame.saddle[0], frame.saddle[1] + HIP_ABOVE_SADDLE - hipHeight * scale, frame.saddle[2]];
}

/** Stateful `@aura3d/engine/animation` humanoid animator for one seated Idol racer (cross-fades menu/cruise/boost states). */
export function createIdolRiderAnimator(): { update(dt: number, s: RiderPoseState, hipHeight: number, scale: number, frame: RiderSeatFrame): HumanoidPoseInput } {
  const anim: HumanoidAnimator<never> = createHumanoidAnimator({} as Readonly<Record<never, never>>);
  return {
    update(dt, s, hipHeight, scale, frame) {
      const key = s.menu ? "menu" : s.boosting ? "boost" : "cruise";
      return anim.update(dt, { pose: riderPose(s, hipHeight, scale, frame), key, fade: 0.14 });
    }
  };
}
