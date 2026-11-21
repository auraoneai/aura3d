/**
 * Idol athletes on text-to-motion clips (fal-ai/hunyuan-motion via tools/idol/motion.mjs -> motion.generated.ts, spec
 * tools/idol/motion-specs/aura-slam.json), played through the shared humanoid driver + motion animator
 * (apps/showcase-port-shared/idol/{humanoid,motion}.ts), with the game's racket solve kept as an IK overlay:
 *
 * - Ready stance, idle between points, split step, run / shuffle left / shuffle right / back-pedal (distance-locked to the
 *   sim's root travel), celebration after a point won.
 * - Forehand, backhand, forehand volley, backhand volley, overhead, serve: each clip's contact frame (fastest racket-hand
 *   frame; the highest reach for serve and overhead) is warped onto the sim's contact time (strokeContactAge, the serve's
 *   contactAt), and the right palm is IK-pinned to the procedural solve's grip (view/pose.ts -> solveAthletePose), so the
 *   racket meets the ball exactly when and where the sim strikes it.
 * Pure (no engine imports): unit tested offline.
 */
import type { PoseResult } from "../contract";
import {
  blendHumanoidPoses,
  createHumanoidAnimator,
  createHumanoidDriver,
  humanoidLocomotionTime,
  readIdolSkeleton,
  sampleHumanoidClip,
  type HumanoidAnimator,
  type HumanoidClip,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type Vec3
} from "@aura3d/engine/animation";
import { MOTION_CLIPS } from "./motion.generated";
import { IDOL_SKELETON_JSON } from "./idolBind.generated";

export type SlamClip = keyof typeof MOTION_CLIPS;
export const STROKE_CLIPS: Readonly<Record<string, SlamClip>> = {
  forehand: "Forehand", backhand: "Backhand", "forehand-volley": "Volley", "backhand-volley": "BackhandVolley", smash: "Overhead",
  "serve-windup": "Serve", toss: "Serve", serve: "Serve"
};
/** clips whose contact is the highest reach rather than the fastest swing */
const HIGH_CONTACT = new Set<SlamClip>(["Serve", "Overhead"]);
/** seconds the serve's follow-through lasts after contact (sim: player.serveMotion counts down from 0.42) */
const SERVE_FOLLOW = 0.42;
const SPLIT_STEP = 0.22;
const COURT_X = 5.5;
const COURT_Z = 8;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const drivers = new Map<string, HumanoidDriver | null>();
/** The shared humanoid driver for an athlete GLB (null when its skeleton cannot be mapped: the caller keeps the solve). */
export function athleteDriver(key: string): HumanoidDriver | null {
  if (!drivers.has(key)) {
    const json = IDOL_SKELETON_JSON[key];
    let d: HumanoidDriver | null = null;
    try { d = json ? createHumanoidDriver(readIdolSkeleton(json)) : null; } catch { d = null; }
    drivers.set(key, d);
  }
  return drivers.get(key)!;
}

const contacts = new WeakMap<HumanoidDriver, Map<string, number>>();
/** Clip time (s) of a stroke clip's contact on this body: the fastest right-palm frame, or the highest one for serve / overhead. */
export function clipContactTime(driver: HumanoidDriver, name: SlamClip): number {
  let byClip = contacts.get(driver);
  if (!byClip) contacts.set(driver, (byClip = new Map()));
  const hit = byClip.get(name);
  if (hit !== undefined) return hit;
  const clip = MOTION_CLIPS[name] as HumanoidClip;
  let best = -Infinity, at = clip.duration / 2, prev: Vec3 | null = null;
  // the strike sits mid-clip: skip the first and last 20% (settling frames of the generated motion can be fast too)
  const f0 = Math.floor(clip.frameCount * 0.2), f1 = Math.ceil(clip.frameCount * 0.8);
  for (let f = f0; f < f1; f++) {
    const t = f / clip.fps;
    const p = driver.palmPoints(sampleHumanoidClip(clip, t, { loop: false })).right;
    const score = HIGH_CONTACT.has(name) ? p[1] : prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) : -Infinity;
    if (score > best) { best = score; at = t; }
    prev = p;
  }
  byClip.set(name, at);
  return at;
}

/** Piecewise-linear warp of a stroke clip: game progress `age` (s) with contact at `contactAge` -> clip time with the clip's contact frame landing exactly on it. */
export function warpStrokeTime(clipContact: number, clipEnd: number, age: number, contactAge: number, totalAge: number): number {
  if (age <= contactAge) return clipContact * clamp01(age / Math.max(1e-3, contactAge));
  return clipContact + (clipEnd - clipContact) * clamp01((age - contactAge) / Math.max(0.05, totalAge - contactAge));
}

export interface MotionActor {
  readonly side?: string;
  readonly x?: number;
  readonly y?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly moveBlend?: number;
  readonly splitStep?: number;
  readonly swing?: number;
  readonly swingAge?: number;
  readonly strokeContactAge?: number;
  readonly serveMotion?: number;
  readonly stats?: { readonly pointsWon?: number };
}

/** The serve's windup progress (0 at swing start, 1 at contact), as view/pose.ts computes it. */
export interface ServeClock {
  readonly phase?: string;
  readonly time?: number;
  readonly serveAttempt?: { readonly swingAt?: number | null; readonly contactAt?: number | null } | null;
}
export function serveWindupProgress(s: ServeClock | undefined): number {
  const a = s?.serveAttempt;
  if (!a || a.swingAt == null || a.contactAt == null) return 0;
  return clamp01(((s?.time ?? 0) - a.swingAt) / Math.max(0.001, a.contactAt - a.swingAt));
}

export interface AthleteMotionState {
  readonly animator: HumanoidAnimator<string>;
  distance: number;
  lastX: number | null;
  lastY: number | null;
  stillFor: number;
  cheerLeft: number;
  lastPointsWon: number | null;
  /** the request key played this frame ("Ready", "Run", "Forehand", ...) and its clip time */
  clip: string;
  clipTime: number;
  /** free-running clock (s) for the looping stance clips */
  clock: number;
}

export const createAthleteMotionState = (): AthleteMotionState => ({
  animator: createHumanoidAnimator(MOTION_CLIPS as Record<string, HumanoidClip>), distance: 0, lastX: null, lastY: null, stillFor: 0, cheerLeft: 0, lastPointsWon: null, clip: "", clipTime: 0, clock: 0
});

export interface MotionFrameInput {
  readonly actor: MotionActor;
  readonly pose: Pick<PoseResult, "mode">;
  readonly dt: number;
  /** the procedural solve's right palm in GLB model space (the racket grip): pinned during strokes and serves */
  readonly gripModel: Vec3;
  /** node scale of the GLB (world metres per model unit) */
  readonly k: number;
  readonly serve?: ServeClock;
}

export interface AthleteMotionFrame {
  readonly input: HumanoidPoseInput;
  readonly clip: string;
  readonly clipTime: number;
  readonly stroke: boolean;
}

/** Choose and time this frame's clip; returns the canonical pose (racket palm pinned during strokes). */
export function athleteMotionFrame(st: AthleteMotionState, driver: HumanoidDriver, f: MotionFrameInput): AthleteMotionFrame {
  const a = f.actor;
  const dt = Math.max(0, Math.min(0.1, f.dt));
  st.clock += dt;
  // root travel (world metres) for distance-locked locomotion
  const wx = (a.x ?? 0) * COURT_X, wz = (a.y ?? 0) * COURT_Z;
  if (st.lastX !== null && st.lastY !== null) st.distance += Math.min(1, Math.hypot(wx - st.lastX, wz - st.lastY));
  st.lastX = wx; st.lastY = wz;
  const won = a.stats?.pointsWon;
  if (typeof won === "number") {
    if (st.lastPointsWon !== null && won > st.lastPointsWon) st.cheerLeft = MOTION_CLIPS.Celebrate.duration;
    st.lastPointsWon = won;
  }
  st.cheerLeft = Math.max(0, st.cheerLeft - dt);
  const move = clamp01(a.moveBlend ?? 0);
  st.stillFor = move < 0.05 ? st.stillFor + dt : 0;

  const strokeClip = STROKE_CLIPS[f.pose.mode] ?? ((a.swing ?? 0) > 0 ? "Forehand" : undefined);
  let pose: HumanoidPoseInput;
  let key: string;
  let time = 0;
  if (strokeClip) {
    const clip = MOTION_CLIPS[strokeClip] as HumanoidClip;
    const c = clipContactTime(driver, strokeClip);
    if (strokeClip === "Serve") {
      const tossHold = c * 0.4;
      time = f.pose.mode === "toss" ? tossHold
        : f.pose.mode === "serve-windup" ? tossHold + (c - tossHold) * serveWindupProgress(f.serve)
        : c + (clip.duration - c) * clamp01(1 - (a.serveMotion ?? 0) / SERVE_FOLLOW);
    } else {
      const age = a.swingAge ?? 0;
      const contactAge = a.strokeContactAge || 0.17;
      time = warpStrokeTime(c, clip.duration, age, contactAge, age + (a.swing ?? 0));
    }
    key = strokeClip;
    // the racket grip stays the solve's: contact position and timing are exactly the sim's
    pose = { ...sampleHumanoidClip(clip, time, { loop: false }), handTargets: { right: f.gripModel } };
  } else {
    const face = a.side === "player" ? 1 : -1;
    const vx = (a.vx ?? 0) * COURT_X, vz = (a.vy ?? 0) * COURT_Z;
    const speed = Math.hypot(vx, vz);
    const dx = speed > 0.01 ? (vx / speed) * face : 0;
    const dz = speed > 0.01 ? (vz / speed) * face : -1;
    const loco: SlamClip = dz < -0.4 ? "Run" : dz > 0.4 ? "BackPedal" : dx > 0 ? "ShuffleRight" : "ShuffleLeft";
    const standing: SlamClip = st.cheerLeft > 0 ? "Celebrate" : (a.splitStep ?? 0) > 0 ? "SplitStep" : st.stillFor > 3 ? "Idle" : "Ready";
    const hipWorld = driver.map.hipHeight * f.k;
    const standClip = MOTION_CLIPS[standing] as HumanoidClip;
    const standTime = standing === "Celebrate" ? standClip.duration - st.cheerLeft
      : standing === "SplitStep" ? standClip.duration * (0.2 + 0.6 * clamp01(1 - (a.splitStep ?? 0) / SPLIT_STEP))
      : st.clock;
    const stand = sampleHumanoidClip(standClip, standTime, { loop: standing === "Ready" || standing === "Idle" });
    const w = clamp01((move - 0.05) * 1.6);
    if (w > 0) {
      const locoClip = MOTION_CLIPS[loco] as HumanoidClip;
      time = humanoidLocomotionTime(locoClip, st.distance, hipWorld);
      pose = blendHumanoidPoses(stand, sampleHumanoidClip(locoClip, time), w);
      key = w > 0.5 ? loco : standing;
    } else {
      pose = stand;
      time = standTime;
      key = standing;
    }
  }
  st.clip = key;
  st.clipTime = time;
  // the animator cross-fades between sources (0.12 s into a stroke so the contact frame is never blended away)
  const out = st.animator.update(dt, { pose, key, fade: strokeClip ? 0.12 : 0.2 });
  return { input: strokeClip ? { ...out, handTargets: { right: f.gripModel } } : out, clip: key, clipTime: time, stroke: Boolean(strokeClip) };
}
