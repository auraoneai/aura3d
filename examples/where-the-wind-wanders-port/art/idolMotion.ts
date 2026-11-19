/**
 * Motion-captured-quality movement for the rigged Idol Bellkeeper (render layer only). The clips are fal.ai text-to-motion
 * (tools/idol/motion-specs/bellkeepers-walk.json -> apps/showcase-where-the-wind-wanders-port/src/motion.generated.ts),
 * played through the shared animator (apps/showcase-port-shared/idol/motion.ts) on the hero's baked skeleton
 * (art/bkHeroSkeleton.ts) with the shared humanoid driver:
 *
 * - Walk is driven by the DISTANCE the traveller covers (a planted-foot table measured on this body, `measureWalkTable`),
 *   so planted feet do not slide at the sim's 3.2 m/s; Idle plays on the frame clock; the boat epilogue stands in the boat on Idle.
 * - Hop: the sim's takeoff (0.1 s) / air (11.2/13 s) / landing (0.16 s) map onto the captured hop with its apex on the
 *   sim's apex (`eventTime`); the clip's own rise is dropped because world.ts already lifts the hero by the hop height.
 * - Bell ring: when the last bell rings the staff arm rises in the captured salute, layered over the legs (arms + head).
 * - Gaze: the world's look yaw/pitch turns the head on top of the clip (the procedural rig's head-look overlay).
 *
 * The staff is carried at the drawn right palm, upright and leaning with the captured forearm.
 */
import {
  ARM_ROLES,
  blendHumanoidPoses,
  createHumanoidDriver,
  createMotionAnimator,
  eulerZYX,
  humanoidEventTime as eventTime,
  layerHumanoidPose,
  quatAxisAngle,
  quatFromTo,
  quatMul,
  rotateVec,
  sampleHumanoidClip,
  type HumanoidAnimationPose,
  type HumanoidAnimator as MotionAnimator,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type HumanoidRole,
  type Quat,
  type Vec3
} from "@aura3d/engine/animation";
import { MOTION_CLIPS, type MotionClipName } from "../../../apps/showcase-where-the-wind-wanders-port/src/motion.generated";
import { BK_HERO_SKELETON } from "./bkHeroSkeleton";

/** Sim hop phase lengths (sim.ts `advanceHop`) and the air arc's apex (height 5.6 e - 6.5 e^2 peaks at e = 5.6 / 13). */
export const HOP_SECONDS = { takeoff: 0.1, air: 11.2 / 13, landing: 0.16 } as const;
const HOP_TOTAL = HOP_SECONDS.takeoff + HOP_SECONDS.air + HOP_SECONDS.landing;
const HOP_APEX_FRAC = (HOP_SECONDS.takeoff + 5.6 / 13) / HOP_TOTAL;
/** The captured hop from just before its crouch-release to standing again (seconds of the Hop clip). */
export const HOP_WINDOW: readonly [number, number] = [0.85, 1.85];
/** world.ts fades the bell ring from 1 to 0 over this many seconds. */
export const RING_SECONDS = 2.6;
const HEAD_ROLES: readonly HumanoidRole[] = ["neck", "head"];
/** Hips offset (m) the stance-foot lock may hold before it eases back. */
const LOCK_FREE = 0.12;

export interface BellkeeperMotionInput {
  readonly gait: "Idle" | "Walk" | "Run";
  /** Ground metres walked so far (render-side accumulator; drives the walk phase). */
  readonly metres: number;
  /** Real frame seconds. */
  readonly dt: number;
  readonly hopPhase: string;
  /** 0..1, 1 the moment the bell rings, easing to 0 over RING_SECONDS. */
  readonly ring: number;
  readonly lookYaw: number;
  readonly lookPitch: number;
  readonly onBoat: boolean;
}

export interface BellkeeperMotionFrame {
  readonly input: HumanoidPoseInput;
  readonly pose: HumanoidAnimationPose;
  readonly clip: string;
  /** Time (s) in the playing clip. */
  readonly time: number;
  /** Model-space right palm (the staff grip) and the staff's tilt from upright. */
  readonly hand: Vec3;
  readonly staffTilt: Quat;
}

export interface BellkeeperMotion {
  readonly driver: HumanoidDriver;
  frame(inp: BellkeeperMotionInput): BellkeeperMotionFrame;
}

const qId: Quat = [0, 0, 0, 1];
const chain = (rot: Partial<Record<HumanoidRole, Quat>>, roles: readonly HumanoidRole[]): Quat =>
  roles.reduce<Quat>((q, r) => quatMul(q, rot[r] ?? qId), qId);

/**
 * Distance -> Walk clip time on THIS body: the planted (lower) foot's backward slide per clip step, measured through the
 * driver (the Idol legs are not the capture's proportions, so the clip's hip-scaled ground speed would skate ~0.3 m a step).
 */
export interface WalkTable { readonly times: number[]; readonly dist: number[]; readonly cycle: number; /** yaw (rad) of the captured walking line off +Z */ readonly yaw: number }
export function measureWalkTable(driver: HumanoidDriver, steps = 120): WalkTable {
  const clip = MOTION_CLIPS.Walk, R = driver.map.roles;
  const times: number[] = [], dist: number[] = [0];
  let prev: Record<string, Vec3> | null = null;
  let nx = 0, nz = 0;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * clip.duration;
    const P = driver.modelPositions(sampleHumanoidClip(clip, t, { loop: true }));
    times.push(t);
    if (prev) {
      const foot = P[R.leftFoot!]![1] <= P[R.rightFoot!]![1] ? R.leftFoot! : R.rightFoot!;
      dist.push(dist[dist.length - 1]! + Math.max(0, prev[foot]![2] - P[foot]![2]));
      nx += prev[foot]![0] - P[foot]![0];
      nz += prev[foot]![2] - P[foot]![2];
    }
    prev = P;
  }
  return { times, dist, cycle: dist[dist.length - 1]!, yaw: Math.atan2(nx, nz) };
}
/** Walk clip time for ground metres walked (planted foot held). */
export function walkTimeForMetres(tab: WalkTable, metres: number): number {
  const x = ((metres % tab.cycle) + tab.cycle) % tab.cycle;
  let k = 0;
  while (k < tab.dist.length - 2 && tab.dist[k + 1]! < x) k++;
  const span = tab.dist[k + 1]! - tab.dist[k]!;
  return tab.times[k]! + (tab.times[k + 1]! - tab.times[k]!) * (span > 1e-9 ? (x - tab.dist[k]!) / span : 0);
}

let shared: HumanoidDriver | null = null;
let walkTable: WalkTable | null = null;
/** The Bellkeeper's humanoid driver (baked skeleton, facing +Z). */
export const bellkeeperDriver = (): HumanoidDriver => (shared ??= createHumanoidDriver(BK_HERO_SKELETON));

export function createBellkeeperMotion(): BellkeeperMotion {
  const driver = bellkeeperDriver();
  walkTable ??= measureWalkTable(driver);
  const tab = walkTable;
  const anim: MotionAnimator<MotionClipName> = createMotionAnimator(MOTION_CLIPS);
  let hopT = 0, wasHop = false;
  // stance-foot lock: a small hips shift that cancels the captured foot's residual sideways / fore-aft skid
  const lock = [0, 0];
  let lockFoot = "", lockPrev: Vec3 = [0, 0, 0], lastMetres = 0;
  const hipH = driver.map.hipHeight, R = driver.map.roles;
  return {
    driver,
    frame(inp) {
      const hopping = !inp.onBoat && inp.hopPhase !== "idle";
      if (hopping && !wasHop) hopT = 0;
      else if (hopping) hopT += Math.max(0, inp.dt);
      wasHop = hopping;
      let base: HumanoidPoseInput;
      if (hopping) {
        const t = eventTime(MOTION_CLIPS.Hop, Math.min(1, hopT / HOP_TOTAL), HOP_APEX_FRAC, "apexTime", HOP_WINDOW);
        const p = anim.update(inp.dt, { clip: "Hop", time: t, loop: false, fade: 0.08 });
        const h = p.hipsOffset ?? [0, 0, 0];
        base = { ...p, hipsOffset: [h[0], Math.min(0, h[1]), h[2]] }; // the world lifts the hero by the sim's hop height
      } else if (!inp.onBoat && inp.gait !== "Idle") {
        base = anim.update(inp.dt, { clip: "Walk", time: walkTimeForMetres(tab, inp.metres), fade: 0.2 });
      } else {
        base = anim.update(inp.dt, { clip: "Idle", rate: 1, fade: 0.3 });
      }
      // the bell salute: the captured staff raise over the arms and head, eased in and out
      const ring = Math.max(0, Math.min(1, inp.ring));
      if (ring > 0) {
        const u = 1 - ring;
        const top = sampleHumanoidClip(MOTION_CLIPS.RingBell, u * MOTION_CLIPS.RingBell.duration, { loop: false });
        const w = Math.min(1, u / 0.1, ring / 0.15);
        base = blendHumanoidPoses(base, layerHumanoidPose(base, top, [...ARM_ROLES, ...HEAD_ROLES, "chest"]), w);
      }
      // gaze on top of the clip
      const look = eulerZYX(Math.max(-0.38, Math.min(0.38, inp.lookPitch)), Math.max(-0.7, Math.min(0.7, inp.lookYaw)), 0);
      const walking = anim.current === "Walk";
      // the captured walker drifts ~2 degrees off straight: turn the body onto the walking line while it walks
      const turn = walking ? quatAxisAngle([0, 1, 0], -tab.yaw) : qId;
      const rotations = { ...base.rotations, hips: quatMul(turn, base.rotations.hips ?? qId), head: quatMul(base.rotations.head ?? qId, look) };
      if (walking && base.hipsOffset) base = { ...base, hipsOffset: rotateVec(turn, base.hipsOffset) };
      const dm = inp.metres - lastMetres;
      lastMetres = inp.metres;
      if (walking) {
        const P = driver.modelPositions({ ...base, rotations });
        const foot = P[R.leftFoot!]![1] <= P[R.rightFoot!]![1] ? R.leftFoot! : R.rightFoot!;
        const fp = P[foot]!;
        if (foot === lockFoot && Math.abs(dm) < 1) {
          lock[0] -= fp[0] - lockPrev[0];
          lock[1] -= fp[2] - lockPrev[2] + dm;
        }
        lockFoot = foot;
        lockPrev = fp;
      } else lockFoot = "";
      // eased back only beyond a few centimetres (and fully when not walking), so a planted foot stays put
      const free = walking ? LOCK_FREE : 0;
      const ll = Math.hypot(lock[0]!, lock[1]!);
      if (ll > free) {
        const k = (free + (ll - free) * Math.exp(-Math.max(0, inp.dt) * (walking ? 1.2 : 4))) / ll;
        lock[0]! *= k; lock[1]! *= k;
      }
      const h0 = base.hipsOffset ?? [0, 0, 0];
      const input: HumanoidPoseInput = { ...base, rotations, hipsOffset: [h0[0] + lock[0]! / hipH, h0[1], h0[2] + lock[1]! / hipH] };
      const fore = chain(rotations, ["hips", "spine", "chest", "rightShoulder", "rightUpperArm", "rightLowerArm"]);
      const f = rotateVec(fore, [0, -1, 0]);
      const lean: Vec3 = [f[0] * 0.6, 1, f[2] * 0.6];
      const l = Math.hypot(lean[0], lean[1], lean[2]);
      return {
        input,
        pose: driver.pose(input),
        clip: anim.current,
        time: anim.time,
        hand: driver.palmPoints(input).right,
        staffTilt: quatFromTo([0, 1, 0], [lean[0] / l, lean[1] / l, lean[2] / l])
      };
    }
  };
}
