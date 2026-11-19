/**
 * Idol wow pass: the rigged Idol courier (`duneRiderRig`, 28-34 unnamed bones) driven every frame from the same rider
 * motion values the procedural rig used (world.ts: crouch, forward lean, carve, air, celebrate, breathing, arm balance),
 * through the shared humanoid retargeter (apps/showcase-port-shared/idol/humanoid.ts, object-form poses).
 *
 * Stance (canonical humanoid frame: facing +Z, +Y up, the rider's left = +X): a sail-board stance with the left boot
 * forward and the right boot back, knees bent, hips dropped so both soles stay on the deck, arms out for balance, the
 * chest leaning into speed and rolling into carves, the head counter-pitched to keep looking ahead, plus a small idle
 * balance sway. Leg angles are solved per leg so both feet reach the same depth below the hips (a two-segment leg of
 * equal thigh and shin lengths), so the soles stay planted as the rider crouches.
 *
 * `riderMotionPose` layers motion-captured-quality clips (fal-ai/hunyuan-motion, tools/idol/motion-specs/
 * silt-and-signal-port.json: Balance, LeanLeft mirrored for right carves, Crouch for boost) over that code pose: the clips
 * drive the spine, neck, head and arms (blended by carve and crouch), while the hips and legs keep the code stance as a
 * foot-plant overlay so the boots never leave the deck.
 */
import {
  blendHumanoidPoses,
  eulerZYX,
  loadIdolHumanoid,
  mirrorHumanoidPose,
  quatMul,
  sampleHumanoidClip,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type HumanoidRole
} from "../../../apps/showcase-port-shared/idol/humanoid";
import { MOTION_CLIPS } from "./motion.generated";

/** The per-frame motion values world.ts computes for the rider (all already clamped by world.ts). */
export interface RiderMotion {
  /** 0 (relaxed) .. ~0.9 (boost + landing compression). */
  readonly crouch: number;
  /** Forward lean (rad-ish, ~0.08 .. 0.4). */
  readonly leanFwd: number;
  /** Carve (bank) -0.65 .. 0.65; positive = carving right. */
  readonly carve: number;
  /** 0 on the ground .. 1 high in the air. */
  readonly air01: number;
  /** Ring-pass celebration pulse 0..1. */
  readonly celebrate: number;
  /** Breathing offset (rad). */
  readonly breathe: number;
  /** Arm balance wave (rad). */
  readonly armWave: number;
  /** Seconds (drives the idle balance sway). */
  readonly time: number;
  /** 1 full motion, 0.35 under reduced motion. */
  readonly motion: number;
  /** 0 (hovering) .. 1 (full speed): relaxed arms at low speed, spread for balance at speed. Default 0.5. */
  readonly speed01?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Knee angle that puts the foot at `extension` (fraction of the straight leg) below the hip for a thigh pitched `thigh`
 * (rad about X, negative = swung forward); returns [knee, foot] so the shin points down and back and the sole is level.
 */
function solveLeg(thigh: number, extension: number): readonly [number, number] {
  const shinWorld = Math.acos(clamp(2 * extension - Math.cos(thigh), -1, 1));
  const knee = shinWorld - thigh;
  return [knee, -shinWorld];
}

/** Leg extension (fraction of the straight leg) for a crouch: 0.84 relaxed (soft knees), 0.72 in a full boost crouch. */
/** Cap on the arms' sideways spread (rad from hanging): about 29 deg, so the balance arms never read as a T-pose. */
export const ARM_OUT_MAX = 0.5;
/** Per-arm carve term (rad per unit carve): counters the chest's roll into the carve (0.32 rad per unit, riderMotionPose). */
const ARM_CARVE = 0.28;
/** Carve counter-sweep of the arms fore and aft (rad per unit carve): the steering shows in the arms without lifting them. */
const ARM_SWEEP = 0.3;

export const legExtension = (crouch: number): number => 0.84 - 0.12 * clamp(crouch, 0, 1);

export function riderHumanoidPose(m: RiderMotion): HumanoidPoseInput {
  const sway = Math.sin(m.time * 1.7) * 0.035 * m.motion;
  const swayFwd = Math.sin(m.time * 1.1 + 0.6) * 0.02 * m.motion;
  const ext = legExtension(m.crouch);
  // lead (left) leg forward, rear (right) leg back; the carve shifts weight onto the inside rail
  const leadThigh = -0.42 - 0.18 * m.crouch + m.carve * 0.06;
  const rearThigh = 0.22 + 0.06 * m.crouch - m.carve * 0.06;
  const [leadKnee, leadFoot] = solveLeg(leadThigh, ext);
  const [rearKnee, rearFoot] = solveLeg(rearThigh, ext);
  const chestPitch = 0.12 + m.leanFwd * 0.9 + m.breathe + swayFwd;
  // relaxed at low speed (hands near the hips, elbows bent), spreading for balance with speed, air and carves
  const speed01 = clamp(m.speed01 ?? 0.5, 0, 1);
  // audit 2026-11-18: at Turbo the old 0.22 + 0.55 * speed spread, plus a per-arm carve term that ADDED to the chest roll
  // on the high side, lifted the outside hand level with (or above) the shoulder: the rejected arms-wide pose. The spread
  // is capped (ARM_OUT_MAX), the boost crouch brings the hands forward instead of out, and the per-arm carve term now
  // counters the chest roll, so both hands stay well below the shoulders in every carve (idol-rider.test.ts)
  const crouch01 = clamp(m.crouch, 0, 1);
  const armOut = Math.min(ARM_OUT_MAX, 0.2 + 0.32 * speed01 + m.air01 * 0.14 + Math.abs(m.carve) * 0.1) + m.celebrate * 0.5;
  const armFwd = crouch01 * 0.45;
  const elbow = -(0.95 - 0.35 * speed01 + crouch01 * 0.25);
  return {
    rotations: {
      hips: eulerZYX(m.leanFwd * 0.2, -m.carve * 0.18, -m.carve * 0.12 + sway),
      chest: eulerZYX(chestPitch, -m.carve * 0.22 + m.celebrate * 0.15, -m.carve * 0.18 - sway * 0.8),
      head: eulerZYX(-chestPitch * 0.85 + m.air01 * 0.05, m.carve * 0.35, m.carve * 0.08),
      leftUpperArm: eulerZYX(-0.2 - m.leanFwd * 0.3 - armFwd + m.carve * ARM_SWEEP + m.armWave, 0, armOut + m.carve * ARM_CARVE),
      leftLowerArm: eulerZYX(elbow, 0, 0.1),
      rightUpperArm: eulerZYX(-0.1 + m.leanFwd * 0.2 - armFwd * 0.6 - m.carve * ARM_SWEEP - m.armWave * 0.9, 0, -(armOut - m.carve * ARM_CARVE)),
      rightLowerArm: eulerZYX(elbow, 0, -0.1),
      leftUpperLeg: eulerZYX(leadThigh, 0, 0.07),
      leftLowerLeg: eulerZYX(leadKnee, 0, 0),
      leftFoot: eulerZYX(leadFoot, 0, -0.07),
      rightUpperLeg: eulerZYX(rearThigh, 0, -0.09),
      rightLowerLeg: eulerZYX(rearKnee, 0, 0),
      rightFoot: eulerZYX(rearFoot, 0, 0.09)
    },
    // hips drop so the planted soles stay on the deck (units of rest hip height)
    hipsOffset: [0, ext - 1, -0.04 - m.leanFwd * 0.1]
  };
}

let driver: HumanoidDriver | undefined;
let loading: Promise<void> | null = null;

/** Load the rider's skeleton once (boot awaits this before warmPrograms, so the courier never shows its T-pose). */
export function preloadRiderDriver(url: string): Promise<void> {
  if (!loading) {
    loading = loadIdolHumanoid(url)
      .then((d) => { driver = d; })
      .catch((e: unknown) => { loading = null; console.warn("[duneglide] idol rider skeleton", e); });
  }
  return loading;
}

/** The loaded driver, or undefined while the skeleton is still loading. */
export const riderDriver = (): HumanoidDriver | undefined => driver;

/**
 * Roles the motion clips drive (spine and head: the weight shifts, leans and crouch). The hips and legs stay on the code
 * stance (foot-plant overlay) and the arms on the code pose (relaxed at low speed, spread for balance at speed): the
 * clips' wide balance arms read as the rejected T-pose at hover speed (real-GPU QA F2).
 */
const CLIP_ROLES: readonly HumanoidRole[] = ["spine", "chest", "neck", "head"];

/**
 * The rider's per-frame pose: the Balance clip, blended towards LeanLeft (mirrored for right carves) by the carve and
 * towards Crouch by the crouch, on the upper body; the code stance (hips, legs, hips drop) keeps both boots planted.
 * Reduced motion (`motion` 0.35) keeps the clips but scales their blend weights down.
 */
export function riderMotionPose(m: RiderMotion): HumanoidPoseInput {
  const code = riderHumanoidPose(m);
  const t = m.time;
  const balance = sampleHumanoidClip(MOTION_CLIPS.Balance, t * (0.6 + 0.4 * m.motion));
  const leanRaw = sampleHumanoidClip(MOTION_CLIPS.LeanLeft, t);
  const lean = m.carve > 0 ? mirrorHumanoidPose(leanRaw) : leanRaw;
  const crouch = sampleHumanoidClip(MOTION_CLIPS.Crouch, t);
  const leanW = clamp(Math.abs(m.carve) / 0.65, 0, 1) * (0.5 + 0.5 * m.motion);
  const crouchW = clamp(m.crouch, 0, 1) * (0.5 + 0.5 * m.motion);
  const clip = blendHumanoidPoses(blendHumanoidPoses(balance, lean, leanW), crouch, crouchW);
  const rotations = { ...code.rotations };
  for (const role of CLIP_ROLES) {
    const q = clip.rotations[role];
    if (q) rotations[role] = q;
  }
  // the carve also rolls the chest into the turn on top of the clip's lean, so it reads at chase-camera distance
  if (rotations.chest) rotations.chest = quatMul(rotations.chest, eulerZYX(0, -m.carve * 0.15, -m.carve * 0.32));
  // the celebration pulse still throws the arms out on top of the clip
  if (m.celebrate > 0.01) {
    rotations.leftUpperArm = blendHumanoidPoses({ rotations: { leftUpperArm: rotations.leftUpperArm! } }, { rotations: { leftUpperArm: code.rotations.leftUpperArm! } }, m.celebrate).rotations.leftUpperArm!;
    rotations.rightUpperArm = blendHumanoidPoses({ rotations: { rightUpperArm: rotations.rightUpperArm! } }, { rotations: { rightUpperArm: code.rotations.rightUpperArm! } }, m.celebrate).rotations.rightUpperArm!;
  }
  return { rotations, hipsOffset: code.hipsOffset };
}
