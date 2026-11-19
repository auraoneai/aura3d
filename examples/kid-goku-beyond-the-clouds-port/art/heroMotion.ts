/**
 * Sky-kid hero motion (Idol wow pass, fal motion lane): the rigged Idol hero (cdSkyKidHero) plays text-to-motion clips
 * (tools/idol/motion-specs/cumulus-dash.json -> apps/showcase-cloud-runner-port/src/motion.generated.ts, SMPL capture
 * retargeted to the canonical humanoid frame) through the shared humanoid driver and animator
 * (apps/showcase-port-shared/idol/{humanoid,motion}.ts). Render layer only: it reads the hero's state each frame and
 * returns an object-form replace pose; the sim, replays and camera never see it.
 *
 * - Run: the captured run's upper body (arm pump, torso, head) is phase-locked to the game's planted-foot gait (one
 *   captured stride per gait cycle, left touchdown on left touchdown). The legs keep the gait's foot IK: each ankle is
 *   solved with two-bone IK on the Idol leg onto the gait's ankle target (gait.ts `ankleTarget`, scaled to the Idol leg),
 *   so a stance foot stays planted at the sim's 14-19 m/s, which no captured stride can cover. Below the gait's blend
 *   speed the captured legs show through (gait.ts `gaitWeight`).
 * - Jump: the captured leap synced to the sim's ballistic arc (take-off on take-off, apex on apex: motion.ts `airTime`).
 * - Cloud riding and the staff balance: the captured surf crouch (loop). Strike and stumble/grab: captured punch combo
 *   and hit stagger. Menu: captured idle.
 * - Cheer, defeat and the fall off an edge keep the hand-made code pose (`computeSkyKidHeroPose`), cross-faded in.
 */
import {
  createHumanoidDriver,
  eulerZYX,
  quatFromTo,
  quatInv,
  quatMul,
  quatNorm,
  quatPow,
  quatSlerp,
  rotateVec,
  sampleHumanoidClip,
  type HumanoidAnimationPose,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type HumanoidRole,
  type Quat,
  type Vec3
} from "../../../apps/showcase-port-shared/idol/humanoid";
import { airTime, createMotionAnimator, type MotionRequest } from "../../../apps/showcase-port-shared/idol/motion";
import { MOTION_CLIPS, type MotionClipName } from "../../../apps/showcase-cloud-runner-port/src/motion.generated";
import { ANKLE_HEIGHT, LEG_REACH, ankleTarget, gaitParams, gaitWeight, hipHeightAt } from "../gait";
import { IDOL_HERO_RIG } from "./idolHeroRig";
import { IDOL_HERO_SKELETON } from "./idolHeroSkeleton";
import type { SkyKidHeroPose } from "./proceduralModels";

const C = MOTION_CLIPS;
/** The sim's jump gravity (sim.ts GRAVITY), as the downward acceleration `airTime` expects. */
const SIM_GRAVITY = -25;

/* ---------------- code pose -> canonical humanoid ---------------- */

/** The procedural hero articulation (ZYX Euler joints, rest: arms and legs straight down, facing +Z) as a canonical pose. */
export function skyKidHumanoidPose(pose: SkyKidHeroPose, restPelvisY = IDOL_HERO_RIG.restPelvisY): HumanoidPoseInput {
  const E = (e: readonly [number, number, number]): Quat => eulerZYX(e[0], e[1], e[2]);
  const torso = E(pose.torsoRot), head = E(pose.headRot);
  return {
    rotations: {
      hips: E(pose.pelvisRot),
      spine: quatPow(torso, 0.5),
      chest: quatPow(torso, 0.5),
      neck: quatPow(head, 0.4),
      head: quatPow(head, 0.6),
      leftUpperArm: E(pose.armLRot),
      leftLowerArm: E(pose.forearmLRot),
      rightUpperArm: E(pose.armRRot),
      rightLowerArm: E(pose.forearmRRot),
      leftUpperLeg: E(pose.thighLRot),
      leftLowerLeg: E(pose.shinLRot),
      leftFoot: E(pose.bootLRot),
      rightUpperLeg: E(pose.thighRRot),
      rightLowerLeg: E(pose.shinRRot),
      rightFoot: E(pose.bootRRot)
    },
    hipsOffset: [pose.pelvisPos[0] / restPelvisY, (pose.pelvisPos[1] - restPelvisY) / restPelvisY, pose.pelvisPos[2] / restPelvisY]
  };
}

/* ---------------- the Idol body: rest measurements ---------------- */

export interface HeroBody {
  readonly driver: HumanoidDriver;
  readonly hips: Vec3;
  readonly hipJoint: Readonly<Record<"left" | "right", Vec3>>;
  readonly thigh: Readonly<Record<"left" | "right", number>>;
  readonly shin: Readonly<Record<"left" | "right", number>>;
  readonly ankleY: Readonly<Record<"left" | "right", number>>;
  /** Idol leg reach over the procedural rig's (gait targets are scaled vertically by it). */
  readonly legScale: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

let body: HeroBody | undefined;
export function heroBody(): HeroBody {
  if (body) return body;
  const driver = createHumanoidDriver(IDOL_HERO_SKELETON);
  const p = driver.modelPositions({ rotations: {} });
  const at = (role: HumanoidRole): Vec3 => p[driver.map.roles[role]!]!;
  const side = (s: "left" | "right") => ({ hip: at(`${s}UpperLeg`), knee: at(`${s}LowerLeg`), ankle: at(`${s}Foot`) });
  const L = side("left"), R = side("right");
  const thigh = { left: len(sub(L.knee, L.hip)), right: len(sub(R.knee, R.hip)) };
  const shin = { left: len(sub(L.ankle, L.knee)), right: len(sub(R.ankle, R.knee)) };
  body = {
    driver,
    hips: at("hips"),
    hipJoint: { left: L.hip, right: R.hip },
    thigh,
    shin,
    ankleY: { left: L.ankle[1], right: R.ankle[1] },
    legScale: Math.min(thigh.left + shin.left, thigh.right + shin.right) / LEG_REACH
  };
  return body;
}

/* ---------------- planted-foot leg IK (canonical frame = Idol model frame, facing +Z) ---------------- */

const DOWN: Vec3 = [0, -1, 0];
const FORWARD: Vec3 = [0, 0, 1];

/**
 * Solve one Idol leg so its ankle lands on `target` (model space), knee bending forward, foot keeping the world
 * orientation the input gave it. Returns the input with that leg's three local rotations replaced.
 */
export function solveIdolLeg(input: HumanoidPoseInput, side: "left" | "right", target: Vec3, b: HeroBody = heroBody()): HumanoidPoseInput {
  const r = input.rotations;
  const I: Quat = [0, 0, 0, 1];
  const hipsQ = r.hips ?? I;
  const hipsPos = add(b.hips, scale(input.hipsOffset ?? [0, 0, 0], b.driver.map.hipHeight));
  const hipJ = add(hipsPos, rotateVec(hipsQ, sub(b.hipJoint[side], b.hips)));
  const T = b.thigh[side], S = b.shin[side];
  const delta = sub(target, hipJ);
  const dist = len(delta);
  const d = Math.max(Math.abs(T - S) + 1e-4, Math.min(dist, (T + S) * 0.9995));
  const u = scale(delta, 1 / (dist || 1));
  const cosA = Math.max(-1, Math.min(1, (T * T + d * d - S * S) / (2 * T * d)));
  let w = sub(FORWARD, scale(u, dot(FORWARD, u)));
  w = len(w) < 1e-6 ? [0, 0, 1] : unit(w);
  const knee = add(hipJ, scale(add(scale(u, cosA), scale(w, Math.sqrt(1 - cosA * cosA))), T));
  const ankle = add(hipJ, scale(u, d));
  const up = `${side}UpperLeg` as const, low = `${side}LowerLeg` as const, foot = `${side}Foot` as const;
  // keep the source thigh's twist: turn its current direction onto the solved one
  const thighSrc = quatMul(hipsQ, r[up] ?? I);
  const thighW = quatNorm(quatMul(quatFromTo(rotateVec(thighSrc, DOWN), unit(sub(knee, hipJ))), thighSrc));
  const shinSrc = quatMul(thighW, r[low] ?? I);
  const shinW = quatNorm(quatMul(quatFromTo(rotateVec(shinSrc, DOWN), unit(sub(ankle, knee))), shinSrc));
  const footW = quatMul(quatMul(quatMul(hipsQ, r[up] ?? I), r[low] ?? I), r[foot] ?? I);
  return {
    ...input,
    rotations: {
      ...r,
      [up]: quatNorm(quatMul(quatInv(hipsQ), thighW)),
      [low]: quatNorm(quatMul(quatInv(thighW), shinW)),
      [foot]: quatNorm(quatMul(quatInv(shinW), footW))
    }
  };
}

/** Where the gait puts each ankle (model space) and the hips height, scaled from the procedural rig onto the Idol leg. */
export function gaitTargets(speed: number, phase: number, b: HeroBody = heroBody()): { left: Vec3; right: Vec3; hipJointY: number } {
  const p = gaitParams(Math.max(0, speed));
  const phL = ((phase % 1) + 1) % 1, phR = (phL + 0.5) % 1;
  const k = b.legScale;
  const target = (side: "left" | "right", leg: number): Vec3 => {
    const t = ankleTarget(p, Math.max(0, speed), leg);
    // z stays in metres (the planted foot must slide back at exactly the ground speed); height scales with the leg
    return [b.hipJoint[side][0], b.ankleY[side] + (t.y - ANKLE_HEIGHT) * k, t.z];
  };
  const restAnkle = (b.ankleY.left + b.ankleY.right) / 2;
  return { left: target("left", phL), right: target("right", phR), hipJointY: restAnkle + (hipHeightAt(p, (phL * 2) % 1) - ANKLE_HEIGHT) * k };
}

/* ---------------- run-cycle alignment of the captured stride ---------------- */

/** Left-foot touchdown time and one stride's duration in the captured run, read from the Idol ankle height. */
export function runStride(b: HeroBody = heroBody()): { touchdownL: number; touchdownR: number; stride: number } {
  const clip = C.Run;
  const fps = 60, n = Math.round(clip.duration * fps);
  const heights = (role: HumanoidRole): number[] => {
    const hs: number[] = [];
    for (let i = 0; i <= n; i++) hs.push(b.driver.modelPositions(sampleHumanoidClip(clip, i / fps, { loop: false }))[b.driver.map.roles[role]!]![1]);
    return hs;
  };
  // a touchdown is a fall through the lower quarter of the foot's range after it has swung through the upper half
  // (hysteresis: capture jitter near the floor is not a step)
  const touchdowns = (hs: readonly number[]): number[] => {
    const lo = Math.min(...hs), hi = Math.max(...hs), th = lo + 0.25 * (hi - lo), rearm = lo + 0.5 * (hi - lo);
    const downs: number[] = [];
    let armed = false;
    for (let i = 1; i <= n; i++) {
      if (hs[i]! > rearm) armed = true;
      if (armed && hs[i - 1]! > th && hs[i]! <= th) { downs.push(i / fps); armed = false; }
    }
    return downs;
  };
  const hl = heights("leftFoot"), hr = heights("rightFoot");
  // stride period: the lag (0.4-1.4 s) at which the left ankle's height best repeats
  let stride = clip.duration / 2, best = Infinity;
  for (let lag = Math.round(0.4 * fps); lag <= Math.min(Math.round(1.4 * fps), n - 10); lag++) {
    let e = 0;
    for (let i = 0; i + lag <= n; i++) e += Math.abs(hl[i + lag]! - hl[i]!);
    e /= n + 1 - lag;
    if (e < best) { best = e; stride = lag / fps; }
  }
  const l = touchdowns(hl), r = touchdowns(hr);
  // play one whole stride inside the clip (never across the loop seam): the stride that ends on a detected touchdown
  let tl = l[0] ?? 0;
  while (tl - stride >= 0) tl -= stride;
  if (tl + stride > clip.duration) tl = Math.max(0, clip.duration - stride);
  const tr = [...r, ...r.map((t) => t - stride)].map((t) => ((t - tl) % stride + stride) % stride + tl).sort((x, y) => x - y)[0] ?? tl + stride / 2;
  return { touchdownL: tl, touchdownR: tr, stride };
}

/* ---------------- per-frame driver ---------------- */

export interface HeroMotionFrame {
  /** The world's hero clip this frame (run, jump, sit, block, attack, hit, idle, cheer, dead). */
  readonly clip: string;
  /** Real frame seconds (0 while paused). */
  readonly dt: number;
  readonly groundSpeed: number;
  /** Planted-gait cycle phase (world.ts `gait.phase`: left touchdown at integers) and its blend weight. */
  readonly gaitPhase: number;
  /** Sim jump height above the ground reference and vertical speed. */
  readonly jump: number;
  readonly jumpVelocity: number;
  /** Falling off an edge (the world plays its own tumble). */
  readonly falling: boolean;
  /** This frame's hand-made pose (used for cheer / defeat / falls, and as the run's lean). */
  readonly codePose: SkyKidHeroPose;
  /** Sideways speed (m/s, + toward +lane): the cloud rider leans into it. */
  readonly laneVelocity?: number;
}

const qz = (a: number): Quat => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qx = (a: number): Quat => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
/**
 * Cloud-steed rider (F3 GPU QA: the captured surf crouch alone held one arms-out pose for seconds): lean into lane
 * changes (torso and hips roll toward the turn, the outer arm lifts), a slow balancing sway, arm counter-swing and a
 * knee bob that follows the cloud's own billow. `t` is the rider's clock.
 */
export function riderOverlay(input: HumanoidPoseInput, t: number, laneVelocity: number): HumanoidPoseInput {
  const lean = Math.max(-0.32, Math.min(0.32, -laneVelocity * 0.055));
  const sway = 0.09 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 3.3 + 1.1);
  const r = { ...input.rotations };
  const pre = (role: HumanoidRole, q: Quat) => { r[role] = quatMul(q, r[role] ?? [0, 0, 0, 1]); };
  pre("hips", qz(lean * 0.45 + sway * 0.5));
  pre("chest", qz(lean * 0.55 + sway * 0.6));
  pre("spine", qx(0.05 * Math.sin(t * 2.3 + 0.4)));
  pre("head", qz(-(lean + sway) * 0.6)); // the head stays level
  pre("leftUpperArm", qz(0.22 * Math.sin(t * 1.3) - Math.max(0, lean) * 0.8));
  pre("rightUpperArm", qz(0.22 * Math.sin(t * 1.3 + 2.2) - Math.min(0, lean) * 0.8));
  pre("leftLowerArm", qx(-0.15 * (1 + Math.sin(t * 1.7))));
  pre("rightLowerArm", qx(-0.15 * (1 + Math.sin(t * 1.7 + 1.3))));
  const off = input.hipsOffset ?? [0, 0, 0];
  return { ...input, rotations: r, hipsOffset: [off[0] + lean * 0.06, off[1] + 0.03 * Math.sin(t * 3.1) - 0.02, off[2]] };
}

export interface HeroMotion {
  /** Source playing ("Run", "Jump", ..., or "pose:<clip>" for a code pose). */
  readonly current: string;
  frame(f: HeroMotionFrame): { readonly input: HumanoidPoseInput; readonly pose: HumanoidAnimationPose };
}

const LEG_ROLES: readonly HumanoidRole[] = ["hips", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];

export function heroMotionRequest(f: HeroMotionFrame, stride: ReturnType<typeof runStride>): MotionRequest<MotionClipName> {
  switch (f.clip) {
    case "run": {
      const ph = ((f.gaitPhase % 1) + 1) % 1;
      return { clip: "Run", time: stride.touchdownL + ph * stride.stride, loop: true, fade: 0.15 };
    }
    case "jump":
      if (f.falling) break;
      return { clip: "Jump", time: airTime(C.Jump, Math.max(0, f.jump), f.jumpVelocity, SIM_GRAVITY, Math.max(0, Number(C.Jump.meta?.lowTime ?? 0) + 0.1)), loop: false, fade: 0.1 };
    case "sit": return { clip: "Surf", rate: 1, loop: true, fade: 0.25 };
    case "block": return { clip: "Surf", rate: 0.6, loop: true, fade: 0.25 };
    case "attack": return { clip: "Strike", rate: 1.35, loop: false, fade: 0.08 };
    case "hit": return { clip: "Hit", rate: 1.2, loop: false, fade: 0.08 };
    case "idle": return { clip: "Idle", rate: 1, loop: true, fade: 0.3 };
    default: break;
  }
  return { pose: skyKidHumanoidPose(f.codePose), key: f.falling ? "fall" : f.clip, fade: 0.2 };
}

export function createHeroMotion(): HeroMotion {
  const b = heroBody();
  const stride = runStride(b);
  const anim = createMotionAnimator(C);
  let riderClock = 0;
  return {
    get current() { return anim.current; },
    frame(f) {
      let input = anim.update(f.dt, heroMotionRequest(f, stride));
      const w = f.clip === "run" ? gaitWeight(f.groundSpeed) : 0;
      if (w > 0) {
        // planted gait legs: the gait's hips height and lean, then each Idol ankle IK-solved onto the gait target
        const g = gaitTargets(f.groundSpeed, f.gaitPhase, b);
        const lean = gaitParams(f.groundSpeed).lean;
        const hipsQ = quatMul([Math.sin(lean / 2), 0, 0, Math.cos(lean / 2)], input.rotations.hips ?? [0, 0, 0, 1]);
        const restJointY = (b.hipJoint.left[1] + b.hipJoint.right[1]) / 2;
        const off = input.hipsOffset ?? [0, 0, 0];
        const planted: HumanoidPoseInput = {
          ...input,
          rotations: { ...input.rotations, hips: hipsQ },
          hipsOffset: [off[0], (g.hipJointY - restJointY) / b.driver.map.hipHeight, off[2]]
        };
        const legs = solveIdolLeg(solveIdolLeg(planted, "left", g.left, b), "right", g.right, b);
        const rot = { ...input.rotations };
        for (const role of LEG_ROLES) {
          const a = input.rotations[role], c = legs.rotations[role];
          if (c) rot[role] = a ? quatSlerp(a, c, w) : c;
        }
        const o2 = legs.hipsOffset ?? off;
        input = { ...input, rotations: rot, hipsOffset: [off[0] + (o2[0] - off[0]) * w, off[1] + (o2[1] - off[1]) * w, off[2] + (o2[2] - off[2]) * w] };
      }
      if (f.clip === "sit" || f.clip === "block") {
        riderClock += f.dt;
        input = riderOverlay(input, riderClock, f.laneVelocity ?? 0);
      }
      return { input, pose: b.driver.pose(input) };
    }
  };
}
